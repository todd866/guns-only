// One-shot and pulsed combat / airframe events on a shared flight bus.
// Gun reports are short cyclic bursts (not a continuous saw bed). Buffet is a low rumble bed
// amplitude-modulated from snapshot buffet magnitude. Fail-silent: callers catch at the façade.

import { pinkNoiseBuffer } from "./engine_audio.js";

const GUN_INTERVAL_S = 0.055;

export function createEventVoices(audioContext, destination) {
  const buffetSource = audioContext.createBufferSource();
  buffetSource.buffer = pinkNoiseBuffer(audioContext, 0x62756666);
  buffetSource.loop = true;
  const buffetFilter = audioContext.createBiquadFilter();
  buffetFilter.type = "lowpass";
  buffetFilter.frequency.value = 140;
  buffetFilter.Q.value = 0.9;
  const buffetGain = audioContext.createGain();
  buffetGain.gain.value = 0;
  buffetSource.connect(buffetFilter).connect(buffetGain).connect(destination);
  buffetSource.start();

  return {
    destination,
    buffetFilter,
    buffetGain,
    lastGunAt: -Infinity,
    wasFiring: false,
  };
}

export function updateBuffetVoice(voices, audioContext, state, { enabled = true } = {}) {
  if (!voices || !audioContext) return;
  const now = audioContext.currentTime;
  const buffet = clamp01(finiteNumber(state?.buffet) ?? 0);
  const angle = Math.hypot(
    finiteNumber(state?.buffet_pitch_deg) ?? 0,
    finiteNumber(state?.buffet_yaw_deg) ?? 0,
  );
  const buffetMag = clamp01(buffet + angle / 8);
  voices.buffetFilter.frequency.setTargetAtTime(90 + buffetMag * 160, now, 0.08);
  voices.buffetGain.gain.setTargetAtTime(
    enabled ? 0.09 * Math.pow(buffetMag, 1.15) : 0,
    now,
    0.06,
  );
}

export function fireGunReports(voices, audioContext, state, {
  enabled = true,
  triggerHeld = false,
} = {}) {
  if (!voices || !audioContext || !voices.destination) return;
  const now = audioContext.currentTime;
  const firing = enabled
    && triggerHeld
    && state?.gun_firing === true
    && state?.gun_overheat !== true;
  if (!firing) {
    voices.wasFiring = false;
    return;
  }
  if (!voices.wasFiring) {
    voices.wasFiring = true;
    voices.lastGunAt = now - GUN_INTERVAL_S;
  }
  while (now - voices.lastGunAt >= GUN_INTERVAL_S) {
    voices.lastGunAt += GUN_INTERVAL_S;
    scheduleGunReport(audioContext, voices.destination, voices.lastGunAt);
  }
}

function scheduleGunReport(audioContext, destination, at) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, 0x47554e31, 0.08);
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 980;
  filter.Q.value = 0.85;
  const tone = audioContext.createOscillator();
  tone.type = "square";
  tone.frequency.value = 88;
  const noiseEnv = audioContext.createGain();
  const toneEnv = audioContext.createGain();
  noiseEnv.gain.setValueAtTime(0.0001, at);
  noiseEnv.gain.exponentialRampToValueAtTime(0.11, at + 0.004);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
  toneEnv.gain.setValueAtTime(0.0001, at);
  toneEnv.gain.exponentialRampToValueAtTime(0.055, at + 0.003);
  toneEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.028);
  noise.connect(filter).connect(noiseEnv).connect(destination);
  tone.connect(toneEnv).connect(destination);
  noise.start(at);
  noise.stop(at + 0.06);
  tone.start(at);
  tone.stop(at + 0.04);
}

function shortNoiseBuffer(audioContext, initialSeed, seconds) {
  const frames = Math.max(1, Math.floor(audioContext.sampleRate * seconds));
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = initialSeed & 0x7fffffff;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < frames; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const white = seed / 0x3fffffff - 1;
    b0 = 0.997 * b0 + white * 0.12;
    b1 = 0.98 * b1 + white * 0.22;
    b2 = 0.9 * b2 + white * 0.35;
    channel[i] = (b0 + b1 + b2) * 0.28;
  }
  return buffer;
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
