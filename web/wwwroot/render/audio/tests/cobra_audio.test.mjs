import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolvePropulsionCharacter } from "../audio_character.js";
import { flightPropulsionGraphGates } from "../flight_audio.js";
import {
  COBRA_MAIN_TO_TAIL_GEAR_RATIO,
  advanceCobraTurnaroundCueState,
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
    cobra_turnaround_phase: "ROTOR_SPINUP",
    cobra_turnaround_sequence: 7.9,
  });
  assert.equal(projected.active, true);
  assert.equal(projected.mainRotorRpm, 324);
  assert.equal(projected.tailRotorRpm, 324 * COBRA_MAIN_TO_TAIL_GEAR_RATIO);
  assert.equal(projected.mainBladePassHz, 10.8);
  assert.ok(Math.abs(projected.tailBladePassHz - 55.3284) < 1e-9);
  assert.equal(projected.enginePower01, 1);
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
  assert.ok(voices.tailRotorGain.gain.value > 0);

  updateCobraAudioVoices(voices, audio, COBRA_RUNNING, { muted: true });
  assert.equal(voices.master.gain.value, 0,
    "mute clamps the Cobra graph at its shared-bus VCA");
  assert.ok(voices.mainRotorGain.gain.value > 0,
    "silent/muted QA keeps authoritative modulation alive behind the VCA");

  updateCobraAudioVoices(voices, audio, {
    ...COBRA_RUNNING,
    audio_profile_id: "audio.fixed-wing.jet.v1",
  }, { muted: false });
  assert.equal(voices.master.gain.value, 0,
    "a non-Cobra frame cannot wake the retained rotorcraft graph");
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
  assert.deepEqual(voices.cueCounts, { switch: 1, starter: 1, lightOff: 0 });

  updateCobraAudioVoices(voices, audio, frame("starting", true));
  updateCobraAudioVoices(voices, audio, frame("starting", true));
  updateCobraAudioVoices(voices, audio, frame("rotor-spinup", true, 10));
  assert.deepEqual(voices.cueCounts, { switch: 1, starter: 1, lightOff: 1 });
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
  assert.deepEqual(voices.cueCounts, { switch: 0, starter: 0, lightOff: 0 });
  updateCobraAudioVoices(voices, audio, frame("starting"), { muted: false });
  assert.deepEqual(voices.cueCounts, { switch: 0, starter: 0, lightOff: 0 },
    "unmute must not replay a historical starter edge");
});

test("flight facade selects one propulsion graph while retaining shared event systems", () => {
  assert.deepEqual(flightPropulsionGraphGates(COBRA_RUNNING, true), {
    propulsionCharacter: "cobra",
    cobraActive: true,
    jetMuted: true,
    cobraMuted: false,
    radioEngine: "cobra",
  });
  assert.deepEqual(flightPropulsionGraphGates({
    audio_profile_id: "audio.fixed-wing.jet.v1",
  }, true), {
    propulsionCharacter: "jet",
    cobraActive: false,
    jetMuted: false,
    cobraMuted: true,
    radioEngine: "jet",
  });
  assert.equal(flightPropulsionGraphGates(COBRA_RUNNING, false).jetMuted, true);
  assert.equal(flightPropulsionGraphGates(COBRA_RUNNING, false).cobraMuted, true);
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
    /radioVoice\.engineMaster = cobraActive \? cobraVoices\?\.master : engineVoices\.master;/,
    "radio ducking must follow whichever propulsion graph is active");
});
