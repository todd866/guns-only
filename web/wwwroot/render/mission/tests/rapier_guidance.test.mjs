import assert from "node:assert/strict";
import test from "node:test";
import {
  rapierEnginePresentation,
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
  });
  assert.match(cue.text, /AUTO · LEVEL ACCEL · M2\.20/);
  assert.match(cue.text, /P TOGGLE AUTO/);
  assert.equal(cue.detail, "");
  assert.equal(cue.level, "active");
});

test("attack guidance exposes swarm release without owning the centre", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 6,
    rapier_gun_drones_remaining: 3,
  });
  assert.match(cue.text, /ATTACK/);
  assert.match(cue.text, /F RELEASES SWARM · 3/);
  assert.equal(cue.detail, "");
  assert.equal(cue.level, "attack");
});

test("manual takeover stays explicit without a triad essay", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: false,
    rapier_automation_active: false,
    rapier_mission_phase: 8,
    rtb_range_nm: 184.4,
    rtb_bearing_deg: 3.2,
    rtb_turn_deg: -27.6,
    true_airspeed_kts: 1180,
  });
  assert.match(cue.text, /PILOT · RETURN · HOME/);
  assert.equal(cue.detail, "");
  assert.equal(cue.level, "manual");
});

test("egress is a short mode line, not a fuel paragraph", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 7,
    rtb_range_nm: 320,
    rtb_bearing_deg: 180,
    rtb_turn_deg: 172,
    true_airspeed_kts: 2300,
  });
  assert.match(cue.text, /EGRESS · HOME/);
  assert.equal(cue.detail, "");
  assert.equal(cue.level, "attack");
});

test("skin over replaces the mode fragment", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: false,
    rapier_automation_active: false,
    rapier_mission_phase: 4,
    rapier_thermal_margin_c: -40,
  });
  assert.match(cue.text, /SKIN OVER/);
  assert.equal(cue.level, "attack");
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
  assert.equal(cue.channels.length, 2);
});
