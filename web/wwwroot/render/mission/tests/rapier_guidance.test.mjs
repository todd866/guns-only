import assert from "node:assert/strict";
import test from "node:test";
import {
  rapierEnginePresentation,
  rapierGuidancePresentation,
} from "../rapier_guidance.js";

test("Rapier guidance is absent outside the scripted sortie", () => {
  assert.equal(rapierGuidancePresentation({}), null);
});

test("Rapier guidance names automation, profile target, and takeover control", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 3,
    rapier_gun_drones_remaining: 4,
  });
  assert.match(cue.text, /AUTO FLYING · LEVEL ACCEL \/ M2\.20/);
  assert.match(cue.text, /P TOGGLE AUTO/);
  assert.equal(cue.level, "active");
});

test("attack guidance exposes the single four-ship sweep authorization", () => {
  const cue = rapierGuidancePresentation({
    rapier_mission_available: true,
    rapier_automation_enabled: true,
    rapier_automation_active: true,
    rapier_mission_phase: 6,
    rapier_gun_drones_remaining: 3,
  });
  assert.match(cue.text, /ATTACK FORMATION/);
  assert.match(cue.text, /F RELEASES GUN-DRONE SWARM · 3 DRONES/);
  assert.equal(cue.level, "attack");
});

test("manual takeover remains explicit and return guidance says exactly how to get home", () => {
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
  assert.match(cue.text, /PILOT FLYING · RETURN HOME M2\.00 \/ FL450/);
  assert.match(cue.detail, /HOME 003° · 184 NM · ETA 9 MIN · TURN L 28°/);
  assert.match(cue.detail, /FOLLOW HOME CUE · P ENGAGES AUTO/);
  assert.equal(cue.level, "manual");
});

test("weapons release transitions into an unmistakable automated egress", () => {
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
  assert.match(cue.text, /FORMATION DESTROYED · EGRESS HOME/);
  assert.match(cue.detail, /HOME 180° · 320 NM · ETA 8 MIN · TURN R 172°/);
  assert.match(cue.detail, /AUTOMATION HAS CONTROL/);
});

test("engine presentation makes the combined-cycle state and actual thrust explicit", () => {
  const cue = rapierEnginePresentation({
    rapier_mission_available: true,
    mach: 3.64,
    true_airspeed_kts: 2_174,
    engine_net_thrust_lbf: 22_480,
    throttle: 1.55,
    rapier_stagnation_temp_c: 612,
    rapier_turbine_thrust_kn: 18,
    rapier_ramjet_thrust_kn: 82,
    rapier_turbine_fuel_ppm: 42,
    rapier_ramjet_fuel_ppm: 90,
  });
  assert.equal(
    cue.text,
    "PROPULSION MACH-4 RAM · 100 KN · LEVER 1.55 · M3.64 · 2,174 KTAS · T0 612°C",
  );
  assert.equal(cue.level, "ram");
  assert.deepEqual(cue.channels, [
    { label: "TURBINE / A-B", thrustKn: 18, fuelPpm: 42 },
    { label: "RAMJET", thrustKn: 82, fuelPpm: 90 },
  ]);
});
