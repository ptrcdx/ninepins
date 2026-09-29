import { PlayerDrawSession } from "./player-session.js?v=2";
import { importVerificationKey, verifyDrawToken } from "./token.js?v=3";
import { installPumperellaVisualTheme } from "./visual-theme.js?v=2";
import { installPlayerExperience } from "./player-experience.js?v=6";

const LEGACY_IDENTITY_QUERY_KEYS = Object.freeze([
  "player",
  "name",
  "spieler",
  "displayName",
]);

/**
 * Verifies the personal URL token before any playable 3D state is created.
 * Player identity, drawId and dates all come from the same signed token.
 *
 * @returns {Promise<PlayerDrawSession>} Authenticated player draw session.
 */
export async function createPlayerSession() {
  const token = window.location.hash.slice(1);
  if (!token) {
    throw new RangeError("Dieser Link enthält keinen persönlichen Spielcode.");
  }

  const keyBundle = await loadVerificationKey();
  const publicKey = await importVerificationKey(keyBundle.publicKey);
  const verifiedDraw = await verifyDrawToken(token, publicKey);
  const playerSession = new PlayerDrawSession(
    verifiedDraw,
    resolveProgressStorage(),
  );

  removeLegacyIdentityQueryParameters();
  await installPumperellaVisualTheme();
  await installPlayerExperience(playerSession);

  return playerSession;
}

/**
 * Removes unsigned identity metadata introduced by an earlier release while
 * preserving the signed fragment token and unrelated query parameters.
 */
function removeLegacyIdentityQueryParameters() {
  const url = new URL(window.location.href);
  let changed = false;

  for (const key of LEGACY_IDENTITY_QUERY_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (changed) {
    window.history.replaceState(null, "", url.href);
  }
}

/**
 * Uses durable local storage when available and falls back to session storage.
 *
 * @returns {Storage|null} Browser storage for reload-safe player progress.
 */
function resolveProgressStorage() {
  for (const storageName of ["localStorage", "sessionStorage"]) {
    try {
      const storage = window[storageName];
      if (
        storage &&
        typeof storage.getItem === "function" &&
        typeof storage.setItem === "function"
      ) {
        return storage;
      }
    } catch {
      // Continue with the next storage option when privacy settings deny access.
    }
  }

  return null;
}

/** @returns {Promise<{schemaVersion:number,algorithm:string,publicKey:JsonWebKey}>} */
async function loadVerificationKey() {
  const response = await fetch("./verification-key.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      "Der öffentliche Verifikationsschlüssel konnte nicht geladen werden.",
    );
  }

  const bundle = await response.json();
  if (
    bundle?.schemaVersion !== 1 ||
    bundle?.algorithm !== "ECDSA-P256-SHA256" ||
    !bundle.publicKey
  ) {
    throw new Error(
      "Der öffentliche Verifikationsschlüssel ist noch nicht eingerichtet.",
    );
  }

  return bundle;
}
