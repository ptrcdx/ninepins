import { describe, expect, it } from "vitest";

import {
  PlayerDrawSession,
  formatApplicationDate,
} from "../docs/player-session.js";

const VERIFIED_DRAW = Object.freeze({
  drawId: "a4499ca4-0c37-4ddd-b1c9-1a414853465f",
  dates: Object.freeze(["2026-10-25", "2027-01-08"]),
  playerName: "Claudia Beispiel",
});

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
  it("retains the authenticated player name", () => {
    const session = new PlayerDrawSession(VERIFIED_DRAW);
    expect(session.getPlayerName()).toBe("Claudia Beispiel");
    expect(session.playerName).toBe("Claudia Beispiel");
  });

  it("supports legacy verified draws without a player name", () => {
    const session = new PlayerDrawSession({
      drawId: VERIFIED_DRAW.drawId,
      dates: ["2026-10-25", "2027-01-08", "2027-06-19"],
      playerName: null,
    });
    expect(session.getPlayerName()).toBeNull();
    expect(session.dates).toHaveLength(3);
  });

  it("reveals exactly two authenticated dates in token order", async () => {
    const session = new PlayerDrawSession(VERIFIED_DRAW);
    await expect(session.drawDate()).resolves.toBe("25.10.2026");
    await expect(session.drawDate()).resolves.toBe("08.01.2027");
    expect(session.hasRemainingDates()).toBe(false);
    expect(session.getRevealedCount()).toBe(2);
  });

  it("does not expose a third date after completion", async () => {
    const session = new PlayerDrawSession(VERIFIED_DRAW);
    await session.drawDate();
    await session.drawDate();
    await expect(session.drawDate()).rejects.toThrow(
      "Alle Termine sind bereits gezogen.",
    );
    expect(session.getRevealedDates()).toEqual([
      "25.10.2026",
      "08.01.2027",
    ]);
  });

  it("continues to reveal all dates from a historic three-date link", async () => {
    const session = new PlayerDrawSession({
      drawId: VERIFIED_DRAW.drawId,
      dates: ["2026-10-25", "2027-01-08", "2027-06-19"],
      playerName: "Legacy Person",
    });
    await expect(session.drawDate()).resolves.toBe("25.10.2026");
    await expect(session.drawDate()).resolves.toBe("08.01.2027");
    await expect(session.drawDate()).resolves.toBe("19.06.2027");
    expect(session.hasRemainingDates()).toBe(false);
  });

  it("keeps authenticated assignment data immutable from caller changes", async () => {
    const mutableDraw = {
      drawId: VERIFIED_DRAW.drawId,
      dates: [...VERIFIED_DRAW.dates],
      playerName: VERIFIED_DRAW.playerName,
    };
    const session = new PlayerDrawSession(mutableDraw);
    mutableDraw.dates[0] = "2030-01-01";
    mutableDraw.playerName = "Manipuliert";

    await expect(session.drawDate()).resolves.toBe("25.10.2026");
    expect(session.getPlayerName()).toBe("Claudia Beispiel");
  });

  it("restores revealed dates for the same draw", async () => {
    const storage = createMemoryStorage();
    const firstSession = new PlayerDrawSession(VERIFIED_DRAW, storage);
    await firstSession.drawDate();

    const reloadedSession = new PlayerDrawSession(VERIFIED_DRAW, storage);
    expect(reloadedSession.getRevealedCount()).toBe(1);
    expect(reloadedSession.getRevealedDates()).toEqual(["25.10.2026"]);
    await expect(reloadedSession.drawDate()).resolves.toBe("08.01.2027");
  });

  it("does not share progress between different draw ids", async () => {
    const storage = createMemoryStorage();
    const firstSession = new PlayerDrawSession(VERIFIED_DRAW, storage);
    await firstSession.drawDate();

    const otherSession = new PlayerDrawSession(
      {
        drawId: "123e4567-e89b-42d3-a456-426614174000",
        dates: [...VERIFIED_DRAW.dates],
        playerName: "Andere Person",
      },
      storage,
    );
    expect(otherSession.getRevealedCount()).toBe(0);
  });
});

describe("formatApplicationDate", () => {
  it("uses Europe/Berlin calendar semantics", () => {
    expect(formatApplicationDate("2026-03-29")).toBe("29.03.2026");
    expect(formatApplicationDate("2026-10-25")).toBe("25.10.2026");
  });
});
