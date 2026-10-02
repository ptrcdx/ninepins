import { PlayerDrawSession } from "./player-session.js?v=4";
import { importVerificationKey, verifyDrawToken } from "./token.js?v=3";
import { installPumperellaVisualTheme } from "./visual-theme.js?v=2";
import { installPlayerExperience } from "./player-experience.js?v=15";

const PERSISTENCE_CONSENT_KEY = "pumperella.progressPersistenceConsent.v1";
const PERSISTENCE_GRANTED = "granted";
const PERSISTENCE_DENIED = "denied";
const MOBILE_LANDSCAPE_QUERY =
  "(orientation: landscape) and (max-height: 560px) and (pointer: coarse)";
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
  installMobilePortraitGuard();

  const token = window.location.hash.slice(1);
  if (!token) {
    throw new RangeError("Dieser Link enthält keinen persönlichen Spielcode.");
  }

  const keyBundle = await loadVerificationKey();
  const publicKey = await importVerificationKey(keyBundle.publicKey);
  const verifiedDraw = await verifyDrawToken(token, publicKey);
  const storage = getLocalStorage();
  const persistencePreference = readPersistencePreference(storage);
  const playerSession = new PlayerDrawSession(
    verifiedDraw,
    persistencePreference === PERSISTENCE_GRANTED ? storage : null,
  );

  removeLegacyIdentityQueryParameters();

  // Persistence settings are available independently from the optional 3D
  // runtime. The first-visit decision is completed before gameplay starts.
  installProgressPersistenceSettings(playerSession, storage);
  await requestInitialPersistencePreference(
    playerSession,
    storage,
    persistencePreference,
  );

  await installPumperellaVisualTheme();
  await installPlayerExperience(playerSession);

  return playerSession;
}

/**
 * Blocks the game only on phone-sized coarse-pointer landscape viewports.
 * A native modal dialog is used so the guard stays above the welcome dialog
 * and settings UI. Rotating back to portrait closes it automatically.
 */
function installMobilePortraitGuard() {
  const dialog = document.getElementById("portrait-required");
  if (
    !dialog ||
    typeof dialog.showModal !== "function" ||
    typeof window.matchMedia !== "function" ||
    dialog.dataset.guardInstalled === "true"
  ) {
    return;
  }

  dialog.dataset.guardInstalled = "true";
  const mediaQuery = window.matchMedia(MOBILE_LANDSCAPE_QUERY);

  const synchronize = () => {
    if (mediaQuery.matches) {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
  };

  dialog.addEventListener("cancel", (event) => {
    if (mediaQuery.matches) {
      event.preventDefault();
    }
  });

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", synchronize);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(synchronize);
  }

  synchronize();
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
 * Reads the remembered persistence choice.
 *
 * @param {{getItem:(key:string)=>string|null}|null} storage Browser storage.
 * @returns {"granted"|"denied"|null} Remembered choice or null for first visit.
 */
export function readPersistencePreference(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return null;
  }

  try {
    const preference = storage.getItem(PERSISTENCE_CONSENT_KEY);
    return preference === PERSISTENCE_GRANTED || preference === PERSISTENCE_DENIED
      ? preference
      : null;
  } catch {
    return null;
  }
}

/**
 * Persists the user's explicit storage preference.
 *
 * @param {{setItem:(key:string,value:string)=>void}|null} storage Browser storage.
 * @param {"granted"|"denied"} preference Explicit choice.
 * @returns {boolean} Whether the preference could be persisted.
 */
export function writePersistencePreference(storage, preference) {
  if (preference !== PERSISTENCE_GRANTED && preference !== PERSISTENCE_DENIED) {
    throw new RangeError("Unbekannte Speicherpräferenz.");
  }
  if (!storage || typeof storage.setItem !== "function") {
    return false;
  }

  try {
    storage.setItem(PERSISTENCE_CONSENT_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shows the welcome and persistence choice exactly once per remembered browser
 * preference. The dialog cannot be dismissed without choosing.
 *
 * @param {PlayerDrawSession} playerSession Authenticated player session.
 * @param {Storage|null} storage Browser storage.
 * @param {"granted"|"denied"|null} persistencePreference Remembered choice.
 * @returns {Promise<void>} Resolves after a first-time choice or immediately.
 */
async function requestInitialPersistencePreference(
  playerSession,
  storage,
  persistencePreference,
) {
  if (persistencePreference !== null) {
    return;
  }

  const dialog = document.getElementById("persistence-welcome");
  const acceptButton = document.getElementById("persistence-accept");
  const declineButton = document.getElementById("persistence-decline");
  const status = document.getElementById("persistence-welcome-status");

  if (
    !dialog ||
    typeof dialog.showModal !== "function" ||
    !(acceptButton instanceof HTMLButtonElement) ||
    !(declineButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  if (!storage) {
    acceptButton.disabled = true;
    if (status) {
      status.textContent =
        "Dauerhafter Browserspeicher ist in dieser Umgebung nicht verfügbar.";
    }
  }

  await new Promise((resolve) => {
    const closeDialog = () => {
      acceptButton.removeEventListener("click", accept);
      declineButton.removeEventListener("click", decline);
      dialog.removeEventListener("cancel", preventDismiss);
      dialog.close();
      syncProgressPersistenceSettings(playerSession, storage);
      resolve();
    };

    const accept = () => {
      if (!storage || !writePersistencePreference(storage, PERSISTENCE_GRANTED)) {
        if (status) {
          status.textContent =
            "Die Speicherpräferenz konnte nicht gespeichert werden.";
        }
        return;
      }

      playerSession.enablePersistence(storage);
      closeDialog();
    };

    const decline = () => {
      if (storage) {
        writePersistencePreference(storage, PERSISTENCE_DENIED);
      }
      playerSession.disablePersistence();
      closeDialog();
    };

    const preventDismiss = (event) => {
      event.preventDefault();
    };

    acceptButton.addEventListener("click", accept);
    declineButton.addEventListener("click", decline);
    dialog.addEventListener("cancel", preventDismiss);
    dialog.showModal();
    declineButton.focus();
  });
}

/**
 * Installs the compact settings menu used on desktop, tablet and mobile.
 *
 * @param {PlayerDrawSession} playerSession Authenticated player session.
 * @param {Storage|null} storage Browser storage.
 */
function installProgressPersistenceSettings(playerSession, storage) {
  const menuButton = document.getElementById("settings-menu-button");
  const panel = document.getElementById("settings-panel");
  const checkbox = document.getElementById("settings-persist-progress");
  const clearButton = document.getElementById("settings-clear-progress");

  if (
    !(menuButton instanceof HTMLButtonElement) ||
    !(panel instanceof HTMLElement) ||
    !(checkbox instanceof HTMLInputElement) ||
    !(clearButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  menuButton.hidden = false;
  checkbox.disabled = !storage;
  clearButton.disabled = !storage;
  syncProgressPersistenceSettings(playerSession, storage);

  const closePanel = () => {
    panel.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  };

  const openPanel = () => {
    panel.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    checkbox.focus();
  };

  menuButton.addEventListener("click", () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });

  checkbox.addEventListener("change", () => {
    if (!storage) {
      checkbox.checked = false;
      setStorageNote("Browserspeicher ist nicht verfügbar.");
      return;
    }

    if (checkbox.checked) {
      if (!writePersistencePreference(storage, PERSISTENCE_GRANTED)) {
        checkbox.checked = playerSession.isPersistenceEnabled();
        setStorageNote("Speicherpräferenz konnte nicht geändert werden.");
        return;
      }
      playerSession.enablePersistence(storage);
      setStorageNote("Fortschritt wird lokal gespeichert.");
      return;
    }

    writePersistencePreference(storage, PERSISTENCE_DENIED);
    playerSession.disablePersistence();
    setStorageNote(
      "Dauerhafte Speicherung ist deaktiviert. Bereits gespeicherter Fortschritt bleibt erhalten.",
    );
  });

  clearButton.addEventListener("click", () => {
    if (!storage) {
      setStorageNote("Browserspeicher ist nicht verfügbar.");
      return;
    }
    if (!window.confirm("Gespeicherten Fortschritt für dieses Spiel wirklich löschen?")) {
      return;
    }

    if (playerSession.clearPersistedProgress(storage)) {
      setStorageNote(
        "Gespeicherter Fortschritt wurde gelöscht. Die aktuelle Sitzung bleibt unverändert.",
      );
    } else {
      setStorageNote("Gespeicherter Fortschritt konnte nicht gelöscht werden.");
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (
      panel.hidden ||
      !(event.target instanceof Node) ||
      panel.contains(event.target) ||
      menuButton.contains(event.target)
    ) {
      return;
    }
    closePanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      closePanel();
      menuButton.focus();
    }
  });
}

/**
 * Synchronizes menu controls with the current persistence state.
 *
 * @param {PlayerDrawSession} playerSession Authenticated player session.
 * @param {Storage|null} storage Browser storage.
 */
function syncProgressPersistenceSettings(playerSession, storage) {
  const checkbox = document.getElementById("settings-persist-progress");
  if (checkbox instanceof HTMLInputElement) {
    checkbox.checked = playerSession.isPersistenceEnabled();
    checkbox.disabled = !storage;
  }

  const clearButton = document.getElementById("settings-clear-progress");
  if (clearButton instanceof HTMLButtonElement) {
    clearButton.disabled = !storage;
  }

  if (!storage) {
    setStorageNote("Browserspeicher ist nicht verfügbar.");
  } else if (playerSession.isPersistenceEnabled()) {
    setStorageNote("Fortschritt wird lokal gespeichert.");
  } else {
    setStorageNote("Dauerhafte Speicherung ist deaktiviert.");
  }
}

/** @param {string} message Status text for the settings panel. */
function setStorageNote(message) {
  const note = document.getElementById("settings-storage-note");
  if (note) {
    note.textContent = message;
  }
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
