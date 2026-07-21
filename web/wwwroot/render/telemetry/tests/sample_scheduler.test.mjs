import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORITY_TICK_HZ,
  DEFAULT_TELEMETRY_TICK_STRIDE,
  TELEMETRY_SAMPLE_SCHEDULE,
  TELEMETRY_SAMPLE_TARGET_HZ,
  TelemetrySampleScheduler,
} from "../sample_scheduler.js";

function state(tick, overrides = {}) {
  return {
    tick,
    t: tick / AUTHORITY_TICK_HZ,
    session_phase: "ACTIVE",
    finished: false,
    player_terminal_state: "FLYING",
    player_impact_surface: "NONE",
    sortie_outcome: "NONE",
    auto_gcas_phase: "ARMED",
    auto_gcas_active: false,
    auto_gcas_warning: false,
    auto_gcas_inhibit_reason: "NONE",
    auto_gcas_cue: "",
    auto_gcas_override_held: false,
    auto_gcas_prediction_valid: true,
    auto_gcas_used_fallback_terrain: false,
    auto_gcas_activation_count: 0,
    auto_gcas_release_count: 0,
    auto_gcas_override_count: 0,
    recent_events: [],
    ...overrides,
  };
}

test("elapsed authority scheduling cannot starve on a non-zero tick residue", () => {
  const scheduler = new TelemetrySampleScheduler();
  const decisions = [1, 7, 13, 19].map((tick) => scheduler.observe(state(tick)));

  assert.equal(DEFAULT_TELEMETRY_TICK_STRIDE, 6);
  assert.equal(AUTHORITY_TICK_HZ, 120);
  assert.equal(TELEMETRY_SAMPLE_TARGET_HZ, 20);
  assert.equal(TELEMETRY_SAMPLE_SCHEDULE, "elapsed-authority-ticks-v1");
  assert.deepEqual(decisions.map(({ record }) => record), [true, true, true, true]);
  assert.deepEqual(decisions.map(({ authorityTickDelta }) => authorityTickDelta),
    [null, 6, 6, 6]);
});

test("duplicate/intermediate renders are suppressed and a delayed browser exposes its tick gap", () => {
  const scheduler = new TelemetrySampleScheduler();

  assert.equal(scheduler.observe(state(10)).record, true);
  assert.equal(scheduler.observe(state(10)).record, false);
  assert.equal(scheduler.observe(state(13)).record, false);
  const delayed = scheduler.observe(state(31));

  assert.equal(delayed.record, true);
  assert.equal(delayed.authorityTickDelta, 21);
  assert.deepEqual(delayed.reasons, ["cadence"]);
});

test("Auto-GCAS mode/counter/cue edges force keyframes even on the same authority tick", () => {
  const scheduler = new TelemetrySampleScheduler();
  scheduler.observe(state(100));

  const activation = scheduler.observe(state(100, {
    auto_gcas_phase: "FLY_UP",
    auto_gcas_active: true,
    auto_gcas_cue: "AUTO GCAS · FLYUP",
    auto_gcas_activation_count: 1,
  }));
  assert.equal(activation.record, true);
  assert.equal(activation.forceKeyframe, true);
  assert.equal(activation.protectionChanged, true);
  assert.equal(activation.authorityTickDelta, 0);
  assert.ok(activation.reasons.includes("protection"));

  const numericalOnly = scheduler.observe(state(101, {
    auto_gcas_phase: "FLY_UP",
    auto_gcas_active: true,
    auto_gcas_cue: "AUTO GCAS · FLYUP",
    auto_gcas_activation_count: 1,
    auto_gcas_current_clearance_m: 41.25,
    auto_gcas_recovery_minimum_clearance_m: 18.5,
  }));
  assert.equal(numericalOnly.record, false,
    "continuous prediction values stay on the ordinary 20 Hz trace");
});

test("terminal and lifecycle edges cannot be discarded as same-tick duplicates", () => {
  const scheduler = new TelemetrySampleScheduler();
  scheduler.observe(state(200));

  const terminal = scheduler.observe(state(200, {
    session_phase: "FINISHED",
    finished: true,
    player_terminal_state: "IMPACTED",
    player_impact_surface: "GROUND",
    sortie_outcome: "DEFEAT",
  }));

  assert.equal(terminal.record, true);
  assert.equal(terminal.forceKeyframe, true);
  assert.equal(terminal.lifecycleChanged, true);
  assert.equal(terminal.terminalChanged, true);
  assert.equal(terminal.finishedEdge, true);
  assert.equal(terminal.authorityTickDelta, 0);
});

test("authoritative events and tick resets force independently decodable evidence", () => {
  const scheduler = new TelemetrySampleScheduler();
  scheduler.observe(state(300));

  const firstEvent = scheduler.observe(state(301, {
    recent_events: [{ sequence: 1, tick: 301, type: "AUTO_GCAS_FLY_UP" }],
  }));
  assert.equal(firstEvent.record, true);
  assert.equal(firstEvent.recentEventChanged, true);
  assert.equal(firstEvent.forceKeyframe, true);

  const reset = scheduler.observe(state(0));
  assert.equal(reset.record, true);
  assert.equal(reset.tickReset, true);
  assert.equal(reset.authorityTickDelta, null);
  assert.equal(reset.forceKeyframe, true);
});
