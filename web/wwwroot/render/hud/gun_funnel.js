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

// Drawable funnel geometry from the PROJECTED ballistic trajectory. `points` are screen-space
// samples of the kernel's gun_trajectory (bullets-in-the-air locus) ordered near -> far:
// {x, y, rangeM}. The usable envelope [nearRangeM, farRangeM] is cut out of the projected
// polyline with exact interpolated endpoints, and each kept point carries the FIXED wingspan
// ranging scale (halfWidthPx = focal * span/2 / range — calibrated, independent of how big the
// target happens to look) plus the local unit perpendicular to the projected path, which is the
// direction the two rails are offset. Pure geometry: the HUD owns cameras, canvas and colors.
export function gunFunnelRail(points, {
  targetWingspanM,
  focalLengthPx,
  nearRangeM,
  farRangeM,
} = {}) {
  const wingspan = positive(targetWingspanM, DEFAULT_TARGET_WINGSPAN_M);
  const focal = positive(focalLengthPx, 500);
  const near = positive(nearRangeM, MIN_TRACKING_RANGE_M);
  const far = positive(farRangeM, EFFECTIVE_CEILING_M);
  const path = (Array.isArray(points) ? points : []).filter((point) => point
    && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Number.isFinite(point.rangeM) && point.rangeM > 0);
  if (path.length < 2 || far <= near) return [];

  const lerp = (a, b, f) => ({
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    rangeM: a.rangeM + (b.rangeM - a.rangeM) * f,
  });
  const clipped = [];
  for (let i = 0; i < path.length; i++) {
    const sample = path[i];
    const previous = path[i - 1];
    if (previous) {
      for (const boundary of [near, far]) {
        if ((previous.rangeM < boundary) !== (sample.rangeM < boundary)) {
          const f = (boundary - previous.rangeM) / (sample.rangeM - previous.rangeM);
          if (f > 0 && f < 1) clipped.push(lerp(previous, sample, f));
        }
      }
    }
    if (sample.rangeM >= near && sample.rangeM <= far) clipped.push(sample);
  }
  clipped.sort((a, b) => a.rangeM - b.rangeM);
  if (clipped.length < 2) return [];

  return clipped.map((sample, index) => {
    const ahead = clipped[Math.min(index + 1, clipped.length - 1)];
    const behind = clipped[Math.max(index - 1, 0)];
    const dx = ahead.x - behind.x;
    const dy = ahead.y - behind.y;
    const length = Math.hypot(dx, dy);
    // A path flown wings-level projects almost end-on (the eye is at the gun): fall back to a
    // vertical path direction so the rails stay horizontal instead of collapsing.
    const perpX = length > 1e-6 ? -dy / length : 1;
    const perpY = length > 1e-6 ? dx / length : 0;
    return {
      x: sample.x,
      y: sample.y,
      rangeM: sample.rangeM,
      halfWidthPx: Math.max(MIN_HALF_WIDTH_PX, focal * (wingspan * 0.5) / sample.rangeM),
      perpX,
      perpY,
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
