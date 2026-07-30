import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateForegroundFrameContract,
  FOREGROUND_FRAME_CONTRACT,
} from "../frame_contract.js";

test("foreground frame contract is the authored 60 fps delivery gate", () => {
  assert.deepEqual(FOREGROUND_FRAME_CONTRACT, {
    targetFps: 60,
    minimumFps: 59,
    budgetFrameMs: 18.5,
    maximumP95Ms: 18.5,
    maximumP99Ms: 22,
    maximumBudgetMissFraction: 0.03,
    backgroundStallMs: 250,
    labSampleCount: 600,
  });
  assert.equal(evaluateForegroundFrameContract({
    fps: 59,
    p95Ms: 18.5,
    p99Ms: 22,
    budgetMissFraction: 0.03,
  }), true);
  assert.equal(evaluateForegroundFrameContract({
    fps: 58.99,
    p95Ms: 18.5,
    p99Ms: 22,
    budgetMissFraction: 0.03,
  }), false);
});
