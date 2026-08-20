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

const COBRA_TORQUE_YAW_REFERENCE_RAD_S = 11 * Math.PI / 180;
const COBRA_MAST_CUE_ON = 0.35;
const COBRA_MAST_CUE_REARM = 0.18;
const COBRA_NOISE_SEEDS = Object.freeze({
  turbine: 0x54555242,
  mainRotor: 0x4d41494e,
  bladeSlap: 0x534c4150,
  rotorRoughness: 0x56525352,
  tailRotor: 0x5441494c,
  wind: 0x57494e44,
  gun: 0x47554e31,
  lightOff: 0x4c495445,
  hostileBurst: 0x484f5354,
  impact: 0x494d5043,
  structure: 0x4d415354,
});

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
  const vortexRing01 = clamp(finite(state?.cobra_vortex_ring_severity));
  const retreatingBladeStall01 = clamp(
    finite(state?.cobra_retreating_blade_stall_severity),
  );
  const mastBump01 = clamp(finite(state?.cobra_mast_bump_risk));
  // Authority publishes 1.0 out of ground effect and a bounded lift multiplier up to 1.30 in
  // ground effect. Normalize only that documented physical interval; archived frames default OGE.
  const groundEffectFactor = clamp(finite(state?.cobra_ground_effect_factor, 1), 1, 1.30);
  const groundEffect01 = clamp((groundEffectFactor - 1) / 0.30);
  const pedal = clamp(finite(state?.cobra_pedal), -1, 1);
  const torqueYawDemandRadS = finite(state?.cobra_torque_yaw_demand_rad_s);
  const scasYawRadS = finite(state?.cobra_scas_yaw_rad_s);
  const yawResidualRadS = finite(state?.cobra_yaw_residual_rad_s);
  const torqueYawDemand01 = clamp(
    Math.abs(torqueYawDemandRadS) / COBRA_TORQUE_YAW_REFERENCE_RAD_S,
  );
  const scasAntiTorque01 = clamp(
    Math.abs(scasYawRadS) / COBRA_TORQUE_YAW_REFERENCE_RAD_S,
  );
  const yawResidual01 = clamp(
    Math.abs(yawResidualRadS) / COBRA_TORQUE_YAW_REFERENCE_RAD_S,
  );
  // Tail energy follows actual workload: main-rotor torque creates the demand, pedal and limited
  // SCAS create anti-torque, and any residual makes the remaining yaw work audible without using
  // body heading or a fabricated slip estimate.
  const antiTorque01 = clamp(Math.max(Math.abs(pedal), scasAntiTorque01));
  const tailLoad01 = clamp(
    torqueYawDemand01 * 0.50 + antiTorque01 * 0.35 + yawResidual01 * 0.15,
  );
  const rotorRoughness01 = clamp(
    Math.max(vortexRing01 * 0.95, retreatingBladeStall01 * 0.86)
      + vortexRing01 * retreatingBladeStall01 * 0.18,
  );
  const rotorLoad01 = clamp(Math.max(
    collective01 * 1.04,
    transmission01,
    enginePower01 * 0.92,
  ));
  const advanceDrive = 0.38 + 0.62 * smoothstep((advanceRatio - 0.06) / 0.34);
  const bladeSlap01 = clamp(
    Math.pow(rotorLoad01, 1.22)
      * Math.pow(clamp(mainRotorRpm / COBRA_NOMINAL_MAIN_ROTOR_RPM, 0, 1.15), 0.7)
      * advanceDrive
      + retreatingBladeStall01 * 0.24
      + groundEffect01 * 0.06,
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
    vortexRing01,
    retreatingBladeStall01,
    mastBump01,
    groundEffectFactor,
    groundEffect01,
    pedal,
    torqueYawDemandRadS,
    scasYawRadS,
    yawResidualRadS,
    torqueYawDemand01,
    antiTorque01,
    yawResidual01,
    tailLoad01,
    rotorRoughness01,
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

/** Hysteretic mast-risk edge: one structure report per excursion, never one per render frame. */
export function advanceCobraStructureCueState(previous, sample) {
  const first = previous?.initialized !== true;
  const mastBump01 = clamp(finite(sample?.mastBump01));
  const armed = first
    ? mastBump01 < COBRA_MAST_CUE_REARM
    : previous.armed === true || mastBump01 < COBRA_MAST_CUE_REARM;
  const structure = !first && armed && mastBump01 >= COBRA_MAST_CUE_ON;
  return Object.freeze({
    state: Object.freeze({
      initialized: true,
      armed: structure ? false : armed,
      mastBump01,
    }),
    cues: Object.freeze({ structure }),
  });
}

function deterministicNoiseBuffer(audioContext, initialSeed = COBRA_NOISE_SEEDS.mainRotor) {
  let buffers = noiseBuffers.get(audioContext);
  if (!buffers) {
    buffers = new Map();
    noiseBuffers.set(audioContext, buffers);
  }
  const seedKey = initialSeed >>> 0;
  const cached = buffers.get(seedKey);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(audioContext.sampleRate * 2));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = seedKey;
  for (let index = 0; index < data.length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[index] = seed / 0xffffffff * 2 - 1;
  }
  buffers.set(seedKey, buffer);
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

function loopingNoise(audioContext, seed) {
  const source = audioContext.createBufferSource();
  source.buffer = deterministicNoiseBuffer(audioContext, seed);
  source.loop = true;
  source.start();
  return source;
}

function sequenceHash01(sequence, salt) {
  let value = (Math.trunc(Math.abs(finite(sequence))) ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

/** Deterministic transient palette keyed only by the authority event identity. */
export function cobraTransientProfile(kind, sequence) {
  const impact = kind === "impact";
  const a = sequenceHash01(sequence, impact ? 11 : 3);
  const b = sequenceHash01(sequence, impact ? 17 : 5);
  const c = sequenceHash01(sequence, impact ? 23 : 7);
  const d = sequenceHash01(sequence, impact ? 29 : 9);
  if (impact) {
    return Object.freeze({
      filterHz: 390 + a * 260,
      filterQ: 0.90 + b * 0.55,
      level: 0.10 + c * 0.045,
      durationSeconds: 0.25 + d * 0.08,
      noiseOffsetSeconds: 0.05 + sequenceHash01(sequence, 31) * 1.50,
    });
  }
  return Object.freeze({
    filterHz: 1_400 + a * 560,
    filterQ: 0.72 + b * 0.42,
    level: 0.046 + c * 0.016,
    durationSeconds: 0.18 + d * 0.055,
    noiseOffsetSeconds: 0.05 + sequenceHash01(sequence, 13) * 1.48,
    snapStartHz: 285 + sequenceHash01(sequence, 19) * 130,
    snapEndHz: 72 + sequenceHash01(sequence, 21) * 55,
    snapLevel: 0.017 + sequenceHash01(sequence, 25) * 0.009,
  });
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

  const turbineNoise = loopingNoise(audioContext, COBRA_NOISE_SEEDS.turbine);
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
  const mainRotorNoise = loopingNoise(audioContext, COBRA_NOISE_SEEDS.mainRotor);
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
  const bladeSlapNoise = loopingNoise(audioContext, COBRA_NOISE_SEEDS.bladeSlap);
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

  // Disturbed inflow is a separate, decorrelated texture rather than simply turning the normal
  // slap louder. VRS supplies the low turbulent body; retreating-blade stall supplies stronger
  // authoritative two-blade cadence through this branch's shallow BPF modulation.
  const rotorRoughnessNoise = loopingNoise(audioContext, COBRA_NOISE_SEEDS.rotorRoughness);
  const rotorRoughnessFilter = audioContext.createBiquadFilter();
  rotorRoughnessFilter.type = "bandpass";
  rotorRoughnessFilter.frequency.value = 280;
  rotorRoughnessFilter.Q.value = 0.58;
  const rotorRoughnessGain = audioContext.createGain();
  rotorRoughnessGain.gain.value = 0;
  rotorRoughnessNoise
    .connect(rotorRoughnessFilter)
    .connect(rotorRoughnessGain)
    .connect(master);
  const rotorRoughnessMod = oscillator(audioContext, "sine", 10.8);
  const rotorRoughnessModDepth = audioContext.createGain();
  rotorRoughnessModDepth.gain.value = 0;
  rotorRoughnessMod.connect(rotorRoughnessModDepth).connect(rotorRoughnessGain.gain);

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

  // Pedal/SCAS/torque workload should add broad tail-rotor air, not only raise two pure saw lines.
  const tailRotorNoise = loopingNoise(audioContext, COBRA_NOISE_SEEDS.tailRotor);
  const tailRotorNoiseFilter = audioContext.createBiquadFilter();
  tailRotorNoiseFilter.type = "bandpass";
  tailRotorNoiseFilter.frequency.value = 920;
  tailRotorNoiseFilter.Q.value = 0.72;
  const tailRotorNoiseGain = audioContext.createGain();
  tailRotorNoiseGain.gain.value = 0;
  tailRotorNoise
    .connect(tailRotorNoiseFilter)
    .connect(tailRotorNoiseGain)
    .connect(master);

  const wind = loopingNoise(audioContext, COBRA_NOISE_SEEDS.wind);
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
  const gunNoise = loopingNoise(audioContext, COBRA_NOISE_SEEDS.gun);
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
    turbineNoise,
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
    mainRotorNoise,
    mainRotorMod,
    mainRotorModDepth,
    mainRotorThump,
    mainRotorThumpGain,
    bladeSlapFilter,
    bladeSlapGain,
    bladeSlapNoise,
    bladeSlapMod,
    bladeSlapModDepth,
    rotorRoughnessNoise,
    rotorRoughnessFilter,
    rotorRoughnessGain,
    rotorRoughnessMod,
    rotorRoughnessModDepth,
    tailRotor,
    tailRotorFilter,
    tailRotorGain,
    tailRotorHarmonic,
    tailRotorHarmonicFilter,
    tailRotorHarmonicGain,
    tailRotorNoise,
    tailRotorNoiseFilter,
    tailRotorNoiseGain,
    windHighpass,
    windLowpass,
    windGain,
    wind,
    gunFilter,
    gunGain,
    gunPulse,
    gunPulseDepth,
    gunNoise,
    cueState: null,
    combatCueState: null,
    structureCueState: null,
    lastGunEvidenceAt: null,
    cueCounts: {
      switch: 0,
      starter: 0,
      lightOff: 0,
      hostileBurst: 0,
      impact: 0,
      structure: 0,
    },
    noiseBuffer: deterministicNoiseBuffer(audioContext, COBRA_NOISE_SEEDS.lightOff),
    threatNoiseBuffer: deterministicNoiseBuffer(audioContext, COBRA_NOISE_SEEDS.hostileBurst),
    impactNoiseBuffer: deterministicNoiseBuffer(audioContext, COBRA_NOISE_SEEDS.impact),
    structureNoiseBuffer: deterministicNoiseBuffer(audioContext, COBRA_NOISE_SEEDS.structure),
    lastHostileProfile: null,
    lastImpactProfile: null,
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

function playThreatBurstCue(voices, audioContext, sequence, delaySeconds = 0) {
  const delay = Math.max(0, finite(delaySeconds));
  const now = audioContext.currentTime + delay;
  const profile = cobraTransientProfile("hostile-burst", sequence);
  const source = audioContext.createBufferSource();
  source.buffer = voices.threatNoiseBuffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = profile.filterHz;
  filter.Q.value = profile.filterQ;
  const gain = audioContext.createGain();
  setAt(gain.gain, 0.0001, now);
  rampAt(gain.gain, profile.level, now + 0.012);
  rampAt(gain.gain, 0.0001, now + profile.durationSeconds);
  source.connect(filter).connect(gain).connect(voices.master);
  source.start(now, profile.noiseOffsetSeconds);
  source.stop?.(now + profile.durationSeconds + 0.02);
  // A lower snap gives hostile fire a different silhouette from the continuous chin-turret buzz.
  oneShotOscillator(voices, audioContext, {
    type: "square",
    startHz: profile.snapStartHz,
    endHz: profile.snapEndHz,
    level: profile.snapLevel,
    durationSeconds: 0.075 + (profile.durationSeconds - 0.18) * 0.28,
    delaySeconds: delay,
  });
  voices.lastHostileProfile = Object.freeze({ sequence, ...profile });
  voices.cueCounts.hostileBurst += 1;
}

function playImpactCue(voices, audioContext, sequence, delaySeconds = 0) {
  const now = audioContext.currentTime + Math.max(0, finite(delaySeconds));
  const profile = cobraTransientProfile("impact", sequence);
  const source = audioContext.createBufferSource();
  source.buffer = voices.impactNoiseBuffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = profile.filterHz;
  filter.Q.value = profile.filterQ;
  const gain = audioContext.createGain();
  setAt(gain.gain, profile.level, now);
  rampAt(gain.gain, 0.0001, now + profile.durationSeconds);
  source.connect(filter).connect(gain).connect(voices.master);
  source.start(now, profile.noiseOffsetSeconds);
  source.stop?.(now + profile.durationSeconds + 0.02);
  voices.lastImpactProfile = Object.freeze({ sequence, ...profile });
  voices.cueCounts.impact += 1;
}

function playStructureCue(voices, audioContext, mastBump01) {
  const severity = clamp(finite(mastBump01));
  const now = audioContext.currentTime;
  const source = audioContext.createBufferSource();
  source.buffer = voices.structureNoiseBuffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 145 + severity * 210;
  filter.Q.value = 0.82 + severity * 0.65;
  const gain = audioContext.createGain();
  setAt(gain.gain, 0.045 + severity * 0.042, now);
  rampAt(gain.gain, 0.0001, now + 0.19);
  source.connect(filter).connect(gain).connect(voices.master);
  source.start(now, 0.31);
  source.stop?.(now + 0.21);
  oneShotOscillator(voices, audioContext, {
    type: "triangle",
    startHz: 128 + severity * 42,
    endHz: 58 + severity * 20,
    level: 0.016 + severity * 0.014,
    durationSeconds: 0.11,
  });
  voices.cueCounts.structure += 1;
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
  const structureEdge = sample.active
    ? advanceCobraStructureCueState(voices.structureCueState, sample)
    : Object.freeze({
      state: null,
      cues: Object.freeze({ structure: false }),
    });
  voices.structureCueState = sample.active ? structureEdge.state : null;
  if (sample.active && !muted) {
    if (edge.cues.switch) playSwitchCue(voices, audioContext);
    if (edge.cues.starter) playStarterCue(voices, audioContext);
    // The authority may publish STARTING + engine-on atomically. Preserve the audible order by
    // scheduling light-off just behind the relay/starter edge instead of stacking all three at t0.
    if (edge.cues.lightOff)
      playLightOffCue(voices, audioContext, edge.cues.starter ? 0.30 : 0);
    combatEdge.cues.hostileBurstSequences.forEach((sequence, index) =>
      playThreatBurstCue(voices, audioContext, sequence, index * 0.045));
    combatEdge.cues.impactSequences.forEach((sequence, index) =>
      playImpactCue(voices, audioContext, sequence, index * 0.055));
    for (let index = 0; index < combatEdge.cues.unsequencedImpactCount; index += 1) {
      // A trimmed event has no sequence, so key its deterministic fallback from the authority's
      // cumulative damage count in a disjoint range. It remains stable without impersonating a
      // later identifiable burst.
      const fallbackIdentity = 0x40000000
        + Math.max(0, sample.damagingHits - combatEdge.cues.unsequencedImpactCount + index + 1);
      playImpactCue(voices, audioContext, fallbackIdentity,
        (combatEdge.cues.impactSequences.length + index) * 0.055);
    }
    if (structureEdge.cues.structure)
      playStructureCue(voices, audioContext, sample.mastBump01);
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
    mainPresence * (0.041 + sample.rotorLoad01 * 0.023
      + sample.groundEffect01 * 0.006), now, 0.13);
  target(voices.mainRotorModDepth.gain,
    mainPresence * (0.018 + sample.rotorLoad01 * 0.025
      + sample.rotorRoughness01 * 0.008), now, 0.13);
  target(voices.mainRotorThump.frequency,
    Math.max(0.4, sample.mainBladePassHz * 2), now, 0.12);
  target(voices.mainRotorThumpGain.gain,
    mainPresence * (0.011 + sample.rotorLoad01 * 0.016
      + sample.groundEffect01 * 0.012
      + sample.rotorRoughness01 * 0.006), now, 0.12);
  target(voices.bladeSlapMod.frequency,
    Math.max(0.2, sample.mainBladePassHz), now, 0.09);
  target(voices.bladeSlapFilter.frequency,
    185 + sample.bladeSlap01 * 430 + sample.advanceRatio * 160, now, 0.1);
  target(voices.bladeSlapGain.gain, sample.bladeSlap01 * 0.044, now, 0.075);
  target(voices.bladeSlapModDepth.gain,
    sample.bladeSlap01 * 0.032, now, 0.075);
  target(voices.rotorRoughnessMod.frequency,
    Math.max(0.2, sample.mainBladePassHz), now, 0.08);
  target(voices.rotorRoughnessFilter.frequency,
    190 + sample.vortexRing01 * 250 + sample.retreatingBladeStall01 * 520,
    now, 0.08);
  const roughnessBase = mainPresence * sample.rotorRoughness01
    * (0.016 + sample.rotorLoad01 * 0.026);
  const roughnessRequestedDepth = mainPresence * sample.rotorRoughness01
    * (0.008 + sample.retreatingBladeStall01 * 0.018);
  target(voices.rotorRoughnessGain.gain, roughnessBase, now, 0.065);
  // AudioParam modulation is summed with the intrinsic gain. Keep the bipolar sine safely below
  // that base so a severe low-load RBS case cannot cross zero and invert/click each half-cycle.
  target(voices.rotorRoughnessModDepth.gain,
    Math.min(roughnessRequestedDepth, roughnessBase * 0.78), now, 0.06);

  const tailPresence = Math.pow(tail01, 0.82);
  target(voices.tailRotor.frequency, Math.max(0.5, sample.tailBladePassHz), now, 0.12);
  target(voices.tailRotorFilter.frequency,
    75 + sample.tailBladePassHz * 1.25, now, 0.13);
  target(voices.tailRotorGain.gain,
    tailPresence * (0.009 + sample.tailLoad01 * 0.012), now, 0.11);
  const tailHarmonicHz = Math.max(1, sample.tailBladePassHz * 6);
  target(voices.tailRotorHarmonic.frequency, tailHarmonicHz, now, 0.1);
  target(voices.tailRotorHarmonicFilter.frequency,
    tailHarmonicHz * 1.08, now, 0.1);
  target(voices.tailRotorHarmonicGain.gain,
    tailPresence * (0.0025 + sample.rotorLoad01 * 0.002
      + sample.tailLoad01 * 0.007), now, 0.09);
  target(voices.tailRotorNoiseFilter.frequency,
    520 + sample.tailBladePassHz * (6.5 + sample.tailLoad01 * 4.5), now, 0.09);
  target(voices.tailRotorNoiseGain.gain,
    tailPresence * (0.0015 + sample.tailLoad01 * 0.013), now, 0.08);

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
    cues: Object.freeze({ ...edge.cues, ...combatEdge.cues, ...structureEdge.cues }),
  });
}
