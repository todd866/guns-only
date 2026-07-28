// Rapier / jet ownship sound — Approach B hybrid after pure synth failed the ear gate twice.
//
// Real fighter exhaust is too complex for subtractive-only Web Audio. Sample beds carry the
// jet identity (idle / mil / grit loops under samples/jet/); procedural layers handle rush,
// tonal accents, breath, coast silence, and turbine→ram handover. If beds are missing, the
// procedural stack remains as a degraded fallback.
//
// Sample beds are local/dev until replaced with confirmed CC0 / US-gov PD sources
// (see samples/jet/SOURCES.md). Density / coast gating still applies to everything.
// F-22s use sealed-cockpit beds (spectral-matched to demo cam); Rapier keeps F-4 AB beds.
// See audio_character.js + samples/jet/SOURCES.md.

import { resolvePropulsionCharacter } from "./audio_character.js";

const FAN_ORDER_RATIOS = Object.freeze([
  1.0, 1.97, 2.99, 4.03, 4.96, 6.02, 7.05, 8.11,
]);
const FAN_ORDER_LEVELS = Object.freeze([
  1.0, 0.62, 0.4, 0.26, 0.17, 0.11, 0.07, 0.045,
]);
const SPOOL_UP_PER_SECOND = 0.22;
const SPOOL_DOWN_PER_SECOND = 0.34;
// Matches Rapier map overlap (turbine fade / ram light) — teach handover by ear.
const HANDOVER_MACH_START = 1.9;
const HANDOVER_MACH_END = 2.8;
const POWER_UP_PER_SECOND = 1.8;
const POWER_DOWN_PER_SECOND = 2.6;
const ACCENT_DECAY_PER_SECOND = 3.2;
const MAX_CONTROL_STEP_SECONDS = 0.25;
const KNOTS_TO_MPS = 0.514444;
const SEA_LEVEL_DENSITY = 1.225;
const THRUST_REF_KN = 140;
const DEFAULT_SAMPLE_BASE = new URL("./samples/jet/", import.meta.url).href;

let context = null;
let voices = null;
let disabled = false;

function makeDistortionCurve(amount = 28) {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function makeAbsCurve() {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.abs(x);
  }
  return curve;
}

/// Build the continuous propulsion / rush graph into `destination`.
export function createEngineVoices(audioContext, destination, { includeMaster = true } = {}) {
  const master = includeMaster ? audioContext.createGain() : null;
  if (master) {
    master.gain.value = 0;
    master.connect(destination);
  }
  const output = master ?? destination;

  // Propulsion bus with cabin-ish ceiling — tip is seasoning, not the identity.
  const propBus = audioContext.createGain();
  propBus.gain.value = 1;
  const cabinLp = audioContext.createBiquadFilter();
  cabinLp.type = "lowpass";
  cabinLp.frequency.value = 4200;
  cabinLp.Q.value = 0.7;
  // Living master VCA on the propulsion bus (multiplicative breath).
  const liveVca = audioContext.createGain();
  liveVca.gain.value = 0;
  const liveBias = audioContext.createConstantSource
    ? audioContext.createConstantSource()
    : null;
  if (liveBias) {
    liveBias.offset.value = 1;
    liveBias.connect(liveVca.gain);
    liveBias.start();
  }
  propBus.connect(cabinLp).connect(liveVca).connect(output);

  // Sample bed bus — real jet loops bypass the aggressive cabin darkening (they already have
  // the right spectrum). HP cuts rumble that reads as blade-pass; mild LP kills decode hiss.
  const sampleBus = audioContext.createGain();
  sampleBus.gain.value = 1;
  const sampleHp = audioContext.createBiquadFilter();
  sampleHp.type = "highpass";
  sampleHp.frequency.value = 95;
  sampleHp.Q.value = 0.7;
  const sampleLp = audioContext.createBiquadFilter();
  sampleLp.type = "lowpass";
  sampleLp.frequency.value = 12000;
  sampleLp.Q.value = 0.5;
  sampleBus.connect(sampleHp).connect(sampleLp).connect(liveVca);

  const sampleIdleGain = audioContext.createGain();
  sampleIdleGain.gain.value = 0;
  sampleIdleGain.connect(sampleBus);
  const sampleMilGain = audioContext.createGain();
  sampleMilGain.gain.value = 0;
  sampleMilGain.connect(sampleBus);
  const sampleGritGain = audioContext.createGain();
  sampleGritGain.gain.value = 0;
  sampleGritGain.connect(sampleBus);

  // --- Irregular modulation field ---
  // Pre-baked slow random-walk envelopes beat LP'd white for audible "alive" CV.
  const breathSource = audioContext.createBufferSource();
  breathSource.buffer = randomWalkBuffer(audioContext, 0xB2EA7, 0.55, 3.5);
  breathSource.loop = true;
  const breathDepth = audioContext.createGain();
  breathDepth.gain.value = 0;
  breathSource.connect(breathDepth);
  breathDepth.connect(liveVca.gain);

  const modNoise = audioContext.createBufferSource();
  modNoise.buffer = whiteNoiseBuffer(audioContext, 0x4d0d01);
  modNoise.loop = true;
  const modAbs = audioContext.createWaveShaper();
  modAbs.curve = makeAbsCurve();
  const shimmerLp = audioContext.createBiquadFilter();
  shimmerLp.type = "lowpass";
  shimmerLp.frequency.value = 28;
  shimmerLp.Q.value = 0.7;
  const shimmerDepth = audioContext.createGain();
  shimmerDepth.gain.value = 0;
  modNoise.connect(modAbs).connect(shimmerLp).connect(shimmerDepth);

  const crackleModLp = audioContext.createBiquadFilter();
  crackleModLp.type = "lowpass";
  crackleModLp.frequency.value = 70;
  crackleModLp.Q.value = 0.7;
  const crackleModDepth = audioContext.createGain();
  crackleModDepth.gain.value = 0;
  modAbs.connect(crackleModLp).connect(crackleModDepth);

  // --- Shaft / N1 growl (rotor unbalance fundamental — cockpit "growl") ---
  const shaftOsc = audioContext.createOscillator();
  shaftOsc.type = "sawtooth";
  shaftOsc.frequency.value = 95;
  const shaftFilter = audioContext.createBiquadFilter();
  shaftFilter.type = "lowpass";
  shaftFilter.frequency.value = 420;
  shaftFilter.Q.value = 1.1;
  const shaftGain = audioContext.createGain();
  shaftGain.gain.value = 0;
  shaftOsc.connect(shaftFilter).connect(shaftGain).connect(propBus);
  shaftOsc.start();

  // --- Fan / compressor tonal stack ---
  const fanOrderGain = audioContext.createGain();
  fanOrderGain.gain.value = 0;
  const fanOrderHp = audioContext.createBiquadFilter();
  fanOrderHp.type = "highpass";
  fanOrderHp.frequency.value = 160;
  fanOrderHp.Q.value = 0.7;
  const fanOrderLp = audioContext.createBiquadFilter();
  fanOrderLp.type = "lowpass";
  fanOrderLp.frequency.value = 4200;
  fanOrderLp.Q.value = 0.55;
  fanOrderGain.connect(fanOrderHp).connect(fanOrderLp).connect(propBus);

  const flutterLfo = audioContext.createOscillator();
  flutterLfo.type = "sine";
  flutterLfo.frequency.value = 4.7;
  const flutterDepth = audioContext.createGain();
  flutterDepth.gain.value = 0;
  flutterLfo.start();

  const fanOrders = FAN_ORDER_RATIOS.map((ratio, index) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = 210 * ratio;
    const gain = audioContext.createGain();
    gain.gain.value = FAN_ORDER_LEVELS[index];
    oscillator.connect(gain).connect(fanOrderGain);
    // Detune flutter (cents) — incommensurate depth per order so lines shimmer independently.
    const orderFlutter = audioContext.createGain();
    orderFlutter.gain.value = 4 + index * 1.6;
    flutterLfo.connect(orderFlutter).connect(oscillator.detune);
    shimmerDepth.connect(gain.gain);
    oscillator.start();
    return { oscillator, ratio, gain, orderFlutter };
  });

  // Shared pink / white / crackle beds.
  const pinkBuffer = pinkNoiseBuffer(audioContext, 22695477);
  const whiteBuffer = whiteNoiseBuffer(audioContext, 0x0c0ffee);
  const pinkSource = audioContext.createBufferSource();
  pinkSource.buffer = pinkBuffer;
  pinkSource.loop = true;
  const whiteSource = audioContext.createBufferSource();
  whiteSource.buffer = whiteBuffer;
  whiteSource.loop = true;
  const whiteGritHi = audioContext.createBufferSource();
  whiteGritHi.buffer = whiteNoiseBuffer(audioContext, 0x61a7e);
  whiteGritHi.loop = true;

  // Core combustion body.
  const coreFilter = audioContext.createBiquadFilter();
  coreFilter.type = "bandpass";
  coreFilter.frequency.value = 520;
  coreFilter.Q.value = 0.85;
  const coreGain = audioContext.createGain();
  coreGain.gain.value = 0;
  pinkSource.connect(coreFilter).connect(coreGain).connect(propBus);

  // Jet rumble body.
  const jetBodyFilter = audioContext.createBiquadFilter();
  jetBodyFilter.type = "lowpass";
  jetBodyFilter.frequency.value = 320;
  jetBodyFilter.Q.value = 1.45;
  const jetBodyGain = audioContext.createGain();
  jetBodyGain.gain.value = 0;
  pinkSource.connect(jetBodyFilter).connect(jetBodyGain);

  // Mid grit (0.8–3 kHz) — harshness / turbulence.
  const jetGritFilter = audioContext.createBiquadFilter();
  jetGritFilter.type = "bandpass";
  jetGritFilter.frequency.value = 1500;
  jetGritFilter.Q.value = 0.85;
  const jetGritPre = audioContext.createGain();
  jetGritPre.gain.value = 0;
  whiteSource.connect(jetGritFilter).connect(jetGritPre);

  // High grit (2–5 kHz) — AB edge / combustor spit.
  const jetGritHiFilter = audioContext.createBiquadFilter();
  jetGritHiFilter.type = "bandpass";
  jetGritHiFilter.frequency.value = 3200;
  jetGritHiFilter.Q.value = 1.1;
  const jetGritHiPre = audioContext.createGain();
  jetGritHiPre.gain.value = 0;
  whiteGritHi.connect(jetGritHiFilter).connect(jetGritHiPre);

  // Slow LFO AM on mid grit (texture floor) + irregular noise AM on top.
  const crackleLfo = audioContext.createOscillator();
  crackleLfo.type = "triangle";
  crackleLfo.frequency.value = 17;
  const crackleDepth = audioContext.createGain();
  crackleDepth.gain.value = 0;
  const gritAmp = audioContext.createGain();
  gritAmp.gain.value = 0;
  const gritBias = audioContext.createConstantSource
    ? audioContext.createConstantSource()
    : null;
  if (gritBias) {
    gritBias.offset.value = 0.5;
    gritBias.connect(gritAmp.gain);
    gritBias.start();
  }
  crackleLfo.connect(crackleDepth).connect(gritAmp.gain);
  crackleModDepth.connect(gritAmp.gain);
  jetGritPre.connect(gritAmp);
  crackleLfo.start();

  const gritHiAmp = audioContext.createGain();
  gritHiAmp.gain.value = 0;
  const gritHiBias = audioContext.createConstantSource
    ? audioContext.createConstantSource()
    : null;
  if (gritHiBias) {
    gritHiBias.offset.value = 0.4;
    gritHiBias.connect(gritHiAmp.gain);
    gritHiBias.start();
  }
  crackleModDepth.connect(gritHiAmp.gain);
  jetGritHiPre.connect(gritHiAmp);

  // Impulsive crackle — sparse clicks (vertical spectrogram spikes under power).
  const crackleSource = audioContext.createBufferSource();
  crackleSource.buffer = crackleImpulseBuffer(audioContext, 0xC2AC1E);
  crackleSource.loop = true;
  const crackleHp = audioContext.createBiquadFilter();
  crackleHp.type = "highpass";
  crackleHp.frequency.value = 900;
  crackleHp.Q.value = 0.5;
  const crackleBp = audioContext.createBiquadFilter();
  crackleBp.type = "bandpass";
  crackleBp.frequency.value = 2400;
  crackleBp.Q.value = 0.6;
  const crackleImpulseGain = audioContext.createGain();
  crackleImpulseGain.gain.value = 0;
  crackleSource.connect(crackleHp).connect(crackleBp).connect(crackleImpulseGain);

  // Exhaust mix → saturation → prop bus.
  const jetMix = audioContext.createGain();
  jetMix.gain.value = 1;
  jetBodyGain.connect(jetMix);
  gritAmp.connect(jetMix);
  gritHiAmp.connect(jetMix);
  crackleImpulseGain.connect(jetMix);
  const jetShaper = audioContext.createWaveShaper();
  jetShaper.curve = makeDistortionCurve(40);
  jetShaper.oversample = "2x";
  const jetOut = audioContext.createGain();
  jetOut.gain.value = 1;
  jetMix.connect(jetShaper).connect(jetOut).connect(propBus);

  // Exhaust pipe resonance.
  const jetTap = audioContext.createGain();
  jetTap.gain.value = 0.26;
  jetMix.connect(jetTap);
  const exhaustDelay = audioContext.createDelay(0.05);
  exhaustDelay.delayTime.value = 0.011;
  const exhaustFeedback = audioContext.createGain();
  exhaustFeedback.gain.value = 0.32;
  const exhaustFilter = audioContext.createBiquadFilter();
  exhaustFilter.type = "lowpass";
  exhaustFilter.frequency.value = 2200;
  exhaustFilter.Q.value = 0.55;
  const exhaustOut = audioContext.createGain();
  exhaustOut.gain.value = 0;
  jetTap.connect(exhaustDelay);
  exhaustDelay.connect(exhaustFilter).connect(exhaustOut).connect(propBus);
  exhaustFilter.connect(exhaustFeedback).connect(exhaustDelay);

  // Fan tip / BPF whine — identity whistle (must be audible as a line, not buried).
  const fanWhineFilter = audioContext.createBiquadFilter();
  fanWhineFilter.type = "bandpass";
  fanWhineFilter.frequency.value = 2800;
  fanWhineFilter.Q.value = 11;
  const fanWhineGain = audioContext.createGain();
  fanWhineGain.gain.value = 0;
  pinkSource.connect(fanWhineFilter).connect(fanWhineGain).connect(propBus);
  shimmerDepth.connect(fanWhineGain.gain);

  // Second BPF harmonic (2× tip) for denser tonal comb.
  const fanWhine2Filter = audioContext.createBiquadFilter();
  fanWhine2Filter.type = "bandpass";
  fanWhine2Filter.frequency.value = 5600;
  fanWhine2Filter.Q.value = 9;
  const fanWhine2Gain = audioContext.createGain();
  fanWhine2Gain.gain.value = 0;
  pinkSource.connect(fanWhine2Filter).connect(fanWhine2Gain).connect(propBus);

  // Ram duct — hollow broadband body (distinct from turbine jet LP rumble).
  const ramFilter = audioContext.createBiquadFilter();
  ramFilter.type = "bandpass";
  ramFilter.frequency.value = 700;
  ramFilter.Q.value = 0.55;
  const ramGain = audioContext.createGain();
  ramGain.gain.value = 0;
  pinkSource.connect(ramFilter).connect(ramGain).connect(propBus);

  // Ram inlet howl — higher-Q mid line that grows with Mach (the "tonal shift").
  const ramHowlFilter = audioContext.createBiquadFilter();
  ramHowlFilter.type = "bandpass";
  ramHowlFilter.frequency.value = 1800;
  ramHowlFilter.Q.value = 2.4;
  const ramHowlGain = audioContext.createGain();
  ramHowlGain.gain.value = 0;
  whiteSource.connect(ramHowlFilter).connect(ramHowlGain).connect(propBus);

  // Ram spit — sparse HF edge once the duct owns thrust (not turbine crackle).
  const ramSpitFilter = audioContext.createBiquadFilter();
  ramSpitFilter.type = "highpass";
  ramSpitFilter.frequency.value = 2800;
  ramSpitFilter.Q.value = 0.6;
  const ramSpitGain = audioContext.createGain();
  ramSpitGain.gain.value = 0;
  whiteGritHi.connect(ramSpitFilter).connect(ramSpitGain).connect(propBus);

  // Airframe / q rush (outside cabin LP so high-q stays bright).
  const airframeNoise = audioContext.createBufferSource();
  airframeNoise.buffer = pinkNoiseBuffer(audioContext, 0x051f15e);
  airframeNoise.loop = true;
  const rushHighpass = audioContext.createBiquadFilter();
  rushHighpass.type = "highpass";
  rushHighpass.frequency.value = 120;
  rushHighpass.Q.value = 0.45;
  const rushLowpass = audioContext.createBiquadFilter();
  rushLowpass.type = "lowpass";
  rushLowpass.frequency.value = 1100;
  rushLowpass.Q.value = 0.55;
  const rushGain = audioContext.createGain();
  rushGain.gain.value = 0;
  airframeNoise.connect(rushHighpass).connect(rushLowpass).connect(rushGain).connect(output);

  modNoise.start();
  breathSource.start();
  pinkSource.start();
  whiteSource.start();
  whiteGritHi.start();
  crackleSource.start();
  airframeNoise.start();

  return {
    master,
    cabinLp,
    liveVca,
    sampleBus,
    sampleHp,
    sampleLp,
    sampleIdleGain,
    sampleMilGain,
    sampleGritGain,
    sampleIdle: null,
    sampleMil: null,
    sampleGrit: null,
    hasSampleBeds: false,
    sampleBedCharacter: null,
    shaftOsc,
    shaftFilter,
    shaftGain,
    fanOrderGain,
    fanOrderHp,
    fanOrderLp,
    fanOrders,
    flutterLfo,
    flutterDepth,
    breathDepth,
    shimmerDepth,
    crackleModDepth,
    coreFilter,
    coreGain,
    jetBodyFilter,
    jetBodyGain,
    jetGritFilter,
    jetGritPre,
    jetGritHiFilter,
    jetGritHiPre,
    crackleLfo,
    crackleDepth,
    crackleImpulseGain,
    jetOut,
    exhaustDelay,
    exhaustFeedback,
    exhaustOut,
    fanWhineFilter,
    fanWhineGain,
    fanWhine2Filter,
    fanWhine2Gain,
    ramFilter,
    ramGain,
    ramHowlFilter,
    ramHowlGain,
    ramSpitFilter,
    ramSpitGain,
    rushHighpass,
    rushLowpass,
    rushGain,
    spoolRpm: 0,
    powerSlew: 0,
    throttleAccent: 0,
    lastControlTime: audioContext.currentTime,
  };
}

/// Decode idle/mil/grit loops. Fail-soft: missing files → empty object (procedural fallback).
/// Pass `character: "f22"` for sealed-cockpit beds (`f22_*_loop.wav`).
export async function loadJetSampleBeds(audioContext, {
  baseUrl = DEFAULT_SAMPLE_BASE,
  character = "rapier",
} = {}) {
  if (!audioContext?.decodeAudioData) return {};
  const prefix = character === "f22" ? "f22_" : "";
  const entries = [
    ["idle", `${prefix}idle_loop.wav`],
    ["mil", `${prefix}mil_loop.wav`],
    ["grit", `${prefix}grit_loop.wav`],
  ];
  const beds = {};
  await Promise.all(entries.map(async ([key, file]) => {
    try {
      const url = new URL(file, baseUrl).href;
      const response = await fetch(url);
      if (!response.ok) return;
      const raw = await response.arrayBuffer();
      beds[key] = await audioContext.decodeAudioData(raw.slice(0));
    } catch {
      // Missing beds are expected in CI / fresh trees.
    }
  }));
  return beds;
}

/// Wire decoded beds onto an existing voice graph. Safe to call once; no-ops if already attached
/// or if `mil` is missing (need at least the power bed).
/// `character` tags which aircraft the beds belong to so the mix path can refuse a mismatch.
export function attachJetSampleBeds(voiceGraph, audioContext, beds, {
  character = "rapier",
} = {}) {
  if (!voiceGraph || !audioContext || voiceGraph.hasSampleBeds) return false;
  if (!beds?.mil) return false;

  const startBed = (buffer, gainNode) => {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 1;
    source.connect(gainNode);
    source.start();
    return source;
  };

  voiceGraph.sampleMil = startBed(beds.mil, voiceGraph.sampleMilGain);
  if (beds.idle) {
    voiceGraph.sampleIdle = startBed(beds.idle, voiceGraph.sampleIdleGain);
  }
  if (beds.grit) {
    voiceGraph.sampleGrit = startBed(beds.grit, voiceGraph.sampleGritGain);
  }
  voiceGraph.hasSampleBeds = true;
  voiceGraph.sampleBedCharacter = character;
  return true;
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

export function whiteNoiseBuffer(audioContext, initialSeed) {
  const frames = Math.max(1, Math.floor(audioContext.sampleRate * 2));
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = initialSeed & 0x7fffffff;
  for (let i = 0; i < frames; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    channel[i] = seed / 0x3fffffff - 1;
  }
  return buffer;
}

/// Slow bipolar random walk in [-1, 1] — deep irregular envelope without LP'd white's tiny AC.
export function randomWalkBuffer(audioContext, initialSeed, stepScale = 0.3, seconds = 4) {
  const frames = Math.max(1, Math.floor(audioContext.sampleRate * seconds));
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = initialSeed & 0x7fffffff;
  let value = 0;
  for (let i = 0; i < frames; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const step = (seed / 0x3fffffff - 1) * stepScale;
    value = Math.max(-1, Math.min(1, value * 0.998 + step));
    channel[i] = value;
  }
  return buffer;
}

/// Sparse impulsive clicks — spectrogram verticals under MIL / AB.
export function crackleImpulseBuffer(audioContext, initialSeed) {
  const frames = Math.max(1, Math.floor(audioContext.sampleRate * 2.5));
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = initialSeed & 0x7fffffff;
  const rate = audioContext.sampleRate;
  let next = Math.floor(rate * 0.03);
  while (next < frames - 64) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const polarity = seed & 1 ? 1 : -1;
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const amp = 0.35 + (seed / 0x7fffffff) * 0.65;
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const decaySamples = Math.floor(rate * (0.0012 + (seed / 0x7fffffff) * 0.0035));
    for (let i = 0; i < decaySamples && next + i < frames; i++) {
      channel[next + i] += polarity * amp * Math.exp(-i / (decaySamples * 0.28));
    }
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    // Irregular spacing — denser clusters under AB character.
    const gap = 0.004 + (seed / 0x7fffffff) * (seed & 3 ? 0.028 : 0.007);
    next += Math.floor(rate * gap);
  }
  return buffer;
}

/// Drive an existing voice graph. Safe every frame; uses audio-clock spool rate limits.
/// Pass `{ snap: true }` to setValueAtTime (offline renders / tests) instead of setTargetAtTime.
export function updateEngineVoices(voiceGraph, audioContext, state, {
  muted = false,
  snap = false,
} = {}) {
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

  const character = resolvePropulsionCharacter(state);
  const isRapier = character === "rapier";
  const isF22 = character === "f22";
  // Rapier: M1.9–M2.8 turbo→ram. F-22 / generic jet: stay turbine (no duct light-off).
  const handover = isRapier
    ? smoothstep(clamp01(
      (mach - HANDOVER_MACH_START) / (HANDOVER_MACH_END - HANDOVER_MACH_START)))
    : 0;
  const turbineShare = Math.cos(handover * Math.PI / 2);
  const ramShare = Math.sin(handover * Math.PI / 2);
  const q01 = dynamicPressureFraction(state);
  const rpm = voiceGraph.spoolRpm;
  const density = atmosphereDensity(state);
  const densityScale = 0.14 + 0.86 * Math.pow(clamp01(density / SEA_LEVEL_DENSITY), 0.55);
  const thrustFrac = thrustFraction(state, throttle, rpm);
  const rcsAuthority = clamp01(finiteNumber(state?.rapier_rcs_authority) ?? 0);
  const coastGate = densityScale < 0.28 && thrustFrac < 0.14 && (q01 < 0.12 || rcsAuthority > 0.45)
    ? 0.035 + 0.04 * thrustFrac
    : 1;
  const propulsionPresence = densityScale * coastGate;
  // Thin air still carries ram + rush; turbine beds collapse harder than duct voice.
  const thinAir = 1 - densityScale;
  const rushPresence = Math.max(coastGate, 0.12 + 0.88 * densityScale);
  const powerTarget = Math.pow(Math.max(1e-6, throttle * (0.25 + rpm * 0.75)), 0.9);
  if (voiceGraph.powerSlew == null) voiceGraph.powerSlew = 0;
  if (voiceGraph.throttleAccent == null) voiceGraph.throttleAccent = 0;
  const prevPower = voiceGraph.powerSlew;
  if (snap) {
    voiceGraph.powerSlew = powerTarget;
  } else {
    const powerRate = powerTarget >= voiceGraph.powerSlew
      ? POWER_UP_PER_SECOND : POWER_DOWN_PER_SECOND;
    voiceGraph.powerSlew = moveTowards(voiceGraph.powerSlew, powerTarget, powerRate * elapsed);
  }
  const power = voiceGraph.powerSlew;
  // Slam open: brief grit/crackle punch. Slam closed: accent dies fast (no hang).
  const openPunch = Math.max(0, powerTarget - prevPower);
  if (snap) {
    voiceGraph.throttleAccent = clamp01(openPunch * 2);
  } else {
    voiceGraph.throttleAccent = moveTowards(
      Math.min(1, voiceGraph.throttleAccent + openPunch * 5.5),
      0,
      ACCENT_DECAY_PER_SECOND * elapsed,
    );
  }
  const accent = voiceGraph.throttleAccent;

  // When real beds are live, synth exhaust becomes seasoning — not the identity.
  // Prop tells (shaft saw, fan orders, breath AM, pitched playbackRate) mute completely.
  // Beds only play when they match the resolved character (Rapier F-4 vs F-22 cockpit).
  const sampled = voiceGraph.hasSampleBeds === true
    && voiceGraph.sampleBedCharacter === character
    && (isRapier || isF22);
  const synthDuck = sampled ? (isF22 ? 0.08 : 0.05) : 1;
  const samplePresence = sampled ? 1 : 0;
  // Twin-fan exterior tip whine is wrong for sealed F-22 cockpit — duck hard.
  // Under Rapier beds, tonals mute completely.
  const tonalMute = sampled ? 0 : 1;
  const fanBoost = isF22 ? 0.28 : 1;
  const shaftBoost = isF22 ? 0.45 : 1;
  // Under beds, ram must still read — it's the handover identity, not a synth leftover.
  const ramPresence = sampled && isRapier ? 1.15 : 1;

  const orderFundamental = isF22
    ? 95 + rpm * 140 + throttle * 35
    : 185 + rpm * 480 + throttle * 90;
  const shaftHz = isF22
    ? 48 + rpm * 55 + throttle * 14
    : 72 + rpm * 95 + throttle * 28;
  const nowRamp = (param, value, timeConstant = 0.12) => {
    if (snap) param.setValueAtTime(value, now);
    else param.setTargetAtTime(value, now, timeConstant);
  };

  if (sampled) {
    // Lock bed pitch — any RPM slewing makes broadband roar read as a prop.
    for (const bed of [voiceGraph.sampleIdle, voiceGraph.sampleMil, voiceGraph.sampleGrit]) {
      if (bed?.playbackRate) nowRamp(bed.playbackRate, 1, 0.4);
    }
    // Turbine beds fade with handover; thin air ducks them further.
    // F-22 has no ram share — full bed presence across Mach.
    const bedPresence = turbineShare * propulsionPresence * samplePresence
      * (isF22 ? (0.75 + 0.25 * densityScale) : (0.55 + 0.45 * densityScale));
    nowRamp(voiceGraph.sampleIdleGain.gain,
      (0.14 + 0.32 * (1 - power)) * (0.55 + 0.45 * turbineShare) * bedPresence
        * (isF22 ? 1.35 : 1), 0.16);
    nowRamp(voiceGraph.sampleMilGain.gain,
      (0.22 + 1.1 * power) * (0.55 + 0.45 * turbineShare) * bedPresence
        * (isF22 ? 1.45 : 1), 0.12);
    nowRamp(voiceGraph.sampleGritGain.gain,
      ((0.05 + 0.6 * Math.pow(power, 1.25)) * turbineShare
        + accent * 0.35 * turbineShare)
        * bedPresence * (isF22 ? 0.85 : 1), 0.08);
    if (voiceGraph.sampleHp) {
      // F-22 cockpit beds need the sub thump — keep HP near infrasonic.
      // Rapier: cut rumble that reads as blade-pass; rise with ram handover.
      nowRamp(voiceGraph.sampleHp.frequency,
        isF22 ? 22 + power * 8 : 90 + power * 35 + handover * 420, 0.22);
    }
    nowRamp(voiceGraph.sampleLp.frequency,
      isF22
        ? 2800 + power * 900 + q01 * 400
        : 9500 + power * 4000 - handover * 3500 - thinAir * 1200, 0.22);
  } else {
    nowRamp(voiceGraph.sampleIdleGain.gain, 0, 0.05);
    nowRamp(voiceGraph.sampleMilGain.gain, 0, 0.05);
    nowRamp(voiceGraph.sampleGritGain.gain, 0, 0.05);
  }

  nowRamp(voiceGraph.shaftOsc.frequency, shaftHz, 0.16);
  nowRamp(voiceGraph.shaftFilter.frequency, 280 + rpm * 220 + power * 160, 0.18);
  nowRamp(voiceGraph.shaftGain.gain,
    (0.025 + 0.09 * Math.pow(rpm, 1.1)) * turbineShare * propulsionPresence
      * tonalMute * shaftBoost, 0.14);

  for (const order of voiceGraph.fanOrders) {
    nowRamp(order.oscillator.frequency, orderFundamental * order.ratio, 0.14);
  }
  nowRamp(voiceGraph.flutterLfo.frequency, 3.2 + power * 4.5 + rpm * 2.2, 0.25);

  // Breath AM on liveVca hits the sample bus too — mute it under beds.
  nowRamp(voiceGraph.breathDepth.gain,
    (0.35 + 0.85 * power) * propulsionPresence * tonalMute, 0.12);
  nowRamp(voiceGraph.shimmerDepth.gain,
    (0.03 + 0.1 * rpm) * turbineShare * propulsionPresence * tonalMute, 0.18);
  nowRamp(voiceGraph.crackleModDepth.gain,
    (0.1 + 0.4 * power + accent * 0.35) * propulsionPresence * synthDuck * turbineShare, 0.12);

  nowRamp(voiceGraph.coreFilter.frequency, 360 + rpm * 580 + throttle * 480, 0.16);
  nowRamp(voiceGraph.coreFilter.Q, 0.85 - handover * 0.2, 0.18);
  nowRamp(voiceGraph.coreGain.gain,
    (0.06 + 0.28 * Math.sqrt(rpm) * (0.25 + throttle * 0.75))
      * (1 - handover * 0.45) * propulsionPresence * synthDuck, 0.16);

  nowRamp(voiceGraph.jetBodyFilter.frequency,
    (isF22 ? 90 : 140) + power * (isF22 ? 220 : 380) + rpm * (isF22 ? 40 : 80), 0.16);
  nowRamp(voiceGraph.jetBodyFilter.Q, 1.65 - power * 0.5, 0.16);
  nowRamp(voiceGraph.jetBodyGain.gain,
    ((isF22 ? 0.7 : 0.4) + (isF22 ? 1.15 : 0.95) * power)
      * (0.65 + 0.35 * turbineShare) * propulsionPresence * synthDuck,
    0.14);

  nowRamp(voiceGraph.jetGritFilter.frequency, 600 + power * 1200 + rpm * 180, 0.14);
  nowRamp(voiceGraph.jetGritFilter.Q, 0.55 + power * 0.4, 0.14);
  nowRamp(voiceGraph.jetGritPre.gain,
    (0.12 + 0.78 * Math.pow(power, 1.1) + accent * 0.45) * (0.5 + 0.5 * turbineShare)
      * propulsionPresence * synthDuck,
    0.08);

  nowRamp(voiceGraph.jetGritHiFilter.frequency, 1400 + power * 1000 + rpm * 180, 0.14);
  nowRamp(voiceGraph.jetGritHiPre.gain,
    (0.05 + 0.38 * Math.pow(power, 1.25) + accent * 0.28) * (0.4 + 0.6 * turbineShare)
      * propulsionPresence * synthDuck,
    0.08);

  nowRamp(voiceGraph.crackleLfo.frequency, 11 + power * 28 + rpm * 10, 0.2);
  nowRamp(voiceGraph.crackleDepth.gain, 0.22 + power * 0.5 + accent * 0.35, 0.18);
  nowRamp(voiceGraph.crackleImpulseGain.gain,
    (0.04 + 0.35 * Math.pow(power, 1.45) + accent * 0.4) * propulsionPresence
      * (0.55 + 0.45 * turbineShare) * (sampled ? 0.25 : 1),
    0.06);
  nowRamp(voiceGraph.jetOut.gain, (0.85 + power * 0.35) * (sampled ? 0.35 : 1), 0.16);

  nowRamp(voiceGraph.exhaustDelay.delayTime, 0.007 + (1 - power) * 0.012, 0.25);
  nowRamp(voiceGraph.exhaustFeedback.gain, 0.24 + power * 0.32, 0.2);
  nowRamp(voiceGraph.exhaustOut.gain,
    (0.08 + 0.28 * power) * propulsionPresence * (0.55 + 0.45 * turbineShare) * synthDuck,
    0.16);

  nowRamp(voiceGraph.fanOrderLp.frequency, 2000 + rpm * 800 + throttle * 250, 0.18);
  nowRamp(voiceGraph.fanOrderGain.gain,
    (0.004 + 0.025 * Math.pow(rpm, 1.15)) * turbineShare * propulsionPresence
      * tonalMute * fanBoost, 0.14);

  nowRamp(voiceGraph.fanWhineFilter.frequency, 1700 + rpm * 1600 + throttle * 350, 0.14);
  nowRamp(voiceGraph.fanWhineFilter.Q, 10 + rpm * 4, 0.16);
  nowRamp(voiceGraph.fanWhineGain.gain,
    (0.004 + 0.028 * Math.pow(rpm, 1.35)) * turbineShare * propulsionPresence
      * tonalMute * fanBoost, 0.14);
  nowRamp(voiceGraph.fanWhine2Filter.frequency, 3000 + rpm * 1800 + throttle * 250, 0.14);
  nowRamp(voiceGraph.fanWhine2Gain.gain,
    (0.001 + 0.008 * Math.pow(rpm, 1.4)) * turbineShare * propulsionPresence
      * tonalMute * fanBoost, 0.14);

  // Cabin darkens hard for synth path; sample path bypasses this (beds are pre-shaped).
  // F-22 sealed cockpit: much darker ceiling than open AB exterior beds.
  nowRamp(voiceGraph.cabinLp.frequency,
    (isF22 ? 650 : 1400) + power * (isF22 ? 550 : 1200) + q01 * (isF22 ? 180 : 350)
      + handover * 800, 0.22);

  // Ram character: hollow duct body + mid howl + HF spit — grows with handover.
  nowRamp(voiceGraph.ramFilter.frequency, 520 + handover * 1600 + throttle * 280 + thinAir * 200, 0.18);
  nowRamp(voiceGraph.ramFilter.Q, 0.45 + handover * 0.35, 0.18);
  nowRamp(voiceGraph.ramGain.gain,
    ramShare * (0.12 + throttle * 0.42 + power * 0.18) * (0.25 + rpm * 0.75)
      * propulsionPresence * ramPresence, 0.14);

  nowRamp(voiceGraph.ramHowlFilter.frequency, 1400 + handover * 2200 + power * 400, 0.16);
  nowRamp(voiceGraph.ramHowlFilter.Q, 1.8 + handover * 2.2, 0.16);
  nowRamp(voiceGraph.ramHowlGain.gain,
    ramShare * (0.06 + power * 0.22 + thinAir * 0.08) * propulsionPresence * ramPresence, 0.12);

  nowRamp(voiceGraph.ramSpitFilter.frequency, 2400 + handover * 1800 + power * 500, 0.14);
  nowRamp(voiceGraph.ramSpitGain.gain,
    ramShare * (0.02 + power * 0.16 + accent * 0.12) * propulsionPresence * ramPresence, 0.1);

  nowRamp(voiceGraph.rushHighpass.frequency, 110 + q01 * 320 + handover * 180, 0.18);
  nowRamp(voiceGraph.rushLowpass.frequency, 900 + q01 * 5600 + handover * 1800, 0.18);
  nowRamp(voiceGraph.rushGain.gain,
    0.14 * Math.pow(q01, 0.72) * rushPresence * (1 + ramShare * 0.35), 0.18);

  if (voiceGraph.master) {
    const bedMaster = isF22 ? 0.72 : 0.58;
    nowRamp(voiceGraph.master.gain, muted ? 0 : (sampled ? bedMaster : (isF22 ? 0.52 : 0.42)),
      muted ? 0.02 : 0.18);
  }
}


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
