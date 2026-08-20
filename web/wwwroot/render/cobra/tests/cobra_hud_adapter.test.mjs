import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import {
  COBRA_HUD_ENTITY_ID,
  cobraHudState,
  createCobraHudFrame,
} from "../cobra_hud_adapter.js";
import { airdataReadout } from "../../hud/hud_readouts.js";

const MPS_TO_KT = 3600 / 1852;

function authorityFixture() {
  return {
    status: "active",
    vehicle: {
      x_m: 120, y_m: 210, z_m: -3_400,
      ground_speed_mps: 30.4,
      true_airspeed_mps: 31.9,
      vertical_speed_mps: -1.6,
      pitch_rad: 0.05, roll_rad: -0.1, yaw_rad: Math.PI / 2,
      collective: 0.62,
      pedal: -0.24,
      velocity_x_mps: 30.0, velocity_y_mps: -1.6, velocity_z_mps: 4.2,
      hover_power_margin: 0.18,
      power_margin: 0.24,
      rotorcraft: {
        regime: "Normal",
        main_rotor_rpm: 320.8,
        tail_rotor_rpm: 1_648.4,
        engine_shaft_power_w: 625_000,
        available_shaft_power_w: 930_000,
        engine_shaft_power_fraction: 0.61,
        transmission_torque_nm: 9_800,
        transmission_limit_fraction: 0.87,
        advance_ratio: 0.24,
        governor_saturated: false,
        vortex_ring_severity: 0.08,
        retreating_blade_stall_severity: 0.12,
        mast_bump_risk: 0.10,
        ground_effect_factor: 1.12,
        torque_yaw_demand_rad_s: 0.16,
        scas_yaw_rad_s: -0.04,
        yaw_residual_rad_s: 0.12,
        main_rotor_clearance_m: 41.2,
        engine_operating: true,
      },
    },
    route_guidance: { current_clearance_m: 38.5 },
    gunner: { selected_target_id: null, state: "idle", reason: "NoTarget", fire_authorized: false },
    ground_war: {
      ammo_remaining: 350, ammo_capacity: 750, ammo_bingo: false, ammo_dry: false,
      fob_range_m: 2_150, debrief: { hostile_kills: 3, rounds_expended: 22 },
    },
    battle_damage: {
      threat_tracking: false,
      receiving_fire: false,
      scas_damaged: false,
      engine_damaged: false,
      bursts_fired: 1,
      damaging_hits: 0,
      recent_bursts: [{
        sequence: 7,
        will_hit: false,
        has_impacted: false,
        subsystem: "none",
      }],
    },
    turnaround: {
      phase: "operational",
      sequence: 0,
      flight_controls_enabled: true,
    },
  };
}

const poseFixture = {
  x_m: 121, y_m: 212.5, z_m: -3_401,
  pitch_rad: 0.06, roll_rad: -0.12, yaw_rad: Math.PI / 2 + 0.01,
  main_rotor_rpm: 321.0,
};

test("cobra snapshot speaks the production hud.js state contract", () => {
  const state = cobraHudState(authorityFixture(), poseFixture);

  // Attitude/heading/altitude come from the per-frame hot pose, not the 30 Hz JSON.
  assert.ok(Math.abs(state.pitch_deg - 0.06 * 180 / Math.PI) < 1e-9);
  assert.ok(Math.abs(state.bank_deg - -0.12 * 180 / Math.PI) < 1e-9);
  assert.ok(Math.abs(state.heading_deg - (90 + 0.01 * 180 / Math.PI)) < 1e-6);
  assert.ok(Math.abs(state.alt_ft - 212.5 * 3.28084) < 1e-6);

  // Speeds/velocity come from the authority snapshot, in HUD units, sim frame.
  assert.ok(Math.abs(state.true_airspeed_kts - 31.9 * MPS_TO_KT) < 1e-9);
  assert.ok(Math.abs(state.ground_speed_kts - 30.4 * MPS_TO_KT) < 1e-9);
  assert.ok(Math.abs(state.vertical_speed_fpm - -1.6 * 196.850394) < 1e-3);
  assert.equal(state.vx, 30.0);
  assert.equal(state.vy, -1.6);
  assert.equal(state.vz, 4.2);

  // Power rail: collective is the lever, transmission torque fraction is the output.
  assert.equal(state.throttle, 0.62);
  assert.equal(state.engine_spool_fraction, 0.87);
  assert.equal(state.has_engine, true);
  assert.equal(state.engine_running, true);
  assert.equal(state.audio_profile_id, "audio.ah1g.t53-b540.v1");
  assert.equal(state.cobra_main_rotor_rpm, 320.8);
  assert.equal(state.cobra_tail_rotor_rpm, 1_648.4);
  assert.equal(state.cobra_collective, 0.62);
  assert.equal(state.cobra_advance_ratio, 0.24);
  assert.equal(state.cobra_transmission_limit_fraction, 0.87);
  assert.equal(state.cobra_vortex_ring_severity, 0.08);
  assert.equal(state.cobra_retreating_blade_stall_severity, 0.12);
  assert.equal(state.cobra_mast_bump_risk, 0.10);
  assert.equal(state.cobra_ground_effect_factor, 1.12);
  assert.equal(state.cobra_pedal, -0.24);
  assert.equal(state.cobra_torque_yaw_demand_rad_s, 0.16);
  assert.equal(state.cobra_scas_yaw_rad_s, -0.04);
  assert.equal(state.cobra_yaw_residual_rad_s, 0.12);
  assert.equal(state.cobra_engine_operating, true);
  assert.equal(state.cobra_engine_power_fraction, 0.61,
    "the bridge's published shaft-power fraction wins over a recomputed fallback");
  assert.equal(state.cobra_turnaround_phase, "operational");
  assert.equal(state.cobra_turnaround_sequence, 0);
  assert.equal(state.cobra_turnaround_active, false);
  assert.equal(state.has_afterburner, false);
  assert.equal(state.suppress_systems_panel, true,
    "Cobra warnings use the centre lane without waking fixed-wing systems chrome");
  assert.equal(state.suppress_padlock_steering, true,
    "Cobra crew/designation copy owns steering explanations instead of fixed-wing padlock copy");
  assert.equal(state.cobra_ground_fire_last_burst_sequence, 7);
  assert.equal(state.cobra_ground_fire_last_burst_will_hit, false);
  assert.equal(state.cobra_ground_fire_last_burst_has_impacted, false);
  assert.deepEqual(state.cobra_ground_fire_recent_bursts, [{
    sequence: 7,
    will_hit: false,
    has_impacted: false,
    subsystem: "none",
  }], "audio receives actual bounded events, not only the newest-burst aliases");
  assert.equal(state.cobra_fire_authorized, false);
  assert.equal(state.cobra_ammo_remaining, 350);
  assert.equal(state.cobra_rounds_expended, 22);

  // The rotorcraft has no indicated chain: the tape must label itself KTAS.
  assert.equal(state.calibrated_airspeed_kts, undefined);
  assert.equal(state.indicated_airspeed_kts, undefined);
  assert.equal(airdataReadout(state).speedUnit, "KTAS");

  // Jet-only chrome must be structurally off, not merely quiet.
  assert.equal(state.opponent_alive, false);
  assert.equal(state.carrier, false);
  assert.equal(state.has_retractable_gear, false);
  assert.equal(state.has_flaps, false);
  assert.equal(state.has_speed_brake, false);
  assert.equal(state.has_utility_hydraulics, false);
  assert.equal(state.has_electrical_system, false);
  assert.equal(state.mach, undefined);
  assert.equal(state.g_actual, undefined);
  // No radar_alt_ft: hud.js's generic PULL UP (radar<500 ft & sink>1000 fpm) is
  // permanently armed at nap-of-earth heights; rotorcraft sink cues are owned by
  // the rotorcraft extras with rotorcraft-honest thresholds.
  assert.equal(state.radar_alt_ft, undefined);
  assert.equal(state.rtb, undefined);
  assert.equal(state.auto_gcas_available, undefined);

  // Sortie identity + kill tally reuse the F-22 presentation verbatim.
  assert.equal(state.player_entity_id, COBRA_HUD_ENTITY_ID);
  assert.equal(state.kill_count, 3);

  // Classical helicopter flight-path path (absent on F-22 snapshots).
  assert.equal(state.heli_flight_path, true);
  assert.equal(state.heli_fpv_mode, "cruise"); // 30.4 m/s ≈ 59 KT
  assert.equal(state.heli_fpv_level, "normal");
  assert.equal(state.heli_fpv_gun_ready, false);
  const heading = poseFixture.yaw_rad;
  const expectedRightMps = 30.0 * Math.cos(heading) - 4.2 * Math.sin(heading);
  const expectedForwardMps = 30.0 * Math.sin(heading) + 4.2 * Math.cos(heading);
  assert.ok(Math.abs(state.heli_hover_right_kt - expectedRightMps * MPS_TO_KT) < 1e-9);
  assert.ok(Math.abs(state.heli_hover_forward_kt - expectedForwardMps * MPS_TO_KT) < 1e-9);
});

test("production heading 90 publishes east motion as forward hover drift", () => {
  const authority = authorityFixture();
  authority.vehicle.velocity_x_mps = 6;
  authority.vehicle.velocity_z_mps = 0;
  authority.vehicle.ground_speed_mps = 6;
  const pose = { ...poseFixture, yaw_rad: Math.PI / 2 };
  const state = cobraHudState(authority, pose);
  assert.ok(Math.abs(state.heli_hover_right_kt) < 1e-9);
  assert.ok(Math.abs(state.heli_hover_forward_kt - 6 * MPS_TO_KT) < 1e-9);
});


test("snapshot object is reused across frames without leaking stale fields", () => {
  const out = {};
  const first = cobraHudState(authorityFixture(), poseFixture, out);
  assert.equal(first, out);
  const second = cobraHudState(authorityFixture(), poseFixture, out);
  assert.equal(second, out);
  assert.equal(second.kill_count, 3);

  const noWar = authorityFixture();
  noWar.ground_war = null;
  const third = cobraHudState(noWar, poseFixture, out);
  assert.equal(third.kill_count, 0, "stale kill tally must not survive a missing ground war");

  const damaged = authorityFixture();
  damaged.vehicle.rotorcraft.engine_operating = false;
  damaged.battle_damage = {
    threat_tracking: true,
    receiving_fire: true,
    scas_damaged: true,
    engine_damaged: true,
  };
  const fourth = cobraHudState(damaged, poseFixture, out);
  assert.equal(fourth.has_engine, true, "damage cannot erase installed engine capability");
  assert.equal(fourth.engine_running, false);
  assert.equal(fourth.cobra_engine_damaged, true);
  assert.equal(fourth.cobra_scas_damaged, true);
  assert.equal(fourth.cobra_receiving_ground_fire, true);
  assert.deepEqual(fourth.cobra_ground_fire_recent_bursts, [],
    "a reused HUD snapshot cannot retain the previous airframe's burst events");

  damaged.turnaround = {
    phase: "rotor-coast",
    sequence: 4,
    flight_controls_enabled: false,
  };
  const servicing = cobraHudState(damaged, poseFixture, out);
  assert.equal(servicing.cobra_turnaround_active, true);
  assert.equal(servicing.cobra_turnaround_phase, "rotor-coast");
  assert.equal(servicing.cobra_turnaround_sequence, 4);

  const recovered = authorityFixture();
  recovered.battle_damage = null;
  const fifth = cobraHudState(recovered, poseFixture, out);
  assert.equal(fifth.engine_running, true);
  assert.equal(fifth.cobra_engine_damaged, false);
  assert.equal(fifth.cobra_scas_damaged, false);
  assert.equal(fifth.cobra_receiving_ground_fire, false,
    "damage warnings must clear on a fresh airframe or missing damage projection");
  assert.equal(fifth.cobra_turnaround_active, false,
    "turnaround state must also clear instead of leaking across reused snapshots");
});

test("observer acquisition stays private until hostile rounds are in flight", () => {
  const authority = authorityFixture();
  authority.battle_damage = {
    threat_tracking: true,
    acquisition_progress: 0.95,
    receiving_fire: false,
    scas_damaged: false,
    engine_damaged: false,
  };

  const state = cobraHudState(authority, poseFixture);
  assert.equal(state.cobra_receiving_ground_fire, false);
  assert.equal(state.cobra_threat_tracking, undefined);
  assert.equal(state.cobra_acquisition_progress, undefined);
});

test("degraded authority states fail visible, not plausible", () => {
  const degraded = cobraHudState({ vehicle: null }, null);
  assert.equal(degraded.true_airspeed_kts, undefined);
  assert.equal(degraded.ground_speed_kts, undefined);
  assert.equal(degraded.vertical_speed_fpm, undefined);
  assert.equal(degraded.alt_ft, undefined);
  assert.equal(degraded.heading_deg, undefined);
  assert.equal(degraded.throttle, undefined);
  assert.equal(degraded.cobra_vortex_ring_severity, undefined);
  assert.equal(degraded.cobra_retreating_blade_stall_severity, undefined);
  assert.equal(degraded.cobra_mast_bump_risk, undefined);
  assert.equal(degraded.cobra_ground_effect_factor, undefined);
  assert.equal(degraded.cobra_pedal, undefined);
  assert.equal(degraded.cobra_torque_yaw_demand_rad_s, undefined);
  assert.equal(degraded.cobra_scas_yaw_rad_s, undefined);
  assert.equal(degraded.cobra_yaw_residual_rad_s, undefined);
  assert.equal(degraded.cobra_ground_fire_last_burst_sequence, undefined,
    "missing threat authority cannot masquerade as sequence zero");
  assert.deepEqual(degraded.cobra_ground_fire_recent_bursts, []);
  assert.equal(airdataReadout(degraded).primaryText, "---");
});

test("hud frame carries body axes and render-space position from the pose", () => {
  const frameKit = createCobraHudFrame(THREE);
  const camera = new THREE.PerspectiveCamera(58, 1.6, 0.12, 32_000);
  const state = cobraHudState(authorityFixture(), poseFixture);
  const frame = frameKit.update({
    camera,
    pose: poseFixture,
    state,
    dt: 1 / 60,
    nowSeconds: 12.5,
  });

  assert.equal(frame.state, state);
  assert.equal(frame.camera, camera);
  // Render space: x east, y up, z = -north.
  assert.ok(frame.playerPosition.equals(new THREE.Vector3(121, 212.5, 3_401)));
  // Body forward for yaw 90deg+0.01, pitch 0.06: mostly +x (east), slightly up.
  assert.ok(frame.playerForward.x > 0.99);
  assert.ok(Math.abs(frame.playerForward.y - Math.sin(0.06)) < 1e-6);
  assert.ok(frame.playerUp.y > 0.98);
  assert.equal(frame.padlock, false);
  assert.equal(frame.wingmanPresent, false);
  assert.equal(frame.triggerHeld, false);
  assert.equal(frame.dt, 1 / 60);
  assert.equal(frame.now, 12.5);
  assert.equal(frame.sensorYaw, 0);
  assert.equal(frame.sensorPitch, 0);

  const padlocked = frameKit.update({
    camera,
    pose: poseFixture,
    state,
    dt: 1 / 60,
    nowSeconds: 12.6,
    padlockActive: true,
    padlockTargetId: "ground.hostile.infantryclump.001",
    padlockTargetUnit: { x_m: 10, y_m: 101, z_m: -20 },
  });
  assert.equal(padlocked, frame);
  assert.equal(frame.padlock, true);
  assert.equal(frame.padlockTarget, "bandit");
  assert.equal(frame.padlockTargetEntityId, "ground.hostile.infantryclump.001");
  assert.equal(frame.padlockPhase, "TRACK");
  assert.ok(frame.padlockTargetPosition.equals(new THREE.Vector3(10, 102.2, 20)));

  // Same object frame-to-frame: the render loop must not allocate.
  const again = frameKit.update({ camera, pose: poseFixture, state, dt: 1 / 60, nowSeconds: 12.7 });
  assert.equal(again, frame);
  assert.equal(frame.padlock, false);
});
