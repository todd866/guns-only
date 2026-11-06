// Pure mixing rules for the RC sound kit. No WebAudio, no DOM: levels, gaps, voice
// priority, engine ducking and split-screen pan. audio.js applies these to the graph.

export const STEPS = ['off', 'low', 'normal'];
export const STEP_GAIN = {off: 0, low: 0.4, normal: 1};
export const STORAGE = {
  effects: 'guns-only.rc.effects',
  engine: 'guns-only.rc.engine'
};

// Was 0.45. Lower so a full stack of one-shots does not sit on top of the engine.
export const MASTER_GAIN = 0.3;
// UI chimes under gameplay impacts, inside the effects bus.
export const UI_TRIM = 0.42;
export const MAX_VOICES = 6;

// Peak limiter, not a riding compressor: threshold high, ratio gentle, release slow.
export const COMPRESSOR = {
  threshold: -12,
  knee: 8,
  ratio: 3,
  attack: 0.02,
  release: 0.4
};

// One short soft chime for a radio callout. Not a two-note figure, not a voice.
export const CALLOUT = {voices: 1, dur: 0.2, level: 0.045, freq: 988};

export const MIN_GAP = {
  impact: 0.14,
  landing: 0.2,
  fire: 0.12,
  splash: 0.3,
  splat: 0.16,
  boost: 0.4,
  zap: 0.16,
  coin: 0.12,
  pickup: 0.16,
  gate: 0.28,
  finish: 1,
  radio: 1.6,
  beep: 0.22,
  go: 0.4,
  robot: 0.45,
  bugle: 4,
  cloud: 2,
  'foot-robot': 0.14,
  'foot-cowboy': 0.16,
  'dino-step': 0.1,
  wing: 0.28,
  cluck: 0.35,
  snort: 1.8,
  call: 1.4,
  squeal: 0.7,
  jet: 2.5,
  grind: 0.4
};

export const PRIORITY = {
  impact: 90,
  landing: 80,
  fire: 70,
  splash: 65,
  splat: 60,
  zap: 58,
  boost: 55,
  squeal: 50,
  'dino-step': 48,
  wing: 48,
  call: 46,
  'foot-robot': 44,
  'foot-cowboy': 44,
  jet: 42,
  cluck: 40,
  grind: 40,
  gate: 35,
  finish: 35,
  coin: 32,
  pickup: 32,
  snort: 30,
  beep: 20,
  go: 22,
  robot: 18,
  bugle: 16,
  radio: 12,
  cloud: 10
};

export const VOICE_HOLD = {
  finish: 1.1,
  bugle: 3.2,
  radio: 0.28,
  jet: 0.5,
  robot: 0.8,
  call: 0.9
};

const SPLIT_PAN = 0.32;

export function nextStep(step) {
  const i = Math.max(0, STEPS.indexOf(step));
  return STEPS[(i + 1) % STEPS.length];
}

export function readStep(raw) {
  return STEPS.includes(raw) ? raw : 'normal';
}

export function busGain(step) {
  return STEP_GAIN[readStep(step)] ?? 1;
}

export function masterGain({silent = false, muted = false} = {}) {
  return silent || muted ? 0 : MASTER_GAIN;
}

export function engineLevel({speed = 0, throttle = 0, paused = false, wheels = true} = {}) {
  if (paused || !wheels) return 0;
  const spd = Math.max(0, Number(speed) || 0);
  const thr = Math.min(1, Math.abs(Number(throttle) || 0));
  if (spd < 0.45 && thr < 0.12) return 0;
  const moving = Math.min(1, spd / 12);
  const body = spd < 0.45 ? 0.03 * thr : 0.035 + thr * 0.07 + moving * 0.09;
  return Math.min(0.2, body);
}

// Playback rate for the recorded motor. Deterministic: no random drift in the target.
export function enginePlayback({speed = 0, throttle = 0} = {}) {
  const spd = Math.max(0, Number(speed) || 0);
  const thr = Math.min(1, Math.abs(Number(throttle) || 0));
  return 0.62 + Math.min(0.55, spd / 28) + thr * 0.05;
}

export function engineHz(state) {
  return 62 + enginePlayback(state) * 48;
}

export function enginePan(seat, split) {
  if (!split) return 0;
  return (seat === 0 ? -1 : 1) * SPLIT_PAN;
}

export function engineMix(players, {paused = false} = {}) {
  return (players ?? []).map(p => {
    const wheels = p.body === 'car' || p.body === 'board';
    const seat = p.split ? (p.seat ?? 0) : 0;
    return {
      seat,
      pan: enginePan(seat, !!p.split),
      level: engineLevel({speed: p.speed, throttle: p.throttle, paused, wheels}),
      playback: enginePlayback(p),
      hz: engineHz(p)
    };
  });
}

export function slew(current, target, amount) {
  const a = Math.min(1, Math.max(0, Number(amount) || 0));
  return current + (target - current) * a;
}

export function canRetrigger({last = -1e9, now = 0, name, gap = 0} = {}) {
  const min = Math.max(gap ?? 0, MIN_GAP[name] ?? 0.12);
  return now - last >= min;
}

export function admit(active, {name, priority = 30, now = 0, until = 0} = {}) {
  const live = (active ?? []).filter(v => v.until > now);
  const voice = {name, priority, until};
  if (live.length < MAX_VOICES) return {ok: true, active: [...live, voice]};
  let victim = 0;
  for (let i = 1; i < live.length; i++) if (live[i].priority < live[victim].priority) victim = i;
  if (live[victim].priority >= priority) return {ok: false, active: live};
  const next = live.slice();
  next.splice(victim, 1, voice);
  return {ok: true, active: next};
}

export function jittered(baseRate, baseGain, rng = Math.random) {
  const u = Math.min(1, Math.max(0, rng()));
  return {rate: baseRate * (0.96 + u * 0.08), gain: baseGain * (0.88 + u * 0.16)};
}

export function soften({type = 'sine', dur = 0.2, level = 0.2, cutoff = null} = {}) {
  const harsh = type === 'sawtooth' || type === 'square';
  return {
    type,
    dur: harsh ? Math.min(dur, 0.16) : dur,
    level: harsh ? level * 0.62 : level,
    cutoff: Math.min(cutoff ?? (harsh ? 1400 : 3200), harsh ? 1600 : 3200)
  };
}

export function allowsLoop(name) {
  return name === 'engine';
}
