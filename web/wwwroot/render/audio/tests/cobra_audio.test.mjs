import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolvePropulsionCharacter } from "../audio_character.js";
import { flightPropulsionGraphGates } from "../flight_audio.js";
import {
  COBRA_MAIN_TO_TAIL_GEAR_RATIO,
  advanceCobraCombatCueState,
  advanceCobraStructureCueState,
  advanceCobraTurnaroundCueState,
  cobraTransientProfile,
  createCobraAudioVoices,
  projectCobraAudioState,
  rotorBladePassHz,
  updateCobraAudioVoices,
} from "../cobra_audio.js";

const flightAudioSource = await readFile(new URL("../flight_audio.js", import.meta.url), "utf8");
const cobraAudioSource = await readFile(new URL("../cobra_audio.js", import.meta.url), "utf8");

const COBRA_RUNNING = Object.freeze({
  audio_profile_id: "audio.ah1g.t53-b540.v1",
  cobra_main_rotor_rpm: 324,
  cobra_tail_rotor_rpm: 324 * COBRA_MAIN_TO_TAIL_GEAR_RATIO,
  cobra_engine_operating: true,
  cobra_engine_power_fraction: 0.78,
  cobra_collective: 0.72,
  cobra_transmission_limit_fraction: 0.84,
  cobra_advance_ratio: 0.26,
  cobra_vortex_ring_severity: 0,
  cobra_retreating_blade_stall_severity: 0,
  cobra_mast_bump_risk: 0,
  cobra_ground_effect_factor: 1,
  cobra_pedal: -0.16,
  cobra_torque_yaw_demand_rad_s: 0.11,
  cobra_scas_yaw_rad_s: -0.024,
  cobra_yaw_residual_rad_s: 0.086,
  true_airspeed_kts: 82,
  cobra_fire_authorized: false,
  cobra_ammo_remaining: 900,
  cobra_rounds_expended: 0,
  cobra_turnaround_phase: "ready",
  cobra_turnaround_sequence: 1,
});

test("resolves the explicit Cobra profile before aircraft-id fallbacks", () => {
  assert.equal(resolvePropulsionCharacter(COBRA_RUNNING), "cobra");
  assert.equal(resolvePropulsionCharacter({ player_aircraft_id: "aircraft.ah-1g-cobra" }), "cobra");
  assert.equal(resolvePropulsionCharacter({ player_aircraft_id: "AH1G" }), "cobra");
  assert.equal(resolvePropulsionCharacter({
    audio_profile_id: "audio.fixed-wing.jet.v1",
    player_aircraft_id: "aircraft.ah-1g-cobra",
  }), "jet", "an explicit audio profile must outrank the identity fallback");
});

test("projects authoritative rotor cadence and bounds partial turnaround state", () => {
  const projected = projectCobraAudioState({
    ...COBRA_RUNNING,
    cobra_engine_power_fraction: 4,
    cobra_vortex_ring_severity: 0.48,
    cobra_retreating_blade_stall_severity: 0.62,
    cobra_mast_bump_risk: 0.41,
    cobra_ground_effect_factor: 1.18,
    cobra_pedal: -0.60,
    cobra_torque_yaw_demand_rad_s: 0.18,
    cobra_scas_yaw_rad_s: -0.04,
    cobra_yaw_residual_rad_s: 0.14,
    cobra_turnaround_phase: "ROTOR_SPINUP",
    cobra_turnaround_sequence: 7.9,
  });
  assert.equal(projected.active, true);
  assert.equal(projected.mainRotorRpm, 324);
  assert.equal(projected.tailRotorRpm, 324 * COBRA_MAIN_TO_TAIL_GEAR_RATIO);
  assert.equal(projected.mainBladePassHz, 10.8);
  assert.ok(Math.abs(projected.tailBladePassHz - 55.3284) < 1e-9);
  assert.equal(projected.enginePower01, 1);
  assert.equal(projected.collective01, 0.72);
  assert.equal(projected.transmission01, 0.84);
  assert.equal(projected.advanceRatio, 0.26);
  assert.equal(projected.rotorLoad01, 0.92);
  assert.ok(projected.bladeSlap01 > 0.5);
  assert.equal(projected.vortexRing01, 0.48);
  assert.equal(projected.retreatingBladeStall01, 0.62);
  assert.equal(projected.mastBump01, 0.41);
  assert.ok(Math.abs(projected.groundEffect01 - 0.6) < 1e-12);
  assert.equal(projected.pedal, -0.60);
  assert.equal(projected.torqueYawDemandRadS, 0.18);
  assert.equal(projected.scasYawRadS, -0.04);
  assert.equal(projected.yawResidualRadS, 0.14);
  assert.ok(projected.rotorRoughness01 > 0.5);
  assert.ok(projected.tailLoad01 > 0.5);
  assert.equal(projected.phase, "rotor-spinup");
  assert.equal(projected.sequence, 7);
  assert.equal(projected.starting, true);

  const fallback = projectCobraAudioState({
    audio_profile_id: "audio.ah1g.t53-b540.v1",
    cobra_main_rotor_rpm: 100,
    cobra_engine_power_fraction: Number.NaN,
  });
  assert.equal(fallback.tailRotorRpm, 100 * COBRA_MAIN_TO_TAIL_GEAR_RATIO);
  assert.equal(fallback.enginePower01, 0);
  assert.equal(rotorBladePassHz(-100, 2), 0);

  const noRecentBurst = projectCobraAudioState({
    ...COBRA_RUNNING,
    cobra_ground_fire_recent_bursts: [],
    cobra_ground_fire_last_burst_sequence: null,
    cobra_ground_fire_bursts_fired: 99,
  });
  assert.equal(noRecentBurst.burstSequence, null,
    "a cumulative count cannot impersonate a transient after the recent-burst list clears");
  assert.deepEqual(noRecentBurst.threatBursts, []);
});

test("deduplicates Cobra gun, hostile-burst, and damaging-impact edges", () => {
  const burst = (sequence, { willHit = false, impacted = false } = {}) => ({
    sequence,
    will_hit: willHit,
    has_impacted: impacted,
    subsystem: willHit ? "scas" : "none",
  });
  const sample = (bursts, overrides = {}) => projectCobraAudioState({
    ...COBRA_RUNNING,
    cobra_ground_fire_recent_bursts: bursts,
    cobra_ground_fire_damaging_hits: 0,
    ...overrides,
  });
  const expected = ({ hostile = [], impacts = [], fallback = 0, gun = false } = {}) => ({
    hostileBurst: hostile.length > 0,
    impact: impacts.length > 0 || fallback > 0,
    gunRoundsAdvanced: gun,
    hostileBurstSequences: hostile,
    impactSequences: impacts,
    unsequencedImpactCount: fallback,
  });

  let edge = advanceCobraCombatCueState(null, sample([burst(4)]));
  assert.deepEqual(edge.cues, expected());

  edge = advanceCobraCombatCueState(edge.state, sample([
    burst(4),
    burst(5, { willHit: true }),
  ], {
    cobra_fire_authorized: true,
    cobra_rounds_expended: 4,
  }));
  assert.deepEqual(edge.cues, expected({ hostile: [5], gun: true }));

  edge = advanceCobraCombatCueState(edge.state, sample([
    burst(4),
    burst(5, { willHit: true, impacted: true }),
  ], {
    cobra_fire_authorized: true,
    cobra_rounds_expended: 4,
    cobra_ground_fire_damaging_hits: 1,
  }));
  assert.deepEqual(edge.cues, expected({ impacts: [5] }));

  edge = advanceCobraCombatCueState(edge.state, sample([
    burst(4),
    burst(5, { willHit: true, impacted: true }),
  ], {
    cobra_fire_authorized: true,
    cobra_rounds_expended: 4,
    cobra_ground_fire_damaging_hits: 1,
  }));
  assert.deepEqual(edge.cues, expected(),
    "a 120 Hz HUD/audio loop cannot replay one authority burst or impact");

  // Burst 7 is newest, but older burst 6 impacts first. Newest-only projection used to attach the
  // damage counter to 7 and either miss 6 or replay the wrong hit later.
  edge = advanceCobraCombatCueState(edge.state, sample([
    burst(5, { willHit: true, impacted: true }),
    burst(6, { willHit: true }),
    burst(7, { willHit: true }),
  ], { cobra_ground_fire_damaging_hits: 1 }));
  assert.deepEqual(edge.cues, expected({ hostile: [6, 7] }));
  edge = advanceCobraCombatCueState(edge.state, sample([
    burst(5, { willHit: true, impacted: true }),
    burst(6, { willHit: true, impacted: true }),
    burst(7, { willHit: true }),
  ], { cobra_ground_fire_damaging_hits: 2 }));
  assert.deepEqual(edge.cues, expected({ impacts: [6] }),
    "the actual older event owns its impact while a newer round remains in flight");
  edge = advanceCobraCombatCueState(edge.state, sample([
    burst(6, { willHit: true, impacted: true }),
    burst(7, { willHit: true, impacted: true }),
  ], { cobra_ground_fire_damaging_hits: 3 }));
  assert.deepEqual(edge.cues, expected({ impacts: [7] }));

  edge = advanceCobraCombatCueState(edge.state, sample([
    burst(0, { willHit: true, impacted: true }),
  ], { cobra_ground_fire_damaging_hits: 0 }));
  assert.deepEqual(edge.cues, expected(),
    "authority restart/airframe replacement rolls sequence back and must stay silent");

  edge = advanceCobraCombatCueState(edge.state, sample([burst(1)]));
  assert.deepEqual(edge.cues, expected({ hostile: [1] }),
    "the first real post-reset monotonic burst still speaks");

  // Only a frame with no usable sequenced events may fall back to a counter delta.
  edge = advanceCobraCombatCueState(edge.state, sample([], {
    cobra_ground_fire_damaging_hits: 2,
  }));
  assert.deepEqual(edge.cues, expected({ fallback: 2 }));
  edge = advanceCobraCombatCueState(edge.state, sample([
    burst(2, { willHit: true }),
  ], { cobra_ground_fire_damaging_hits: 3 }));
  assert.deepEqual(edge.cues, expected({ hostile: [2], fallback: 1 }),
    "an unexplained counter increment speaks anonymously, never as pending burst 2");
  edge = advanceCobraCombatCueState(edge.state, sample([
    burst(2, { willHit: true, impacted: true }),
  ], { cobra_ground_fire_damaging_hits: 3 }));
  assert.deepEqual(edge.cues, expected(),
    "a late authoritative identity consumes the earlier anonymous cue without replaying it");

  let emptyReset = advanceCobraCombatCueState(null, sample([burst(7)], {
    cobra_ground_fire_bursts_fired: 7,
  }));
  emptyReset = advanceCobraCombatCueState(emptyReset.state, sample([], {
    cobra_ground_fire_bursts_fired: 0,
  }));
  assert.deepEqual(emptyReset.cues, expected(),
    "an empty recent list still resets high-water identity when the authority count rolls back");
  emptyReset = advanceCobraCombatCueState(emptyReset.state, sample([burst(1)], {
    cobra_ground_fire_bursts_fired: 1,
  }));
  assert.deepEqual(emptyReset.cues, expected({ hostile: [1] }));

  let lateInsert = advanceCobraCombatCueState(null, sample([burst(4), burst(6)]));
  lateInsert = advanceCobraCombatCueState(lateInsert.state, sample([
    burst(4), burst(5), burst(5), burst(6),
  ]));
  assert.deepEqual(lateInsert.cues, expected({ hostile: [5] }),
    "seen-event identity handles a late insert and duplicate rows without a high-water miss");

  let trimmedImpact = advanceCobraCombatCueState(null, sample([
    burst(6, { willHit: true }), burst(7, { willHit: true }),
  ], { cobra_ground_fire_damaging_hits: 1 }));
  trimmedImpact = advanceCobraCombatCueState(trimmedImpact.state, sample([
    burst(7, { willHit: true }),
  ], { cobra_ground_fire_damaging_hits: 2 }));
  assert.deepEqual(trimmedImpact.cues, expected({ fallback: 1 }),
    "a same-tick trimmed hit still speaks once while a newer burst remains in flight");
  trimmedImpact = advanceCobraCombatCueState(trimmedImpact.state, sample([
    burst(7, { willHit: true, impacted: true }),
  ], { cobra_ground_fire_damaging_hits: 3 }));
  assert.deepEqual(trimmedImpact.cues, expected({ impacts: [7] }),
    "a later same-frame event/counter pair retains its own identity and plays exactly once");
});

test("deduplicates switch, starter, and light-off edges across high-rate frames", () => {
  const sample = (phase, engineOperating, sequence = 4) => projectCobraAudioState({
    audio_profile_id: "audio.ah1g.t53-b540.v1",
    cobra_turnaround_phase: phase,
    cobra_turnaround_sequence: sequence,
    cobra_engine_operating: engineOperating,
  });
  let state = advanceCobraTurnaroundCueState(null, sample("awaiting-start", false));
  assert.deepEqual(state.cues, { switch: false, starter: false, lightOff: false });

  state = advanceCobraTurnaroundCueState(state.state, sample("starting", false));
  assert.deepEqual(state.cues, { switch: true, starter: true, lightOff: false });

  state = advanceCobraTurnaroundCueState(state.state, sample("starting", false));
  assert.deepEqual(state.cues, { switch: false, starter: false, lightOff: false });

  state = advanceCobraTurnaroundCueState(state.state, sample("starting", true));
  assert.deepEqual(state.cues, { switch: false, starter: false, lightOff: true });

  state = advanceCobraTurnaroundCueState(state.state, sample("rotor-spinup", true, 5));
  assert.deepEqual(state.cues, { switch: false, starter: false, lightOff: false },
    "a later authored light-off sub-phase must not replay a cue already fired on engine light");

  state = advanceCobraTurnaroundCueState(state.state, sample("ready", true, 5));
  state = advanceCobraTurnaroundCueState(state.state, sample("shutting-down", true, 6));
  assert.deepEqual(state.cues, { switch: true, starter: false, lightOff: false });
  state = advanceCobraTurnaroundCueState(state.state, sample("shutting-down", true, 6));
  assert.deepEqual(state.cues, { switch: false, starter: false, lightOff: false });

  const joinedLate = advanceCobraTurnaroundCueState(null, sample("rotor-spinup", true, 12));
  assert.deepEqual(joinedLate.cues, { switch: false, starter: false, lightOff: false },
    "joining a turnaround after light-off must not replay the whole start stack");
});

test("mast-risk structure cue uses a rearming hysteresis instead of render-frame repetition", () => {
  const sample = (mastBump01) => ({ mastBump01 });
  let edge = advanceCobraStructureCueState(null, sample(0.08));
  assert.deepEqual(edge.cues, { structure: false });
  edge = advanceCobraStructureCueState(edge.state, sample(0.42));
  assert.deepEqual(edge.cues, { structure: true });
  edge = advanceCobraStructureCueState(edge.state, sample(0.58));
  assert.deepEqual(edge.cues, { structure: false },
    "one high-risk excursion cannot clatter once per 120 Hz presentation frame");
  edge = advanceCobraStructureCueState(edge.state, sample(0.24));
  assert.deepEqual(edge.cues, { structure: false },
    "risk must clear the lower threshold before another report is armed");
  edge = advanceCobraStructureCueState(edge.state, sample(0.10));
  edge = advanceCobraStructureCueState(edge.state, sample(0.36));
  assert.deepEqual(edge.cues, { structure: true });

  const joinedHigh = advanceCobraStructureCueState(null, sample(0.7));
  assert.deepEqual(joinedHigh.cues, { structure: false },
    "late audio enable cannot report a mast event that predates the graph");
});

test("hostile burst and impact palettes vary deterministically by authority sequence", () => {
  const burst17 = cobraTransientProfile("hostile-burst", 17);
  const burst17Replay = cobraTransientProfile("hostile-burst", 17);
  const burst18 = cobraTransientProfile("hostile-burst", 18);
  assert.deepEqual(burst17Replay, burst17);
  assert.notDeepEqual(burst18, burst17);
  assert.ok(burst17.filterHz >= 1_400 && burst17.filterHz <= 1_960);
  assert.ok(burst17.noiseOffsetSeconds >= 0.05 && burst17.noiseOffsetSeconds < 1.55);

  const impact17 = cobraTransientProfile("impact", 17);
  const impact18 = cobraTransientProfile("impact", 18);
  assert.notDeepEqual(impact17, impact18);
  assert.notEqual(impact17.filterHz, burst17.filterHz,
    "impact and hostile-fire families retain distinct silhouettes for one event id");
  assert.ok(impact17.durationSeconds >= 0.25 && impact17.durationSeconds <= 0.33);
});

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.targets = [];
  }
  setTargetAtTime(value, at, timeConstant) {
    this.value = value;
    this.targets.push({ kind: "target", value, at, timeConstant });
  }
  setValueAtTime(value, at) {
    this.value = value;
    this.targets.push({ kind: "set", value, at });
  }
  exponentialRampToValueAtTime(value, at) {
    this.value = value;
    this.targets.push({ kind: "exponential", value, at });
  }
  linearRampToValueAtTime(value, at) {
    this.value = value;
    this.targets.push({ kind: "linear", value, at });
  }
}

class FakeAudioNode {
  constructor(kind = "node") {
    this.kind = kind;
    this.connections = [];
    this.gain = new FakeAudioParam();
    this.frequency = new FakeAudioParam();
    this.Q = new FakeAudioParam();
    this.playbackRate = new FakeAudioParam(1);
    this.started = 0;
    this.stopped = 0;
  }
  connect(destination) {
    this.connections.push(destination);
    return destination;
  }
  start() { this.started += 1; }
  stop() { this.stopped += 1; }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 10;
    this.sampleRate = 100;
    this.created = [];
  }
  node(kind) {
    const node = new FakeAudioNode(kind);
    this.created.push(node);
    return node;
  }
  createGain() { return this.node("gain"); }
  createBiquadFilter() { return this.node("filter"); }
  createOscillator() { return this.node("oscillator"); }
  createBufferSource() { return this.node("buffer-source"); }
  createBuffer(_channels, length) {
    return { getChannelData: () => new Float32Array(length) };
  }
}

test("wires into the caller bus, follows authoritative BPF, and applies positive mute polarity", () => {
  const audio = new FakeAudioContext();
  const sharedBus = new FakeAudioNode("shared-compressor");
  const voices = createCobraAudioVoices(audio, sharedBus);
  assert.deepEqual(voices.master.connections, [sharedBus]);
  assert.deepEqual(voices.decodedBedInput.connections, [voices.master],
    "the decoded T53 rotorcraft bed stays inside graph mute and the shared output chain");
  assert.equal(voices.decodedBedInput.gain.value, 0,
    "an asynchronously attached recording starts behind a closed aircraft input");
  assert.doesNotMatch(cobraAudioSource, /(?:globalThis\.)?(?:webkit)?AudioContext\s*\(/,
    "the Cobra layer must not allocate a second context");
  assert.doesNotMatch(cobraAudioSource, /audioContext\.destination/,
    "the Cobra layer must not bypass the shared compressor/master");

  const live = updateCobraAudioVoices(voices, audio, COBRA_RUNNING, { muted: false });
  assert.equal(live.sample.mainBladePassHz, 10.8);
  assert.ok(Math.abs(voices.mainRotorMod.frequency.value - 10.8) < 1e-9);
  assert.ok(Math.abs(voices.tailRotor.frequency.value - 55.3284) < 1e-9);
  assert.equal(voices.master.gain.value, 0.58);
  assert.ok(voices.mainRotorGain.gain.value > 0);
  assert.ok(voices.bladeSlapGain.gain.value > 0);
  assert.ok(voices.tailRotorGain.gain.value > 0);
  assert.ok(voices.turbineWhineGain.gain.value > 0);
  assert.ok(voices.windGain.gain.value > 0);
  assert.ok(voices.decodedBedInput.gain.value > 0,
    "the governed-Nr frame admits the rotorcraft recording");
  const continuousNoiseBuffers = [
    voices.turbineNoise.buffer,
    voices.mainRotorNoise.buffer,
    voices.bladeSlapNoise.buffer,
    voices.rotorRoughnessNoise.buffer,
    voices.tailRotorNoise.buffer,
    voices.wind.buffer,
    voices.gunNoise.buffer,
  ];
  assert.equal(new Set(continuousNoiseBuffers).size, continuousNoiseBuffers.length,
    "continuous branches use independent deterministic noise instead of one phase-locked loop");

  const baselineTailNoise = voices.tailRotorNoiseGain.gain.value;
  const baselineThump = voices.mainRotorThumpGain.gain.value;
  updateCobraAudioVoices(voices, audio, {
    ...COBRA_RUNNING,
    cobra_vortex_ring_severity: 0.55,
    cobra_retreating_blade_stall_severity: 0.68,
    cobra_mast_bump_risk: 0.52,
    cobra_ground_effect_factor: 1.25,
    cobra_pedal: -0.82,
    cobra_torque_yaw_demand_rad_s: 0.19,
    cobra_scas_yaw_rad_s: -0.06,
    cobra_yaw_residual_rad_s: 0.13,
  });
  assert.ok(voices.rotorRoughnessGain.gain.value > 0);
  assert.ok(voices.rotorRoughnessModDepth.gain.value > 0);
  assert.ok(voices.rotorRoughnessModDepth.gain.value
    < voices.rotorRoughnessGain.gain.value,
  "bipolar roughness modulation cannot cross zero and invert the noise branch");
  assert.ok(voices.mainRotorThumpGain.gain.value > baselineThump,
    "published ground effect and disturbed inflow add low rotor structure");
  assert.ok(voices.tailRotorNoiseGain.gain.value > baselineTailNoise,
    "published pedal and anti-torque workload add tail-rotor air");
  assert.equal(voices.cueCounts.structure, 1);
  const nodesAfterStructureCue = audio.created.length;
  updateCobraAudioVoices(voices, audio, {
    ...COBRA_RUNNING,
    cobra_vortex_ring_severity: 0.55,
    cobra_retreating_blade_stall_severity: 0.68,
    cobra_mast_bump_risk: 0.52,
  });
  assert.equal(voices.cueCounts.structure, 1,
    "sustained mast risk cannot allocate a new transient on every hot frame");
  assert.equal(audio.created.length, nodesAfterStructureCue,
    "steady hazard modulation remains allocation-free after the one causal edge");

  updateCobraAudioVoices(voices, audio, COBRA_RUNNING, { muted: true });
  assert.equal(voices.master.gain.value, 0,
    "mute clamps the Cobra graph at its shared-bus VCA");
  assert.equal(voices.decodedBedInput.gain.value, 0,
    "the recording input follows the same positive mute polarity");
  assert.ok(voices.mainRotorGain.gain.value > 0,
    "silent/muted QA keeps authoritative modulation alive behind the VCA");

  updateCobraAudioVoices(voices, audio, {
    ...COBRA_RUNNING,
    cobra_fire_authorized: true,
    cobra_rounds_expended: null,
  });
  assert.equal(voices.gunGain.gain.value, 0,
    "fire permission without authoritative expended-round evidence must fail silent");

  updateCobraAudioVoices(voices, audio, {
    ...COBRA_RUNNING,
    audio_profile_id: "audio.fixed-wing.jet.v1",
  }, { muted: false });
  assert.equal(voices.master.gain.value, 0,
    "a non-Cobra frame cannot wake the retained rotorcraft graph");

  updateCobraAudioVoices(voices, audio, {
    ...COBRA_RUNNING,
    cobra_main_rotor_rpm: 248,
    cobra_turnaround_phase: "rotor-spinup",
  });
  assert.equal(voices.decodedBedInput.gain.value, 0,
    "a governed-flight surrogate cannot cover starter or low-Nr rotor spin-up");

  updateCobraAudioVoices(voices, audio, {
    ...COBRA_RUNNING,
    cobra_turnaround_phase: "shutting-down",
  });
  assert.equal(voices.decodedBedInput.gain.value, 0,
    "shutdown is procedural even if the first authority frame still reports governed Nr");

  updateCobraAudioVoices(voices, audio, {
    ...COBRA_RUNNING,
    cobra_main_rotor_rpm: 356,
  });
  assert.equal(voices.decodedBedInput.gain.value, 0,
    "the governed-flight recording does not mask an Nr overspeed");
});

test("fires each procedural turnaround edge exactly once in the live graph", () => {
  const audio = new FakeAudioContext();
  const voices = createCobraAudioVoices(audio, new FakeAudioNode("shared-compressor"));
  const frame = (phase, engineOperating, sequence = 9) => ({
    ...COBRA_RUNNING,
    cobra_turnaround_phase: phase,
    cobra_turnaround_sequence: sequence,
    cobra_engine_operating: engineOperating,
  });

  updateCobraAudioVoices(voices, audio, frame("awaiting-start", false));
  updateCobraAudioVoices(voices, audio, frame("starting", false));
  updateCobraAudioVoices(voices, audio, frame("starting", false));
  assert.deepEqual(voices.cueCounts, {
    switch: 1, starter: 1, lightOff: 0, hostileBurst: 0, impact: 0, structure: 0,
  });

  updateCobraAudioVoices(voices, audio, frame("starting", true));
  updateCobraAudioVoices(voices, audio, frame("starting", true));
  updateCobraAudioVoices(voices, audio, frame("rotor-spinup", true, 10));
  assert.deepEqual(voices.cueCounts, {
    switch: 1, starter: 1, lightOff: 1, hostileBurst: 0, impact: 0, structure: 0,
  });
});

test("renders dedicated chin-turret chatter and each hostile burst/impact once", () => {
  const audio = new FakeAudioContext();
  const voices = createCobraAudioVoices(audio, new FakeAudioNode("shared-compressor"));
  const combat = (sequence, impacted = false, roundsExpended = 0) => ({
    ...COBRA_RUNNING,
    cobra_fire_authorized: true,
    cobra_ground_fire_last_burst_sequence: sequence,
    cobra_ground_fire_last_burst_will_hit: true,
    cobra_ground_fire_last_burst_has_impacted: impacted,
    cobra_ground_fire_damaging_hits: impacted ? 1 : 0,
    cobra_rounds_expended: roundsExpended,
  });
  updateCobraAudioVoices(voices, audio, combat(12));
  updateCobraAudioVoices(voices, audio, combat(12, false, 8));
  assert.ok(voices.gunGain.gain.value > 0);
  assert.ok(voices.gunPulseDepth.gain.value > 0);
  audio.currentTime += 0.2;
  updateCobraAudioVoices(voices, audio, combat(12, false, 8));
  assert.equal(voices.gunGain.gain.value, 0,
    "engagement authorization without fresh expended-round evidence cannot buzz forever");

  updateCobraAudioVoices(voices, audio, combat(13));
  assert.equal(voices.cueCounts.hostileBurst, 1);
  assert.equal(voices.lastHostileProfile.sequence, 13,
    "the actual authority sequence keys hostile-fire variation");
  assert.deepEqual(
    { ...voices.lastHostileProfile, sequence: undefined },
    { ...cobraTransientProfile("hostile-burst", 13), sequence: undefined },
  );
  updateCobraAudioVoices(voices, audio, combat(13, true));
  assert.equal(voices.cueCounts.impact, 1);
  assert.equal(voices.lastImpactProfile.sequence, 13,
    "the same bounded event identity keys its eventual impact texture");
  updateCobraAudioVoices(voices, audio, combat(13, true));
  assert.equal(voices.cueCounts.hostileBurst, 1);
  assert.equal(voices.cueCounts.impact, 1);

  const overlapping = (impacted) => ({
    ...COBRA_RUNNING,
    cobra_ground_fire_recent_bursts: [
      { sequence: 13, will_hit: true, has_impacted: true, subsystem: "scas" },
      { sequence: 14, will_hit: true, has_impacted: impacted, subsystem: "engine" },
      { sequence: 15, will_hit: true, has_impacted: impacted, subsystem: "scas" },
    ],
    cobra_ground_fire_damaging_hits: impacted ? 3 : 1,
  });
  updateCobraAudioVoices(voices, audio, overlapping(false));
  updateCobraAudioVoices(voices, audio, overlapping(true));
  assert.equal(voices.cueCounts.hostileBurst, 3,
    "each newly published authority burst receives one report");
  assert.equal(voices.cueCounts.impact, 3,
    "two impacts arriving in one authority frame each receive one scheduled cue");
  updateCobraAudioVoices(voices, audio, overlapping(true));
  assert.equal(voices.cueCounts.impact, 3);

  const trimmedImpact = (damagingHits) => ({
    ...COBRA_RUNNING,
    cobra_ground_fire_recent_bursts: [],
    cobra_ground_fire_damaging_hits: damagingHits,
  });
  updateCobraAudioVoices(voices, audio, trimmedImpact(4));
  const firstFallbackIdentity = voices.lastImpactProfile.sequence;
  updateCobraAudioVoices(voices, audio, trimmedImpact(5));
  const secondFallbackIdentity = voices.lastImpactProfile.sequence;
  assert.equal(firstFallbackIdentity, 0x40000004);
  assert.equal(secondFallbackIdentity, 0x40000005);
  assert.notEqual(firstFallbackIdentity, secondFallbackIdentity,
    "trimmed authority hits retain stable distinct variation without borrowing a burst id");
});

test("muted turnaround edges remain silent and are not replayed after unmute", () => {
  const audio = new FakeAudioContext();
  const voices = createCobraAudioVoices(audio, new FakeAudioNode("shared-compressor"));
  const frame = (phase) => ({
    ...COBRA_RUNNING,
    cobra_turnaround_phase: phase,
    cobra_turnaround_sequence: 19,
    cobra_engine_operating: false,
  });
  updateCobraAudioVoices(voices, audio, frame("awaiting-start"), { muted: true });
  updateCobraAudioVoices(voices, audio, frame("starting"), { muted: true });
  assert.deepEqual(voices.cueCounts, {
    switch: 0, starter: 0, lightOff: 0, hostileBurst: 0, impact: 0, structure: 0,
  });
  updateCobraAudioVoices(voices, audio, frame("starting"), { muted: false });
  assert.deepEqual(voices.cueCounts, {
    switch: 0, starter: 0, lightOff: 0, hostileBurst: 0, impact: 0, structure: 0,
  },
    "unmute must not replay a historical starter edge");
  updateCobraAudioVoices(voices, audio, {
    ...frame("ready"), cobra_mast_bump_risk: 0.52,
  }, { muted: true });
  updateCobraAudioVoices(voices, audio, {
    ...frame("ready"), cobra_mast_bump_risk: 0.52,
  }, { muted: false });
  assert.equal(voices.cueCounts.structure, 0,
    "a mast-risk edge consumed under mute cannot replay after unmute");
});

test("muted combat edges are consumed and cannot replay after unmute", () => {
  const audio = new FakeAudioContext();
  const voices = createCobraAudioVoices(audio, new FakeAudioNode("shared-compressor"));
  const frame = (sequence, impacted = false) => ({
    ...COBRA_RUNNING,
    cobra_ground_fire_last_burst_sequence: sequence,
    cobra_ground_fire_last_burst_will_hit: true,
    cobra_ground_fire_last_burst_has_impacted: impacted,
    cobra_ground_fire_damaging_hits: impacted ? 1 : 0,
  });
  updateCobraAudioVoices(voices, audio, frame(20), { muted: true });
  updateCobraAudioVoices(voices, audio, frame(21), { muted: true });
  updateCobraAudioVoices(voices, audio, frame(21), { muted: false });
  updateCobraAudioVoices(voices, audio, frame(21, true), { muted: true });
  updateCobraAudioVoices(voices, audio, frame(21, true), { muted: false });
  assert.equal(voices.cueCounts.hostileBurst, 0);
  assert.equal(voices.cueCounts.impact, 0);
});

test("flight facade selects one propulsion graph while retaining shared event systems", () => {
  assert.deepEqual(flightPropulsionGraphGates(COBRA_RUNNING, true), {
    propulsionCharacter: "cobra",
    cobraActive: true,
    f14Active: false,
    turbopropActive: false,
    motorcycleActive: false,
    jetMuted: true,
    cobraMuted: false,
    f14Muted: true,
    turbopropMuted: true,
    motorcycleMuted: true,
    radioEngine: "cobra",
  });
  assert.deepEqual(flightPropulsionGraphGates({
    audio_profile_id: "audio.fixed-wing.jet.v1",
  }, true), {
    propulsionCharacter: "jet",
    cobraActive: false,
    f14Active: false,
    turbopropActive: false,
    motorcycleActive: false,
    jetMuted: false,
    cobraMuted: true,
    f14Muted: true,
    turbopropMuted: true,
    motorcycleMuted: true,
    radioEngine: "jet",
  });
  assert.equal(flightPropulsionGraphGates(COBRA_RUNNING, false).jetMuted, true);
  assert.equal(flightPropulsionGraphGates(COBRA_RUNNING, false).cobraMuted, true);
  assert.equal(flightPropulsionGraphGates(COBRA_RUNNING, false).f14Muted, true);
  assert.match(flightAudioSource,
    /updateEngineVoices\(engineVoices, context, audioState, \{[\s\S]*?muted: propulsionGates\.jetMuted,[\s\S]*?\}\);/,
    "Cobra must positively mute the generic jet propulsion graph");
  assert.match(flightAudioSource,
    /updateCobraAudioVoices\(cobraVoices, context, audioState, \{[\s\S]*?muted: propulsionGates\.cobraMuted,[\s\S]*?\}\);/,
    "the Cobra graph must be live only for Cobra and inherit shared mute");
  assert.match(flightAudioSource, /updateCombatCueVoices\(/);
  assert.match(flightAudioSource, /updateWarningVoices\(/);
  assert.match(flightAudioSource, /updateRadioVoice\(/);
  assert.match(flightAudioSource,
    /propulsionDuck\.connect\(actionDuck\)\.connect\(bus\)[\s\S]*?createCobraAudioVoices\(context, propulsionDuck\)/,
    "Cobra reaches the shared compressor through independent radio and action ducks");
  assert.match(flightAudioSource,
    /createRadioVoice\(context, radioBus, \{[\s\S]*?propulsionDuck,[\s\S]*?\}\)/,
    "radio ducking is a persistent shared multiplier rather than a graph-master write");
  assert.match(flightAudioSource,
    /ensureDedicatedAircraftSampleBed\(cobraActive, cobraVoices, COBRA_COCKPIT_SAMPLE_BED\)/,
    "the large recording is requested only from the selected Cobra branch");
});
