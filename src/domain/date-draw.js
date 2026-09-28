/**
 * Domain logic for generating and drawing calendar dates without replacement.
 *
 * All date arithmetic is performed in UTC to avoid daylight-saving-time and
 * local-time-zone edge cases. Public APIs use ISO calendar dates (YYYY-MM-DD).
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Parses an ISO calendar date and returns its UTC epoch value.
 *
 * @param {string} isoDate Date in YYYY-MM-DD format.
 * @returns {number} UTC epoch milliseconds at 00:00:00.
 * @throws {TypeError} If the input is not a string.
 * @throws {RangeError} If the date is malformed or does not exist.
 */
export function parseIsoDate(isoDate) {
  if (typeof isoDate !== "string") {
    throw new TypeError("Date must be a string in YYYY-MM-DD format.");
  }

  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) {
    throw new RangeError(`Invalid ISO date: ${isoDate}`);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utc = Date.UTC(year, month - 1, day);
  const parsed = new Date(utc);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid calendar date: ${isoDate}`);
  }

  return utc;
}

/**
 * Formats a UTC epoch value as an ISO calendar date.
 *
 * @param {number} utcEpochMilliseconds UTC epoch milliseconds.
 * @returns {string} Date in YYYY-MM-DD format.
 */
export function formatIsoDate(utcEpochMilliseconds) {
  return new Date(utcEpochMilliseconds).toISOString().slice(0, 10);
}

/**
 * Creates an inclusive list of ISO dates from startDate through endDate.
 *
 * @param {string} startDate Inclusive start date in YYYY-MM-DD format.
 * @param {string} endDate Inclusive end date in YYYY-MM-DD format.
 * @returns {string[]} Ordered inclusive date pool.
 * @throws {RangeError} If endDate is before startDate.
 */
export function createInclusiveDatePool(startDate, endDate) {
  const startUtc = parseIsoDate(startDate);
  const endUtc = parseIsoDate(endDate);

  if (endUtc < startUtc) {
    throw new RangeError("End date must not be before start date.");
  }

  const dayCount = Math.floor((endUtc - startUtc) / MILLISECONDS_PER_DAY) + 1;
  return Array.from({ length: dayCount }, (_, index) =>
    formatIsoDate(startUtc + index * MILLISECONDS_PER_DAY),
  );
}

/**
 * Returns a cryptographically strong random integer in [0, maxExclusive).
 * Rejection sampling avoids modulo bias.
 *
 * @param {number} maxExclusive Exclusive upper bound.
 * @returns {number} Random integer.
 */
export function secureRandomIndex(maxExclusive) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError("maxExclusive must be a positive safe integer.");
  }

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("A Web Crypto compatible random source is required.");
  }

  const maxUint32PlusOne = 0x1_0000_0000;
  const acceptanceLimit = Math.floor(maxUint32PlusOne / maxExclusive) * maxExclusive;
  const randomBuffer = new Uint32Array(1);

  do {
    cryptoApi.getRandomValues(randomBuffer);
  } while (randomBuffer[0] >= acceptanceLimit);

  return randomBuffer[0] % maxExclusive;
}

/**
 * Draws globally unique dates for all players without replacement.
 *
 * @param {object} options Draw configuration.
 * @param {string[]} options.players Unique player identifiers or display names.
 * @param {string} options.startDate Inclusive start date in YYYY-MM-DD format.
 * @param {string} options.endDate Inclusive end date in YYYY-MM-DD format.
 * @param {number} [options.datesPerPlayer=3] Number of dates assigned per player.
 * @param {(maxExclusive: number) => number} [options.randomIndex=secureRandomIndex]
 * Random index provider. Injectable for deterministic tests.
 * @returns {{player: string, dates: string[]}[]} Draw assignments.
 */
export function drawDatesWithoutReplacement({
  players,
  startDate,
  endDate,
  datesPerPlayer = 3,
  randomIndex = secureRandomIndex,
}) {
  validatePlayers(players);
  validateDatesPerPlayer(datesPerPlayer);

  if (typeof randomIndex !== "function") {
    throw new TypeError("randomIndex must be a function.");
  }

  const pool = createInclusiveDatePool(startDate, endDate);
  const requiredDateCount = players.length * datesPerPlayer;

  if (pool.length < requiredDateCount) {
    throw new RangeError(
      `Date range contains ${pool.length} days but ${requiredDateCount} unique dates are required.`,
    );
  }

  const assignments = [];

  for (const player of players) {
    const dates = [];

    for (let index = 0; index < datesPerPlayer; index += 1) {
      const selectedIndex = randomIndex(pool.length);
      validateRandomIndex(selectedIndex, pool.length);
      const [selectedDate] = pool.splice(selectedIndex, 1);
      dates.push(selectedDate);
    }

    assignments.push({ player, dates });
  }

  return assignments;
}

/**
 * Validates the player collection.
 *
 * @param {unknown} players Candidate player list.
 * @returns {void}
 */
function validatePlayers(players) {
  if (!Array.isArray(players) || players.length === 0) {
    throw new RangeError("At least one player is required.");
  }

  const normalized = players.map((player) => {
    if (typeof player !== "string" || player.trim().length === 0) {
      throw new TypeError("Every player must be a non-empty string.");
    }
    return player.trim();
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new RangeError("Player identifiers must be unique.");
  }
}

/**
 * Validates the requested number of dates per player.
 *
 * @param {unknown} datesPerPlayer Candidate count.
 * @returns {void}
 */
function validateDatesPerPlayer(datesPerPlayer) {
  if (!Number.isSafeInteger(datesPerPlayer) || datesPerPlayer <= 0) {
    throw new RangeError("datesPerPlayer must be a positive safe integer.");
  }
}

/**
 * Validates an injected random index result.
 *
 * @param {unknown} selectedIndex Candidate index.
 * @param {number} poolLength Current pool length.
 * @returns {void}
 */
function validateRandomIndex(selectedIndex, poolLength) {
  if (
    !Number.isSafeInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= poolLength
  ) {
    throw new RangeError(
      `randomIndex returned ${selectedIndex}; expected an integer from 0 to ${poolLength - 1}.`,
    );
  }
}
