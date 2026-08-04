import test from "node:test";
import assert from "node:assert/strict";
import {
  COARSE_HOLD_RATE_PER_SECOND,
  FINE_HOLD_RATE_PER_SECOND,
  fineBlend,
  relativeThrottleHoldRatePerSecond,
  relativeThrottleUiHoldRatePerSecond,
} from "../throttle_rate_schedule.js";

test("low CAS and low lever are fully fine", () => {
  assert.equal(fineBlend(140, 0.08), 1);
  assert.ok(Math.abs(relativeThrottleHoldRatePerSecond(140, 0.08) - FINE_HOLD_RATE_PER_SECOND) < 1e-12);
});

test("combat CAS or high lever stays coarse", () => {
  assert.equal(fineBlend(320, 0.08), 0);
  assert.equal(fineBlend(140, 0.50), 0);
  assert.equal(relativeThrottleHoldRatePerSecond(320, 0.08), COARSE_HOLD_RATE_PER_SECOND);
  assert.equal(relativeThrottleHoldRatePerSecond(140, 0.50), COARSE_HOLD_RATE_PER_SECOND);
});

test("UI rate divides by lever stop", () => {
  const physical = relativeThrottleHoldRatePerSecond(140, 0.08);
  const ui = relativeThrottleUiHoldRatePerSecond(140, 0.08, 1.35);
  assert.ok(Math.abs(ui - physical / 1.35) < 1e-12);
});
