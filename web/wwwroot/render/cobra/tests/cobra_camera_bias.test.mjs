import test from "node:test";
import assert from "node:assert/strict";
import {
  COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD,
  clampInducedLookRotation,
  nextHostileTargetId,
  resolveAuthorityLookAtPoint,
  togglePadlockSelection,
} from "../cobra_camera_bias.js";

test("soft cueing stays inside the windshield bias cap", () => {
  assert.equal(COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD, 0.05);
  const clamped = clampInducedLookRotation(
    { yawRad: 0, pitchRad: 0 },
    { yawRad: 0.4, pitchRad: -0.3 },
  );
  assert.ok(Math.abs(clamped.yawRad) <= COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD + 1e-9);
  assert.ok(Math.abs(clamped.pitchRad) <= COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD + 1e-9);
});

test("soft cueing takes the short yaw wrap across ±π", () => {
  const baseYaw = Math.PI - 0.01;
  const clamped = clampInducedLookRotation(
    { yawRad: baseYaw, pitchRad: 0 },
    { yawRad: -Math.PI + 0.2, pitchRad: 0 },
  );
  const applied = Math.atan2(
    Math.sin(clamped.yawRad - baseYaw),
    Math.cos(clamped.yawRad - baseYaw),
  );
  assert.ok(applied > 0, "short-way wrap must advance toward -π from +π");
  assert.ok(applied <= COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD + 1e-9);
});

test("soft cueing is a no-op when already on the desired look", () => {
  const clamped = clampInducedLookRotation(
    { yawRad: 0.1, pitchRad: -0.05 },
    { yawRad: 0.1, pitchRad: -0.05 },
  );
  assert.equal(clamped.yawRad, 0.1);
  assert.equal(clamped.pitchRad, -0.05);
});

test("Tab cycles hostiles like the F-22 gun-target list", () => {
  const ids = ["seam", "near", "far"];
  assert.equal(nextHostileTargetId(ids, null), "seam");
  assert.equal(nextHostileTargetId(ids, "seam"), "near");
  assert.equal(nextHostileTargetId(ids, "far"), "seam");
  assert.equal(nextHostileTargetId([], "seam"), null);
});

test("V toggles padlock view without inventing a target when the list is empty", () => {
  assert.deepEqual(
    togglePadlockSelection({ padlockActive: false, selectedTargetId: null, hostileTargetIds: [] }),
    { padlockActive: false, selectedTargetId: null },
  );
  assert.deepEqual(
    togglePadlockSelection({
      padlockActive: false,
      selectedTargetId: null,
      hostileTargetIds: ["seam", "near"],
    }),
    { padlockActive: true, selectedTargetId: "seam" },
  );
  assert.deepEqual(
    togglePadlockSelection({
      padlockActive: true,
      selectedTargetId: "near",
      hostileTargetIds: ["seam", "near"],
    }),
    { padlockActive: false, selectedTargetId: "near" },
  );
});

test("padlock look-at owns the eye; forward view stays nose-forward", () => {
  const forward = { x: 1, y: 2, z: 3 };
  const unit = { x_m: 100, y_m: 40, z_m: -50 };
  assert.deepEqual(
    resolveAuthorityLookAtPoint({ padlockActive: false, selectedUnit: unit, forwardLook: forward }),
    { x: 1, y: 2, z: 3, mode: "forward" },
  );
  assert.deepEqual(
    resolveAuthorityLookAtPoint({ padlockActive: true, selectedUnit: unit, forwardLook: forward }),
    { x: 100, y: 41.2, z: 50, mode: "padlock" },
  );
  assert.equal(
    resolveAuthorityLookAtPoint({ padlockActive: true, selectedUnit: null, forwardLook: forward }).mode,
    "forward",
  );
});
