import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  circuitGatePresentation,
  rapierCycleTeachPresentation,
  rapierEnginePresentation,
  rapierFlightDirectorPresentation,
  rapierGuidancePresentation,
} from "../rapier_guidance.js";

const appUrl = new URL("../../../app.js", import.meta.url);

test("Rapier guidance is absent outside the scripted sortie", () => {
  assert.equal(rapierGuidancePresentation({}), null);
});

test("mission-computer loss removes automation and flight-director promises but keeps manual FBW", () => {
  const state = {
    rapier_mission_available: true,
    rapier_mission_computer_available: false,
    rapier_flight_control_computers_available: true,
    rapier_automation_enabled: false,
    rapier_automation_active: false,
    rapier_mission_phase: 6,
  };
  const cue = rapierGuidancePresentation(state);
  assert.match(cue.text, /MISSION COMPUTER LOST/);
  assert.match(cue.text, /FBW \+ RCS REMAIN/);
  assert.doesNotMatch(cue.text, /P TOGGLE AUTO/);
  assert.equal(cue.level, "attack");
  assert.equal(rapierFlightDirectorPresentation(state), null);
});

test("total flight-control-computer loss declares uncontrolled reentry", () => {
  const state = {
    rapier_mission_available: true,
    rapier_mission_computer_available: true,
    rapier_flight_control_computers_available: false,
    rapier_uncontrolled_reentry: true,
    rapier_automation_enabled: false,
    rapier_automation_active: false,
    rapier_mission_phase: 6,
  };
  const cue = rapierGuidancePresentation(state);
  assert.match(cue.text, /FLIGHT CONTROL COMPUTERS LOST/);
  assert.match(cue.text, /NO CONTROL PATH · UNCONTROLLED REENTRY/);
  assert.equal(cue.boxLabel, "FCS LOST");
  assert.equal(cue.level, "attack");
  assert.equal(rapierFlightDirectorPresentation(state), null);
});

test("Rapier guidance is a quiet mode line with authority and takeover", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 3,
    rapier_gun_drones_remaining: 4,
    rapier_stagnation_temp_c: 90,
    rapier_thermal_margin_c: 1110,
  });
  assert.match(cue.text, /AUTO · LEVEL ACCEL · M2\.20/);
  assert.match(cue.text, /SKIN 90°C/);
  assert.match(cue.text, /P TOGGLE AUTO/);
  assert.equal(cue.detail, "");
  assert.equal(cue.level, "active");
});

test("attack guidance exposes swarm release without owning the centre", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 10,
    rapier_gun_drones_remaining: 3,
    rapier_stagnation_temp_c: 400,
    rapier_thermal_margin_c: 800,
  });
  assert.match(cue.text, /ATTACK/);
  assert.match(cue.text, /F RELEASES SWARM · 3/);
  assert.match(cue.text, /SKIN 400°C/);
  assert.equal(cue.detail, "");
  assert.equal(cue.level, "attack");
});

test("manual takeover stays explicit without a triad essay", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: false,
    rapier_automation_active: false,
    rapier_mission_phase: 12,
    rtb_range_nm: 184.4,
    rtb_bearing_deg: 3.2,
    rtb_turn_deg: -27.6,
    true_airspeed_kts: 1180,
    rapier_stagnation_temp_c: 200,
    rapier_thermal_margin_c: 1000,
  });
  assert.match(cue.text, /PILOT · RETURN · HOME/);
  assert.match(cue.text, /SKIN 200°C/);
  assert.equal(cue.detail, "");
  assert.equal(cue.level, "manual");
});

test("egress is a short mode line, not a fuel paragraph", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 11,
    rtb_range_nm: 320,
    rtb_bearing_deg: 180,
    rtb_turn_deg: 172,
    true_airspeed_kts: 2300,
    rapier_stagnation_temp_c: 500,
    rapier_thermal_margin_c: 700,
  });
  assert.match(cue.text, /EGRESS · HOME/);
  assert.equal(cue.detail, "");
  assert.equal(cue.level, "attack");
});

test("skin over replaces the mode fragment and keeps the temperature", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: false,
    rapier_automation_active: false,
    rapier_mission_phase: 4,
    rapier_stagnation_temp_c: 1240,
    rapier_thermal_margin_c: -40,
  });
  assert.match(cue.text, /SKIN OVER 1240°C/);
  assert.equal(cue.level, "attack");
});

test("skin-clamped dash surfaces commanded Mach on the quiet line", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 9,
    rapier_commanded_mach: 3.14,
    rapier_authored_target_mach: 4.0,
    rapier_skin_mach_limit: 3.14,
    rapier_stagnation_temp_c: 320,
    rapier_thermal_margin_c: 0,
  });
  assert.match(cue.text, /CMD M3\.1/);
  assert.match(cue.text, /INTERCEPT/);
});

test("cycle teach explains turbine-to-ram handoff with live shares and skin", () => {
  const teach = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    mach: 1.88,
    rapier_turbine_thrust_kn: 23,
    rapier_ramjet_thrust_kn: 0,
    rapier_stagnation_temp_c: 90,
    rapier_thermal_margin_c: 1110,
  });
  assert.equal(teach.mode, "TURBINE");
  assert.match(teach.explainer, /Ram needs ~M2/);
  assert.match(teach.skinText, /SKIN 90°C/);
  assert.ok(teach.turbineShare > 0.9);
  assert.equal(teach.ramShare, 0);

  const handover = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    mach: 2.3,
    rapier_turbine_thrust_kn: 10,
    rapier_ramjet_thrust_kn: 40,
    rapier_stagnation_temp_c: 420,
    rapier_thermal_margin_c: 780,
  });
  assert.equal(handover.mode, "HANDOVER");
  assert.match(handover.explainer, /thrust bucket/i);
});

test("flight director exposes bank/altitude/speed bugs from snapshot targets", () => {
  const fd = rapierFlightDirectorPresentation({
    rapier_mission_available: true,
    rapier_fd_bank_deg: 20,
    bank_deg: 5,
    rapier_target_altitude_ft: 56000,
    alt_ft: 50000,
    rapier_fd_target_ktas: 450,
    true_airspeed_kts: 500,
  });
  assert.equal(fd.bankErrorDeg, 15);
  assert.equal(fd.altErrorFt, 6000);
  assert.equal(fd.speedCall, "SLOW");
  assert.equal(fd.targetKtas, 450);
});

test("RAM climb director predicts FL700 capture before a high-rate overshoot", () => {
  const fd = rapierFlightDirectorPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 4,
    rapier_target_altitude_ft: 70000,
    alt_ft: 69380,
    vertical_speed_fpm: 38971,
    rapier_fd_bank_deg: 0,
    bank_deg: 0,
  });
  assert.equal(fd.altitudeCall, "CAPTURE FL700 · UNLOAD");
  assert.ok(fd.timeToAltitudeS > 0.9 && fd.timeToAltitudeS < 1.0);
});

test("intercept director calls a continuing climb above FL700", () => {
  const fd = rapierFlightDirectorPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 9,
    rapier_target_altitude_ft: 70000,
    alt_ft: 71200,
    vertical_speed_fpm: 12000,
    rapier_fd_bank_deg: 0,
    bank_deg: 0,
  });
  assert.equal(fd.altitudeCall, "LEVEL NOW · DESCEND FL700");
  assert.equal(fd.timeToAltitudeS, null);
});

test("mission brief teaches the same M2.0/M2.8 handover as the director", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.match(app, /RAM LIGHT begins at M2\.0 and full ram arrives at M2\.8/);
  assert.doesNotMatch(app, /RAM LIGHT begins at M1\.6 and full ram arrives at M2\.2/);
});

test("zoom coast FD publishes nose-on-V call without speed bug", () => {
  const fd = rapierFlightDirectorPresentation({
    rapier_mission_available: true,
    rapier_zoom_lob: true,
    rapier_mission_phase: 6,
    rapier_nose_on_v_err_deg: 22,
    rapier_fd_bank_deg: 0,
    bank_deg: 0,
  });
  assert.equal(fd.noseCall, "ALIGN NOSE→V");
  assert.equal(fd.boxLabel, "NOSE→V");
  assert.equal(fd.noseOnVErrorDeg, 22);
});

test("coast mode line carries nose→V align cue", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_zoom_lob: true,
    rapier_automation_enabled: true,
    rapier_automation_active: false,
    rapier_mission_phase: 7,
    rapier_nose_on_v_err_deg: 18,
    rapier_stagnation_temp_c: 90,
    rapier_thermal_margin_c: 1110,
  });
  assert.match(cue.text, /NOSE→V 18/);
  assert.equal(cue.boxLabel, "NOSE→V");
});

test("Circuits mode line names the pattern leg without Intercept attack chrome", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_automation_enabled: true,
    rapier_automation_active: false,
    rapier_mission_phase: 13,
    rapier_circuit_leg: "SHORT_FINAL",
    rapier_gun_drones_remaining: 4,
    rapier_fd_target_ktas: 170,
    rapier_target_altitude_ft: 950,
    rapier_stagnation_temp_c: 90,
    rapier_thermal_margin_c: 1110,
  });
  assert.match(cue.text, /DIRECT · CIRCUITS · SHORT FINAL/);
  assert.match(cue.text, /HOOK DOWN · GEAR DOWN · FLAPS DOWN · 170 KT/);
  assert.match(cue.text, /LINE UP · CONFIGURED/);
  assert.doesNotMatch(cue.text, /SWARM|ATTACK|FL700|SKIN/);
  assert.equal(cue.boxLabel, "SHORT FINAL");
});

test("Circuits DEMO strips skin and publishes leg config", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 2,
    rapier_circuit_leg: "DEPART",
    rapier_fd_target_ktas: 250,
    rapier_target_altitude_ft: 2500,
    rapier_stagnation_temp_c: 90,
    rapier_thermal_margin_c: 1110,
  });
  assert.match(cue.text, /DEMO · CIRCUITS · DEPART/);
  assert.match(cue.text, /HOOK DOWN · GEAR UP · FLAPS UP · 250 KT · 2500 FT/);
  assert.doesNotMatch(cue.text, /SKIN|TBCC|RAM|AUTO ·/);
  assert.equal(cue.boxLabel, "DEPART");
});

test("Circuits MONITOR posture when automation is off", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_automation_enabled: false,
    rapier_automation_active: false,
    rapier_mission_phase: 13,
    rapier_circuit_leg: "DOWNWIND",
    rapier_fd_target_ktas: 250,
    rapier_target_altitude_ft: 2500,
    rapier_stagnation_temp_c: 120,
    rapier_thermal_margin_c: 1080,
  });
  assert.match(cue.text, /MONITOR · CIRCUITS · DOWNWIND/);
  assert.match(cue.text, /HOOK DOWN · GEAR DOWN · FLAPS DOWN/);
  assert.doesNotMatch(cue.text, /SKIN/);
});

test("Circuits wire final asks for the arrest", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 13,
    rapier_circuit_leg: "WIRE_FINAL",
    rapier_recovery_gate: 2,
    rapier_fd_target_ktas: 171,
    rapier_target_altitude_ft: 200,
    rapier_stagnation_temp_c: 90,
    rapier_thermal_margin_c: 1110,
  });
  assert.match(cue.text, /DEMO · CIRCUITS · WIRE FINAL/);
  assert.match(cue.text, /HOOK DOWN · GEAR DOWN · FLAPS DOWN/);
  assert.match(cue.text, /ACCEPT WIRE/);
  assert.doesNotMatch(cue.text, /SKIN/);
  assert.equal(cue.boxLabel, "WIRE FINAL");
});

test("circuit gate presents world half-size and energy/config status", () => {
  const open = circuitGatePresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_circuit_leg: "INITIAL",
    rapier_gate_half_m: 100,
    rapier_gate_face_x: 0,
    rapier_gate_face_y: 0,
    rapier_gate_face_z: 1,
    rapier_gate_in_volume: true,
    rapier_gate_energy_ok: true,
    rapier_fd_target_ktas: 250,
    gear_nose: 0,
    gear_left: 0,
    gear_right: 0,
    flap_left_deg: 0,
    flap_right_deg: 0,
  });
  assert.equal(open.halfM, 100);
  assert.equal(open.status, "GATE OPEN");
  assert.equal(open.accent, "open");
  assert.match(open.boxLabel, /INITIAL · GATE OPEN/);
  assert.match(open.configLine, /250 KT/);

  const energy = circuitGatePresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_circuit_leg: "DOWNWIND",
    rapier_gate_half_m: 100,
    rapier_gate_face_z: 1,
    rapier_gate_in_volume: true,
    rapier_gate_energy_ok: false,
    rapier_fd_target_ktas: 250,
    gear_nose: 1,
    gear_left: 1,
    gear_right: 1,
    flap_left_deg: 30,
    flap_right_deg: 30,
  });
  assert.equal(energy.status, "ENERGY");
  assert.equal(energy.accent, "fault");
});

test("cycle teach stays available for Intercept but Circuits HUD gates it off", () => {
  const intercept = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    rapier_pattern_only: false,
    mach: 1.88,
    rapier_turbine_thrust_kn: 23,
    rapier_ramjet_thrust_kn: 0,
    rapier_stagnation_temp_c: 90,
    rapier_thermal_margin_c: 1110,
  });
  assert.ok(intercept);

  const circuits = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    mach: 0.45,
    rapier_turbine_thrust_kn: 40,
    rapier_ramjet_thrust_kn: 0,
    rapier_stagnation_temp_c: 40,
    rapier_thermal_margin_c: 1160,
  });
  assert.equal(circuits, null);
});

test("engine presentation remains available for Systems / diagnostics", () => {
  const cue = rapierEnginePresentation({
    rapier_mission_available: true,
    mach: 3.64,
    true_airspeed_kts: 2_174,
    engine_net_thrust_lbf: 22_480,
    throttle: 1.55,
    rapier_stagnation_temp_c: 612,
    rapier_turbine_thrust_kn: 18,
    rapier_ramjet_thrust_kn: 82,
    rapier_turbine_fuel_ppm: 0,
    rapier_ramjet_fuel_ppm: 270,
  });
  assert.match(cue.text, /PROPULSION RAM ONLY/);
  assert.match(cue.explainer, /Ram only/);
  assert.equal(cue.channels.length, 2);
});
