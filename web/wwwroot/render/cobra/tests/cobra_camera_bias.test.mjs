import test from "node:test";
import assert from "node:assert/strict";
import {
  COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD,
  clampInducedLookRotation,
  lookAnglesFromOffset,
  lookOffsetFromAngles,
} from "../cobra_camera_bias.js";

test("the induced look rotation is capped at ±0.05 rad", () => {
  assert.equal(COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD, 0.05);
  const clamped = clampInducedLookRotation(
    { yawRad: 0.2, pitchRad: 0.08 },
    { yawRad: 0.9, pitchRad: -0.4 },
  );
  assert.ok(Math.abs(clamped.yawRad - 0.25) < 1e-12);
  assert.ok(Math.abs(clamped.pitchRad - 0.03) < 1e-12);
});

test("a small cue inside the cap passes through unchanged", () => {
  const clamped = clampInducedLookRotation(
    { yawRad: -1.1, pitchRad: 0.08 },
    { yawRad: -1.08, pitchRad: 0.09 },
  );
  assert.ok(Math.abs(clamped.yawRad - -1.08) < 1e-12);
  assert.ok(Math.abs(clamped.pitchRad - 0.09) < 1e-12);
});

test("yaw clamping is wrap-aware across ±π", () => {
  const clamped = clampInducedLookRotation(
    { yawRad: 3.1, pitchRad: 0.0 },
    { yawRad: -3.1, pitchRad: 0.0 },
  );
  // The short way from 3.1 to -3.1 is +0.083 rad through the wrap; the cap holds it to +0.05.
  const expected = Math.atan2(Math.sin(3.15), Math.cos(3.15));
  assert.ok(Math.abs(clamped.yawRad - expected) < 1e-9, `got ${clamped.yawRad}`);
});

test("look angles and offsets round-trip in the scene frame (x east, z −north)", () => {
  const angles = lookAnglesFromOffset(30.0, 12.0, -50.0);
  const offset = lookOffsetFromAngles(angles.yawRad, angles.pitchRad, Math.hypot(30, 12, 50));
  assert.ok(Math.abs(offset.x - 30) < 1e-9);
  assert.ok(Math.abs(offset.y - 12) < 1e-9);
  assert.ok(Math.abs(offset.z - -50) < 1e-9);
});

test("yaw 0 looks toward −z with pitch rising on +y", () => {
  const level = lookOffsetFromAngles(0, 0, 100);
  assert.ok(Math.abs(level.x) < 1e-12 && Math.abs(level.y) < 1e-12);
  assert.ok(Math.abs(level.z - -100) < 1e-12);
  const up = lookAnglesFromOffset(0, 10, -100);
  assert.ok(up.pitchRad > 0);
});
