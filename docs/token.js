const LEGACY_TOKEN_VERSION = 1;
const THREE_DATE_TOKEN_VERSION = 2;
const TOKEN_VERSION = 3;
const UUID_BYTE_LENGTH = 16;
const CURRENT_DATE_COUNT = 2;
const LEGACY_DATE_COUNT = 3;
const DATE_BYTE_LENGTH = 4;
const PLAYER_NAME_LENGTH_BYTE_LENGTH = 1;
const MILLISECONDS_PER_DAY = 86_400_000;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const VERIFICATION_KEY_TYPE = "PUMPERELLA_P256_JWK";
const COMPACT_P256_SIGNATURE_LENGTH = 64;
const NOBLE_P256_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/@noble/curves@2.3.0/nist.js/+esm";
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

let fallbackVerifierPromise = null;

/**
 * Imports a public key when native Web Crypto is usable and always retains the
 * validated JWK coordinates for the deterministic JavaScript fallback.
 *
 * @param {JsonWebKey} jwk Public P-256 JWK.
 * @param {{subtleCrypto?:SubtleCrypto|null}} [options] Dependency overrides.
 * @returns {Promise<{type:string,jwk:JsonWebKey,cryptoKey:CryptoKey|null}>}
 */
export async function importVerificationKey(jwk, options = {}) {
  const normalizedJwk = normalizePublicKeyJwk(jwk);
  const subtleCrypto = resolveSubtleCrypto(options);
  let cryptoKey = null;

  if (subtleCrypto && typeof subtleCrypto.importKey === "function") {
    try {
      cryptoKey = await subtleCrypto.importKey(
        "jwk",
        normalizedJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
    } catch {
      // Some embedded browsers expose an incomplete SubtleCrypto object. The
      // validated coordinates remain available for the audited fallback.
    }
  }

  return Object.freeze({
    type: VERIFICATION_KEY_TYPE,
    jwk: normalizedJwk,
    cryptoKey,
  });
}

/**
 * Verifies one signed player token and decodes its authenticated assignment.
 *
 * @param {string} token Signed token.
 * @param {{type:string,jwk:JsonWebKey,cryptoKey:CryptoKey|null}} verificationKey Prepared key.
 * @param {{subtleCrypto?:SubtleCrypto|null,fallbackVerifier?:(payload:Uint8Array,signature:Uint8Array,jwk:JsonWebKey)=>Promise<boolean>|boolean}} [options]
 * @returns {Promise<{drawId:string,dates:string[],playerName:string|null}>}
 */
export async function verifyDrawToken(token, verificationKey, options = {}) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 2) {
    throw new RangeError(
      "Der persönliche Link enthält keinen gültigen Spielcode.",
    );
  }
  if (!verificationKey || verificationKey.type !== VERIFICATION_KEY_TYPE) {
    throw new TypeError(
      "Der Verifikationsschlüssel wurde nicht korrekt vorbereitet.",
    );
  }

  const payload = base64UrlToBytes(parts[0]);
  const signature = base64UrlToBytes(parts[1]);
  const subtleCrypto = resolveSubtleCrypto(options);
  let nativeVerificationCompleted = false;
  let valid = false;

  if (
    subtleCrypto &&
    typeof subtleCrypto.verify === "function" &&
    verificationKey.cryptoKey
  ) {
    try {
      valid = await subtleCrypto.verify(
        { name: "ECDSA", hash: "SHA-256" },
        verificationKey.cryptoKey,
        signature,
        payload,
      );
      nativeVerificationCompleted = true;
    } catch {
      nativeVerificationCompleted = false;
    }
  }

  if (!nativeVerificationCompleted) {
    const fallbackVerifier =
      options.fallbackVerifier ?? await loadFallbackVerifier();
    valid = await fallbackVerifier(
      payload,
      signature,
      verificationKey.jwk,
    );
  }

  if (!valid) {
    throw new RangeError(
      "Die Signatur des persönlichen Links ist ungültig.",
    );
  }

  return decodePayload(payload);
}

/**
 * Decodes version-1, version-2 and version-3 payloads after signature validation.
 *
 * @param {Uint8Array} payload Authenticated payload.
 * @returns {{drawId:string,dates:string[],playerName:string|null}}
 */
export function decodeVerifiedDrawPayload(payload) {
  return decodePayload(payload);
}

/** @param {Uint8Array} payload */
function decodePayload(payload) {
  if (!(payload instanceof Uint8Array) || payload.byteLength < 1) {
    throw new RangeError("Der Spielcode ist zu kurz.");
  }

  const version = payload[0];
  if (version === LEGACY_TOKEN_VERSION) {
    const legacyBaseLength = getBasePayloadByteLength(LEGACY_DATE_COUNT);
    if (payload.byteLength !== legacyBaseLength) {
      throw new RangeError(
        "Der ältere Spielcode hat eine ungültige Länge.",
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

  throw new RangeError(
    `Nicht unterstützte Spielcode-Version: ${version}.`,
  );
}

/** @param {Uint8Array} payload @param {number} dateCount */
function decodeNamedPayload(payload, dateCount) {
  const basePayloadByteLength = getBasePayloadByteLength(dateCount);
  if (payload.byteLength < basePayloadByteLength + PLAYER_NAME_LENGTH_BYTE_LENGTH) {
    throw new RangeError("Der Spielcode ist zu kurz.");
  }

  const playerNameLength = payload[basePayloadByteLength];
  const expectedLength =
    basePayloadByteLength +
    PLAYER_NAME_LENGTH_BYTE_LENGTH +
    playerNameLength;
  if (playerNameLength === 0 || payload.byteLength !== expectedLength) {
    throw new RangeError(
      "Der Spielcode enthält keinen gültigen Spielernamen.",
    );
  }

  let playerName;
  try {
    playerName = TEXT_DECODER.decode(
      payload.slice(
        basePayloadByteLength + PLAYER_NAME_LENGTH_BYTE_LENGTH,
      ),
    );
  } catch (error) {
    throw new RangeError(
      "Der Spielcode enthält einen ungültigen Spielernamen.",
      { cause: error },
    );
  }

  const normalizedName = playerName.replace(/\s+/gu, " ").trim();
  if (!normalizedName || normalizedName !== playerName) {
    throw new RangeError(
      "Der Spielcode enthält einen ungültigen Spielernamen.",
    );
  }

  return decodeBasePayload(payload, playerName, dateCount);
}

/** @param {Uint8Array} payload @param {string|null} playerName @param {number} dateCount */
function decodeBasePayload(payload, playerName, dateCount) {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const uuidBytes = payload.slice(1, 1 + UUID_BYTE_LENGTH);
  const dates = Array.from({ length: dateCount }, (_, index) => {
    const dayNumber = view.getUint32(
      1 + UUID_BYTE_LENGTH + index * DATE_BYTE_LENGTH,
      false,
    );
    return new Date(dayNumber * MILLISECONDS_PER_DAY)
      .toISOString()
      .slice(0, 10);
  });

  return { drawId: bytesToUuid(uuidBytes), dates, playerName };
}

/** @param {number} dateCount */
function getBasePayloadByteLength(dateCount) {
  return 1 + UUID_BYTE_LENGTH + dateCount * DATE_BYTE_LENGTH;
}

/** @param {object} options @returns {SubtleCrypto|null} */
function resolveSubtleCrypto(options) {
  if (Object.prototype.hasOwnProperty.call(options, "subtleCrypto")) {
    return options.subtleCrypto;
  }
  return globalThis.crypto?.subtle ??
    globalThis.crypto?.webkitSubtle ??
    null;
}

/**
 * Loads the pinned audited P-256 implementation only when native Web Crypto is
 * unavailable or incomplete.
 *
 * @returns {Promise<(payload:Uint8Array,signature:Uint8Array,jwk:JsonWebKey)=>boolean>}
 */
async function loadFallbackVerifier() {
  if (!fallbackVerifierPromise) {
    fallbackVerifierPromise = import(NOBLE_P256_MODULE_URL)
      .then(({ p256 }) => {
        if (!p256?.verify) {
          throw new Error("P-256 fallback module is incomplete.");
        }

        return (payload, signature, jwk) => {
          const publicKey = jwkToUncompressedPublicKey(jwk);
          const format =
            signature.byteLength === COMPACT_P256_SIGNATURE_LENGTH
              ? "compact"
              : "der";
          return p256.verify(signature, payload, publicKey, {
            format,
            prehash: true,
            lowS: false,
          });
        };
      })
      .catch((error) => {
        fallbackVerifierPromise = null;
        throw new Error(
          "Dieser Browser stellt keine sichere ECDSA-Verifikation bereit. Bitte die HTTPS-Version in einem aktuellen Browser öffnen.",
          { cause: error },
        );
      });
  }

  return fallbackVerifierPromise;
}

/** @param {JsonWebKey} jwk @returns {JsonWebKey} */
function normalizePublicKeyJwk(jwk) {
  if (
    !jwk ||
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string"
  ) {
    throw new RangeError(
      "Der öffentliche Verifikationsschlüssel ist ungültig.",
    );
  }

  const x = base64UrlToBytes(jwk.x);
  const y = base64UrlToBytes(jwk.y);
  if (x.byteLength !== 32 || y.byteLength !== 32) {
    throw new RangeError(
      "Der öffentliche Verifikationsschlüssel hat ungültige Koordinaten.",
    );
  }

  return Object.freeze({
    kty: "EC",
    crv: "P-256",
    x: jwk.x,
    y: jwk.y,
    ext: true,
    key_ops: ["verify"],
  });
}

/** @param {JsonWebKey} jwk @returns {Uint8Array} */
function jwkToUncompressedPublicKey(jwk) {
  const x = base64UrlToBytes(jwk.x);
  const y = base64UrlToBytes(jwk.y);
  const publicKey = new Uint8Array(1 + x.byteLength + y.byteLength);
  publicKey[0] = 0x04;
  publicKey.set(x, 1);
  publicKey.set(y, 1 + x.byteLength);
  return publicKey;
}

/** @param {string} value @returns {Uint8Array} */
function base64UrlToBytes(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw new RangeError("Der Spielcode enthält ungültige Zeichen.");
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  try {
    return Uint8Array.from(
      atob(padded),
      (character) => character.charCodeAt(0),
    );
  } catch (error) {
    throw new RangeError("Der Spielcode ist nicht lesbar.", {
      cause: error,
    });
  }
}

/** @param {Uint8Array} bytes @returns {string} */
function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
