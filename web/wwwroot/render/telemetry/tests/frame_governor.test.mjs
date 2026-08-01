import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyFramePressure,
  formatFrameGovernorStatus,
  FrameGovernorPolicy,
  FRAME_GOVERNOR_ACTION,
  FRAME_PRESSURE_CLASS,
} from "../frame_governor.js";

function closeWindow(policy, nowMs, {
  frames = 60,
  lateFrames = 0,
  onTimeMs = 16.7,
  lateMs = 24,
  context,
} = {}) {
  let transition = null;
  for (let index = 0; index < frames; index += 1) {
    const delta = index < lateFrames ? lateMs : onTimeMs;
    const decision = context === undefined
      ? policy.observe(delta, nowMs - frames + index + 1)
      : policy.observe(delta, nowMs - frames + index + 1,
        typeof context === "function" ? context(index, delta) : context);
    transition = decision ?? transition;
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

test("a run of severe frames sheds immediately without waiting out the window", () => {
  const policy = new FrameGovernorPolicy({
    severeFrameMs: 28, severeFrameCount: 3, lateFrameMs: 18.5,
  });
  policy.idle(0);
  assert.equal(policy.observe(30, 10), null);
  assert.equal(policy.observe(30, 20), null);
  const transition = policy.observe(30, 30);
  assert.equal(transition.direction, "shed");
  assert.equal(transition.severe, true);
  assert.equal(policy.level, 1);
  // A non-severe frame breaks the run: two severe + one ordinary + two severe stays quiet.
  policy.reset(0);
  policy.observe(30, 10);
  policy.observe(30, 20);
  assert.equal(policy.observe(17, 30), null);
  policy.observe(30, 40);
  assert.equal(policy.observe(30, 50), null);
  assert.equal(policy.level, 0);
});

test("phase and load evidence classify the owner without guessing", () => {
  assert.equal(classifyFramePressure({ dominantPhase: "sim" }),
    FRAME_PRESSURE_CLASS.SIMULATION);
  assert.equal(classifyFramePressure({ terrainMs: 3.5 }),
    FRAME_PRESSURE_CLASS.TERRAIN);
  assert.equal(classifyFramePressure({ gpuMs: 14 }),
    FRAME_PRESSURE_CLASS.VIEW_GPU);
  assert.equal(classifyFramePressure({ phaseMs: { dom: 35 } }),
    FRAME_PRESSURE_CLASS.UNATTRIBUTED);

  // `view` owns the renderer call, but an active terrain build gives that high phase a more
  // specific owner than generic view/GPU pressure.
  assert.equal(classifyFramePressure({
    phaseMs: { sim: 2, view: 11 },
    terrain: { queuedBuilds: 2 },
  }), FRAME_PRESSURE_CLASS.TERRAIN);
});

test("simulation CPU stalls never spend a visual quality rung", () => {
  const policy = new FrameGovernorPolicy();
  policy.idle(0);

  const decision = closeWindow(policy, 1000, {
    lateFrames: 12,
    lateMs: 31,
    context: { phaseMs: { sim: 13, view: 2 } },
  });

  assert.deepEqual({
    direction: decision.direction,
    pressureClass: decision.pressureClass,
    action: decision.action,
    qualityAction: decision.qualityAction,
    previousLevel: decision.previousLevel,
    level: decision.level,
  }, {
    direction: "hold",
    pressureClass: FRAME_PRESSURE_CLASS.SIMULATION,
    action: FRAME_GOVERNOR_ACTION.REDUCE_SIMULATION_WORK,
    qualityAction: null,
    previousLevel: 0,
    level: 0,
  });
  assert.equal(policy.level, 0);
});

test("a dual simulation and view breach cannot spend visual quality", () => {
  const policy = new FrameGovernorPolicy();
  policy.idle(0);

  // View is further over its component budget, but pixels cannot buy back synchronous sim time.
  const decision = closeWindow(policy, 1000, {
    lateFrames: 12,
    context: { phaseMs: { sim: 20, view: 11 } },
  });

  assert.equal(decision.pressureClass, FRAME_PRESSURE_CLASS.SIMULATION);
  assert.equal(decision.action, FRAME_GOVERNOR_ACTION.REDUCE_SIMULATION_WORK);
  assert.equal(decision.direction, "hold");
  assert.equal(decision.qualityAction, null);
  assert.equal(policy.level, 0);
});

test("unattributed main-thread stalls measure rather than degrade the picture", () => {
  const policy = new FrameGovernorPolicy();
  policy.idle(0);

  const decision = closeWindow(policy, 1000, {
    lateFrames: 10,
    lateMs: 40,
    context: { phaseMs: { dom: 25, sim: 2, view: 2 } },
  });

  assert.equal(decision.direction, "hold");
  assert.equal(decision.pressureClass, FRAME_PRESSURE_CLASS.UNATTRIBUTED);
  assert.equal(decision.action, FRAME_GOVERNOR_ACTION.MEASURE);
  assert.equal(decision.qualityAction, null);
  assert.equal(policy.level, 0);
});

test("terrain pressure chooses only the terrain quality lane", () => {
  const policy = new FrameGovernorPolicy({ recoverCleanWindows: 2 });
  policy.idle(0);

  const shed = closeWindow(policy, 1000, {
    lateFrames: 6,
    context: {
      phaseMs: { sim: 2, view: 10 },
      terrain: { queuedBuilds: 3 },
    },
  });

  assert.equal(shed.direction, "shed");
  assert.equal(shed.pressureClass, FRAME_PRESSURE_CLASS.TERRAIN);
  assert.equal(shed.action, FRAME_GOVERNOR_ACTION.REDUCE_TERRAIN_WORK);
  assert.equal(shed.qualityAction, FRAME_GOVERNOR_ACTION.REDUCE_TERRAIN_WORK);
  assert.equal(policy.level, 1);

  assert.equal(closeWindow(policy, 2000, { context: {} }), null);
  const recover = closeWindow(policy, 3000, { context: {} });
  assert.equal(recover.direction, "recover");
  assert.equal(recover.pressureClass, FRAME_PRESSURE_CLASS.TERRAIN);
  assert.equal(recover.action, FRAME_GOVERNOR_ACTION.RESTORE_TERRAIN_WORK);
  assert.equal(policy.level, 0);
});

test("view or GPU pressure chooses only view quality", () => {
  const policy = new FrameGovernorPolicy();
  policy.idle(0);

  const decision = closeWindow(policy, 1000, {
    lateFrames: 5,
    context: { phaseMs: { sim: 3, view: 9 }, gpuMs: 14 },
  });

  assert.equal(decision.direction, "shed");
  assert.equal(decision.pressureClass, FRAME_PRESSURE_CLASS.VIEW_GPU);
  assert.equal(decision.action, FRAME_GOVERNOR_ACTION.REDUCE_VIEW_QUALITY);
  assert.equal(decision.qualityAction, FRAME_GOVERNOR_ACTION.REDUCE_VIEW_QUALITY);
  assert.equal(policy.level, 1);
});

test("severe simulation frames are redirected without a legacy visual shed", () => {
  const policy = new FrameGovernorPolicy({
    severeFrameMs: 28,
    severeFrameCount: 3,
  });
  policy.idle(0);
  const context = { simMs: 14, viewMs: 2 };

  assert.equal(policy.observe(31, 10, context), null);
  assert.equal(policy.observe(31, 20, context), null);
  const decision = policy.observe(31, 30, context);

  assert.equal(decision.severe, true);
  assert.equal(decision.direction, "hold");
  assert.equal(decision.pressureClass, FRAME_PRESSURE_CLASS.SIMULATION);
  assert.equal(decision.qualityAction, null);
  assert.equal(policy.level, 0);
});

test("legacy two-argument observation keeps the original shed transition shape", () => {
  const policy = new FrameGovernorPolicy();
  policy.idle(0);

  assert.deepEqual(closeWindow(policy, 1000, { lateFrames: 4 }), {
    direction: "shed",
    previousLevel: 0,
    level: 1,
    lateFraction: 4 / 60,
  });
});

test("an undefined optional context remains legacy-compatible", () => {
  const policy = new FrameGovernorPolicy();
  policy.idle(0);
  let decision = null;
  for (let index = 0; index < 60; index += 1) {
    decision = policy.observe(
      index < 4 ? 24 : 16.7,
      941 + index,
      undefined,
    ) ?? decision;
  }

  assert.deepEqual(decision, {
    direction: "shed",
    previousLevel: 0,
    level: 1,
    lateFraction: 4 / 60,
  });
});

test("context on clean frames cannot reclassify unattributed late frames", () => {
  const policy = new FrameGovernorPolicy();
  policy.idle(0);

  const decision = closeWindow(policy, 1000, {
    lateFrames: 4,
    context: (index) => index < 4 ? undefined : { phaseMs: { sim: 2, view: 2 } },
  });

  assert.equal(decision.direction, "shed");
  assert.equal(decision.pressureClass, undefined);
  assert.equal(policy.level, 1);
});

test("governor status says holding 60 only for an explicit passing contract", () => {
  assert.equal(formatFrameGovernorStatus("View distance 32 km", { contractPass: 1 }),
    "View distance 32 km · holding 60");
  assert.equal(formatFrameGovernorStatus("View distance 32 km · holding 60", {
    contractPass: 0,
  }), "View distance 32 km · 60 fps contract missed");
  assert.equal(formatFrameGovernorStatus("Shadows off · holding 60"),
    "Shadows off · 60 fps unverified");
  assert.equal(formatFrameGovernorStatus("Ambient detail reduced", { contractPass: "1" }),
    "Ambient detail reduced · 60 fps unverified");
});
