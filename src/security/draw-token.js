import { formatIsoDate, parseIsoDate } from "../domain/date-draw.js";

const TOKEN_VERSION = 1;
const UUID_BYTE_LENGTH = 16;
const DATE_COUNT = 3;
const DATE_BYTE_LENGTH = 4;
const PAYLOAD_BYTE_LENGTH = 1 + UUID_BYTE_LENGTH + DATE_COUNT * DATE_BYTE_LENGTH;
const MILLISECONDS_PER_DAY = 86_400_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Generates a random draw identifier suitable for embedding in a signed token.
 *
 * @returns {string} RFC 4122 UUID string.
 * @throws {Error} If the runtime does not expose Web Crypto randomUUID.
 */
export function generateDrawId() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.randomUUID) {
    throw new Error("A Web Crypto compatible randomUUID implementation is required.");
  }
  return cryptoApi.randomUUID();
}

/**
 * Generates an extractable ECDSA P-256 key pair for the local admin tool.
 *
 * The private key must never be deployed with the public player application.
 *
 * @returns {Promise<CryptoKeyPair>} Signing key pair.
 */
export async function generateSigningKeyPair() {
  return requireSubtleCrypto().generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
}

/**
 * Exports an ECDSA public key as JWK for inclusion in the static player app.
 *
 * @param {CryptoKey} publicKey Public verification key.
 * @returns {Promise<JsonWebKey>} Exported public key.
 */
export async function exportPublicKeyJwk(publicKey) {
  return requireSubtleCrypto().exportKey("jwk", publicKey);
}

/**
 * Exports an ECDSA private key as JWK for local backup by the administrator.
 *
 * @param {CryptoKey} privateKey Private signing key.
 * @returns {Promise<JsonWebKey>} Exported private key.
 */
export async function exportPrivateKeyJwk(privateKey) {
  return requireSubtleCrypto().exportKey("jwk", privateKey);
}

/**
 * Imports a public ECDSA P-256 verification key from JWK.
 *
 * @param {JsonWebKey} jwk Public JWK.
 * @returns {Promise<CryptoKey>} Imported verification key.
 */
export async function importPublicKeyJwk(jwk) {
  return requireSubtleCrypto().importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

/**
 * Imports a private ECDSA P-256 signing key from JWK.
 *
 * @param {JsonWebKey} jwk Private JWK.
 * @returns {Promise<CryptoKey>} Imported signing key.
 */
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
 * Serializes one draw into the fixed binary protocol.
 *
 * Layout (29 bytes total):
 * - 1 byte protocol version
 * - 16 bytes draw UUID
 * - 3 x 4-byte unsigned day numbers since 1970-01-01 UTC
 *
 * The UTC day number is used only as a stable encoding of a calendar date.
 * Application semantics remain fixed to Europe/Berlin and contain no time-of-day.
 *
 * @param {{drawId: string, dates: string[]}} draw Draw data.
 * @returns {Uint8Array} Serialized payload.
 */
export function encodeDrawPayload({ drawId, dates }) {
  const uuidBytes = uuidToBytes(drawId);
  validateDates(dates);

  const payload = new Uint8Array(PAYLOAD_BYTE_LENGTH);
  const view = new DataView(payload.buffer);
  payload[0] = TOKEN_VERSION;
  payload.set(uuidBytes, 1);

  dates.forEach((date, index) => {
    const dayNumber = parseIsoDate(date) / MILLISECONDS_PER_DAY;
    view.setUint32(1 + UUID_BYTE_LENGTH + index * DATE_BYTE_LENGTH, dayNumber, false);
  });

  return payload;
}

/**
 * Deserializes and validates a fixed-format draw payload.
 *
 * @param {Uint8Array} payload Serialized payload.
 * @returns {{drawId: string, dates: string[]}} Decoded draw data.
 */
export function decodeDrawPayload(payload) {
  if (!(payload instanceof Uint8Array) || payload.byteLength !== PAYLOAD_BYTE_LENGTH) {
    throw new RangeError(`Draw payload must contain exactly ${PAYLOAD_BYTE_LENGTH} bytes.`);
  }
  if (payload[0] !== TOKEN_VERSION) {
    throw new RangeError(`Unsupported draw token version: ${payload[0]}.`);
  }

  const uuidBytes = payload.slice(1, 1 + UUID_BYTE_LENGTH);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const dates = Array.from({ length: DATE_COUNT }, (_, index) => {
    const dayNumber = view.getUint32(
      1 + UUID_BYTE_LENGTH + index * DATE_BYTE_LENGTH,
      false,
    );
    return formatIsoDate(dayNumber * MILLISECONDS_PER_DAY);
  });

  return {
    drawId: bytesToUuid(uuidBytes),
    dates,
  };
}

/**
 * Creates an authenticated URL-safe token from draw data.
 *
 * @param {{drawId: string, dates: string[]}} draw Draw data.
 * @param {CryptoKey} privateKey ECDSA P-256 private signing key.
 * @returns {Promise<string>} Token in `payload.signature` Base64URL form.
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
 * Verifies a signed token and returns its draw data only if authentic.
 *
 * @param {string} token Signed token in `payload.signature` form.
 * @param {CryptoKey} publicKey ECDSA P-256 public verification key.
 * @returns {Promise<{drawId: string, dates: string[]}>} Verified draw data.
 * @throws {RangeError} If the token is malformed or the signature is invalid.
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

/**
 * Converts binary data into unpadded Base64URL text.
 *
 * @param {Uint8Array} bytes Binary input.
 * @returns {string} Base64URL text.
 */
export function bytesToBase64Url(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Base64URL input must be a Uint8Array.");
  }

  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/**
 * Decodes unpadded Base64URL text into bytes.
 *
 * @param {string} value Base64URL text.
 * @returns {Uint8Array} Decoded bytes.
 */
export function base64UrlToBytes(value) {
  if (typeof value !== "string" || value.length === 0 || !BASE64URL_PATTERN.test(value)) {
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

/**
 * Splits and decodes the two token components.
 *
 * @param {string} token Encoded token.
 * @returns {{payload: Uint8Array, signature: Uint8Array}} Decoded components.
 */
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

/**
 * Validates the fixed set of three calendar dates.
 *
 * @param {unknown} dates Candidate dates.
 * @returns {void}
 */
function validateDates(dates) {
  if (!Array.isArray(dates) || dates.length !== DATE_COUNT) {
    throw new RangeError(`A draw must contain exactly ${DATE_COUNT} dates.`);
  }

  dates.forEach((date) => parseIsoDate(date));
}

/**
 * Converts a canonical UUID into its 16 binary bytes.
 *
 * @param {string} uuid UUID text.
 * @returns {Uint8Array} UUID bytes.
 */
function uuidToBytes(uuid) {
  if (typeof uuid !== "string" || !UUID_PATTERN.test(uuid)) {
    throw new RangeError("drawId must be a canonical RFC 4122 UUID.");
  }

  const hex = uuid.replaceAll("-", "");
  return Uint8Array.from({ length: UUID_BYTE_LENGTH }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

/**
 * Formats 16 UUID bytes as canonical UUID text.
 *
 * @param {Uint8Array} bytes UUID bytes.
 * @returns {string} Canonical UUID.
 */
function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Returns SubtleCrypto or fails explicitly on unsupported runtimes.
 *
 * @returns {SubtleCrypto} Web Crypto SubtleCrypto implementation.
 */
function requireSubtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("A Web Crypto compatible SubtleCrypto implementation is required.");
  }
  return subtle;
}
