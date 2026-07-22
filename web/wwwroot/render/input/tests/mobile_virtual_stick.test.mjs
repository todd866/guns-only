import assert from "node:assert/strict";
import test from "node:test";

import { mobileVirtualStickState } from "../mobile_virtual_stick.js";

const BOUNDS = Object.freeze({ left: 20, top: 10, width: 120, height: 120 });

test("thumb stick projects centre, cardinal, and diagonal pointer positions", () => {
  assert.deepEqual(mobileVirtualStickState({ clientX: 80, clientY: 70 }, BOUNDS), {
    x: 0,
    y: 0,
    rollCode: null,
    pitchCode: null,
  });

  const right = mobileVirtualStickState({ clientX: 140, clientY: 70 }, BOUNDS);
  assert.equal(right.x, 1);
  assert.equal(right.y, 0);
  assert.equal(right.rollCode, "ArrowRight");
  assert.equal(right.pitchCode, null);

  const upperLeft = mobileVirtualStickState({ clientX: 0, clientY: -10 }, BOUNDS);
  assert.ok(Math.abs(Math.hypot(upperLeft.x, upperLeft.y) - 1) < 1e-9);
  assert.equal(upperLeft.rollCode, "ArrowLeft");
  assert.equal(upperLeft.pitchCode, "ArrowUp");
});

test("thumb stick direction hysteresis holds then releases near centre", () => {
  const held = mobileVirtualStickState({ clientX: 99.2, clientY: 70 }, BOUNDS, {
    rollCode: "ArrowRight",
    pitchCode: null,
  });
  assert.ok(held.x > 0.16 && held.x < 0.28);
  assert.equal(held.rollCode, "ArrowRight");

  const released = mobileVirtualStickState({ clientX: 92, clientY: 70 }, BOUNDS, held);
  assert.ok(released.x > 0 && released.x < 0.16);
  assert.equal(released.rollCode, null);
});

test("thumb stick has a radial neutral zone with continuous authority outside it", () => {
  const neutral = mobileVirtualStickState({ clientX: 86, clientY: 73 }, BOUNDS);
  assert.equal(neutral.x, 0);
  assert.equal(neutral.y, 0);

  const correction = mobileVirtualStickState({ clientX: 90, clientY: 70 }, BOUNDS);
  assert.ok(correction.x > 0 && correction.x < 0.1);
  assert.equal(correction.y, 0);
});

test("thumb stick fails neutral for invalid geometry and pointer data", () => {
  assert.deepEqual(mobileVirtualStickState({}, { width: 0, height: 0 }), {
    x: 0,
    y: 0,
    rollCode: null,
    pitchCode: null,
  });
  assert.deepEqual(mobileVirtualStickState({ clientX: NaN, clientY: Infinity }, BOUNDS), {
    x: 0,
    y: 0,
    rollCode: null,
    pitchCode: null,
  });
});
