import assert from "node:assert/strict";
import test from "node:test";

import {
  gamepadLookDelta,
  radialStickAxes,
  standardGamepadState,
} from "../dual_stick_input.js";

function gamepad({ axes = [0, 0, 0, 0], buttons = {} } = {}) {
  return {
    connected: true,
    mapping: "standard",
    index: 2,
    axes,
    buttons: Array.from({ length: 8 }, (_, index) => ({
      pressed: buttons[index] === true,
      value: Number(buttons[index]) || 0,
    })),
  };
}

test("radial stick removes drift and preserves full circular authority", () => {
  assert.deepEqual(radialStickAxes(0.08, -0.06), { x: 0, y: 0 });
  const diagonal = radialStickAxes(1, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9);
  assert.ok(diagonal.x > 0 && diagonal.y > 0);
});

test("standard gamepad follows the two-stick phone control contract", () => {
  const state = standardGamepadState(gamepad({
    axes: [0.6, -0.8, -0.5, 0.25],
    buttons: { 0: true, 2: true, 5: true, 7: 0.7 },
  }));
  assert.equal(state.connected, true);
  assert.ok(state.roll > 0);
  assert.ok(state.pitch < 0);
  assert.ok(state.lookX < 0);
  assert.ok(state.lookY > 0);
  assert.equal(state.fire, true);
  assert.equal(state.limitOverride, true);
  assert.equal(state.padlockPressed, true);
  assert.equal(state.throttleUp, true);
  assert.equal(state.throttleDown, false);
  assert.equal(standardGamepadState(gamepad({ buttons: { 0: true } }), {
    padlock: true,
  }).padlockPressed, false);
});

test("gamepad look is a bounded frame-rate-independent rate command", () => {
  const delta = gamepadLookDelta({ lookX: 0.5, lookY: -1 }, 1);
  assert.equal(delta.yawRad, 0.1075);
  assert.equal(delta.pitchRad, 0.17);
});

test("missing and non-standard gamepads fail neutral", () => {
  assert.equal(standardGamepadState(null).connected, false);
  assert.equal(standardGamepadState({ connected: true, mapping: "", axes: [] }).connected, false);
});
