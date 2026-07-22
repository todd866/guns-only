function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function axisCode(value, previous, negativeCode, positiveCode, engage, release) {
  if (previous === negativeCode && value < -release) return negativeCode;
  if (previous === positiveCode && value > release) return positiveCode;
  if (value <= -engage) return negativeCode;
  if (value >= engage) return positiveCode;
  return null;
}

/**
 * Project a pointer onto a circular phone thumb-stick and resolve its fallback key directions.
 *
 * The vector is continuous for the visual puck and analog roll bridge. Direction codes retain a
 * small hysteresis band for the pitch key fallback so a resting thumb cannot chatter controls.
 */
export function mobileVirtualStickState(point, bounds, previous = {}, {
  deadzone = 0.12,
  engage = 0.28,
  release = 0.16,
} = {}) {
  const left = finite(bounds?.left);
  const top = finite(bounds?.top);
  const width = Math.max(0, finite(bounds?.width,
    finite(bounds?.right) - left));
  const height = Math.max(0, finite(bounds?.height,
    finite(bounds?.bottom) - top));
  const radius = Math.min(width, height) / 2;
  if (radius <= 0) {
    return Object.freeze({ x: 0, y: 0, rollCode: null, pitchCode: null });
  }

  let x = (finite(point?.clientX, left + width / 2) - (left + width / 2)) / radius;
  let y = (finite(point?.clientY, top + height / 2) - (top + height / 2)) / radius;
  let magnitude = Math.hypot(x, y);
  if (magnitude > 1) {
    x /= magnitude;
    y /= magnitude;
    magnitude = 1;
  }
  const deadzoneAt = clamp(finite(deadzone, 0.12), 0, 0.45);
  if (magnitude <= deadzoneAt) {
    x = 0;
    y = 0;
  } else {
    const remappedMagnitude = (magnitude - deadzoneAt) / (1 - deadzoneAt);
    const scale = remappedMagnitude / magnitude;
    x *= scale;
    y *= scale;
  }

  const engageAt = clamp(finite(engage, 0.28), 0.05, 0.95);
  const releaseAt = clamp(finite(release, 0.16), 0.01, engageAt);
  return Object.freeze({
    x,
    y,
    rollCode: axisCode(x, previous.rollCode, "ArrowLeft", "ArrowRight",
      engageAt, releaseAt),
    pitchCode: axisCode(y, previous.pitchCode, "ArrowUp", "ArrowDown",
      engageAt, releaseAt),
  });
}
