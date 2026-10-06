import { describe, expect, it } from 'vitest';
import { PinScoringTracker } from '../docs/pin-scoring.js';

/**
 * Create a quaternion for a pure X-axis rotation.
 *
 * @param {number} degrees Rotation angle in degrees.
 * @returns {{x:number,z:number}} Quaternion components used by the tracker.
 */
function rotationAroundX(degrees) {
  const halfRadians = degrees * Math.PI / 360;
  return { x: Math.sin(halfRadians), z: 0 };
}

describe('PinScoringTracker', () => {
  it('keeps upright pins standing', () => {
    const tracker = new PinScoringTracker(9);

    tracker.observe(1, rotationAroundX(0), 0.20);

    expect(tracker.getScore()).toBe(0);
    expect(tracker.getFallenPinNumbers()).toEqual([]);
  });

  it('requires the tilt to persist for the confirmation interval', () => {
    const tracker = new PinScoringTracker(9);

    tracker.observe(3, rotationAroundX(55), 0.05);
    tracker.observe(3, rotationAroundX(0), 0.02);
    tracker.observe(3, rotationAroundX(55), 0.05);

    expect(tracker.getScore()).toBe(0);
  });

  it('counts a pin after a sustained tilt of at least 45 degrees', () => {
    const tracker = new PinScoringTracker(9);

    tracker.observe(5, rotationAroundX(50), 0.05);
    tracker.observe(5, rotationAroundX(50), 0.05);

    expect(tracker.getScore()).toBe(1);
    expect(tracker.getFallenPinNumbers()).toEqual([5]);
  });

  it('does not remove a pin from the score if it later moves upright again', () => {
    const tracker = new PinScoringTracker(9);

    tracker.observe(7, rotationAroundX(70), 0.10);
    tracker.observe(7, rotationAroundX(0), 0.20);

    expect(tracker.isFallen(7)).toBe(true);
    expect(tracker.getScore()).toBe(1);
  });

  it('resets cleanly for the next throw', () => {
    const tracker = new PinScoringTracker(9);

    tracker.observe(2, rotationAroundX(60), 0.10);
    tracker.observe(9, rotationAroundX(60), 0.10);
    tracker.reset();

    expect(tracker.getScore()).toBe(0);
    expect(tracker.getFallenPinNumbers()).toEqual([]);
  });
});
