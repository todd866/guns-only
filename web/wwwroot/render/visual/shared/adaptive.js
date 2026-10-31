// Shared adaptive-resolution policy as a pure state machine. Imports nothing.
// Behaviour-identical to rc/adaptive-resolution.mjs when given the same numbers (see tests); the
// frame-time statistic is configurable because RC judges the 75th percentile to ignore WebKit
// pacing tails (commit d7117eca), where other hosts may want the median or the mean.
// The flight game's EMA controller (../adaptive_resolution.js) is a different, scale-based design and is untouched.

export const ADAPTIVE_DEFAULTS = Object.freeze({
  min: 1, max: 1.75, targetMs: 1000 / 60, percentile: 0.75, window: 90, step: 0.15,
  calmFor: 4, cooldown: 2, maxFrameMs: 100,
  slowMs: null, calmMs: null,   // null: derived from targetMs (x1.14 / x1.068, i.e. 19 / 17.8 ms at 60 Hz)
});

export const quantile = (values, q) => {
  const s = [...values].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};

export function createAdaptivePolicy(options = {}) {
  const o = { ...ADAPTIVE_DEFAULTS, ...options };
  if (!(o.percentile >= 0 && o.percentile <= 1)) throw new RangeError('percentile must be within 0..1');
  if (!(o.min > 0 && o.max >= o.min)) throw new RangeError('need 0 < min <= max');
  o.slowMs ??= +(o.targetMs * 1.14).toFixed(3); o.calmMs ??= +(o.targetMs * 1.068).toFixed(3);
  return { ...o, ratio: o.max, frames: [], since: 0, calm: 0 };
}

/**
 * Feed one frame time (ms). Returns the new pixel ratio when it should change, else null
 * (policy.ratio always holds the current value). dtSec defaults to frameMs / 1000.
 */
export function step(policy, frameMs, dtSec = frameMs / 1000) {
  const a = policy;
  if (!(frameMs > 0) || frameMs > a.maxFrameMs) return null;   // pauses, tab switches and hitches aren't load
  a.frames.push(frameMs); if (a.frames.length > a.window) a.frames.shift();
  a.since += dtSec;
  if (a.frames.length < a.window || a.since < a.cooldown) return null;
  const stat = quantile(a.frames, a.percentile);
  a.calm = stat <= a.calmMs ? a.calm + dtSec : 0;
  let next = a.ratio;
  if (stat > a.slowMs && a.ratio > a.min) next = Math.max(a.min, a.ratio - a.step);
  else if (a.calm >= a.calmFor && a.ratio < a.max) next = Math.min(a.max, a.ratio + a.step);
  if (next === a.ratio) return null;
  a.ratio = +next.toFixed(3); a.since = 0; a.calm = 0; a.frames = [];
  return a.ratio;
}
