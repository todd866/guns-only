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
    fuel_kg: 500,
    gross_mass_kg: 7_000,
    water_kg: 2_100,
    water_capacity_kg: 3_104,
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
  assert.ok(state.engine_rpm_pct > 88 && state.engine_rpm_pct < 89);
  assert.ok(state.stall_speed_kcas > 60);
});

test("the one-line cue prefers an actionable scoop fault", () => {
  assert.equal(compactOkanaganCue({ cue: "SCOOP", scoop_fault: "WINGS LEVEL" }), "WINGS LEVEL");
  assert.equal(compactOkanaganCue({ cue: "TURN WEST" }), "TURN WEST");
  assert.equal(compactOkanaganCue({ route: [{ label: "LAKE ENTRY" }], active_gate: 0 }), "LAKE ENTRY");
});
