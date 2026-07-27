// Synthesised Rapier engine and airframe sound. There are no samples to license or fail to load:
// the fan/compressor stack, core, jet exhaust, ram duct, and boundary-layer rush are built from
// Web Audio primitives.
//
// Research-backed layering (cockpit / ownship perspective):
// - Fan / compressor: additive slightly-inharmonic partials (NASA auralization / Chalmers turbofan
//   decomposition — discrete tones + broadband, not white noise alone).
// - Fan tip whine: narrow high bandpass on the shared pink field (rotor-stator character).
// - Core + jet exhaust: pink through mid bandpass and resonant lowpass (LF energy; Sound.SE /
//   Farnell subtractive roar — jets need bottom end, not a thin hiss).
// - Airframe rush: independent pink bed driven only by dynamic pressure.
// - Atmosphere: density scales propulsion loudness; thin air + low thrust (+ RCS authority) collapses
//   toward coast near-silence. Turbine→ram equal-power handover remains M1.6..M2.7.
//
// EVERYTHING here is failure-tolerant on purpose. Audio runs at boot, browsers block it until a
// gesture, and context support varies. A thrown exception anywhere disables audio permanently and
// silently rather than taking the flight kernel down with it.
const PARTIAL_RATIOS = Object.freeze([1.0, 2.01, 3.0, 4.98, 7.02, 9.96]);
const PARTIAL_LEVELS = Object.freeze([1.0, 0.46, 0.27, 0.16, 0.095, 0.055]);
const SPOOL_UP_PER_SECOND = 0.20;
const SPOOL_DOWN_PER_SECOND = 0.32;
const MAX_CONTROL_STEP_SECONDS = 0.25;
const KNOTS_TO_MPS = 0.514444;
const SEA_LEVEL_DENSITY = 1.225;
/** Rough full-power thrust for normalizing published kN into a 0..1 energy cue. */
const THRUST_REF_KN = 140;

let context = null;
let voices = null;
let disabled = false;

/// Build the continuous propulsion / rush graph into `destination` (bus or context.destination).
/// When `includeMaster` is true, a local master gain sits between the voices and destination so
/// standalone callers (and unit tests) can mute without a façade.
export function createEngineVoices(audioContext, destination, { includeMaster = true } = {}) {
  const master = includeMaster ? audioContext.createGain() : null;
  if (master) {
    master.gain.value = 0;
    master.connect(destination);
  }
  const output = master ?? destination;

  // Compressor / turbine: slightly inharmonic sine partials with a steeply falling envelope.
  const compressorGain = audioContext.createGain();
  compressorGain.gain.value = 0;
  const compressorFilter = audioContext.createBiquadFilter();
  compressorFilter.type = "lowpass";
  compressorFilter.frequency.value = 1200;
  compressorFilter.Q.value = 0.65;
  compressorGain.connect(compressorFilter).connect(output);

  const partials = PARTIAL_RATIOS.map((ratio, index) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 64 * ratio;
    const gain = audioContext.createGain();
    gain.gain.value = PARTIAL_LEVELS[index];
    oscillator.connect(gain).connect(compressorGain);
    oscillator.start();
    return { oscillator, ratio };
  });

  // Shared deterministic pink field for core / ram / jet / fan-whine shaping.
  const coreBuffer = pinkNoiseBuffer(audioContext, 22695477);
  const engineNoise = audioContext.createBufferSource();
  engineNoise.buffer = coreBuffer;
  engineNoise.loop = true;

  const coreFilter = audioContext.createBiquadFilter();
  coreFilter.type = "bandpass";
  coreFilter.frequency.value = 360;
  coreFilter.Q.value = 0.72;
  const coreGain = audioContext.createGain();
  coreGain.gain.value = 0;
  engineNoise.connect(coreFilter).connect(coreGain).connect(output);

  const ramFilter = audioContext.createBiquadFilter();
  ramFilter.type = "bandpass";
  ramFilter.frequency.value = 360;
  ramFilter.Q.value = 0.62;
  const ramGain = audioContext.createGain();
  ramGain.gain.value = 0;
  engineNoise.connect(ramFilter).connect(ramGain).connect(output);

  // Jet exhaust roar: resonant lowpass keeps the LF body that bandpass alone strips away.
  const jetFilter = audioContext.createBiquadFilter();
  jetFilter.type = "lowpass";
  jetFilter.frequency.value = 420;
  jetFilter.Q.value = 1.15;
  const jetGain = audioContext.createGain();
  jetGain.gain.value = 0;
  engineNoise.connect(jetFilter).connect(jetGain).connect(output);

  // Fan tip / BPF whine: narrow high bandpass — audible spool identity without a sample loop.
  const fanFilter = audioContext.createBiquadFilter();
  fanFilter.type = "bandpass";
  fanFilter.frequency.value = 2400;
  fanFilter.Q.value = 6.5;
  const fanGain = audioContext.createGain();
  fanGain.gain.value = 0;
  engineNoise.connect(fanFilter).connect(fanGain).connect(output);

  // Boundary-layer / airframe rush — independent pressure field, q-only.
  const airframeNoise = audioContext.createBufferSource();
  airframeNoise.buffer = pinkNoiseBuffer(audioContext, 0x051f15e);
  airframeNoise.loop = true;
  const rushHighpass = audioContext.createBiquadFilter();
  rushHighpass.type = "highpass";
  rushHighpass.frequency.value = 90;
  rushHighpass.Q.value = 0.45;
  const rushLowpass = audioContext.createBiquadFilter();
  rushLowpass.type = "lowpass";
  rushLowpass.frequency.value = 900;
  rushLowpass.Q.value = 0.55;
  const rushGain = audioContext.createGain();
  rushGain.gain.value = 0;
  airframeNoise.connect(rushHighpass).connect(rushLowpass).connect(rushGain).connect(output);

  engineNoise.start();
  airframeNoise.start();

  return {
    master,
    compressorGain,
    compressorFilter,
    partials,
    coreFilter,
    coreGain,
    ramFilter,
    ramGain,
    jetFilter,
    jetGain,
    fanFilter,
    fanGain,
    rushHighpass,
    rushLowpass,
    rushGain,
    spoolRpm: 0,
    lastControlTime: audioContext.currentTime,
  };
}

function buildStandalone() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return false;
  context = new Ctor();
  voices = createEngineVoices(context, context.destination, { includeMaster: true });
  return true;
}

export function pinkNoiseBuffer(audioContext, initialSeed) {
  const frames = Math.max(1, Math.floor(audioContext.sampleRate * 4));
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);

  // Paul Kellet's seven-pole approximation, fed by the same seeded LCG on every build.
  let seed = initialSeed & 0x7fffffff;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < frames; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const white = seed / 0x3fffffff - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    channel[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

/// Drive an existing voice graph. Safe every frame; uses audio-clock spool rate limits.
export function updateEngineVoices(voiceGraph, audioContext, state, { muted = false } = {}) {
  if (!voiceGraph || !audioContext) return;

  const throttle = clamp01((finiteNumber(state?.applied_throttle) ?? 0) / 1.55);
  const targetRpm = clamp01((finiteNumber(state?.engine_rpm_pct) ?? 0) / 100);
  const mach = Math.max(0, finiteNumber(state?.mach) ?? 0);
  const now = audioContext.currentTime;
  const elapsed = Math.min(MAX_CONTROL_STEP_SECONDS,
    Math.max(0, now - voiceGraph.lastControlTime));
  voiceGraph.lastControlTime = now;
  const spoolRate = targetRpm >= voiceGraph.spoolRpm
    ? SPOOL_UP_PER_SECOND : SPOOL_DOWN_PER_SECOND;
  voiceGraph.spoolRpm = moveTowards(voiceGraph.spoolRpm, targetRpm, spoolRate * elapsed);

  const handover = smoothstep(clamp01((mach - 1.6) / (2.7 - 1.6)));
  const turbineShare = Math.cos(handover * Math.PI / 2);
  const ramShare = Math.sin(handover * Math.PI / 2);
  const q01 = dynamicPressureFraction(state);
  const rpm = voiceGraph.spoolRpm;
  const density = atmosphereDensity(state);
  const densityScale = 0.14 + 0.86 * Math.pow(clamp01(density / SEA_LEVEL_DENSITY), 0.55);
  const thrustFrac = thrustFraction(state, throttle, rpm);
  const rcsAuthority = clamp01(finiteNumber(state?.rapier_rcs_authority) ?? 0);
  // Zoom-coast / exo: thin air, collapsed thrust, and RCS authority → near silence.
  const coastGate = densityScale < 0.28 && thrustFrac < 0.14 && (q01 < 0.12 || rcsAuthority > 0.45)
    ? 0.035 + 0.04 * thrustFrac
    : 1;
  const propulsionPresence = densityScale * coastGate;
  const rushPresence = Math.max(coastGate, 0.12 + 0.88 * densityScale);

  const baseFrequency = 64 + rpm * 250;
  const nowRamp = (param, value, timeConstant = 0.12) =>
    param.setTargetAtTime(value, now, timeConstant);
  for (const partial of voiceGraph.partials) {
    nowRamp(partial.oscillator.frequency, baseFrequency * partial.ratio, 0.16);
  }

  nowRamp(voiceGraph.compressorFilter.frequency, 1200 + rpm * 3900 + throttle * 600, 0.18);
  nowRamp(voiceGraph.compressorGain.gain,
    (0.008 + 0.118 * Math.pow(rpm, 1.25)) * turbineShare * propulsionPresence, 0.16);

  nowRamp(voiceGraph.coreFilter.frequency, 240 + rpm * 720 + throttle * 480, 0.18);
  nowRamp(voiceGraph.coreFilter.Q, 0.78 - handover * 0.24, 0.20);
  nowRamp(voiceGraph.coreGain.gain,
    (0.012 + 0.11 * Math.sqrt(rpm) * (0.30 + throttle * 0.70))
      * (1 - handover * 0.55) * propulsionPresence, 0.20);

  nowRamp(voiceGraph.ramFilter.frequency, 330 + handover * 1480 + throttle * 220, 0.22);
  nowRamp(voiceGraph.ramFilter.Q, 0.62 - handover * 0.31, 0.22);
  nowRamp(voiceGraph.ramGain.gain,
    ramShare * (0.022 + throttle * 0.165) * (0.18 + rpm * 0.82) * propulsionPresence, 0.22);

  // Exhaust roar tracks power and density; fades as ram broadband owns the mix.
  nowRamp(voiceGraph.jetFilter.frequency, 280 + rpm * 520 + throttle * 380, 0.20);
  nowRamp(voiceGraph.jetFilter.Q, 1.25 - throttle * 0.35, 0.20);
  nowRamp(voiceGraph.jetGain.gain,
    (0.02 + 0.155 * Math.pow(throttle * rpm, 0.85))
      * (0.55 + 0.45 * turbineShare) * propulsionPresence, 0.18);

  nowRamp(voiceGraph.fanFilter.frequency, 1600 + rpm * 3200 + throttle * 900, 0.16);
  nowRamp(voiceGraph.fanFilter.Q, 5.8 + rpm * 2.4, 0.18);
  nowRamp(voiceGraph.fanGain.gain,
    (0.004 + 0.055 * Math.pow(rpm, 1.35)) * turbineShare * propulsionPresence, 0.16);

  nowRamp(voiceGraph.rushHighpass.frequency, 90 + q01 * 260, 0.18);
  nowRamp(voiceGraph.rushLowpass.frequency, 850 + q01 * 5450, 0.18);
  nowRamp(voiceGraph.rushGain.gain, 0.125 * Math.pow(q01, 0.72) * rushPresence, 0.18);

  if (voiceGraph.master) {
    nowRamp(voiceGraph.master.gain, muted ? 0 : 0.58, muted ? 0.02 : 0.20);
  }
}

/// Standalone entry: owns its own context/master. Prefer updateFlightAudio in production.
export function updateEngineAudio(state, { muted = false } = {}) {
  if (disabled) return;
  try {
    if (!context && !buildStandalone()) {
      disabled = true;
      return;
    }
    if (context.state === "suspended") {
      const resume = context.resume();
      resume?.catch?.(() => {});
      return;
    }
    updateEngineVoices(voices, context, state, { muted });
  } catch {
    disabled = true;
  }
}

function thrustFraction(state, throttle, rpm) {
  const turbineKn = finiteNumber(state?.rapier_turbine_thrust_kn);
  const ramKn = finiteNumber(state?.rapier_ramjet_thrust_kn);
  if (turbineKn != null || ramKn != null) {
    return clamp01(((turbineKn ?? 0) + (ramKn ?? 0)) / THRUST_REF_KN);
  }
  return clamp01(throttle * (0.35 + rpm * 0.65));
}

function atmosphereDensity(state) {
  const altitudeM = finiteNumber(state?.altitude_m, state?.py) ?? 0;
  return finiteNumber(state?.air_density_kg_m3) ?? isaDensity(altitudeM);
}

function dynamicPressureFraction(state) {
  const speedMps = finiteNumber(state?.true_airspeed_mps)
    ?? ((finiteNumber(state?.true_airspeed_kts) ?? 0) * KNOTS_TO_MPS);
  const density = atmosphereDensity(state);
  const dynamicPressurePa = 0.5 * Math.max(0, density) * Math.max(0, speedMps) ** 2;
  return smoothstep(clamp01((dynamicPressurePa - 750) / (45_000 - 750)));
}

function isaDensity(altitudeM) {
  const altitude = Math.max(-500, Math.min(32_000, altitudeM));
  const gravity = 9.80665;
  const gasConstant = 287.05287;
  if (altitude <= 11_000) {
    const temperature = 288.15 - 0.0065 * altitude;
    const pressure = 101325 * Math.pow(temperature / 288.15,
      gravity / (gasConstant * 0.0065));
    return pressure / (gasConstant * temperature);
  }
  const pressure11 = 22632.06;
  if (altitude <= 20_000) {
    const temperature = 216.65;
    const pressure = pressure11
      * Math.exp(-gravity * (altitude - 11_000) / (gasConstant * temperature));
    return pressure / (gasConstant * temperature);
  }
  const temperature = 216.65 + 0.001 * (altitude - 20_000);
  const pressure20 = 5474.889;
  const pressure = pressure20 * Math.pow(temperature / 216.65,
    -gravity / (gasConstant * 0.001));
  return pressure / (gasConstant * temperature);
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function moveTowards(value, target, maximumDelta) {
  if (target > value) return Math.min(target, value + maximumDelta);
  return Math.max(target, value - maximumDelta);
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
