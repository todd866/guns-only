// Procedural F-14A / twin-TF30 ownship presentation on the shared flight-audio bus.
//
// No claim is made that the absolute timbre is a measured cockpit recording. The graph uses the
// snapshot's actual engine delivery, dynamic pressure, pilot load, buffet, and authoritative wing
// sweep. Its job is the perceptual distinction the generic jet graph could not provide: two close
// compressor lines, a broad low TF30 body, intake/airframe energy, a separate augmentor layer, and
// a hydraulic wing-sweep cue. It never creates an AudioContext or reaches context.destination.

import { resolvePropulsionCharacter } from "./audio_character.js";

const KNOTS_TO_MPS = 0.5144444444444;
const SEA_LEVEL_DENSITY = 1.225;
const F14_AUDIO_MILITARY_STOP = 0.82;
// Snapshot sweep is intentionally compact (0.1 degree). At the real automatic schedule's slow
// rates that means several identical frames followed by one apparent rate spike. Track time
// between quantized changes and hold the resulting rate across the flat frames; a single-frame
// threshold chatters the hydraulic motor and replays its latch.
const SWEEP_QUANTIZATION_EPSILON_DEGREES = 0.049;
const SWEEP_ENTER_RATE_DEG_PER_SECOND = 0.22;
const SWEEP_EXIT_RATE_DEG_PER_SECOND = 0.12;
const SWEEP_MOTION_HOLD_SECONDS = 0.55;
const SWEEP_RATE_DECAY_SECONDS = 0.18;
const noiseBuffers = new WeakMap();

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionalFinite(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function smoothstep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function isExternalAudioPerspective(state) {
  const explicit = String(state?.audio_perspective ?? "").trim().toLowerCase();
  if (["external", "exterior", "flyby", "chase"].includes(explicit)) return true;
  if (["cockpit", "interior"].includes(explicit)) return false;
  return state?.replay_external === true;
}

function deterministicNoiseBuffer(audioContext) {
  const cached = noiseBuffers.get(audioContext);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(audioContext.sampleRate * 2));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x46313441;
  for (let index = 0; index < data.length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    // Mix white with a one-pole low component so one shared bed can feed both hiss and body paths.
    const white = seed / 0xffffffff * 2 - 1;
    data[index] = white;
  }
  noiseBuffers.set(audioContext, buffer);
  return buffer;
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

function oscillator(audioContext, type, frequencyHz) {
  const node = audioContext.createOscillator();
  node.type = type;
  node.frequency.value = frequencyHz;
  node.start();
  return node;
}

function loopingNoise(audioContext, buffer) {
  const node = audioContext.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.start();
  return node;
}

function projectedDynamicPressure01(state, trueAirspeedKts) {
  const publishedKpa = optionalFinite(state?.dynamic_pressure_kpa, state?.q_kpa);
  if (publishedKpa != null) return smoothstep(publishedKpa / 55);
  const publishedPa = optionalFinite(state?.dynamic_pressure_pa, state?.q_pa);
  if (publishedPa != null) return smoothstep(publishedPa / 55_000);
  const speedMps = Math.max(0, optionalFinite(state?.true_airspeed_mps)
    ?? trueAirspeedKts * KNOTS_TO_MPS);
  const density = Math.max(0, optionalFinite(state?.air_density_kg_m3)
    ?? SEA_LEVEL_DENSITY);
  return smoothstep((0.5 * density * speedMps * speedMps) / 55_000);
}

/** Flatten the F-14 snapshot into bounded, testable presentation controls. */
export function projectF14AudioState(state) {
  const active = resolvePropulsionCharacter(state) === "f14";
  const rpm01 = clamp(finite(state?.engine_rpm_pct) / 100);
  const appliedLever = Math.max(0,
    optionalFinite(state?.applied_throttle, state?.throttle) ?? 0);
  const deliveredLever = Math.max(0,
    optionalFinite(state?.engine_spool_fraction, state?.engine, appliedLever) ?? 0);
  const leverStop = Math.max(1, finite(state?.max_thrust_fraction, 1));
  const power01 = clamp(deliveredLever / leverStop);
  // The current F-14 force model publishes its augmented maximum as lever 1.0 rather than 1.35.
  // Split the upper travel for sound only; this is an authored detent, not a second thrust model.
  const augmentation01 = leverStop > 1.01
    ? smoothstep((deliveredLever - 1) / Math.max(0.05, leverStop - 1))
    : smoothstep((deliveredLever - F14_AUDIO_MILITARY_STOP)
      / (1 - F14_AUDIO_MILITARY_STOP));
  const trueAirspeedKts = Math.max(0, optionalFinite(
    state?.true_airspeed_kts,
    state?.ground_speed_kts,
  ) ?? 0);
  const pilotG = optionalFinite(state?.pilot_gz, state?.g_actual) ?? 1;
  const buffetAngle = Math.hypot(
    finite(state?.buffet_pitch_deg),
    finite(state?.buffet_roll_deg),
    finite(state?.buffet_yaw_deg),
  );
  const buffet01 = clamp(Math.max(
    typeof state?.buffet === "number" ? finite(state.buffet) : 0,
    state?.buffet === true ? 0.14 : 0,
    buffetAngle / 3.2,
  ));
  const wingSweepDegrees = optionalFinite(state?.wing_sweep_deg);
  return Object.freeze({
    active,
    rpm01,
    appliedLever,
    deliveredLever,
    power01,
    augmentation01,
    trueAirspeedKts,
    mach: Math.max(0, finite(state?.mach)),
    dynamicPressure01: projectedDynamicPressure01(state, trueAirspeedKts),
    pilotG,
    gLoad01: clamp((Math.abs(pilotG) - 1) / 7.5),
    buffet01,
    externalPerspective: isExternalAudioPerspective(state),
    wingSweepDegrees,
    wingSweepMode: String(state?.wing_sweep_mode ?? (state?.wing_sweep_manual === true
      ? "MANUAL" : "AUTO")).toUpperCase(),
  });
}

/**
 * Pure edge/rate tracker. A muted frame still advances it, so AB and sweep latches cannot replay
 * when a pause, settings mute, or silent-QA frame ends.
 */
export function advanceF14AudioEdgeState(previous, sample, nowSeconds) {
  const now = finite(nowSeconds);
  const first = previous?.initialized !== true;
  const currentSweep = optionalFinite(sample?.wingSweepDegrees);
  const dt = first ? 0 : clamp(now - finite(previous?.at, now), 0, 0.3);
  let lastSweepChangeDegrees = first
    ? currentSweep
    : optionalFinite(previous?.lastSweepChangeDegrees, previous?.wingSweepDegrees);
  let lastSweepChangeAt = first
    ? now
    : optionalFinite(previous?.lastSweepChangeAt, previous?.at) ?? now;
  let lastSweepMotionAt = first ? null : optionalFinite(previous?.lastSweepMotionAt);
  let sweepRateDegPerSecond = first ? 0 : finite(previous?.sweepRateDegPerSecond);
  const quantizedDelta = currentSweep != null && lastSweepChangeDegrees != null
    ? currentSweep - lastSweepChangeDegrees
    : 0;
  const changed = !first
    && currentSweep != null
    && lastSweepChangeDegrees != null
    && Math.abs(quantizedDelta) >= SWEEP_QUANTIZATION_EPSILON_DEGREES;

  if (changed) {
    const observationSeconds = now - lastSweepChangeAt;
    if (observationSeconds >= 1 / 240) {
      const observedRate = quantizedDelta / observationSeconds;
      // Direction reversals should speak immediately. Same-direction samples retain enough of
      // the previous observation to reject irregular 30/60 Hz delivery without lagging the motor.
      const sameDirection = Math.sign(observedRate) === Math.sign(sweepRateDegPerSecond);
      sweepRateDegPerSecond = sameDirection
        ? sweepRateDegPerSecond * 0.35 + observedRate * 0.65
        : observedRate;
      lastSweepMotionAt = now;
    }
    lastSweepChangeDegrees = currentSweep;
    lastSweepChangeAt = now;
  } else if (currentSweep != null && lastSweepChangeDegrees == null) {
    // Rejoining a stream after an unpublished/null sweep establishes a baseline; it is not an
    // actuator movement and must not fire a latch by itself.
    lastSweepChangeDegrees = currentSweep;
    lastSweepChangeAt = now;
    lastSweepMotionAt = null;
    sweepRateDegPerSecond = 0;
  } else if (currentSweep == null) {
    lastSweepChangeDegrees = null;
    lastSweepChangeAt = now;
    lastSweepMotionAt = null;
    sweepRateDegPerSecond = 0;
  } else if (lastSweepMotionAt != null
    && now - lastSweepMotionAt > SWEEP_MOTION_HOLD_SECONDS) {
    sweepRateDegPerSecond *= Math.exp(-dt / SWEEP_RATE_DECAY_SECONDS);
  }

  const heldMotion = lastSweepMotionAt != null
    && now - lastSweepMotionAt <= SWEEP_MOTION_HOLD_SECONDS;
  const priorMoving = !first && previous?.sweepMoving === true;
  const sweepMoving = currentSweep != null && (priorMoving
    ? heldMotion || Math.abs(sweepRateDegPerSecond) >= SWEEP_EXIT_RATE_DEG_PER_SECOND
    : changed && Math.abs(sweepRateDegPerSecond) >= SWEEP_ENTER_RATE_DEG_PER_SECOND);
  const augmentationLit = sample?.augmentation01 >= 0.08;
  const next = Object.freeze({
    initialized: true,
    at: now,
    wingSweepDegrees: currentSweep,
    lastSweepChangeDegrees,
    lastSweepChangeAt,
    lastSweepMotionAt,
    sweepRateDegPerSecond,
    sweepMoving,
    augmentationLit,
  });
  return Object.freeze({
    state: next,
    cues: Object.freeze({
      augmentorIgnition: !first && augmentationLit && previous.augmentationLit !== true,
      sweepLatch: !first && sweepMoving && previous.sweepMoving !== true,
    }),
    // A real 0.5 deg/s schedule must still produce a continuous hydraulic bed. The floor only
    // exists while hysteresis says the mechanism is moving; stationary wings remain silent.
    sweepMovement01: sweepMoving
      ? clamp(0.18 + Math.abs(sweepRateDegPerSecond) / 18 * 0.82)
      : 0,
  });
}

/** Build persistent F-14 voices into the caller-owned shared compressor bus. */
export function createF14AudioVoices(audioContext, destination) {
  const master = audioContext.createGain();
  master.gain.value = 0;
  master.connect(destination);
  // Optional rights-cleared cockpit recording. The caller attaches one loop from this same
  // AudioContext; keeping the input inside the F-14 master makes it inherit graph mute, the shared
  // radio-duck VCA, compressor, output preference, and silent-QA clamp.
  const decodedBedInput = audioContext.createGain();
  decodedBedInput.gain.value = 0;
  decodedBedInput.connect(master);
  const noiseBuffer = deterministicNoiseBuffer(audioContext);

  const body = loopingNoise(audioContext, noiseBuffer);
  const bodyFilter = audioContext.createBiquadFilter();
  bodyFilter.type = "lowpass";
  bodyFilter.frequency.value = 360;
  bodyFilter.Q.value = 0.8;
  const bodyGain = audioContext.createGain();
  bodyGain.gain.value = 0;
  body.connect(bodyFilter).connect(bodyGain).connect(master);

  const leftCompressor = oscillator(audioContext, "triangle", 1_100);
  const rightCompressor = oscillator(audioContext, "triangle", 1_126);
  const leftCompressorFilter = audioContext.createBiquadFilter();
  leftCompressorFilter.type = "bandpass";
  leftCompressorFilter.frequency.value = 1_100;
  leftCompressorFilter.Q.value = 4.2;
  const rightCompressorFilter = audioContext.createBiquadFilter();
  rightCompressorFilter.type = "bandpass";
  rightCompressorFilter.frequency.value = 1_126;
  rightCompressorFilter.Q.value = 4.0;
  const leftCompressorGain = audioContext.createGain();
  const rightCompressorGain = audioContext.createGain();
  leftCompressorGain.gain.value = 0;
  rightCompressorGain.gain.value = 0;
  leftCompressor.connect(leftCompressorFilter).connect(leftCompressorGain).connect(master);
  rightCompressor.connect(rightCompressorFilter).connect(rightCompressorGain).connect(master);

  const intake = loopingNoise(audioContext, noiseBuffer);
  const intakeHighpass = audioContext.createBiquadFilter();
  intakeHighpass.type = "highpass";
  intakeHighpass.frequency.value = 110;
  intakeHighpass.Q.value = 0.5;
  const intakeFilter = audioContext.createBiquadFilter();
  intakeFilter.type = "bandpass";
  intakeFilter.frequency.value = 760;
  intakeFilter.Q.value = 0.65;
  const intakeGain = audioContext.createGain();
  intakeGain.gain.value = 0;
  intake.connect(intakeHighpass).connect(intakeFilter).connect(intakeGain).connect(master);

  const augmentor = loopingNoise(audioContext, noiseBuffer);
  const augmentorFilter = audioContext.createBiquadFilter();
  augmentorFilter.type = "lowpass";
  augmentorFilter.frequency.value = 190;
  augmentorFilter.Q.value = 1.15;
  const augmentorGain = audioContext.createGain();
  augmentorGain.gain.value = 0;
  augmentor.connect(augmentorFilter).connect(augmentorGain).connect(master);
  const augmentorPulse = oscillator(audioContext, "triangle", 43);
  const augmentorPulseFilter = audioContext.createBiquadFilter();
  augmentorPulseFilter.type = "bandpass";
  augmentorPulseFilter.frequency.value = 43;
  augmentorPulseFilter.Q.value = 2.0;
  const augmentorPulseGain = audioContext.createGain();
  augmentorPulseGain.gain.value = 0;
  augmentorPulse
    .connect(augmentorPulseFilter)
    .connect(augmentorPulseGain)
    .connect(master);

  const rush = loopingNoise(audioContext, noiseBuffer);
  const rushHighpass = audioContext.createBiquadFilter();
  rushHighpass.type = "highpass";
  rushHighpass.frequency.value = 320;
  rushHighpass.Q.value = 0.5;
  const rushLowpass = audioContext.createBiquadFilter();
  rushLowpass.type = "lowpass";
  rushLowpass.frequency.value = 3_400;
  rushLowpass.Q.value = 0.5;
  const rushGain = audioContext.createGain();
  rushGain.gain.value = 0;
  rush.connect(rushHighpass).connect(rushLowpass).connect(rushGain).connect(master);

  const structure = loopingNoise(audioContext, noiseBuffer);
  const structureFilter = audioContext.createBiquadFilter();
  structureFilter.type = "lowpass";
  structureFilter.frequency.value = 165;
  structureFilter.Q.value = 1.1;
  const structureGain = audioContext.createGain();
  structureGain.gain.value = 0;
  structure.connect(structureFilter).connect(structureGain).connect(master);

  const sweepMotor = oscillator(audioContext, "sawtooth", 235);
  const sweepMotorFilter = audioContext.createBiquadFilter();
  sweepMotorFilter.type = "bandpass";
  sweepMotorFilter.frequency.value = 610;
  sweepMotorFilter.Q.value = 2.4;
  const sweepMotorGain = audioContext.createGain();
  sweepMotorGain.gain.value = 0;
  sweepMotor.connect(sweepMotorFilter).connect(sweepMotorGain).connect(master);
  const sweepHydraulics = loopingNoise(audioContext, noiseBuffer);
  const sweepHydraulicsFilter = audioContext.createBiquadFilter();
  sweepHydraulicsFilter.type = "bandpass";
  sweepHydraulicsFilter.frequency.value = 920;
  sweepHydraulicsFilter.Q.value = 1.4;
  const sweepHydraulicsGain = audioContext.createGain();
  sweepHydraulicsGain.gain.value = 0;
  sweepHydraulics
    .connect(sweepHydraulicsFilter)
    .connect(sweepHydraulicsGain)
    .connect(master);

  return {
    master,
    decodedBedInput,
    noiseBuffer,
    bodyFilter,
    bodyGain,
    leftCompressor,
    rightCompressor,
    leftCompressorFilter,
    rightCompressorFilter,
    leftCompressorGain,
    rightCompressorGain,
    intakeHighpass,
    intakeFilter,
    intakeGain,
    augmentorFilter,
    augmentorGain,
    augmentorPulse,
    augmentorPulseFilter,
    augmentorPulseGain,
    rushHighpass,
    rushLowpass,
    rushGain,
    structureFilter,
    structureGain,
    sweepMotor,
    sweepMotorFilter,
    sweepMotorGain,
    sweepHydraulicsFilter,
    sweepHydraulicsGain,
    edgeState: null,
    cueCounts: { augmentorIgnition: 0, sweepLatch: 0 },
  };
}

function playAugmentorIgnitionCue(voices, audioContext) {
  const now = audioContext.currentTime;
  const source = audioContext.createBufferSource();
  source.buffer = voices.noiseBuffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 240;
  filter.Q.value = 1.15;
  const gain = audioContext.createGain();
  setAt(gain.gain, 0.0001, now);
  rampAt(gain.gain, 0.16, now + 0.025);
  rampAt(gain.gain, 0.0001, now + 0.34);
  source.connect(filter).connect(gain).connect(voices.master);
  source.start(now);
  source.stop?.(now + 0.36);
  voices.cueCounts.augmentorIgnition += 1;
}

function playSweepLatchCue(voices, audioContext) {
  const now = audioContext.currentTime;
  const source = audioContext.createOscillator();
  source.type = "square";
  const gain = audioContext.createGain();
  setAt(source.frequency, 780, now);
  rampAt(source.frequency, 145, now + 0.055);
  setAt(gain.gain, 0.036, now);
  rampAt(gain.gain, 0.0001, now + 0.065);
  source.connect(gain).connect(voices.master);
  source.start(now);
  source.stop?.(now + 0.075);
  voices.cueCounts.sweepLatch += 1;
}

/** Drive the persistent graph from one authoritative F-14 presentation frame. */
export function updateF14AudioVoices(voices, audioContext, state, { muted = false } = {}) {
  if (!voices || !audioContext) return null;
  const sample = projectF14AudioState(state);
  const edge = sample.active
    ? advanceF14AudioEdgeState(voices.edgeState, sample, audioContext.currentTime)
    : Object.freeze({
      state: null,
      cues: Object.freeze({ augmentorIgnition: false, sweepLatch: false }),
      sweepMovement01: 0,
    });
  voices.edgeState = sample.active ? edge.state : null;
  const live = sample.active && !muted;
  if (live && edge.cues.augmentorIgnition) playAugmentorIgnitionCue(voices, audioContext);
  if (live && edge.cues.sweepLatch) playSweepLatchCue(voices, audioContext);

  const now = audioContext.currentTime;
  const rpm = sample.rpm01;
  const power = sample.power01;
  const q = sample.dynamicPressure01;
  const augmentation = sample.augmentation01;
  const exterior = sample.externalPerspective;
  const inletDistress = clamp(sample.buffet01 * 0.82
    + Math.max(0, sample.pilotG - 5) / 12);
  const compressorHz = 620 + rpm * 2_580;

  target(voices.master.gain, live ? (exterior ? 0.66 : 0.62) : 0,
    now, live ? 0.14 : 0.02);
  // The available recording is explicitly a fighter-cockpit surrogate, not an F-14 exterior.
  // Keep it prominent enough to carry category identity in cockpit view, but never leak it into
  // chase/flyby replay. RPM gates out an in-flight bed if a future mission models a cold Tomcat.
  const decodedBedPresence = smoothstep((rpm - 0.34) / 0.46);
  target(voices.decodedBedInput.gain,
    live && !exterior ? 0.44 * decodedBedPresence * (0.82 + q * 0.18) : 0,
    now, live && !exterior ? 0.22 : 0.025);
  target(voices.bodyFilter.frequency,
    220 + rpm * 310 + augmentation * 80 + (exterior ? 240 : 0), now, 0.11);
  target(voices.bodyGain.gain,
    0.098 * Math.pow(Math.max(rpm, power), 0.75) * (0.55 + power * 0.45)
      * (exterior ? 1.48 : 1), now, 0.12);

  target(voices.leftCompressor.frequency, compressorHz, now, 0.09);
  target(voices.rightCompressor.frequency, compressorHz * 1.018, now, 0.09);
  target(voices.leftCompressorFilter.frequency, compressorHz, now, 0.1);
  target(voices.rightCompressorFilter.frequency, compressorHz * 1.018, now, 0.1);
  const compressorLevel = Math.pow(rpm, 1.2) * (0.003 + rpm * 0.014)
    * (exterior ? 1.22 : 1);
  target(voices.leftCompressorGain.gain, compressorLevel, now, 0.11);
  target(voices.rightCompressorGain.gain, compressorLevel * 0.92, now, 0.11);

  target(voices.intakeHighpass.frequency, 100 + q * 260, now, 0.11);
  target(voices.intakeFilter.frequency,
    430 + q * 1_050 + inletDistress * 380, now, 0.09);
  target(voices.intakeGain.gain,
    0.072 * Math.pow(q, 0.78) * (0.52 + power * 0.48)
      * (exterior ? 1.42 : 1)
      + inletDistress * q * 0.025, now, 0.09);

  target(voices.augmentorFilter.frequency, 135 + augmentation * 175, now, 0.08);
  target(voices.augmentorGain.gain,
    0.14 * Math.pow(augmentation, 0.72) * (exterior ? 1.62 : 1), now, 0.08);
  const pulseHz = 39 + augmentation * 13;
  target(voices.augmentorPulse.frequency, pulseHz, now, 0.08);
  target(voices.augmentorPulseFilter.frequency, pulseHz, now, 0.08);
  target(voices.augmentorPulseGain.gain,
    0.027 * Math.pow(augmentation, 0.8) * (exterior ? 1.45 : 1), now, 0.075);

  target(voices.rushHighpass.frequency, 250 + q * 500, now, 0.13);
  target(voices.rushLowpass.frequency, 1_900 + q * 3_100, now, 0.13);
  target(voices.rushGain.gain,
    0.066 * Math.pow(q, 0.9) * (exterior ? 1.36 : 1), now, 0.11);
  target(voices.structureFilter.frequency,
    95 + sample.gLoad01 * 120 + sample.buffet01 * 85, now, 0.08);
  target(voices.structureGain.gain,
    0.04 * Math.max(sample.gLoad01 * 0.8, sample.buffet01)
      * (exterior ? 0.16 : 1), now, 0.075);

  const sweepDirection = Math.sign(edge.state?.sweepRateDegPerSecond ?? 0);
  target(voices.sweepMotor.frequency,
    215 + edge.sweepMovement01 * 145 + (sweepDirection > 0 ? 18 : 0), now, 0.07);
  target(voices.sweepMotorFilter.frequency,
    520 + edge.sweepMovement01 * 510, now, 0.08);
  target(voices.sweepMotorGain.gain,
    0.024 * edge.sweepMovement01 * (exterior ? 0.14 : 1), now, 0.055);
  target(voices.sweepHydraulicsFilter.frequency,
    720 + edge.sweepMovement01 * 760, now, 0.08);
  target(voices.sweepHydraulicsGain.gain,
    0.018 * edge.sweepMovement01 * (exterior ? 0.12 : 1), now, 0.055);

  return Object.freeze({
    sample,
    cues: edge.cues,
    sweepMovement01: edge.sweepMovement01,
  });
}
