import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  airdataReadout,
  fuelReadout,
  speedTapeMarkers,
  stallAwareness,
  systemsReadout,
  targetClosureReadout,
  visualMergeWeaponsCue,
} from "../hud_readouts.js";

test("airdata makes indicated airspeed primary and formats one universal groundspeed", () => {
  const readout = airdataReadout({
    indicated_airspeed_kts: 197.08,
    speed_kts: 999,
    true_airspeed_kts: 219.0,
    ground_speed_kts: 214.4,
  });

  assert.equal(readout.indicatedKts, 197.08);
  assert.equal(readout.primaryText, "197");
  assert.equal(readout.unitText, "A/S KIAS");
  assert.equal(readout.groundText, "G/S 214");
  assert.equal(readout.trueKts, 219.0);
});

test("legacy speed alias remains an indicated-airdata fallback", () => {
  assert.equal(airdataReadout({ speed_kts: 181 }).indicatedKts, 181);
  assert.equal(airdataReadout({ speed_kts: 181 }).groundText, "G/S ---");
});

test("stall awareness and corner marker stay entirely in KIAS", () => {
  const awareness = stallAwareness({
    stall_speed_kias: 119.0,
    accelerated_stall_speed_kias: 197.33,
  });
  const markers = speedTapeMarkers({ corner_speed_kias: 314.79 });

  assert.deepEqual(awareness, {
    baseKias: 119.0,
    boundaryKias: 197.33,
    amberTopKias: null,
    unit: "KIAS",
  });
  assert.deepEqual(markers, [{ value: 314.79, label: "COR", unit: "KIAS" }]);
  assert.deepEqual(speedTapeMarkers({
    corner_speed_kias: 314.79,
    carrier: true,
    mode: "APPROACH",
  }), []);
});

test("target closure is explicit about whether range is closing or opening", () => {
  assert.deepEqual(targetClosureReadout(42.4), {
    closureKts: 42.4,
    trend: "closing",
    compactText: "42KT CLOSING",
    text: "42 KT CLOSING",
  });
  assert.equal(targetClosureReadout(-18.6).text, "19 KT OPENING");
  assert.equal(targetClosureReadout(0.2).text, "RANGE STEADY");
  assert.equal(targetClosureReadout(undefined).text, "CLOSURE -- KT");
});

test("visual merge weapon safety stays visible only while it changes a pilot decision", () => {
  const base = { visual_merge_evaluation: true };
  assert.deepEqual(visualMergeWeaponsCue({ ...base, weapons_inhibited: true }), {
    text: "GUNS SAFE · FIRST PASS",
    level: "caution",
  });
  assert.deepEqual(visualMergeWeaponsCue({
    ...base,
    player_trigger_interlocked: true,
  }), {
    text: "RELEASE TRIGGER TO ARM",
    level: "warning",
  });
  assert.deepEqual(visualMergeWeaponsCue({ ...base, weapons_hot_cue: true }), {
    text: "GUNS HOT",
    level: "normal",
  });
  assert.equal(visualMergeWeaponsCue(base), null,
    "an armed steady-state fight must return the HUD space");
  assert.equal(visualMergeWeaponsCue({
    ...base,
    weapons_inhibited: true,
    terminal_phase_active: true,
  }), null);
});

test("powered fuel readout uses pounds per minute and time to bingo", () => {
  const readout = fuelReadout({
    fuel_lb: 2825,
    fuel_capacity_lb: 2826,
    fuel_bingo_lb: 800,
    fuel_flow_lb_min: 105.47,
    fuel_burn_lb_min: 42,
    fuel_minutes_to_bingo: 24.2,
    fuel_consumes: true,
    fuel_bingo: false,
  });

  assert.equal(readout.flowLbPerMinute, 105.47);
  assert.equal(readout.flowText, "FF 105");
  assert.equal(readout.flowUnitText, "LB/MIN");
  assert.equal(readout.decisionText, "BGO 24M");
  assert.equal(readout.padlockText, "2825LB · FF 105 LB/MIN · BGO 24M");
});

test("legacy per-minute burn is the only temporary fuel-flow fallback", () => {
  assert.equal(fuelReadout({
    fuel_lb: 2000,
    fuel_burn_lb_min: 44.6,
  }).flowText, "FF 45");
  assert.equal(fuelReadout({ fuel_lb: 2000 }).flowText, "FF 0");
});

test("bingo switches the decision to endurance and preserves unavailable values", () => {
  assert.equal(fuelReadout({
    fuel_lb: 790,
    fuel_bingo_lb: 800,
    fuel_flow_lb_min: 87,
    fuel_endurance_minutes: 9.2,
    fuel_bingo: true,
  }).decisionText, "END 9M");

  assert.equal(fuelReadout({
    fuel_lb: 1200,
    fuel_flow_lb_min: 0,
    fuel_minutes_to_bingo: null,
  }).decisionText, "BGO --");
});

test("engine-less loadout reports unpowered instead of inventing endurance", () => {
  const readout = fuelReadout({ fuel_lb: 0, fuel_consumes: false });
  assert.equal(readout.flowText, "UNPOWERED");
  assert.equal(readout.flowUnitText, "");
  assert.equal(readout.decisionText, "END --");
  assert.equal(readout.padlockText, "0LB · UNPOWERED");
});

test("systems readout preserves command, three independent gear indications, and flap asymmetry", () => {
  const readout = systemsReadout({
    gear_handle: "DOWN",
    gear_nose: 1,
    gear_left: 0.45,
    gear_right: 1,
    gear_left_indication: "striped transit/unsafe",
    gear_unsafe: true,
    flap_lever: "HOLD",
    flap_left_deg: 24.6,
    flap_right_deg: 18.1,
    primary_bus_powered: true,
    utility_hydraulic_pressure_psi: 2912,
    engine_rpm_pct: 73.4,
    engine_running: true,
  });

  assert.equal(readout.available, true);
  assert.equal(readout.gearHandle, "DOWN");
  assert.equal(readout.gear.nose.text, "DN");
  assert.equal(readout.gear.left.text, "TR");
  assert.equal(readout.gear.right.text, "DN");
  assert.equal(readout.flapLever, "HOLD");
  assert.equal(readout.flapPositionText, "25°/18°");
  assert.equal(readout.flapSplit, true);
  assert.deepEqual(readout.warnings.map((warning) => warning.text), ["GEAR UNSAFE", "FLAP SPLIT"]);
});

test("unpowered striped gear indications remain unknown without inventing physical transit", () => {
  const readout = systemsReadout({
    gear_handle: "DOWN",
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    gear_nose_indication: "STRIPED",
    gear_left_indication: "STRIPED",
    gear_right_indication: "STRIPED",
    gear_unsafe: false,
    primary_bus_powered: false,
  });

  assert.deepEqual(readout.gear, {
    nose: { text: "STRIPE", state: "unknown", position: 1 },
    left: { text: "STRIPE", state: "unknown", position: 1 },
    right: { text: "STRIPE", state: "unknown", position: 1 },
  });
  assert.equal(readout.gearUnsafe, false);
  assert.deepEqual(readout.warnings, [{ text: "PRIMARY BUS", level: "caution" }]);
});

test("powered striped indication with physical travel remains genuine transit", () => {
  const readout = systemsReadout({
    gear_handle: "DOWN",
    gear_nose: 0.45,
    gear_left: 0,
    gear_right: 0,
    gear_nose_indication: "STRIPED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: false,
    primary_bus_powered: true,
  });

  assert.deepEqual(readout.gear.nose, { text: "TR", state: "transit", position: 0.45 });
  assert.equal(readout.gearUnsafe, true);
  assert.deepEqual(readout.warnings, [{ text: "GEAR UNSAFE", level: "caution" }]);
});

test("explicit unsafe state remains authoritative without a transit indication", () => {
  const readout = systemsReadout({
    gear_handle: "UP",
    gear_nose: 0,
    gear_left: 0,
    gear_right: 0,
    gear_nose_indication: "UP_LOCKED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: true,
    primary_bus_powered: true,
  });

  assert.equal(readout.gear.nose.state, "up");
  assert.equal(readout.gearUnsafe, true);
  assert.deepEqual(readout.warnings, [{ text: "GEAR UNSAFE", level: "caution" }]);
});

test("systems readout surfaces procedural failure cues without inventing absent systems", () => {
  assert.equal(systemsReadout({}).available, false);
  const readout = systemsReadout({
    gear_warning_horn: true,
    gear_limit_exceeded: true,
    flap_limit_exceeded: true,
    primary_bus_powered: false,
    utility_hydraulic_pressure_psi: 0,
    engine_rpm_pct: 11.2,
    engine_running: false,
  });
  assert.deepEqual(readout.warnings, [
    { text: "ENGINE FLAMEOUT", level: "warning" },
    { text: "GEAR WARNING", level: "warning" },
    { text: "GEAR OVERSPEED", level: "warning" },
    { text: "FLAP OVERSPEED", level: "warning" },
    { text: "PRIMARY BUS", level: "caution" },
  ]);
});

test("normal systems stay latent while recovery, transitions, and failures surface them", () => {
  const normal = systemsReadout({
    has_engine: true,
    has_retractable_gear: true,
    has_flaps: true,
    has_electrical_system: true,
    has_utility_hydraulics: true,
    engine_running: true,
    gear_handle: "UP",
    gear_nose_indication: "UP_LOCKED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    primary_bus_powered: true,
    utility_hydraulic_pressure_psi: 3000,
    utility_hydraulic_nominal_psi: 3000,
  });
  assert.equal(normal.available, true);
  assert.equal(normal.relevant, false);

  assert.equal(systemsReadout({
    carrier: true,
    mode: "APPROACH",
    gear_handle: "DOWN",
  }).relevant, true);

  const hydraulicFailure = systemsReadout({
    utility_hydraulic_pressure_psi: 0,
    utility_hydraulic_nominal_psi: 3000,
  });
  assert.equal(hydraulicFailure.relevant, true);
  assert.deepEqual(hydraulicFailure.warnings,
    [{ text: "UTILITY HYD LOW", level: "warning" }]);
});

test("dirty free-flight configuration surfaces until physically clean without flagging approach config", () => {
  const dirty = systemsReadout({
    mode: "FREE",
    gear_handle: "DOWN",
    gear_nose_indication: "DOWN_LOCKED",
    gear_left_indication: "DOWN_LOCKED",
    gear_right_indication: "DOWN_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    flap_left_deg: 38,
    flap_right_deg: 38,
    primary_bus_powered: true,
  });
  assert.equal(dirty.configurationActionable, true);
  assert.equal(dirty.gearNeedsCleanup, true);
  assert.equal(dirty.flapNeedsCleanup, true);
  assert.equal(dirty.relevant, true);
  assert.deepEqual(dirty.warnings, [
    { text: "CLEAN UP GEAR", level: "caution" },
    { text: "CLEAN UP FLAPS", level: "caution" },
  ]);

  const approach = systemsReadout({
    carrier: true,
    mode: "APPROACH",
    gear_handle: "DOWN",
    gear_nose_indication: "DOWN_LOCKED",
    gear_left_indication: "DOWN_LOCKED",
    gear_right_indication: "DOWN_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    flap_left_deg: 38,
    flap_right_deg: 38,
  });
  assert.equal(approach.configurationActionable, false);
  assert.equal(approach.relevant, true,
    "landing configuration remains useful in the recovery scan");
  assert.deepEqual(approach.warnings, []);

  const recoveryTargetBeforeApproachLaw = systemsReadout({
    carrier: true,
    mode: "FREE",
    configuration_target: "RECOVERY",
    configuration_automatic: true,
    gear_handle: "DOWN",
    gear_nose_indication: "DOWN_LOCKED",
    gear_left_indication: "DOWN_LOCKED",
    gear_right_indication: "DOWN_LOCKED",
    flap_lever: "HOLD",
    flap_left_deg: 38,
    flap_right_deg: 38,
  });
  assert.equal(recoveryTargetBeforeApproachLaw.configurationActionable, false);
  assert.deepEqual(recoveryTargetBeforeApproachLaw.warnings, [],
    "recovery intent must prevent a false cleanup demand before the groove law engages");

  const clean = systemsReadout({
    mode: "FREE",
    gear_handle: "UP",
    gear_nose_indication: "UP_LOCKED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    flap_left_deg: 0,
    flap_right_deg: 0,
  });
  assert.equal(clean.configurationActionable, false);
  assert.equal(clean.relevant, false);

  const cleanWaveOff = systemsReadout({
    carrier: true,
    mode: "WAVE-OFF",
    gear_handle: "UP",
    gear_nose_indication: "UP_LOCKED",
    gear_left_indication: "UP_LOCKED",
    gear_right_indication: "UP_LOCKED",
    gear_unsafe: false,
    flap_lever: "HOLD",
    flap_left_deg: 0,
    flap_right_deg: 0,
  });
  assert.equal(cleanWaveOff.relevant, false,
    "a completed cleanup must remove the post-launch systems panel");
});

test("engine-less vehicles do not inherit fighter warnings or systems relevance", () => {
  const readout = systemsReadout({
    has_engine: false,
    has_retractable_gear: false,
    has_flaps: false,
    has_electrical_system: false,
    has_utility_hydraulics: false,
    engine_running: false,
    gear_unsafe: true,
    flap_limit_exceeded: true,
    primary_bus_powered: false,
    utility_hydraulic_pressure_psi: 0,
    utility_hydraulic_nominal_psi: 3000,
  });
  assert.equal(readout.available, false);
  assert.equal(readout.relevant, false);
  assert.deepEqual(readout.warnings, []);
});

test("production HUD consumes stabilized KIAS plus physical corner and fuel readouts", async () => {
  const source = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  assert.match(source, /this\._signals\.update\(frame\.state, frame\.dt\)/);
  assert.match(source, /const spd = display\.indicatedKts/);
  assert.match(source, /lowSpeed:\s*stallAwareness\(frame\.state\)/);
  assert.match(source, /fixedMarkers:\s*speedTapeMarkers\(frame\.state\)/);
  assert.doesNotMatch(source, /if \(!frame\.padlock\)\s*\{\s*const tapeInset/,
    "padlock must retain the physical IAS/stall/corner tape instead of a duplicate card");
  assert.match(source, /fuelReadout\(state\)/);
  assert.match(source, /systemsReadout\(frame\.state\)/);
  assert.match(source, /visualMergeWeaponsCue\(frame\.state\)/);
  assert.match(source, /this\.drawVisualMergeWeaponsCue\(frame\)/);
  assert.match(source, /state\.has_engine === false \|\| state\.fuel_consumes === false/);
  assert.match(source, /state\.engine_spool_fraction \?\? state\.engine/);
  assert.match(source, /Number\.isFinite\(sustained\) && sustained >= 1\.0/);
  assert.match(source, /state\.effective_on_speed_aoa_deg/);
  assert.match(source, /state\.on_speed_aoa_tolerance_deg/);
  assert.match(source, /case "COME LEFT": return "COME LEFT"/);
  assert.match(source, /case "COME RIGHT": return "COME RIGHT"/);
  assert.match(source, /case "TERMINAL":/);
  assert.match(source, /this\._speedEntityId !== speedEntityId/);
  assert.match(source, /1 - Math\.exp\(-dt \/ 0\.20\)/);
  assert.doesNotMatch(source, /Number\(state\.kill_progress\)/,
    "hit count is not a physical damage percentage");
  assert.doesNotMatch(source, /`AIRFRAME \$\{Math\.round\(health \* 100\)\}%`/,
    "abstract health must not masquerade as an airframe condition indication");
  assert.doesNotMatch(source, /this\.drawFrameWash\(\)/,
    "scanlines and vignette have no decision-support role");
});
