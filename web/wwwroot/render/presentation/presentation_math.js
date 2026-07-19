export const DEG_TO_RAD = Math.PI / 180;

export function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function moveTowards(current, target, maximumDelta) {
  if (current < target) return Math.min(target, current + maximumDelta);
  if (current > target) return Math.max(target, current - maximumDelta);
  return target;
}

/**
 * Exact critical-damping step for a target that is constant over this sample.
 *
 * `channel` is intentionally mutable presentation state ({ value, velocity }). It is never a
 * simulation snapshot. The closed-form step is stable after a suspended tab and avoids an
 * integration-rate-dependent spring explosion.
 */
export function stepCriticalSpring(channel, target, deltaSeconds, frequencyHz) {
  const dt = clamp(finite(deltaSeconds), 0, 0.1);
  if (dt === 0) return channel.value;
  const omega = Math.max(0.001, finite(frequencyHz, 1)) * Math.PI * 2;
  const offset = channel.value - target;
  const impulse = (channel.velocity + omega * offset) * dt;
  const decay = Math.exp(-omega * dt);
  channel.value = target + (offset + impulse) * decay;
  channel.velocity = (channel.velocity - omega * impulse) * decay;
  return channel.value;
}

export function component(vector, key, fallback = 0) {
  if (Array.isArray(vector)) {
    const index = key === "x" ? 0 : key === "y" ? 1 : 2;
    return finite(vector[index], fallback);
  }
  return finite(vector?.[key], fallback);
}

export function dot(a, b) {
  return component(a, "x") * component(b, "x")
    + component(a, "y") * component(b, "y")
    + component(a, "z") * component(b, "z");
}

export function subtract(a, b) {
  return {
    x: component(a, "x") - component(b, "x"),
    y: component(a, "y") - component(b, "y"),
    z: component(a, "z") - component(b, "z"),
  };
}

export function addScaled(origin, direction, scale) {
  return {
    x: component(origin, "x") + component(direction, "x") * scale,
    y: component(origin, "y") + component(direction, "y") * scale,
    z: component(origin, "z") + component(direction, "z") * scale,
  };
}

export function normalized(vector) {
  const x = component(vector, "x");
  const y = component(vector, "y");
  const z = component(vector, "z");
  const length = Math.hypot(x, y, z);
  return length > 1e-12
    ? { x: x / length, y: y / length, z: z / length }
    : { x: 0, y: 0, z: 0 };
}
