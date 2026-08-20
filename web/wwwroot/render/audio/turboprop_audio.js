export const FIRE_BOSS_PROP_BLADE_COUNT = 5;
export const FIRE_BOSS_GOVERNED_PROP_RPM = 1_700;
export const FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS = 235;
export const FIRE_BOSS_REFERENCE_DROP_RATE_KGPS = 1_450;

const noiseBuffers = new WeakMap();
const pulseBuffers = new WeakMap();
const NOISE_PROFILES = Object.freeze({
  machinery: Object.freeze({ seconds: 3.17, seed: 0x802f67 }),
  hull: Object.freeze({ seconds: 4.61, seed: 0x48554c4c }),
  scoop: Object.freeze({ seconds: 2.83, seed: 0x53434f50 }),
  drop: Object.freeze({ seconds: 3.73, seed: 0x44524f50 }),
  cue: Object.freeze({ seconds: 1.97, seed: 0x57415452 }),
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function smoothstep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
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

function noiseBuffer(context, profileId = "machinery") {
  let buffers = noiseBuffers.get(context);
  if (!buffers) {
    buffers = new Map();
    noiseBuffers.set(context, buffers);
  }
  const cached = buffers.get(profileId);
  if (cached) return cached;
  const profile = NOISE_PROFILES[profileId] ?? NOISE_PROFILES.machinery;
  const length = Math.max(1, Math.floor(context.sampleRate * profile.seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = profile.seed;
  let brown = 0;
  for (let i = 0; i < length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    // A little correlated energy stops every low-frequency branch sounding like filtered hiss.
    brown = brown * 0.985 + white * 0.015;
    data[i] = clamp((white * 0.58 + brown * 1.1) * 0.72, -1, 1);
  }
  buffers.set(profileId, buffer);
  return buffer;
}

function loopingNoise(context, profileId) {
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, profileId);
  source.loop = true;
  source.start();
  return source;
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
  const publishedScoopRateKgps = finite(state.fireboss_scoop_rate_kgps);
  const scoopRateKgps = Math.max(0, publishedScoopRateKgps != null
    ? publishedScoopRateKgps
    : state.fireboss_scoop_valid === true ? FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS : 0);
  const scooping = scoopRateKgps > 0;
  const waterReleaseKg = Math.max(0, finite(state.fireboss_water_release_kg) ?? 0);
  const publishedDropRateKgps = finite(state.fireboss_water_release_rate_kgps);
  const hasLegacyDropEvidence = state.fireboss_drop_active === true || waterReleaseKg > 0;
  const dropRateKgps = Math.max(0, publishedDropRateKgps != null
    ? publishedDropRateKgps
    : hasLegacyDropEvidence ? FIRE_BOSS_REFERENCE_DROP_RATE_KGPS : 0);
  const dropping = dropRateKgps > 0;
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
    waterSpeed01: onWater ? smoothstep(speedKts / 90) : 0,
    scoopRateKgps,
    scoopFlow01: clamp(scoopRateKgps / FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS),
    scooping,
    waterReleaseKg,
    dropRateKgps,
    dropFlow01: clamp(dropRateKgps / FIRE_BOSS_REFERENCE_DROP_RATE_KGPS),
    dropAirspeed01: smoothstep(speedKts / 140),
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

  const source = loopingNoise(context, "machinery");

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

  // Water operations are three different physical sources. Independent seeds and non-commensurate
  // loop lengths keep hull spray, scoop ingestion and the airborne drop from collapsing into one
  // correlated hiss. Their gains remain entirely authority-driven below.
  const hullSource = loopingNoise(context, "hull");
  const hullHighpass = context.createBiquadFilter();
  hullHighpass.type = "highpass";
  hullHighpass.frequency.value = 145;
  hullHighpass.Q.value = 0.46;
  const hullLowpass = context.createBiquadFilter();
  hullLowpass.type = "lowpass";
  hullLowpass.frequency.value = 2_100;
  hullLowpass.Q.value = 0.55;
  const hullGain = context.createGain();
  hullGain.gain.value = 0;
  hullSource.connect(hullHighpass).connect(hullLowpass).connect(hullGain).connect(cabin);

  const scoopSource = loopingNoise(context, "scoop");
  const scoopFilter = context.createBiquadFilter();
  scoopFilter.type = "bandpass";
  scoopFilter.frequency.value = 610;
  scoopFilter.Q.value = 0.64;
  const scoopGain = context.createGain();
  scoopGain.gain.value = 0;
  scoopSource.connect(scoopFilter).connect(scoopGain).connect(cabin);

  const dropSource = loopingNoise(context, "drop");
  const dropHighpass = context.createBiquadFilter();
  dropHighpass.type = "highpass";
  dropHighpass.frequency.value = 125;
  dropHighpass.Q.value = 0.42;
  const dropLowpass = context.createBiquadFilter();
  dropLowpass.type = "lowpass";
  dropLowpass.frequency.value = 3_100;
  dropLowpass.Q.value = 0.56;
  const dropGain = context.createGain();
  dropGain.gain.value = 0;
  dropSource.connect(dropHighpass).connect(dropLowpass).connect(dropGain).connect(cabin);

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
    hullSource,
    hullHighpass,
    hullLowpass,
    hullGain,
    scoopSource,
    scoopFilter,
    scoopGain,
    dropSource,
    dropHighpass,
    dropLowpass,
    dropGain,
    waterCueBuffer: noiseBuffer(context, "cue"),
    waterCueState: null,
    cueCounts: {
      scoopStart: 0,
      scoopEnd: 0,
      dropStart: 0,
      dropEnd: 0,
    },
  };
}

/** Edge-only water-operation cues. The first observed frame is a baseline, never a fake event. */
export function advanceTurbopropWaterCueState(previous, acoustic) {
  const initialized = previous?.initialized === true;
  const scooping = acoustic?.scooping === true;
  const dropping = acoustic?.dropping === true;
  return Object.freeze({
    state: Object.freeze({ initialized: true, scooping, dropping }),
    cues: Object.freeze({
      scoopStart: initialized && scooping && previous.scooping !== true,
      scoopEnd: initialized && !scooping && previous.scooping === true,
      dropStart: initialized && dropping && previous.dropping !== true,
      dropEnd: initialized && !dropping && previous.dropping === true,
    }),
  });
}

function playWaterOperationCue(voices, context, cue) {
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = voices.waterCueBuffer;
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const config = {
    scoopStart: { type: "bandpass", frequencyHz: 470, q: 0.82, level: 0.075, seconds: 0.18 },
    scoopEnd: { type: "bandpass", frequencyHz: 330, q: 0.95, level: 0.050, seconds: 0.12 },
    dropStart: { type: "lowpass", frequencyHz: 720, q: 0.72, level: 0.105, seconds: 0.24 },
    dropEnd: { type: "lowpass", frequencyHz: 430, q: 0.88, level: 0.064, seconds: 0.16 },
  }[cue];
  if (!config) return;
  filter.type = config.type;
  filter.frequency.value = config.frequencyHz;
  filter.Q.value = config.q;
  setAt(gain.gain, Math.max(0.0001, config.level), now);
  rampAt(gain.gain, 0.0001, now + config.seconds);
  source.connect(filter).connect(gain).connect(voices.cabin);
  source.start(now);
  source.stop?.(now + config.seconds + 0.01);
  voices.cueCounts[cue] += 1;
}

export function updateTurbopropAudioVoices(voices, context, state = {}, { muted = false } = {}) {
  if (!voices || !context) return null;
  const now = context.currentTime;
  const acoustic = projectTurbopropAcoustics(state);
  const live = !muted && acoustic.engineRunning && acoustic.propRpm > 1;
  const propEnergy = 0.38 + acoustic.torque01 * 0.62;
  const waterEdge = advanceTurbopropWaterCueState(voices.waterCueState, acoustic);
  voices.waterCueState = waterEdge.state;
  if (live) {
    for (const [cue, shouldPlay] of Object.entries(waterEdge.cues)) {
      if (shouldPlay) playWaterOperationCue(voices, context, cue);
    }
  }

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
  smooth(voices.hullHighpass.frequency, 115 + acoustic.waterSpeed01 * 285, now, 0.08);
  smooth(voices.hullLowpass.frequency, 1_250 + acoustic.waterSpeed01 * 2_450, now, 0.08);
  smooth(voices.hullGain.gain,
    live && acoustic.onWater ? Math.pow(acoustic.waterSpeed01, 1.28) * 0.15 : 0,
    now, 0.055);
  smooth(voices.scoopFilter.frequency,
    420 + acoustic.scoopFlow01 * 390 + acoustic.waterSpeed01 * 250, now, 0.055);
  smooth(voices.scoopGain.gain,
    live && acoustic.scooping
      ? acoustic.scoopFlow01 * (0.085 + acoustic.waterSpeed01 * 0.075)
      : 0,
    now, acoustic.scooping ? 0.028 : 0.09);
  smooth(voices.dropHighpass.frequency, 90 + acoustic.dropAirspeed01 * 175, now, 0.05);
  smooth(voices.dropLowpass.frequency, 1_850 + acoustic.dropAirspeed01 * 2_350, now, 0.05);
  smooth(voices.dropGain.gain,
    live && acoustic.dropping
      ? acoustic.dropFlow01 * (0.105 + acoustic.dropAirspeed01 * 0.125)
      : 0,
    now, acoustic.dropping ? 0.025 : 0.11);
  return acoustic;
}
