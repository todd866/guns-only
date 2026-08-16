import test from "node:test";
import assert from "node:assert/strict";
import { resolvePropulsionCharacter } from "../audio_character.js";
import { flightPropulsionGraphGates } from "../flight_audio.js";
import {
  createTurbopropAudioVoices,
  FIRE_BOSS_GOVERNED_PROP_RPM,
  FIRE_BOSS_PROP_BLADE_COUNT,
  propellerBladePassHz,
  projectTurbopropAcoustics,
  updateTurbopropAudioVoices,
} from "../turboprop_audio.js";

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.targets = [];
  }
  setTargetAtTime(value, at, timeConstant) {
    this.value = value;
    this.targets.push({ value, at, timeConstant });
  }
}

class FakeAudioNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.gain = new FakeAudioParam();
    this.frequency = new FakeAudioParam();
    this.Q = new FakeAudioParam();
    this.playbackRate = new FakeAudioParam(1);
    this.started = 0;
  }
  connect(destination) {
    this.connections.push(destination);
    return destination;
  }
  start() { this.started += 1; }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 8;
    this.sampleRate = 48_000;
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

test("Fire Boss selects the shared turboprop graph exclusively", () => {
  const state = { audio_profile_id: "audio.fireboss.pt6a-67f.v1" };
  assert.equal(resolvePropulsionCharacter(state), "turboprop");
  assert.deepEqual(flightPropulsionGraphGates(state, true), {
    propulsionCharacter: "turboprop",
    cobraActive: false,
    f14Active: false,
    turbopropActive: true,
    jetMuted: true,
    cobraMuted: true,
    f14Muted: true,
    turbopropMuted: false,
    radioEngine: "turboprop",
  });
  assert.equal(flightPropulsionGraphGates(state, false).turbopropMuted, true);
});

test("Fire Boss identity fallback selects turboprop without an explicit profile", () => {
  assert.equal(resolvePropulsionCharacter({ player_aircraft_id: "aircraft.at-802f-fireboss" }),
    "turboprop");
});

test("five-blade pressure cadence is derived from governed prop RPM", () => {
  assert.equal(FIRE_BOSS_PROP_BLADE_COUNT, 5);
  assert.equal(FIRE_BOSS_GOVERNED_PROP_RPM, 1_700);
  assert.equal(propellerBladePassHz(1_700, 5), 1_700 * 5 / 60);
  const acoustic = projectTurbopropAcoustics({
    engine_running: true,
    fuel_lb: 1_900,
    propeller_rpm: 1_700,
    propeller_blade_count: 5,
    engine_ng_pct: 92,
    engine_torque_fraction: 0.86,
    throttle: 0.86,
  });
  assert.equal(acoustic.propRpm, 1_700);
  assert.equal(acoustic.bladeCount, 5);
  assert.equal(acoustic.bladePassHz, 1_700 * 5 / 60);
  assert.equal(acoustic.shaftHz, 1_700 / 60);
});

test("the constant-speed prop stays on pitch while power changes torque and Ng", () => {
  const idle = projectTurbopropAcoustics({
    engine_running: true,
    fuel_lb: 1_900,
    propeller_rpm: 1_700,
    engine_ng_pct: 62,
    engine_torque_fraction: 0.08,
    throttle: 0.08,
  });
  const takeoff = projectTurbopropAcoustics({
    engine_running: true,
    fuel_lb: 1_900,
    propeller_rpm: 1_700,
    engine_ng_pct: 97,
    engine_torque_fraction: 1,
    throttle: 1,
  });
  assert.equal(idle.propRpm, takeoff.propRpm,
    "power changes must not sweep an already-governed propeller tone");
  assert.equal(idle.bladePassHz, takeoff.bladePassHz);
  assert.ok(takeoff.torque01 > idle.torque01);
  assert.ok(takeoff.compressorHz > idle.compressorHz);
});

test("legacy Fire Boss frames default to governed Np instead of coupling pitch to power", () => {
  const lowPower = projectTurbopropAcoustics({
    engine_running: true,
    engine_spool_fraction: 0.2,
    throttle: 0.08,
  });
  const highPower = projectTurbopropAcoustics({
    engine_running: true,
    engine_spool_fraction: 0.98,
    throttle: 1,
  });
  assert.equal(lowPower.propRpm, FIRE_BOSS_GOVERNED_PROP_RPM);
  assert.equal(highPower.propRpm, FIRE_BOSS_GOVERNED_PROP_RPM);
  assert.equal(lowPower.bladePassHz, highPower.bladePassHz);
});

test("shutdown removes prop, compressor and torque authority", () => {
  assert.deepEqual(projectTurbopropAcoustics({
    engine_running: false,
    fuel_lb: 0,
    propeller_rpm: 1_700,
    engine_ng_pct: 97,
    engine_torque_fraction: 1,
  }), {
    engineRunning: false,
    powerLever01: 0,
    engineSpool01: 0,
    torque01: 0,
    ng01: 0,
    propRpm: 0,
    bladeCount: 5,
    shaftHz: 0,
    bladePassHz: 0,
    compressorHz: 2_550,
    speedKts: 0,
    onWater: false,
    scooping: false,
    dropping: false,
  });
});

test("the live graph is broadband and keeps blade cadence independent from load", () => {
  const audio = new FakeAudioContext();
  const sharedBus = new FakeAudioNode("shared-bus");
  const voices = createTurbopropAudioVoices(audio, sharedBus);
  const lowPower = updateTurbopropAudioVoices(voices, audio, {
    engine_running: true,
    fuel_lb: 1_900,
    propeller_rpm: 1_700,
    propeller_blade_count: 5,
    engine_ng_pct: 62,
    engine_torque_fraction: 0.08,
    true_airspeed_kts: 80,
  });
  const lowPlaybackRate = voices.propPulse.playbackRate.value;
  const lowModulatorHz = voices.propModulator.frequency.value;
  const lowExhaustGain = voices.exhaustGain.gain.value;
  const lowCompressorGain = voices.compressorGain.gain.value;
  const highPower = updateTurbopropAudioVoices(voices, audio, {
    engine_running: true,
    fuel_lb: 1_900,
    propeller_rpm: 1_700,
    propeller_blade_count: 5,
    engine_ng_pct: 95,
    engine_torque_fraction: 0.92,
    true_airspeed_kts: 125,
  });

  assert.deepEqual(voices.master.connections, [sharedBus]);
  assert.deepEqual(voices.decodedBedInput.connections, [voices.cabin]);
  assert.ok(voices.decodedBedInput.gain.value > 0,
    "the recording input opens with the live turboprop graph");
  assert.equal(voices.propPulse.started, 1);
  assert.equal(voices.propModulator.started, 1);
  assert.equal(lowPower.bladePassHz, highPower.bladePassHz);
  assert.equal(highPower.bladePassHz, 1_700 * 5 / 60);
  assert.equal(voices.propModulator.frequency.value, highPower.bladePassHz);
  assert.equal(voices.propModulator.frequency.value, lowModulatorHz);
  assert.equal(voices.propPulse.playbackRate.value,
    highPower.bladePassHz / voices.propPulseNativeHz);
  assert.equal(voices.propPulse.playbackRate.value, lowPlaybackRate);
  assert.ok(voices.exhaustGain.gain.value > lowExhaustGain);
  assert.ok(voices.compressorGain.gain.value > lowCompressorGain);
  assert.ok(voices.exhaustGain.gain.value > voices.compressorToneGain.gain.value,
    "cockpit body is broadband exhaust/prop energy, not a dominant synthetic turbine note");
  const oscillators = audio.created.filter((node) => node.kind === "oscillator");
  assert.equal(oscillators.every((node) => node.type === "sine"), true,
    "the engine graph must not reintroduce sawtooth/triangle radial-synth timbre");
});
