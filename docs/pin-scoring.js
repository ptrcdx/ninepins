/**
 * Tracks fallen pins for one nine-pin throw.
 *
 * A pin is considered fallen after its local up axis has been tilted by at
 * least 45 degrees for a short, continuous confirmation interval. Once a pin
 * has been counted as fallen, it remains counted for the rest of the throw.
 *
 * This module intentionally contains no date-draw or persistence logic.
 */
export class PinScoringTracker {
  /**
   * @param {number} pinCount Number of pins in the game.
   * @param {{tiltThresholdDegrees?:number, confirmationSeconds?:number}} [options]
   */
  constructor(pinCount, options = {}) {
    if (!Number.isInteger(pinCount) || pinCount <= 0) {
      throw new RangeError('pinCount must be a positive integer.');
    }

    const tiltThresholdDegrees = options.tiltThresholdDegrees ?? 45;
    const confirmationSeconds = options.confirmationSeconds ?? 0.10;

    if (!Number.isFinite(tiltThresholdDegrees) || tiltThresholdDegrees <= 0 || tiltThresholdDegrees >= 90) {
      throw new RangeError('tiltThresholdDegrees must be between 0 and 90.');
    }
    if (!Number.isFinite(confirmationSeconds) || confirmationSeconds <= 0) {
      throw new RangeError('confirmationSeconds must be positive.');
    }

    this.pinCount = pinCount;
    this.minimumUpAxisY = Math.cos(tiltThresholdDegrees * Math.PI / 180);
    this.confirmationSeconds = confirmationSeconds;
    this.candidateSeconds = new Map();
    this.fallenPins = new Set();
  }

  /** Clear all state before a new throw. */
  reset() {
    this.candidateSeconds.clear();
    this.fallenPins.clear();
  }

  /**
   * Observe a pin pose for one fixed simulation step.
   *
   * @param {number} pinNumber One-based pin number.
   * @param {{x:number,z:number}} quaternion Cannon-compatible quaternion.
   * @param {number} deltaSeconds Positive fixed-step duration.
   */
  observe(pinNumber, quaternion, deltaSeconds) {
    this.validatePinNumber(pinNumber);
    if (!quaternion || !Number.isFinite(quaternion.x) || !Number.isFinite(quaternion.z)) {
      throw new TypeError('quaternion must provide finite x and z components.');
    }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new RangeError('deltaSeconds must be positive.');
    }
    if (this.fallenPins.has(pinNumber)) return;

    const upAxisY = 1 - 2 * (quaternion.x * quaternion.x + quaternion.z * quaternion.z);
    if (upAxisY <= this.minimumUpAxisY) {
      const duration = (this.candidateSeconds.get(pinNumber) ?? 0) + deltaSeconds;
      this.candidateSeconds.set(pinNumber, duration);
      if (duration + Number.EPSILON >= this.confirmationSeconds) {
        this.fallenPins.add(pinNumber);
        this.candidateSeconds.delete(pinNumber);
      }
      return;
    }

    this.candidateSeconds.delete(pinNumber);
  }

  /** @returns {number} Number of fallen pins. */
  getScore() {
    return this.fallenPins.size;
  }

  /** @returns {number[]} Sorted one-based pin numbers counted as fallen. */
  getFallenPinNumbers() {
    return [...this.fallenPins].sort((left, right) => left - right);
  }

  /**
   * @param {number} pinNumber One-based pin number.
   * @returns {boolean} Whether the pin has already been counted as fallen.
   */
  isFallen(pinNumber) {
    this.validatePinNumber(pinNumber);
    return this.fallenPins.has(pinNumber);
  }

  /**
   * @param {number} pinNumber One-based pin number.
   * @private
   */
  validatePinNumber(pinNumber) {
    if (!Number.isInteger(pinNumber) || pinNumber < 1 || pinNumber > this.pinCount) {
      throw new RangeError(`pinNumber must be between 1 and ${this.pinCount}.`);
    }
  }
}
