import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLookDelta,
  trackpadLookDelta,
  wheelDeltaPixels,
} from "../look_gesture.js";

const DEG = Math.PI / 180;

test("wheel deltas normalize pixel, line, and page modes", () => {
  assert.deepEqual(wheelDeltaPixels({ deltaX: 3, deltaY: -4, deltaMode: 0 }), { x: 3, y: -4 });
  assert.deepEqual(wheelDeltaPixels({ deltaX: 3, deltaY: -4, deltaMode: 1 }), { x: 48, y: -64 });
  assert.deepEqual(wheelDeltaPixels({ deltaX: 0.5, deltaY: -0.25, deltaMode: 2 }, 600), {
    x: 300,
    y: -150,
  });
});

test("two-finger pan follows natural-scroll finger direction and caps batched events", () => {
  const leftAndUp = trackpadLookDelta({ deltaX: 20, deltaY: 15, deltaMode: 0 });
  assert.ok(leftAndUp.yawRad < 0);
  assert.ok(leftAndUp.pitchRad > 0);
  const batched = trackpadLookDelta({ deltaX: 100_000, deltaY: -100_000, deltaMode: 0 });
  assert.equal(batched.yawRad, -14 * DEG);
  assert.equal(batched.pitchRad, -14 * DEG);
});

test("look deltas retain state and respect gimbal limits", () => {
  assert.deepEqual(applyLookDelta(
    { yawRad: 160 * DEG, pitchRad: 85 * DEG },
    { yawRad: 20 * DEG, pitchRad: 20 * DEG },
  ), { yawRad: 165 * DEG, pitchRad: 88 * DEG });
});
