const DATE_COUNT = 3;
const APPLICATION_TIME_ZONE = "Europe/Berlin";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const PROGRESS_SCHEMA_VERSION = 1;
const PROGRESS_STORAGE_PREFIX = "pumperella.playerProgress.v1";
const MAX_PLAYER_NAME_LENGTH = 80;

/**
 * Holds the verified, immutable player assignment and reveals dates
 * sequentially. Progress is persisted by drawId when browser storage exists.
 */
export class PlayerDrawSession {
  /**
   * @param {{drawId:string,dates:string[],playerName?:string|null}} verifiedDraw Authenticated assignment.
   * @param {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void}|null} [storage=null] Persistent storage adapter.
   */
  constructor(verifiedDraw, storage = null) {
    validateVerifiedDraw(verifiedDraw);
    validateStorage(storage);

    this.drawId = verifiedDraw.drawId;
    this.dates = Object.freeze([...verifiedDraw.dates]);
    this.playerName = normalizeOptionalPlayerName(verifiedDraw.playerName);
    this.storage = storage;
    this.storageKey = `${PROGRESS_STORAGE_PREFIX}.${this.drawId}`;
    this.revealedCount = this.readPersistedCount();
  }

  /** @returns {string|null} Authenticated player name or null for legacy links. */
  getPlayerName() {
    return this.playerName;
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

  /** @returns {Promise<string>} The next localized date. */
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

  /** Synchronizes forward-only progress with another tab. */
  synchronizeFromStorage() {
    this.revealedCount = Math.max(
      this.revealedCount,
      this.readPersistedCount(),
    );
  }

  /** @returns {number} Valid persisted progress or zero. */
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

  /** @param {number} requestedCount Progress after the latest hit. */
  persistCount(requestedCount) {
    if (!this.storage) {
      return;
    }

    try {
      const revealedCount = Math.max(
        requestedCount,
        this.readPersistedCount(),
      );
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          schemaVersion: PROGRESS_SCHEMA_VERSION,
          drawId: this.drawId,
          revealedCount,
        }),
      );
    } catch {
      // Restricted privacy modes may deny storage. Gameplay remains usable.
    }
  }
}

/** @param {{drawId?:unknown,dates?:unknown,playerName?:unknown}} verifiedDraw */
function validateVerifiedDraw(verifiedDraw) {
  if (typeof verifiedDraw?.drawId !== "string" || !verifiedDraw.drawId) {
    throw new RangeError("Der verifizierte Spielcode enthält keine Ziehungs-ID.");
  }
  if (!Array.isArray(verifiedDraw.dates) || verifiedDraw.dates.length !== DATE_COUNT) {
    throw new RangeError(
      `Der verifizierte Spielcode muss genau ${DATE_COUNT} Termine enthalten.`,
    );
  }
  if (!verifiedDraw.dates.every(
    (date) => typeof date === "string" && ISO_DATE_PATTERN.test(date),
  )) {
    throw new RangeError(
      "Der verifizierte Spielcode enthält ein ungültiges Datumsformat.",
    );
  }
  normalizeOptionalPlayerName(verifiedDraw.playerName);
}

/** @param {unknown} value @returns {string|null} */
function normalizeOptionalPlayerName(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TypeError("Der verifizierte Spielername ist ungültig.");
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (
    !normalized ||
    normalized !== value ||
    [...normalized].length > MAX_PLAYER_NAME_LENGTH
  ) {
    throw new RangeError("Der verifizierte Spielername ist ungültig.");
  }
  return normalized;
}

/** @param {unknown} storage */
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

/** @param {string} isoDate @returns {string} */
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
