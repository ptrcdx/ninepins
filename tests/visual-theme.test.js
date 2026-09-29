import { describe, expect, it } from "vitest";

import { resolvePremiumCameraProfile } from "../docs/visual-theme.js";

describe("resolvePremiumCameraProfile", () => {
  it("uses the premium desktop landscape framing", () => {
    expect(resolvePremiumCameraProfile(1920, 1080)).toEqual({
      fov: 42,
      position: [0, 5.15, 11.35],
      target: [0, 0.44, -6.45],
    });
  });

  it("keeps compact landscape browser chrome in view", () => {
    expect(resolvePremiumCameraProfile(844, 390)).toEqual({
      fov: 43,
      position: [0, 5.05, 11.55],
      target: [0, 0.42, -6.55],
    });
  });

  it("uses a wider portrait framing on mobile", () => {
    expect(resolvePremiumCameraProfile(390, 844)).toEqual({
      fov: 52,
      position: [0, 5.35, 10.9],
      target: [0, 0.36, -6.25],
    });
  });
});
