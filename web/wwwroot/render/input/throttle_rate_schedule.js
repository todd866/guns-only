/**
 * Mirrors sim/ThrottleInputSchedule.cs — relative throttle hold rate for browser integrators.
 * Physical lever→thrust stays linear; only relative inputs (virtual-stick rate) use this.
 * Absolute HOTAS/lever SetAnalogThrottleControl remains 1:1.
 */

export const COARSE_HOLD_RATE_PER_SECOND = 0.70;
export const FINE_HOLD_RATE_PER_SECOND = 0.16;
export const FINE_CAS_KTS = 180;
export const COARSE_CAS_KTS = 300;
export const FINE_LEVER_CEILING = 0.20;
export const COARSE_LEVER_FLOOR = 0.35;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0, edge1, x) {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 1 = full fine, 0 = full coarse. */
export function fineBlend(indicatedAirspeedKts, physicalLever) {
  const ias = Number(indicatedAirspeedKts);
  const lever = Number(physicalLever);
  if (!Number.isFinite(ias) || !Number.isFinite(lever)) return 0;
  const speedFine = 1 - smoothstep(FINE_CAS_KTS, COARSE_CAS_KTS, Math.max(0, ias));
  const leverFine = 1 - smoothstep(FINE_LEVER_CEILING, COARSE_LEVER_FLOOR, Math.max(0, lever));
  return clamp(Math.min(speedFine, leverFine), 0, 1);
}

/** Physical PLA units per second at full relative deflection. */
export function relativeThrottleHoldRatePerSecond(indicatedAirspeedKts, physicalLever) {
  const fine = fineBlend(indicatedAirspeedKts, physicalLever);
  return COARSE_HOLD_RATE_PER_SECOND
    + (FINE_HOLD_RATE_PER_SECOND - COARSE_HOLD_RATE_PER_SECOND) * fine;
}

/**
 * UI-normalised (0..1 of lever stop) hold rate for the virtual-stick integrator.
 * physicalThrottle and maxThrustFraction come from the published snapshot.
 *
 * Dividing by the lever stop makes the physical PLA rate finer than the keyboard's
 * on afterburning airframes (F-22 fine: 0.16/1.35 ≈ 0.12 PLA/s vs the keyboard's
 * 0.16). Intentional: a thumb stick has far less travel than a held key, so it
 * needs the extra resolution to make the same correction.
 */
export function relativeThrottleUiHoldRatePerSecond(
  indicatedAirspeedKts,
  physicalThrottle,
  maxThrustFraction,
) {
  const stop = Number(maxThrustFraction);
  const leverStop = Number.isFinite(stop) && stop > 0 ? stop : 1;
  const physical = Number(physicalThrottle);
  const lever = Number.isFinite(physical) ? physical : 0;
  return relativeThrottleHoldRatePerSecond(indicatedAirspeedKts, lever) / leverStop;
}
