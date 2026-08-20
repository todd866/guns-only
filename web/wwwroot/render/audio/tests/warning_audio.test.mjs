import assert from "node:assert/strict";
import test from "node:test";

import {
  createWarningVoices,
  resolveWarningAudioPattern,
  updateWarningVoices,
  WARNING_AUDIO_PATTERNS,
} from "../warning_audio.js";

class Param {
  constructor(value = 0) {
    this.value = value;
    this.targets = [];
  }

  setTargetAtTime(value, at, timeConstant) {
    this.value = value;
    this.targets.push({ value, at, timeConstant });
  }
}

class Node {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.frequency = new Param();
    this.Q = new Param();
    this.gain = new Param();
    this.started = 0;
    this.type = "";
  }

  connect(destination) {
    this.connections.push(destination);
    return destination;
  }

  start() {
    this.started += 1;
  }
}

class Context {
  constructor() {
    this.currentTime = 4;
    this.created = [];
  }

  node(kind) {
    const node = new Node(kind);
    this.created.push(node);
    return node;
  }

  createOscillator() { return this.node("oscillator"); }
  createBiquadFilter() { return this.node("filter"); }
  createGain() { return this.node("gain"); }
}

test("warning arbiter selects exactly one published safety condition in priority order", () => {
  const everyWarning = {
    auto_gcas_active: true,
    auto_gcas_warning: true,
    engine_out_audio_active: true,
    cobra_main_rotor_rpm: 220,
    gear_warning_horn: true,
  };
  assert.equal(resolveWarningAudioPattern(everyWarning).id, "gcas-active");

  assert.equal(resolveWarningAudioPattern({
    ...everyWarning,
    auto_gcas_active: false,
  }).id, "engine-out", "engine loss wins its shared tier when low rotor is also present");

  assert.equal(resolveWarningAudioPattern({
    auto_gcas_warning: true,
    engine_running: true,
    cobra_main_rotor_rpm: 291,
    gear_warning_horn: true,
  }).id, "cobra-low-rotor");
  assert.equal(resolveWarningAudioPattern({
    auto_gcas_warning: true,
    engine_running: true,
    cobra_main_rotor_rpm: 324 * 0.9,
    gear_warning_horn: true,
  }).id, "gear-warning", "the 90 percent boundary itself is not low rotor");
  assert.equal(resolveWarningAudioPattern({
    auto_gcas_warning: true,
    engine_running: true,
    gear_warning_horn: true,
  }).id, "gear-warning");
  assert.equal(resolveWarningAudioPattern({
    auto_gcas_warning: true,
    engine_running: true,
  }).id, "gcas-warning");
});

test("turnaround and unrelated cautions fail quiet instead of joining the warning stack", () => {
  assert.equal(resolveWarningAudioPattern({
    engine_running: false,
    cobra_main_rotor_rpm: 0,
    cobra_turnaround_active: true,
    cobra_scas_damaged: true,
    cobra_vortex_ring_severity: 0.8,
    cobra_mast_bump_risk: 0.9,
    fuel_minimum: true,
  }).id, "quiet");

  assert.equal(resolveWarningAudioPattern({
    engine_running: false,
    fireboss_surface: "water",
  }).id, "quiet", "a cold or parked explicit false is not itself an engine-loss event");

  assert.equal(resolveWarningAudioPattern({
    engine_running: true,
    cobra_main_rotor_rpm: 324,
    cobra_receiving_ground_fire: true,
    cobra_retreating_blade_stall_severity: 1,
    flap_limit_exceeded: true,
  }).id, "quiet");
});

test("authored patterns are distinct, bounded, and leave more silence than tone", () => {
  const audible = [
    WARNING_AUDIO_PATTERNS.gcasActive,
    WARNING_AUDIO_PATTERNS.engineOut,
    WARNING_AUDIO_PATTERNS.cobraLowRotor,
    WARNING_AUDIO_PATTERNS.gearWarning,
    WARNING_AUDIO_PATTERNS.gcasWarning,
  ];
  assert.deepEqual(audible.map((entry) => entry.priority), [4, 3, 3, 2, 1]);
  assert.equal(new Set(audible.map((entry) => entry.frequencyHz)).size, audible.length);
  assert.equal(new Set(audible.map((entry) => entry.periodSeconds)).size, audible.length);
  for (const entry of audible) {
    const duty = entry.pulseWindows.reduce((sum, [start, end]) => sum + end - start, 0);
    assert.ok(duty < 0.5, `${entry.id} must not become a mostly-continuous fatigue tone`);
    assert.ok(entry.level > 0 && entry.level <= 0.024);
  }
});

test("one filtered oscillator renders the winning pattern without allocating extra voices", () => {
  const context = new Context();
  const destination = new Node("warning-bus");
  const voices = createWarningVoices(context, destination);

  assert.deepEqual(context.created.map((node) => node.kind), ["oscillator", "filter", "gain"]);
  assert.equal(voices.oscillator.type, "square");
  assert.equal(voices.filter.type, "lowpass");
  assert.equal(voices.oscillator.started, 1);
  assert.deepEqual(voices.oscillator.connections, [voices.filter]);
  assert.deepEqual(voices.filter.connections, [voices.gain]);
  assert.deepEqual(voices.gain.connections, [destination]);

  const selected = updateWarningVoices(voices, context, {
    auto_gcas_active: true,
    engine_running: false,
    gear_warning_horn: true,
  }, { nowSeconds: 42.37 });
  assert.equal(selected.id, "gcas-active");
  assert.equal(voices.oscillator.frequency.value, 920);
  assert.equal(voices.filter.frequency.value, 2_250);
  assert.equal(voices.gain.gain.value, 0.024,
    "a newly selected warning starts immediately instead of waiting on wall-clock phase");

  updateWarningVoices(voices, context, { auto_gcas_active: true }, { nowSeconds: 42.47 });
  assert.equal(voices.gain.gain.value, 0, "the GCAS active cadence has a real off interval");
  updateWarningVoices(voices, context, { auto_gcas_active: true }, { nowSeconds: 42.57 });
  assert.equal(voices.gain.gain.value, 0.024);
  assert.equal(context.created.length, 3, "warning changes reuse the one voice budget");
});

test("muted updates consume authority and cannot replay a cleared warning on resume", () => {
  const context = new Context();
  const voices = createWarningVoices(context, new Node("warning-bus"));

  updateWarningVoices(voices, context, {
    engine_running: true,
  }, { enabled: false, nowSeconds: -0.1 });
  updateWarningVoices(voices, context, {
    engine_running: false,
  }, { enabled: false, nowSeconds: 0 });
  assert.equal(voices.selectedPattern.id, "engine-out");
  assert.equal(voices.gain.gain.value, 0);

  updateWarningVoices(voices, context, {
    engine_running: true,
    cobra_scas_damaged: true,
  }, { enabled: false, nowSeconds: 0.25 });
  assert.equal(voices.selectedPattern.id, "quiet");

  updateWarningVoices(voices, context, {
    engine_running: true,
    cobra_scas_damaged: true,
  }, { enabled: true, nowSeconds: 0 });
  assert.equal(voices.selectedPattern.id, "quiet");
  assert.equal(voices.gain.gain.value, 0, "resume cannot replay the engine warning that cleared muted");

  updateWarningVoices(voices, context, {
    engine_running: true,
    gear_warning_horn: true,
    pilot_conscious: false,
  }, { enabled: true, nowSeconds: 0 });
  assert.equal(voices.selectedPattern.id, "gear-warning");
  assert.equal(voices.gain.gain.value, 0, "the existing unconscious silence contract remains intact");
});

test("engine loss arms from a running edge while cold and deliberate restart remain quiet", () => {
  const context = new Context();
  const voices = createWarningVoices(context, new Node("warning-bus"));

  updateWarningVoices(voices, context, { engine_running: false }, { nowSeconds: 0 });
  assert.equal(voices.selectedPattern.id, "quiet", "cold baseline is quiet");

  updateWarningVoices(voices, context, { engine_running: true }, { nowSeconds: 0.1 });
  assert.equal(voices.selectedPattern.id, "quiet");
  updateWarningVoices(voices, context, { engine_running: false }, { nowSeconds: 0.2 });
  assert.equal(voices.selectedPattern.id, "engine-out", "running-to-stopped edge latches loss");

  updateWarningVoices(voices, context, { engine_running: true }, { nowSeconds: 0.3 });
  assert.equal(voices.selectedPattern.id, "quiet", "successful restart clears the loss latch");
  updateWarningVoices(voices, context, {
    engine_running: false,
    cobra_turnaround_active: true,
  }, { nowSeconds: 0.4 });
  assert.equal(voices.selectedPattern.id, "quiet", "turnaround shutdown disarms the aural");
});
