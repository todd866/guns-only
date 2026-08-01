import assert from "node:assert/strict";
import test from "node:test";

import {
  casevacAudioQaSilent,
  projectCasevacAudioState,
} from "../casevac_audio.js";

test("projects Medevac cabin audio only from authoritative flight facts", () => {
  assert.deepEqual(projectCasevacAudioState({
    casevac_applied_power_w: 975000,
    casevac_available_power_w: 1950000,
    casevac_lateral_speed_mps: 16,
    casevac_vertical_speed_mps: -1.5,
    casevac_vehicle_flyable: true,
  }), {
    power01: 0.5,
    groundspeed01: 0.5,
    verticalSpeed01: 0.5,
    flyable: true,
  });
});

test("fails finite and bounded for partial or broken observer state", () => {
  assert.deepEqual(projectCasevacAudioState({
    casevac_applied_power_w: Number.NaN,
    casevac_available_power_w: -4,
    casevac_lateral_speed_mps: 999,
    casevac_vertical_speed_mps: -999,
    casevac_vehicle_flyable: false,
  }), {
    power01: 0,
    groundspeed01: 1,
    verticalSpeed01: 1,
    flyable: false,
  });
});

class FakeAudioParam {
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}

class FakeAudioNode {
  constructor() {
    this.gain = new FakeAudioParam();
    this.frequency = new FakeAudioParam();
    this.Q = new FakeAudioParam();
  }
  connect() { return this; }
  start() {}
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = new FakeAudioNode();
    this.sampleRate = 100;
    this.state = "running";
  }
  createGain() { return new FakeAudioNode(); }
  createBiquadFilter() { return new FakeAudioNode(); }
  createOscillator() { return new FakeAudioNode(); }
  createBufferSource() { return new FakeAudioNode(); }
  createBuffer(_channels, length) {
    return { getChannelData: () => new Float32Array(length) };
  }
  async resume() { this.state = "running"; }
}

test("silent QA keeps the CASEVAC signal graph live and clamps only its destination", async () => {
  assert.equal(casevacAudioQaSilent({ search: "?audioQa=silent" }), true);
  assert.equal(casevacAudioQaSilent({ search: "?audioQa=audible" }), false);

  const previousAudioContext = globalThis.AudioContext;
  const previousLocation = globalThis.location;
  globalThis.AudioContext = FakeAudioContext;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { search: "?program=medevac&audioQa=silent" },
  });
  try {
    const audio = await import(`../casevac_audio.js?silent-test=${Date.now()}`);
    assert.equal(audio.primeCasevacAudio(), true);
    audio.setCasevacAudioEnabled(true);
    audio.updateCasevacAudio({
      casevac_applied_power_w: 975000,
      casevac_available_power_w: 1950000,
      casevac_lateral_speed_mps: 16,
      casevac_vertical_speed_mps: 1,
      casevac_vehicle_flyable: true,
    });
    assert.deepEqual(audio.casevacAudioDiagnostics(), {
      enabled: true,
      disabled: false,
      silentQa: true,
      contextState: "running",
      signalActive: true,
      outputGain: 0,
      outputMode: "silent-qa",
    });
  } finally {
    if (previousAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousAudioContext;
    if (previousLocation === undefined) delete globalThis.location;
    else Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: previousLocation,
    });
  }
});
