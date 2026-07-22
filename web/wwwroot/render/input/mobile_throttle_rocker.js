function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function directionCode(power, previous, engage, release) {
  if (previous === "KeyW" && power > release) return "KeyW";
  if (previous === "KeyS" && power < -release) return "KeyS";
  if (power >= engage) return "KeyW";
  if (power <= -engage) return "KeyS";
  return null;
}

/**
 * Project a pointer onto the spring-loaded phone throttle rocker.
 *
 * Positive power is toward the upper end of the control. The continuous value only positions the
 * visual puck; the simulation continues to receive its existing held W/S grammar so releasing the
 * rocker stops changing the persistent throttle lever instead of resetting it.
 */
export function mobileThrottleRockerState(point, bounds, previous = {}, {
  deadzone = 0.12,
  engage = 0.28,
  release = 0.16,
} = {}) {
  const top = finite(bounds?.top);
  const height = Math.max(0, finite(bounds?.height,
    finite(bounds?.bottom) - top));
  if (height <= 0) return Object.freeze({ power: 0, code: null });

  const centreY = top + height / 2;
  let power = clamp((centreY - finite(point?.clientY, centreY)) / (height / 2), -1, 1);
  const deadzoneAt = clamp(finite(deadzone, 0.12), 0, 0.45);
  const magnitude = Math.abs(power);
  if (magnitude <= deadzoneAt) {
    power = 0;
  } else {
    power = Math.sign(power) * (magnitude - deadzoneAt) / (1 - deadzoneAt);
  }

  const engageAt = clamp(finite(engage, 0.28), 0.05, 0.95);
  const releaseAt = clamp(finite(release, 0.16), 0.01, engageAt);
  return Object.freeze({
    power,
    code: directionCode(power, previous.code, engageAt, releaseAt),
  });
}
