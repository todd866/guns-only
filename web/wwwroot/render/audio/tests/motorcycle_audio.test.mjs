import assert from "node:assert/strict";
import test from "node:test";

import { resolvePropulsionCharacter } from "../audio_character.js";
import {
  FLIGHT_MIX_PROFILE,
  flightAudioPriorityPlan,
  flightPropulsionGraphGates,
} from "../flight_audio.js";
import {
  createMotorcycleAudioVoices,
  motorcycleFiringCycleHz,
  projectMotorcycleAcoustics,
  updateMotorcycleAudioVoices,
  YZF_R1_FIRING_INTERVAL_DEGREES,
  YZF_R1_IDLE_RPM,
  YZF_R1_REDLINE_RPM,
} from "../motorcycle_audio.js";

class Param {
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
    this.targets.push({ value, at, timeConstant: 0 });
  }
  exponentialRampToValueAtTime(value, at) {
    this.value = value;
    this.targets.push({ value, at, timeConstant: 0 });
  }
  linearRampToValueAtTime(value, at) {
    this.value = value;
    this.targets.push({ value, at, timeConstant: 0 });
  }
}

class Node {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.gain = new Param();
    this.frequency = new Param();
    this.Q = new Param();
    this.playbackRate = new Param(1);
    this.started = 0;
    this.stopped = 0;
  }
  connect(node) {
    this.connections.push(node);
    return node;
  }
  start() { this.started += 1; }
  stop() { this.stopped += 1; }
}

class Context {
  constructor() {
    this.currentTime = 5;
    this.sampleRate = 1_024;
    this.created = [];
    this.buffers = [];
  }
  node(kind) {
    const node = new Node(kind);
    this.created.push(node);
    return node;
  }
  createGain() { return this.node("gain"); }
  createBiquadFilter() { return this.node("filter"); }
  createBufferSource() { return this.node("buffer-source"); }
  createOscillator() { return this.node("oscillator"); }
  createBuffer(_channels, length) {
    const data = new Float32Array(length);
    const buffer = { data, getChannelData: () => data };
    this.buffers.push(buffer);
    return buffer;
  }
}

const RUNNING = Object.freeze({
  audio_profile_id: "audio.yzf-r1.crossplane.v1",
  player_aircraft_id: "vehicle.yzf-r1.track-day.v1",
  rpm: 8_000,
  engine_idle_rpm: 2_000,
  engine_redline_rpm: 14_500,
  throttle: 0.72,
  clutch_engagement: 1,
  gear: 3,
  vx: 45,
  vy: 0,
  vz: 0,
  brake: 0,
  front_grip_use: 0.48,
  rear_grip_use: 0.62,
  slip_front: 0,
  slip_rear: 0,
  on_track: true,
  tipped: false,
  tip_recovery_flash_s: 0,
  phase: "active",
});

test("YZF-R1 identity selects a dedicated crossplane propulsion character", () => {
  assert.equal(resolvePropulsionCharacter(RUNNING), "motorcycle");
  assert.equal(resolvePropulsionCharacter({ player_aircraft_id: "Yamaha YZF-R1" }),
    "motorcycle");
  assert.equal(YZF_R1_IDLE_RPM, 2_000);
  assert.equal(YZF_R1_REDLINE_RPM, 14_500);
  assert.deepEqual(YZF_R1_FIRING_INTERVAL_DEGREES, [270, 180, 90, 180]);
  assert.equal(YZF_R1_FIRING_INTERVAL_DEGREES.reduce((sum, value) => sum + value, 0), 720);
  assert.equal(motorcycleFiringCycleHz(12_000), 100,
    "the full firing order repeats once per two crank revolutions");
  assert.deepEqual(flightPropulsionGraphGates(RUNNING, true), {
    propulsionCharacter: "motorcycle",
    cobraActive: false,
    f14Active: false,
    turbopropActive: false,
    motorcycleActive: true,
    jetMuted: true,
    cobraMuted: true,
    f14Muted: true,
    turbopropMuted: true,
    motorcycleMuted: false,
    radioEngine: "motorcycle",
  });
});

test("priority mix gives fixed-wing gunfire space without invoking a phantom bike/Cobra gun", () => {
  const fixedWing = flightAudioPriorityPlan({
    audio_profile_id: "audio.f22a.aged-twin-fan.v1",
    gun_firing: true,
  }, { live: true, triggerHeld: true });
  assert.equal(fixedWing.sharedGunEnabled, true);
  assert.equal(fixedWing.sharedGunFiring, true);
  assert.equal(fixedWing.propulsionMultiplier, FLIGHT_MIX_PROFILE.gunPropulsionDuck);

  for (const audio_profile_id of [
    "audio.ah1g.t53-b540.v1",
    "audio.fireboss.pt6a-67f.v1",
    "audio.yzf-r1.crossplane.v1",
  ]) {
    assert.deepEqual(flightAudioPriorityPlan({ audio_profile_id, gun_firing: true }, {
      live: true,
      triggerHeld: true,
    }), {
      sharedGunEnabled: false,
      sharedGunFiring: false,
      propulsionMultiplier: 1,
    });
  }
});

test("motorcycle projection follows published RPM limits and separates road from tyre distress", () => {
  const track = projectMotorcycleAcoustics(RUNNING);
  assert.equal(track.active, true);
  assert.equal(track.engineRunning, true);
  assert.equal(track.idleRpm, 2_000);
  assert.equal(track.redlineRpm, 14_500);
  assert.equal(track.rpm01, (8_000 - 2_000) / (14_500 - 2_000));
  assert.equal(track.firingCycleHz, 8_000 / 120);
  assert.equal(track.averageFiringHz, 8_000 / 30);
  assert.equal(track.roughSurface01, 0);

  const offTrack = projectMotorcycleAcoustics({
    ...RUNNING,
    on_track: false,
    slip_rear: 0.85,
    rear_grip_use: 0.98,
  });
  assert.ok(offTrack.roughSurface01 > 0.5);
  assert.ok(offTrack.tyreScrub01 > track.tyreScrub01);
});

test("graph keeps vehicle textures decorrelated and follows RPM, load, speed, grip, and surface", () => {
  const context = new Context();
  const destination = new Node("shared-propulsion-bus");
  const voices = createMotorcycleAudioVoices(context, destination);
  const sources = context.created.filter((node) => node.kind === "buffer-source");
  assert.equal(sources.length, 6);
  assert.equal(new Set(sources.map((source) => source.buffer)).size, sources.length,
    "combustion, wind, tyre, surface, and brake beds cannot share one phase-locked loop");
  assert.deepEqual(voices.master.connections, [destination]);

  const track = updateMotorcycleAudioVoices(voices, context, RUNNING);
  assert.equal(track.rpm, 8_000);
  assert.equal(voices.master.gain.value, 0.56);
  assert.equal(voices.crossplanePulse.playbackRate.value,
    track.firingCycleHz / Math.max(1, voices.pulseNativeCycleHz));
  assert.ok(voices.exhaustBodyGain.gain.value > 0);
  assert.ok(voices.intakeGain.gain.value > 0);
  assert.ok(voices.windGain.gain.value > 0);
  assert.equal(voices.surfaceGain.gain.value, 0);

  updateMotorcycleAudioVoices(voices, context, {
    ...RUNNING,
    on_track: false,
    slip_rear: 0.9,
    rear_grip_use: 1,
  });
  assert.ok(voices.surfaceGain.gain.value > 0);
  assert.ok(voices.tyreGain.gain.value > 0);

  updateMotorcycleAudioVoices(voices, context, RUNNING, { muted: true });
  assert.equal(voices.master.gain.value, 0);
});

test("shift and recovery transients are edge-triggered rather than replayed every frame", () => {
  const context = new Context();
  const voices = createMotorcycleAudioVoices(context, new Node("bus"));
  updateMotorcycleAudioVoices(voices, context, { ...RUNNING, gear: 2 });
  assert.deepEqual(voices.cueCounts, { shift: 0, recovery: 0 },
    "joining a live ride establishes a baseline");

  updateMotorcycleAudioVoices(voices, context, { ...RUNNING, gear: 3 });
  updateMotorcycleAudioVoices(voices, context, { ...RUNNING, gear: 3 });
  assert.equal(voices.cueCounts.shift, 1);

  updateMotorcycleAudioVoices(voices, context, {
    ...RUNNING,
    gear: 3,
    tip_recovery_flash_s: 0.7,
  });
  updateMotorcycleAudioVoices(voices, context, {
    ...RUNNING,
    gear: 3,
    tip_recovery_flash_s: 0.4,
  });
  assert.equal(voices.cueCounts.recovery, 1);

  updateMotorcycleAudioVoices(voices, context, RUNNING);
  updateMotorcycleAudioVoices(voices, context, {
    ...RUNNING,
    tip_recovery_flash_s: 0.6,
  });
  assert.equal(voices.cueCounts.recovery, 2);
});
