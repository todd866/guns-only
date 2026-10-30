// Adaptive render resolution (owner, 2026-10-30: the app was "basically unplayable" on a busy M5).
// Shed pixels before frames: when the slow tail of recent frames passes the budget, render a little
// lower and let the display scale it; climb back once frames sit at the refresh rate again.
// Shared by the website and the Mac app, which runs this same build.
export const ADAPT = Object.freeze({ window: 90, slow: 19, calm: 17.8, step: .15, calmFor: 4, cooldown: 2 });

const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

export function createAdaptiveResolution({ max = 1.75, min = 1 } = {}) {
  return { ratio: max, max, min, frames: [], since: 0, calm: 0 };
}

/** Feed one frame time (ms). Returns the new pixel ratio when it should change, else null. */
export function stepAdaptiveResolution(a, ms, dt = ms / 1000) {
  if (!(ms > 0) || ms > 100) return null;   // pauses, tab switches and hitches aren't load
  a.frames.push(ms); if (a.frames.length > ADAPT.window) a.frames.shift();
  a.since += dt;
  if (a.frames.length < ADAPT.window || a.since < ADAPT.cooldown) return null;
  const p90 = quantile(a.frames, .9);
  a.calm = p90 <= ADAPT.calm ? a.calm + dt : 0;
  let next = a.ratio;
  if (p90 > ADAPT.slow && a.ratio > a.min) next = Math.max(a.min, a.ratio - ADAPT.step);
  else if (a.calm >= ADAPT.calmFor && a.ratio < a.max) next = Math.min(a.max, a.ratio + ADAPT.step);
  if (next === a.ratio) return null;
  a.ratio = +next.toFixed(3); a.since = 0; a.calm = 0; a.frames = [];
  return a.ratio;
}
