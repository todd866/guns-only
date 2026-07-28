import assert from "node:assert/strict";
import test from "node:test";
import {
  circuitGatePresentation,
  rapierCycleTeachPresentation,
  rapierEnginePresentation,
  rapierFlightDirectorPresentation,
  rapierGuidancePresentation,
} from "../rapier_guidance.js";

test("Rapier guidance is absent outside the scripted sortie", () => {
  assert.equal(rapierGuidancePresentation({}), null);
});

test("Rapier guidance is a quiet mode line with authority and takeover", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 3,
    rapier_gun_drones_remaining: 4,
    rapier_skin_temp_c: 90,
    rapier_recovery_temp_c: 100,
    rapier_stagnation_temp_c: 110,
    rapier_cmc_capability_c: 1200,
    rapier_cmc_margin_c: 1090,
  });
  assert.match(cue.text, /AUTO · LEVEL ACCEL · M2\.20/);
  assert.match(cue.text, /SKIN 90°C/);
  assert.match(cue.text, /T0 110°C/);
  assert.doesNotMatch(cue.text, /MARGIN|TO LIMIT|\+1090/);
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

test("stagnation over names the CMC channel instead of calling T0 skin", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: false,
    rapier_automation_active: false,
    rapier_mission_phase: 4,
    rapier_skin_temp_c: 1100,
    rapier_recovery_temp_c: 1180,
    rapier_stagnation_temp_c: 1240,
    rapier_cmc_capability_c: 1200,
    rapier_cmc_margin_c: -40,
  });
  assert.match(cue.text, /T0 OVER 1240°C/);
  assert.match(cue.text, /CMC CAP 1200°C/);
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
    rapier_material_mach_ceiling: 3.14,
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
    rapier_skin_temp_c: 90,
    rapier_recovery_temp_c: 100,
    rapier_stagnation_temp_c: 110,
    rapier_cmc_capability_c: 1200,
    rapier_cmc_margin_c: 1090,
  });
  assert.equal(teach.mode, "TURBINE");
  assert.match(teach.explainer, /Ram needs ~M2/);
  assert.match(teach.skinText, /SKIN 90°C/);
  assert.match(teach.skinText, /T0 110°C/);
  assert.match(teach.skinText, /ENGINE\/INLET LIMITING/);
  assert.doesNotMatch(teach.skinText, /TO LIMIT|\+1090/);
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
    rapier_skin_temp_c: 451,
    rapier_recovery_temp_c: 451,
    rapier_stagnation_temp_c: 520,
    rapier_cmc_capability_c: 1200,
    rapier_cmc_margin_c: 680,
    rapier_turbine_thrust_kn: 18,
    rapier_ramjet_thrust_kn: 82,
    rapier_turbine_fuel_ppm: 0,
    rapier_ramjet_fuel_ppm: 270,
  });
  assert.match(cue.text, /PROPULSION RAM ONLY/);
  assert.match(cue.text, /SKIN 451°C/);
  assert.match(cue.text, /T0 520°C/);
  assert.doesNotMatch(cue.text, /T0 451°C/);
  assert.match(cue.explainer, /Ram only/);
  assert.equal(cue.channels.length, 2);
});
