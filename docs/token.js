const PAYLOAD_BYTE_LENGTH = 29;
const TOKEN_VERSION = 1;
const UUID_BYTE_LENGTH = 16;
const DATE_COUNT = 3;
const DATE_BYTE_LENGTH = 4;
const MILLISECONDS_PER_DAY = 86_400_000;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function importVerificationKey(jwk) {
  if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256") {
    throw new RangeError("Der öffentliche Verifikationsschlüssel ist ungültig.");
  }

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

export async function verifyDrawToken(token, publicKey) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 2) {
    throw new RangeError("Der persönliche Link enthält keinen gültigen Spielcode.");
  }

  const payload = base64UrlToBytes(parts[0]);
  const signature = base64UrlToBytes(parts[1]);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    payload,
  );

  if (!valid) {
    throw new RangeError("Die Signatur des persönlichen Links ist ungültig.");
  }

  return decodePayload(payload);
}

function decodePayload(payload) {
  if (payload.byteLength !== PAYLOAD_BYTE_LENGTH) {
    throw new RangeError("Der Spielcode hat eine ungültige Länge.");
  }
  if (payload[0] !== TOKEN_VERSION) {
    throw new RangeError(`Nicht unterstützte Spielcode-Version: ${payload[0]}.`);
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const uuidBytes = payload.slice(1, 1 + UUID_BYTE_LENGTH);
  const dates = Array.from({ length: DATE_COUNT }, (_, index) => {
    const dayNumber = view.getUint32(
      1 + UUID_BYTE_LENGTH + index * DATE_BYTE_LENGTH,
      false,
    );
    return new Date(dayNumber * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
  });

  return { drawId: bytesToUuid(uuidBytes), dates };
}

function base64UrlToBytes(value) {
  if (!value || !BASE64URL_PATTERN.test(value)) {
    throw new RangeError("Der Spielcode enthält ungültige Zeichen.");
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch (error) {
    throw new RangeError("Der Spielcode ist nicht lesbar.", { cause: error });
  }
}

function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
