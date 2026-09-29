const PLAYER_NAME_PROVIDER_KEY = Symbol.for(
  "pumperella.signing.playerNameProvider",
);
const ARCHIVE_STORAGE_KEY = "ninepins.drawArchive.v1";
const IDENTITY_QUERY_KEYS = Object.freeze([
  "player",
  "name",
  "spieler",
  "displayName",
]);
const ENHANCED_ATTRIBUTE = "data-player-link-normalized";

/**
 * Creates the ordered provider consumed by the token encoder. The existing
 * admin form creates assignments in exactly the same order as the player input.
 *
 * @param {string[]} playerNames Ordered player names.
 * @returns {()=>string} One-shot player-name provider.
 */
export function createPlayerNameProvider(playerNames) {
  if (!Array.isArray(playerNames) || playerNames.length === 0) {
    throw new RangeError("At least one player name is required.");
  }

  const queue = playerNames.map(normalizePlayerName);
  return function providePlayerName() {
    const playerName = queue.shift();
    if (!playerName) {
      throw new RangeError("No player name is available for the signed token.");
    }
    return playerName;
  };
}

/**
 * Removes obsolete unsigned player-name query parameters from a URL.
 *
 * @param {string} link Candidate link.
 * @returns {string} Link without identity query parameters.
 */
export function stripIdentityQueryParameters(link) {
  const url = new URL(link);
  for (const key of IDENTITY_QUERY_KEYS) {
    url.searchParams.delete(key);
  }
  return url.href;
}

/** Installs the signed-player bridge for the existing local admin UI. */
function installSignedPlayerBridge() {
  const drawForm = document.querySelector("#draw-form");
  const playersInput = document.querySelector("#players");
  const playerAppUrlInput = document.querySelector("#player-app-url");
  const resultsBody = document.querySelector("#results-body");
  if (!drawForm || !playersInput || !playerAppUrlInput) {
    return;
  }

  drawForm.addEventListener(
    "submit",
    () => {
      const playerNames = playersInput.value
        .split(/\r?\n/u)
        .map((value) => value.replace(/\s+/gu, " ").trim())
        .filter(Boolean);

      globalThis[PLAYER_NAME_PROVIDER_KEY] =
        createPlayerNameProvider(playerNames);

      if (playerAppUrlInput.value.trim()) {
        playerAppUrlInput.value = stripIdentityQueryParameters(
          playerAppUrlInput.value,
        );
      }
    },
    { capture: true },
  );

  if (resultsBody) {
    const observer = new MutationObserver(() => {
      normalizeResultLinks(resultsBody);
    });
    observer.observe(resultsBody, { childList: true, subtree: true });
    normalizeResultLinks(resultsBody);
  }
}

/**
 * Removes legacy identity query parameters from rendered and archived links.
 *
 * @param {HTMLElement} resultsBody Results table body.
 */
function normalizeResultLinks(resultsBody) {
  for (const row of resultsBody.querySelectorAll("tr")) {
    if (row.hasAttribute(ENHANCED_ATTRIBUTE)) {
      continue;
    }

    const linkInput = row.querySelector("input[type='text']");
    if (!linkInput?.value) {
      continue;
    }

    const originalLink = linkInput.value;
    const normalizedLink = stripIdentityQueryParameters(originalLink);
    linkInput.value = normalizedLink;
    persistNormalizedLink(originalLink, normalizedLink);
    row.setAttribute(ENHANCED_ATTRIBUTE, "true");
  }
}

/**
 * Persists a normalized URL in the local archive.
 *
 * @param {string} originalLink Previous link.
 * @param {string} normalizedLink Clean link.
 */
function persistNormalizedLink(originalLink, normalizedLink) {
  if (originalLink === normalizedLink) {
    return;
  }

  try {
    const serialized = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!serialized) {
      return;
    }

    const archive = JSON.parse(serialized);
    let changed = false;
    for (const draw of archive?.draws ?? []) {
      for (const assignment of draw?.assignments ?? []) {
        if (
          assignment?.link === originalLink ||
          extractToken(assignment?.link) === extractToken(originalLink)
        ) {
          assignment.link = normalizedLink;
          changed = true;
        }
      }
    }

    if (changed) {
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archive));
    }
  } catch {
    // Normalization is best-effort; the signed token remains authoritative.
  }
}

/** @param {string} link @returns {string} */
function extractToken(link) {
  try {
    return new URL(link).hash.slice(1);
  } catch {
    return "";
  }
}

/** @param {unknown} value @returns {string} */
function normalizePlayerName(value) {
  if (typeof value !== "string") {
    throw new TypeError("Player name must be a string.");
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    throw new RangeError("Player name must not be empty.");
  }
  return normalized;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installSignedPlayerBridge, {
      once: true,
    });
  } else {
    installSignedPlayerBridge();
  }
}
