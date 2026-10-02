import { PlayerDrawSession } from "./player-session.js?v=3";
import { importVerificationKey, verifyDrawToken } from "./token.js?v=3";
import { installPumperellaVisualTheme } from "./visual-theme.js?v=2";
import { installPlayerExperience } from "./player-experience.js?v=9";

const PERSISTENCE_CONSENT_KEY = "pumperella.progressPersistenceConsent.v1";
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
    resolveConsentedProgressStorage(),
  );

  removeLegacyIdentityQueryParameters();

  // Initialize the independent persistence preference before the optional 3D
  // runtime is loaded. A rendering dependency failure must never leave a
  // visible but non-functional consent control behind.
  installProgressPersistenceControl(playerSession);

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
 * Returns localStorage only when the user has previously opted into persistent
 * progress. Reading the preference itself is limited to this functional choice.
 *
 * @returns {Storage|null}
 */
function resolveConsentedProgressStorage() {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(PERSISTENCE_CONSENT_KEY) === "granted"
      ? storage
      : null;
  } catch {
    return null;
  }
}

/**
 * Installs the explicit preference for persistent progress.
 *
 * @param {PlayerDrawSession} playerSession Authenticated player session.
 */
function installProgressPersistenceControl(playerSession) {
  const checkbox = document.getElementById("persist-progress");
  const note = document.getElementById("persist-progress-note");
  if (!(checkbox instanceof HTMLInputElement)) {
    return;
  }

  const storage = getLocalStorage();
  if (!storage) {
    checkbox.disabled = true;
    if (note) {
      note.textContent = "Browserspeicher ist nicht verfügbar.";
    }
    return;
  }

  checkbox.checked = playerSession.isPersistenceEnabled();
  if (note) {
    note.textContent = checkbox.checked
      ? "Fortschritt wird lokal gespeichert."
      : "Nur nach Zustimmung dauerhaft.";
  }

  checkbox.addEventListener("change", () => {
    try {
      if (checkbox.checked) {
        storage.setItem(PERSISTENCE_CONSENT_KEY, "granted");
        playerSession.enablePersistence(storage);
        if (note) {
          note.textContent = "Fortschritt wird lokal gespeichert.";
        }
        return;
      }

      playerSession.disablePersistence();
      storage.removeItem(PERSISTENCE_CONSENT_KEY);
      if (note) {
        note.textContent = "Dauerhafte Speicherung ist deaktiviert.";
      }
    } catch {
      checkbox.checked = playerSession.isPersistenceEnabled();
      if (note) {
        note.textContent = "Speicherpräferenz konnte nicht geändert werden.";
      }
    }
  });
}

/** @returns {Storage|null} */
function getLocalStorage() {
  try {
    const storage = window.localStorage;
    if (
      storage &&
      typeof storage.getItem === "function" &&
      typeof storage.setItem === "function" &&
      typeof storage.removeItem === "function"
    ) {
      return storage;
    }
  } catch {
    // Privacy settings may deny local storage access.
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
