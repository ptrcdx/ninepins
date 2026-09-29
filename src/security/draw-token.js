import { formatIsoDate, parseIsoDate } from "../domain/date-draw.js";

const LEGACY_TOKEN_VERSION = 1;
const THREE_DATE_TOKEN_VERSION = 2;
const TOKEN_VERSION = 3;
const UUID_BYTE_LENGTH = 16;
const CURRENT_DATE_COUNT = 2;
const LEGACY_DATE_COUNT = 3;
const DATE_BYTE_LENGTH = 4;
const PLAYER_NAME_LENGTH_BYTE_LENGTH = 1;
const MAX_PLAYER_NAME_BYTES = 255;
const MAX_PLAYER_NAME_CHARACTERS = 80;
const MILLISECONDS_PER_DAY = 86_400_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const PLAYER_NAME_PROVIDER_KEY = Symbol.for(
  "pumperella.signing.playerNameProvider",
);

/** @returns {string} RFC 4122 UUID string. */
export function generateDrawId() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.randomUUID) {
    throw new Error("A Web Crypto compatible randomUUID implementation is required.");
  }
  return cryptoApi.randomUUID();
}

/** @returns {Promise<CryptoKeyPair>} Extractable ECDSA P-256 signing key pair. */
export async function generateSigningKeyPair() {
  return requireSubtleCrypto().generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
}

/** @param {CryptoKey} publicKey @returns {Promise<JsonWebKey>} */
export async function exportPublicKeyJwk(publicKey) {
  return requireSubtleCrypto().exportKey("jwk", publicKey);
}

/** @param {CryptoKey} privateKey @returns {Promise<JsonWebKey>} */
export async function exportPrivateKeyJwk(privateKey) {
  return requireSubtleCrypto().exportKey("jwk", privateKey);
}

/** @param {JsonWebKey} jwk @returns {Promise<CryptoKey>} */
export async function importPublicKeyJwk(jwk) {
  return requireSubtleCrypto().importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

/** @param {JsonWebKey} jwk @returns {Promise<CryptoKey>} */
export async function importPrivateKeyJwk(jwk) {
  return requireSubtleCrypto().importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * Serializes one signed player assignment.
 *
 * Version 3 layout:
 * - 1 byte protocol version
 * - 16 bytes draw UUID
 * - 2 x 4-byte unsigned UTC day numbers
 * - 1 byte UTF-8 player-name byte length
 * - player-name bytes
 *
 * Versions 1 and 2 used three dates and remain decodable for compatibility.
 *
 * @param {{drawId:string,dates:string[],playerName?:string}} draw Draw data.
 * @returns {Uint8Array} Serialized payload.
 */
export function encodeDrawPayload(draw) {
  if (!draw || typeof draw !== "object") {
    throw new TypeError("Draw data must be an object.");
  }

  const { drawId, dates } = draw;
  const uuidBytes = uuidToBytes(drawId);
  validateDates(dates, CURRENT_DATE_COUNT);
  const normalizedPlayerName = resolvePlayerName(draw);
  const playerNameBytes = TEXT_ENCODER.encode(normalizedPlayerName);

  if (playerNameBytes.byteLength > MAX_PLAYER_NAME_BYTES) {
    throw new RangeError(
      `Player name must use at most ${MAX_PLAYER_NAME_BYTES} UTF-8 bytes.`,
    );
  }

  const basePayloadByteLength = getBasePayloadByteLength(CURRENT_DATE_COUNT);
  const payload = new Uint8Array(
    basePayloadByteLength +
      PLAYER_NAME_LENGTH_BYTE_LENGTH +
      playerNameBytes.byteLength,
  );
  const view = new DataView(payload.buffer);
  payload[0] = TOKEN_VERSION;
  payload.set(uuidBytes, 1);

  dates.forEach((date, index) => {
    const dayNumber = parseIsoDate(date) / MILLISECONDS_PER_DAY;
    view.setUint32(
      1 + UUID_BYTE_LENGTH + index * DATE_BYTE_LENGTH,
      dayNumber,
      false,
    );
  });

  payload[basePayloadByteLength] = playerNameBytes.byteLength;
  payload.set(
    playerNameBytes,
    basePayloadByteLength + PLAYER_NAME_LENGTH_BYTE_LENGTH,
  );
  return payload;
}

/**
 * Decodes current version-3 payloads and legacy version-1/version-2 links.
 *
 * @param {Uint8Array} payload Serialized payload.
 * @returns {{drawId:string,dates:string[],playerName:string|null}} Decoded draw.
 */
export function decodeDrawPayload(payload) {
  if (!(payload instanceof Uint8Array) || payload.byteLength < 1) {
    throw new RangeError("Draw payload is too short.");
  }

  const version = payload[0];
  if (version === LEGACY_TOKEN_VERSION) {
    const legacyBaseLength = getBasePayloadByteLength(LEGACY_DATE_COUNT);
    if (payload.byteLength !== legacyBaseLength) {
      throw new RangeError(
        `Legacy draw payload must contain exactly ${legacyBaseLength} bytes.`,
      );
    }
    return decodeBasePayload(payload, null, LEGACY_DATE_COUNT);
  }

  if (version === THREE_DATE_TOKEN_VERSION) {
    return decodeNamedPayload(payload, LEGACY_DATE_COUNT);
  }

  if (version === TOKEN_VERSION) {
    return decodeNamedPayload(payload, CURRENT_DATE_COUNT);
  }

  throw new RangeError(`Unsupported draw token version: ${version}.`);
}

/**
 * Creates an authenticated URL-safe token.
 *
 * @param {{drawId:string,dates:string[],playerName?:string}} draw Draw data.
 * @param {CryptoKey} privateKey ECDSA P-256 private key.
 * @returns {Promise<string>} Signed token.
 */
export async function createSignedDrawToken(draw, privateKey) {
  const payload = encodeDrawPayload(draw);
  const signature = new Uint8Array(
    await requireSubtleCrypto().sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      payload,
    ),
  );
  return `${bytesToBase64Url(payload)}.${bytesToBase64Url(signature)}`;
}

/**
 * Verifies and decodes an authenticated token.
 *
 * @param {string} token Signed token.
 * @param {CryptoKey} publicKey Public verification key.
 * @returns {Promise<{drawId:string,dates:string[],playerName:string|null}>}
 */
export async function verifySignedDrawToken(token, publicKey) {
  const { payload, signature } = splitToken(token);
  const isValid = await requireSubtleCrypto().verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    payload,
  );
  if (!isValid) {
    throw new RangeError("Draw token signature is invalid.");
  }
  return decodeDrawPayload(payload);
}

/** @param {string} value @returns {string} */
export function normalizePlayerName(value) {
  if (typeof value !== "string") {
    throw new TypeError("Player name must be a string.");
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    throw new RangeError("Player name must not be empty.");
  }
  if ([...normalized].length > MAX_PLAYER_NAME_CHARACTERS) {
    throw new RangeError(
      `Player name must contain at most ${MAX_PLAYER_NAME_CHARACTERS} characters.`,
    );
  }
  return normalized;
}

/** @param {Uint8Array} bytes @returns {string} */
export function bytesToBase64Url(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Base64URL input must be a Uint8Array.");
  }
  const binary = String.fromCharCode(...bytes);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

/** @param {string} value @returns {Uint8Array} */
export function base64UrlToBytes(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw new RangeError("Invalid Base64URL value.");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const paddingLength = (4 - (base64.length % 4)) % 4;
  try {
    const binary = atob(base64 + "=".repeat(paddingLength));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (error) {
    throw new RangeError("Invalid Base64URL value.", { cause: error });
  }
}

/** @param {{drawId:string,dates:string[],playerName?:string}} draw */
function resolvePlayerName(draw) {
  if (typeof draw.playerName === "string") {
    return normalizePlayerName(draw.playerName);
  }

  const provider = globalThis[PLAYER_NAME_PROVIDER_KEY];
  if (typeof provider === "function") {
    return normalizePlayerName(provider({
      drawId: draw.drawId,
      dates: draw.dates,
    }));
  }

  return normalizePlayerName(draw.playerName);
}

/** @param {Uint8Array} payload @param {number} dateCount */
function decodeNamedPayload(payload, dateCount) {
  const basePayloadByteLength = getBasePayloadByteLength(dateCount);
  if (payload.byteLength < basePayloadByteLength + PLAYER_NAME_LENGTH_BYTE_LENGTH) {
    throw new RangeError("Draw payload is too short.");
  }

  const playerNameLength = payload[basePayloadByteLength];
  if (playerNameLength === 0) {
    throw new RangeError("Draw payload must contain a player name.");
  }

  const expectedLength =
    basePayloadByteLength +
    PLAYER_NAME_LENGTH_BYTE_LENGTH +
    playerNameLength;
  if (payload.byteLength !== expectedLength) {
    throw new RangeError(
      "Draw payload length does not match its player-name length.",
    );
  }

  let decodedPlayerName;
  try {
    decodedPlayerName = TEXT_DECODER.decode(
      payload.slice(basePayloadByteLength + PLAYER_NAME_LENGTH_BYTE_LENGTH),
    );
  } catch (error) {
    throw new RangeError(
      "Draw payload contains an invalid UTF-8 player name.",
      { cause: error },
    );
  }

  const playerName = normalizePlayerName(decodedPlayerName);
  if (playerName !== decodedPlayerName) {
    throw new RangeError("Draw payload contains a non-canonical player name.");
  }
  return decodeBasePayload(payload, playerName, dateCount);
}

/** @param {Uint8Array} payload @param {string|null} playerName @param {number} dateCount */
function decodeBasePayload(payload, playerName, dateCount) {
  const uuidBytes = payload.slice(1, 1 + UUID_BYTE_LENGTH);
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const dates = Array.from({ length: dateCount }, (_, index) => {
    const dayNumber = view.getUint32(
      1 + UUID_BYTE_LENGTH + index * DATE_BYTE_LENGTH,
      false,
    );
    return formatIsoDate(dayNumber * MILLISECONDS_PER_DAY);
  });
  return { drawId: bytesToUuid(uuidBytes), dates, playerName };
}

/** @param {number} dateCount */
function getBasePayloadByteLength(dateCount) {
  return 1 + UUID_BYTE_LENGTH + dateCount * DATE_BYTE_LENGTH;
}

/** @param {string} token */
function splitToken(token) {
  if (typeof token !== "string") {
    throw new TypeError("Draw token must be a string.");
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new RangeError("Draw token must contain exactly one separator.");
  }
  return {
    payload: base64UrlToBytes(parts[0]),
    signature: base64UrlToBytes(parts[1]),
  };
}

/** @param {unknown} dates @param {number} expectedCount */
function validateDates(dates, expectedCount) {
  if (!Array.isArray(dates) || dates.length !== expectedCount) {
    throw new RangeError(`A draw must contain exactly ${expectedCount} dates.`);
  }
  dates.forEach((date) => parseIsoDate(date));
}

/** @param {string} uuid */
function uuidToBytes(uuid) {
  if (typeof uuid !== "string" || !UUID_PATTERN.test(uuid)) {
    throw new RangeError("drawId must be a canonical RFC 4122 UUID.");
  }
  const hex = uuid.replaceAll("-", "");
  return Uint8Array.from({ length: UUID_BYTE_LENGTH }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

/** @param {Uint8Array} bytes */
function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requireSubtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "A Web Crypto compatible SubtleCrypto implementation is required.",
    );
  }
  return subtle;
}
