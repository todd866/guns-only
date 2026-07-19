import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  airdataReadout,
  fuelReadout,
  speedTapeMarkers,
  stallAwareness,
  systemsReadout,
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
    amberTopKias: 197.33 * 1.15,
    unit: "KIAS",
  });
  assert.deepEqual(markers, [{ value: 314.79, label: "COR", unit: "KIAS" }]);
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

test("production HUD consumes the pure KIAS, corner, and fuel readouts", async () => {
  const source = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  assert.match(source, /airdataReadout\(frame\.state\)/);
  assert.match(source, /lowSpeed:\s*stallAwareness\(frame\.state\)/);
  assert.match(source, /fixedMarkers:\s*speedTapeMarkers\(frame\.state\)/);
  assert.match(source, /fuelReadout\(state\)/);
  assert.match(source, /systemsReadout\(frame\.state\)/);
});
