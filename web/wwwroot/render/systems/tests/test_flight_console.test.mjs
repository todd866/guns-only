import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPilotActionController,
  projectTestFlightState,
  testFlightConsoleRelevant,
  TEST_FLIGHT_ACTIONS,
} from "../test_flight_console.js";

test("projects the independent test-flight indications without exposing fault truth", () => {
  const projected = projectTestFlightState({
    engine_rpm_pct: 72.6,
    engine_running: true,
    primary_bus_powered: false,
    utility_hydraulic_pressure_psi: 2876.4,
    gear_handle: "DOWN",
    gear_nose_indication: "DOWN_LOCKED",
    gear_left_indication: "STRIPED",
    gear_right_indication: "UP_LOCKED",
    gear_nose: 1,
    gear_left: 0.47,
    gear_right: 0,
    flap_lever: "HOLD",
    flap_left_deg: 26.3,
    flap_right_deg: 13.9,
    flap_split: true,
    active_failures: ["LeftFlapMotor", "PrimaryBus"],
  });

  assert.deepEqual(projected.engine, {
    rpmText: "73%",
    runningText: "RUNNING",
    state: "nominal",
  });
  assert.equal(projected.electrical.primaryBusText, "OFF");
  assert.equal(projected.hydraulic.pressureText, "2876 PSI");
  assert.equal(projected.gear.handleText, "DOWN");
  assert.deepEqual([
    projected.gear.nose.text,
    projected.gear.left.text,
    projected.gear.right.text,
  ], ["DOWN", "STRIPE", "UP"]);
  assert.deepEqual([
    projected.flaps.leverText,
    projected.flaps.leftText,
    projected.flaps.rightText,
  ], ["HOLD", "26°", "14°"]);
  assert.deepEqual(projected.warnings.map((warning) => warning.text), [
    "PRIMARY BUS OFF",
    "FLAP SPLIT",
  ]);
  assert.doesNotMatch(JSON.stringify(projected), /LeftFlapMotor|active_failures|PrimaryBus\"/);
});

test("formats engine, gear, flap and overspeed warnings from observable telemetry", () => {
  const projected = projectTestFlightState({
    engine_rpm_pct: 0,
    engine_running: false,
    gear_unsafe: true,
    gear_warning_horn: true,
    gear_limit_exceeded: true,
    flap_limit_exceeded: true,
  });

  assert.equal(projected.engine.rpmText, "0%");
  assert.equal(projected.engine.runningText, "OUT");
  assert.deepEqual(projected.warnings.map((warning) => warning.text), [
    "ENGINE OUT",
    "GEAR HORN",
    "GEAR OVERSPEED",
    "FLAP OVERSPEED",
  ]);
  assert.equal(projected.warningLevel, "warning");
});

test("hydraulic truth drives warning state and panel relevance", () => {
  const failed = projectTestFlightState({
    utility_hydraulic_pressure_psi: 0,
    utility_hydraulic_nominal_psi: 3000,
  });
  assert.equal(failed.hydraulic.state, "warning");
  assert.match(failed.warningText, /UTILITY HYD LOW/);
  assert.equal(testFlightConsoleRelevant(failed), true);

  const normal = projectTestFlightState({
    engine_running: true,
    primary_bus_powered: true,
    utility_hydraulic_pressure_psi: 3000,
    utility_hydraulic_nominal_psi: 3000,
    gear_unsafe: false,
    flap_lever: "HOLD",
  });
  assert.equal(normal.hydraulic.state, "nominal");
  assert.equal(testFlightConsoleRelevant(normal), false);
});

test("engine-less vehicles do not manufacture Sabre system failures", () => {
  const projected = projectTestFlightState({
    has_engine: false,
    has_electrical_system: false,
    has_utility_hydraulics: false,
    has_retractable_gear: false,
    has_flaps: false,
    engine_running: false,
    primary_bus_powered: false,
    utility_hydraulic_pressure_psi: 0,
    utility_hydraulic_nominal_psi: 3000,
    gear_unsafe: true,
    gear_warning_horn: true,
    flap_limit_exceeded: true,
  });
  assert.equal(projected.engine.state, "unavailable");
  assert.equal(projected.hydraulic.state, "unavailable");
  assert.deepEqual(projected.warnings, []);
  assert.equal(testFlightConsoleRelevant(projected), false);
});

test("maintenance and configuration transitions surface the console only while actionable", () => {
  assert.equal(testFlightConsoleRelevant(projectTestFlightState({
    maintenance_scenario: true,
  })), true);
  assert.equal(testFlightConsoleRelevant(projectTestFlightState({
    flap_lever: "DOWN",
  })), true);
  assert.equal(testFlightConsoleRelevant(projectTestFlightState({
    gear_unsafe: true,
  })), true);
});

test("post-launch cleanup is actionable but normal landing configuration is not test-console clutter", () => {
  const dirty = projectTestFlightState({
    mode: "FREE",
    gear_handle: "DOWN",
    gear_nose_indication: "DOWN_LOCKED",
    gear_left_indication: "DOWN_LOCKED",
    gear_right_indication: "DOWN_LOCKED",
    flap_lever: "HOLD",
    flap_left_deg: 38,
    flap_right_deg: 38,
    primary_bus_powered: true,
  });
  assert.deepEqual(dirty.configuration, {
    actionable: true,
    gearNeedsCleanup: true,
    flapNeedsCleanup: true,
    target: "--",
    automatic: false,
    transition: false,
    automaticGear: false,
    automaticFlaps: false,
  });
  assert.deepEqual(dirty.warnings, [
    { text: "CLEAN UP GEAR", level: "caution" },
    { text: "CLEAN UP FLAPS", level: "caution" },
  ]);
  assert.equal(testFlightConsoleRelevant(dirty), true);

  const approach = projectTestFlightState({
    mode: "APPROACH",
    gear_handle: "DOWN",
    gear_nose_indication: "DOWN_LOCKED",
    gear_left_indication: "DOWN_LOCKED",
    gear_right_indication: "DOWN_LOCKED",
    flap_lever: "HOLD",
    flap_left_deg: 38,
    flap_right_deg: 38,
  });
  assert.deepEqual(approach.configuration, {
    actionable: false,
    gearNeedsCleanup: true,
    flapNeedsCleanup: true,
    target: "--",
    automatic: false,
    transition: false,
    automaticGear: false,
    automaticFlaps: false,
  });
  assert.deepEqual(approach.warnings, []);
  assert.equal(testFlightConsoleRelevant(approach), false);

  const automaticCleanup = projectTestFlightState({
    mode: "FREE",
    configuration_target: "COMBAT",
    configuration_automatic: true,
    configuration_transition: true,
    configuration_gear_auto: true,
    configuration_flap_auto: true,
    gear_handle: "UP",
    gear_nose_indication: "UNSAFE",
    gear_left_indication: "UNSAFE",
    gear_right_indication: "UNSAFE",
    gear_unsafe: true,
    flap_lever: "UP",
    flap_left_deg: 30,
    flap_right_deg: 30,
  });
  assert.equal(automaticCleanup.configuration.actionable, false);
  assert.deepEqual(automaticCleanup.warnings, []);
  assert.equal(testFlightConsoleRelevant(automaticCleanup), false,
    "routine automation belongs in the compact flight scan, not the test-flight console");
});

test("unknown or non-finite state remains explicitly unavailable", () => {
  const projected = projectTestFlightState({
    engine_rpm_pct: Number.NaN,
    utility_hydraulic_pressure_psi: Number.POSITIVE_INFINITY,
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
  });

  assert.equal(projected.engine.rpmText, "--");
  assert.equal(projected.hydraulic.pressureText, "--");
  assert.deepEqual([
    projected.gear.nose.text,
    projected.gear.left.text,
    projected.gear.right.text,
  ], ["--", "--", "--"]);
  assert.equal(projected.warningText, "INDICATIONS NORMAL");
});

test("action contract maps every control to the required GKey", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(TEST_FLIGHT_ACTIONS)
    .map(([id, definition]) => [id, definition.gkey])), {
    gearToggle: 13,
    flapUp: 14,
    flapDown: 15,
    emergencyGearRelease: 16,
    gearHornCutout: 17,
    confirmGearFailure: 18,
    inspectGearDownlocks: 19,
  });
  assert.equal(TEST_FLIGHT_ACTIONS.emergencyGearRelease.behavior, "hold");
  assert.equal(TEST_FLIGHT_ACTIONS.emergencyGearRelease.code, "KeyE");
  assert.equal(TEST_FLIGHT_ACTIONS.gearHornCutout.behavior, "momentary");
  assert.equal(TEST_FLIGHT_ACTIONS.confirmGearFailure.behavior, "momentary");
  assert.equal(TEST_FLIGHT_ACTIONS.confirmGearFailure.code, "KeyN");
  assert.equal(TEST_FLIGHT_ACTIONS.inspectGearDownlocks.code, "KeyI");
});

test("projects compact maintenance guidance and score without projecting hidden fault identity", () => {
  const projected = projectTestFlightState({
    maintenance_scenario: true,
    maintenance_state: "VERIFY_DOWNLOCKS",
    maintenance_instruction: "Hold release; inspect all three downlocks",
    maintenance_score: 60,
    maintenance_max_score: 100,
    maintenance_procedure_complete: false,
    maintenance_recovered: false,
    maintenance_hidden_fault: "UtilityHydraulicPump",
  });

  assert.deepEqual(projected.maintenance, {
    active: true,
    instructionText: "HOLD RELEASE; INSPECT ALL THREE DOWNLOCKS",
    scoreText: "60/100",
    complete: false,
    recovered: false,
    state: "VERIFY_DOWNLOCKS",
  });
  assert.doesNotMatch(JSON.stringify(projected), /UtilityHydraulicPump|hidden_fault/);
});

test("action ownership is idempotent and does not release another pointer's hold", () => {
  const events = [];
  const changes = [];
  const controller = createPilotActionController({
    press: (code, owner, action) => events.push(["down", code, owner, action.gkey]),
    release: (code, owner, action) => events.push(["up", code, owner, action.gkey]),
    onChange: (change) => changes.push(change),
  });

  assert.equal(controller.begin("flapDown", "pointer:1"), true);
  assert.equal(controller.begin("flapDown", "pointer:1"), true);
  assert.equal(controller.begin("flapDown", "pointer:2"), true);
  assert.equal(controller.activeOwnerCount, 2);
  controller.releaseOwner("pointer:1");
  assert.equal(controller.isActive("flapDown"), true);
  controller.releaseOwner("pointer:2");
  assert.equal(controller.isActive("flapDown"), false);

  assert.deepEqual(events, [
    ["down", "BracketRight", "pointer:1", 15],
    ["down", "BracketRight", "pointer:2", 15],
    ["up", "BracketRight", "pointer:1", 15],
    ["up", "BracketRight", "pointer:2", 15],
  ]);
  assert.deepEqual(changes.map(({ active, owners }) => [active, owners]), [
    [true, 1], [true, 2], [true, 1], [false, 0],
  ]);
});

test("cancel-all safely releases emergency and flap holds", () => {
  const events = [];
  const controller = createPilotActionController({
    press: (code, owner) => events.push([code, true, owner]),
    release: (code, owner) => events.push([code, false, owner]),
  });

  controller.begin("emergencyGearRelease", "pointer:7");
  controller.begin("flapUp", "keyboard:flap-up");
  controller.releaseAll();
  controller.releaseAll();

  assert.deepEqual(events, [
    ["KeyE", true, "pointer:7"],
    ["BracketLeft", true, "keyboard:flap-up"],
    ["KeyE", false, "pointer:7"],
    ["BracketLeft", false, "keyboard:flap-up"],
  ]);
  assert.equal(controller.activeOwnerCount, 0);
});

test("a refused press is never retained as a held action", () => {
  const releases = [];
  const controller = createPilotActionController({
    press: () => false,
    release: (...args) => releases.push(args),
  });

  assert.equal(controller.begin("gearToggle", "assistive:1"), false);
  assert.equal(controller.activeOwnerCount, 0);
  controller.releaseAll();
  assert.deepEqual(releases, []);
});

test("production shell installs, updates, and safely labels the test-flight console", async () => {
  const [appSource, indexSource] = await Promise.all([
    readFile(new URL("../../../app.js", import.meta.url), "utf8"),
    readFile(new URL("../../../index.html", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /installTestFlightConsole\(\)/);
  assert.match(appSource, /renderTestFlightConsole\(state\)/);
  assert.match(appSource, /testFlightActionController\.releaseAll\(\)/);
  assert.match(appSource, /document\.addEventListener\("visibilitychange"/);
  assert.match(indexSource, /id="test-flight-console" hidden data-relevance="none"/);
  assert.match(indexSource, /#test-flight-console\[hidden\] \{ display: none; \}/);
  assert.match(appSource, /testFlightConsole\.hidden = !relevant/);
  assert.match(appSource,
    /state\.ready !== true && state\.paused !== true && state\.finished !== true[\s\S]*?testFlightConsoleRelevant\(projected\)/);
  assert.doesNotMatch(indexSource, /<details id="test-flight-console" open>/,
    "test instrumentation must not cover the default flying view");
  assert.match(indexSource,
    /<summary role="button" aria-expanded="false" aria-label="Toggle test-flight action console">/);
  assert.match(indexSource, />TEST FLIGHT</);
  assert.match(indexSource, /data-test-action="emergencyGearRelease"/);
  assert.match(indexSource, /data-test-action="confirmGearFailure"/);
  assert.match(indexSource, /data-test-action="inspectGearDownlocks"/);
  assert.doesNotMatch(indexSource, /failure id|active_failures/i);
});
