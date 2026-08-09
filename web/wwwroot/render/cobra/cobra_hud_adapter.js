/**
 * Cobra -> production HUD data adapter (Build 264 owner ruling: "standard F-22 HUD
 * plus extras to make it legible as an attack helicopter").
 *
 * Maps the AH-1G authority state (CobraWebBridge.GetState JSON + the per-frame
 * 7-slot hot pose) onto the exact snapshot/frame contract app.js feeds hud.js.
 * One engine: hud.js is consumed as-is — jet-only chrome is switched off through
 * the snapshot's own capability flags (has_*, opponent_alive, fuel_lb absent),
 * never by forking the HUD.
 *
 * Helicopter flight-path doctrine (2026-08-07, owner-corrected 2026-08-08): ladder AND
 * waterline are camera-conformal when ladderReference is camera; gun cross stays
 * body-forward; FPV/hover stub + cues are gated by heli_flight_path on the
 * snapshot (see docs/superpowers/specs/2026-08-07-cobra-helicopter-hud-design.md).
 *
 * Deliberate omissions (each one is a decision, not a gap):
 *  - no calibrated/indicated airspeed: the rotorcraft authority publishes TAS only,
 *    so the tape runs on the KTAS fallback and says so on its unit label;
 *  - no radar_alt_ft: hud.js's generic PULL UP fires below 500 ft at >1000 fpm sink,
 *    which is permanently armed at nap-of-earth heights. AGL/sink presentation is
 *    owned by the rotorcraft extras panel with rotorcraft-honest thresholds;
 *  - no rtb/fuel: rearm guidance already lives on the mission card, and the F-22
 *    RTB card speaks fixed-wing recovery language ("BOAT").
 */

import { vehicleBodyQuaternion } from "./ah1g_presence.js";
import { cobraFpvLevel, cobraFpvMode } from "./cobra_helicopter_fpv.js";

export const COBRA_HUD_ENTITY_ID = "cobra.ah1g.hold-the-bridge";

const RAD_TO_DEG = 180 / Math.PI;
const MPS_TO_KT = 3600 / 1852;
const MPS_TO_FPM = 196.850394;
const M_TO_FT = 3.28084;

function finite(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function scaled(value, factor) {
  const numeric = finite(value);
  return numeric === undefined ? undefined : numeric * factor;
}

function wrap360(value) {
  return ((value % 360) + 360) % 360;
}

/**
 * Flat hud.js snapshot from cobra authority truth. `out` is reused across frames;
 * every dynamic field is assigned on every call so stale values cannot survive a
 * degraded snapshot.
 */
export function cobraHudState(authorityState, pose, out = {}) {
  const vehicle = authorityState?.vehicle ?? null;
  const rotorcraft = vehicle?.rotorcraft ?? null;
  const attitude = pose ?? vehicle;

  // Sortie identity + structural capability truth (constant, but cheap to restate).
  out.player_entity_id = COBRA_HUD_ENTITY_ID;
  out.opponent_alive = false;
  out.carrier = false;
  out.mode = "FREE";
  out.has_afterburner = false;
  out.has_speed_brake = false;
  out.has_retractable_gear = false;
  out.has_flaps = false;
  out.has_utility_hydraulics = false;
  out.has_electrical_system = false;

  // Attitude/heading/altitude from the per-frame hot pose (the 30 Hz JSON lags it).
  out.pitch_deg = scaled(attitude?.pitch_rad, RAD_TO_DEG);
  out.bank_deg = scaled(attitude?.roll_rad, RAD_TO_DEG);
  const headingDeg = scaled(attitude?.yaw_rad, RAD_TO_DEG);
  out.heading_deg = headingDeg === undefined ? undefined : wrap360(headingDeg);
  out.alt_ft = scaled(attitude?.y_m, M_TO_FT);

  // Airdata in HUD units. TAS only — see the header note on the KTAS fallback.
  out.true_airspeed_kts = scaled(vehicle?.true_airspeed_mps, MPS_TO_KT);
  out.ground_speed_kts = scaled(vehicle?.ground_speed_mps, MPS_TO_KT);
  out.vertical_speed_fpm = scaled(vehicle?.vertical_speed_mps, MPS_TO_FPM);

  // World ground velocity, sim frame (Z north): hud.js performs the render z-flip
  // itself when it projects the flight-path vector, exactly as for the F-22.
  out.vx = finite(vehicle?.velocity_x_mps);
  out.vy = finite(vehicle?.velocity_y_mps);
  out.vz = finite(vehicle?.velocity_z_mps);

  // Power rail semantics for a helicopter: the collective IS the power lever, and
  // transmission torque fraction is the delivered output the pilot feels lag on.
  // Above 1.0 the rail's own amber over-limit treatment is physically honest.
  out.throttle = finite(vehicle?.collective);
  out.engine_spool_fraction = finite(rotorcraft?.transmission_limit_fraction);
  out.has_engine = rotorcraft ? rotorcraft.engine_operating !== false : true;

  // F-22 kill tally, fed by ground-war truth.
  out.kill_count = Math.max(0,
    Math.floor(Number(authorityState?.ground_war?.debrief?.hostile_kills) || 0));

  // Helicopter flight-path path in hud.js (absent on F-22 snapshots → jet path unchanged).
  out.heli_flight_path = true;
  out.heli_fpv_mode = cobraFpvMode(out.ground_speed_kts);
  out.heli_fpv_level = cobraFpvLevel(rotorcraft);
  out.heli_fpv_gun_ready = authorityState?.gunner?.fire_authorized === true;
  // Plan-view hover stub: horizontal ground track in knots (sim: +x east, +z north).
  out.heli_hover_east_kt = scaled(vehicle?.velocity_x_mps, MPS_TO_KT) ?? 0;
  out.heli_hover_north_kt = scaled(vehicle?.velocity_z_mps, MPS_TO_KT) ?? 0;

  return out;
}

/**
 * Reusable hud.js frame (the app.js FlightView.hudFrame analogue). All vectors are
 * preallocated; update() refreshes them from the hot pose each rendered frame.
 */
export function createCobraHudFrame(THREE) {
  const quaternion = new THREE.Quaternion();
  const frame = {
    state: null,
    camera: null,
    playerPosition: new THREE.Vector3(),
    playerForward: new THREE.Vector3(0, 0, -1),
    playerUp: new THREE.Vector3(0, 1, 0),
    playerRight: new THREE.Vector3(1, 0, 0),
    banditPosition: new THREE.Vector3(),
    wingmanPosition: new THREE.Vector3(),
    padlockTargetPosition: new THREE.Vector3(),
    aimPoint: null,
    directorPoint: null,
    flightPathPoint: null,
    // Rear-seat camera: +0.08 rad sight bias + clamped gunner lean. Pitch ladder and
    // waterline are camera-referenced so W agrees with the conformal 0 rung. Gun cross
    // stays body-forward. FPV is velocity-through-camera in cruise; hover uses a stub.
    ladderReference: "camera",
    sensorYaw: 0,
    sensorPitch: 0,
    lookYaw: 0,
    lookPitch: 0,
    padlock: false,
    padlockTarget: null,
    padlockTargetEntityId: "",
    padlockPhase: "OFF",
    wingmanPresent: false,
    manualLookActive: false,
    periodGunsightVisible: false,
    shoulderHandoffLatched: false,
    triggerHeld: false,
    dt: 0,
    now: 0,
  };

  return {
    frame,
    update({
      camera,
      pose,
      state,
      dt,
      nowSeconds,
      padlockActive = false,
      padlockTargetId = "",
      padlockTargetUnit = null,
    }) {
      frame.camera = camera;
      frame.state = state;
      frame.dt = Number.isFinite(dt) ? dt : 0;
      frame.now = Number.isFinite(nowSeconds) ? nowSeconds : 0;
      if (pose) {
        frame.playerPosition.set(
          Number(pose.x_m) || 0,
          Number(pose.y_m) || 0,
          -(Number(pose.z_m) || 0),
        );
        vehicleBodyQuaternion(THREE, pose, quaternion);
        frame.playerForward.set(0, 0, -1).applyQuaternion(quaternion);
        frame.playerUp.set(0, 1, 0).applyQuaternion(quaternion);
        frame.playerRight.set(1, 0, 0).applyQuaternion(quaternion);
      }
      // F-22-shaped padlock fields so hud.js padlock SA can light when V is held on a mark.
      const padlocked = padlockActive === true && padlockTargetUnit != null;
      frame.padlock = padlocked;
      frame.padlockTarget = padlocked ? "bandit" : null;
      frame.padlockTargetEntityId = padlocked ? String(padlockTargetId || "") : "";
      frame.padlockPhase = padlocked ? "TRACK" : "OFF";
      if (padlocked) {
        const x = Number(padlockTargetUnit.x_m) || 0;
        const y = (Number(padlockTargetUnit.y_m) || 0) + 1.2;
        const z = -(Number(padlockTargetUnit.z_m) || 0);
        frame.padlockTargetPosition.set(x, y, z);
        frame.banditPosition.set(x, y, z);
      }
      return frame;
    },
  };
}
