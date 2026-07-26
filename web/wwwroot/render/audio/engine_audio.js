// Synthesised Rapier engine and airframe sound. There are no samples to license or fail to load:
// the turbine, core, ram duct, and boundary-layer rush are built from Web Audio primitives.
//
// The compressor is an additive stack rather than a raw oscillator. The core and ram voices use
// deterministic pink noise, while a separately generated pink bed represents airframe rush and is
// driven only by dynamic pressure. Across M1.6..M2.7 the tonal turbine voice gives way to the broad
// ram voice on an equal-power curve, making the aircraft's defining propulsion transition audible.
//
// EVERYTHING here is failure-tolerant on purpose. Audio runs at boot, browsers block it until a
// gesture, and context support varies. A thrown exception anywhere disables audio permanently and
// silently rather than taking the flight kernel down with it — a game that boots without sound is
// a minor disappointment; a game that does not boot is not a game.
const PARTIAL_RATIOS = Object.freeze([1.0, 2.01, 3.0, 4.98, 7.02, 9.96]);
const PARTIAL_LEVELS = Object.freeze([1.0, 0.46, 0.27, 0.16, 0.095, 0.055]);
const SPOOL_UP_PER_SECOND = 0.20;   // five seconds from stopped to governed RPM
const SPOOL_DOWN_PER_SECOND = 0.32;
const MAX_CONTROL_STEP_SECONDS = 0.25;
const KNOTS_TO_MPS = 0.514444;

let context = null;
let voices = null;
let disabled = false;

function build() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return false;
  context = new Ctor();

  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);

  // Compressor / turbine: slightly inharmonic sine partials with a steeply falling envelope. The
  // tiny offsets from integer ratios keep the stack alive without the brittle edge of a sawtooth.
  const compressorGain = context.createGain();
  compressorGain.gain.value = 0;
  const compressorFilter = context.createBiquadFilter();
  compressorFilter.type = "lowpass";
  compressorFilter.frequency.value = 1200;
  compressorFilter.Q.value = 0.65;
  compressorGain.connect(compressorFilter).connect(master);

  const partials = PARTIAL_RATIOS.map((ratio, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 64 * ratio;
    const gain = context.createGain();
    gain.gain.value = PARTIAL_LEVELS[index];
    oscillator.connect(gain).connect(compressorGain);
    oscillator.start();
    return { oscillator, ratio };
  });

  // Core and ram duct share one deterministic pink-pressure field but shape it independently. This
  // preserves continuity through the bypass transition instead of crossfading unrelated noise.
  const coreBuffer = pinkNoiseBuffer(context, 22695477);
  const engineNoise = context.createBufferSource();
  engineNoise.buffer = coreBuffer;
  engineNoise.loop = true;

  const coreFilter = context.createBiquadFilter();
  coreFilter.type = "bandpass";
  coreFilter.frequency.value = 360;
  coreFilter.Q.value = 0.72;
  const coreGain = context.createGain();
  coreGain.gain.value = 0;
  engineNoise.connect(coreFilter).connect(coreGain).connect(master);

  const ramFilter = context.createBiquadFilter();
  ramFilter.type = "bandpass";
  ramFilter.frequency.value = 360;
  ramFilter.Q.value = 0.62;
  const ramGain = context.createGain();
  ramGain.gain.value = 0;
  engineNoise.connect(ramFilter).connect(ramGain).connect(master);

  // Boundary-layer / airframe rush has its own deterministic pressure field and signal path. It is
  // deliberately independent of the throttle: only live q changes this voice.
  const airframeNoise = context.createBufferSource();
  airframeNoise.buffer = pinkNoiseBuffer(context, 0x051f15e);
  airframeNoise.loop = true;
  const rushHighpass = context.createBiquadFilter();
  rushHighpass.type = "highpass";
  rushHighpass.frequency.value = 90;
  rushHighpass.Q.value = 0.45;
  const rushLowpass = context.createBiquadFilter();
  rushLowpass.type = "lowpass";
  rushLowpass.frequency.value = 900;
  rushLowpass.Q.value = 0.55;
  const rushGain = context.createGain();
  rushGain.gain.value = 0;
  airframeNoise.connect(rushHighpass).connect(rushLowpass).connect(rushGain).connect(master);

  engineNoise.start();
  airframeNoise.start();
  voices = {
    master,
    compressorGain,
    compressorFilter,
    partials,
    coreFilter,
    coreGain,
    ramFilter,
    ramGain,
    rushHighpass,
    rushLowpass,
    rushGain,
    spoolRpm: 0,
    lastControlTime: context.currentTime,
  };
  return true;
}

function pinkNoiseBuffer(audioContext, initialSeed) {
  const frames = Math.max(1, Math.floor(audioContext.sampleRate * 4));
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);

  // Paul Kellet's seven-pole approximation, fed by the same seeded LCG on every build. Math.imul
  // keeps the 32-bit recurrence exact across JS engines; there is no Math.random anywhere here.
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

/// Drive the voices from the flat snapshot. Safe to call every frame and before any user gesture:
/// a suspended context remains silent until the browser allows it.
export function updateEngineAudio(state, { muted = false } = {}) {
  if (disabled) return;
  try {
    if (!context && !build()) {
      disabled = true;
      return;
    }
    if (context.state === "suspended") {
      const resume = context.resume();
      resume?.catch?.(() => {});
      return;
    }

    const throttle = clamp01((finiteNumber(state?.applied_throttle) ?? 0) / 1.55);
    const targetRpm = clamp01((finiteNumber(state?.engine_rpm_pct) ?? 0) / 100);
    const mach = Math.max(0, finiteNumber(state?.mach) ?? 0);
    const now = context.currentTime;
    const elapsed = Math.min(MAX_CONTROL_STEP_SECONDS,
      Math.max(0, now - voices.lastControlTime));
    voices.lastControlTime = now;
    const spoolRate = targetRpm >= voices.spoolRpm
      ? SPOOL_UP_PER_SECOND : SPOOL_DOWN_PER_SECOND;
    voices.spoolRpm = moveTowards(voices.spoolRpm, targetRpm, spoolRate * elapsed);

    // Equal-power crossfade: no energy hole in the middle, but the recognizable turbine whine is
    // completely absent once the ram duct owns the flow at M2.7.
    const handover = smoothstep(clamp01((mach - 1.6) / (2.7 - 1.6)));
    const turbineShare = Math.cos(handover * Math.PI / 2);
    const ramShare = Math.sin(handover * Math.PI / 2);
    const q01 = dynamicPressureFraction(state);
    const rpm = voices.spoolRpm;

    const baseFrequency = 64 + rpm * 250;
    const nowRamp = (param, value, timeConstant = 0.12) =>
      param.setTargetAtTime(value, now, timeConstant);
    for (const partial of voices.partials) {
      nowRamp(partial.oscillator.frequency, baseFrequency * partial.ratio, 0.16);
    }

    nowRamp(voices.compressorFilter.frequency, 1200 + rpm * 3900, 0.18);
    nowRamp(voices.compressorGain.gain,
      (0.006 + 0.098 * Math.pow(rpm, 1.25)) * turbineShare, 0.16);

    // The turbine core retains a subdued combustion bed after bypass, while the ram path opens,
    // drops in resonance, and becomes the broad dominant voice.
    nowRamp(voices.coreFilter.frequency, 260 + rpm * 680 + throttle * 420, 0.18);
    nowRamp(voices.coreFilter.Q, 0.78 - handover * 0.24, 0.20);
    nowRamp(voices.coreGain.gain,
      (0.008 + 0.086 * Math.sqrt(rpm) * (0.35 + throttle * 0.65))
        * (1 - handover * 0.58), 0.20);
    nowRamp(voices.ramFilter.frequency, 330 + handover * 1370, 0.22);
    nowRamp(voices.ramFilter.Q, 0.62 - handover * 0.31, 0.22);
    nowRamp(voices.ramGain.gain,
      ramShare * (0.018 + throttle * 0.145) * (0.20 + rpm * 0.80), 0.22);

    // q, not throttle, owns the wind voice. Its band widens and brightens as the boundary layer
    // gains energy, so a high-speed idle descent still sounds fast.
    nowRamp(voices.rushHighpass.frequency, 90 + q01 * 260, 0.18);
    nowRamp(voices.rushLowpass.frequency, 850 + q01 * 5450, 0.18);
    nowRamp(voices.rushGain.gain, 0.115 * Math.pow(q01, 0.72), 0.18);
    nowRamp(voices.master.gain, muted ? 0 : 0.52, muted ? 0.02 : 0.20);
  } catch {
    disabled = true;
  }
}

function dynamicPressureFraction(state) {
  const speedMps = finiteNumber(state?.true_airspeed_mps)
    ?? ((finiteNumber(state?.true_airspeed_kts) ?? 0) * KNOTS_TO_MPS);
  const altitudeM = finiteNumber(state?.altitude_m, state?.py) ?? 0;
  const density = finiteNumber(state?.air_density_kg_m3) ?? isaDensity(altitudeM);
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
