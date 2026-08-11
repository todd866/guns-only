import test from "node:test";
import assert from "node:assert/strict";

import {
  COBRA_CONTROL_PROFILE,
  advanceCobraCollectiveLever,
  cobraKeyboardControlIntent,
  resolveCobraControlProfile,
} from "../cobra_control_profile.js";

test("Cobra profile truthfully declares the authentic no-assistance path", () => {
  assert.equal(COBRA_CONTROL_PROFILE.assistance, "none");
  assert.equal(resolveCobraControlProfile().assistance, "none");
});

test("Cobra collective follows the game convention: W raises, S lowers", () => {
  assert.deepEqual(COBRA_CONTROL_PROFILE.collective, {
    pull: Object.freeze({ code: "KeyW", direction: 1, motion: "toward-pilot" }),
    push: Object.freeze({ code: "KeyS", direction: -1, motion: "away-from-pilot" }),
  });

  assert.equal(
    cobraKeyboardControlIntent(new Set(["KeyW"])).collectiveRate,
    1,
    "holding W must pull the lever and increase collective",
  );
  assert.equal(
    cobraKeyboardControlIntent(new Set(["KeyS"])).collectiveRate,
    -1,
    "holding S must push the lever and decrease collective",
  );
  assert.equal(
    cobraKeyboardControlIntent(new Set(["KeyS", "KeyW"])).collectiveRate,
    0,
    "opposed collective inputs must cancel instead of choosing a hidden winner",
  );
});

test("Cobra keeps the shared cyclic and pedal scheme without hidden assistance", () => {
  assert.deepEqual(
    cobraKeyboardControlIntent(new Set(["ArrowUp", "ArrowRight", "KeyD"])),
    {
      collectiveRate: 0,
      forwardCyclic: 1,
      rightCyclic: 1,
      yaw: 1,
      fire: false,
    },
  );
  assert.deepEqual(
    cobraKeyboardControlIntent(new Set(["ArrowDown", "ArrowLeft", "KeyA", "KeyF"])),
    {
      collectiveRate: 0,
      forwardCyclic: -1,
      rightCyclic: -1,
      yaw: -1,
      fire: true,
    },
  );
});

test("Cobra follows remapped player bindings while retaining pull-positive sense", () => {
  const profile = resolveCobraControlProfile({
    pull: "Numpad2",
    push: "Numpad8",
    rollLeft: "Numpad4",
    rollRight: "Numpad6",
    rudderLeft: "KeyQ",
    rudderRight: "KeyE",
    powerUp: "KeyI",
    powerDown: "KeyK",
    fire: "Space",
  });

  assert.equal(profile.collective.pull.code, "KeyI");
  assert.equal(profile.collective.push.code, "KeyK");
  assert.equal(
    cobraKeyboardControlIntent(new Set(["KeyI"]), profile).collectiveRate,
    1,
  );
  assert.equal(
    cobraKeyboardControlIntent(new Set(["KeyK"]), profile).collectiveRate,
    -1,
  );
  assert.equal(
    cobraKeyboardControlIntent(new Set(["Numpad2"]), profile).forwardCyclic,
    -1,
  );
  assert.equal(cobraKeyboardControlIntent(new Set(["Space"]), profile).fire, true);
});

test("held collective intent moves a persistent lever without commanding altitude", () => {
  const pull = cobraKeyboardControlIntent(new Set(["KeyW"]));
  const released = cobraKeyboardControlIntent(new Set());
  const push = cobraKeyboardControlIntent(new Set(["KeyS"]));

  const afterFirstPull = advanceCobraCollectiveLever(0.45, pull, 0.25, 0.40);
  const afterSecondPull = advanceCobraCollectiveLever(afterFirstPull, pull, 0.25, 0.40);
  const afterRelease = advanceCobraCollectiveLever(afterSecondPull, released, 1.0, 0.40);
  const afterPush = advanceCobraCollectiveLever(afterRelease, push, 0.25, 0.40);

  assert.equal(afterFirstPull, 0.55);
  assert.equal(afterSecondPull, 0.65);
  assert.equal(afterRelease, afterSecondPull, "releasing the key must leave the lever where set");
  assert.equal(afterPush, 0.55);
  assert.deepEqual(Object.keys(pull).sort(), [
    "collectiveRate",
    "fire",
    "forwardCyclic",
    "rightCyclic",
    "yaw",
  ]);
});

test("collective lever integration validates its explicit host rigging", () => {
  const pull = cobraKeyboardControlIntent(new Set(["KeyW"]));
  assert.equal(advanceCobraCollectiveLever(0.98, pull, 1.0, 0.40), 1.0);
  assert.throws(
    () => advanceCobraCollectiveLever(0.5, pull, 0.1, Number.NaN),
    /fullTravelPerSecond/,
  );
  assert.throws(
    () => advanceCobraCollectiveLever(0.5, { collectiveRate: 2 }, 0.1, 0.4),
    /collectiveRate/,
  );
});

test("Cobra control profiles are immutable release contracts", () => {
  const resolved = resolveCobraControlProfile();
  assert.equal(Object.isFrozen(COBRA_CONTROL_PROFILE), true);
  assert.equal(Object.isFrozen(COBRA_CONTROL_PROFILE.collective), true);
  assert.equal(Object.isFrozen(COBRA_CONTROL_PROFILE.collective.pull), true);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.collective), true);
});
