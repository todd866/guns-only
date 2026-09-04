import test from "node:test";
import assert from "node:assert/strict";
import {
  compactOkanaganCue,
  okanaganFlightState,
  okanaganRadioCaption,
  okanaganRadioHoldMs,
} from "../okanagan_hud_adapter.js";

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
    scoop_valid: true,
    scoop_rate_kgps: 117.5,
    water_released_this_tick_kg: 18,
    water_release_rate_kgps: 1_450,
    fuel_plan: { block_kg: 925, minimum_rtb_kg: 310, joker_kg: 365 },
  });

  assert.equal(state.player_aircraft_id, "aircraft.at-802f-fireboss");
  assert.equal(state.audio_profile_id, "audio.fireboss.pt6a-67f.v1");
  assert.equal(state.opponent_alive, false);
  assert.equal(state.suppress_systems_panel, true);
  assert.equal(state.pz, -20);
  assert.equal(state.vz, -40);
  assert.equal(state.heading_deg, 90);
  assert.equal(state.calibrated_airspeed_kts, undefined);
  assert.equal(state.indicated_airspeed_kts, undefined);
  assert.ok(state.true_airspeed_kts > 79 && state.true_airspeed_kts < 80);
  assert.equal(state.mach, null);
  assert.equal(state.fireboss_cue, "");
  assert.equal(state.engine, 0.66);
  assert.equal(state.engine_spool_fraction, 0.66);
  assert.ok(state.engine_rpm_pct > 84 && state.engine_rpm_pct < 85);
  assert.equal(state.propeller_rpm, 1_700);
  assert.equal(state.propeller_blade_count, 5);
  assert.equal(state.engine_torque_fraction, 0.66);
  assert.ok(state.engine_ng_pct > 84 && state.engine_ng_pct < 85);
  assert.ok(state.stall_speed_kcas > 60);
  assert.equal(state.fireboss_scoop_rate_kgps, 117.5);
  assert.equal(state.scoop_fault, "");
  assert.equal(state.fireboss_water_release_kg, 18);
  assert.equal(state.fireboss_water_release_rate_kgps, 1_450);
  assert.equal(state.fireboss_drop_active, true);
});

test("Fire Boss joker is the advisory above bingo, not a second name for the floor", () => {
  const working = okanaganFlightState({
    fuel_kg: 500,
    throttle: 0.5,
    fuel_plan: { minimum_rtb_kg: 310, joker_kg: 365 },
  });
  const kgToLb = 2.20462262185;
  assert.ok(working.fuel_joker_lb > working.fuel_bingo_lb);
  assert.equal(Math.round(working.fuel_bingo_lb), Math.round(310 * kgToLb));
  assert.equal(Math.round(working.fuel_joker_lb), Math.round(365 * kgToLb));
  assert.equal(working.fuel_joker, false);
  assert.equal(working.fuel_bingo, false);
  assert.ok(working.fuel_minutes_to_joker > 0);
  assert.ok(working.fuel_minutes_to_bingo > working.fuel_minutes_to_joker);

  const atJoker = okanaganFlightState({
    fuel_kg: 360,
    fuel_plan: { minimum_rtb_kg: 310, joker_kg: 365 },
  });
  assert.equal(atJoker.fuel_joker, true);
  assert.equal(atJoker.fuel_bingo, false);

  const atBingo = okanaganFlightState({
    fuel_kg: 300,
    fuel_plan: { minimum_rtb_kg: 310, joker_kg: 365 },
  });
  assert.equal(atBingo.fuel_bingo, true);
  assert.equal(atBingo.fuel_joker, true);
});

test("Fire Boss still separates joker from bingo when the snapshot omits joker_kg", () => {
  const state = okanaganFlightState({
    fuel_kg: 500,
    fuel_plan: { minimum_rtb_kg: 310 },
  });
  assert.ok(state.fuel_joker_lb > state.fuel_bingo_lb);
});

test("drop audio truth ignores an unproductive drop command", () => {
  const state = okanaganFlightState({
    drop_active: true,
    water_released_this_tick_kg: 0,
    water_release_rate_kgps: 0,
  });
  assert.equal(state.fireboss_water_release_kg, 0);
  assert.equal(state.fireboss_water_release_rate_kgps, 0);
  assert.equal(state.fireboss_drop_active, false);
});

test("legacy tick-mass evidence remains distinguishable from an explicit zero rate", () => {
  const legacy = okanaganFlightState({ water_released_this_tick_kg: 4 });
  const stopped = okanaganFlightState({
    water_released_this_tick_kg: 4,
    water_release_rate_kgps: 0,
  });
  assert.equal(legacy.fireboss_water_release_rate_kgps, undefined);
  assert.equal(legacy.fireboss_drop_active, true);
  assert.equal(stopped.fireboss_water_release_rate_kgps, 0);
  assert.equal(stopped.fireboss_drop_active, false);
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
  assert.equal(okanaganFlightState({ cue: "FLY DEPART 16" }).fireboss_cue, "FLY DEPART 16");
});

test("instructor radio does not occupy the outside view; agency calls still do", () => {
  assert.equal(okanaganRadioCaption("INSTRUCTOR: Runway heading. Turn west."), "");
  assert.equal(okanaganRadioCaption("AIR ATTACK: Boss 21, hold west. Traffic below."),
    "AIR ATTACK: Boss 21, hold west. Traffic below.");
  assert.equal(okanaganRadioCaption("TOWER: Boss 21, cleared to land 16."),
    "TOWER: Boss 21, cleared to land 16.");
  assert.equal(okanaganRadioCaption(""), "");
});

test("transient radio dwell scales with terse copy and clears the outside view promptly", () => {
  assert.equal(okanaganRadioHoldMs(""), 0);
  assert.equal(okanaganRadioHoldMs("OPS: Return Kelowna."), 2_620);
  assert.equal(okanaganRadioHoldMs(
    "AIR ATTACK: Boss 21, west flank, north to south."), 4_060);
  assert.equal(okanaganRadioHoldMs(Array(30).fill("word").join(" ")), 4_200);
});
