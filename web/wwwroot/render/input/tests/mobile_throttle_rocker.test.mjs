import assert from "node:assert/strict";
import test from "node:test";

import { mobileThrottleRockerState } from "../mobile_throttle_rocker.js";

const BOUNDS = Object.freeze({ left: 20, top: 10, width: 52, height: 120 });

test("throttle rocker resolves centre, full power-up, and full power-down positions", () => {
  assert.deepEqual(mobileThrottleRockerState({ clientY: 70 }, BOUNDS), {
    power: 0,
    code: null,
  });
  assert.deepEqual(mobileThrottleRockerState({ clientY: 10 }, BOUNDS), {
    power: 1,
    code: "KeyW",
  });
  assert.deepEqual(mobileThrottleRockerState({ clientY: 130 }, BOUNDS), {
    power: -1,
    code: "KeyS",
  });
});

test("throttle rocker clamps travel beyond either end", () => {
  assert.deepEqual(mobileThrottleRockerState({ clientY: -500 }, BOUNDS), {
    power: 1,
    code: "KeyW",
  });
  assert.deepEqual(mobileThrottleRockerState({ clientY: 500 }, BOUNDS), {
    power: -1,
    code: "KeyS",
  });
});

test("throttle rocker has a continuous centre deadzone", () => {
  assert.deepEqual(mobileThrottleRockerState({ clientY: 76 }, BOUNDS), {
    power: 0,
    code: null,
  });
  const correction = mobileThrottleRockerState({ clientY: 78 }, BOUNDS);
  assert.ok(correction.power < 0 && correction.power > -0.03);
  assert.equal(correction.code, null);
});

test("throttle rocker direction hysteresis holds, releases, and permits direct reversal", () => {
  const held = mobileThrottleRockerState({ clientY: 51.18 }, BOUNDS, { code: "KeyW" });
  assert.ok(held.power > 0.16 && held.power < 0.28);
  assert.equal(held.code, "KeyW");

  const released = mobileThrottleRockerState({ clientY: 57.52 }, BOUNDS, held);
  assert.ok(released.power > 0 && released.power < 0.16);
  assert.equal(released.code, null);

  const reversed = mobileThrottleRockerState({ clientY: 100 }, BOUNDS, { code: "KeyW" });
  assert.equal(reversed.code, "KeyS");
});

test("throttle rocker fails neutral for invalid geometry and pointer data", () => {
  assert.deepEqual(mobileThrottleRockerState({}, { height: 0 }), {
    power: 0,
    code: null,
  });
  assert.deepEqual(mobileThrottleRockerState({ clientY: Infinity }, BOUNDS), {
    power: 0,
    code: null,
  });
});
