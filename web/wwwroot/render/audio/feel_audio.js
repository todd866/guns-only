// Procedural combat feel on the shared flight bus: wind, AoA hiss, G-strain breathing,
// a restrained RWR, impact weight, a distance-delayed boom, UI ticks, and a quiet adaptive bed.
// One-shots are scheduled on the existing context. Continuous lanes stay at zero while muted,
// and edge counters still advance so a pause cannot replay a kill.

import { pinkNoiseBuffer, whiteNoiseBuffer } from "./engine_audio.js";

const SPEED_OF_SOUND_MPS = 340.29;

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function target(param, value, now, seconds) {
  if (!param) return;
  if (typeof param.setTargetAtTime === "function")
    param.setTargetAtTime(value, now, seconds);
  else
    param.value = value;
}

function airspeedMps(state) {
  const mps = finite(state?.true_airspeed_mps);
  if (mps != null) return Math.max(0, mps);
  const kts = finite(state?.true_airspeed_kts, finite(state?.indicated_airspeed_kts, 0));
  return Math.max(0, kts) * 0.514444;
}

function opponentAlive(state) {
  if (!state) return false;
  if (state.opponent_alive === false || state.bandit_alive === false) return false;
  if (state.fight === "Splash") return false;
  return state.bandit_alive === true
    || state.opponent_alive === true
    || state.opponent_body_present === true
    || state.bandit_present === true;
}

export function combatIntensity(state, scene = "flight") {
  if (scene === "title") return 0.08;
  const range = Math.max(0, finite(state?.range_m, 12000));
  const closure = Math.max(0, finite(state?.closure_kts, 0));
  const g = Math.max(0, finite(state?.g_actual, finite(state?.pilot_gz, 1)));
  const alive = opponentAlive(state) && state?.rapier_pattern_only !== true;
  let intensity = 0;
  if (alive && range < 6000)
    intensity = Math.max(intensity, 1 - range / 6000);
  if (closure > 80 && range < 2500)
    intensity = Math.max(intensity, 0.45);
  if (state?.gun_firing === true) intensity = Math.max(intensity, 0.72);
  if (g > 3.5) intensity = Math.max(intensity, clamp01((g - 3.5) / 4));
  if (state?.aim9_in_flight === true) intensity = Math.max(intensity, 0.66);
  return clamp01(intensity);
}

export function threatTone(state) {
  const range = Math.max(0, finite(state?.range_m, 20000));
  const alive = opponentAlive(state) && state?.rapier_pattern_only !== true;
  if (!alive || range > 14000) return { mode: "quiet", level: 0, hz: 1400, period: 1.4 };
  if (state?.opponent_gun_firing === true && range < 800)
    return { mode: "launch", level: 0.045, hz: 2680, period: 0.16 };
  const locked = state?.gun_solution === true || (range < 1800 && finite(state?.closure_kts, 0) > 50);
  if (locked) return { mode: "lock", level: 0.028, hz: 2140, period: 0.28 };
  if (range < 9000) return { mode: "search", level: 0.016, hz: 1680, period: 1.15 };
  return { mode: "quiet", level: 0, hz: 1400, period: 1.4 };
}

export function boomDelaySeconds(rangeM) {
  const range = Math.max(0, finite(rangeM, 0));
  return clamp(range / SPEED_OF_SOUND_MPS, 0.02, 1.45);
}

function noiseBurst(audioContext, seed, seconds) {
  const rate = audioContext.sampleRate || 22050;
  const frames = Math.max(1, Math.floor(rate * seconds));
  const buffer = audioContext.createBuffer(1, frames, rate);
  const data = buffer.getChannelData(0);
  let value = seed >>> 0;
  for (let i = 0; i < frames; i++) {
    value = Math.imul(value, 1664525) + 1013904223 >>> 0;
    const white = (value / 4294967296) * 2 - 1;
    const envelope = Math.sin((i / frames) * Math.PI);
    data[i] = white * envelope;
  }
  return buffer;
}

export function createFeelVoices(audioContext, destination) {
  const bus = audioContext.createGain();
  bus.gain.value = 1;
  bus.connect(destination);

  const windSource = audioContext.createBufferSource();
  windSource.buffer = pinkNoiseBuffer(audioContext, 0x57494e44);
  windSource.loop = true;
  const windHp = audioContext.createBiquadFilter();
  windHp.type = "highpass";
  windHp.frequency.value = 280;
  const windLp = audioContext.createBiquadFilter();
  windLp.type = "lowpass";
  windLp.frequency.value = 2400;
  const windGain = audioContext.createGain();
  windGain.gain.value = 0;
  windSource.connect(windHp).connect(windLp).connect(windGain).connect(bus);
  windSource.start();

  const aoaSource = audioContext.createBufferSource();
  aoaSource.buffer = whiteNoiseBuffer(audioContext, 0x414f4100);
  aoaSource.loop = true;
  const aoaFilter = audioContext.createBiquadFilter();
  aoaFilter.type = "bandpass";
  aoaFilter.frequency.value = 1400;
  aoaFilter.Q.value = 4.5;
  const aoaGain = audioContext.createGain();
  aoaGain.gain.value = 0;
  aoaSource.connect(aoaFilter).connect(aoaGain).connect(bus);
  aoaSource.start();

  const breathSource = audioContext.createBufferSource();
  breathSource.buffer = pinkNoiseBuffer(audioContext, 0x42524541);
  breathSource.loop = true;
  const breathFilter = audioContext.createBiquadFilter();
  breathFilter.type = "bandpass";
  breathFilter.frequency.value = 420;
  breathFilter.Q.value = 0.8;
  const breathGain = audioContext.createGain();
  breathGain.gain.value = 0;
  breathSource.connect(breathFilter).connect(breathGain).connect(bus);
  breathSource.start();

  const rwr = audioContext.createOscillator();
  rwr.type = "square";
  rwr.frequency.value = 1680;
  const rwrFilter = audioContext.createBiquadFilter();
  rwrFilter.type = "bandpass";
  rwrFilter.frequency.value = 1800;
  rwrFilter.Q.value = 6;
  const rwrGain = audioContext.createGain();
  rwrGain.gain.value = 0;
  rwr.connect(rwrFilter).connect(rwrGain).connect(bus);
  rwr.start();

  const musicA = audioContext.createOscillator();
  musicA.type = "triangle";
  musicA.frequency.value = 110;
  const musicB = audioContext.createOscillator();
  musicB.type = "sine";
  musicB.frequency.value = 164.81;
  const musicFilter = audioContext.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 720;
  const musicGain = audioContext.createGain();
  musicGain.gain.value = 0;
  musicA.connect(musicFilter);
  musicB.connect(musicFilter);
  musicFilter.connect(musicGain).connect(bus);
  musicA.start();
  musicB.start();

  return {
    destination: bus,
    windHp,
    windLp,
    windGain,
    aoaFilter,
    aoaGain,
    breathFilter,
    breathGain,
    rwr,
    rwrFilter,
    rwrGain,
    musicA,
    musicB,
    musicFilter,
    musicGain,
    seeded: false,
    lastRounds: 0,
    lastHits: 0,
    lastOpponentHits: 0,
    lastAlive: true,
    wasFiring: false,
    interfaceSounds: true,
  };
}

function scheduleWeight(audioContext, destination, at, { hz, level, seconds, seed }) {
  const noise = audioContext.createBufferSource();
  noise.buffer = noiseBurst(audioContext, seed, seconds);
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = hz;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  noise.connect(filter).connect(env).connect(destination);
  noise.start(at);
  noise.stop(at + seconds + 0.02);
  const body = audioContext.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(hz * 0.22, at);
  body.frequency.exponentialRampToValueAtTime(Math.max(28, hz * 0.08), at + seconds);
  const bodyEnv = audioContext.createGain();
  bodyEnv.gain.setValueAtTime(0.0001, at);
  bodyEnv.gain.exponentialRampToValueAtTime(level * 0.85, at + 0.018);
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  body.connect(bodyEnv).connect(destination);
  body.start(at);
  body.stop(at + seconds + 0.02);
}

export function updateFeelVoices(voices, audioContext, state, {
  enabled = true,
  music = false,
  interfaceSounds = false,
  scene = "flight",
  nowSeconds = 0,
} = {}) {
  if (!voices || !audioContext) return null;
  const now = audioContext.currentTime;
  const speed = airspeedMps(state);
  const mach = Math.max(0, finite(state?.mach, speed / SPEED_OF_SOUND_MPS));
  const aoa = Math.abs(finite(state?.aoa_deg, 0));
  const g = finite(state?.g_actual, finite(state?.pilot_gz, 1));
  const rounds = Math.max(0, Math.trunc(finite(state?.rounds_fired, 0)));
  const hits = Math.max(0, Math.trunc(finite(state?.hits, 0)));
  const opponentHits = Math.max(0, Math.trunc(finite(state?.opponent_hits, 0)));
  const alive = opponentAlive(state) && state?.opponent_alive !== false && state?.bandit_alive !== false
    && state?.fight !== "Splash";
  const firing = state?.gun_firing === true;
  const range = Math.max(0, finite(state?.range_m, 400));

  if (!voices.seeded) {
    voices.seeded = true;
    voices.lastRounds = rounds;
    voices.lastHits = hits;
    voices.lastOpponentHits = opponentHits;
    voices.lastAlive = alive;
    voices.wasFiring = firing;
  }

  voices.interfaceSounds = interfaceSounds === true;
  const live = enabled === true;
  const speed01 = clamp01(speed / 340);
  const wind = live ? clamp(speed01 * speed01 * 0.22, 0, 0.2) : 0;
  target(voices.windGain.gain, wind, now, 0.12);
  target(voices.windHp.frequency, 220 + speed01 * 900, now, 0.15);
  target(voices.windLp.frequency, 1400 + speed01 * 4200 + mach * 400, now, 0.15);

  const aoaLevel = live && speed > 70 && aoa > 7
    ? clamp((aoa - 7) / 18, 0, 1) * 0.045 * speed01 : 0;
  target(voices.aoaGain.gain, aoaLevel, now, 0.08);
  target(voices.aoaFilter.frequency, 900 + aoa * 42, now, 0.1);

  const strain = live ? clamp((Math.max(0, g) - 2.8) / 4.2, 0, 1) : 0;
  const breathPhase = ((Number(nowSeconds) || 0) * (0.28 + strain * 0.55)) % 1;
  const breathWindow = breathPhase < 0.42 ? Math.sin((breathPhase / 0.42) * Math.PI) : 0;
  target(voices.breathGain.gain, strain * 0.07 * breathWindow, now, 0.05);
  target(voices.breathFilter.frequency, 280 + strain * 260, now, 0.1);

  const tone = threatTone(state);
  const rwrPhase = ((Number(nowSeconds) || 0) % tone.period) / tone.period;
  const rwrOn = live && tone.level > 0 && rwrPhase < (tone.mode === "launch" ? 0.45 : 0.12);
  target(voices.rwr.frequency, tone.hz, now, 0.02);
  target(voices.rwrFilter.frequency, tone.hz, now, 0.02);
  target(voices.rwrGain.gain, rwrOn ? tone.level : 0, now, 0.012);

  const intensity = combatIntensity(state, scene);
  const musicLevel = live && music ? (scene === "title" ? 0.02 : 0.012 + intensity * 0.02) : 0;
  const root = scene === "title" ? 98 : 110 + intensity * 36;
  target(voices.musicA.frequency, root, now, 0.4);
  target(voices.musicB.frequency, root * (scene === "title" ? 1.5 : 1.25 + intensity * 0.25), now, 0.4);
  target(voices.musicFilter.frequency, scene === "title" ? 640 : 900 + intensity * 1400, now, 0.3);
  target(voices.musicGain.gain, musicLevel, now, 0.35);

  if (live) {
    const shotDelta = rounds >= voices.lastRounds ? Math.min(4, rounds - voices.lastRounds) : 0;
    if (shotDelta > 0) {
      scheduleWeight(audioContext, voices.destination, now, {
        hz: 180,
        level: 0.09,
        seconds: 0.11,
        seed: 0x47554e00 + rounds,
      });
    }
    if (voices.wasFiring && !firing) {
      scheduleWeight(audioContext, voices.destination, now + 0.02, {
        hz: 420,
        level: 0.05,
        seconds: 0.28,
        seed: 0x5441494c,
      });
    }
    const newHits = hits > voices.lastHits ? Math.min(3, hits - voices.lastHits) : 0;
    for (let i = 0; i < newHits; i++) {
      scheduleWeight(audioContext, voices.destination, now + i * 0.028, {
        hz: 900,
        level: 0.11,
        seconds: 0.16,
        seed: 0x48495400 + hits + i,
      });
    }
    const ownHits = opponentHits > voices.lastOpponentHits
      ? Math.min(2, opponentHits - voices.lastOpponentHits) : 0;
    for (let i = 0; i < ownHits; i++) {
      scheduleWeight(audioContext, voices.destination, now + i * 0.03, {
        hz: 240,
        level: 0.16,
        seconds: 0.22,
        seed: 0x4f574e00 + opponentHits,
      });
    }
    if (voices.lastAlive && !alive) {
      const delay = boomDelaySeconds(range);
      const distance = clamp(1 / (1 + range / 700), 0.2, 1);
      scheduleWeight(audioContext, voices.destination, now + delay, {
        hz: 90,
        level: 0.22 * distance,
        seconds: 0.85,
        seed: 0x424f4f4d,
      });
    }
  }

  voices.lastRounds = rounds;
  voices.lastHits = hits;
  voices.lastOpponentHits = opponentHits;
  voices.lastAlive = alive;
  voices.wasFiring = firing;
  return Object.freeze({
    wind,
    aoaLevel,
    strain,
    threat: tone.mode,
    intensity,
    musicLevel,
  });
}

export function cueFeelInterface(voices, audioContext, kind = "click") {
  if (!voices?.interfaceSounds || !audioContext || !voices.destination) return false;
  const now = audioContext.currentTime;
  const hover = kind === "hover";
  scheduleWeight(audioContext, voices.destination, now, {
    hz: hover ? 1800 : 720,
    level: hover ? 0.012 : 0.03,
    seconds: hover ? 0.04 : 0.06,
    seed: hover ? 0x484f5645 : 0x434c4943,
  });
  return true;
}
