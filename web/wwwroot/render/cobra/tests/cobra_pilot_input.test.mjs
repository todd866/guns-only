import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COBRA_CONTROL_PROFILE,
  cobraKeyboardControlIntent,
  resolveCobraControlProfile,
} from "../cobra_control_profile.js";
import {
  advanceCobraPilotControls,
  cobraAnalogControlAxes,
  createCobraPilotControlState,
  releaseCobraPilotControls,
} from "../cobra_pilot_input.js";

const rates = Object.freeze({
  collectiveFullTravelPerSecond: 0.40,
  cyclicFullTravelPerSecond: 2.5,
  pedalFullTravelPerSecond: 2.5,
});

test("digital cyclic and pedals slew toward demand instead of slamming full deflection", () => {
  const held = cobraKeyboardControlIntent(new Set(["ArrowUp", "ArrowRight", "KeyD"]));
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: held,
    deltaSeconds: 0.1,
    ...rates,
  });

  assert.ok(after.forwardCyclic > 0 && after.forwardCyclic < 1);
  assert.ok(after.rightCyclic > 0 && after.rightCyclic < 1);
  assert.ok(after.yaw > 0 && after.yaw < 1);
  assert.ok(Math.abs(after.forwardCyclic - 0.25) < 1e-9);
});

test("released digital axes spring-center through the same rate limit", () => {
  let state = createCobraPilotControlState(0.5);
  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set(["ArrowUp"])),
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.equal(state.forwardCyclic, 1);

  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    deltaSeconds: 0.2,
    ...rates,
  });
  assert.ok(state.forwardCyclic > 0 && state.forwardCyclic < 1);
  assert.ok(Math.abs(state.forwardCyclic - 0.5) < 1e-9);
});

test("released cyclic holds the attitude it was released at instead of flying back to level", () => {
  // Rate-command dynamics latch attitude, so an idle axis needs an assist or the ship freezes
  // in the last tap's attitude. Builds to 265 flew it back to LEVEL, which fought a pilot
  // nosing over to accelerate. It must hold the released attitude instead: no command at all
  // while the ship sits where it was left.
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: -0.3, rollRad: 0 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.ok(Math.abs(after.holdPitchRad + 0.3) < 1e-9, "the release captures the attitude");
  assert.equal(after.forwardCyclic, 0, "a held attitude commands nothing");
});

test("a held attitude that drifts is flown back to the captured reference, not to level", () => {
  let state = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: -0.3, rollRad: 0 },
    deltaSeconds: 1.0,
    ...rates,
  });
  // The nose has crept up from the held 0.3 rad dive to 0.2: push it back down, not level.
  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: -0.2, rollRad: 0 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.ok(state.forwardCyclic > 0, "drifting above the held dive must command forward cyclic");
  // clamp(3.0 * ((-0.2) - (-0.3))) = +0.3, inside the 0.5 authority.
  assert.ok(Math.abs(state.forwardCyclic - 0.3) < 1e-9);
});

test("an attitude past the recoverable envelope holds at the envelope edge", () => {
  // What survives of the flew-into-the-ground rationale: the assist holds a deliberate
  // attitude but will not hold a departure.
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: -0.6, rollRad: 0 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.ok(Math.abs(after.holdPitchRad + 0.35) < 1e-9, "the reference clamps to the envelope");
  assert.ok(after.forwardCyclic < 0, "past the envelope it still recovers");
  // clamp(3.0 * ((-0.6) - (-0.35))) = -0.75, saturating at the -0.5 authority.
  assert.ok(Math.abs(after.forwardCyclic + 0.5) < 1e-9);
});

test("released roll holds its bank, and a bank past the envelope still rolls out", () => {
  const held = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: 0, rollRad: 0.5 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.ok(Math.abs(held.rightCyclic) < 1e-9, "a 0.5 rad bank is a deliberate turn and is held");

  const departed = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: 0, rollRad: 1.4 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.ok(departed.rightCyclic < 0, "a bank past the envelope commands left cyclic");
  assert.ok(Math.abs(departed.holdRollRad - 1.05) < 1e-9);
});

test("a held cyclic key overrides the assist and clears that axis's hold reference", () => {
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set(["ArrowUp"])),
    attitude: { pitchRad: -0.5, rollRad: -0.4 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.equal(after.forwardCyclic, 1, "held key wins its own axis outright");
  assert.equal(after.holdPitchRad, null, "the pilot has the axis, so there is no hold");
  assert.ok(
    Math.abs(after.rightCyclic) < 1e-9,
    "the idle roll axis holds its bank while pitch is flown",
  );
  assert.ok(Math.abs(after.holdRollRad + 0.4) < 1e-9);
});

test("an active analog axis overrides the leveling assist on that axis", () => {
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    analogAxes: cobraAnalogControlAxes({ forwardCyclic: 0.4, deadzone: 0 }),
    attitude: { pitchRad: -0.5, rollRad: 0 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.equal(after.forwardCyclic, 0.4);
});

test("level attitude and no demand still recentre the cyclic to neutral", () => {
  let state = createCobraPilotControlState(0.5);
  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set(["ArrowUp"])),
    deltaSeconds: 1.0,
    ...rates,
  });
  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: 0, rollRad: 0 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.equal(state.forwardCyclic, 0);
});

test("collective keeps the profile pull-positive lever and holds when keys release", () => {
  let state = createCobraPilotControlState(0.45);
  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set(["KeyW"])),
    deltaSeconds: 0.25,
    ...rates,
  });
  assert.ok(Math.abs(state.collective - 0.55) < 1e-9);

  const held = state.collective;
  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.equal(state.collective, held);
});

test("analog axes remain proportional position demands", () => {
  const axes = cobraAnalogControlAxes({
    forwardCyclic: 0.4,
    rightCyclic: -0.6,
    yaw: 0.2,
    collectiveRate: -0.5,
    deadzone: 0,
  });
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    analogAxes: axes,
    deltaSeconds: 0.05,
    ...rates,
  });

  assert.equal(after.forwardCyclic, 0.4);
  assert.equal(after.rightCyclic, -0.6);
  assert.equal(after.yaw, 0.2);
  assert.ok(Math.abs(after.collective - 0.49) < 1e-9);
});

test("gamepad axes apply a deadzone before becoming proportional demands", () => {
  const axes = cobraAnalogControlAxes({
    forwardCyclic: 0.4,
    rightCyclic: 0.05,
    yaw: -0.6,
  });
  assert.ok(Math.abs(axes.forwardCyclic - ((0.4 - 0.12) / 0.88)) < 1e-9);
  assert.equal(axes.rightCyclic, 0);
  assert.ok(axes.yaw < 0);
});

test("remapped bindings still drive the production pilot input seam", () => {
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
  const intent = cobraKeyboardControlIntent(new Set(["KeyI", "Numpad8", "KeyE"]), profile);
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: intent,
    deltaSeconds: 0.25,
    ...rates,
  });

  assert.ok(after.collective > 0.5);
  assert.ok(after.forwardCyclic > 0);
  assert.ok(after.yaw > 0);
  assert.equal(intent.fire, false);
  assert.equal(cobraKeyboardControlIntent(new Set(["Space"]), profile).fire, true);
  assert.equal(COBRA_CONTROL_PROFILE.commandFamily, "vertical-lift-pilot");
});

test("focus loss releases cyclic, pedals, and collective rate while keeping lever position", () => {
  let state = createCobraPilotControlState(0.62);
  state = {
    ...state,
    forwardCyclic: 0.8,
    rightCyclic: -0.4,
    yaw: 0.7,
  };

  const released = releaseCobraPilotControls(state);
  assert.equal(released.collective, 0.62);
  assert.equal(released.forwardCyclic, 0);
  assert.equal(released.rightCyclic, 0);
  assert.equal(released.yaw, 0);

  const ignoredHold = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set(["ArrowUp", "KeyW"])),
    deltaSeconds: 0.5,
    focused: false,
    ...rates,
  });
  assert.equal(ignoredHold.collective, 0.62);
  assert.equal(ignoredHold.forwardCyclic, 0);
  assert.equal(ignoredHold.rightCyclic, 0);
  assert.equal(ignoredHold.yaw, 0);
});

test("opposed digital inputs cancel before the slew integrator runs", () => {
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set(["ArrowUp", "ArrowDown", "KeyA", "KeyD"])),
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.equal(after.forwardCyclic, 0);
  assert.equal(after.yaw, 0);
});

test("Hold the Bridge consumes the production pilot input module", async () => {
  const main = await readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8");
  assert.match(main, /cobra_pilot_input\.js/);
  assert.match(main, /advanceCobraPilotControls/);
  assert.match(main, /releaseCobraPilotControls/);
  assert.match(main, /cobraKeyboardControlIntent/);
  assert.doesNotMatch(
    main,
    /keys\.has\("KeyS"\) \? 1 : keys\.has\("KeyW"\) \? -1/,
  );
  assert.doesNotMatch(
    main,
    /\(keys\.has\("ArrowUp"\) \? 1 : 0\) \+ \(keys\.has\("ArrowDown"\) \? -1 : 0\)/,
  );
});

test("Hold the Bridge feeds the hot-pose attitude into the leveling assist", async () => {
  const main = await readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8");
  assert.match(main, /attitude:\s*\S[\s\S]{0,160}?pitch_rad/);
  assert.match(main, /attitude:\s*\S[\s\S]{0,160}?roll_rad/);
});
