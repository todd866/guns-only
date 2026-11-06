// Stick feel for the standard pad. 1371fbac (the build the TV was rolled back to) mapped a
// stick through a 0.12 dead zone and rescaled the rest, then drove the car, the robot and the
// jet with that linear command. The layout after fd32ef31 kept a linear stick and added a fast
// right-stick orbit (1.7 / 1.15 rad/s) and a 12 rad/s robot snap. This module is the calm curve
// the game and the feel harness both use: a 0.2 resting dead zone, an expo, and rate caps.
// A raw axis is never a command. feelShape rescales past the dead zone.
import {BUGGY} from './physics/car.mjs';
import {MODES} from './physics/assists.mjs';
import {FLIGHT} from './physics/flight.mjs';
import {ROBOT} from './physics/robot.mjs';
import {vehicleParams} from './physics/vehicles.mjs';

export const REST_DEAD = 0.2;
// fd32ef31 orbit, rad/s at a full shaped stick. Low sensitivity uses half of this.
export const HEAD_CAMERA_YAW = 1.7;
export const HEAD_CAMERA_PITCH = 1.15;
export const KID_STEER_RATE = 2.4;
export const LOOK_SMOOTH = 8;
export const RECENTRE_AFTER = 1;
export const RECENTRE_RATE = 2.5;
export const WHEELBASE = 0.28;
export const PHYS_DT = 1 / 120;
export const SENSITIVITY_KEY = 'guns-only.rc.stickSensitivity';
export const SENSITIVITIES = Object.freeze(['low', 'normal', 'high']);
export const STICK_SWEEP = Object.freeze([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
export const SPEED_SWEEP = Object.freeze([0, 5, 10]);

// Expo stays inside 1.6–2.0. Camera gain is a fraction of the hot orbit (low ≈ half).
export const SENSITIVITY = Object.freeze({
  low: {expo: 2, camera: 0.5},
  normal: {expo: 1.7, camera: 0.75},
  high: {expo: 1.6, camera: 1}
});

export function sensitivityFor(mode, stored) {
  if (SENSITIVITIES.includes(stored)) return stored;
  return mode === 'bigKid' ? 'normal' : 'low';
}

export function cycleSensitivity(current) {
  const i = SENSITIVITIES.indexOf(current);
  return SENSITIVITIES[(i + 1) % SENSITIVITIES.length];
}

/** Raw stick −1..1 → command. |v| ≤ dead is 0; the rest is rescaled, then expo. */
export function feelShape(raw, {dead = REST_DEAD, expo = 2, gain = 1} = {}) {
  const v = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
  const m = Math.abs(v);
  if (!(m > dead)) return 0;
  const u = (m - dead) / (1 - dead);
  return Math.sign(v) * u ** expo * gain;
}

// The arcade flyer is snappier than the 1371 jet integrator. Scale the stick down so a full
// throw's initial pitch/roll rate does not exceed that jet (pitchRate 1.6, rollRate 2.8).
export function flightScales() {
  const A = FLIGHT.arcade,
    roll = A.bank * A.bankRate,
    pitch = A.climb * A.pitchRate;
  return {roll: Math.min(1, FLIGHT.rollRate / roll), pitch: Math.min(1, FLIGHT.pitchRate / pitch)};
}

export function steerLimit(speed, mode, maxSteer) {
  const falloff = MODES[mode]?.steerFalloff ?? MODES.kid.steerFalloff;
  return maxSteer / (1 + falloff * Math.max(0, speed || 0));
}

/**
 * Overwrite the analog channels mapPad already filled. One axis, one job:
 * left stick steers a car, moves a robot, or flies; the right stick only looks.
 */
export function applyFeel(out, raw, feel) {
  if (!feel || !out) return out;
  const spec = SENSITIVITY[feel.sensitivity] ?? SENSITIVITY.low,
    shape = v => feelShape(v, {expo: spec.expo}),
    look = v => feelShape(v, {expo: spec.expo, gain: spec.camera});
  if (out.form === 'robot') {
    out.moveX = shape(raw.lx);
    out.moveY = shape(raw.ly);
    out.steer = 0;
  } else if (out.form === 'fly' || out.form === 'chopper') {
    const scale = flightScales();
    out.pitch = shape(raw.ly) * scale.pitch;
    out.climb = out.pitch;
    out.roll = shape(raw.lx) * scale.roll;
    out.steer = 0;
  } else {
    out.steer = shape(raw.lx);
    out.moveX = 0;
    out.moveY = 0;
    out.pitch = 0;
    out.roll = 0;
  }
  out.lookX = look(raw.rx);
  out.lookY = look(raw.ry);
  if (feel.mode === 'kid') out.steerRate = KID_STEER_RATE;
  return out;
}

/** 1371fbac left-stick curve: dead zone 0.12, then (|v|−0.12)/0.88. */
export function oldAxis(raw) {
  const v = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
  return Math.abs(v) < 0.12 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.12)) / 0.88;
}

function rates(angle, cap) {
  return Math.min(cap, Math.abs(angle) / PHYS_DT);
}

/**
 * Settled stick → output for the known-good build. The right stick did not move the camera
 * (those samples are 0). Flight is the jet integrator's attitude rate for a stick of this
 * size (pitch 1.6, roll 2.8, yaw 0.7 rad/s at full throw).
 */
export function knownGoodResponse(stick, speed, {mode = 'kid'} = {}) {
  const a = Math.abs(oldAxis(stick)),
    steerAngle = a * steerLimit(speed, mode, BUGGY.maxSteer),
    board = vehicleParams('board'),
    skateSteer = a * steerLimit(speed, mode, board.maxSteer);
  return {
    steerAngle,
    steerRate: rates(steerAngle, BUGGY.steerRate),
    steerYawRate: (speed || 0) * Math.tan(steerAngle) / WHEELBASE,
    cameraYawRate: 0,
    cameraPitchRate: 0,
    robotMove: a * ROBOT.walk,
    robotYawRate: a * ROBOT.turn,
    skateMove: a * board.topSpeed,
    skateSteer,
    flightPitchRate: a * FLIGHT.pitchRate,
    flightRollRate: a * FLIGHT.rollRate,
    flightYawRate: a * FLIGHT.yawRate
  };
}

/** Settled stick → output for the feel the game applies. Smoothing is not in here: a
 *  single eased frame would hide a hot target, which is how the old tests stayed green. */
export function response(stick, speed, {sensitivity = 'low', mode = 'kid'} = {}) {
  const spec = SENSITIVITY[sensitivity] ?? SENSITIVITY.low,
    shaped = Math.abs(feelShape(stick, {expo: spec.expo})),
    look = Math.abs(feelShape(stick, {expo: spec.expo, gain: spec.camera})),
    steerAngle = shaped * steerLimit(speed, mode, BUGGY.maxSteer),
    board = vehicleParams('board'),
    skateSteer = shaped * steerLimit(speed, mode, board.maxSteer),
    scale = flightScales(),
    cap = mode === 'kid' ? KID_STEER_RATE : BUGGY.steerRate;
  return {
    steerAngle,
    steerRate: rates(steerAngle, cap),
    steerYawRate: (speed || 0) * Math.tan(steerAngle) / WHEELBASE,
    cameraYawRate: look * HEAD_CAMERA_YAW,
    cameraPitchRate: look * HEAD_CAMERA_PITCH,
    robotMove: shaped * ROBOT.walk,
    robotYawRate: shaped * ROBOT.turn,
    // The left stick is not the throttle on a board. RT is. Speed from this stick is 0.
    skateMove: 0,
    skateSteer,
    flightPitchRate: shaped * scale.pitch * FLIGHT.arcade.climb * FLIGHT.arcade.pitchRate,
    flightRollRate: shaped * scale.roll * FLIGHT.arcade.bank * FLIGHT.arcade.bankRate,
    flightYawRate: 0
  };
}

/**
 * Right-stick orbit. `axisX` / `axisY` are already shaped (−1..1, gain included).
 * The rate eases toward the target, so a thumb landing on the stick does not snap the view.
 * After about a second with the stick back in the dead zone the view returns behind the car.
 * On foot it stays where you leave it until recentre.
 */
export function stepLook(state, axisX = 0, axisY = 0, dt = PHYS_DT, {foot = false, recentre = false} = {}) {
  if (recentre) return {yaw: 0, pitch: 0, idle: 0, yawRate: 0, pitchRate: 0};
  const s = {
      yaw: state?.yaw || 0,
      pitch: state?.pitch || 0,
      idle: Number.isFinite(state?.idle) ? state.idle : 0,
      yawRate: state?.yawRate || 0,
      pitchRate: state?.pitchRate || 0
    },
    step = Math.max(0, dt),
    k = 1 - Math.exp(-step * LOOK_SMOOTH),
    held = Math.abs(axisX) > 0 || Math.abs(axisY) > 0;
  s.yawRate += (axisX * HEAD_CAMERA_YAW - s.yawRate) * k;
  s.pitchRate += (axisY * HEAD_CAMERA_PITCH - s.pitchRate) * k;
  if (held) {
    s.yaw += s.yawRate * step;
    s.pitch = Math.max(-0.35, Math.min(1.05, s.pitch - s.pitchRate * step));
    s.idle = foot ? 1e9 : RECENTRE_AFTER;
  } else if (!foot) {
    if (s.idle > 10) s.idle = RECENTRE_AFTER;
    s.idle -= step;
    if (s.idle <= 0) {
      const decay = Math.exp(-step * RECENTRE_RATE);
      s.yaw *= decay;
      s.pitch *= decay;
      s.yawRate *= Math.exp(-step * LOOK_SMOOTH);
      s.pitchRate *= Math.exp(-step * LOOK_SMOOTH);
    }
  }
  return s;
}
