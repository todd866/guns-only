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
import { standardAtmosphereDensity } from "./atmosphere_audio.js";

const FAN_ORDER_RATIOS = Object.freeze([
  1.0, 1.97, 2.99, 4.03, 4.96, 6.02, 7.05, 8.11,
]);
const FAN_ORDER_LEVELS = Object.freeze([
  1.0, 0.62, 0.4, 0.26, 0.17, 0.11, 0.07, 0.045,
]);
const SPOOL_UP_PER_SECOND = 0.22;
const SPOOL_DOWN_PER_SECOND = 0.34;
const RAPIER_TURBINE_COAST_UP_PER_SECOND = 0.7;
const RAPIER_TURBINE_COAST_DOWN_PER_SECOND = 0.12;
// Matches Rapier map overlap (turbine fade / ram light) — teach handover by ear.
const HANDOVER_MACH_START = 1.9;
const HANDOVER_MACH_END = 2.8;
const POWER_UP_PER_SECOND = 1.8;
const POWER_DOWN_PER_SECOND = 2.6;
const ACCENT_DECAY_PER_SECOND = 3.2;
const Q_ACCENT_DECAY_PER_SECOND = 1.35;
const AUGMENTATION_KICK_DECAY_PER_SECOND = 2.4;
const MAX_CONTROL_STEP_SECONDS = 0.25;
const KNOTS_TO_MPS = 0.514444;
const SEA_LEVEL_DENSITY = 1.225;
const THRUST_REF_KN = 140;
// Rapier's 18-second interior bed owns the steady cockpit body. The brighter 2.6-second CC0
// F-4 excerpt remains as identity seasoning, but cannot dominate strongly enough for its short
// envelope to announce every loop.
const RAPIER_PRIMARY_SAMPLE_WEIGHT = 0.24;
const RAPIER_COCKPIT_SAMPLE_WEIGHT = Math.sqrt(
  1 - RAPIER_PRIMARY_SAMPLE_WEIGHT * RAPIER_PRIMARY_SAMPLE_WEIGHT,
);
const DEFAULT_SAMPLE_BASE = new URL("./samples/jet/", import.meta.url).href;

let context = null;
let voices = null;
let disabled = false;
// AudioBuffers are immutable sample data and may safely feed multiple BufferSource nodes. Keep
// one deterministic long-noise bed per context/seed instead of rebuilding multi-second buffers
// for every contact voice in a formation.
const pinkNoiseBuffers = new WeakMap();
const whiteNoiseBuffers = new WeakMap();

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

  // Sample bed bus. F-22 references are a composite cockpit recording, so split them into a
  // low structure path that survives thin air and an airborne/mid-high path that does not.
  // Rapier retains its original single filtered path through sampleAirborneGain.
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
  const sampleAirborneGain = audioContext.createGain();
  sampleAirborneGain.gain.value = 0;
  sampleBus
    .connect(sampleHp)
    .connect(sampleLp)
    .connect(sampleAirborneGain)
    .connect(liveVca);
  const sampleStructureLp = audioContext.createBiquadFilter();
  sampleStructureLp.type = "lowpass";
  sampleStructureLp.frequency.value = 680;
  sampleStructureLp.Q.value = 0.55;
  const sampleStructureGain = audioContext.createGain();
  sampleStructureGain.gain.value = 0;
  sampleBus
    .connect(sampleStructureLp)
    .connect(sampleStructureGain)
    .connect(liveVca);

  const sampleIdleGain = audioContext.createGain();
  sampleIdleGain.gain.value = 0;
  sampleIdleGain.connect(sampleBus);
  const sampleMilGain = audioContext.createGain();
  sampleMilGain.gain.value = 0;
  sampleMilGain.connect(sampleBus);
  const sampleGritGain = audioContext.createGain();
  sampleGritGain.gain.value = 0;
  sampleGritGain.connect(sampleBus);

  // Cockpit equipment bed. A sealed fighter is never acoustically empty: ECS/heater airflow and
  // the 400 Hz electrical system remain after the exterior engine/rush drops away. Keep this
  // outside the propulsion VCA so zoom-coast has a quiet cabin floor rather than digital silence.
  const ecsSource = audioContext.createBufferSource();
  ecsSource.buffer = pinkNoiseBuffer(audioContext, 0x45435331);
  ecsSource.loop = true;
  const ecsHighpass = audioContext.createBiquadFilter();
  ecsHighpass.type = "highpass";
  ecsHighpass.frequency.value = 180;
  ecsHighpass.Q.value = 0.5;
  const ecsBandpass = audioContext.createBiquadFilter();
  ecsBandpass.type = "bandpass";
  ecsBandpass.frequency.value = 720;
  ecsBandpass.Q.value = 0.58;
  const ecsGain = audioContext.createGain();
  ecsGain.gain.value = 0;
  ecsSource.connect(ecsHighpass).connect(ecsBandpass).connect(ecsGain).connect(output);

  const inverterOsc = audioContext.createOscillator();
  inverterOsc.type = "triangle";
  inverterOsc.frequency.value = 400;
  const inverterFilter = audioContext.createBiquadFilter();
  inverterFilter.type = "bandpass";
  inverterFilter.frequency.value = 400;
  inverterFilter.Q.value = 7;
  const inverterGain = audioContext.createGain();
  inverterGain.gain.value = 0;
  inverterOsc.connect(inverterFilter).connect(inverterGain).connect(output);

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

  // Rapier turbine coast tone. Airborne roar vanishes with mass flow, but the compressor does not
  // stop instantaneously at handover: a narrowing, descending whine remains structure-borne for
  // several seconds. Keep it separate from the normal fan stack so sample-bed ducking cannot erase
  // the transition cue.
  const turbineCoastOsc = audioContext.createOscillator();
  turbineCoastOsc.type = "triangle";
  turbineCoastOsc.frequency.value = 1800;
  const turbineCoastFilter = audioContext.createBiquadFilter();
  turbineCoastFilter.type = "bandpass";
  turbineCoastFilter.frequency.value = 1800;
  turbineCoastFilter.Q.value = 5.5;
  const turbineCoastGain = audioContext.createGain();
  turbineCoastGain.gain.value = 0;
  turbineCoastOsc
    .connect(turbineCoastFilter)
    .connect(turbineCoastGain)
    .connect(propBus);
  turbineCoastOsc.start();

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

  // Dedicated canopy boundary-layer hiss. The broad pink rush says "airframe"; this narrower
  // white band makes a dynamic-pressure change legible through an already loud cockpit bed.
  const canopyFlowNoise = audioContext.createBufferSource();
  canopyFlowNoise.buffer = whiteNoiseBuffer(audioContext, 0x0ca90f1);
  canopyFlowNoise.loop = true;
  const canopyFlowHighpass = audioContext.createBiquadFilter();
  canopyFlowHighpass.type = "highpass";
  canopyFlowHighpass.frequency.value = 1800;
  canopyFlowHighpass.Q.value = 0.55;
  const canopyFlowLowpass = audioContext.createBiquadFilter();
  canopyFlowLowpass.type = "lowpass";
  canopyFlowLowpass.frequency.value = 5200;
  canopyFlowLowpass.Q.value = 0.5;
  const canopyFlowGain = audioContext.createGain();
  canopyFlowGain.gain.value = 0;
  canopyFlowNoise
    .connect(canopyFlowHighpass)
    .connect(canopyFlowLowpass)
    .connect(canopyFlowGain)
    .connect(output);

  // A restrained structure-borne compressor trace survives beneath fixed-pitch sample beds.
  // Pitch follows core RPM while level follows delivered power, so the cue does not require
  // pitching the entire broadband recording (which reads like a propeller).
  const compressorTraceOsc = audioContext.createOscillator();
  compressorTraceOsc.type = "triangle";
  compressorTraceOsc.frequency.value = 260;
  const compressorTraceFilter = audioContext.createBiquadFilter();
  compressorTraceFilter.type = "bandpass";
  compressorTraceFilter.frequency.value = 260;
  compressorTraceFilter.Q.value = 4.2;
  const compressorTraceGain = audioContext.createGain();
  compressorTraceGain.gain.value = 0;
  compressorTraceOsc
    .connect(compressorTraceFilter)
    .connect(compressorTraceGain)
    .connect(output);

  // F-22 military power and full augmentation can share almost the same governed core RPM.
  // A separate structure-borne reheat cue makes the detent crossing readable without pitching
  // the fixed broadband cockpit recording. The low noise body is the pressure/seat component;
  // the shallow oscillator is an irregular-feeling airframe pulse, not an exterior exhaust tone.
  const augmentationSource = audioContext.createBufferSource();
  augmentationSource.buffer = pinkNoiseBuffer(audioContext, 0x4155474D);
  augmentationSource.loop = true;
  const augmentationBodyFilter = audioContext.createBiquadFilter();
  augmentationBodyFilter.type = "lowpass";
  augmentationBodyFilter.frequency.value = 150;
  augmentationBodyFilter.Q.value = 1.05;
  const augmentationBodyGain = audioContext.createGain();
  augmentationBodyGain.gain.value = 0;
  augmentationSource
    .connect(augmentationBodyFilter)
    .connect(augmentationBodyGain)
    .connect(output);

  const augmentationPulseOsc = audioContext.createOscillator();
  augmentationPulseOsc.type = "triangle";
  augmentationPulseOsc.frequency.value = 44;
  const augmentationPulseFilter = audioContext.createBiquadFilter();
  augmentationPulseFilter.type = "bandpass";
  augmentationPulseFilter.frequency.value = 44;
  augmentationPulseFilter.Q.value = 2.2;
  const augmentationPulseGain = audioContext.createGain();
  augmentationPulseGain.gain.value = 0;
  augmentationPulseOsc
    .connect(augmentationPulseFilter)
    .connect(augmentationPulseGain)
    .connect(output);

  modNoise.start();
  breathSource.start();
  pinkSource.start();
  whiteSource.start();
  whiteGritHi.start();
  crackleSource.start();
  airframeNoise.start();
  canopyFlowNoise.start();
  compressorTraceOsc.start();
  augmentationSource.start();
  augmentationPulseOsc.start();
  ecsSource.start();
  inverterOsc.start();

  return {
    master,
    cabinLp,
    liveVca,
    sampleBus,
    sampleHp,
    sampleLp,
    sampleAirborneGain,
    sampleStructureLp,
    sampleStructureGain,
    sampleIdleGain,
    sampleMilGain,
    sampleGritGain,
    sampleIdle: null,
    sampleMil: null,
    sampleGrit: null,
    sampleIdleVariants: [],
    sampleMilVariants: [],
    sampleGritVariants: [],
    hasSampleBeds: false,
    sampleBedCharacter: null,
    ecsHighpass,
    ecsBandpass,
    ecsGain,
    inverterOsc,
    inverterFilter,
    inverterGain,
    shaftOsc,
    shaftFilter,
    shaftGain,
    turbineCoastOsc,
    turbineCoastFilter,
    turbineCoastGain,
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
    canopyFlowHighpass,
    canopyFlowLowpass,
    canopyFlowGain,
    compressorTraceOsc,
    compressorTraceFilter,
    compressorTraceGain,
    augmentationBodyFilter,
    augmentationBodyGain,
    augmentationPulseOsc,
    augmentationPulseFilter,
    augmentationPulseGain,
    spoolRpm: 0,
    powerSlew: 0,
    throttleAccent: 0,
    qAccent: 0,
    augmentationKick: 0,
    lastAugmentation: null,
    lastQ01: null,
    rapierTurbineCoastRpm: 0,
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
  const filesFor = (regime) => character === "f22"
    ? [`${prefix}${regime}_loop.wav`, `${prefix}${regime}_alt_loop.wav`]
    : character === "rapier"
      ? [`${regime}_loop.wav`, `rapier_${regime}_cockpit_loop.wav`]
      : [`${prefix}${regime}_loop.wav`];
  const entries = {
    idle: filesFor("idle"),
    mil: filesFor("mil"),
    grit: filesFor("grit"),
  };
  const beds = {};
  await Promise.all(Object.entries(entries).map(async ([key, files]) => {
    const variants = [];
    for (const file of files) {
      try {
        const url = new URL(file, baseUrl).href;
        const response = await fetch(url);
        if (!response.ok) continue;
        const raw = await response.arrayBuffer();
        variants.push(await audioContext.decodeAudioData(raw.slice(0)));
      } catch {
        // Missing alternates are expected for profiles that only have one authored bed.
      }
    }
    if (variants.length > 0) {
      beds[key] = variants[0];
      beds[`${key}Variants`] = variants;
    }
  }));
  return beds;
}

/// Wire decoded beds onto an existing voice graph. Safe to call once; no-ops if already attached
/// or if `mil` is missing (need at least the power bed). Use `replaceJetSampleBeds` when the
/// selected aircraft changes without a page reload.
/// `character` tags which aircraft the beds belong to so the mix path can refuse a mismatch.
export function attachJetSampleBeds(voiceGraph, audioContext, beds, {
  character = "rapier",
} = {}) {
  if (!voiceGraph || !audioContext || voiceGraph.hasSampleBeds) return false;
  if (!beds?.mil) return false;

  const startBed = (buffer, gainNode, gainValue) => {
    const variantGain = audioContext.createGain();
    variantGain.gain.value = gainValue;
    variantGain.connect(gainNode);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 1;
    source.connect(variantGain);
    source.start();
    return { source, gain: variantGain };
  };

  const attachLayer = (key, gainNode) => {
    const variants = Array.isArray(beds[`${key}Variants`])
      && beds[`${key}Variants`].length > 0
      ? beds[`${key}Variants`]
      : beds[key] ? [beds[key]] : [];
    return variants.map((buffer, index) => startBed(buffer, gainNode, index === 0 ? 1 : 0));
  };
  voiceGraph.sampleIdleVariants = attachLayer("idle", voiceGraph.sampleIdleGain);
  voiceGraph.sampleMilVariants = attachLayer("mil", voiceGraph.sampleMilGain);
  voiceGraph.sampleGritVariants = attachLayer("grit", voiceGraph.sampleGritGain);
  voiceGraph.sampleIdle = voiceGraph.sampleIdleVariants[0]?.source ?? null;
  voiceGraph.sampleMil = voiceGraph.sampleMilVariants[0]?.source ?? null;
  voiceGraph.sampleGrit = voiceGraph.sampleGritVariants[0]?.source ?? null;
  voiceGraph.hasSampleBeds = true;
  voiceGraph.sampleBedCharacter = character;
  return true;
}

/// Crossfade a voice graph to another aircraft's decoded beds. Old sources are retired only after
/// the new graph is live, avoiding both a permanently procedural second aircraft and an abrupt
/// page-lifetime ownership handoff.
export function replaceJetSampleBeds(voiceGraph, audioContext, beds, {
  character = "rapier",
} = {}) {
  if (!voiceGraph || !audioContext || !beds?.mil) return false;
  if (!voiceGraph.hasSampleBeds) {
    return attachJetSampleBeds(voiceGraph, audioContext, beds, { character });
  }
  if (voiceGraph.sampleBedCharacter === character) return false;

  const now = Number.isFinite(audioContext.currentTime) ? audioContext.currentTime : 0;
  const retiring = [
    ...(voiceGraph.sampleIdleVariants ?? []),
    ...(voiceGraph.sampleMilVariants ?? []),
    ...(voiceGraph.sampleGritVariants ?? []),
  ];
  for (const variant of retiring) {
    variant?.gain?.gain?.setTargetAtTime?.(0, now, 0.05);
  }

  voiceGraph.hasSampleBeds = false;
  voiceGraph.sampleBedCharacter = null;
  voiceGraph.sampleIdle = null;
  voiceGraph.sampleMil = null;
  voiceGraph.sampleGrit = null;
  voiceGraph.sampleIdleVariants = [];
  voiceGraph.sampleMilVariants = [];
  voiceGraph.sampleGritVariants = [];
  const attached = attachJetSampleBeds(voiceGraph, audioContext, beds, { character });
  if (!attached) return false;

  for (const variants of [
    voiceGraph.sampleIdleVariants,
    voiceGraph.sampleMilVariants,
    voiceGraph.sampleGritVariants,
  ]) {
    for (let index = 0; index < variants.length; index++) {
      const parameter = variants[index]?.gain?.gain;
      if (!parameter) continue;
      parameter.setValueAtTime?.(0, now);
      parameter.setTargetAtTime?.(index === 0 ? 1 : 0, now, 0.06);
    }
  }
  for (const variant of retiring) {
    try {
      if (variant?.source) {
        variant.source.onended = () => {
          variant.source.disconnect?.();
          variant.gain?.disconnect?.();
        };
      }
      variant?.source?.stop?.(now + 0.35);
    } catch {
      // A source may already have ended during teardown; the replacement is still valid.
    }
  }
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
  const seedKey = initialSeed | 0;
  let buffers = pinkNoiseBuffers.get(audioContext);
  if (!buffers) {
    buffers = new Map();
    pinkNoiseBuffers.set(audioContext, buffers);
  }
  const cached = buffers.get(seedKey);
  if (cached) return cached;

  const frames = Math.max(1, Math.floor(audioContext.sampleRate * 4));
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = seedKey & 0x7fffffff;
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
  buffers.set(seedKey, buffer);
  return buffer;
}

export function whiteNoiseBuffer(audioContext, initialSeed) {
  const seedKey = initialSeed | 0;
  let buffers = whiteNoiseBuffers.get(audioContext);
  if (!buffers) {
    buffers = new Map();
    whiteNoiseBuffers.set(audioContext, buffers);
  }
  const cached = buffers.get(seedKey);
  if (cached) return cached;

  const frames = Math.max(1, Math.floor(audioContext.sampleRate * 2));
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = seedKey & 0x7fffffff;
  for (let i = 0; i < frames; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    channel[i] = seed / 0x3fffffff - 1;
  }
  buffers.set(seedKey, buffer);
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

  const character = resolvePropulsionCharacter(state);
  const isRapier = character === "rapier";
  const isF22 = character === "f22";
  const externalPerspective = isExternalAudioPerspective(state);
  const sealedF22 = isF22 && !externalPerspective;
  const defaultLeverStop = isRapier ? 1.55 : 1.35;
  const leverStop = Math.max(1,
    finiteNumber(state?.max_thrust_fraction) ?? defaultLeverStop);
  const appliedLever = Math.max(0, finiteNumber(state?.applied_throttle) ?? 0);
  const throttle = clamp01(appliedLever / leverStop);
  const deliveredLever = Math.max(0,
    finiteNumber(state?.engine_spool_fraction) ?? appliedLever);
  const deliveredPower = clamp01(deliveredLever / leverStop);
  const augmentationSpan = Math.max(0.05, leverStop - 1);
  const augmentation = isF22
    ? clamp01((deliveredLever - 1) / augmentationSpan)
    : 0;
  const targetRpm = clamp01(
    (finiteNumber(state?.engine_rpm_pct) ?? (deliveredPower * 100)) / 100);
  const mach = Math.max(0, finiteNumber(state?.mach) ?? 0);
  const now = audioContext.currentTime;
  const elapsed = Math.min(MAX_CONTROL_STEP_SECONDS,
    Math.max(0, now - voiceGraph.lastControlTime));
  voiceGraph.lastControlTime = now;
  const spoolRate = targetRpm >= voiceGraph.spoolRpm
    ? SPOOL_UP_PER_SECOND : SPOOL_DOWN_PER_SECOND;
  voiceGraph.spoolRpm = moveTowards(voiceGraph.spoolRpm, targetRpm, spoolRate * elapsed);

  // Rapier: M1.9–M2.8 turbo→ram. F-22 / generic jet: stay turbine (no duct light-off).
  const handover = isRapier
    ? smoothstep(clamp01(
      (mach - HANDOVER_MACH_START) / (HANDOVER_MACH_END - HANDOVER_MACH_START)))
    : 0;
  const turbineShare = Math.cos(handover * Math.PI / 2);
  const ramShare = Math.sin(handover * Math.PI / 2);
  const q01 = dynamicPressureFraction(state);
  if (voiceGraph.augmentationKick == null) voiceGraph.augmentationKick = 0;
  if (voiceGraph.lastAugmentation == null) voiceGraph.lastAugmentation = augmentation;
  const augmentationRisePerSecond = elapsed > 1e-4
    ? Math.max(0, augmentation - voiceGraph.lastAugmentation) / elapsed
    : 0;
  if (snap) {
    voiceGraph.augmentationKick = 0;
  } else {
    voiceGraph.augmentationKick = moveTowards(
      Math.max(
        voiceGraph.augmentationKick,
        clamp01(augmentationRisePerSecond * 0.42),
      ),
      0,
      AUGMENTATION_KICK_DECAY_PER_SECOND * elapsed,
    );
  }
  voiceGraph.lastAugmentation = augmentation;
  if (voiceGraph.qAccent == null) voiceGraph.qAccent = 0;
  if (voiceGraph.lastQ01 == null) voiceGraph.lastQ01 = q01;
  const qRisePerSecond = elapsed > 1e-4
    ? Math.max(0, q01 - voiceGraph.lastQ01) / elapsed
    : 0;
  if (snap) {
    voiceGraph.qAccent = 0;
  } else {
    voiceGraph.qAccent = moveTowards(
      Math.max(voiceGraph.qAccent, clamp01(qRisePerSecond * 1.25)),
      0,
      Q_ACCENT_DECAY_PER_SECOND * elapsed,
    );
  }
  voiceGraph.lastQ01 = q01;
  const rpm = voiceGraph.spoolRpm;
  const publishedTurbineThrustKn = finiteNumber(state?.rapier_turbine_thrust_kn);
  const rapierTurbineDemand = isRapier
    ? publishedTurbineThrustKn == null
      ? rpm * turbineShare
      : clamp01(publishedTurbineThrustKn / 90)
    : 0;
  if (snap) {
    voiceGraph.rapierTurbineCoastRpm = rapierTurbineDemand;
  } else {
    const turbineCoastRate = rapierTurbineDemand >= voiceGraph.rapierTurbineCoastRpm
      ? RAPIER_TURBINE_COAST_UP_PER_SECOND
      : RAPIER_TURBINE_COAST_DOWN_PER_SECOND;
    voiceGraph.rapierTurbineCoastRpm = moveTowards(
      voiceGraph.rapierTurbineCoastRpm,
      rapierTurbineDemand,
      turbineCoastRate * elapsed,
    );
  }
  const turbineCoastRpm = voiceGraph.rapierTurbineCoastRpm;
  const turbineCoastAmount = isRapier
    ? clamp01(
      Math.max(0, turbineCoastRpm - rapierTurbineDemand) * 3.2
        + (1 - turbineShare) * turbineCoastRpm * 0.65,
    )
    : 0;
  const density = atmosphereDensity(state);
  const densityRatio = clamp01(density / SEA_LEVEL_DENSITY);
  const densityScale = 0.14 + 0.86 * Math.pow(densityRatio, 0.55);
  // A sealed cockpit receives two different physical paths. Exterior/exhaust energy collapses
  // with mass flow; mounts and the pressure shell retain a quiet vibration floor.
  const f22AirbornePresence = Math.pow(densityRatio, 0.72);
  const f22StructurePresence = 0.22 + 0.78 * Math.pow(densityRatio, 0.35);
  const f22ThinAir = 1 - f22AirbornePresence;
  // Rapier needs the same physical split for a different reason. Ram/exhaust and broadband bed
  // energy require atmospheric mass flow and must disappear on an exo-atmospheric climb. A small,
  // low-passed structure path remains for pumps/rocket thrust conducted through the airframe.
  // The old shared 0.14 density floor kept the whole cockpit/exhaust mix conspicuously loud in
  // near-vacuum even though dynamic pressure had collapsed.
  const rapierAirbornePresence = Math.pow(densityRatio, 0.68);
  const rapierStructurePresence = 0.045 + 0.955 * Math.pow(densityRatio, 0.42);
  const thrustFrac = thrustFraction(state, deliveredPower, rpm);
  const rcsAuthority = clamp01(finiteNumber(state?.rapier_rcs_authority) ?? 0);
  const coastGate = densityScale < 0.28 && thrustFrac < 0.14 && (q01 < 0.12 || rcsAuthority > 0.45)
    ? 0.035 + 0.04 * thrustFrac
    : 1;
  const propulsionPresence = densityScale * coastGate;
  const airbornePresence = sealedF22
    ? f22AirbornePresence * coastGate
    : isRapier
      ? rapierAirbornePresence * coastGate
      : propulsionPresence;
  const structurePresence = sealedF22
    ? f22StructurePresence * coastGate
    : isRapier
      ? rapierStructurePresence * coastGate
      : propulsionPresence;
  // Thin air still carries ram + rush; turbine beds collapse harder than duct voice.
  const thinAir = 1 - densityScale;
  const rushPresence = Math.max(coastGate, 0.12 + 0.88 * densityScale);
  const powerTarget = Math.pow(
    Math.max(1e-6, deliveredPower * (0.25 + rpm * 0.75)),
    0.9,
  );
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
    && (isRapier || isF22)
    && !externalPerspective;
  const synthDuck = sampled ? (isF22 ? 0.08 : 0.05) : 1;
  const samplePresence = sampled ? 1 : 0;
  // Twin-fan exterior tip whine is wrong for sealed F-22 cockpit — duck hard.
  // Under Rapier beds, tonals mute completely.
  const tonalMute = sampled ? 0 : 1;
  const fanBoost = sealedF22 ? 0.28 : isF22 ? 1.25 : 1;
  const shaftBoost = sealedF22 ? 0.45 : isF22 ? 0.72 : 1;
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
    // F-22's two sealed-cockpit beds may trade slowly for texture. Rapier's long interior bed
    // owns the steady body while the short brighter CC0 F-4 excerpt stays fixed as seasoning.
    // A previous slow sine crossfade made steady Rapier power audibly rise and fall even when
    // every flight-state input was unchanged.
    for (const variants of [
      voiceGraph.sampleIdleVariants,
      voiceGraph.sampleMilVariants,
      voiceGraph.sampleGritVariants,
    ]) {
      if (!Array.isArray(variants) || variants.length === 0) continue;
      if (variants.length === 1) {
        nowRamp(variants[0].gain.gain, 1, 0.8);
        continue;
      }
      if (isRapier) {
        nowRamp(variants[0].gain.gain, RAPIER_PRIMARY_SAMPLE_WEIGHT, 1.4);
        nowRamp(variants[1].gain.gain, RAPIER_COCKPIT_SAMPLE_WEIGHT, 1.4);
      } else {
        const paletteBlend = clamp01(
          0.5 + 0.5 * Math.sin(now * 0.105 + 0.35),
        );
        nowRamp(variants[0].gain.gain, Math.cos(paletteBlend * Math.PI / 2), 1.4);
        nowRamp(variants[1].gain.gain, Math.sin(paletteBlend * Math.PI / 2), 1.4);
      }
      for (let index = 2; index < variants.length; index++) {
        nowRamp(variants[index].gain.gain, 0, 0.3);
      }
    }
    // Turbine beds fade with handover; thin air ducks them further.
    // F-22 has no ram share — full bed presence across Mach.
    const bedPresence = turbineShare * samplePresence
      * (isF22 || isRapier ? 1 : propulsionPresence);
    nowRamp(voiceGraph.sampleAirborneGain.gain,
      isF22
        ? 0.82 * f22AirbornePresence * coastGate
        : isRapier
          ? 0.9 * rapierAirbornePresence * coastGate
          : 1,
      0.24);
    nowRamp(voiceGraph.sampleStructureGain.gain,
      isF22
        ? 0.72 * f22StructurePresence * coastGate
        : isRapier
          ? 0.1 * rapierStructurePresence * coastGate
          : 0,
      0.3);
    nowRamp(voiceGraph.sampleStructureLp.frequency,
      isF22 ? 520 + power * 180 + f22StructurePresence * 120 : 680, 0.3);
    nowRamp(voiceGraph.sampleIdleGain.gain,
      (0.14 + 0.32 * (1 - power)) * (0.55 + 0.45 * turbineShare) * bedPresence
        * (isF22 ? 1.35 : 1), 0.16);
    nowRamp(voiceGraph.sampleMilGain.gain,
      (0.22 + 1.1 * power) * (0.55 + 0.45 * turbineShare) * bedPresence
        * (isF22 ? 1.45 : 1), 0.12);
    nowRamp(voiceGraph.sampleGritGain.gain,
      ((0.05 + 0.6 * Math.pow(power, 1.25)) * turbineShare
        + accent * 0.35 * turbineShare)
        * bedPresence
        * (isF22 ? 0.85 * (0.08 + 0.92 * f22AirbornePresence) : 1), 0.08);
    if (voiceGraph.sampleHp) {
      // F-22 sub-thump now lives on sampleStructureLp. Keep only airborne/mid-high content here.
      // Rapier still cuts rumble that reads as blade-pass and rises with ram handover.
      nowRamp(voiceGraph.sampleHp.frequency,
        isF22
          ? 260 + f22ThinAir * 180 + power * 30
          : 90 + power * 35 + handover * 420,
        0.22);
    }
    nowRamp(voiceGraph.sampleLp.frequency,
      isF22
        ? 1200 + f22AirbornePresence * (1600 + power * 900 + q01 * 400)
        : 9500 + power * 4000 - handover * 3500 - thinAir * 1200, 0.22);
  } else {
    nowRamp(voiceGraph.sampleIdleGain.gain, 0, 0.05);
    nowRamp(voiceGraph.sampleMilGain.gain, 0, 0.05);
    nowRamp(voiceGraph.sampleGritGain.gain, 0, 0.05);
    nowRamp(voiceGraph.sampleAirborneGain.gain, 0, 0.05);
    nowRamp(voiceGraph.sampleStructureGain.gain, 0, 0.05);
  }

  // ECS / inverter stay deliberately subtle. They are most legible at idle and zoom-coast,
  // then psychoacoustically disappear beneath the engine without being hard-switched.
  const equipmentLive = targetRpm > 0.08 || state?.engine_running === true;
  const equipment = equipmentLive ? 1 : 0.18;
  const cabinSeal = sealedF22 ? 1.35 : isF22 ? 0.18 : isRapier ? 0.92 : 1;
  const pressurizationLift = sealedF22 ? 1 + 0.32 * f22ThinAir : 1;
  nowRamp(voiceGraph.ecsHighpass.frequency, 150 + power * 120 + q01 * 80, 0.35);
  nowRamp(voiceGraph.ecsBandpass.frequency, 610 + power * 380 + q01 * 260, 0.35);
  nowRamp(voiceGraph.ecsGain.gain,
    (0.009 + 0.013 * rpm + 0.006 * (1 - power))
      * equipment * cabinSeal * pressurizationLift, 0.45);
  nowRamp(voiceGraph.inverterOsc.frequency, 400, 0.8);
  nowRamp(voiceGraph.inverterFilter.frequency, 400, 0.8);
  nowRamp(voiceGraph.inverterGain.gain,
    (0.0012 + 0.001 * (1 - power)) * equipment * cabinSeal, 0.6);

  const compressorTraceHz = 205 + rpm * 310 + power * 55;
  nowRamp(voiceGraph.compressorTraceOsc.frequency, compressorTraceHz, 0.16);
  nowRamp(voiceGraph.compressorTraceFilter.frequency, compressorTraceHz, 0.16);
  nowRamp(voiceGraph.compressorTraceFilter.Q, sealedF22 ? 4.4 : 3.1, 0.24);
  nowRamp(voiceGraph.compressorTraceGain.gain,
    isF22
      ? (0.0025 + rpm * 0.0075 + power * 0.006)
        * structurePresence * (sealedF22 ? (sampled ? 1.3 : 0.8) : 1.6)
      : 0,
    0.16);

  const augmentationDrive = Math.pow(augmentation, 0.72);
  const augmentationKick = voiceGraph.augmentationKick;
  nowRamp(voiceGraph.augmentationBodyFilter.frequency,
    (sealedF22 ? 105 : 145) + augmentation * (sealedF22 ? 95 : 210), 0.12);
  nowRamp(voiceGraph.augmentationBodyFilter.Q,
    sealedF22 ? 1.18 : 0.82, 0.18);
  nowRamp(voiceGraph.augmentationBodyGain.gain,
    isF22
      ? ((sealedF22 ? 0.055 : 0.14) * augmentationDrive
        + augmentationKick * (sealedF22 ? 0.026 : 0.055))
        * structurePresence
      : 0,
    0.09);
  const augmentationPulseHz = 39 + augmentation * 23;
  nowRamp(voiceGraph.augmentationPulseOsc.frequency, augmentationPulseHz, 0.1);
  nowRamp(voiceGraph.augmentationPulseFilter.frequency, augmentationPulseHz, 0.1);
  nowRamp(voiceGraph.augmentationPulseFilter.Q, sealedF22 ? 2.5 : 1.7, 0.16);
  nowRamp(voiceGraph.augmentationPulseGain.gain,
    isF22
      ? (sealedF22 ? 0.014 : 0.034) * augmentationDrive * structurePresence
      : 0,
    0.1);

  nowRamp(voiceGraph.shaftOsc.frequency, shaftHz, 0.16);
  nowRamp(voiceGraph.shaftFilter.frequency, 280 + rpm * 220 + power * 160, 0.18);
  nowRamp(voiceGraph.shaftGain.gain,
    (0.025 + 0.09 * Math.pow(rpm, 1.1)) * turbineShare * structurePresence
      * tonalMute * shaftBoost, 0.14);

  const turbineCoastHz = 360 + turbineCoastRpm * 1780;
  nowRamp(voiceGraph.turbineCoastOsc.frequency, turbineCoastHz, 0.18);
  nowRamp(voiceGraph.turbineCoastFilter.frequency, turbineCoastHz, 0.18);
  nowRamp(voiceGraph.turbineCoastFilter.Q, 4.2 + turbineCoastRpm * 3.4, 0.22);
  const turbineCoastStructurePresence = isRapier
    ? rapierStructurePresence
    : structurePresence;
  nowRamp(voiceGraph.turbineCoastGain.gain,
    0.06 * turbineCoastAmount * Math.pow(turbineCoastRpm, 0.7)
      * turbineCoastStructurePresence * (sampled ? 1.25 : 1),
    0.16);

  for (const order of voiceGraph.fanOrders) {
    nowRamp(order.oscillator.frequency, orderFundamental * order.ratio, 0.14);
  }
  nowRamp(voiceGraph.flutterLfo.frequency, 3.2 + power * 4.5 + rpm * 2.2, 0.25);

  // Breath AM on liveVca hits the sample bus too — mute it under beds.
  nowRamp(voiceGraph.breathDepth.gain,
    (0.35 + 0.85 * power) * airbornePresence * tonalMute, 0.12);
  nowRamp(voiceGraph.shimmerDepth.gain,
    (0.03 + 0.1 * rpm) * turbineShare * airbornePresence * tonalMute, 0.18);
  nowRamp(voiceGraph.crackleModDepth.gain,
    (0.1 + 0.4 * power + accent * 0.35)
      * airbornePresence * synthDuck * turbineShare, 0.12);

  nowRamp(voiceGraph.coreFilter.frequency, 360 + rpm * 580 + throttle * 480, 0.16);
  nowRamp(voiceGraph.coreFilter.Q, 0.85 - handover * 0.2, 0.18);
  nowRamp(voiceGraph.coreGain.gain,
    (0.06 + 0.28 * Math.sqrt(rpm) * (0.25 + throttle * 0.75))
      * (1 - handover * 0.45) * airbornePresence * synthDuck, 0.16);

  nowRamp(voiceGraph.jetBodyFilter.frequency,
    (isF22 ? 90 : 140) + power * (isF22 ? 220 : 380) + rpm * (isF22 ? 40 : 80), 0.16);
  nowRamp(voiceGraph.jetBodyFilter.Q, 1.65 - power * 0.5, 0.16);
  nowRamp(voiceGraph.jetBodyGain.gain,
    ((isF22 ? 0.7 : 0.4) + (isF22 ? 1.15 : 0.95) * power)
      * (0.65 + 0.35 * turbineShare) * airbornePresence * synthDuck,
    0.14);

  nowRamp(voiceGraph.jetGritFilter.frequency, 600 + power * 1200 + rpm * 180, 0.14);
  nowRamp(voiceGraph.jetGritFilter.Q, 0.55 + power * 0.4, 0.14);
  nowRamp(voiceGraph.jetGritPre.gain,
    (0.12 + 0.78 * Math.pow(power, 1.1) + accent * 0.45) * (0.5 + 0.5 * turbineShare)
      * airbornePresence * synthDuck,
    0.08);

  nowRamp(voiceGraph.jetGritHiFilter.frequency, 1400 + power * 1000 + rpm * 180, 0.14);
  nowRamp(voiceGraph.jetGritHiPre.gain,
    (0.05 + 0.38 * Math.pow(power, 1.25) + accent * 0.28) * (0.4 + 0.6 * turbineShare)
      * airbornePresence * synthDuck,
    0.08);

  nowRamp(voiceGraph.crackleLfo.frequency, 11 + power * 28 + rpm * 10, 0.2);
  nowRamp(voiceGraph.crackleDepth.gain, 0.22 + power * 0.5 + accent * 0.35, 0.18);
  nowRamp(voiceGraph.crackleImpulseGain.gain,
    (0.04 + 0.35 * Math.pow(power, 1.45) + accent * 0.4) * airbornePresence
      * (0.55 + 0.45 * turbineShare) * (sampled ? 0.25 : 1),
    0.06);
  nowRamp(voiceGraph.jetOut.gain, (0.85 + power * 0.35) * (sampled ? 0.35 : 1), 0.16);

  nowRamp(voiceGraph.exhaustDelay.delayTime, 0.007 + (1 - power) * 0.012, 0.25);
  nowRamp(voiceGraph.exhaustFeedback.gain, 0.24 + power * 0.32, 0.2);
  nowRamp(voiceGraph.exhaustOut.gain,
    (0.08 + 0.28 * power) * airbornePresence
      * (0.55 + 0.45 * turbineShare) * synthDuck,
    0.16);

  nowRamp(voiceGraph.fanOrderLp.frequency, 2000 + rpm * 800 + throttle * 250, 0.18);
  nowRamp(voiceGraph.fanOrderGain.gain,
    (0.004 + 0.025 * Math.pow(rpm, 1.15)) * turbineShare * structurePresence
      * tonalMute * fanBoost, 0.14);

  nowRamp(voiceGraph.fanWhineFilter.frequency, 1700 + rpm * 1600 + throttle * 350, 0.14);
  nowRamp(voiceGraph.fanWhineFilter.Q, 10 + rpm * 4, 0.16);
  nowRamp(voiceGraph.fanWhineGain.gain,
    (0.004 + 0.028 * Math.pow(rpm, 1.35)) * turbineShare * structurePresence
      * tonalMute * fanBoost, 0.14);
  nowRamp(voiceGraph.fanWhine2Filter.frequency, 3000 + rpm * 1800 + throttle * 250, 0.14);
  nowRamp(voiceGraph.fanWhine2Gain.gain,
    (0.001 + 0.008 * Math.pow(rpm, 1.4)) * turbineShare * structurePresence
      * tonalMute * fanBoost, 0.14);

  // Cabin darkens hard for synth path; sample path bypasses this (beds are pre-shaped).
  // Rapier is heard through a composite pressure shell plus flight helmet and inserted hearing
  // protection: preserve low/mid structure and the descending coast tone, but do not let the
  // exo-atmospheric handover open a bright exterior spectrum. Radio is injected elsewhere.
  const cockpitCeilingHz = isRapier && !externalPerspective
    ? 980 + power * 520 + q01 * 720 + densityRatio * 900 + handover * 180
    : (sealedF22 ? 650 : isF22 ? 4200 : 3600)
      + power * (sealedF22 ? 550 : isF22 ? 2600 : 1500)
      + q01 * (sealedF22 ? 180 : isF22 ? 1200 : 900);
  nowRamp(voiceGraph.cabinLp.frequency, cockpitCeilingHz, 0.22);

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
    (externalPerspective ? 0.24 : 0.14) * Math.pow(q01, 0.72)
      * rushPresence * (1 + ramShare * 0.35), 0.18);

  nowRamp(voiceGraph.canopyFlowHighpass.frequency,
    (sealedF22 ? 1850 : 1450) + q01 * 850, 0.16);
  nowRamp(voiceGraph.canopyFlowLowpass.frequency,
    3900 + q01 * (externalPerspective ? 6100 : 3900), 0.16);
  nowRamp(voiceGraph.canopyFlowGain.gain,
    ((sealedF22 ? 0.052 : externalPerspective ? 0.105 : 0.04)
      * Math.pow(q01, 1.08)
      + voiceGraph.qAccent * (sealedF22 ? 0.026 : 0.04))
      * rushPresence,
    0.12);

  if (voiceGraph.master) {
    const bedMaster = sealedF22 ? 0.72 : 0.58;
    const synthMaster = externalPerspective && isF22 ? 0.48 : isF22 ? 0.52 : 0.42;
    nowRamp(voiceGraph.master.gain, muted ? 0 : (sampled ? bedMaster : synthMaster),
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
  return finiteNumber(state?.air_density_kg_m3) ?? standardAtmosphereDensity(altitudeM);
}

function dynamicPressureFraction(state) {
  const speedMps = finiteNumber(state?.true_airspeed_mps)
    ?? ((finiteNumber(state?.true_airspeed_kts) ?? 0) * KNOTS_TO_MPS);
  const density = atmosphereDensity(state);
  const dynamicPressurePa = 0.5 * Math.max(0, density) * Math.max(0, speedMps) ** 2;
  return smoothstep(clamp01((dynamicPressurePa - 750) / (45_000 - 750)));
}

export function isExternalAudioPerspective(state) {
  const explicit = String(state?.audio_perspective ?? "").trim().toLowerCase();
  if (["external", "exterior", "flyby", "chase"].includes(explicit)) return true;
  if (["cockpit", "interior"].includes(explicit)) return false;
  return state?.replay_external === true;
}

function finiteNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
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
