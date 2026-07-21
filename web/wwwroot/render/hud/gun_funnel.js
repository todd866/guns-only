const DEFAULT_MUZZLE_VELOCITY_MPS = 870;
const DEFAULT_MAX_FLIGHT_SECONDS = 1.75;
const DEFAULT_TARGET_WINGSPAN_M = 11.3;

function positive(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function gunFunnelProfile(state = {}) {
  return {
    muzzleVelocityMps: positive(
      state.gun_muzzle_velocity_mps,
      DEFAULT_MUZZLE_VELOCITY_MPS,
    ),
    maximumFlightSeconds: positive(
      state.gun_max_flight_s,
      DEFAULT_MAX_FLIGHT_SECONDS,
    ),
    targetWingspanM: positive(
      state.target_wingspan_m,
      DEFAULT_TARGET_WINGSPAN_M,
    ),
  };
}

// The vertical axis is a time-of-flight/range scale; separation is the target's angular
// wingspan at that range. The simulation's projected lead pipper remains the ballistic impact
// solution, so the funnel never becomes a second, contradictory firing computation.
export function gunFunnelSamples({
  muzzleVelocityMps,
  maximumFlightSeconds,
  targetWingspanM,
  focalLengthPx,
  sampleCount = 9,
} = {}) {
  const velocity = positive(muzzleVelocityMps, DEFAULT_MUZZLE_VELOCITY_MPS);
  const lifetime = positive(maximumFlightSeconds, DEFAULT_MAX_FLIGHT_SECONDS);
  const wingspan = positive(targetWingspanM, DEFAULT_TARGET_WINGSPAN_M);
  const focal = positive(focalLengthPx, 500);
  const count = Math.max(3, Math.round(Number(sampleCount) || 9));
  const nearRangeM = Math.min(220, velocity * lifetime * 0.22);
  const farRangeM = Math.max(
    nearRangeM + 240,
    Math.min(1200, velocity * lifetime * 0.78),
  );

  return Array.from({ length: count }, (_, index) => {
    const fraction = index / (count - 1);
    const rangeM = nearRangeM + (farRangeM - nearRangeM) * fraction;
    return {
      rangeM,
      timeOfFlightSeconds: rangeM / velocity,
      yPx: 18 + fraction * 88,
      halfWidthPx: Math.max(2.5, focal * (wingspan * 0.5) / rangeM),
    };
  });
}
