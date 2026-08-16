export const FIRE_BOSS_PROP_BLADE_COUNT = 5;
export const FIRE_BOSS_GOVERNED_PROP_RPM = 1_700;

const noiseBuffers = new WeakMap();
const pulseBuffers = new WeakMap();

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function finite(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function smooth(param, value, now, timeConstant = 0.06) {
  param.setTargetAtTime(value, now, timeConstant);
}

function noiseBuffer(context) {
  const cached = noiseBuffers.get(context);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(context.sampleRate * 3));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x802f67;
  let brown = 0;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    // A little correlated energy stops every low-frequency branch sounding like filtered hiss.
    brown = brown * 0.985 + white * 0.015;
    data[i] = clamp((white * 0.58 + brown * 1.1) * 0.72, -1, 1);
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}

function pressurePulseBuffer(context) {
  const cached = pulseBuffers.get(context);
  if (cached) return cached;
  const length = 4_096;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const phase = i / length * Math.PI * 2;
    // One asymmetric blade-pressure event per cycle. Band-limited harmonics avoid the buzzy
    // edge of a sawtooth while retaining the compact pulse heard behind a five-blade disc.
    data[i] = Math.sin(phase) * 0.66
      + Math.sin(phase * 2 + 0.34) * 0.25
      + Math.sin(phase * 3 - 0.72) * 0.11
      + Math.sin(phase * 4 + 1.08) * 0.045;
  }
  const result = Object.freeze({ buffer, nativeCycleHz: context.sampleRate / length });
  pulseBuffers.set(context, result);
  return result;
}

export function propellerBladePassHz(rpm, bladeCount = FIRE_BOSS_PROP_BLADE_COUNT) {
  return Math.max(0, Number(rpm) || 0) * Math.max(1, Math.trunc(Number(bladeCount) || 1)) / 60;
}

/**
 * Convert mission authority into the acoustic controls of a PT6A/free-turbine installation.
 * Prop speed and power are deliberately separate: once the takeoff propeller is governed, moving
 * the power lever changes torque and gas-generator energy without sweeping propeller pitch.
 */
export function projectTurbopropAcoustics(state = {}) {
  const engineRunning = state.engine_running === false
    ? false
    : finite(state.fuel_lb) == null || finite(state.fuel_lb) > 0;
  const powerLever01 = clamp(finite(state.applied_throttle, state.throttle) ?? 0);
  const engineSpool01 = clamp(finite(
    state.engine_spool_fraction,
    state.engine,
    powerLever01,
  ) ?? 0);
  const publishedPropRpm = finite(state.propeller_rpm, state.prop_rpm);
  const propRpm = engineRunning
    ? Math.max(0, publishedPropRpm ?? FIRE_BOSS_GOVERNED_PROP_RPM)
    : 0;
  const bladeCount = Math.max(1, Math.trunc(finite(
    state.propeller_blade_count,
    FIRE_BOSS_PROP_BLADE_COUNT,
  )));
  const torque01 = engineRunning
    ? clamp(finite(state.engine_torque_fraction, powerLever01) ?? 0)
    : 0;
  const ng01 = engineRunning
    ? clamp((finite(state.engine_ng_pct) ?? (61 + engineSpool01 * 36)) / 100)
    : 0;
  const speedKts = Math.max(0, finite(state.true_airspeed_kts) ?? 0);
  const surface = String(state.fireboss_surface ?? "").toLowerCase();
  const onWater = surface === "water";
  const scooping = state.fireboss_scoop_valid === true;
  const dropping = state.fireboss_drop_active === true;
  const shaftHz = propRpm / 60;
  const bladePassHz = propellerBladePassHz(propRpm, bladeCount);

  return Object.freeze({
    engineRunning,
    powerLever01,
    engineSpool01,
    torque01,
    ng01,
    propRpm,
    bladeCount,
    shaftHz,
    bladePassHz,
    // The audible compressor feature sits above the prop disc and moves with Ng, not prop RPM.
    compressorHz: 2_550 + ng01 * 1_850,
    speedKts,
    onWater,
    scooping,
    dropping,
  });
}

/** PT6A + five-blade constant-speed propeller cockpit graph on the shared flight-audio bus. */
export function createTurbopropAudioVoices(context, destination) {
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(destination);

  const cabin = context.createBiquadFilter();
  cabin.type = "lowpass";
  cabin.frequency.value = 4_200;
  cabin.Q.value = 0.58;
  cabin.connect(master);

  // A rights-cleared, single-engine PT6 recording supplies the non-repeating machinery texture.
  // Its low prop orders are removed in the asset so the live five-blade graph below remains the
  // sole authority for Np and blade-pass cadence.
  const decodedBedInput = context.createGain();
  decodedBedInput.gain.value = 0;
  decodedBedInput.connect(cabin);

  const pulseShape = pressurePulseBuffer(context);
  const propPulse = context.createBufferSource();
  propPulse.buffer = pulseShape.buffer;
  propPulse.loop = true;
  const propBodyFilter = context.createBiquadFilter();
  propBodyFilter.type = "bandpass";
  propBodyFilter.frequency.value = 142;
  propBodyFilter.Q.value = 0.78;
  const propBodyGain = context.createGain();
  propBodyGain.gain.value = 0;
  propPulse.connect(propBodyFilter).connect(propBodyGain).connect(cabin);

  const propHarmonicFilter = context.createBiquadFilter();
  propHarmonicFilter.type = "bandpass";
  propHarmonicFilter.frequency.value = 310;
  propHarmonicFilter.Q.value = 0.72;
  const propHarmonicGain = context.createGain();
  propHarmonicGain.gain.value = 0;
  propPulse.connect(propHarmonicFilter).connect(propHarmonicGain).connect(cabin);
  propPulse.start();

  const shaft = context.createOscillator();
  shaft.type = "sine";
  const shaftGain = context.createGain();
  shaftGain.gain.value = 0;
  shaft.connect(shaftGain).connect(cabin);
  shaft.start();

  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context);
  source.loop = true;

  // Broadband pressure noise is amplitude-modulated at blade-pass cadence. That preserves the
  // propeller's chopped-air texture without turning the whole engine into a pitched oscillator.
  const propWashGain = context.createGain();
  propWashGain.gain.value = 0;
  const propWashFilter = context.createBiquadFilter();
  propWashFilter.type = "bandpass";
  propWashFilter.frequency.value = 480;
  propWashFilter.Q.value = 0.52;
  const propWashOutput = context.createGain();
  propWashOutput.gain.value = 0;
  source.connect(propWashGain).connect(propWashFilter).connect(propWashOutput).connect(cabin);
  const propModulator = context.createOscillator();
  propModulator.type = "sine";
  const propModDepth = context.createGain();
  propModDepth.gain.value = 0;
  propModulator.connect(propModDepth).connect(propWashGain.gain);
  propModulator.start();

  const exhaustFilter = context.createBiquadFilter();
  exhaustFilter.type = "bandpass";
  exhaustFilter.frequency.value = 390;
  exhaustFilter.Q.value = 0.48;
  const exhaustGain = context.createGain();
  exhaustGain.gain.value = 0;
  source.connect(exhaustFilter).connect(exhaustGain).connect(cabin);

  const gearboxFilter = context.createBiquadFilter();
  gearboxFilter.type = "bandpass";
  gearboxFilter.frequency.value = 920;
  gearboxFilter.Q.value = 1.15;
  const gearboxGain = context.createGain();
  gearboxGain.gain.value = 0;
  source.connect(gearboxFilter).connect(gearboxGain).connect(cabin);

  const compressorFilter = context.createBiquadFilter();
  compressorFilter.type = "bandpass";
  compressorFilter.frequency.value = 3_700;
  compressorFilter.Q.value = 2.1;
  const compressorGain = context.createGain();
  compressorGain.gain.value = 0;
  source.connect(compressorFilter).connect(compressorGain).connect(cabin);
  const compressor = context.createOscillator();
  compressor.type = "sine";
  const compressorToneGain = context.createGain();
  compressorToneGain.gain.value = 0;
  compressor.connect(compressorToneGain).connect(cabin);
  compressor.start();

  const airFilter = context.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 900;
  airFilter.Q.value = 0.55;
  const airGain = context.createGain();
  airGain.gain.value = 0;
  source.connect(airFilter).connect(airGain).connect(cabin);

  const waterFilter = context.createBiquadFilter();
  waterFilter.type = "highpass";
  waterFilter.frequency.value = 480;
  const waterGain = context.createGain();
  waterGain.gain.value = 0;
  source.connect(waterFilter).connect(waterGain).connect(cabin);
  source.start();

  return {
    master,
    cabin,
    decodedBedInput,
    propPulse,
    propPulseNativeHz: pulseShape.nativeCycleHz,
    propBodyFilter,
    propBodyGain,
    propHarmonicFilter,
    propHarmonicGain,
    shaft,
    shaftGain,
    propWashGain,
    propWashFilter,
    propWashOutput,
    propModulator,
    propModDepth,
    exhaustFilter,
    exhaustGain,
    gearboxFilter,
    gearboxGain,
    compressor,
    compressorFilter,
    compressorGain,
    compressorToneGain,
    airFilter,
    airGain,
    waterGain,
  };
}

export function updateTurbopropAudioVoices(voices, context, state = {}, { muted = false } = {}) {
  if (!voices || !context) return null;
  const now = context.currentTime;
  const acoustic = projectTurbopropAcoustics(state);
  const live = !muted && acoustic.engineRunning && acoustic.propRpm > 1;
  const propEnergy = 0.38 + acoustic.torque01 * 0.62;

  smooth(voices.master.gain, live ? 0.47 : 0, now, live ? 0.18 : 0.035);
  smooth(voices.decodedBedInput.gain,
    live ? 0.31 + acoustic.torque01 * 0.10 : 0, now, live ? 0.16 : 0.04);
  smooth(voices.propPulse.playbackRate,
    acoustic.bladePassHz / Math.max(1, voices.propPulseNativeHz), now, 0.12);
  smooth(voices.propBodyFilter.frequency, Math.max(70, acoustic.bladePassHz * 1.02), now, 0.1);
  smooth(voices.propBodyGain.gain, live ? 0.115 * propEnergy : 0, now, 0.08);
  smooth(voices.propHarmonicFilter.frequency,
    Math.max(160, acoustic.bladePassHz * 2.16), now, 0.1);
  smooth(voices.propHarmonicGain.gain, live ? 0.042 * propEnergy : 0, now, 0.08);
  smooth(voices.shaft.frequency, Math.max(12, acoustic.shaftHz), now, 0.12);
  smooth(voices.shaftGain.gain, live ? 0.018 + acoustic.torque01 * 0.012 : 0, now, 0.1);

  smooth(voices.propModulator.frequency, acoustic.bladePassHz, now, 0.1);
  smooth(voices.propWashGain.gain, live ? 0.52 : 0, now, 0.08);
  smooth(voices.propModDepth.gain, live ? 0.31 : 0, now, 0.08);
  smooth(voices.propWashFilter.frequency, 390 + acoustic.torque01 * 250, now, 0.1);
  smooth(voices.propWashOutput.gain, live ? 0.075 * propEnergy : 0, now, 0.08);

  smooth(voices.exhaustFilter.frequency, 280 + acoustic.torque01 * 290, now, 0.09);
  smooth(voices.exhaustGain.gain, live ? 0.035 + acoustic.torque01 * 0.13 : 0, now, 0.07);
  smooth(voices.gearboxFilter.frequency, 790 + acoustic.torque01 * 430, now, 0.1);
  smooth(voices.gearboxGain.gain, live ? 0.018 + acoustic.torque01 * 0.022 : 0, now, 0.1);
  smooth(voices.compressor.frequency, acoustic.compressorHz, now, 0.14);
  smooth(voices.compressorFilter.frequency, acoustic.compressorHz * 0.91, now, 0.14);
  smooth(voices.compressorGain.gain, live ? 0.012 + acoustic.ng01 * 0.034 : 0, now, 0.12);
  smooth(voices.compressorToneGain.gain, live ? 0.003 + acoustic.ng01 * 0.006 : 0, now, 0.14);

  smooth(voices.airFilter.frequency, 520 + Math.min(190, acoustic.speedKts) * 9, now, 0.1);
  smooth(voices.airGain.gain,
    live ? Math.pow(clamp(acoustic.speedKts / 150), 1.7) * 0.085 : 0, now, 0.1);
  smooth(voices.waterGain.gain, live && (acoustic.onWater || acoustic.scooping || acoustic.dropping)
    ? (acoustic.onWater ? 0.15 : 0)
      + (acoustic.scooping ? 0.16 : 0)
      + (acoustic.dropping ? 0.19 : 0)
    : 0, now, acoustic.dropping ? 0.025 : 0.08);
  return acoustic;
}
