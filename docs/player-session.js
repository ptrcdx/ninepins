const DATE_COUNT = 3;
const APPLICATION_TIME_ZONE = "Europe/Berlin";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Holds the verified, immutable dates for one player and reveals them sequentially.
 * The session does not perform scoring; callers invoke drawDate() only after a valid hit.
 */
export class PlayerDrawSession {
  /**
   * @param {{drawId: string, dates: string[]}} verifiedDraw Authenticated draw payload.
   */
  constructor(verifiedDraw) {
    if (typeof verifiedDraw?.drawId !== "string" || verifiedDraw.drawId.length === 0) {
      throw new RangeError("Der verifizierte Spielcode enthält keine Ziehungs-ID.");
    }
    if (!Array.isArray(verifiedDraw.dates) || verifiedDraw.dates.length !== DATE_COUNT) {
      throw new RangeError(`Der verifizierte Spielcode muss genau ${DATE_COUNT} Termine enthalten.`);
    }
    if (!verifiedDraw.dates.every((date) => typeof date === "string" && ISO_DATE_PATTERN.test(date))) {
      throw new RangeError("Der verifizierte Spielcode enthält ein ungültiges Datumsformat.");
    }

    this.drawId = verifiedDraw.drawId;
    this.dates = Object.freeze([...verifiedDraw.dates]);
    this.revealedCount = 0;
  }

  /** @returns {boolean} Whether another successful throw can reveal a date. */
  hasRemainingDates() {
    return this.revealedCount < this.dates.length;
  }

  /** @returns {number} Number of already revealed dates. */
  getRevealedCount() {
    return this.revealedCount;
  }

  /**
   * Reveals exactly one further date.
   *
   * @returns {Promise<string>} Localized display date.
   */
  async drawDate() {
    if (!this.hasRemainingDates()) {
      throw new RangeError("Alle drei Termine sind bereits gezogen.");
    }

    const isoDate = this.dates[this.revealedCount];
    this.revealedCount += 1;
    return formatApplicationDate(isoDate);
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
