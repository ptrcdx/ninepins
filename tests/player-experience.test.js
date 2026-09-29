import { describe, expect, it } from "vitest";

import {
  resolveBallCrownOffset,
  resolvePlayerDisplayName,
} from "../docs/player-experience.js";

describe("resolveBallCrownOffset", () => {
  it("places the crown on the initial camera-facing 30-degree normal", () => {
    const radius = 0.33;
    const [x, y, z] = resolveBallCrownOffset(radius);

    expect(x).toBe(0);
    expect(y).toBeCloseTo((radius + 0.006) * 0.5, 6);
    expect(z).toBeCloseTo((radius + 0.006) * Math.sqrt(3) / 2, 6);
    expect(y).toBeGreaterThan(0);
  });
});

describe("resolvePlayerDisplayName", () => {
  it("does not trust unsigned query parameters", () => {
    expect(
      resolvePlayerDisplayName(
        { playerName: "Claudia Beispiel" },
        "https://ptrcdx.github.io/ninepins/?player=Manipuliert#token",
      ),
    ).toBe("Claudia Beispiel");
  });
});
