import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceLowSpeedLens,
  lowSpeedLensTarget,
  neutralLowSpeedLens,
} from "../low_speed_lens.js";

test("widens only the periphery at hover and smoothly narrows with speed", () => {
  const hover = lowSpeedLensTarget(0);
  const transition = lowSpeedLensTarget(13);
  const cruise = lowSpeedLensTarget(24);

  assert.deepEqual(hover, {
    fovDeg: 78,
    edgeWrap01: 0.08,
    opticalCenterX01: 0,
    opticalCenterY01: 0,
  });
  assert.ok(transition.fovDeg < hover.fovDeg);
  assert.ok(transition.fovDeg > cruise.fovDeg);
  assert.ok(transition.edgeWrap01 < hover.edgeWrap01);
  assert.ok(transition.edgeWrap01 > cruise.edgeWrap01);
  assert.deepEqual(cruise, neutralLowSpeedLens());
});

test("clamps malformed configuration and never exposes an obvious warp", () => {
  const target = lowSpeedLensTarget(-999, {
    cruiseFovDeg: -20,
    wideFovDeg: 900,
    wideThroughSpeedMps: -4,
    cruiseSpeedMps: 900,
    maxEdgeWrap01: 4,
  });

  assert.equal(target.fovDeg, 96);
  assert.equal(target.edgeWrap01, 0.12);
  assert.equal(target.opticalCenterX01, 0);
  assert.equal(target.opticalCenterY01, 0);
  assert.deepEqual(lowSpeedLensTarget(Number.NaN), neutralLowSpeedLens());
  assert.deepEqual(lowSpeedLensTarget(null), neutralLowSpeedLens());
});

test("uses frame-rate-independent easing without moving the optical center", () => {
  const target = lowSpeedLensTarget(0);
  const start = neutralLowSpeedLens();
  const oneStep = advanceLowSpeedLens(start, target, 0.1);
  let tenSteps = start;
  for (let index = 0; index < 10; index += 1) {
    tenSteps = advanceLowSpeedLens(tenSteps, target, 0.01);
  }

  assert.ok(Math.abs(oneStep.fovDeg - tenSteps.fovDeg) < 1e-12);
  assert.ok(Math.abs(oneStep.edgeWrap01 - tenSteps.edgeWrap01) < 1e-12);
  assert.equal(oneStep.opticalCenterX01, 0);
  assert.equal(oneStep.opticalCenterY01, 0);
});

test("holds a settled lens perfectly stable and bounds long or broken frames", () => {
  const target = lowSpeedLensTarget(1);
  assert.deepEqual(advanceLowSpeedLens(target, target, 1), target);
  assert.deepEqual(
    advanceLowSpeedLens(target, target, Number.NaN),
    target,
  );

  const broken = advanceLowSpeedLens(
    { fovDeg: -200, edgeWrap01: 9 },
    { fovDeg: 400, edgeWrap01: 9 },
    20,
  );
  assert.ok(broken.fovDeg >= 48 && broken.fovDeg <= 78);
  assert.ok(broken.edgeWrap01 >= 0 && broken.edgeWrap01 <= 0.08);
  assert.equal(broken.opticalCenterX01, 0);
  assert.equal(broken.opticalCenterY01, 0);
});
