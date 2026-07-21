import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceForwardGimbal,
  advancePadlockGimbal,
  angleNearestReference,
  desiredPadlockAngles,
  PADLOCK_LIMITS,
  padlockOrientationModel,
  targetLookAngles,
} from "../padlock_controller.js";

const DEG = Math.PI / 180;
const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test("ownship-local cardinal target angles preserve render-frame signs", () => {
  close(targetLookAngles({ x: 0, y: 0, z: -1 }).yawRad, 0);
  close(targetLookAngles({ x: 1, y: 0, z: 0 }).yawRad, 90 * DEG);
  close(targetLookAngles({ x: -1, y: 0, z: 0 }).yawRad, -90 * DEG);
  close(targetLookAngles({ x: 0, y: 1, z: 0 }).pitchRad, 90 * DEG);
  close(targetLookAngles({ x: 0, y: -1, z: 0 }).pitchRad, -90 * DEG);
  const vertical = targetLookAngles({ x: 0, y: 1, z: 0 }, 47 * DEG);
  close(vertical.yawRad, 47 * DEG);
  assert.ok(Number.isFinite(vertical.pitchRad));
});

test("six-o'clock crossing stays on the same unwrapped canopy side", () => {
  const reference = 179 * DEG;
  const across = angleNearestReference(-179 * DEG, reference);
  close(across - reference, 2 * DEG, 1e-12);
  const target = targetLookAngles({
    x: Math.sin(-179 * DEG),
    y: 0,
    z: -Math.cos(-179 * DEG),
  }, reference);
  close(target.yawRad - reference, 2 * DEG, 1e-12);
});

test("padlock framing is FOV-aware on portrait, square, and ultrawide views", () => {
  for (const aspect of [0.56, 1, 2.16]) {
    const desired = desiredPadlockAngles({ yawRad: 165 * DEG, pitchRad: 85 * DEG }, { aspect });
    const yawResidual = 165 * DEG - desired.yawRad;
    const pitchResidual = 85 * DEG - desired.pitchRad;
    assert.ok(yawResidual <= desired.protectedYawOffsetRad + 1e-12);
    assert.ok(pitchResidual <= desired.protectedPitchOffsetRad + 1e-12);
    assert.ok(desired.yawRad <= PADLOCK_LIMITS.yawRad);
    assert.ok(desired.pitchRad <= PADLOCK_LIMITS.pitchRad);
  }
});

test("acquisition and return are angular-rate bounded across a render hitch", () => {
  const localTarget = { x: Math.sin(165 * DEG), y: 0, z: -Math.cos(165 * DEG) };
  const normal = advancePadlockGimbal({ localTarget, deltaSeconds: 1 / 60 });
  assert.ok(normal.yawRad <= PADLOCK_LIMITS.trackingYawRateRadPerSecond / 60 + 1e-12);

  const hitch = advancePadlockGimbal({ localTarget, deltaSeconds: 0.1 });
  assert.ok(hitch.yawRad <= PADLOCK_LIMITS.trackingYawRateRadPerSecond * 0.1 + 1e-12);

  const returned = advanceForwardGimbal({ yawRad: 120 * DEG, pitchRad: 40 * DEG, deltaSeconds: 0.1 });
  assert.ok(120 * DEG - returned.yawRad
    <= PADLOCK_LIMITS.returnYawRateRadPerSecond * 0.1 + 1e-12);
  assert.ok(returned.yawRad < 120 * DEG);
});

test("bounded tracking is effectively frame-rate independent", () => {
  const localTarget = { x: Math.sin(120 * DEG), y: Math.sin(25 * DEG), z: -Math.cos(120 * DEG) };
  const run = (hz) => {
    let yawRad = 0;
    let pitchRad = 0;
    for (let index = 0; index < hz * 2; index += 1) {
      ({ yawRad, pitchRad } = advancePadlockGimbal({
        localTarget,
        yawRad,
        pitchRad,
        deltaSeconds: 1 / hz,
      }));
    }
    return { yawRad, pitchRad };
  };
  const at30 = run(30);
  const at120 = run(120);
  close(at30.yawRad, at120.yawRad, 0.5 * DEG);
  close(at30.pitchRad, at120.pitchRad, 0.5 * DEG);
});

test("view-relative SA points to nose, lift and gravity without aft reversal", () => {
  const rightLook = padlockOrientationModel({
    noseCamera: { x: -1, y: 0, z: 0 },
    liftCamera: { x: 0, y: 1, z: 0 },
    worldUpCamera: { x: 0, y: 1, z: 0 },
    sensorYawRad: 90 * DEG,
  });
  assert.ok(rightLook.nose.x < -0.99, "looking right must put the ownship nose to the left");
  assert.ok(rightLook.lift.y < -0.99, "body-up must point up on screen");
  assert.equal(rightLook.liftValid, true);
  assert.ok(rightLook.horizon.x > 0.99, "level horizon must remain horizontal");

  const aft = padlockOrientationModel({
    noseCamera: { x: 0, y: 0, z: 1 },
    liftCamera: { x: 0, y: 1, z: 0 },
    worldUpCamera: { x: 0, y: 1, z: 0 },
    sensorYawRad: 165 * DEG,
  });
  assert.equal(aft.noseBehind, true);
  assert.ok(aft.nose.x < 0, "an aft look over the right shoulder keeps the nose on the left");

  const vertical = padlockOrientationModel({
    noseCamera: { x: 0, y: -1, z: 0 },
    liftCamera: { x: 0, y: 0, z: 1 },
    worldUpCamera: { x: 0, y: 0, z: 1 },
  });
  assert.equal(vertical.horizonValid, false, "undefined horizon projection must be hidden, not flipped");
  assert.equal(vertical.liftValid, false, "a lift vector along the view axis must not invent pull direction");
});
