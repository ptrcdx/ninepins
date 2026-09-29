import { describe, expect, it } from "vitest";

import {
  APPLICATION_TIME_ZONE,
  DEFAULT_DATES_PER_PLAYER,
  createInclusiveDatePool,
  drawDatesWithoutReplacement,
  formatApplicationDate,
  parseIsoDate,
} from "../src/domain/date-draw.js";

function createSequenceRandomIndex(sequence) {
  let cursor = 0;
  return (maxExclusive) => {
    const value = sequence[cursor % sequence.length];
    cursor += 1;
    return value % maxExclusive;
  };
}

describe("application calendar policy", () => {
  it("is permanently pinned to Europe/Berlin", () => {
    expect(APPLICATION_TIME_ZONE).toBe("Europe/Berlin");
  });

  it("formats dates with Berlin semantics instead of the runtime time zone", () => {
    expect(formatApplicationDate("2026-03-29")).toBe("29.03.2026");
    expect(formatApplicationDate("2026-10-25")).toBe("25.10.2026");
  });
});

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

  it("stays continuous across the Berlin switch to daylight-saving time", () => {
    expect(createInclusiveDatePool("2026-03-28", "2026-03-31")).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
    ]);
  });

  it("stays continuous across the Berlin switch back to standard time", () => {
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
  it("assigns exactly two globally unique dates per player by default", () => {
    expect(DEFAULT_DATES_PER_PLAYER).toBe(2);
    const assignments = drawDatesWithoutReplacement({
      players: ["Alice", "Bob"],
      startDate: "2026-10-01",
      endDate: "2026-10-10",
      randomIndex: createSequenceRandomIndex([0, 2, 4, 1]),
    });

    expect(assignments).toHaveLength(2);
    expect(assignments.every(({ dates }) => dates.length === 2)).toBe(true);
    const allDates = assignments.flatMap(({ dates }) => dates);
    expect(new Set(allDates).size).toBe(allDates.length);
  });

  it("draws eight unique dates for four players from 1 through 24 December", () => {
    const assignments = drawDatesWithoutReplacement({
      players: ["Anna", "Ben", "Carla", "David"],
      startDate: "2026-12-01",
      endDate: "2026-12-24",
      randomIndex: createSequenceRandomIndex([0, 5, 2, 9, 4, 11, 1, 7]),
    });

    const allDates = assignments.flatMap(({ dates }) => dates);
    expect(allDates).toHaveLength(8);
    expect(new Set(allDates).size).toBe(8);
    expect(allDates.every((date) => date >= "2026-12-01" && date <= "2026-12-24")).toBe(true);
  });

  it("never reuses dates assigned in previous draw sessions", () => {
    const assignments = drawDatesWithoutReplacement({
      players: ["Alice", "Bob"],
      startDate: "2026-10-01",
      endDate: "2026-10-12",
      excludedDates: ["2026-10-01", "2026-10-02", "2026-10-03"],
      randomIndex: () => 0,
    });

    expect(assignments.flatMap(({ dates }) => dates)).toEqual([
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
  });

  it("fails if previous assignments leave too few unused dates", () => {
    expect(() =>
      drawDatesWithoutReplacement({
        players: ["Alice", "Bob"],
        startDate: "2026-10-01",
        endDate: "2026-10-06",
        excludedDates: ["2026-10-01", "2026-10-02", "2026-10-03"],
        randomIndex: () => 0,
      }),
    ).toThrow("Date range contains 3 unused days after exclusions but 4 unique dates are required.");
  });

  it("fails before drawing if the range cannot supply enough unique dates", () => {
    expect(() =>
      drawDatesWithoutReplacement({
        players: ["Alice", "Bob"],
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        randomIndex: () => 0,
      }),
    ).toThrow("Date range contains 3 days but 4 unique dates are required.");
  });

  it("rejects duplicate player identifiers after normalization", () => {
    expect(() =>
      drawDatesWithoutReplacement({
        players: ["Alice", " Alice "],
        startDate: "2026-10-01",
        endDate: "2026-10-10",
        randomIndex: () => 0,
      }),
    ).toThrow("Player identifiers must be unique.");
  });

  it("rejects invalid excluded dates", () => {
    expect(() =>
      drawDatesWithoutReplacement({
        players: ["Alice"],
        startDate: "2026-10-01",
        endDate: "2026-10-10",
        excludedDates: ["2026-02-30"],
        randomIndex: () => 0,
      }),
    ).toThrow("Invalid calendar date: 2026-02-30");
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
