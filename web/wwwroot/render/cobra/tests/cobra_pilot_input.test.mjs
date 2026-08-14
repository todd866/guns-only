import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COBRA_CONTROL_PROFILE,
  cobraKeyboardControlIntent,
  resolveCobraControlProfile,
} from "../cobra_control_profile.js";
import {
  COBRA_GROUNDED_COLLECTIVE,
  advanceCobraPilotControls,
  cobraCyclicCommand,
  cobraAnalogControlAxes,
  createCobraGroundedPilotControlState,
  createCobraPilotControlState,
  releaseCobraPilotControls,
} from "../cobra_pilot_input.js";

const rates = Object.freeze({
  collectiveFullTravelPerSecond: 0.40,
  cyclicFullTravelPerSecond: 2.5,
  pedalFullTravelPerSecond: 2.5,
});

test("fresh play controls stay full down until deliberate collective-up input", () => {
  let state = createCobraGroundedPilotControlState();
  assert.equal(COBRA_GROUNDED_COLLECTIVE, 0);
  assert.equal(state.collective, 0);
  assert.equal(createCobraPilotControlState().collective, 0,
    "missing-state fallback must be grounded, never a hidden half lever");
  assert.equal(releaseCobraPilotControls(undefined).collective, 0);

  // Cyclic, pedal, fire and neutral time may start other cockpit activity, but cannot pull the
  // persistent lever. Model two minutes of frames to pin the indefinite grounded contract.
  const nonLiftIntents = [
    cobraKeyboardControlIntent(new Set()),
    cobraKeyboardControlIntent(new Set(["ArrowUp"])),
    cobraKeyboardControlIntent(new Set(["KeyD"])),
    cobraKeyboardControlIntent(new Set(["KeyF"])),
  ];
  for (let frame = 0; frame < 1_200; frame += 1) {
    state = advanceCobraPilotControls(state, {
      keyboardIntent: nonLiftIntents[frame % nonLiftIntents.length],
      deltaSeconds: 0.1,
      ...rates,
    });
    assert.equal(state.collective, 0);
  }

  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set(["KeyW"])),
    deltaSeconds: 0.1,
    ...rates,
  });
  assert.ok(state.collective > 0,
    "the first deliberate collective-up frame must move the lever off its down stop");
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
    attitude: { pitchRad: 1.2, rollRad: -1.2 },
    deltaSeconds: 0.2,
    ...rates,
  });
  assert.ok(state.forwardCyclic > 0 && state.forwardCyclic < 1);
  assert.ok(Math.abs(state.forwardCyclic - 0.5) < 1e-9);
  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: -1.2, rollRad: 1.2 },
    deltaSeconds: 0.2,
    ...rates,
  });
  assert.equal(state.forwardCyclic, 0, "attitude drift cannot change the spring-centre target");
});

test("authentic neutral emits zero cyclic through attitude drift", () => {
  let state = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: -0.6, rollRad: 0.8 },
    deltaSeconds: 0.1,
    ...rates,
  });
  assert.equal(state.forwardCyclic, 0);
  assert.equal(state.rightCyclic, 0);

  state = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    attitude: { pitchRad: 0.9, rollRad: -1.1 },
    deltaSeconds: 0.1,
    ...rates,
  });
  assert.equal(state.forwardCyclic, 0, "pitch drift must not manufacture cyclic");
  assert.equal(state.rightCyclic, 0, "roll drift must not manufacture cyclic");
  assert.equal(Object.hasOwn(state, "holdPitchRad"), false, "no attitude is captured in state");
  assert.equal(Object.hasOwn(state, "holdRollRad"), false, "no attitude is captured in state");
});

test("authentic cyclic demand is not attenuated by aircraft attitude", () => {
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set(["ArrowUp", "ArrowLeft"])),
    attitude: { pitchRad: -0.9, rollRad: 1.1 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.equal(after.forwardCyclic, 1);
  assert.equal(after.rightCyclic, -1);
});

test("an active analog axis remains a direct proportional demand regardless of attitude", () => {
  const after = advanceCobraPilotControls(createCobraPilotControlState(0.5), {
    keyboardIntent: cobraKeyboardControlIntent(new Set()),
    analogAxes: cobraAnalogControlAxes({ forwardCyclic: 0.4, deadzone: 0 }),
    attitude: { pitchRad: -0.5, rollRad: 0 },
    deltaSeconds: 1.0,
    ...rates,
  });
  assert.equal(after.forwardCyclic, 0.4);
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

  const ignoredWhileBlurred = advanceCobraPilotControls(state, {
    keyboardIntent: cobraKeyboardControlIntent(new Set(["ArrowUp", "KeyW"])),
    deltaSeconds: 0.5,
    focused: false,
    ...rates,
  });
  assert.equal(ignoredWhileBlurred.collective, 0.62);
  assert.equal(ignoredWhileBlurred.forwardCyclic, 0);
  assert.equal(ignoredWhileBlurred.rightCyclic, 0);
  assert.equal(ignoredWhileBlurred.yaw, 0);
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

test("cyclic expo softens the hover band without costing authority", () => {
  // Full deflection must still command full authority: expo may not take anything away from
  // the aircraft, only redistribute resolution.
  assert.equal(cobraCyclicCommand(1), 1);
  assert.equal(cobraCyclicCommand(-1), -1);
  assert.equal(cobraCyclicCommand(0), 0);

  // The hover band is where the complaint lives. A fifth of stick must command markedly less
  // than a fifth of authority, or the curve is not doing its job.
  const smallStick = cobraCyclicCommand(0.2);
  assert.ok(smallStick < 0.2 * 0.5,
    `0.2 stick must command well under half its linear value, got ${smallStick}`);
  assert.ok(smallStick > 0, "sign and non-zero response must survive the curve");

  // Monotonic and odd: no dead spot, no reversal, and left mirrors right exactly.
  let previous = -Infinity;
  for (let stick = -1; stick <= 1.0001; stick += 0.05) {
    const command = cobraCyclicCommand(stick);
    assert.ok(command > previous, `command must rise with stick at ${stick}`);
    assert.ok(Math.abs(command) <= Math.abs(stick) + 1e-9, "expo must never amplify");
    assert.ok(Math.abs(command + cobraCyclicCommand(-stick)) < 1e-9, "curve must be odd");
    previous = command;
  }

  // Expo 0 is the pre-change linear behaviour: this is the control that proves the curve, and
  // not some other edit, is what changed the feel.
  assert.ok(Math.abs(cobraCyclicCommand(0.2, 0) - 0.2) < 1e-9);
});
