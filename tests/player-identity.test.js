import { describe, expect, it } from "vitest";

import { buildNamedPlayerLink } from "../admin/player-link-names.js";
import {
  findArchivedPlayerName,
  resolvePlayerDisplayName,
} from "../docs/player-experience.js";

/**
 * Creates a minimal in-memory Storage-compatible adapter.
 *
 * @param {Record<string, string>} [initialValues] Initial entries.
 * @returns {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void}}
 */
function createMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

describe("buildNamedPlayerLink", () => {
  it("adds the encoded player name before the signed fragment", () => {
    const link = buildNamedPlayerLink(
      "https://ptrcdx.github.io/ninepins/#payload.signature",
      "Claudia Beispiel",
    );

    const url = new URL(link);
    expect(url.searchParams.get("player")).toBe("Claudia Beispiel");
    expect(url.hash).toBe("#payload.signature");
  });

  it("preserves existing query parameters", () => {
    const link = buildNamedPlayerLink(
      "https://ptrcdx.github.io/ninepins/?source=admin#payload.signature",
      "Anna & Ben",
    );

    const url = new URL(link);
    expect(url.searchParams.get("source")).toBe("admin");
    expect(url.searchParams.get("player")).toBe("Anna & Ben");
  });
});

describe("resolvePlayerDisplayName", () => {
  it("prefers the personal link name", () => {
    expect(
      resolvePlayerDisplayName(
        { displayName: "Session Name" },
        "https://ptrcdx.github.io/ninepins/?player=Claudia%20Beispiel#token",
      ),
    ).toBe("Claudia Beispiel");
  });

  it("falls back to a session display name", () => {
    expect(
      resolvePlayerDisplayName(
        { player: { displayName: "Carla K." } },
        "https://ptrcdx.github.io/ninepins/#token",
      ),
    ).toBe("Carla K.");
  });

  it("recovers names for older links from the local admin archive", () => {
    const storage = createMemoryStorage({
      "ninepins.drawArchive.v1": JSON.stringify({
        schemaVersion: 1,
        draws: [
          {
            assignments: [
              {
                drawId: "a4499ca4-0c37-4ddd-b1c9-1a414853465f",
                player: "Claudia Beispiel",
              },
            ],
          },
        ],
      }),
    });

    expect(
      resolvePlayerDisplayName(
        { drawId: "a4499ca4-0c37-4ddd-b1c9-1a414853465f" },
        "https://ptrcdx.github.io/ninepins/#token",
        storage,
      ),
    ).toBe("Claudia Beispiel");
  });

  it("uses an explicit unavailable label when no name exists", () => {
    expect(
      resolvePlayerDisplayName({}, "https://ptrcdx.github.io/ninepins/#token"),
    ).toBe("Name nicht verfügbar");
  });
});

describe("findArchivedPlayerName", () => {
  it("ignores malformed archive state", () => {
    const storage = createMemoryStorage({
      "ninepins.drawArchive.v1": "not-json",
    });

    expect(findArchivedPlayerName("draw-id", storage)).toBeNull();
  });
});
