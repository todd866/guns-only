import assert from "node:assert/strict";
import test from "node:test";

import { FrameGovernorPolicy } from "../frame_governor.js";

function closeWindow(policy, nowMs, {
  frames = 60,
  lateFrames = 0,
  onTimeMs = 16.7,
  lateMs = 24,
} = {}) {
  let transition = null;
  for (let index = 0; index < frames; index += 1) {
    const delta = index < lateFrames ? lateMs : onTimeMs;
    transition = policy.observe(delta, nowMs - frames + index + 1) ?? transition;
  }
  return transition;
}

test("late windows shed one rung at a time", () => {
  const policy = new FrameGovernorPolicy();
  policy.idle(0);

  const first = closeWindow(policy, 1000, { lateFrames: 4 });
  const second = closeWindow(policy, 2000, { lateFrames: 4 });

  assert.deepEqual(
    [first.direction, first.previousLevel, first.level],
    ["shed", 0, 1],
  );
  assert.deepEqual(
    [second.direction, second.previousLevel, second.level],
    ["shed", 1, 2],
  );
});

test("recovery needs sustained clean windows and restores only one rung", () => {
  const policy = new FrameGovernorPolicy({ recoverCleanWindows: 3 });
  policy.idle(0);
  closeWindow(policy, 1000, { lateFrames: 4 });
  closeWindow(policy, 2000, { lateFrames: 4 });
  assert.equal(policy.level, 2);

  assert.equal(closeWindow(policy, 3000), null);
  assert.equal(closeWindow(policy, 4000), null);
  const recovered = closeWindow(policy, 5000);

  assert.deepEqual(
    [recovered.direction, recovered.previousLevel, recovered.level],
    ["recover", 2, 1],
  );
  assert.equal(policy.level, 1);
});

test("a marginal or late window resets recovery hysteresis", () => {
  const policy = new FrameGovernorPolicy({ recoverCleanWindows: 3 });
  policy.idle(0);
  closeWindow(policy, 1000, { lateFrames: 4 });
  closeWindow(policy, 2000);
  closeWindow(policy, 3000, { lateFrames: 2 });
  closeWindow(policy, 4000);
  closeWindow(policy, 5000);

  assert.equal(policy.level, 1);
  assert.equal(closeWindow(policy, 6000).direction, "recover");
});

test("idle and reset discard partial windows without inventing quality", () => {
  const policy = new FrameGovernorPolicy({ recoverCleanWindows: 2 });
  policy.idle(0);
  closeWindow(policy, 1000, { lateFrames: 4 });
  closeWindow(policy, 2000);
  policy.idle(2500);
  assert.equal(closeWindow(policy, 3500), null);
  assert.equal(closeWindow(policy, 4500).direction, "recover");

  policy.reset();
  assert.equal(policy.level, 0);
  assert.equal(policy.cleanWindows, 0);
});
