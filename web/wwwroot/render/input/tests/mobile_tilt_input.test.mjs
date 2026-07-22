import assert from "node:assert/strict";
import test from "node:test";

import { mobileRollCommand } from "../mobile_tilt_input.js";

test("phone roll has a real neutral zone and progressive authority", () => {
  assert.equal(mobileRollCommand(0), 0);
  assert.equal(mobileRollCommand(4), 0);
  assert.equal(mobileRollCommand(-4), 0);
  assert.ok(mobileRollCommand(10) > 0.08 && mobileRollCommand(10) < 0.09);
  assert.ok(mobileRollCommand(20) > 0.43 && mobileRollCommand(20) < 0.45);
  assert.equal(mobileRollCommand(30), 1);
  assert.equal(mobileRollCommand(45), 1);
  assert.equal(mobileRollCommand(-30), -1);
});

test("phone roll curve is odd, monotonic, and rejects invalid sensor data", () => {
  for (const angle of [5, 8, 12, 18, 24, 30]) {
    assert.equal(mobileRollCommand(-angle), -mobileRollCommand(angle));
  }
  assert.equal(mobileRollCommand(undefined), 0);
  assert.equal(mobileRollCommand(Number.NaN), 0);
});
