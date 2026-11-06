// Dream runner state. A dream stores the toys, plays the entry ripple, swaps scenes, then
// ripples back. Drawing and the post-process live in runner.js.
import {COLD_LAB} from '../lab-accident.mjs';

export {COLD_LAB};
export const RIPPLE_S = 0.6;
export const DREAMS = Object.freeze(['platformer']);

// Temporary door on the open side of the Cold Lab hangar. The real ring belongs in the
// Dreamland lab once that interior exists.
export const COLD_LAB_RING = Object.freeze({
  dream: 'platformer',
  pos: Object.freeze([2040, 0, -600]),
  radius: 2.6
});

export function dreamFromSearch(search) {
  const name = new URLSearchParams(String(search ?? '')).get('dream');
  return DREAMS.includes(name) ? name : null;
}

const copy3 = v => [v?.[0] ?? 0, v?.[1] ?? 0, v?.[2] ?? 0];

export function createDream() {
  return {
    name: null,
    phase: 'idle',
    shown: 'world',
    ripple: 0,
    stored: null,
    ms: 0,
    finished: false,
    pending: [],
    ringInside: false,
    justDream: false,
    justWorld: false
  };
}

export function enterDream(dream, name, players, now = 0) {
  if (dream.phase !== 'idle' || !DREAMS.includes(name) || !players?.length) return false;
  dream.name = name;
  dream.phase = 'enter';
  dream.shown = 'world';
  dream.ripple = 0;
  dream.ms = 0;
  dream.finished = false;
  dream.stored = players.map(p => ({
    id: p.id,
    pos: copy3(p.pos),
    yaw: p.yaw || 0,
    vel: copy3(p.vel),
    form: p.form || 'car',
    carPos: copy3(p.carPos ?? p.pos),
    carYaw: p.carYaw ?? p.yaw ?? 0,
    carVel: copy3(p.carVel ?? p.vel)
  }));
  dream.t0 = now;
  dream.pending.push({code: 'dream_enter', name, ms: 0, finished: false});
  return true;
}

// Phases: enter (world wobbles) → play (dream) → exit (dream wobbles) → settle (world fades in).
export function stepDream(dream, dt, {goal = false, bail = false} = {}) {
  const prev = dream.shown;
  let left = Math.max(0, Number(dt) || 0);
  if (dream.phase === 'enter' && bail) {
    dream.finished = false;
    dream.phase = 'exit';
  }
  if (dream.phase === 'enter' && left > 0) {
    const need = (1 - dream.ripple) * RIPPLE_S;
    const use = Math.min(left, need);
    dream.ripple = Math.min(1, dream.ripple + use / RIPPLE_S);
    left -= use;
    if (dream.ripple >= 1) {
      dream.phase = 'play';
      dream.shown = 'dream';
      dream.ripple = 1;
    }
  }
  if (dream.phase === 'play' && left > 0) {
    dream.ms += left * 1000;
    dream.ripple = Math.max(0, dream.ripple - left / RIPPLE_S);
    if (goal || bail) {
      dream.finished = !!goal && !bail;
      dream.phase = 'exit';
    }
    left = 0;
  }
  if (dream.phase === 'exit' && left > 0) {
    const need = (1 - dream.ripple) * RIPPLE_S;
    const use = Math.min(left, need);
    dream.ripple = Math.min(1, dream.ripple + use / RIPPLE_S);
    left -= use;
    if (dream.ripple >= 1) {
      dream.phase = 'settle';
      dream.shown = 'world';
      dream.ripple = 1;
    }
  }
  if (dream.phase === 'settle' && left > 0) {
    dream.ripple = Math.max(0, dream.ripple - left / RIPPLE_S);
    if (dream.ripple <= 0) finish(dream);
  }
  dream.justDream = prev !== 'dream' && dream.shown === 'dream';
  dream.justWorld = prev === 'dream' && dream.shown === 'world';
  return dream;
}

function finish(dream) {
  dream.pending.push({
    code: 'dream_exit',
    name: dream.name,
    ms: Math.round(dream.ms),
    finished: !!dream.finished
  });
  dream.phase = 'idle';
  dream.shown = 'world';
  dream.ripple = 0;
  dream.name = null;
}

export function takeDreamEvents(dream) {
  return dream.pending.splice(0);
}

export function ringContains(pos, ring = COLD_LAB_RING) {
  if (!pos) return false;
  const dx = pos[0] - ring.pos[0],
    dy = (pos[1] ?? 0) - ring.pos[1],
    dz = pos[2] - ring.pos[2];
  return dx * dx + dz * dz <= ring.radius * ring.radius && Math.abs(dy) <= 3;
}

// Rising edge only, so leaving a dream while still standing in the ring does not re-enter.
export function dreamRingEdge(dream, pos, ring = COLD_LAB_RING) {
  const inside = ringContains(pos, ring);
  const fire = inside && !dream.ringInside && dream.phase === 'idle';
  dream.ringInside = inside;
  return fire ? ring.dream : null;
}

export const dreamActive = dream => dream.phase !== 'idle';
export const dreamSim = dream => dream.shown === 'dream';
