import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  applyCockpitMotionToCamera,
  cockpitMotionSample,
  createCockpitMotionState,
  resetCockpitMotionState,
  stepCockpitMotionState,
} from "../cockpit_head_motion.js";

function runSequence(reducedMotion = false) {
  const motion = createCockpitMotionState();
  for (let tick = 0; tick < 180; tick++) {
    const snapshot = {
      tick,
      t: tick / 60,
      g_actual: 4.2 + Math.sin(tick * 0.04),
      roll_rate_dps: 82 * Math.sin(tick * 0.03),
      pitch_rate_dps: 28,
      yaw_rate_dps: -13,
      buffet_pitch_deg: Math.sin(tick * 0.8) * 0.22,
      buffet_roll_deg: Math.sin(tick * 0.73) * 0.18,
      buffet_yaw_deg: Math.sin(tick * 0.67) * 0.12,
      in_close_burble: 0.45,
      rounds_fired: tick < 50 ? 20 : 20 + Math.floor((tick - 50) / 4),
      arrest_phase: tick < 130 ? "NONE" : "ARRESTED",
      wire: tick < 130 ? 0 : 3,
      arrest_decel_g: tick < 130 ? 0 : Math.max(0, 1.2 - (tick - 130) * 0.025),
    };
    stepCockpitMotionState(motion, snapshot, 1 / 60, { reducedMotion });
  }
  return cockpitMotionSample(motion);
}

test("cockpit motion is deterministic for an identical projected snapshot sequence", () => {
  assert.deepEqual(runSequence(), runSequence());
});

test("cockpit motion is bounded and never mutates gameplay snapshots", () => {
  const snapshot = Object.freeze({
    tick: 1,
    t: 2,
    g_actual: 100,
    roll_rate_dps: 5000,
    pitch_rate_dps: -5000,
    yaw_rate_dps: 5000,
    buffet_pitch_deg: 90,
    buffet_roll_deg: -90,
    buffet_yaw_deg: 90,
    in_close_burble: 8,
    rounds_fired: 400,
    arrest_phase: "ARRESTED",
    wire: 2,
    hard_trap: true,
    arrest_decel_g: 12,
  });
  const before = JSON.stringify(snapshot);
  const motion = createCockpitMotionState();
  resetCockpitMotionState(motion, { ...snapshot, tick: 0, arrest_phase: "NONE", wire: 0 });
  for (let index = 0; index < 240; index++) {
    stepCockpitMotionState(motion, snapshot, 1 / 30);
  }
  const sample = cockpitMotionSample(motion);
  assert.equal(JSON.stringify(snapshot), before);
  assert.ok(Math.abs(sample.translation.x) <= 0.018);
  assert.ok(Math.abs(sample.translation.y) <= 0.042);
  assert.ok(Math.abs(sample.translation.z) <= 0.052);
  assert.ok(Math.abs(sample.rotation.pitch) <= 1.45 * Math.PI / 180 + 1e-12);
  assert.ok(Math.abs(sample.rotation.yaw) <= 0.95 * Math.PI / 180 + 1e-12);
  assert.ok(Math.abs(sample.rotation.roll) <= 1.65 * Math.PI / 180 + 1e-12);
});

test("reduced-motion preference materially suppresses all camera displacement", () => {
  const normal = runSequence(false);
  const reduced = runSequence(true);
  for (const axis of ["x", "y", "z"]) {
    assert.ok(Math.abs(reduced.translation[axis]) <= Math.abs(normal.translation[axis]) * 0.14 + 1e-9);
  }
  for (const axis of ["pitch", "yaw", "roll"]) {
    assert.ok(Math.abs(reduced.rotation[axis]) <= Math.abs(normal.rotation[axis]) * 0.14 + 1e-9);
  }
});

test("shot and trap impulses edge-trigger once instead of accumulating on a repeated snapshot", () => {
  const motion = createCockpitMotionState();
  resetCockpitMotionState(motion, {
    tick: 10,
    rounds_fired: 5,
    arrest_phase: "NONE",
    wire: 0,
  });
  stepCockpitMotionState(motion, {
    tick: 11,
    t: 1,
    rounds_fired: 6,
    arrest_phase: "ARRESTED",
    wire: 3,
  }, 1 / 60);
  const firstRecoil = motion.recoilEnvelope;
  const firstTrap = motion.trapEnvelope;
  stepCockpitMotionState(motion, {
    tick: 11,
    t: 1,
    rounds_fired: 6,
    arrest_phase: "ARRESTED",
    wire: 3,
  }, 1 / 60);
  assert.ok(motion.recoilEnvelope < firstRecoil);
  assert.ok(motion.trapEnvelope < firstTrap);
});

test("Three adapter adds local motion to a base camera pose", () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(10, 20, 30);
  camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  applyCockpitMotionToCamera(THREE, camera, {
    translation: { x: 0, y: 0.01, z: -0.02 },
    rotation: { pitch: 0.01, yaw: 0, roll: 0 },
  });
  assert.ok(camera.position.distanceTo(new THREE.Vector3(9.98, 20.01, 30)) < 1e-10);
  assert.ok(Math.abs(camera.quaternion.length() - 1) < 1e-12);
});
