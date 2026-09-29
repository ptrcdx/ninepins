import { describe, expect, it, vi } from "vitest";

import {
  createSignedDrawToken,
  exportPublicKeyJwk,
  generateSigningKeyPair,
} from "../src/security/draw-token.js";
import {
  importVerificationKey,
  verifyDrawToken,
} from "../docs/token.js";

const DRAW = Object.freeze({
  drawId: "a4499ca4-0c37-4ddd-b1c9-1a414853465f",
  dates: Object.freeze(["2026-10-25", "2027-01-08", "2027-06-19"]),
  playerName: "Claudia Beispiel",
});

describe("player token integration", () => {
  it("verifies a version-2 token produced by the admin protocol", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);
    const publicKey = await importVerificationKey(publicJwk);

    await expect(verifyDrawToken(token, publicKey)).resolves.toEqual(DRAW);
  });

  it("uses the injected safe fallback when SubtleCrypto is unavailable", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);
    const fallbackVerifier = vi.fn(async () => true);
    const publicKey = await importVerificationKey(publicJwk, {
      subtleCrypto: null,
    });

    await expect(
      verifyDrawToken(token, publicKey, {
        subtleCrypto: null,
        fallbackVerifier,
      }),
    ).resolves.toEqual(DRAW);
    expect(fallbackVerifier).toHaveBeenCalledOnce();
  });

  it("rejects a token when the fallback reports an invalid signature", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);
    const publicKey = await importVerificationKey(publicJwk, {
      subtleCrypto: null,
    });

    await expect(
      verifyDrawToken(token, publicKey, {
        subtleCrypto: null,
        fallbackVerifier: async () => false,
      }),
    ).rejects.toThrow("Die Signatur des persönlichen Links ist ungültig.");
  });

  it("rejects a modified admin token in the native verifier", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);
    const publicKey = await importVerificationKey(publicJwk);
    const [payload, signature] = token.split(".");
    const replacement = payload.endsWith("A") ? "B" : "A";
    const tamperedToken = `${payload.slice(0, -1)}${replacement}.${signature}`;

    await expect(verifyDrawToken(tamperedToken, publicKey)).rejects.toThrow(
      "Die Signatur des persönlichen Links ist ungültig.",
    );
  });
});
