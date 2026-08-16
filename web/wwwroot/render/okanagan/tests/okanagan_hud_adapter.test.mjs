import test from "node:test";
import assert from "node:assert/strict";
import { compactOkanaganCue, okanaganFlightState } from "../okanagan_hud_adapter.js";

test("Fire Boss projects into the shared fixed-wing HUD and audio contract", () => {
  const state = okanaganFlightState({
    position: { x: 10, y: 500, z: 20 },
    velocity: { x: 3, y: 2, z: 40 },
    tas_mps: 41,
    vertical_speed_mps: 2,
    heading_rad: Math.PI / 2,
    pitch_rad: 0.1,
    roll_rad: -0.2,
    throttle: 0.72,
    engine_power_fraction: 0.66,
    fuel_kg: 500,
    gross_mass_kg: 7_000,
    water_kg: 2_100,
    water_capacity_kg: 3_104,
    water_released_this_tick_kg: 18,
    fuel_plan: { block_kg: 925, minimum_rtb_kg: 310 },
  });

  assert.equal(state.player_aircraft_id, "aircraft.at-802f-fireboss");
  assert.equal(state.audio_profile_id, "audio.fireboss.pt6a-67f.v1");
  assert.equal(state.opponent_alive, false);
  assert.equal(state.suppress_systems_panel, true);
  assert.equal(state.pz, -20);
  assert.equal(state.vz, -40);
  assert.equal(state.heading_deg, 90);
  assert.ok(state.calibrated_airspeed_kts > 79 && state.calibrated_airspeed_kts < 80);
  assert.equal(state.engine, 0.66);
  assert.equal(state.engine_spool_fraction, 0.66);
  assert.ok(state.engine_rpm_pct > 84 && state.engine_rpm_pct < 85);
  assert.equal(state.propeller_rpm, 1_700);
  assert.equal(state.propeller_blade_count, 5);
  assert.equal(state.engine_torque_fraction, 0.66);
  assert.ok(state.engine_ng_pct > 84 && state.engine_ng_pct < 85);
  assert.ok(state.stall_speed_kcas > 60);
  assert.equal(state.fireboss_water_release_kg, 18);
  assert.equal(state.fireboss_drop_active, true);
});

test("drop audio truth ignores an unproductive drop command", () => {
  const state = okanaganFlightState({ drop_active: true, water_released_this_tick_kg: 0 });
  assert.equal(state.fireboss_water_release_kg, 0);
  assert.equal(state.fireboss_drop_active, false);
});

test("the governed propeller remains live at flight idle and stops after destruction", () => {
  const idle = okanaganFlightState({
    fuel_kg: 500,
    throttle: 0,
    engine_power_fraction: 0,
  });
  const running = okanaganFlightState({
    fuel_kg: 500,
    throttle: 0.65,
    engine_power_fraction: 0.65,
  });
  const stopped = okanaganFlightState({
    fuel_kg: 500,
    throttle: 0,
    engine_power_fraction: 0,
    surface: "destroyed",
  });
  assert.equal(idle.engine_running, true);
  assert.equal(idle.propeller_rpm, 1_700);
  assert.equal(idle.engine_ng_pct, 61);
  assert.equal(idle.engine_torque_fraction, 0);
  assert.equal(running.propeller_rpm, 1_700);
  assert.equal(stopped.engine_running, false);
  assert.equal(stopped.propeller_rpm, 0);
});

test("the one-line cue prefers an actionable scoop fault", () => {
  assert.equal(compactOkanaganCue({ cue: "SCOOP", scoop_fault: "WINGS LEVEL" }), "WINGS LEVEL");
  assert.equal(compactOkanaganCue({ cue: "TURN WEST" }), "TURN WEST");
  assert.equal(compactOkanaganCue({ route: [{ label: "LAKE ENTRY" }], active_gate: 0 }), "LAKE ENTRY");
});
