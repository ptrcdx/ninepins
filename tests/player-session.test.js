import { describe, expect, it } from "vitest";

import { PlayerDrawSession, formatApplicationDate } from "../docs/player-session.js";

const VERIFIED_DRAW = Object.freeze({
  drawId: "a4499ca4-0c37-4ddd-b1c9-1a414853465f",
  dates: Object.freeze(["2026-10-25", "2027-01-08", "2027-06-19"]),
});

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
});

describe("formatApplicationDate", () => {
  it("uses Europe/Berlin calendar semantics", () => {
    expect(formatApplicationDate("2026-03-29")).toBe("29.03.2026");
    expect(formatApplicationDate("2026-10-25")).toBe("25.10.2026");
  });
});
