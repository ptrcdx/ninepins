import { describe, expect, it } from "vitest";

import {
  createInclusiveDatePool,
  drawDatesWithoutReplacement,
  parseIsoDate,
} from "../src/domain/date-draw.js";

/**
 * Creates a deterministic random-index provider for tests.
 *
 * @param {number[]} sequence Sequence of index values to return.
 * @returns {(maxExclusive: number) => number} Deterministic provider.
 */
function createSequenceRandomIndex(sequence) {
  let cursor = 0;

  return (maxExclusive) => {
    const value = sequence[cursor % sequence.length];
    cursor += 1;
    return value % maxExclusive;
  };
}

describe("parseIsoDate", () => {
  it("accepts valid calendar dates", () => {
    expect(parseIsoDate("2026-09-28")).toBe(Date.UTC(2026, 8, 28));
  });

  it("rejects impossible dates", () => {
    expect(() => parseIsoDate("2026-02-30")).toThrow(RangeError);
  });
});

describe("createInclusiveDatePool", () => {
  it("includes both range boundaries", () => {
    expect(createInclusiveDatePool("2026-10-01", "2026-10-03")).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("handles daylight-saving transitions independently of local time", () => {
    expect(createInclusiveDatePool("2026-10-24", "2026-10-27")).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });

  it("rejects an inverted range", () => {
    expect(() => createInclusiveDatePool("2026-10-03", "2026-10-01")).toThrow(
      "End date must not be before start date.",
    );
  });
});

describe("drawDatesWithoutReplacement", () => {
  it("assigns exactly three globally unique dates per player by default", () => {
    const assignments = drawDatesWithoutReplacement({
      players: ["Alice", "Bob"],
      startDate: "2026-10-01",
      endDate: "2026-10-10",
      randomIndex: createSequenceRandomIndex([0, 2, 4, 1, 3, 0]),
    });

    expect(assignments).toHaveLength(2);
    expect(assignments.every(({ dates }) => dates.length === 3)).toBe(true);

    const allDates = assignments.flatMap(({ dates }) => dates);
    expect(new Set(allDates).size).toBe(allDates.length);
  });

  it("keeps every assigned date inside the configured range", () => {
    const assignments = drawDatesWithoutReplacement({
      players: ["Alice", "Bob", "Carol"],
      startDate: "2027-01-01",
      endDate: "2027-01-15",
      randomIndex: createSequenceRandomIndex([1, 5, 2, 7]),
    });

    const validPool = new Set(createInclusiveDatePool("2027-01-01", "2027-01-15"));
    expect(
      assignments.flatMap(({ dates }) => dates).every((date) => validPool.has(date)),
    ).toBe(true);
  });

  it("fails before drawing if the range cannot supply enough unique dates", () => {
    expect(() =>
      drawDatesWithoutReplacement({
        players: ["Alice", "Bob"],
        startDate: "2026-10-01",
        endDate: "2026-10-05",
        randomIndex: () => 0,
      }),
    ).toThrow("Date range contains 5 days but 6 unique dates are required.");
  });

  it("rejects duplicate player identifiers", () => {
    expect(() =>
      drawDatesWithoutReplacement({
        players: ["Alice", "Alice"],
        startDate: "2026-10-01",
        endDate: "2026-10-10",
        randomIndex: () => 0,
      }),
    ).toThrow("Player identifiers must be unique.");
  });

  it("rejects an invalid injected random index", () => {
    expect(() =>
      drawDatesWithoutReplacement({
        players: ["Alice"],
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        randomIndex: () => 99,
      }),
    ).toThrow("expected an integer from 0 to 2");
  });
});
