import assert from "node:assert/strict";
import test from "node:test";
import {
  circuitGatePresentation,
  recoveryGatePresentation,
  rapierBriefingText,
  rapierCycleTeachPresentation,
  rapierEnginePresentation,
  rapierFlightDirectorPresentation,
  rapierGuidancePresentation,
} from "../rapier_guidance.js";

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
    rapier_skin_temp_c: 90,
    rapier_recovery_temp_c: 100,
    rapier_stagnation_temp_c: 110,
    rapier_cmc_capability_c: 1200,
    rapier_cmc_margin_c: 1090,
  });
  assert.match(cue.text, /^AUTO · ACCEL$/);
  assert.doesNotMatch(cue.text, /SKIN|T0|P TOGGLE|LEVEL ACCEL|M2\.20/);
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
  assert.doesNotMatch(cue.text, /SKIN|P TOGGLE/);
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
  assert.match(cue.text, /^PILOT · RETURN · HOME$/);
  assert.doesNotMatch(cue.text, /SKIN|P TOGGLE/);
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

test("skin-clamped dash stays off the quiet line (tapes / Limits own Mach)", () => {
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
    rapier_thermal_margin_c: 800,
  });
  assert.match(cue.text, /^AUTO · INTERCEPT$/);
  assert.doesNotMatch(cue.text, /CMD M/);
});

test("cycle teach explains turbine-to-ram handoff with live shares and skin", () => {
  const teach = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 4,
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
  assert.match(teach.skinText, /SKIN/);
  assert.doesNotMatch(teach.skinText, /TO LIMIT|\+1090/);
  assert.ok(teach.turbineShare > 0.9);
  assert.equal(teach.ramShare, 0);

  const handover = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 3,
    mach: 2.3,
    rapier_turbine_thrust_kn: 10,
    rapier_ramjet_thrust_kn: 40,
    rapier_stagnation_temp_c: 420,
    rapier_thermal_margin_c: 780,
  });
  assert.equal(handover.mode, "HANDOVER");
  assert.match(handover.explainer, /thrust bucket/i);
});

test("cycle teach uses pounds-force with the CMC thermal channels", () => {
  const teach = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 4,
    mach: 3.5,
    rapier_turbine_thrust_lbf: 0,
    rapier_ramjet_thrust_lbf: 18_000,
    rapier_skin_temp_c: 461,
    rapier_thermal_margin_c: 739,
  });
  assert.equal(teach.totalLbf, 18_000);
  assert.equal(teach.ramLbf, 18_000);
  assert.equal(teach.turbineLbf, 0);
  assert.equal(teach.skinC, 461);
  // Without canonical CMC fields the margin falls back to the legacy thermal margin and the
  // stagnation channel stays honestly absent rather than relabeling skin as T0.
  assert.equal(teach.stagnationC, null);
  assert.equal(teach.cmcMarginC, 739);
  assert.match(teach.skinText, /SKIN 461/);
});

test("flight director essays stay on Circuits; Intercept suppresses them", () => {
  const circuits = rapierFlightDirectorPresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_fd_bank_deg: 20,
    bank_deg: 5,
    rapier_target_altitude_ft: 56000,
    alt_ft: 50000,
    rapier_fd_target_ktas: 450,
    true_airspeed_kts: 500,
  });
  assert.equal(circuits.bankErrorDeg, 15);
  assert.equal(circuits.altErrorFt, 6000);
  assert.equal(circuits.speedCall, "SLOW");
  assert.equal(circuits.targetKtas, 450);
  assert.equal(circuits.centerFdCommands, true);

  const intercept = rapierFlightDirectorPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 9,
    rapier_fd_bank_deg: 20,
    bank_deg: 5,
    rapier_target_altitude_ft: 56000,
    alt_ft: 50000,
    rapier_fd_target_ktas: 450,
    true_airspeed_kts: 500,
  });
  assert.equal(intercept.speedCall, "");
  assert.equal(intercept.targetKtas, 0);
  assert.equal(intercept.centerFdCommands, false);
});

test("Circuits RAM climb director predicts FL700 capture before a high-rate overshoot", () => {
  const fd = rapierFlightDirectorPresentation({
    rapier_mission_available: true,
    rapier_pattern_only: true,
    rapier_mission_phase: 4,
    rapier_target_altitude_ft: 70000,
    alt_ft: 69380,
    vertical_speed_fpm: 38971,
    rapier_fd_bank_deg: 0,
    bank_deg: 0,
  });
  assert.equal(fd.altitudeCall, "CAPTURE FL700 · UNLOAD");
  assert.equal(fd.altitudeSeverity, "danger");
  assert.ok(fd.timeToAltitudeS > 0.9 && fd.timeToAltitudeS < 1.0);
});

test("Intercept director drops LEVEL NOW essays", () => {
  const fd = rapierFlightDirectorPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 9,
    rapier_target_altitude_ft: 70000,
    alt_ft: 71200,
    vertical_speed_fpm: 12000,
    rapier_fd_bank_deg: 0,
    bank_deg: 0,
  });
  assert.equal(fd.altitudeCall, "");
  assert.equal(fd.centerFdCommands, false);
});

test("Intercept high-G pull does not mint a center energy essay", () => {
  const fd = rapierFlightDirectorPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 9,
    rapier_target_altitude_ft: 70000,
    alt_ft: 72000,
    vertical_speed_fpm: 18000,
    requested_g_cmd: 8.5,
    rapier_automation_active: false,
  });
  assert.equal(fd.altitudeCall, "");
});

test("mission brief formats thresholds published by the kernel", () => {
  const text = rapierBriefingText(
    "RAM LIGHT begins at {RAM_LIGHT_MACH} and full ram arrives at {FULL_RAM_MACH}",
    {
      rapier_ram_light_mach: 2.15,
      rapier_full_ram_mach: 2.95,
    },
  );
  assert.equal(text, "RAM LIGHT begins at M2.1 and full ram arrives at M3.0");
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
  assert.match(cue.text, /HOOK DOWN · GEAR DOWN · ELEVONS DOWN · 170 KT/);
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
  assert.match(cue.text, /HOOK DOWN · GEAR UP · ELEVONS UP · 250 KT · 2500 FT/);
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
  assert.match(cue.text, /HOOK DOWN · GEAR DOWN · ELEVONS DOWN/);
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
  assert.match(cue.text, /HOOK DOWN · GEAR DOWN · ELEVONS DOWN/);
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

test("recoveryGatePresentation uses Mesh procedure fields with straight-in accent", () => {
  const open = recoveryGatePresentation({
    recovery_procedure_kind: 3,
    recovery_procedure_label: "STRAIGHT-IN",
    recovery_gate_half_m: 700,
    recovery_gate_x: -14816,
    recovery_gate_y: 720,
    recovery_gate_z: 0,
    recovery_gate_face_z: 1,
    recovery_gate_in_volume: true,
    recovery_gate_energy_ok: true,
    recovery_gate_config_ok: true,
    recovery_gate_target_ktas: 240,
    recovery_gate_dirty: false,
  });
  assert.equal(open.halfM, 700);
  assert.equal(open.worldX, -14816);
  assert.equal(open.status, "GATE OPEN");
  assert.equal(open.accent, "open");
  assert.match(open.boxLabel, /STRAIGHT-IN · GATE OPEN/);
});

test("cycle teach is ascent-only on Intercept; Circuits stays gated; OVER resurfaces it", () => {
  const ascent = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 4,
    mach: 1.88,
    rapier_turbine_thrust_kn: 23,
    rapier_ramjet_thrust_kn: 0,
    rapier_stagnation_temp_c: 90,
    rapier_thermal_margin_c: 1110,
  });
  assert.ok(ascent);

  const intercept = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 9,
    mach: 3.2,
    rapier_turbine_thrust_kn: 0,
    rapier_ramjet_thrust_kn: 40,
    rapier_stagnation_temp_c: 400,
    rapier_thermal_margin_c: 800,
  });
  assert.equal(intercept, null);

  const over = rapierCycleTeachPresentation({
    rapier_mission_available: true,
    rapier_mission_phase: 9,
    mach: 3.2,
    rapier_cmc_margin_c: -40,
    rapier_stagnation_temp_c: 1240,
  });
  assert.ok(over);

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
  assert.match(cue.text, /22,480 LBF/);
  assert.doesNotMatch(cue.text, /\bKN\b/);
  assert.match(cue.explainer, /Ram only/);
  assert.equal(cue.channels.length, 2);
});
