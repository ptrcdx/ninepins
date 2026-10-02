import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIRECTORY, "..");
const DOCS_ROOT = resolve(REPOSITORY_ROOT, "docs");
const RUNTIME_EXTENSIONS = new Set([".html", ".js", ".css"]);

const REFERENCE_PATTERNS = Object.freeze([
  /\b(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/gu,
  /\bimport\(\s*["']([^"']+)["']\s*\)/gu,
  /\bfetch\(\s*["']([^"']+)["']/gu,
  /\bsrc\s*=\s*["']([^"']+)["']/gu,
  /\burl\(\s*["']?([^"')]+)["']?\s*\)/gu,
]);

const JSDOC_MODULE_TYPE_PATTERN =
  /\{(?:typeof\s+)?import\(\s*["'][^"']+["']\s*\)(?:\.[A-Za-z_$][\w$]*)?(?:\|null)?\}/gu;

/**
 * Recursively returns production text assets that can contain runtime resource
 * references.
 *
 * @param {string} directory Absolute directory to scan.
 * @returns {string[]} Absolute file paths.
 */
function collectRuntimeFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRuntimeFiles(path));
      continue;
    }
    if (RUNTIME_EXTENSIONS.has(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

/**
 * Extracts statically declared runtime resource references from one text file.
 *
 * @param {string} content File content.
 * @returns {string[]} Referenced URLs or relative paths.
 */
function extractRuntimeReferences(content) {
  const runtimeContent = removeJSDocModuleTypeReferences(content);
  const references = [];
  for (const pattern of REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(runtimeContent);
    while (match) {
      references.push(match[1]);
      match = pattern.exec(runtimeContent);
    }
  }
  return references;
}

/**
 * Removes JSDoc-only module type expressions before runtime dependency
 * extraction. These references are consumed by editors/type checkers and do
 * not cause a browser module request.
 *
 * @param {string} content File content.
 * @returns {string} Content with JSDoc module type expressions masked.
 */
function removeJSDocModuleTypeReferences(content) {
  return content.replace(JSDOC_MODULE_TYPE_PATTERN, "{}");
}

/**
 * Returns whether a resource reference is intentionally not a local file.
 *
 * @param {string} reference Runtime resource reference.
 * @returns {boolean} True for inline or fragment-only references.
 */
function isInlineReference(reference) {
  return reference.startsWith("data:") || reference.startsWith("#");
}

/**
 * Resolves a local runtime reference exactly as a same-directory browser
 * reference, while ignoring cache-busting query strings and URL fragments.
 *
 * @param {string} sourceFile File that contains the reference.
 * @param {string} reference Relative runtime resource reference.
 * @returns {string} Absolute target path.
 */
function resolveLocalReference(sourceFile, reference) {
  const cleanReference = reference.split(/[?#]/u, 1)[0];
  if (cleanReference.startsWith("/")) {
    throw new Error(
      `Absolute runtime path "${reference}" in ${relative(REPOSITORY_ROOT, sourceFile)} is unsafe for a project GitHub Pages deployment.`,
    );
  }
  return resolve(dirname(sourceFile), cleanReference);
}

/**
 * Formats a reference for actionable test failures.
 *
 * @param {string} sourceFile Source file.
 * @param {string} reference Referenced resource.
 * @returns {string} Human-readable reference.
 */
function formatReference(sourceFile, reference) {
  return `${relative(REPOSITORY_ROOT, sourceFile)} -> ${reference}`;
}

describe("GitHub Pages runtime dependency closure", () => {
  it("ignores JSDoc module types while keeping real dynamic imports", () => {
    const content = [
      '/** @param {typeof import("three")} three */',
      '/** @returns {import("three").Mesh|null} */',
      'const runtime = import("./runtime.js");',
    ].join("\n");

    expect(extractRuntimeReferences(content)).toEqual(["./runtime.js"]);
  });

  it("keeps every declared runtime dependency same-origin and present", () => {
    const missingReferences = [];
    const externalReferences = [];

    for (const sourceFile of collectRuntimeFiles(DOCS_ROOT)) {
      const content = readFileSync(sourceFile, "utf8");
      for (const reference of extractRuntimeReferences(content)) {
        if (isInlineReference(reference)) {
          continue;
        }
        if (/^https?:\/\//iu.test(reference)) {
          externalReferences.push(formatReference(sourceFile, reference));
          continue;
        }

        const target = resolveLocalReference(sourceFile, reference);
        if (!existsSync(target)) {
          missingReferences.push(formatReference(sourceFile, reference));
        }
      }
    }

    expect(externalReferences).toEqual([]);
    expect(missingReferences).toEqual([]);
  });

  it("ships the complete pinned Three.js r180 module pair", () => {
    const modulePath = resolve(DOCS_ROOT, "vendor/three/three.module.js");
    const corePath = resolve(DOCS_ROOT, "vendor/three/three.core.js");
    const moduleContent = readFileSync(modulePath, "utf8");
    const coreContent = readFileSync(corePath, "utf8");

    expect(moduleContent).toContain("from './three.core.js'");
    expect(coreContent).toContain("const REVISION = '180'");
  });

  it("does not contain the malformed persistence CSS escape sequence", () => {
    const indexContent = readFileSync(resolve(DOCS_ROOT, "index.html"), "utf8");
    expect(indexContent).not.toContain("\\n.persistence-choice");
  });
});
