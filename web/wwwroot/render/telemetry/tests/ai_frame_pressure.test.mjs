import assert from "node:assert/strict";
import test from "node:test";
import {
  AdaptiveAiWorkBudget,
  AI_COMPUTE_LEVEL,
  AI_WORK_BUDGET_FRACTIONS,
} from "../ai_frame_pressure.js";

function observeFrames(policy, count, sample) {
  let result;
  for (let frame = 0; frame < count; frame += 1)
    result = policy.observe(sample);
  return result;
}

test("starts at SetAiComputeLevel-compatible zero for full work", () => {
  const policy = new AdaptiveAiWorkBudget();
  const state = policy.snapshot();

  assert.equal(state.computeLevel, AI_COMPUTE_LEVEL.FULL);
  assert.equal(state.workBudgetFraction, 1);
  assert.equal(Number.isInteger(state.computeLevel), true);
  assert.equal(Object.isFrozen(state), true);
  assert.deepEqual(AI_WORK_BUDGET_FRACTIONS, [1, 0.75, 0.55, 0.35]);
  assert.ok(Math.abs(state.targetFrameMs - (1000 / 60)) < 1e-9);
  assert.equal(state.simulationBudgetMs, 8);
});

test("sheds one level within two simulation-heavy late frames", () => {
  const policy = new AdaptiveAiWorkBudget();

  const first = policy.observe({ frameMs: 24, simMs: 9, executedTicks: 2 });
  const second = policy.observe({ frameMs: 24, simMs: 9, executedTicks: 2 });

  assert.equal(first.changed, false);
  assert.equal(second.changed, true);
  assert.equal(second.computeLevel, AI_COMPUTE_LEVEL.BALANCED);
  assert.equal(second.cause, "sustained-simulation-pressure");
});

test("a severe simulation spike drops two levels immediately", () => {
  const policy = new AdaptiveAiWorkBudget();
  const result = policy.observe({ frameMs: 38, simMs: 15, executedTicks: 2 });

  assert.equal(result.changed, true);
  assert.equal(result.computeLevel, AI_COMPUTE_LEVEL.CONSERVATIVE);
  assert.equal(result.cause, "severe-simulation-pressure");
});

test("sustained pressure reaches minimum quickly but honors a shed cooldown", () => {
  const policy = new AdaptiveAiWorkBudget({
    minimumFramesBetweenSheds: 6,
  });
  const sample = { frameMs: 25, simMs: 9, executedTicks: 2 };

  observeFrames(policy, 2, sample);
  assert.equal(policy.snapshot().computeLevel, AI_COMPUTE_LEVEL.BALANCED);
  observeFrames(policy, 5, sample);
  assert.equal(policy.snapshot().computeLevel, AI_COMPUTE_LEVEL.BALANCED);
  observeFrames(policy, 1, sample);
  assert.equal(policy.snapshot().computeLevel, AI_COMPUTE_LEVEL.CONSERVATIVE);
  observeFrames(policy, 6, sample);
  assert.equal(policy.snapshot().computeLevel, AI_COMPUTE_LEVEL.EMERGENCY);
});

test("render-only stalls are left to the scenery governor", () => {
  const policy = new AdaptiveAiWorkBudget();
  const result = observeFrames(policy, 120, {
    frameMs: 45,
    simMs: 2,
    executedTicks: 2,
  });

  assert.equal(result.computeLevel, AI_COMPUTE_LEVEL.FULL);
  assert.equal(result.changed, false);
  assert.equal(result.cause, "within-hysteresis-band");
});

test("catch-up tick count avoids double-shedding without hiding per-tick pressure", () => {
  const policy = new AdaptiveAiWorkBudget();

  const cheapCatchup = observeFrames(policy, 10, {
    frameMs: 18,
    simMs: 10,
    executedTicks: 10,
  });
  assert.equal(cheapCatchup.normalizedSimMs, 2);
  assert.equal(cheapCatchup.computeLevel, AI_COMPUTE_LEVEL.FULL);
  assert.equal(cheapCatchup.changed, false);
  assert.equal(cheapCatchup.cause, "healthy");

  const attributedStall = policy.observe({
    frameMs: 36,
    simMs: 20,
    executedTicks: 10,
  });
  assert.equal(attributedStall.normalizedSimMs, 4);
  assert.equal(attributedStall.changed, false);
  assert.equal(attributedStall.computeLevel, AI_COMPUTE_LEVEL.FULL);
  assert.equal(attributedStall.cause, "within-hysteresis-band");

  const expensivePerTick = policy.observe({
    frameMs: 36,
    simMs: 26,
    executedTicks: 4,
  });
  assert.equal(expensivePerTick.normalizedSimMs, 13);
  assert.equal(expensivePerTick.changed, true);
  assert.equal(expensivePerTick.computeLevel, AI_COMPUTE_LEVEL.CONSERVATIVE);
  assert.equal(expensivePerTick.cause, "severe-simulation-pressure");
});

test("recovers only after sustained headroom and one level at a time", () => {
  const policy = new AdaptiveAiWorkBudget({
    initialLevel: AI_COMPUTE_LEVEL.EMERGENCY,
    recoveryHeadroomMs: 1_000,
  });
  const healthy = { frameMs: 16.5, simMs: 3, executedTicks: 2 };

  let result = observeFrames(policy, 60, healthy);
  assert.equal(result.changed, false);
  assert.equal(result.computeLevel, AI_COMPUTE_LEVEL.EMERGENCY);
  result = policy.observe(healthy);
  assert.equal(result.changed, true);
  assert.equal(result.computeLevel, AI_COMPUTE_LEVEL.CONSERVATIVE);

  result = observeFrames(policy, 61, healthy);
  assert.equal(result.computeLevel, AI_COMPUTE_LEVEL.BALANCED);
  assert.equal(result.changed, true);
});

test("pressure and hysteresis-band samples reset partial recovery evidence", () => {
  const policy = new AdaptiveAiWorkBudget({
    initialLevel: AI_COMPUTE_LEVEL.BALANCED,
    recoveryHeadroomMs: 100,
  });
  const healthy = { frameMs: 16, simMs: 3, executedTicks: 2 };

  observeFrames(policy, 5, healthy);
  policy.observe({ frameMs: 20, simMs: 5.5, executedTicks: 2 });
  const afterInterruption = observeFrames(policy, 5, healthy);
  assert.equal(afterInterruption.computeLevel, AI_COMPUTE_LEVEL.BALANCED);
  const recovered = observeFrames(policy, 2, healthy);
  assert.equal(recovered.computeLevel, AI_COMPUTE_LEVEL.FULL);
});

test("idle clears partial evidence and invalid samples leave the earned level alone", () => {
  const policy = new AdaptiveAiWorkBudget({
    initialLevel: AI_COMPUTE_LEVEL.CONSERVATIVE,
    recoveryHeadroomMs: 50,
  });
  const healthy = { frameMs: 16, simMs: 2, executedTicks: 2 };

  observeFrames(policy, 3, healthy);
  assert.equal(policy.observe({ ...healthy, active: false }).computeLevel,
    AI_COMPUTE_LEVEL.CONSERVATIVE);
  assert.equal(policy.observe({ frameMs: Number.NaN, simMs: 2 }).computeLevel,
    AI_COMPUTE_LEVEL.CONSERVATIVE);
  assert.equal(policy.observe(healthy).changed, false,
    "idle discarded the partial recovery interval");
});

test("the same measurement tape always produces the same transitions", () => {
  const tape = [
    { frameMs: 16.7, simMs: 3.2, executedTicks: 2 },
    { frameMs: 25, simMs: 9.2, executedTicks: 2 },
    { frameMs: 24, simMs: 8.8, executedTicks: 2 },
    { frameMs: 18, simMs: 10, executedTicks: 10 },
    { frameMs: 40, simMs: 18, executedTicks: 4 },
    { frameMs: 16.4, simMs: 2.8, executedTicks: 2 },
  ];
  const replay = () => {
    const policy = new AdaptiveAiWorkBudget({ recoveryHeadroomMs: 50 });
    return tape.map((sample) => policy.observe(sample));
  };

  assert.deepEqual(replay(), replay());
});
