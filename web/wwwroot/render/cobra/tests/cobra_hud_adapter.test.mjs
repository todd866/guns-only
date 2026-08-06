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
      velocity_x_mps: 30.0, velocity_y_mps: -1.6, velocity_z_mps: 4.2,
      hover_power_margin: 0.18,
      power_margin: 0.24,
      rotorcraft: {
        regime: "Normal",
        main_rotor_rpm: 320.8,
        transmission_torque_nm: 9_800,
        transmission_limit_fraction: 0.87,
        governor_saturated: false,
        vortex_ring_severity: 0,
        retreating_blade_stall_severity: 0,
        mast_bump_risk: 0,
        main_rotor_clearance_m: 41.2,
        engine_operating: true,
      },
    },
    route_guidance: { current_clearance_m: 38.5 },
    gunner: { selected_target_id: null, state: "idle", reason: "NoTarget", fire_authorized: false },
    ground_war: {
      ammo_remaining: 350, ammo_capacity: 750, ammo_bingo: false, ammo_dry: false,
      fob_range_m: 2_150, debrief: { hostile_kills: 3 },
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
  assert.equal(state.has_afterburner, false);

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
});

test("degraded authority states fail visible, not plausible", () => {
  const degraded = cobraHudState({ vehicle: null }, null);
  assert.equal(degraded.true_airspeed_kts, undefined);
  assert.equal(degraded.ground_speed_kts, undefined);
  assert.equal(degraded.vertical_speed_fpm, undefined);
  assert.equal(degraded.alt_ft, undefined);
  assert.equal(degraded.heading_deg, undefined);
  assert.equal(degraded.throttle, undefined);
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

  // Same object frame-to-frame: the render loop must not allocate.
  const again = frameKit.update({ camera, pose: poseFixture, state, dt: 1 / 60, nowSeconds: 12.6 });
  assert.equal(again, frame);
});
