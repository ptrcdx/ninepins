import { describe, expect, it } from "vitest";

import {
  base64UrlToBytes,
  bytesToBase64Url,
  createSignedDrawToken,
  decodeDrawPayload,
  encodeDrawPayload,
  exportPrivateKeyJwk,
  exportPublicKeyJwk,
  generateSigningKeyPair,
  importPrivateKeyJwk,
  importPublicKeyJwk,
  verifySignedDrawToken,
} from "../src/security/draw-token.js";

const DRAW = Object.freeze({
  drawId: "123e4567-e89b-42d3-a456-426614174000",
  dates: Object.freeze(["2026-10-25", "2026-12-24"]),
  playerName: "Claudia Beispiel",
});
const LEGACY_DATES = Object.freeze([
  "2026-10-25",
  "2026-12-24",
  "2027-01-01",
]);

function tamperPayload(token) {
  const [payloadText, signatureText] = token.split(".");
  const payload = base64UrlToBytes(payloadText);
  payload[payload.length - 1] ^= 1;
  return `${bytesToBase64Url(payload)}.${signatureText}`;
}

function tamperSignature(token) {
  const [payloadText, signatureText] = token.split(".");
  const signature = base64UrlToBytes(signatureText);
  signature[0] ^= 1;
  return `${payloadText}.${bytesToBase64Url(signature)}`;
}

function uuidToBytes(uuid) {
  const hex = uuid.replaceAll("-", "");
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

function createHistoricalPayload(version, playerName = null) {
  const nameBytes = playerName === null
    ? new Uint8Array()
    : new TextEncoder().encode(playerName);
  const baseLength = 1 + 16 + 3 * 4;
  const payload = new Uint8Array(
    baseLength + (version === 1 ? 0 : 1 + nameBytes.length),
  );
  const view = new DataView(payload.buffer);
  payload[0] = version;
  payload.set(uuidToBytes(DRAW.drawId), 1);
  LEGACY_DATES.forEach((date, index) => {
    view.setUint32(
      1 + 16 + index * 4,
      Date.parse(`${date}T00:00:00.000Z`) / 86_400_000,
      false,
    );
  });
  if (version !== 1) {
    payload[baseLength] = nameBytes.length;
    payload.set(nameBytes, baseLength + 1);
  }
  return payload;
}

describe("draw payload", () => {
  it("round-trips the player name and two dates in token version 3", () => {
    const payload = encodeDrawPayload(DRAW);
    expect(payload[0]).toBe(3);
    expect(decodeDrawPayload(payload)).toEqual(DRAW);
  });

  it("normalizes the player name before encoding", () => {
    const payload = encodeDrawPayload({
      ...DRAW,
      playerName: "  Claudia   Beispiel  ",
    });
    expect(decodeDrawPayload(payload).playerName).toBe("Claudia Beispiel");
  });

  it("keeps legacy version-1 three-date links readable without inventing a name", () => {
    expect(decodeDrawPayload(createHistoricalPayload(1))).toEqual({
      drawId: DRAW.drawId,
      dates: LEGACY_DATES,
      playerName: null,
    });
  });

  it("keeps version-2 three-date links readable with their signed name", () => {
    expect(decodeDrawPayload(createHistoricalPayload(2, DRAW.playerName))).toEqual({
      drawId: DRAW.drawId,
      dates: LEGACY_DATES,
      playerName: DRAW.playerName,
    });
  });

  it("rejects new draws that do not contain exactly two dates", () => {
    expect(() => encodeDrawPayload({
      drawId: DRAW.drawId,
      dates: [...LEGACY_DATES],
      playerName: DRAW.playerName,
    })).toThrow("A draw must contain exactly 2 dates.");
  });

  it("rejects a missing player name for newly generated tokens", () => {
    expect(() => encodeDrawPayload({
      drawId: DRAW.drawId,
      dates: [...DRAW.dates],
    })).toThrow("Player name must be a string.");
  });
});

describe("Base64URL codec", () => {
  it("round-trips binary data without padding characters", () => {
    const input = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = bytesToBase64Url(input);
    expect(encoded).not.toMatch(/[+/=]/u);
    expect(base64UrlToBytes(encoded)).toEqual(input);
  });
});

describe("signed draw token", () => {
  it("verifies an authentic token including player identity", async () => {
    const keyPair = await generateSigningKeyPair();
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);
    await expect(verifySignedDrawToken(token, keyPair.publicKey)).resolves.toEqual(DRAW);
  });

  it("rejects a payload modified after signing", async () => {
    const keyPair = await generateSigningKeyPair();
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);
    await expect(verifySignedDrawToken(tamperPayload(token), keyPair.publicKey))
      .rejects.toThrow("Draw token signature is invalid.");
  });

  it("rejects a token whose signature was modified", async () => {
    const keyPair = await generateSigningKeyPair();
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);
    await expect(verifySignedDrawToken(tamperSignature(token), keyPair.publicKey))
      .rejects.toThrow("Draw token signature is invalid.");
  });

  it("keeps exported keys interoperable after import", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const privateJwk = await exportPrivateKeyJwk(keyPair.privateKey);
    const importedPublicKey = await importPublicKeyJwk(publicJwk);
    const importedPrivateKey = await importPrivateKeyJwk(privateJwk);
    const token = await createSignedDrawToken(DRAW, importedPrivateKey);
    await expect(verifySignedDrawToken(token, importedPublicKey)).resolves.toEqual(DRAW);
  });
});
