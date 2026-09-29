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
  dates: Object.freeze(["2026-10-25", "2026-12-24", "2027-01-01"]),
  playerName: "Claudia Beispiel",
});

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

function createLegacyPayload() {
  const current = encodeDrawPayload(DRAW);
  const legacy = current.slice(0, 29);
  legacy[0] = 1;
  return legacy;
}

describe("draw payload", () => {
  it("round-trips the player name and three dates in token version 2", () => {
    const payload = encodeDrawPayload(DRAW);

    expect(payload[0]).toBe(2);
    expect(decodeDrawPayload(payload)).toEqual(DRAW);
  });

  it("normalizes the player name before encoding", () => {
    const payload = encodeDrawPayload({
      ...DRAW,
      playerName: "  Claudia   Beispiel  ",
    });

    expect(decodeDrawPayload(payload).playerName).toBe("Claudia Beispiel");
  });

  it("keeps legacy version-1 links readable without inventing a name", () => {
    expect(decodeDrawPayload(createLegacyPayload())).toEqual({
      drawId: DRAW.drawId,
      dates: DRAW.dates,
      playerName: null,
    });
  });

  it("rejects draws that do not contain exactly three dates", () => {
    expect(() =>
      encodeDrawPayload({
        drawId: DRAW.drawId,
        dates: ["2026-10-25", "2026-12-24"],
        playerName: DRAW.playerName,
      }),
    ).toThrow("A draw must contain exactly 3 dates.");
  });

  it("rejects a missing player name for newly generated tokens", () => {
    expect(() =>
      encodeDrawPayload({
        drawId: DRAW.drawId,
        dates: [...DRAW.dates],
      }),
    ).toThrow("Player name must be a string.");
  });
});

describe("Base64URL codec", () => {
  it("round-trips binary data without padding characters", () => {
    const input = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = bytesToBase64Url(input);

    expect(encoded).not.toMatch(/[+/=]/u);
    expect(base64UrlToBytes(encoded)).toEqual(input);
  });

  it("rejects non-Base64URL text", () => {
    expect(() => base64UrlToBytes("not valid!"))
      .toThrow("Invalid Base64URL value.");
  });
});

describe("signed draw token", () => {
  it("verifies an authentic token including player identity", async () => {
    const keyPair = await generateSigningKeyPair();
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);

    await expect(verifySignedDrawToken(token, keyPair.publicKey))
      .resolves.toEqual(DRAW);
  });

  it("rejects a player name modified after signing", async () => {
    const keyPair = await generateSigningKeyPair();
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);

    await expect(
      verifySignedDrawToken(tamperPayload(token), keyPair.publicKey),
    ).rejects.toThrow("Draw token signature is invalid.");
  });

  it("rejects a token whose signature was modified", async () => {
    const keyPair = await generateSigningKeyPair();
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);

    await expect(
      verifySignedDrawToken(tamperSignature(token), keyPair.publicKey),
    ).rejects.toThrow("Draw token signature is invalid.");
  });

  it("keeps exported keys interoperable after import", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const privateJwk = await exportPrivateKeyJwk(keyPair.privateKey);
    const importedPublicKey = await importPublicKeyJwk(publicJwk);
    const importedPrivateKey = await importPrivateKeyJwk(privateJwk);
    const token = await createSignedDrawToken(DRAW, importedPrivateKey);

    await expect(verifySignedDrawToken(token, importedPublicKey))
      .resolves.toEqual(DRAW);
  });
});
