const ARCHIVE_STORAGE_KEY = "ninepins.drawArchive.v1";
const RESULTS_BODY_SELECTOR = "#results-body";
const ENHANCED_ATTRIBUTE = "data-player-link-enhanced";

/**
 * Adds the player's display name to a personal game link without changing the
 * signed fragment token. The name is UI metadata; dates and draw identity stay
 * authenticated by the existing token signature.
 *
 * @param {string} link Personal player link.
 * @param {string} playerName Player display name.
 * @returns {string} Personal link containing the encoded player name.
 */
export function buildNamedPlayerLink(link, playerName) {
  if (typeof link !== "string" || !link.trim()) {
    throw new TypeError("Player link must be a non-empty string.");
  }

  const normalizedName = typeof playerName === "string" ? playerName.trim() : "";
  if (!normalizedName) {
    return link;
  }

  const url = new URL(link);
  url.searchParams.set("player", normalizedName);
  return url.href;
}

/** Installs progressive enhancement for the local admin result table. */
function installPlayerLinkEnhancement() {
  const resultsBody = document.querySelector(RESULTS_BODY_SELECTOR);
  if (!resultsBody) {
    return;
  }

  enhanceResultRows(resultsBody);

  const observer = new MutationObserver(() => {
    enhanceResultRows(resultsBody);
  });
  observer.observe(resultsBody, { childList: true, subtree: true });
}

/**
 * Enhances every previously unprocessed result row.
 *
 * @param {HTMLElement} resultsBody Results table body.
 */
function enhanceResultRows(resultsBody) {
  for (const row of resultsBody.querySelectorAll("tr")) {
    enhanceResultRow(row);
  }
}

/**
 * Rewrites one result link, persists it in the local archive and takes over
 * the copy action in the capture phase.
 *
 * @param {HTMLTableRowElement} row Result row.
 */
function enhanceResultRow(row) {
  if (row.hasAttribute(ENHANCED_ATTRIBUTE)) {
    return;
  }

  const cells = row.querySelectorAll("td");
  const playerName = cells[0]?.textContent?.trim();
  const linkInput = cells[2]?.querySelector("input[type='text']");
  const copyButton = cells[2]?.querySelector("button");
  if (!playerName || !linkInput || !copyButton || !linkInput.value) {
    return;
  }

  const originalLink = linkInput.value;
  const namedLink = buildNamedPlayerLink(originalLink, playerName);
  linkInput.value = namedLink;
  persistNamedLink(originalLink, namedLink, playerName);

  copyButton.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await copyText(namedLink, linkInput);
      copyButton.textContent = "Kopiert";
      window.setTimeout(() => {
        copyButton.textContent = "Kopieren";
      }, 1500);
    },
    true,
  );

  row.setAttribute(ENHANCED_ATTRIBUTE, "true");
}

/**
 * Persists the rewritten URL so later JSON/CSV exports contain the same link.
 *
 * @param {string} originalLink Original archive link.
 * @param {string} namedLink Rewritten link.
 * @param {string} playerName Player display name.
 */
function persistNamedLink(originalLink, namedLink, playerName) {
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
          assignment?.player === playerName &&
          (assignment.link === originalLink || extractToken(assignment.link) === extractToken(originalLink))
        ) {
          assignment.link = namedLink;
          changed = true;
        }
      }
    }

    if (changed) {
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archive));
    }
  } catch {
    // Archive persistence is best-effort; the visible/copyable link is already correct.
  }
}

/**
 * Copies text using the Clipboard API with a legacy input-selection fallback.
 *
 * @param {string} value Text to copy.
 * @param {HTMLInputElement} input Fallback input.
 */
async function copyText(value, input) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  input.focus();
  input.select();
  document.execCommand("copy");
  input.setSelectionRange(0, 0);
}

/**
 * Extracts the signed fragment token for stable archive matching.
 *
 * @param {string} link Candidate link.
 * @returns {string} Fragment token or an empty string.
 */
function extractToken(link) {
  try {
    return new URL(link).hash.slice(1);
  } catch {
    return "";
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPlayerLinkEnhancement, { once: true });
  } else {
    installPlayerLinkEnhancement();
  }
}
