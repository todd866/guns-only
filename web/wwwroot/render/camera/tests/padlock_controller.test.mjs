import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceForwardGimbal,
  advancePadlockGimbal,
  angleNearestReference,
  desiredPadlockAngles,
  PADLOCK_LIMITS,
  padlockLiftPlaneModel,
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

test("continued travel past six initiates a recoverable opposite-shoulder handoff", () => {
  const localAt = (yawDeg) => ({
    x: Math.sin(yawDeg * DEG),
    y: 0,
    z: -Math.cos(yawDeg * DEG),
  });
  const immediateCrossing = advancePadlockGimbal({
    localTarget: localAt(-179),
    yawRad: 165 * DEG,
    deltaSeconds: 1 / 60,
  });
  assert.ok(immediateCrossing.targetYawRad > 180 * DEG,
    "the first +/-180 crossing should preserve the current shoulder");
  assert.equal(immediateCrossing.shoulderHandoff, false);

  const continued = advancePadlockGimbal({
    localTarget: localAt(-150),
    yawRad: 165 * DEG,
    deltaSeconds: 1 / 60,
  });
  close(continued.targetYawRad, -150 * DEG, 1e-12);
  assert.equal(continued.shoulderHandoff, true,
    "once clamping pushes the target outside its protected residual, reacquire the other shoulder");
  assert.ok(continued.yawRad < 165 * DEG, "the gimbal must leave the stuck +165-degree stop");

  let yawRad = 165 * DEG;
  let pitchRad = 0;
  let result;
  for (let index = 0; index < 120; index += 1) {
    result = advancePadlockGimbal({
      localTarget: localAt(-140),
      yawRad,
      pitchRad,
      deltaSeconds: 1 / 60,
    });
    ({ yawRad, pitchRad } = result);
  }
  assert.ok(result.trackingErrorRad < 1 * DEG,
    "the handoff must settle on the opposite shoulder instead of remaining clamped");
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

test("padlock steering uses physical lift-plane geometry, not camera screen offset", () => {
  const targetRight = padlockLiftPlaneModel({ targetRight: 1, targetUp: 0 });
  assert.equal(targetRight.action, "ROLL");
  assert.equal(targetRight.direction, "RIGHT");
  close(targetRight.rollErrorRad, 90 * DEG);

  const targetLeft = padlockLiftPlaneModel({ targetRight: -1, targetUp: 0 });
  assert.equal(targetLeft.action, "ROLL");
  assert.equal(targetLeft.direction, "LEFT");
  close(targetLeft.rollErrorRad, -90 * DEG);

  const aligned = padlockLiftPlaneModel({
    targetRight: Math.sin(8 * DEG),
    targetUp: Math.cos(8 * DEG),
  });
  assert.equal(aligned.action, "PULL");
  assert.equal(aligned.direction, null);
  assert.equal(aligned.captured, true);

  assert.equal(padlockLiftPlaneModel({
    targetRight: 0, targetUp: 0, targetForward: 1,
  }).valid, false, "dead ahead needs no roll director");
  const deadSix = padlockLiftPlaneModel({
    targetRight: 0, targetUp: 0, targetForward: -1,
  });
  assert.equal(deadSix.valid, true);
  assert.equal(deadSix.captured, true);
  assert.equal(deadSix.anyPlane, true,
    "dead six has no unique roll plane, so retain the current plane and pull");
});

test("the indicated physical roll reduces error one-for-one in forward, aft, and inverted cases", () => {
  const cases = [
    { name: "forward-right-high", right: 0.72, up: 0.31 },
    { name: "aft-right-high", right: 0.31, up: 0.08 },
    { name: "aft-left-low", right: -0.44, up: -0.16 },
    { name: "inverted-right-low", right: 0.18, up: -0.52 },
  ];
  const perturbation = 2 * DEG;
  for (const sample of cases) {
    const current = padlockLiftPlaneModel({
      targetRight: sample.right,
      targetUp: sample.up,
    });
    const bankDelta = Math.sign(current.rollErrorRad) * perturbation;
    const cos = Math.cos(bankDelta);
    const sin = Math.sin(bankDelta);
    // Positive bank rotates body-up toward body-right. Re-express the fixed world target in the
    // newly rolled body axes, exactly as the live snapshot/camera path will on the next frame.
    const next = padlockLiftPlaneModel({
      targetRight: sample.right * cos - sample.up * sin,
      targetUp: sample.right * sin + sample.up * cos,
    });
    assert.ok(Math.abs(next.rollErrorRad) < Math.abs(current.rollErrorRad),
      `${sample.name}: indicated roll must close, not open, the lift-plane error`);
    close(Math.abs(current.rollErrorRad) - Math.abs(next.rollErrorRad), perturbation, 1e-12);
  }
});

test("lift-plane capture has separate enter and exit thresholds", () => {
  const at = (degrees, wasCaptured = false) => padlockLiftPlaneModel({
    targetRight: Math.sin(degrees * DEG),
    targetUp: Math.cos(degrees * DEG),
    wasCaptured,
  });
  assert.equal(at(10).captured, true, "enter inside eleven degrees");
  assert.equal(at(15).captured, false, "do not enter in the hysteresis band");
  assert.equal(at(15, true).captured, true, "retain capture through the hysteresis band");
  assert.equal(at(19, true).captured, false, "release beyond eighteen degrees");
});
