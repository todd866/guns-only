// The phone fighter's throttle: one persistent vertical lever under the left thumb.
//
// It replaces the spring-centred THR/YAW stick for combat. A lever has a position, so it is drawn
// at the aircraft's current power and stays there: touching it picks up that value (the first
// contact is never a power change), dragging moves it relative to where the thumb landed, and
// letting go leaves it set. That is how a real quadrant behaves and it is what the kernel's
// SetAnalogThrottleControl already expects (an absolute 0..1 lever of the aircraft's own range).

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Thumb travel before a touch counts as a drag. Below this a tap leaves the lever untouched. */
export const THROTTLE_LEVER_PICKUP_SLOP_PX = 3;

/**
 * The aircraft-relative lever (0..1) the snapshot is currently commanding. Prefer the requested
 * lever over the spooling engine value so a fresh touch picks up what was SET, not what the
 * engine has reached yet.
 */
export function publishedThrottleLever(state = {}) {
  const stop = finite(state?.max_thrust_fraction);
  const physical = finite(state?.requested_throttle) ?? finite(state?.throttle);
  if (physical === null) return null;
  if (stop === null || stop <= 0) return clamp(physical, 0, 1);
  return clamp(physical / stop, 0, 1);
}

/** Lever fraction of the military (non-afterburning) stop, or null on an aircraft without one. */
export function militaryStopFraction(maxThrustFraction) {
  const stop = finite(maxThrustFraction);
  if (stop === null || stop <= 1.0001) return null;
  return clamp(1 / stop, 0, 1);
}

/** Anchor a new touch at the lever's current value. */
export function pickUpThrottleLever(clientY, currentLever) {
  return Object.freeze({
    startY: finite(clientY) ?? 0,
    startLever: clamp(finite(currentLever) ?? 0, 0, 1),
    moved: false,
  });
}

/**
 * Lever value for a thumb at clientY, relative to the pickup anchor. Up is more power. The full
 * travel of the slot maps to the full lever range, so the knob stays under the thumb.
 */
export function dragThrottleLever(anchor, clientY, travelPx) {
  if (!anchor) return null;
  const travel = Math.max(1, finite(travelPx) ?? 1);
  const delta = anchor.startY - (finite(clientY) ?? anchor.startY);
  const moved = anchor.moved || Math.abs(delta) >= THROTTLE_LEVER_PICKUP_SLOP_PX;
  const lever = moved ? clamp(anchor.startLever + delta / travel, 0, 1) : anchor.startLever;
  return Object.freeze({ lever, moved });
}

/** Knob offset from the bottom of its travel, in px. */
export function throttleLeverKnobOffset(lever, travelPx) {
  return clamp(finite(lever) ?? 0, 0, 1) * Math.max(0, finite(travelPx) ?? 0);
}

/**
 * Short visible datum for the knob plus the spoken value. Percent of MIL below the stop, "MIL" at
 * it and "AB" past it; aircraft without reheat read plain percent.
 */
export function throttleLeverReadout(lever, maxThrustFraction) {
  const value = clamp(finite(lever) ?? 0, 0, 1);
  const mil = militaryStopFraction(maxThrustFraction);
  if (mil === null) {
    const percent = Math.round(value * 100);
    return Object.freeze({ text: String(percent), spoken: `${percent} percent` });
  }
  if (value > mil + 0.012) {
    const reheat = Math.round(((value - mil) / Math.max(1e-6, 1 - mil)) * 100);
    return Object.freeze({ text: "AB", spoken: `Afterburner ${reheat} percent` });
  }
  if (value >= mil - 0.012) return Object.freeze({ text: "MIL", spoken: "Military power" });
  const percent = Math.round((value / mil) * 100);
  return Object.freeze({ text: String(percent), spoken: `${percent} percent of military power` });
}
