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

function projectedThreatBursts(state) {
  const published = Array.isArray(state?.cobra_ground_fire_recent_bursts)
    ? state.cobra_ground_fire_recent_bursts
    : null;
  const legacySequence = optionalFinite(state?.cobra_ground_fire_last_burst_sequence);
  const source = published ?? (legacySequence == null ? [] : [{
    sequence: legacySequence,
    will_hit: state?.cobra_ground_fire_last_burst_will_hit,
    has_impacted: state?.cobra_ground_fire_last_burst_has_impacted,
    subsystem: state?.cobra_ground_fire_last_burst_subsystem,
  }]);
  const bursts = [];
  for (const burst of source) {
    const sequence = optionalFinite(burst?.sequence);
    if (sequence == null) continue;
    bursts.push(Object.freeze({
      sequence: Math.max(0, Math.trunc(sequence)),
      willHit: burst?.will_hit === true,
      hasImpacted: burst?.has_impacted === true,
      subsystem: String(burst?.subsystem ?? "none"),
    }));
  }
  bursts.sort((left, right) => left.sequence - right.sequence);
  return Object.freeze(bursts);
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
  const collective01 = clamp(optionalFinite(state?.cobra_collective, state?.throttle) ?? 0);
  const transmission01 = clamp(optionalFinite(
    state?.cobra_transmission_limit_fraction,
    state?.engine_spool_fraction,
  ) ?? 0);
  const trueAirspeedKts = Math.max(0, optionalFinite(
    state?.true_airspeed_kts,
    state?.ground_speed_kts,
  ) ?? 0);
  // The bridge publishes advance ratio. The speed fallback keeps older archived states useful,
  // but it is presentation-only and never feeds the vehicle authority.
  const advanceRatio = Math.max(0, optionalFinite(state?.cobra_advance_ratio)
    ?? trueAirspeedKts / 220);
  const enginePower01 = clamp(finite(state?.cobra_engine_power_fraction));
  const rotorLoad01 = clamp(Math.max(
    collective01 * 1.04,
    transmission01,
    enginePower01 * 0.92,
  ));
  const advanceDrive = 0.38 + 0.62 * smoothstep((advanceRatio - 0.06) / 0.34);
  const bladeSlap01 = clamp(
    Math.pow(rotorLoad01, 1.22)
      * Math.pow(clamp(mainRotorRpm / COBRA_NOMINAL_MAIN_ROTOR_RPM, 0, 1.15), 0.7)
      * advanceDrive,
  );
  // Actual bounded events own impact identity. The newest aliases remain below for diagnostics
  // and compatibility with archived frames, but current production audio never binds an older
  // impact to whichever newer burst happens to be last in the list.
  const threatBursts = projectedThreatBursts(state);
  const latestBurst = threatBursts.length ? threatBursts[threatBursts.length - 1] : null;
  return Object.freeze({
    active: resolvePropulsionCharacter(state) === "cobra",
    mainRotorRpm,
    tailRotorRpm,
    mainBladePassHz: rotorBladePassHz(mainRotorRpm, COBRA_MAIN_ROTOR_BLADE_COUNT),
    tailBladePassHz: rotorBladePassHz(tailRotorRpm, COBRA_TAIL_ROTOR_BLADE_COUNT),
    engineOperating: state?.cobra_engine_operating === true,
    enginePower01,
    collective01,
    transmission01,
    trueAirspeedKts,
    advanceRatio,
    rotorLoad01,
    bladeSlap01,
    fireAuthorized: state?.cobra_fire_authorized === true,
    ammoRemaining: optionalFinite(state?.cobra_ammo_remaining),
    roundsExpended: optionalFinite(state?.cobra_rounds_expended),
    receivingGroundFire: state?.cobra_receiving_ground_fire === true,
    threatBursts,
    burstSequence: latestBurst?.sequence ?? null,
    burstWillHit: latestBurst?.willHit ?? false,
    burstHasImpacted: latestBurst?.hasImpacted ?? false,
    burstSubsystem: latestBurst?.subsystem ?? "none",
    burstsFired: optionalFinite(state?.cobra_ground_fire_bursts_fired),
    damagingHits: Math.max(0,
      Math.trunc(optionalFinite(state?.cobra_ground_fire_damaging_hits) ?? 0)),
    phase,
    sequence: normalizedSequence(state?.cobra_turnaround_sequence),
    starting: START_PHASES.has(phase),
    shuttingDown: SHUTDOWN_PHASES.has(phase),
  });
}

/** Dedupe each bounded authority event independently from 60/120 Hz presentation frames. */
export function advanceCobraCombatCueState(previous, sample) {
  const first = previous?.initialized !== true;
  const bursts = Array.isArray(sample?.threatBursts) ? sample.threatBursts : [];
  const maximumSequence = bursts.reduce(
    (maximum, burst) => Math.max(maximum, Math.max(0, finite(burst?.sequence))),
    -1,
  );
  const previousMaximum = optionalFinite(previous?.lastBurstSequence);
  const burstsFired = optionalFinite(sample?.burstsFired);
  const previousBurstsFired = optionalFinite(previous?.burstsFired);
  // Sequence rollback is a new airframe/sortie lifecycle. Baseline the already-present events;
  // neither their muzzle reports nor impacts happened in this audio session.
  const rollback = !first
    && ((maximumSequence >= 0
      && previousMaximum != null
      && maximumSequence < previousMaximum)
      || (burstsFired != null
        && previousBurstsFired != null
        && burstsFired < previousBurstsFired));
  const baseline = first || rollback;
  const priorImpacted = new Set(baseline
    ? []
    : Array.isArray(previous?.impactedBurstSequences)
      ? previous.impactedBurstSequences
      : []);
  const seenBursts = new Set(baseline
    ? []
    : Array.isArray(previous?.seenBurstSequences)
      ? previous.seenBurstSequences
      : []);
  const hostileBurstSequences = [];
  const newlyImpactedSequences = [];
  for (const burst of bursts) {
    const sequence = Math.max(0, Math.trunc(finite(burst?.sequence)));
    if (!baseline && !seenBursts.has(sequence))
      hostileBurstSequences.push(sequence);
    seenBursts.add(sequence);
    if (!baseline
      && burst?.willHit === true
      && burst?.hasImpacted === true
      && !priorImpacted.has(sequence)) {
      newlyImpactedSequences.push(sequence);
    }
    if (burst?.willHit === true && burst?.hasImpacted === true)
      priorImpacted.add(sequence);
  }

  const damagingHits = Math.max(0, sample?.damagingHits ?? 0);
  const priorDamagingHits = Math.max(0, previous?.damagingHits ?? 0);
  const damageDelta = baseline ? 0 : Math.max(0, damagingHits - priorDamagingHits);
  let pendingSequencedDamageCredits = baseline
    ? 0
    : Math.max(0, Math.trunc(finite(previous?.pendingSequencedDamageCredits)));
  let pendingUnsequencedImpactCredits = baseline
      ? 0
    : Math.max(0, Math.trunc(finite(previous?.pendingUnsequencedImpactCredits)));
  const impactSequences = [];
  let sameFrameDamageSlots = damageDelta;
  for (const sequence of newlyImpactedSequences) {
    if (sameFrameDamageSlots > 0) {
      // Prefer an event that arrived with this counter edge. An older anonymous credit represents
      // an already-heard trimmed hit and must not steal identity from a new same-frame impact.
      sameFrameDamageSlots -= 1;
      impactSequences.push(sequence);
      pendingSequencedDamageCredits += 1;
      continue;
    }
    // If the cumulative damage count arrived before (or instead of) its bounded event, that
    // unsequenced fallback already spoke the hit. Consume its credit rather than replaying when
    // the late event becomes identifiable.
    if (pendingUnsequencedImpactCredits > 0) {
      pendingUnsequencedImpactCredits -= 1;
    } else {
      impactSequences.push(sequence);
      pendingSequencedDamageCredits += 1;
    }
  }
  const coveredDamage = Math.min(damageDelta, pendingSequencedDamageCredits);
  pendingSequencedDamageCredits -= coveredDamage;
  // Any remaining counter delta is deliberately anonymous: it can represent an impacted event
  // trimmed from the bounded window in the same authority tick. Play it once, but never bind it
  // to a newer pending sequence. A later identifiable event consumes this credit without replay.
  const unsequencedImpactCount = damageDelta - coveredDamage;
  pendingUnsequencedImpactCredits += unsequencedImpactCount;
  const roundsExpended = sample?.roundsExpended;
  const gunRoundsAdvanced = !first
    && roundsExpended != null
    && previous.roundsExpended != null
    && roundsExpended > previous.roundsExpended;
  return Object.freeze({
    state: Object.freeze({
      initialized: true,
      lastBurstSequence: maximumSequence >= 0 ? maximumSequence : (rollback ? null : previousMaximum),
      impactedBurstSequences: Object.freeze([...priorImpacted].slice(-32)),
      seenBurstSequences: Object.freeze([...seenBursts].slice(-32)),
      burstsFired,
      damagingHits,
      pendingSequencedDamageCredits: Math.min(32, pendingSequencedDamageCredits),
      pendingUnsequencedImpactCredits: Math.min(32, pendingUnsequencedImpactCredits),
      fireAuthorized: sample?.fireAuthorized === true,
      roundsExpended,
    }),
    cues: Object.freeze({
      hostileBurst: hostileBurstSequences.length > 0,
      impact: impactSequences.length > 0 || unsequencedImpactCount > 0,
      gunRoundsAdvanced,
      hostileBurstSequences: Object.freeze(hostileBurstSequences),
      impactSequences: Object.freeze(impactSequences),
      unsequencedImpactCount,
    }),
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
  // Optional rights-cleared T53 rotorcraft cockpit surrogate. It stays inside this graph's mute
  // and the caller-owned duck/compressor/master chain, so decoding never requires (or permits) a
  // second AudioContext.
  const decodedBedInput = audioContext.createGain();
  decodedBedInput.gain.value = 0;
  decodedBedInput.connect(master);

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
  // The low gear mesh supplies structure; a narrow upper line makes the T53/gearbox stack read
  // as machinery instead of one filtered oscillator.
  const gearboxHigh = oscillator(audioContext, "triangle", 1_900);
  const gearboxHighFilter = audioContext.createBiquadFilter();
  gearboxHighFilter.type = "bandpass";
  gearboxHighFilter.frequency.value = 1_900;
  gearboxHighFilter.Q.value = 6.2;
  const gearboxHighGain = audioContext.createGain();
  gearboxHighGain.gain.value = 0;
  gearboxHigh.connect(gearboxHighFilter).connect(gearboxHighGain).connect(master);
  const turbineWhine = oscillator(audioContext, "sine", 2_300);
  const turbineWhineFilter = audioContext.createBiquadFilter();
  turbineWhineFilter.type = "bandpass";
  turbineWhineFilter.frequency.value = 2_300;
  turbineWhineFilter.Q.value = 4.8;
  const turbineWhineGain = audioContext.createGain();
  turbineWhineGain.gain.value = 0;
  turbineWhine.connect(turbineWhineFilter).connect(turbineWhineGain).connect(master);

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

  // Loaded two-blade slap: broadband impulse body, amplitude-modulated at authoritative BPF.
  const bladeSlapNoise = loopingNoise(audioContext);
  const bladeSlapFilter = audioContext.createBiquadFilter();
  bladeSlapFilter.type = "bandpass";
  bladeSlapFilter.frequency.value = 310;
  bladeSlapFilter.Q.value = 0.72;
  const bladeSlapGain = audioContext.createGain();
  bladeSlapGain.gain.value = 0;
  bladeSlapNoise.connect(bladeSlapFilter).connect(bladeSlapGain).connect(master);
  const bladeSlapMod = oscillator(audioContext, "square", 10.8);
  const bladeSlapModDepth = audioContext.createGain();
  bladeSlapModDepth.gain.value = 0;
  bladeSlapMod.connect(bladeSlapModDepth).connect(bladeSlapGain.gain);

  const tailRotor = oscillator(audioContext, "sawtooth", 55.3);
  const tailRotorFilter = audioContext.createBiquadFilter();
  tailRotorFilter.type = "bandpass";
  tailRotorFilter.frequency.value = 112;
  tailRotorFilter.Q.value = 1.1;
  const tailRotorGain = audioContext.createGain();
  tailRotorGain.gain.value = 0;
  tailRotor.connect(tailRotorFilter).connect(tailRotorGain).connect(master);
  const tailRotorHarmonic = oscillator(audioContext, "sawtooth", 332);
  const tailRotorHarmonicFilter = audioContext.createBiquadFilter();
  tailRotorHarmonicFilter.type = "bandpass";
  tailRotorHarmonicFilter.frequency.value = 390;
  tailRotorHarmonicFilter.Q.value = 1.8;
  const tailRotorHarmonicGain = audioContext.createGain();
  tailRotorHarmonicGain.gain.value = 0;
  tailRotorHarmonic
    .connect(tailRotorHarmonicFilter)
    .connect(tailRotorHarmonicGain)
    .connect(master);

  const wind = loopingNoise(audioContext);
  const windHighpass = audioContext.createBiquadFilter();
  windHighpass.type = "highpass";
  windHighpass.frequency.value = 180;
  windHighpass.Q.value = 0.5;
  const windLowpass = audioContext.createBiquadFilter();
  windLowpass.type = "lowpass";
  windLowpass.frequency.value = 2_400;
  windLowpass.Q.value = 0.55;
  const windGain = audioContext.createGain();
  windGain.gain.value = 0;
  wind.connect(windHighpass).connect(windLowpass).connect(windGain).connect(master);

  // The chin turret is a high-rate mechanical chatter, not the fixed-wing M61 report path.
  const gunNoise = loopingNoise(audioContext);
  const gunFilter = audioContext.createBiquadFilter();
  gunFilter.type = "bandpass";
  gunFilter.frequency.value = 1_250;
  gunFilter.Q.value = 0.7;
  const gunGain = audioContext.createGain();
  gunGain.gain.value = 0;
  gunNoise.connect(gunFilter).connect(gunGain).connect(master);
  const gunPulse = oscillator(audioContext, "square", 38);
  const gunPulseDepth = audioContext.createGain();
  gunPulseDepth.gain.value = 0;
  gunPulse.connect(gunPulseDepth).connect(gunGain.gain);

  return {
    master,
    decodedBedInput,
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
    gearboxHigh,
    gearboxHighFilter,
    gearboxHighGain,
    turbineWhine,
    turbineWhineFilter,
    turbineWhineGain,
    mainRotorFilter,
    mainRotorGain,
    mainRotorMod,
    mainRotorModDepth,
    mainRotorThump,
    mainRotorThumpGain,
    bladeSlapFilter,
    bladeSlapGain,
    bladeSlapMod,
    bladeSlapModDepth,
    tailRotor,
    tailRotorFilter,
    tailRotorGain,
    tailRotorHarmonic,
    tailRotorHarmonicFilter,
    tailRotorHarmonicGain,
    windHighpass,
    windLowpass,
    windGain,
    gunFilter,
    gunGain,
    gunPulse,
    gunPulseDepth,
    cueState: null,
    combatCueState: null,
    lastGunEvidenceAt: null,
    cueCounts: {
      switch: 0,
      starter: 0,
      lightOff: 0,
      hostileBurst: 0,
      impact: 0,
    },
    noiseBuffer: deterministicNoiseBuffer(audioContext),
  };
}

function oneShotOscillator(voices, audioContext, {
  type,
  startHz,
  endHz,
  level,
  durationSeconds,
  delaySeconds = 0,
}) {
  const now = audioContext.currentTime + Math.max(0, finite(delaySeconds));
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

function playThreatBurstCue(voices, audioContext, delaySeconds = 0) {
  const delay = Math.max(0, finite(delaySeconds));
  const now = audioContext.currentTime + delay;
  const source = audioContext.createBufferSource();
  source.buffer = voices.noiseBuffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1_650;
  filter.Q.value = 0.9;
  const gain = audioContext.createGain();
  setAt(gain.gain, 0.0001, now);
  rampAt(gain.gain, 0.055, now + 0.012);
  rampAt(gain.gain, 0.0001, now + 0.22);
  source.connect(filter).connect(gain).connect(voices.master);
  source.start(now);
  source.stop?.(now + 0.24);
  // A lower snap gives hostile fire a different silhouette from the continuous chin-turret buzz.
  oneShotOscillator(voices, audioContext, {
    type: "square",
    startHz: 340,
    endHz: 95,
    level: 0.022,
    durationSeconds: 0.085,
    delaySeconds: delay,
  });
  voices.cueCounts.hostileBurst += 1;
}

function playImpactCue(voices, audioContext, delaySeconds = 0) {
  const now = audioContext.currentTime + Math.max(0, finite(delaySeconds));
  const source = audioContext.createBufferSource();
  source.buffer = voices.noiseBuffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  filter.Q.value = 1.25;
  const gain = audioContext.createGain();
  setAt(gain.gain, 0.13, now);
  rampAt(gain.gain, 0.0001, now + 0.31);
  source.connect(filter).connect(gain).connect(voices.master);
  source.start(now);
  source.stop?.(now + 0.33);
  voices.cueCounts.impact += 1;
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
  const combatEdge = sample.active
    ? advanceCobraCombatCueState(voices.combatCueState, sample)
    : Object.freeze({
      state: null,
      cues: Object.freeze({
        hostileBurst: false,
        impact: false,
        gunRoundsAdvanced: false,
        hostileBurstSequences: Object.freeze([]),
        impactSequences: Object.freeze([]),
        unsequencedImpactCount: 0,
      }),
    });
  voices.combatCueState = sample.active ? combatEdge.state : null;
  if (sample.active && !muted) {
    if (edge.cues.switch) playSwitchCue(voices, audioContext);
    if (edge.cues.starter) playStarterCue(voices, audioContext);
    // The authority may publish STARTING + engine-on atomically. Preserve the audible order by
    // scheduling light-off just behind the relay/starter edge instead of stacking all three at t0.
    if (edge.cues.lightOff)
      playLightOffCue(voices, audioContext, edge.cues.starter ? 0.30 : 0);
    combatEdge.cues.hostileBurstSequences.forEach((_sequence, index) =>
      playThreatBurstCue(voices, audioContext, index * 0.045));
    combatEdge.cues.impactSequences.forEach((_sequence, index) =>
      playImpactCue(voices, audioContext, index * 0.055));
    for (let index = 0; index < combatEdge.cues.unsequencedImpactCount; index += 1)
      playImpactCue(voices, audioContext,
        (combatEdge.cues.impactSequences.length + index) * 0.055);
  }

  const now = audioContext.currentTime;
  if (combatEdge.cues.gunRoundsAdvanced) voices.lastGunEvidenceAt = now;
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
  // The source loop represents governed flight, not starter engagement or rotor coast-down. Two
  // smooth shoulders keep it entirely inside a narrow Nr window without clicking at the bounds;
  // the procedural graph remains audible everywhere and therefore owns start/stop transitions.
  const governedNrPresence = sample.engineOperating && !sample.starting && !sample.shuttingDown
    ? smoothstep((main01 - 0.90) / 0.075)
      * smoothstep((1.08 - main01) / 0.055)
    : 0;
  target(voices.decodedBedInput.gain,
    live ? 0.48 * governedNrPresence : 0,
    now, live && governedNrPresence > 0 ? 0.26 : 0.035);
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
  const upperGearHz = 1_150 + main01 * 1_850;
  target(voices.gearboxHigh.frequency, upperGearHz, now, 0.13);
  target(voices.gearboxHighFilter.frequency, upperGearHz, now, 0.13);
  target(voices.gearboxHighGain.gain,
    Math.pow(main01, 1.35) * (0.0025 + sample.rotorLoad01 * 0.004), now, 0.13);
  const turbineWhineHz = 1_250 + enginePresence * 3_850;
  target(voices.turbineWhine.frequency, turbineWhineHz, now, 0.12);
  target(voices.turbineWhineFilter.frequency, turbineWhineHz, now, 0.12);
  target(voices.turbineWhineGain.gain,
    Math.pow(enginePresence, 1.3) * 0.0055, now, 0.12);

  const mainPresence = Math.pow(main01, 0.72);
  target(voices.mainRotorMod.frequency, Math.max(0.2, sample.mainBladePassHz), now, 0.12);
  target(voices.mainRotorFilter.frequency, 105 + main01 * 125, now, 0.15);
  target(voices.mainRotorGain.gain,
    mainPresence * (0.041 + sample.rotorLoad01 * 0.023), now, 0.13);
  target(voices.mainRotorModDepth.gain,
    mainPresence * (0.018 + sample.rotorLoad01 * 0.025), now, 0.13);
  target(voices.mainRotorThump.frequency,
    Math.max(0.4, sample.mainBladePassHz * 2), now, 0.12);
  target(voices.mainRotorThumpGain.gain,
    mainPresence * (0.011 + sample.rotorLoad01 * 0.016), now, 0.12);
  target(voices.bladeSlapMod.frequency,
    Math.max(0.2, sample.mainBladePassHz), now, 0.09);
  target(voices.bladeSlapFilter.frequency,
    185 + sample.bladeSlap01 * 430 + sample.advanceRatio * 160, now, 0.1);
  target(voices.bladeSlapGain.gain, sample.bladeSlap01 * 0.044, now, 0.075);
  target(voices.bladeSlapModDepth.gain,
    sample.bladeSlap01 * 0.032, now, 0.075);

  const tailPresence = Math.pow(tail01, 0.82);
  target(voices.tailRotor.frequency, Math.max(0.5, sample.tailBladePassHz), now, 0.12);
  target(voices.tailRotorFilter.frequency,
    75 + sample.tailBladePassHz * 1.25, now, 0.13);
  target(voices.tailRotorGain.gain, tailPresence * 0.012, now, 0.13);
  const tailHarmonicHz = Math.max(1, sample.tailBladePassHz * 6);
  target(voices.tailRotorHarmonic.frequency, tailHarmonicHz, now, 0.1);
  target(voices.tailRotorHarmonicFilter.frequency,
    tailHarmonicHz * 1.08, now, 0.1);
  target(voices.tailRotorHarmonicGain.gain,
    tailPresence * (0.003 + sample.rotorLoad01 * 0.004), now, 0.1);

  const speed01 = smoothstep((sample.trueAirspeedKts - 12) / 105);
  target(voices.windHighpass.frequency, 145 + speed01 * 420, now, 0.12);
  target(voices.windLowpass.frequency, 1_500 + speed01 * 2_500, now, 0.12);
  target(voices.windGain.gain, 0.045 * speed01, now, 0.1);

  const recentRoundEvidence = sample.roundsExpended != null
    && voices.lastGunEvidenceAt != null
    && now - voices.lastGunEvidenceAt <= 0.12;
  const gunLive = sample.fireAuthorized
    && recentRoundEvidence
    && (sample.ammoRemaining == null || sample.ammoRemaining > 0);
  target(voices.gunFilter.frequency,
    1_050 + sample.rotorLoad01 * 460, now, 0.045);
  target(voices.gunGain.gain, gunLive ? 0.075 : 0, now, gunLive ? 0.012 : 0.035);
  target(voices.gunPulse.frequency, 36 + sample.rotorLoad01 * 8, now, 0.05);
  target(voices.gunPulseDepth.gain, gunLive ? 0.052 : 0, now, 0.018);

  return Object.freeze({
    sample,
    cues: Object.freeze({ ...edge.cues, ...combatEdge.cues }),
  });
}
