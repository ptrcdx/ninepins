import { describe, expect, it } from "vitest";

import { PlayerDrawSession, formatApplicationDate } from "../docs/player-session.js";

const VERIFIED_DRAW = Object.freeze({
  drawId: "a4499ca4-0c37-4ddd-b1c9-1a414853465f",
  dates: Object.freeze(["2026-10-25", "2027-01-08", "2027-06-19"]),
});

/**
 * Minimal in-memory Storage replacement for deterministic unit tests.
 *
 * @returns {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void}}
 */
function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

describe("PlayerDrawSession", () => {
  it("reveals exactly three authenticated dates in token order", async () => {
    const session = new PlayerDrawSession(VERIFIED_DRAW);

    await expect(session.drawDate()).resolves.toBe("25.10.2026");
    await expect(session.drawDate()).resolves.toBe("08.01.2027");
    await expect(session.drawDate()).resolves.toBe("19.06.2027");
    expect(session.hasRemainingDates()).toBe(false);
    expect(session.getRevealedCount()).toBe(3);
  });

  it("does not expose a fourth date", async () => {
    const session = new PlayerDrawSession(VERIFIED_DRAW);
    await session.drawDate();
    await session.drawDate();
    await session.drawDate();

    await expect(session.drawDate()).rejects.toThrow("Alle drei Termine sind bereits gezogen.");
  });

  it("keeps the original verified draw immutable from caller mutations", async () => {
    const mutableDraw = {
      drawId: VERIFIED_DRAW.drawId,
      dates: [...VERIFIED_DRAW.dates],
    };
    const session = new PlayerDrawSession(mutableDraw);
    mutableDraw.dates[0] = "2030-01-01";

    await expect(session.drawDate()).resolves.toBe("25.10.2026");
  });

  it("restores revealed dates after constructing a new session for the same draw", async () => {
    const storage = createMemoryStorage();
    const firstSession = new PlayerDrawSession(VERIFIED_DRAW, storage);

    await firstSession.drawDate();
    await firstSession.drawDate();

    const reloadedSession = new PlayerDrawSession(VERIFIED_DRAW, storage);

    expect(reloadedSession.getRevealedCount()).toBe(2);
    expect(reloadedSession.getRevealedDates()).toEqual(["25.10.2026", "08.01.2027"]);
    expect(reloadedSession.hasRemainingDates()).toBe(true);
    await expect(reloadedSession.drawDate()).resolves.toBe("19.06.2027");
  });

  it("restores the completed state after all three dates were revealed", async () => {
    const storage = createMemoryStorage();
    const firstSession = new PlayerDrawSession(VERIFIED_DRAW, storage);

    await firstSession.drawDate();
    await firstSession.drawDate();
    await firstSession.drawDate();

    const reloadedSession = new PlayerDrawSession(VERIFIED_DRAW, storage);

    expect(reloadedSession.getRevealedCount()).toBe(3);
    expect(reloadedSession.getRevealedDates()).toEqual([
      "25.10.2026",
      "08.01.2027",
      "19.06.2027",
    ]);
    expect(reloadedSession.hasRemainingDates()).toBe(false);
  });

  it("does not share progress between different draw ids", async () => {
    const storage = createMemoryStorage();
    const firstSession = new PlayerDrawSession(VERIFIED_DRAW, storage);
    await firstSession.drawDate();

    const otherSession = new PlayerDrawSession(
      {
        drawId: "123e4567-e89b-42d3-a456-426614174000",
        dates: [...VERIFIED_DRAW.dates],
      },
      storage,
    );

    expect(otherSession.getRevealedCount()).toBe(0);
    expect(otherSession.getRevealedDates()).toEqual([]);
  });
});

describe("formatApplicationDate", () => {
  it("uses Europe/Berlin calendar semantics", () => {
    expect(formatApplicationDate("2026-03-29")).toBe("29.03.2026");
    expect(formatApplicationDate("2026-10-25")).toBe("25.10.2026");
  });
});
