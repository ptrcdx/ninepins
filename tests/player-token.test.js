import { describe, expect, it } from "vitest";

import {
  createSignedDrawToken,
  exportPublicKeyJwk,
  generateSigningKeyPair,
} from "../src/security/draw-token.js";
import {
  importVerificationKey,
  verifyDrawToken,
} from "../docs/token.js";

describe("player token integration", () => {
  it("verifies a token produced by the admin signing protocol", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const draw = {
      drawId: "a4499ca4-0c37-4ddd-b1c9-1a414853465f",
      dates: ["2026-10-25", "2027-01-08", "2027-06-19"],
    };

    const token = await createSignedDrawToken(draw, keyPair.privateKey);
    const publicKey = await importVerificationKey(publicJwk);

    await expect(verifyDrawToken(token, publicKey)).resolves.toEqual(draw);
  });

  it("rejects a modified admin token in the player verifier", async () => {
    const keyPair = await generateSigningKeyPair();
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const token = await createSignedDrawToken(
      {
        drawId: "a4499ca4-0c37-4ddd-b1c9-1a414853465f",
        dates: ["2026-10-25", "2027-01-08", "2027-06-19"],
      },
      keyPair.privateKey,
    );
    const publicKey = await importVerificationKey(publicJwk);
    const [payload, signature] = token.split(".");
    const replacement = payload.endsWith("A") ? "B" : "A";
    const tamperedToken = `${payload.slice(0, -1)}${replacement}.${signature}`;

    await expect(verifyDrawToken(tamperedToken, publicKey)).rejects.toThrow(
      "Die Signatur des persönlichen Links ist ungültig.",
    );
  });
});
