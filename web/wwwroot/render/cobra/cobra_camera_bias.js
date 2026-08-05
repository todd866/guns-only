/**
 * Rear-seat camera target cueing, bounded. The pilot camera may lean toward the gunner's
 * selected target for cueing, but the AH-1G's only clear glass is dead ahead — an unbounded
 * Cartesian lerp toward a near target used to swing the view right off the windshield axis.
 * Angles use the scene frame: x east, y up, z −north; yaw 0 looks toward −z.
 */

export const COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD = 0.05;

function wrapPi(angleRad) {
  return Math.atan2(Math.sin(angleRad), Math.cos(angleRad));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lookAnglesFromOffset(x, y, z) {
  return {
    yawRad: Math.atan2(x, -z),
    pitchRad: Math.atan2(y, Math.hypot(x, z)),
  };
}

export function lookOffsetFromAngles(yawRad, pitchRad, distanceM) {
  const horizontal = Math.cos(pitchRad) * distanceM;
  return {
    x: Math.sin(yawRad) * horizontal,
    y: Math.sin(pitchRad) * distanceM,
    z: -Math.cos(yawRad) * horizontal,
  };
}

/**
 * Rotate from `base` toward `desired` by at most ±limitRad on each axis. Yaw is wrap-aware, so
 * a cue across ±π still takes the short way and still respects the cap.
 */
export function clampInducedLookRotation(
  base,
  desired,
  limitRad = COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD,
) {
  const yawDelta = clamp(wrapPi(desired.yawRad - base.yawRad), -limitRad, limitRad);
  const pitchDelta = clamp(desired.pitchRad - base.pitchRad, -limitRad, limitRad);
  return {
    yawRad: wrapPi(base.yawRad + yawDelta),
    pitchRad: base.pitchRad + pitchDelta,
  };
}
