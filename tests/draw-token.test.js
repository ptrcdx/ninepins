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
});

/**
 * Flips the lowest bit of the first decoded token byte and returns a new token.
 *
 * @param {string} token Signed token.
 * @returns {string} Tampered token.
 */
function tamperPayload(token) {
  const [payloadText, signatureText] = token.split(".");
  const payload = base64UrlToBytes(payloadText);
  payload[0] ^= 1;
  return `${bytesToBase64Url(payload)}.${signatureText}`;
}

/**
 * Flips the lowest bit of the first signature byte and returns a new token.
 *
 * @param {string} token Signed token.
 * @returns {string} Tampered token.
 */
function tamperSignature(token) {
  const [payloadText, signatureText] = token.split(".");
  const signature = base64UrlToBytes(signatureText);
  signature[0] ^= 1;
  return `${payloadText}.${bytesToBase64Url(signature)}`;
}

describe("draw payload", () => {
  it("round-trips exactly three calendar dates without time-zone conversion", () => {
    const payload = encodeDrawPayload(DRAW);

    expect(payload).toHaveLength(29);
    expect(decodeDrawPayload(payload)).toEqual(DRAW);
  });

  it("rejects invalid payload sizes", () => {
    expect(() => decodeDrawPayload(new Uint8Array(28))).toThrow(
      "Draw payload must contain exactly 29 bytes.",
    );
  });

  it("rejects draws that do not contain exactly three dates", () => {
    expect(() =>
      encodeDrawPayload({
        drawId: DRAW.drawId,
        dates: ["2026-10-25", "2026-12-24"],
      }),
    ).toThrow("A draw must contain exactly 3 dates.");
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
  it("verifies an authentic token and returns the original draw", async () => {
    const keyPair = await generateSigningKeyPair();
    const token = await createSignedDrawToken(DRAW, keyPair.privateKey);

    await expect(verifySignedDrawToken(token, keyPair.publicKey)).resolves.toEqual(DRAW);
  });

  it("rejects a token whose payload was modified after signing", async () => {
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

  it("rejects a token signed with another private key", async () => {
    const legitimateKeyPair = await generateSigningKeyPair();
    const attackerKeyPair = await generateSigningKeyPair();
    const forgedToken = await createSignedDrawToken(DRAW, attackerKeyPair.privateKey);

    await expect(
      verifySignedDrawToken(forgedToken, legitimateKeyPair.publicKey),
    ).rejects.toThrow("Draw token signature is invalid.");
  });

  it("keeps exported public and private keys interoperable after import", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const privateJwk = await exportPrivateKeyJwk(keyPair.privateKey);
    const importedPublicKey = await importPublicKeyJwk(publicJwk);
    const importedPrivateKey = await importPrivateKeyJwk(privateJwk);
    const token = await createSignedDrawToken(DRAW, importedPrivateKey);

    await expect(verifySignedDrawToken(token, importedPublicKey)).resolves.toEqual(DRAW);
  });

  it("rejects malformed token structure", async () => {
    const keyPair = await generateSigningKeyPair();

    await expect(
      verifySignedDrawToken("one.two.three", keyPair.publicKey),
    ).rejects.toThrow("Draw token must contain exactly one separator.");
  });
});
