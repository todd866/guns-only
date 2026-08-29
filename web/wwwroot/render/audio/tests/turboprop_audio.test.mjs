import test from "node:test";
import assert from "node:assert/strict";
import { resolvePropulsionCharacter } from "../audio_character.js";
import { flightPropulsionGraphGates } from "../flight_audio.js";
import {
  advanceTurbopropWaterCueState,
  createTurbopropAudioVoices,
  FIRE_BOSS_GOVERNED_PROP_RPM,
  FIRE_BOSS_PROP_BLADE_COUNT,
  FIRE_BOSS_REFERENCE_DROP_RATE_KGPS,
  FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS,
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
  setValueAtTime(value, at) {
    this.value = value;
    this.targets.push({ value, at, kind: "set" });
  }
  exponentialRampToValueAtTime(value, at) {
    this.value = value;
    this.targets.push({ value, at, kind: "exponential" });
  }
  linearRampToValueAtTime(value, at) {
    this.value = value;
    this.targets.push({ value, at, kind: "linear" });
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
    this.currentTime = 8;
    this.sampleRate = 48_000;
    this.created = [];
    this.buffers = [];
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
    const buffer = { length, getChannelData: () => new Float32Array(length) };
    this.buffers.push(buffer);
    return buffer;
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
    motorcycleActive: false,
    jetMuted: true,
    cobraMuted: true,
    f14Muted: true,
    turbopropMuted: false,
    motorcycleMuted: true,
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

test("legacy boolean water evidence remains audible when rate fields are absent", () => {
  const scoop = projectTurbopropAcoustics({
    engine_running: true,
    fireboss_scoop_valid: true,
  });
  const drop = projectTurbopropAcoustics({
    engine_running: true,
    fireboss_water_release_kg: 4,
  });
  assert.equal(scoop.scoopRateKgps, FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS);
  assert.equal(drop.dropRateKgps, FIRE_BOSS_REFERENCE_DROP_RATE_KGPS);
});

test("an explicit zero flow rate wins over legacy boolean and tick-mass evidence", () => {
  const scoop = projectTurbopropAcoustics({
    engine_running: true,
    fireboss_scoop_valid: true,
    fireboss_scoop_rate_kgps: 0,
  });
  const drop = projectTurbopropAcoustics({
    engine_running: true,
    fireboss_drop_active: true,
    fireboss_water_release_kg: 4,
    fireboss_water_release_rate_kgps: 0,
  });
  assert.equal(scoop.scoopRateKgps, 0);
  assert.equal(scoop.scooping, false);
  assert.equal(drop.dropRateKgps, 0);
  assert.equal(drop.dropping, false);
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
    waterSpeed01: 0,
    scoopRateKgps: 0,
    scoopFlow01: 0,
    scooping: false,
    waterReleaseKg: 0,
    dropRateKgps: 0,
    dropFlow01: 0,
    dropAirspeed01: 0,
    dropping: false,
  });
});

test("water-operation edges baseline, deduplicate, and retain independent identities", () => {
  const dry = projectTurbopropAcoustics({ engine_running: true });
  const scoop = projectTurbopropAcoustics({
    engine_running: true,
    fireboss_scoop_valid: true,
    fireboss_scoop_rate_kgps: FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS,
  });
  const drop = projectTurbopropAcoustics({
    engine_running: true,
    fireboss_water_release_rate_kgps: FIRE_BOSS_REFERENCE_DROP_RATE_KGPS,
  });
  let edge = advanceTurbopropWaterCueState(null, scoop);
  assert.deepEqual(edge.cues, {
    scoopStart: false, scoopEnd: false, dropStart: false, dropEnd: false,
  }, "joining an active flow must not invent a historical start cue");
  edge = advanceTurbopropWaterCueState(edge.state, scoop);
  assert.equal(edge.cues.scoopStart, false);
  edge = advanceTurbopropWaterCueState(edge.state, dry);
  assert.equal(edge.cues.scoopEnd, true);
  edge = advanceTurbopropWaterCueState(edge.state, drop);
  assert.equal(edge.cues.dropStart, true);
  edge = advanceTurbopropWaterCueState(edge.state, drop);
  assert.equal(edge.cues.dropStart, false);
  edge = advanceTurbopropWaterCueState(edge.state, dry);
  assert.equal(edge.cues.dropEnd, true);
});

test("hull, scoop, and drop voices use independent authority-scaled flows", () => {
  const audio = new FakeAudioContext();
  const voices = createTurbopropAudioVoices(audio, new FakeAudioNode("shared-bus"));
  const running = {
    engine_running: true,
    fuel_lb: 1_900,
    propeller_rpm: 1_700,
    propeller_blade_count: 5,
    engine_ng_pct: 88,
    engine_torque_fraction: 0.72,
  };

  assert.notStrictEqual(voices.hullSource.buffer, voices.scoopSource.buffer);
  assert.notStrictEqual(voices.hullSource.buffer, voices.dropSource.buffer);
  assert.notStrictEqual(voices.scoopSource.buffer, voices.dropSource.buffer);

  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_surface: "water",
    true_airspeed_kts: 0,
  });
  const governedPlaybackRate = voices.propPulse.playbackRate.value;
  assert.equal(voices.hullGain.gain.value, 0,
    "water contact at zero speed cannot produce a permanent spray hiss");

  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_surface: "water",
    true_airspeed_kts: 68,
  });
  assert.ok(voices.hullGain.gain.value > 0);

  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_surface: "water",
    true_airspeed_kts: 68,
    fireboss_scoop_rate_kgps: FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS / 2,
  });
  const halfScoopGain = voices.scoopGain.gain.value;
  assert.equal(voices.cueCounts.scoopStart, 1);
  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_surface: "water",
    true_airspeed_kts: 68,
    fireboss_scoop_rate_kgps: FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS,
  });
  assert.ok(voices.scoopGain.gain.value > halfScoopGain);
  assert.equal(voices.cueCounts.scoopStart, 1, "held flow cannot replay its start transient");

  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_surface: "airborne",
    true_airspeed_kts: 72,
    fireboss_water_release_rate_kgps: FIRE_BOSS_REFERENCE_DROP_RATE_KGPS / 2,
  });
  const halfDropGain = voices.dropGain.gain.value;
  assert.equal(voices.cueCounts.scoopEnd, 1);
  assert.equal(voices.cueCounts.dropStart, 1);
  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_surface: "airborne",
    true_airspeed_kts: 72,
    fireboss_water_release_rate_kgps: FIRE_BOSS_REFERENCE_DROP_RATE_KGPS,
  });
  const fullDropLowSpeedGain = voices.dropGain.gain.value;
  assert.ok(fullDropLowSpeedGain > halfDropGain);
  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_surface: "airborne",
    true_airspeed_kts: 130,
    fireboss_water_release_rate_kgps: FIRE_BOSS_REFERENCE_DROP_RATE_KGPS,
  });
  assert.ok(voices.dropGain.gain.value > fullDropLowSpeedGain,
    "the same release flow must carry more airborne roar at higher TAS");
  assert.equal(voices.cueCounts.dropStart, 1, "held drop cannot replay its start transient");

  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_surface: "airborne",
    true_airspeed_kts: 130,
  });
  assert.equal(voices.dropGain.gain.value, 0);
  assert.equal(voices.cueCounts.dropEnd, 1);
  assert.equal(voices.propPulse.playbackRate.value, governedPlaybackRate,
    "water operations must not perturb governed prop cadence");
});

test("muted water edges are consumed and never replay after unmute", () => {
  const audio = new FakeAudioContext();
  const voices = createTurbopropAudioVoices(audio, new FakeAudioNode("shared-bus"));
  const running = {
    engine_running: true,
    fuel_lb: 1_900,
    propeller_rpm: 1_700,
    true_airspeed_kts: 70,
    fireboss_surface: "water",
  };
  updateTurbopropAudioVoices(voices, audio, running);
  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_scoop_rate_kgps: FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS,
  }, { muted: true });
  updateTurbopropAudioVoices(voices, audio, {
    ...running,
    fireboss_scoop_rate_kgps: FIRE_BOSS_REFERENCE_SCOOP_RATE_KGPS,
  });
  assert.equal(voices.cueCounts.scoopStart, 0);
  assert.ok(voices.scoopGain.gain.value > 0,
    "unmute restores continuous authority without replaying the historical edge");
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
