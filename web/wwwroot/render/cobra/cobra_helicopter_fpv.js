/**
 * Classical attack-helicopter flight-path cues for the Cobra combiner.
 *
 * Cruise FPV is blanked below COBRA_FPV_CRUISE_KT (helo HMD spirit from DTIC ADA303212);
 * hover uses a screen-fixed plan-view velocity stub. Pure functions so contracts can pin
 * thresholds without spinning up hud.js canvas state.
 */

export const COBRA_FPV_CRUISE_KT = 40;
/** Full-scale hover stub length maps to this groundspeed (Apache hover ~6 KT spirit, eased up for screen). */
export const COBRA_HOVER_FULL_SCALE_KT = 12;
export const COBRA_HOVER_STUB_MAX_PX = 54;

/**
 * @param {number|undefined} groundSpeedKt
 * @returns {"cruise"|"hover"}
 */
export function cobraFpvMode(groundSpeedKt) {
  const gs = Number(groundSpeedKt);
  if (!Number.isFinite(gs) || gs < COBRA_FPV_CRUISE_KT) return "hover";
  return "cruise";
}

/**
 * Same severity gates as cobra_rotorcraft_hud.js — FPV tint must not invent a second doctrine.
 * @returns {"normal"|"caution"|"warning"}
 */
export function cobraFpvLevel(rotorcraft) {
  const rotor = rotorcraft ?? {};
  const vrs = Number(rotor.vortex_ring_severity) || 0;
  const rbs = Number(rotor.retreating_blade_stall_severity) || 0;
  if (vrs >= 0.35 || rbs >= 0.6) return "warning";
  if (vrs >= 0.2 || rbs >= 0.35) return "caution";
  return "normal";
}

/**
 * Horizontal ground-track stub in screen pixels (plan view: +x east on screen right-ish,
 * +north screen up). Caller supplies body-relative or world EN ground components in knots.
 *
 * @returns {{ dx: number, dy: number, lengthPx: number }}
 */
export function cobraHoverStubPixels(eastKt, northKt, {
  fullScaleKt = COBRA_HOVER_FULL_SCALE_KT,
  maxPx = COBRA_HOVER_STUB_MAX_PX,
} = {}) {
  const east = Number(eastKt) || 0;
  const north = Number(northKt) || 0;
  const speed = Math.hypot(east, north);
  if (!(speed > 0.05)) return { dx: 0, dy: 0, lengthPx: 0 };
  const lengthPx = Math.min(maxPx, (speed / fullScaleKt) * maxPx);
  const scale = lengthPx / speed;
  // Screen: +x right, +y down — north is up on the combiner, so negate north for dy.
  return { dx: east * scale, dy: -north * scale, lengthPx };
}

/**
 * One-pole EMA of groundspeed rate (kt/s). Positive = accelerating along track.
 */
export function updateGroundspeedAccelEma(previousEma, previousSpeedMps, speedMps, dtSeconds, {
  tauSeconds = 0.35,
} = {}) {
  const speed = Number(speedMps);
  const prev = Number(previousSpeedMps);
  const dt = Number(dtSeconds);
  if (!Number.isFinite(speed) || !Number.isFinite(prev) || !(dt > 1e-4)) {
    return {
      emaKtPerSec: Number.isFinite(previousEma) ? previousEma : 0,
      speedMps: Number.isFinite(speed) ? speed : prev,
    };
  }
  const rateKtPerSec = ((speed - prev) / dt) * (3600 / 1852);
  const alpha = 1 - Math.exp(-dt / tauSeconds);
  const prior = Number.isFinite(previousEma) ? previousEma : 0;
  return {
    emaKtPerSec: prior + (rateKtPerSec - prior) * alpha,
    speedMps: speed,
  };
}

/** Caret length in px from EMA kt/s; clamped so it stays a cue, not a second stick. */
export function cobraAccelCaretPx(emaKtPerSec, { fullScaleKtPerSec = 4, maxPx = 18 } = {}) {
  const rate = Number(emaKtPerSec) || 0;
  if (Math.abs(rate) < 0.15) return 0;
  const signed = Math.sign(rate) * Math.min(maxPx, (Math.abs(rate) / fullScaleKtPerSec) * maxPx);
  return signed;
}
