function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new RangeError(`${label} must be positive`);
  return number;
}

function exactBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
  return value;
}

function targetId(value) {
  if (value === null) return null;
  if (typeof value === "string" && value.length > 0) return value;
  if (Number.isSafeInteger(value) && value > 0) return value;
  throw new TypeError("selectedTargetId must be null, a non-empty string, or a positive integer");
}

/**
 * Route the existing Guns Only interaction scheme through the Cobra's two-seat crew contract.
 *
 * The player remains the rear-seat pilot: the pointer is always pilot look, Tab changes the
 * simulation-owned selected target, and V controls the ordinary padlock camera outside this pure
 * seam. In the Cobra the normal held fire action is an engagement/cease-fire request to the
 * front-seat AI copilot/gunner. It never writes turret angles, invents a target, bypasses a firing
 * solution, or directly emits a weapon trigger.
 */
export function cobraCrewInputIntent({
  deltaX = 0,
  deltaY = 0,
  yawRadiansPerPixel,
  pitchRadiansPerPixel,
  invertY = false,
  selectedTargetId = null,
  padlockActive = false,
  engageHeld = false,
} = {}) {
  const x = finite(deltaX, "deltaX");
  const y = finite(deltaY, "deltaY");
  const yawScale = positive(yawRadiansPerPixel, "yawRadiansPerPixel");
  const pitchScale = positive(pitchRadiansPerPixel, "pitchRadiansPerPixel");
  const inverted = exactBoolean(invertY, "invertY");
  const selected = targetId(selectedTargetId);
  const padlocked = exactBoolean(padlockActive, "padlockActive");
  const engagementConsent = exactBoolean(engageHeld, "engageHeld");

  return Object.freeze({
    crew: Object.freeze({
      playerSeat: "rear-pilot",
      aiSeat: "front-copilot-gunner",
    }),
    pilot: Object.freeze({
      look: Object.freeze({
        yawDeltaRad: x * yawScale,
        pitchDeltaRad: y * pitchScale * (inverted ? 1 : -1),
      }),
      selectedTargetId: selected,
      padlockActive: padlocked,
    }),
    aiGunner: Object.freeze({
      assignedTargetId: selected,
      engagementConsent,
      mayAttemptEngagement: engagementConsent && selected !== null,
    }),
  });
}
