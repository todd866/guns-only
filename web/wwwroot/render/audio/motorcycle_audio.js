// Procedural YZF-R1 helmet-cam audio on the shared game-audio bus.
//
// The motorcycle runtime owns RPM, throttle, clutch, gear, speed, tyre use, and recovery truth.
// This module only turns those published facts into presentation. It deliberately avoids a fake
// "sport-bike sample" and instead gives the crossplane engine an uneven 720-degree pulse cycle,
// then layers intake, mechanical, wind, tyre, shift, and tip-over voices around it. The caller
// owns AudioContext lifecycle, mute, dynamics, and the final output path.

import { resolvePropulsionCharacter } from "./audio_character.js";

// Fallbacks mirror YzfR1Definition. Live Weekend Ride snapshots publish the same authority values
// so both helmet tachometer and audio follow one contract if the vehicle tune changes.
export const YZF_R1_IDLE_RPM = 2_000;
export const YZF_R1_REDLINE_RPM = 14_500;
export const YZF_R1_FIRING_INTERVAL_DEGREES = Object.freeze([270, 180, 90, 180]);

const noiseBuffers = new WeakMap();
const pulseBuffers = new WeakMap();

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function finite(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function smoothstep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function target(param, value, now, timeConstant = 0.08) {
  if (!param) return;
  if (typeof param.setTargetAtTime === "function") {
    param.setTargetAtTime(value, now, timeConstant);
    return;
  }
  param.value = value;
}

function setAt(param, value, at) {
  if (typeof param?.setValueAtTime === "function") param.setValueAtTime(value, at);
  else if (param) param.value = value;
}

function rampAt(param, value, at) {
  if (typeof param?.exponentialRampToValueAtTime === "function" && value > 0)
    param.exponentialRampToValueAtTime(value, at);
  else if (typeof param?.linearRampToValueAtTime === "function")
    param.linearRampToValueAtTime(value, at);
  else if (param)
    param.value = value;
}

function seededNoiseBuffer(context, seedValue) {
  let contextBuffers = noiseBuffers.get(context);
  if (!contextBuffers) {
    contextBuffers = new Map();
    noiseBuffers.set(context, contextBuffers);
  }
  const seedKey = Number(seedValue) >>> 0;
  const cached = contextBuffers.get(seedKey);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = seedKey;
  let low = 0;
  for (let index = 0; index < data.length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 0xffffffff * 2 - 1;
    low = low * 0.965 + white * 0.035;
    data[index] = clamp(white * 0.68 + low * 0.58, -1, 1);
  }
  contextBuffers.set(seedKey, buffer);
  return buffer;
}

/** One waveform period represents the engine's complete two-revolution / 720-degree cycle. */
function crossplanePulseBuffer(context) {
  const cached = pulseBuffers.get(context);
  if (cached) return cached;
  const length = 4_096;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const events = [0, 270 / 720, 450 / 720, 540 / 720];
  const weights = [1, 0.91, 1.04, 0.96];
  let maximum = 0;
  for (let index = 0; index < length; index += 1) {
    const phase = index / length;
    let sample = 0;
    for (let event = 0; event < events.length; event += 1) {
      const distance = (phase - events[event] + 1) % 1;
      // A short, rounded pressure event: enough harmonic edge to read as combustion, without the
      // sample-to-sample discontinuity that turns a procedural engine into a click train.
      const envelope = Math.exp(-distance * 88);
      sample += weights[event] * envelope * (
        Math.sin(distance * Math.PI * 2 * 7.2) * 0.72
        + Math.sin(distance * Math.PI * 2 * 13.6 + 0.4) * 0.28
      );
    }
    data[index] = sample;
    maximum = Math.max(maximum, Math.abs(sample));
  }
  const scale = maximum > 0 ? 0.84 / maximum : 1;
  for (let index = 0; index < data.length; index += 1) data[index] *= scale;
  const result = Object.freeze({
    buffer,
    nativeCycleHz: context.sampleRate / length,
  });
  pulseBuffers.set(context, result);
  return result;
}

export function motorcycleFiringCycleHz(rpm) {
  // A four-stroke engine completes its authored firing order every two crank revolutions.
  return Math.max(0, Number(rpm) || 0) / 120;
}

/** Flatten Weekend Ride authority into bounded acoustic controls. */
export function projectMotorcycleAcoustics(state = {}) {
  const rpm = Math.max(0, finite(
    state.rpm,
    state.engine_rpm,
    finite(state.engine_rpm_pct) == null
      ? null
      : finite(state.engine_rpm_pct) * YZF_R1_REDLINE_RPM / 100,
  ) ?? 0);
  const idleRpm = Math.max(1, finite(state.engine_idle_rpm) ?? YZF_R1_IDLE_RPM);
  const redlineRpm = Math.max(idleRpm + 1,
    finite(state.engine_redline_rpm) ?? YZF_R1_REDLINE_RPM);
  const rpm01 = clamp((rpm - idleRpm) / (redlineRpm - idleRpm));
  const throttle01 = clamp(finite(state.throttle, state.applied_throttle) ?? 0);
  const clutch01 = clamp(finite(state.clutch_engagement, state.clutch) ?? 1);
  const speedMps = Math.max(0, finite(state.speed_mps) ?? Math.hypot(
    finite(state.vx) ?? 0,
    finite(state.vy) ?? 0,
    finite(state.vz) ?? 0,
  ));
  const gear = Math.max(0, Math.min(6, Math.trunc(finite(state.gear) ?? 0)));
  const frontGrip01 = clamp(finite(state.front_grip_use) ?? 0);
  const rearGrip01 = clamp(finite(state.rear_grip_use) ?? 0);
  const slip01 = clamp(Math.max(
    Math.abs(finite(state.slip_front) ?? 0),
    Math.abs(finite(state.slip_rear) ?? 0),
  ));
  const gripEdge01 = smoothstep((Math.max(frontGrip01, rearGrip01) - 0.72) / 0.28);
  const speedPresence = smoothstep((speedMps - 2) / 18);
  const tyreScrub01 = clamp(Math.max(slip01 * 1.35, gripEdge01 * 0.72) * speedPresence);
  const onTrack = state.on_track !== false;
  const load01 = clamp(throttle01 * (0.34 + clutch01 * 0.66));
  const phase = String(state.phase ?? "active").toLowerCase();
  const active = resolvePropulsionCharacter(state) === "motorcycle";
  const engineRunning = active && rpm >= 300 && phase !== "finished";

  return Object.freeze({
    active,
    engineRunning,
    phase,
    rpm,
    rpm01,
    idleRpm,
    redlineRpm,
    firingCycleHz: motorcycleFiringCycleHz(rpm),
    averageFiringHz: rpm / 30,
    throttle01,
    clutch01,
    load01,
    gear,
    speedMps,
    speed01: smoothstep(speedMps / 88),
    brake01: clamp(finite(state.brake) ?? 0),
    frontGrip01,
    rearGrip01,
    tyreScrub01,
    onTrack,
    roughSurface01: onTrack ? 0 : speedPresence,
    tipped: state.tipped === true,
    recoveryFlashSeconds: Math.max(0, finite(state.tip_recovery_flash_s) ?? 0),
  });
}

function loopingSource(context, buffer) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start();
  return source;
}

/** Build persistent motorcycle voices into the caller-owned shared bus. */
export function createMotorcycleAudioVoices(context, destination) {
  const master = context.createGain();
  master.gain.value = 0;
  const helmetLowpass = context.createBiquadFilter();
  helmetLowpass.type = "lowpass";
  helmetLowpass.frequency.value = 7_200;
  helmetLowpass.Q.value = 0.52;
  helmetLowpass.connect(master).connect(destination);

  const pulseShape = crossplanePulseBuffer(context);
  const crossplanePulse = loopingSource(context, pulseShape.buffer);

  const exhaustBodyFilter = context.createBiquadFilter();
  exhaustBodyFilter.type = "bandpass";
  exhaustBodyFilter.frequency.value = 420;
  exhaustBodyFilter.Q.value = 0.68;
  const exhaustBodyGain = context.createGain();
  exhaustBodyGain.gain.value = 0;
  crossplanePulse.connect(exhaustBodyFilter).connect(exhaustBodyGain).connect(helmetLowpass);

  const intakeFilter = context.createBiquadFilter();
  intakeFilter.type = "bandpass";
  intakeFilter.frequency.value = 1_350;
  intakeFilter.Q.value = 0.72;
  const intakeGain = context.createGain();
  intakeGain.gain.value = 0;
  crossplanePulse.connect(intakeFilter).connect(intakeGain).connect(helmetLowpass);

  // Independent seeds prevent the engine, wind, tyres, and brakes from sharing one phase-locked
  // two-second texture. Their envelopes can correlate through vehicle state; their waveforms may
  // not, or the entire bike collapses into one filtered hiss.
  const combustionNoise = loopingSource(context,
    seededNoiseBuffer(context, 0x434f4d42));
  const combustionFilter = context.createBiquadFilter();
  combustionFilter.type = "bandpass";
  combustionFilter.frequency.value = 620;
  combustionFilter.Q.value = 0.48;
  const combustionGain = context.createGain();
  combustionGain.gain.value = 0;
  combustionNoise.connect(combustionFilter).connect(combustionGain).connect(helmetLowpass);

  const mechanical = context.createOscillator();
  mechanical.type = "sine";
  mechanical.frequency.value = 900;
  const mechanicalFilter = context.createBiquadFilter();
  mechanicalFilter.type = "bandpass";
  mechanicalFilter.frequency.value = 900;
  mechanicalFilter.Q.value = 2.4;
  const mechanicalGain = context.createGain();
  mechanicalGain.gain.value = 0;
  mechanical.connect(mechanicalFilter).connect(mechanicalGain).connect(helmetLowpass);
  mechanical.start();

  const windHighpass = context.createBiquadFilter();
  windHighpass.type = "highpass";
  windHighpass.frequency.value = 220;
  windHighpass.Q.value = 0.45;
  const windLowpass = context.createBiquadFilter();
  windLowpass.type = "lowpass";
  windLowpass.frequency.value = 4_600;
  windLowpass.Q.value = 0.5;
  const windGain = context.createGain();
  windGain.gain.value = 0;
  const windNoise = loopingSource(context, seededNoiseBuffer(context, 0x57494e44));
  windNoise.connect(windHighpass).connect(windLowpass).connect(windGain).connect(helmetLowpass);

  const tyreFilter = context.createBiquadFilter();
  tyreFilter.type = "bandpass";
  tyreFilter.frequency.value = 1_450;
  tyreFilter.Q.value = 0.62;
  const tyreGain = context.createGain();
  tyreGain.gain.value = 0;
  const tyreNoise = loopingSource(context, seededNoiseBuffer(context, 0x54595245));
  tyreNoise.connect(tyreFilter).connect(tyreGain).connect(helmetLowpass);

  // Leaving the painted circuit needs an immediate causal sound, not only a HUD warning. A
  // separate low, irregular surface bed keeps grass/gravel from masquerading as tyre slip.
  const surfaceFilter = context.createBiquadFilter();
  surfaceFilter.type = "bandpass";
  surfaceFilter.frequency.value = 280;
  surfaceFilter.Q.value = 0.46;
  const surfaceGain = context.createGain();
  surfaceGain.gain.value = 0;
  const surfaceNoise = loopingSource(context, seededNoiseBuffer(context, 0x47524153));
  surfaceNoise.connect(surfaceFilter).connect(surfaceGain).connect(helmetLowpass);

  const brakeFilter = context.createBiquadFilter();
  brakeFilter.type = "bandpass";
  brakeFilter.frequency.value = 2_700;
  brakeFilter.Q.value = 1.25;
  const brakeGain = context.createGain();
  brakeGain.gain.value = 0;
  const brakeNoise = loopingSource(context, seededNoiseBuffer(context, 0x4252414b));
  brakeNoise.connect(brakeFilter).connect(brakeGain).connect(helmetLowpass);

  return {
    master,
    helmetLowpass,
    crossplanePulse,
    pulseNativeCycleHz: pulseShape.nativeCycleHz,
    exhaustBodyFilter,
    exhaustBodyGain,
    intakeFilter,
    intakeGain,
    combustionFilter,
    combustionGain,
    mechanical,
    mechanicalFilter,
    mechanicalGain,
    windHighpass,
    windLowpass,
    windGain,
    tyreFilter,
    tyreGain,
    surfaceFilter,
    surfaceGain,
    brakeFilter,
    brakeGain,
    noiseBuffer: seededNoiseBuffer(context, 0x43554553),
    edgeState: null,
    cueCounts: { shift: 0, recovery: 0 },
  };
}

function oneShotNoise(voices, context, {
  at,
  type = "bandpass",
  frequencyHz,
  q = 0.8,
  level,
  seconds,
}) {
  const source = context.createBufferSource();
  source.buffer = voices.noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequencyHz;
  filter.Q.value = q;
  const gain = context.createGain();
  setAt(gain.gain, Math.max(0.0001, level), at);
  rampAt(gain.gain, 0.0001, at + seconds);
  source.connect(filter).connect(gain).connect(voices.helmetLowpass);
  source.start(at);
  source.stop?.(at + seconds + 0.01);
}

function playShiftCue(voices, context, sample) {
  const now = context.currentTime;
  oneShotNoise(voices, context, {
    at: now,
    frequencyHz: 720 + sample.rpm01 * 1_050,
    q: 0.9,
    level: 0.052 + sample.load01 * 0.025,
    seconds: 0.09,
  });
  const clack = context.createOscillator();
  clack.type = "triangle";
  const gain = context.createGain();
  setAt(clack.frequency, 165 + sample.gear * 17, now);
  rampAt(clack.frequency, 72, now + 0.075);
  setAt(gain.gain, 0.032, now);
  rampAt(gain.gain, 0.0001, now + 0.08);
  clack.connect(gain).connect(voices.helmetLowpass);
  clack.start(now);
  clack.stop?.(now + 0.09);
  voices.cueCounts.shift += 1;
}

function playRecoveryCue(voices, context) {
  const now = context.currentTime;
  oneShotNoise(voices, context, {
    at: now,
    type: "lowpass",
    frequencyHz: 360,
    q: 1.1,
    level: 0.13,
    seconds: 0.24,
  });
  voices.cueCounts.recovery += 1;
}

/** Drive the persistent graph from authoritative Weekend Ride fields. */
export function updateMotorcycleAudioVoices(voices, context, state = {}, { muted = false } = {}) {
  if (!voices || !context) return null;
  const sample = projectMotorcycleAcoustics(state);
  const now = context.currentTime;
  const live = sample.active && !muted && sample.engineRunning;
  const previous = voices.edgeState;
  if (live && previous?.active === true) {
    if (sample.gear !== previous.gear && sample.gear > 0 && previous.gear > 0)
      playShiftCue(voices, context, sample);
    if (sample.recoveryFlashSeconds > 0 && previous.recoveryFlashSeconds <= 0)
      playRecoveryCue(voices, context);
  }
  voices.edgeState = {
    active: sample.active,
    gear: sample.gear,
    recoveryFlashSeconds: sample.recoveryFlashSeconds,
  };

  target(voices.master.gain, live ? 0.56 : 0, now, live ? 0.12 : 0.025);
  target(voices.helmetLowpass.frequency,
    5_600 + sample.speed01 * 3_200, now, 0.14);
  target(voices.crossplanePulse.playbackRate,
    sample.firingCycleHz / Math.max(1, voices.pulseNativeCycleHz), now, 0.045);

  const enginePresence = smoothstep((sample.rpm - 250) / 1_100);
  const rpmBody = 0.42 + sample.rpm01 * 0.58;
  target(voices.exhaustBodyFilter.frequency,
    190 + sample.rpm01 * 1_140, now, 0.055);
  target(voices.exhaustBodyGain.gain,
    live ? enginePresence * rpmBody * (0.11 + sample.load01 * 0.13) : 0,
    now, 0.045);
  target(voices.intakeFilter.frequency,
    720 + sample.rpm01 * 2_850, now, 0.06);
  target(voices.intakeGain.gain,
    live ? enginePresence * Math.pow(sample.throttle01, 0.72) * (0.035 + sample.rpm01 * 0.085) : 0,
    now, 0.04);
  target(voices.combustionFilter.frequency,
    330 + sample.rpm01 * 1_240 + sample.load01 * 260, now, 0.07);
  target(voices.combustionGain.gain,
    live ? enginePresence * (0.025 + sample.load01 * 0.095) : 0,
    now, 0.055);

  const mechanicalHz = Math.max(120, sample.rpm / 60 * 7.5);
  target(voices.mechanical.frequency, mechanicalHz, now, 0.06);
  target(voices.mechanicalFilter.frequency, mechanicalHz * 1.03, now, 0.06);
  target(voices.mechanicalGain.gain,
    live ? enginePresence * (0.004 + sample.rpm01 * 0.014) : 0,
    now, 0.07);

  target(voices.windHighpass.frequency, 170 + sample.speed01 * 640, now, 0.1);
  target(voices.windLowpass.frequency, 2_800 + sample.speed01 * 5_200, now, 0.1);
  target(voices.windGain.gain,
    live ? 0.018 + Math.pow(sample.speed01, 1.25) * 0.16 : 0,
    now, 0.08);
  target(voices.tyreFilter.frequency,
    1_050 + sample.speed01 * 1_550 + sample.tyreScrub01 * 520, now, 0.06);
  target(voices.tyreGain.gain,
    live ? sample.tyreScrub01 * 0.14 : 0,
    now, sample.tyreScrub01 > 0.05 ? 0.025 : 0.09);
  target(voices.surfaceFilter.frequency,
    210 + sample.speed01 * 430, now, 0.07);
  target(voices.surfaceGain.gain,
    live ? sample.roughSurface01 * (0.065 + sample.speed01 * 0.085) : 0,
    now, sample.roughSurface01 > 0 ? 0.025 : 0.12);
  target(voices.brakeFilter.frequency,
    2_100 + sample.speed01 * 2_100, now, 0.08);
  target(voices.brakeGain.gain,
    live ? sample.brake01 * sample.speed01 * 0.035 : 0,
    now, 0.07);

  return sample;
}
