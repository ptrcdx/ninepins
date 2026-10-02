import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = resolve(TEST_DIRECTORY, "..", "docs", "index.html");

/**
 * Reads the production game source that contains the inline rigid-body model.
 *
 * @returns {string} Current production HTML and simulation source.
 */
function readProductionSource() {
  return readFileSync(INDEX_PATH, "utf8");
}

describe("physical bowling model", () => {
  it("uses scale-correct gravity and a 120 Hz fixed timestep", () => {
    const source = readProductionSource();

    expect(source).toContain("gravityY: -9.81 * MODEL_UNITS_PER_METRE");
    expect(source).toContain("fixedStep: 1 / 120");
    expect(source).toContain("maxSubsteps: 5");
    expect(source).toContain("this.world.solver.iterations = 12");
    expect(source).toContain(
      "new cannon.World({ gravity: new cannon.Vec3(0, SETTINGS.gravityY, 0) })",
    );
  });

  it("uses collision response instead of artificial forward motion or track clamps", () => {
    const source = readProductionSource();

    expect(source).not.toContain("minForwardTravelSpeed");
    expect(source).not.toContain("minPostImpactForwardTravelSpeed");
    expect(source).not.toContain("keepBallMovingToPit");
    expect(source).not.toContain("constrainBallToTrack");
    expect(source).not.toContain("settleStandingPins");
    expect(source).not.toContain("tippingInertia");
  });

  it("keeps the calibrated contact response parameters explicit", () => {
    const source = readProductionSource();

    expect(source).toContain("friction: 0.12, restitution: 0.02");
    expect(source).toContain("friction: 0.22, restitution: 0.55");
    expect(source).toContain("friction: 0.25, restitution: 0.45");
    expect(source).toContain(
      "friction: 0.48, restitution: 0.07, contactEquationStiffness: 6e6",
    );
  });

  it("does not terminate active physics from a hard timeout", () => {
    const source = readProductionSource();

    expect(source).not.toContain("hitHardTimeout");
    expect(source).not.toContain("noHitHardTimeout");
    expect(source).not.toContain("minHitResolutionAfterFirstImpact");
    expect(source).toContain("return this.quietTime >= 0.24");
  });
});
