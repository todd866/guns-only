import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolvePropulsionCharacter } from "../audio_character.js";
import {
  advanceF14AudioEdgeState,
  createF14AudioVoices,
  projectF14AudioState,
  updateF14AudioVoices,
} from "../f14_audio.js";
import { flightPropulsionGraphGates } from "../flight_audio.js";

const f14Source = await readFile(new URL("../f14_audio.js", import.meta.url), "utf8");
const flightSource = await readFile(new URL("../flight_audio.js", import.meta.url), "utf8");

const F14_FRAME = Object.freeze({
  player_aircraft_id: "aircraft.f14a.public-data-surrogate.v1",
  audio_profile_id: "audio.f14a.tf30-twin.v1",
  applied_throttle: 0.78,
  engine_spool_fraction: 0.76,
  engine_rpm_pct: 84,
  max_thrust_fraction: 1,
  true_airspeed_kts: 390,
  dynamic_pressure_kpa: 34,
  mach: 0.72,
  pilot_gz: 3.2,
  pilot_gz_valid: true,
  buffet: false,
  wing_sweep_deg: 28,
  wing_sweep_mode: "AUTO",
});

test("resolves a dedicated F-14 profile before aircraft-id fallback", () => {
  assert.equal(resolvePropulsionCharacter(F14_FRAME), "f14");
  assert.equal(resolvePropulsionCharacter({
    player_aircraft_id: "aircraft.f14a.public-data-surrogate.v1",
  }), "f14");
  assert.equal(resolvePropulsionCharacter({ player_aircraft_id: "F-14A" }), "f14");
  assert.equal(resolvePropulsionCharacter({
    player_aircraft_id: "aircraft.f14a.public-data-surrogate.v1",
    audio_profile_id: "audio.fixed-wing.jet.v1",
  }), "jet", "an explicit generic profile must still outrank the identity fallback");
});

test("projects delivered TF30 power, augmentor, q, G, buffet, and actual sweep", () => {
  const mil = projectF14AudioState(F14_FRAME);
  const augmented = projectF14AudioState({
    ...F14_FRAME,
    applied_throttle: 1,
    engine_spool_fraction: 1,
    engine_rpm_pct: 100,
    dynamic_pressure_kpa: 55,
    pilot_gz: 8.5,
    buffet: true,
    buffet_pitch_deg: 1.6,
    wing_sweep_deg: 68,
    wing_sweep_mode: "MANUAL",
  });

  assert.equal(mil.active, true);
  assert.equal(mil.wingSweepDegrees, 28);
  assert.equal(mil.wingSweepMode, "AUTO");
  assert.ok(mil.augmentation01 < 0.02);
  assert.equal(augmented.rpm01, 1);
  assert.equal(augmented.power01, 1);
  assert.equal(augmented.augmentation01, 1,
    "the current F-14 force model's 1.0 augmented lever gets a distinct top-detent sound");
  assert.equal(augmented.dynamicPressure01, 1);
  assert.equal(augmented.gLoad01, 1);
  assert.ok(augmented.buffet01 >= 0.5);
  assert.equal(augmented.wingSweepDegrees, 68);
  assert.equal(augmented.wingSweepMode, "MANUAL");
  assert.equal(augmented.externalPerspective, false);
  assert.equal(projectF14AudioState({
    ...F14_FRAME,
    replay_external: true,
  }).externalPerspective, true);
  assert.equal(projectF14AudioState({
    ...F14_FRAME,
    replay_external: true,
    audio_perspective: "cockpit",
  }).externalPerspective, false,
  "an explicit cockpit mix wins over a stale replay flag just like the generic graph");

  const nullable = projectF14AudioState({
    ...F14_FRAME,
    applied_throttle: null,
    throttle: 0.61,
    engine_spool_fraction: null,
    engine: 0.58,
    wing_sweep_deg: null,
  });
  assert.equal(nullable.appliedLever, 0.61,
    "null primary aliases cannot suppress valid power fallbacks");
  assert.equal(nullable.deliveredLever, 0.58);
  assert.equal(nullable.wingSweepDegrees, null,
    "an unpublished sweep is unknown, never a physically impossible 0-degree wing");
});

test("deduplicates augmentor and authoritative sweep-motion edges", () => {
  let edge = advanceF14AudioEdgeState(null, projectF14AudioState({
    ...F14_FRAME,
    wing_sweep_deg: 24,
  }), 1);
  assert.deepEqual(edge.cues, { augmentorIgnition: false, sweepLatch: false });

  edge = advanceF14AudioEdgeState(edge.state, projectF14AudioState({
    ...F14_FRAME,
    wing_sweep_deg: 29,
  }), 1.1);
  assert.equal(edge.cues.sweepLatch, true);
  assert.ok(edge.sweepMovement01 > 0);

  edge = advanceF14AudioEdgeState(edge.state, projectF14AudioState({
    ...F14_FRAME,
    wing_sweep_deg: 34,
  }), 1.2);
  assert.equal(edge.cues.sweepLatch, false,
    "continued automatic or manual movement cannot replay the latch each frame");

  edge = advanceF14AudioEdgeState(edge.state, projectF14AudioState({
    ...F14_FRAME,
    engine_spool_fraction: 1,
    applied_throttle: 1,
    wing_sweep_deg: 39,
  }), 1.3);
  assert.equal(edge.cues.augmentorIgnition, true);

  edge = advanceF14AudioEdgeState(edge.state, projectF14AudioState({
    ...F14_FRAME,
    engine_spool_fraction: 1,
    applied_throttle: 1,
    wing_sweep_deg: 44,
  }), 1.4);
  assert.equal(edge.cues.augmentorIgnition, false,
    "holding the top detent cannot replay ignition at render rate");
});

test("holds one sweep motor/latch across 0.1-degree quantization at 0.5 degrees per second", () => {
  let edge = advanceF14AudioEdgeState(null, projectF14AudioState({
    ...F14_FRAME,
    wing_sweep_deg: 28,
  }), 0);
  let latches = 0;
  let movementFrames = 0;
  for (let frame = 1; frame <= 40; frame += 1) {
    const time = frame * 0.05;
    const quantizedDegrees = Math.round((28 + 0.5 * time) * 10) / 10;
    edge = advanceF14AudioEdgeState(edge.state, projectF14AudioState({
      ...F14_FRAME,
      wing_sweep_deg: quantizedDegrees,
    }), time);
    if (edge.cues.sweepLatch) latches += 1;
    if (edge.sweepMovement01 > 0) movementFrames += 1;
  }
  assert.equal(latches, 1,
    "flat quantized frames between real changes cannot chatter the latch");
  assert.ok(movementFrames >= 35,
    "the motor remains continuously present between 0.1-degree snapshot steps");

  for (let frame = 41; frame <= 70; frame += 1) {
    edge = advanceF14AudioEdgeState(edge.state, projectF14AudioState({
      ...F14_FRAME,
      wing_sweep_deg: 29,
    }), frame * 0.05);
    assert.equal(edge.cues.sweepLatch, false);
  }
  assert.equal(edge.sweepMovement01, 0,
    "hysteresis eventually releases once authoritative sweep really stops");
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

test("wires a live F-14 graph to the shared bus and keeps q/G/sweep modulation alive behind mute", () => {
  const audio = new FakeAudioContext();
  const sharedBus = new FakeAudioNode("shared-compressor");
  sharedBus.gain.value = 0.52 / 0.58;
  const voices = createF14AudioVoices(audio, sharedBus);
  assert.deepEqual(voices.master.connections, [sharedBus]);
  assert.deepEqual(voices.decodedBedInput.connections, [voices.master],
    "the decoded fighter-cockpit bed stays inside graph mute and the shared output chain");
  assert.equal(voices.decodedBedInput.gain.value, 0,
    "an asynchronously attached recording starts behind a closed aircraft input");
  assert.doesNotMatch(f14Source, /(?:globalThis\.)?(?:webkit)?AudioContext\s*\(/,
    "the F-14 layer must not allocate a second context");
  assert.doesNotMatch(f14Source, /audioContext\.destination/,
    "the F-14 layer must not bypass shared compression, mute, or silent QA");

  updateF14AudioVoices(voices, audio, F14_FRAME, { muted: false });
  assert.ok(Math.abs(sharedBus.gain.value - 0.52 / 0.58) < 1e-12,
    "RAF graph trims cannot overwrite an in-flight radio duck downstream");
  assert.equal(voices.master.gain.value, 0.62);
  assert.ok(voices.bodyGain.gain.value > 0);
  assert.ok(voices.intakeGain.gain.value > 0);
  assert.ok(voices.leftCompressorGain.gain.value > 0);
  assert.ok(voices.decodedBedInput.gain.value > 0,
    "the surrogate recording is admitted only by a live cockpit frame");

  audio.currentTime += 0.1;
  const moved = updateF14AudioVoices(voices, audio, {
    ...F14_FRAME,
    applied_throttle: 1,
    engine_spool_fraction: 1,
    engine_rpm_pct: 100,
    wing_sweep_deg: 38,
  });
  assert.equal(moved.cues.augmentorIgnition, true);
  assert.equal(moved.cues.sweepLatch, true);
  assert.ok(voices.augmentorGain.gain.value > 0);
  assert.ok(voices.sweepMotorGain.gain.value > 0);
  assert.deepEqual(voices.cueCounts, { augmentorIgnition: 1, sweepLatch: 1 });

  audio.currentTime += 0.1;
  updateF14AudioVoices(voices, audio, {
    ...F14_FRAME,
    applied_throttle: 1,
    engine_spool_fraction: 1,
    engine_rpm_pct: 100,
    wing_sweep_deg: 44,
  }, { muted: true });
  assert.equal(voices.master.gain.value, 0);
  assert.equal(voices.decodedBedInput.gain.value, 0);
  assert.ok(voices.sweepMotorGain.gain.value > 0,
    "silent QA still runs actual-sweep modulation behind the shared-bus VCA");
  assert.deepEqual(voices.cueCounts, { augmentorIgnition: 1, sweepLatch: 1 });

  audio.currentTime += 0.1;
  updateF14AudioVoices(voices, audio, {
    ...F14_FRAME,
    audio_profile_id: "audio.fixed-wing.jet.v1",
  });
  assert.equal(voices.master.gain.value, 0,
    "a retained Tomcat graph cannot wake during a MiG-28 or generic-jet frame");

  updateF14AudioVoices(voices, audio, {
    ...F14_FRAME,
    engine_rpm_pct: 22,
    engine_spool_fraction: 0.18,
  });
  assert.equal(voices.decodedBedInput.gain.value, 0,
    "an in-flight cockpit surrogate cannot cover a future cold or sub-idle Tomcat state");
});

test("F-14 replay perspective opens exterior exhaust while suppressing cockpit structure", () => {
  const cockpitAudio = new FakeAudioContext();
  const exteriorAudio = new FakeAudioContext();
  const cockpit = createF14AudioVoices(cockpitAudio, new FakeAudioNode("shared-compressor"));
  const exterior = createF14AudioVoices(exteriorAudio, new FakeAudioNode("shared-compressor"));
  const energetic = {
    ...F14_FRAME,
    applied_throttle: 1,
    engine_spool_fraction: 1,
    engine_rpm_pct: 100,
    pilot_gz: 7,
    buffet: true,
  };
  updateF14AudioVoices(cockpit, cockpitAudio, {
    ...energetic,
    audio_perspective: "cockpit",
  });
  updateF14AudioVoices(exterior, exteriorAudio, {
    ...energetic,
    replay_external: true,
  });

  assert.ok(exterior.bodyGain.gain.value > cockpit.bodyGain.gain.value);
  assert.ok(exterior.augmentorGain.gain.value > cockpit.augmentorGain.gain.value);
  assert.ok(exterior.rushGain.gain.value > cockpit.rushGain.gain.value);
  assert.ok(exterior.structureGain.gain.value < cockpit.structureGain.gain.value,
    "pilot-load/buffet structure belongs primarily inside the cockpit");
  assert.ok(cockpit.decodedBedInput.gain.value > 0);
  assert.equal(exterior.decodedBedInput.gain.value, 0,
    "an F/A-18 cockpit surrogate must never impersonate F-14 exterior audio");
});

test("muted F-14 augmentor and sweep edges are consumed instead of replayed on unmute", () => {
  const audio = new FakeAudioContext();
  const voices = createF14AudioVoices(audio, new FakeAudioNode("shared-compressor"));
  updateF14AudioVoices(voices, audio, F14_FRAME);
  audio.currentTime += 0.1;
  const moved = {
    ...F14_FRAME,
    applied_throttle: 1,
    engine_spool_fraction: 1,
    engine_rpm_pct: 100,
    wing_sweep_deg: 38,
  };
  updateF14AudioVoices(voices, audio, moved, { muted: true });
  assert.deepEqual(voices.cueCounts, { augmentorIgnition: 0, sweepLatch: 0 });
  audio.currentTime += 0.1;
  updateF14AudioVoices(voices, audio, moved, { muted: false });
  assert.deepEqual(voices.cueCounts, { augmentorIgnition: 0, sweepLatch: 0 },
    "unmute cannot replay a transition consumed by muted or silent-QA presentation");
});

test("flight facade gives F-14 exclusive propulsion while retaining shared events and radio", () => {
  assert.deepEqual(flightPropulsionGraphGates(F14_FRAME, true), {
    propulsionCharacter: "f14",
    cobraActive: false,
    f14Active: true,
    jetMuted: true,
    cobraMuted: true,
    f14Muted: false,
    radioEngine: "f14",
  });
  assert.equal(flightPropulsionGraphGates(F14_FRAME, false).f14Muted, true);
  assert.match(flightSource,
    /propulsionDuck\.connect\(bus\)[\s\S]*?createF14AudioVoices\(context, propulsionDuck\)/,
    "F-14 must use the singleton's shared compressor bus through the radio-duck VCA");
  assert.match(flightSource,
    /updateF14AudioVoices\(f14Voices, context, audioState, \{[\s\S]*?muted: propulsionGates\.f14Muted,[\s\S]*?\}\);/);
  assert.match(flightSource, /updateCombatCueVoices\(/);
  assert.match(flightSource, /updateWarningVoices\(/);
  assert.match(flightSource, /updateRadioVoice\(/);
  assert.match(flightSource,
    /createRadioVoice\(context, bus, \{[\s\S]*?propulsionDuck,[\s\S]*?\}\)/,
    "radio owns one shared multiplier downstream of every propulsion graph");
  assert.match(flightSource,
    /ensureDedicatedAircraftSampleBed\(f14Active, f14Voices, F14_COCKPIT_SAMPLE_BED\)/,
    "the large recording is requested only from the selected F-14 branch");
  assert.doesNotMatch(flightSource, /radioVoice\.engineMaster\s*=/,
    "a render frame cannot repoint or overwrite the asynchronous radio duck");
});
