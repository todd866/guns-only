// Procedural AH-1G ownship presentation on the shared flight-audio bus.
//
// This is an authored cockpit character, not a recording or a claim that the absolute T53,
// gearbox, or blade timbre is measured. The authoritative facts are narrower: the late AH-1G
// has a two-blade 324 rpm main rotor and a two-blade tail rotor geared 5.123:1. Those facts own
// cadence; mission-published engine power and turnaround phases own the start/stop envelope.
// The module never creates an AudioContext and never connects to context.destination directly.

import { resolvePropulsionCharacter } from "./audio_character.js";

export const COBRA_NOMINAL_MAIN_ROTOR_RPM = 324;
export const COBRA_MAIN_ROTOR_BLADE_COUNT = 2;
export const COBRA_TAIL_ROTOR_BLADE_COUNT = 2;
export const COBRA_MAIN_TO_TAIL_GEAR_RATIO = 5.123;

const START_PHASES = new Set([
  "starting",
  "starter",
  "starter-engaged",
  "cranking",
  "light-off",
  "lightoff",
  "rotor-spinup",
  "governor",
]);
const START_ENTRY_PHASES = new Set(["starting", "starter", "starter-engaged", "cranking"]);
const LIGHT_OFF_PHASES = new Set(["light-off", "lightoff", "rotor-spinup", "governor"]);
const SHUTDOWN_PHASES = new Set([
  "shutting-down",
  "shutdown",
  "stopping",
  "rotor-coast",
  "rotor-coastdown",
]);
const SHUTDOWN_ENTRY_PHASES = new Set(["shutting-down", "shutdown", "stopping"]);

const noiseBuffers = new WeakMap();

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizedPhase(value) {
  return String(value ?? "none")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-") || "none";
}

function normalizedSequence(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(0, Math.trunc(numeric));
  return String(value ?? "").trim();
}

export function rotorBladePassHz(rpm, bladeCount) {
  const revolutionsPerMinute = Math.max(0, finite(rpm));
  const blades = Math.max(1, Math.trunc(finite(bladeCount, 1)));
  return revolutionsPerMinute * blades / 60;
}

/**
 * Flatten the future Cobra HUD/audio contract into bounded presentation controls.
 * A missing tail stream falls back to the source-pinned transmission ratio; a published tail
 * value always wins. No field feeds back into vehicle or mission authority.
 */
export function projectCobraAudioState(state) {
  const mainRotorRpm = Math.max(0, finite(state?.cobra_main_rotor_rpm));
  const publishedTailRpm = Number(state?.cobra_tail_rotor_rpm);
  const tailRotorRpm = Number.isFinite(publishedTailRpm)
    ? Math.max(0, publishedTailRpm)
    : mainRotorRpm * COBRA_MAIN_TO_TAIL_GEAR_RATIO;
  const phase = normalizedPhase(state?.cobra_turnaround_phase);
  return Object.freeze({
    active: resolvePropulsionCharacter(state) === "cobra",
    mainRotorRpm,
    tailRotorRpm,
    mainBladePassHz: rotorBladePassHz(mainRotorRpm, COBRA_MAIN_ROTOR_BLADE_COUNT),
    tailBladePassHz: rotorBladePassHz(tailRotorRpm, COBRA_TAIL_ROTOR_BLADE_COUNT),
    engineOperating: state?.cobra_engine_operating === true,
    enginePower01: clamp(finite(state?.cobra_engine_power_fraction)),
    phase,
    sequence: normalizedSequence(state?.cobra_turnaround_sequence),
    starting: START_PHASES.has(phase),
    shuttingDown: SHUTDOWN_PHASES.has(phase),
  });
}

function cueStateFrom(sample, { lightOffLatched = false } = {}) {
  return Object.freeze({
    initialized: true,
    phase: sample.phase,
    sequence: sample.sequence,
    engineOperating: sample.engineOperating,
    starting: sample.starting,
    shuttingDown: sample.shuttingDown,
    lightOffLatched,
  });
}

/**
 * Phase-edge detector for the bounded ground-turnaround sounds. Repeated 60/120 Hz frames return
 * no cues; a sequence id is retained for diagnostics, while category edges prevent a new number
 * on every sub-phase from replaying the starter relay.
 */
export function advanceCobraTurnaroundCueState(previous, sample) {
  const first = previous?.initialized !== true;
  // A graph can be created by the same trusted gesture that begins a start, so an initial
  // STARTER/CRANKING frame is a real cue. Joining later at ROTOR SPINUP/GOVERNOR is not: do not
  // replay the whole switch/start/light-off stack after a refresh or late audio enable.
  const enteredStart = sample.starting && (first
    ? START_ENTRY_PHASES.has(sample.phase)
    : previous.starting !== true);
  const enteredShutdown = sample.shuttingDown && (first
    ? SHUTDOWN_ENTRY_PHASES.has(sample.phase)
    : previous.shuttingDown !== true);
  const enteredExplicitLightOff = !first
    && LIGHT_OFF_PHASES.has(sample.phase)
    && !LIGHT_OFF_PHASES.has(previous.phase);
  const engineLitDuringStart = !first
    && sample.starting
    && previous.engineOperating !== true
    && sample.engineOperating;
  const lightOff = sample.starting
    && previous?.lightOffLatched !== true
    && (enteredExplicitLightOff || engineLitDuringStart);
  const nextState = cueStateFrom(sample, {
    lightOffLatched: sample.starting
      ? previous?.lightOffLatched === true || lightOff
      : false,
  });
  return Object.freeze({
    state: nextState,
    cues: Object.freeze({
      switch: enteredStart || enteredShutdown,
      starter: enteredStart,
      lightOff,
    }),
  });
}

function deterministicNoiseBuffer(audioContext) {
  const cached = noiseBuffers.get(audioContext);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(audioContext.sampleRate * 2));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x41483147;
  for (let index = 0; index < data.length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[index] = seed / 0xffffffff * 2 - 1;
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
  if (!param) return;
  if (typeof param.setValueAtTime === "function") param.setValueAtTime(value, at);
  else param.value = value;
}

function rampAt(param, value, at) {
  if (!param) return;
  if (typeof param.exponentialRampToValueAtTime === "function" && value > 0)
    param.exponentialRampToValueAtTime(value, at);
  else if (typeof param.linearRampToValueAtTime === "function")
    param.linearRampToValueAtTime(value, at);
  else
    param.value = value;
}

function oscillator(audioContext, type, frequencyHz) {
  const node = audioContext.createOscillator();
  node.type = type;
  node.frequency.value = frequencyHz;
  node.start();
  return node;
}

function loopingNoise(audioContext) {
  const source = audioContext.createBufferSource();
  source.buffer = deterministicNoiseBuffer(audioContext);
  source.loop = true;
  source.start();
  return source;
}

/** Build persistent Cobra voices into the caller-owned shared compressor bus. */
export function createCobraAudioVoices(audioContext, destination) {
  const master = audioContext.createGain();
  master.gain.value = 0;
  master.connect(destination);

  const inverter = oscillator(audioContext, "sine", 400);
  const inverterFilter = audioContext.createBiquadFilter();
  inverterFilter.type = "bandpass";
  inverterFilter.frequency.value = 400;
  inverterFilter.Q.value = 8;
  const inverterGain = audioContext.createGain();
  inverterGain.gain.value = 0;
  inverter.connect(inverterFilter).connect(inverterGain).connect(master);

  const starter = oscillator(audioContext, "sawtooth", 180);
  const starterFilter = audioContext.createBiquadFilter();
  starterFilter.type = "bandpass";
  starterFilter.frequency.value = 520;
  starterFilter.Q.value = 1.3;
  const starterGain = audioContext.createGain();
  starterGain.gain.value = 0;
  starter.connect(starterFilter).connect(starterGain).connect(master);

  const turbine = oscillator(audioContext, "triangle", 260);
  const turbineHarmonic = oscillator(audioContext, "sine", 520);
  const turbineFilter = audioContext.createBiquadFilter();
  turbineFilter.type = "bandpass";
  turbineFilter.frequency.value = 780;
  turbineFilter.Q.value = 0.8;
  const turbineGain = audioContext.createGain();
  turbineGain.gain.value = 0;
  turbine.connect(turbineFilter);
  turbineHarmonic.connect(turbineFilter);
  turbineFilter.connect(turbineGain).connect(master);

  const turbineNoise = loopingNoise(audioContext);
  const turbineNoiseFilter = audioContext.createBiquadFilter();
  turbineNoiseFilter.type = "bandpass";
  turbineNoiseFilter.frequency.value = 680;
  turbineNoiseFilter.Q.value = 0.62;
  const turbineNoiseGain = audioContext.createGain();
  turbineNoiseGain.gain.value = 0;
  turbineNoise.connect(turbineNoiseFilter).connect(turbineNoiseGain).connect(master);

  const gearbox = oscillator(audioContext, "triangle", 520);
  const gearboxFilter = audioContext.createBiquadFilter();
  gearboxFilter.type = "bandpass";
  gearboxFilter.frequency.value = 620;
  gearboxFilter.Q.value = 4.2;
  const gearboxGain = audioContext.createGain();
  gearboxGain.gain.value = 0;
  gearbox.connect(gearboxFilter).connect(gearboxGain).connect(master);

  // The two-blade main cadence is mostly felt as amplitude modulation of broadband structure,
  // not as a clean 10.8 Hz loudspeaker tone. A shallow low harmonic supplies the remaining thump.
  const mainRotorNoise = loopingNoise(audioContext);
  const mainRotorFilter = audioContext.createBiquadFilter();
  mainRotorFilter.type = "lowpass";
  mainRotorFilter.frequency.value = 190;
  mainRotorFilter.Q.value = 0.6;
  const mainRotorGain = audioContext.createGain();
  mainRotorGain.gain.value = 0;
  mainRotorNoise.connect(mainRotorFilter).connect(mainRotorGain).connect(master);
  const mainRotorMod = oscillator(audioContext, "sine", 10.8);
  const mainRotorModDepth = audioContext.createGain();
  mainRotorModDepth.gain.value = 0;
  mainRotorMod.connect(mainRotorModDepth).connect(mainRotorGain.gain);

  const mainRotorThump = oscillator(audioContext, "triangle", 21.6);
  const mainRotorThumpFilter = audioContext.createBiquadFilter();
  mainRotorThumpFilter.type = "lowpass";
  mainRotorThumpFilter.frequency.value = 95;
  mainRotorThumpFilter.Q.value = 0.5;
  const mainRotorThumpGain = audioContext.createGain();
  mainRotorThumpGain.gain.value = 0;
  mainRotorThump
    .connect(mainRotorThumpFilter)
    .connect(mainRotorThumpGain)
    .connect(master);

  const tailRotor = oscillator(audioContext, "sawtooth", 55.3);
  const tailRotorFilter = audioContext.createBiquadFilter();
  tailRotorFilter.type = "bandpass";
  tailRotorFilter.frequency.value = 112;
  tailRotorFilter.Q.value = 1.1;
  const tailRotorGain = audioContext.createGain();
  tailRotorGain.gain.value = 0;
  tailRotor.connect(tailRotorFilter).connect(tailRotorGain).connect(master);

  return {
    master,
    inverterGain,
    starter,
    starterFilter,
    starterGain,
    turbine,
    turbineHarmonic,
    turbineFilter,
    turbineGain,
    turbineNoiseFilter,
    turbineNoiseGain,
    gearbox,
    gearboxFilter,
    gearboxGain,
    mainRotorFilter,
    mainRotorGain,
    mainRotorMod,
    mainRotorModDepth,
    mainRotorThump,
    mainRotorThumpGain,
    tailRotor,
    tailRotorFilter,
    tailRotorGain,
    cueState: null,
    cueCounts: { switch: 0, starter: 0, lightOff: 0 },
    noiseBuffer: deterministicNoiseBuffer(audioContext),
  };
}

function oneShotOscillator(voices, audioContext, {
  type,
  startHz,
  endHz,
  level,
  durationSeconds,
}) {
  const now = audioContext.currentTime;
  const source = audioContext.createOscillator();
  source.type = type;
  const gain = audioContext.createGain();
  setAt(source.frequency, startHz, now);
  rampAt(source.frequency, endHz, now + durationSeconds);
  setAt(gain.gain, Math.max(0.0001, level), now);
  rampAt(gain.gain, 0.0001, now + durationSeconds);
  source.connect(gain).connect(voices.master);
  source.start(now);
  source.stop?.(now + durationSeconds + 0.01);
}

function playSwitchCue(voices, audioContext) {
  oneShotOscillator(voices, audioContext, {
    type: "square",
    startHz: 920,
    endHz: 170,
    level: 0.045,
    durationSeconds: 0.045,
  });
  voices.cueCounts.switch += 1;
}

function playStarterCue(voices, audioContext) {
  oneShotOscillator(voices, audioContext, {
    type: "sawtooth",
    startHz: 115,
    endHz: 360,
    level: 0.025,
    durationSeconds: 0.18,
  });
  voices.cueCounts.starter += 1;
}

function playLightOffCue(voices, audioContext, delaySeconds = 0) {
  const now = audioContext.currentTime + Math.max(0, finite(delaySeconds));
  const source = audioContext.createBufferSource();
  source.buffer = voices.noiseBuffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 155;
  filter.Q.value = 0.72;
  const gain = audioContext.createGain();
  setAt(gain.gain, 0.085, now);
  rampAt(gain.gain, 0.0001, now + 0.42);
  source.connect(filter).connect(gain).connect(voices.master);
  source.start(now);
  source.stop?.(now + 0.44);
  voices.cueCounts.lightOff += 1;
}

/** Drive a persistent voice graph from authoritative Cobra presentation fields. */
export function updateCobraAudioVoices(voices, audioContext, state, { muted = false } = {}) {
  if (!voices || !audioContext) return null;
  const sample = projectCobraAudioState(state);
  const edge = sample.active
    ? advanceCobraTurnaroundCueState(voices.cueState, sample)
    : Object.freeze({
      state: null,
      cues: Object.freeze({ switch: false, starter: false, lightOff: false }),
    });
  // A retained Cobra graph may see other programs on the singleton. Reset instead of silently
  // consuming sticky cobra_* phase fields while another propulsion character owns the bus.
  voices.cueState = sample.active ? edge.state : null;
  if (sample.active && !muted) {
    if (edge.cues.switch) playSwitchCue(voices, audioContext);
    if (edge.cues.starter) playStarterCue(voices, audioContext);
    // The authority may publish STARTING + engine-on atomically. Preserve the audible order by
    // scheduling light-off just behind the relay/starter edge instead of stacking all three at t0.
    if (edge.cues.lightOff)
      playLightOffCue(voices, audioContext, edge.cues.starter ? 0.30 : 0);
  }

  const now = audioContext.currentTime;
  const live = sample.active && !muted;
  const main01 = clamp(sample.mainRotorRpm / COBRA_NOMINAL_MAIN_ROTOR_RPM, 0, 1.15);
  const tailNominalRpm = COBRA_NOMINAL_MAIN_ROTOR_RPM * COBRA_MAIN_TO_TAIL_GEAR_RATIO;
  const tail01 = clamp(sample.tailRotorRpm / tailNominalRpm, 0, 1.15);
  const enginePresence = sample.engineOperating
    ? 0.28 + sample.enginePower01 * 0.72
    : sample.enginePower01 * 0.62;
  const starterPresence = sample.starting
    ? clamp(1 - main01 * 1.6) * (0.42 + 0.58 * (1 - sample.enginePower01))
    : 0;
  const electricalPresence = sample.engineOperating || sample.starting || sample.shuttingDown
    ? 1
    : 0;

  target(voices.master.gain, live ? 0.58 : 0, now, live ? 0.16 : 0.02);
  target(voices.inverterGain.gain, electricalPresence * 0.004, now, 0.12);
  target(voices.starter.frequency, 150 + sample.enginePower01 * 760, now, 0.11);
  target(voices.starterFilter.frequency, 380 + sample.enginePower01 * 1_050, now, 0.12);
  target(voices.starterGain.gain, starterPresence * 0.035, now, 0.07);

  target(voices.turbine.frequency, 235 + enginePresence * 780, now, 0.16);
  target(voices.turbineHarmonic.frequency, 470 + enginePresence * 1_560, now, 0.16);
  target(voices.turbineFilter.frequency, 520 + enginePresence * 1_020, now, 0.14);
  target(voices.turbineGain.gain, enginePresence * 0.032, now, 0.13);
  target(voices.turbineNoiseFilter.frequency, 440 + enginePresence * 1_260, now, 0.14);
  target(voices.turbineNoiseGain.gain, enginePresence * 0.022, now, 0.16);

  target(voices.gearbox.frequency, 260 + main01 * 560, now, 0.14);
  target(voices.gearboxFilter.frequency, 330 + main01 * 610, now, 0.14);
  target(voices.gearboxGain.gain,
    Math.pow(main01, 1.15) * (0.007 + sample.enginePower01 * 0.008), now, 0.16);

  const mainPresence = Math.pow(main01, 0.72);
  target(voices.mainRotorMod.frequency, Math.max(0.2, sample.mainBladePassHz), now, 0.12);
  target(voices.mainRotorFilter.frequency, 105 + main01 * 125, now, 0.15);
  target(voices.mainRotorGain.gain, mainPresence * 0.052, now, 0.13);
  target(voices.mainRotorModDepth.gain, mainPresence * 0.029, now, 0.13);
  target(voices.mainRotorThump.frequency,
    Math.max(0.4, sample.mainBladePassHz * 2), now, 0.12);
  target(voices.mainRotorThumpGain.gain, mainPresence * 0.018, now, 0.12);

  const tailPresence = Math.pow(tail01, 0.82);
  target(voices.tailRotor.frequency, Math.max(0.5, sample.tailBladePassHz), now, 0.12);
  target(voices.tailRotorFilter.frequency,
    75 + sample.tailBladePassHz * 1.25, now, 0.13);
  target(voices.tailRotorGain.gain, tailPresence * 0.012, now, 0.13);

  return Object.freeze({ sample, cues: edge.cues });
}
