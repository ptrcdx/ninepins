const DATE_COUNT = 3;
const APPLICATION_TIME_ZONE = "Europe/Berlin";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const PROGRESS_SCHEMA_VERSION = 1;
const PROGRESS_STORAGE_PREFIX = "pumperella.playerProgress.v1";

/**
 * Holds the verified, immutable dates for one player and reveals them sequentially.
 * Progress is persisted by drawId when a browser Storage implementation is provided.
 */
export class PlayerDrawSession {
  /**
   * @param {{drawId: string, dates: string[]}} verifiedDraw Authenticated draw payload.
   * @param {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void}|null} [storage=null] Persistent storage adapter.
   */
  constructor(verifiedDraw, storage = null) {
    validateVerifiedDraw(verifiedDraw);
    validateStorage(storage);

    this.drawId = verifiedDraw.drawId;
    this.dates = Object.freeze([...verifiedDraw.dates]);
    this.storage = storage;
    this.storageKey = `${PROGRESS_STORAGE_PREFIX}.${this.drawId}`;
    this.revealedCount = this.readPersistedCount();
  }

  /** @returns {boolean} Whether another successful throw can reveal a date. */
  hasRemainingDates() {
    return this.revealedCount < this.dates.length;
  }

  /** @returns {number} Number of already revealed dates. */
  getRevealedCount() {
    return this.revealedCount;
  }

  /** @returns {string[]} Already revealed dates, formatted for display. */
  getRevealedDates() {
    return this.dates
      .slice(0, this.revealedCount)
      .map((date) => formatApplicationDate(date));
  }

  /**
   * Reveals exactly one further date and persists the new progress before returning it.
   *
   * @returns {Promise<string>} Localized display date.
   */
  async drawDate() {
    this.synchronizeFromStorage();

    if (!this.hasRemainingDates()) {
      throw new RangeError("Alle drei Termine sind bereits gezogen.");
    }

    const isoDate = this.dates[this.revealedCount];
    const nextCount = this.revealedCount + 1;
    this.persistCount(nextCount);
    this.revealedCount = nextCount;
    return formatApplicationDate(isoDate);
  }

  /** Synchronizes forward-only progress when the same draw is open in another tab. */
  synchronizeFromStorage() {
    const persistedCount = this.readPersistedCount();
    this.revealedCount = Math.max(this.revealedCount, persistedCount);
  }

  /** @returns {number} Valid persisted progress or zero for missing/invalid state. */
  readPersistedCount() {
    if (!this.storage) {
      return 0;
    }

    try {
      const serialized = this.storage.getItem(this.storageKey);
      if (!serialized) {
        return 0;
      }

      const state = JSON.parse(serialized);
      if (
        state?.schemaVersion !== PROGRESS_SCHEMA_VERSION ||
        state?.drawId !== this.drawId ||
        !Number.isInteger(state?.revealedCount) ||
        state.revealedCount < 0 ||
        state.revealedCount > DATE_COUNT
      ) {
        return 0;
      }

      return state.revealedCount;
    } catch {
      return 0;
    }
  }

  /**
   * Persists progress monotonically. Storage errors never corrupt the in-memory game state.
   *
   * @param {number} requestedCount Progress after the latest successful throw.
   */
  persistCount(requestedCount) {
    if (!this.storage) {
      return;
    }

    try {
      const persistedCount = this.readPersistedCount();
      const revealedCount = Math.max(requestedCount, persistedCount);
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          schemaVersion: PROGRESS_SCHEMA_VERSION,
          drawId: this.drawId,
          revealedCount,
        }),
      );
    } catch {
      // Browsers can deny storage in restricted privacy modes. Gameplay remains usable,
      // but persistence across reloads cannot be guaranteed in that environment.
    }
  }
}

/**
 * Validates an authenticated draw before it becomes part of a player session.
 *
 * @param {{drawId?: unknown, dates?: unknown}} verifiedDraw Authenticated draw payload.
 */
function validateVerifiedDraw(verifiedDraw) {
  if (typeof verifiedDraw?.drawId !== "string" || verifiedDraw.drawId.length === 0) {
    throw new RangeError("Der verifizierte Spielcode enthält keine Ziehungs-ID.");
  }
  if (!Array.isArray(verifiedDraw.dates) || verifiedDraw.dates.length !== DATE_COUNT) {
    throw new RangeError(`Der verifizierte Spielcode muss genau ${DATE_COUNT} Termine enthalten.`);
  }
  if (!verifiedDraw.dates.every((date) => typeof date === "string" && ISO_DATE_PATTERN.test(date))) {
    throw new RangeError("Der verifizierte Spielcode enthält ein ungültiges Datumsformat.");
  }
}

/**
 * Validates the optional browser storage abstraction.
 *
 * @param {unknown} storage Candidate storage adapter.
 */
function validateStorage(storage) {
  if (
    storage !== null &&
    (typeof storage !== "object" ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function")
  ) {
    throw new TypeError("Der Fortschrittsspeicher ist ungültig.");
  }
}

/**
 * Formats an ISO calendar date with the application's fixed Berlin semantics.
 *
 * @param {string} isoDate Calendar date in YYYY-MM-DD form.
 * @returns {string} German display date.
 */
export function formatApplicationDate(isoDate) {
  if (typeof isoDate !== "string" || !ISO_DATE_PATTERN.test(isoDate)) {
    throw new RangeError("Ungültiges ISO-Datum.");
  }

  const [year, month, day] = isoDate.split("-").map(Number);
  const canonicalUtc = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: APPLICATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(canonicalUtc);
}
