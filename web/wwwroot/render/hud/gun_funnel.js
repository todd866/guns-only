const DEFAULT_MUZZLE_VELOCITY_MPS = 870;
const DEFAULT_MAX_FLIGHT_SECONDS = 1.75;
const DEFAULT_TARGET_WINGSPAN_M = 11.3;

// Effective gun-ranging envelope. These are real gunnery limits, not tuning knobs:
// past EFFECTIVE_TOF_S the rounds have bled too much energy to count on, and the funnel is
// never drawn beyond EFFECTIVE_CEILING_M where wingspan ranging stops being trustworthy.
const EFFECTIVE_TOF_S = 0.9;
const EFFECTIVE_CEILING_M = 900;
const MIN_TRACKING_RANGE_M = 150;
const MIN_HALF_WIDTH_PX = 2.5;
const DEFAULT_SAMPLE_COUNT = 9;

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

// The effective firing envelope in metres, derived from the real gun. Far range is how far a
// round still carries usefully (muzzle velocity across the effective flight time), capped at
// the ceiling past which wingspan ranging is unreliable. Near range is a fixed tracking floor.
export function gunFunnelEnvelope({ muzzleVelocityMps, maximumFlightSeconds } = {}) {
  const velocity = positive(muzzleVelocityMps, DEFAULT_MUZZLE_VELOCITY_MPS);
  const lifetime = positive(maximumFlightSeconds, DEFAULT_MAX_FLIGHT_SECONDS);
  const farRangeM = Math.min(
    EFFECTIVE_CEILING_M,
    velocity * Math.min(lifetime, EFFECTIVE_TOF_S),
  );
  const nearRangeM = Math.min(MIN_TRACKING_RANGE_M, farRangeM * 0.5);
  return { nearRangeM, farRangeM };
}

// The funnel rails as a range scale. Each rung is the projected apparent half-span the
// target's wingspan subtends at that range; stacked across the envelope they form the
// converging funnel (wide near, narrow far). Screen placement lives in the HUD, which centres
// these on the projected target so "wings touch the rails" reads out the range directly.
export function gunFunnelSamples({
  muzzleVelocityMps,
  maximumFlightSeconds,
  targetWingspanM,
  focalLengthPx,
  sampleCount = DEFAULT_SAMPLE_COUNT,
} = {}) {
  const wingspan = positive(targetWingspanM, DEFAULT_TARGET_WINGSPAN_M);
  const focal = positive(focalLengthPx, 500);
  const count = Math.max(3, Math.round(Number(sampleCount) || DEFAULT_SAMPLE_COUNT));
  const { nearRangeM, farRangeM } = gunFunnelEnvelope({
    muzzleVelocityMps,
    maximumFlightSeconds,
  });

  return Array.from({ length: count }, (_, index) => {
    const fraction = index / (count - 1);
    const rangeM = nearRangeM + (farRangeM - nearRangeM) * fraction;
    return {
      rangeM,
      fraction,
      halfWidthPx: Math.max(MIN_HALF_WIDTH_PX, focal * (wingspan * 0.5) / rangeM),
    };
  });
}

// Is the funnel a usable ranging cue? Requires a live target, an authoritative lead solution
// to key off (a real gunsight cages when it cannot solve), a known wingspan, and a range
// inside the effective envelope. Aspect and in-front-of-camera checks stay in the HUD, which
// owns the vector geometry.
export function gunFunnelUsable(state = {}, envelope) {
  const env = envelope || gunFunnelEnvelope(gunFunnelProfile(state));
  if (state.bandit_alive !== true) return false;
  if (state.lead_valid !== true) return false;
  if (!(positive(state.target_wingspan_m, 0) > 0)) return false;
  const range = Number(state.range_m);
  if (!Number.isFinite(range)) return false;
  return range >= env.nearRangeM && range <= env.farRangeM;
}
