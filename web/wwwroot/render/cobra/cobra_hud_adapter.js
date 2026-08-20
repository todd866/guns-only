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
 * Helicopter flight-path doctrine (owner-corrected 2026-08-11): the ladder is camera/world
 * conformal; W and the gun cross stay body-forward; FPV/hover stub + cues are gated by
 * heli_flight_path on the snapshot (see
 * docs/superpowers/specs/2026-08-07-cobra-helicopter-hud-design.md).
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
import {
  cobraFpvLevel,
  cobraFpvMode,
  cobraHeadingRelativeGroundTrack,
} from "./cobra_helicopter_fpv.js";
import { cobraTurnaroundIsActive } from "./cobra_turnaround.js";

export const COBRA_HUD_ENTITY_ID = "cobra.ah1g.hold-the-bridge";

const RAD_TO_DEG = 180 / Math.PI;
const MPS_TO_KT = 3600 / 1852;
const MPS_TO_FPM = 196.850394;
const M_TO_FT = 3.28084;

function finite(value) {
  if (value == null || value === "") return undefined;
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
  out.player_aircraft_id = "ah-1g-cobra";
  out.audio_profile_id = "audio.ah1g.t53-b540.v1";
  out.opponent_alive = false;
  out.carrier = false;
  out.mode = "FREE";
  out.has_afterburner = false;
  out.has_speed_brake = false;
  out.has_retractable_gear = false;
  out.has_flaps = false;
  out.has_utility_hydraulics = false;
  out.has_electrical_system = false;
  // Cobra uses the common centre annunciation lane, but it has no retractable-gear / flap /
  // utility-systems panel to populate. Keep damage warnings available to hud.js without letting
  // their relevance wake the fixed-wing systems card full of "GEAR —" placeholders.
  out.suppress_systems_panel = true;
  // The generic padlock steering banner describes fixed-wing intercept geometry. Cobra's
  // designation/crew panel owns the equivalent explanation.
  out.suppress_padlock_steering = true;

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
  // Capability and operation are separate truths. The AH-1G always has an engine; battle damage
  // can stop it. Conflating those two fields made hud.js hide the very flameout warning the pilot
  // needs after a hostile hit.
  out.has_engine = true;
  out.engine_running = rotorcraft
    ? rotorcraft.engine_operating !== false
    : undefined;
  const availableShaftPowerW = finite(rotorcraft?.available_shaft_power_w);
  const engineShaftPowerW = finite(rotorcraft?.engine_shaft_power_w);
  const publishedEnginePowerFraction = finite(
    rotorcraft?.engine_power_fraction ?? rotorcraft?.engine_shaft_power_fraction,
  );
  out.cobra_main_rotor_rpm = finite(rotorcraft?.main_rotor_rpm);
  out.cobra_tail_rotor_rpm = finite(rotorcraft?.tail_rotor_rpm);
  out.cobra_collective = finite(vehicle?.collective);
  out.cobra_advance_ratio = finite(rotorcraft?.advance_ratio);
  out.cobra_transmission_limit_fraction = finite(rotorcraft?.transmission_limit_fraction);
  // Preserve the rotorcraft authority's causal envelope facts for the dedicated presentation
  // graph. These are direct projections, not HUD-derived warnings: audio can therefore follow the
  // continuous onset of disturbed inflow, blade stall, ground effect, and anti-torque workload.
  out.cobra_vortex_ring_severity = finite(rotorcraft?.vortex_ring_severity);
  out.cobra_retreating_blade_stall_severity = finite(
    rotorcraft?.retreating_blade_stall_severity,
  );
  out.cobra_mast_bump_risk = finite(rotorcraft?.mast_bump_risk);
  out.cobra_ground_effect_factor = finite(rotorcraft?.ground_effect_factor);
  out.cobra_pedal = finite(vehicle?.pedal ?? vehicle?.yaw);
  out.cobra_torque_yaw_demand_rad_s = finite(rotorcraft?.torque_yaw_demand_rad_s);
  out.cobra_scas_yaw_rad_s = finite(rotorcraft?.scas_yaw_rad_s);
  out.cobra_yaw_residual_rad_s = finite(rotorcraft?.yaw_residual_rad_s);
  out.cobra_engine_operating = out.engine_running;
  out.cobra_engine_power_fraction = publishedEnginePowerFraction === undefined
    ? availableShaftPowerW !== undefined && availableShaftPowerW > 0
      ? Math.max(0, Math.min(1, (engineShaftPowerW ?? 0) / availableShaftPowerW))
      : undefined
    : Math.max(0, Math.min(1, publishedEnginePowerFraction));
  const turnaround = authorityState?.turnaround ?? null;
  out.cobra_turnaround_phase = turnaround
    ? String(turnaround.phase ?? "operational")
    : "operational";
  out.cobra_turnaround_sequence = finite(turnaround?.sequence);
  out.cobra_turnaround_active = cobraTurnaroundIsActive(turnaround);
  const battleDamage = authorityState?.battle_damage ?? null;
  out.cobra_engine_damaged = battleDamage?.engine_damaged === true;
  out.cobra_scas_damaged = battleDamage?.scas_damaged === true;
  // Tracking is deliberately private. The combiner warns only after authority says rounds are
  // actually in flight, never because an unseen observer has begun acquiring the aircraft.
  out.cobra_receiving_ground_fire = battleDamage?.receiving_fire === true;
  const recentBursts = Array.isArray(battleDamage?.recent_bursts)
    ? battleDamage.recent_bursts
    : [];
  const latestBurst = recentBursts.length ? recentBursts[recentBursts.length - 1] : null;
  out.cobra_ground_fire_bursts_fired = finite(battleDamage?.bursts_fired);
  out.cobra_ground_fire_damaging_hits = finite(battleDamage?.damaging_hits);
  // Keep the bounded authority event list intact for presentation systems that must distinguish
  // overlapping rounds-in-flight. A newest-only alias cannot tell that burst N impacted while
  // newer burst N+1 is still travelling, and tying the damage counter to N+1 invents the wrong
  // hit. This is a reference passthrough; the bridge already owns and bounds the array.
  out.cobra_ground_fire_recent_bursts = recentBursts;
  out.cobra_ground_fire_last_burst_sequence = finite(latestBurst?.sequence);
  out.cobra_ground_fire_last_burst_will_hit = latestBurst?.will_hit === true;
  out.cobra_ground_fire_last_burst_has_impacted = latestBurst?.has_impacted === true;
  out.cobra_ground_fire_last_burst_subsystem = latestBurst
    ? String(latestBurst.subsystem ?? "none")
    : "none";
  out.cobra_fire_authorized = authorityState?.gunner?.fire_authorized === true;
  out.cobra_ammo_remaining = finite(authorityState?.ground_war?.ammo_remaining);
  out.cobra_rounds_expended = finite(authorityState?.ground_war?.debrief?.rounds_expended);

  // F-22 kill tally, fed by ground-war truth.
  out.kill_count = Math.max(0,
    Math.floor(Number(authorityState?.ground_war?.debrief?.hostile_kills) || 0));

  // Helicopter flight-path path in hud.js (absent on F-22 snapshots → jet path unchanged).
  out.heli_flight_path = true;
  out.heli_fpv_mode = cobraFpvMode(out.ground_speed_kts);
  out.heli_fpv_level = cobraFpvLevel(rotorcraft);
  out.heli_fpv_gun_ready = authorityState?.gunner?.fire_authorized === true;
  // Plan-view hover stub: rotate sim-world ground track (+x east, +z north) through the live
  // heading before it reaches the screen. At the production 90° spawn, east is forward — it must
  // draw up, not right. Pitch/bank do not contaminate this plan-view instrument.
  const hoverTrack = cobraHeadingRelativeGroundTrack(
    vehicle?.velocity_x_mps,
    vehicle?.velocity_z_mps,
    attitude?.yaw_rad,
  );
  out.heli_hover_right_kt = hoverTrack.rightMps * MPS_TO_KT;
  out.heli_hover_forward_kt = hoverTrack.forwardMps * MPS_TO_KT;

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
    // Forward camera is body-aligned. The pitch ladder stays camera/world referenced; W and the
    // gun cross stay body-forward at the optical centre. FPV is velocity-through-camera in
    // cruise; hover uses a heading-relative plan-view stub.
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
