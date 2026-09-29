import { describe, expect, it, vi } from "vitest";

import {
  base64UrlToBytes,
  bytesToBase64Url,
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
  dates: Object.freeze(["2026-10-25", "2027-01-08"]),
  playerName: "Claudia Beispiel",
});
const LEGACY_DATES = Object.freeze([
  "2026-10-25",
  "2027-01-08",
  "2027-06-19",
]);

function uuidToBytes(uuid) {
  const hex = uuid.replaceAll("-", "");
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

function createVersion2Payload() {
  const nameBytes = new TextEncoder().encode(DRAW.playerName);
  const baseLength = 1 + 16 + 3 * 4;
  const payload = new Uint8Array(baseLength + 1 + nameBytes.length);
  const view = new DataView(payload.buffer);
  payload[0] = 2;
  payload.set(uuidToBytes(DRAW.drawId), 1);
  LEGACY_DATES.forEach((date, index) => {
    view.setUint32(
      1 + 16 + index * 4,
      Date.parse(`${date}T00:00:00.000Z`) / 86_400_000,
      false,
    );
  });
  payload[baseLength] = nameBytes.length;
  payload.set(nameBytes, baseLength + 1);
  return payload;
}

async function signPayload(payload, privateKey) {
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      payload,
    ),
  );
  return `${bytesToBase64Url(payload)}.${bytesToBase64Url(signature)}`;
}

describe("player token integration", () => {
  it("verifies a version-3 two-date token produced by the admin protocol", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);
    const publicKey = await importVerificationKey(publicJwk);

    await expect(verifyDrawToken(token, publicKey)).resolves.toEqual(DRAW);
  });

  it("continues to verify signed version-2 three-date tokens", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const token = await signPayload(createVersion2Payload(), keyPair.privateKey);
    const publicKey = await importVerificationKey(publicJwk);

    await expect(verifyDrawToken(token, publicKey)).resolves.toEqual({
      drawId: DRAW.drawId,
      dates: LEGACY_DATES,
      playerName: DRAW.playerName,
    });
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
    const [payloadText, signature] = token.split(".");
    const payload = base64UrlToBytes(payloadText);
    payload[payload.length - 1] ^= 1;
    const tamperedToken = `${bytesToBase64Url(payload)}.${signature}`;

    await expect(verifyDrawToken(tamperedToken, publicKey)).rejects.toThrow(
      "Die Signatur des persönlichen Links ist ungültig.",
    );
  });
});
