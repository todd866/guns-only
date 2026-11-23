import assert from "node:assert/strict";
import test from "node:test";

import {
  expoCurve,
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
    buttons: Array.from({ length: 16 }, (_, index) => ({
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

test("expoCurve softens small stick deflection while preserving endpoints", () => {
  assert.equal(expoCurve(0, 0.55), 0);
  assert.equal(expoCurve(1, 0.55), 1);
  assert.equal(expoCurve(-1, 0.55), -1);
  const midLinear = 0.5;
  assert.ok(expoCurve(midLinear, 0.55) < expoCurve(midLinear, 0.35));
  assert.ok(expoCurve(midLinear, 0.35) < midLinear);
});

test("standard gamepad follows the fleet flight layout: A guns, RT/LT throttle, B padlock", () => {
  const state = standardGamepadState(gamepad({
    axes: [0.6, -0.8, -0.5, 0.25],
    buttons: { 0: true, 1: true, 2: true, 7: 0.7 },
  }));
  assert.equal(state.connected, true);
  assert.ok(state.roll > 0);
  assert.ok(state.pitch < 0);
  assert.ok(state.lookX < 0);
  assert.ok(state.lookY > 0);
  assert.equal(state.fire, true, "A fires the guns");
  assert.equal(state.limitOverride, true);
  assert.equal(state.padlockPressed, true, "B toggles padlock");
  assert.equal(state.throttleUp, true, "RT is throttle up");
  assert.equal(state.throttleDown, false);
  assert.equal(standardGamepadState(gamepad({ buttons: { 6: 0.5 } })).throttleDown, true, "LT is throttle down");
  assert.equal(standardGamepadState(gamepad({ buttons: { 1: true } }), {
    padlock: true,
  }).padlockPressed, false);
});

test("standard gamepad supports rudder bumpers, Y wheel brakes, D-pad landing edges, and expo", () => {
  const linear = standardGamepadState(gamepad({ axes: [0.5, 0] }));
  const landing = standardGamepadState(gamepad({
    axes: [0.5, 0],
    buttons: { 3: true, 4: true, 11: true, 12: true, 13: true, 14: true, 15: true },
  }), {}, { expo: 0.55 });
  assert.ok(landing.roll < linear.roll, "landing expo softens small roll deflections");
  assert.equal(landing.yaw, -1, "LB commands left rudder");
  assert.equal(standardGamepadState(gamepad({ buttons: { 5: true } })).yaw, 1, "RB commands right rudder");
  assert.equal(standardGamepadState(gamepad({ buttons: { 4: true, 5: true } })).yaw, 0);
  assert.equal(landing.brakeHeld, true, "Y holds wheel brakes");
  assert.equal(landing.cameraTogglePressed, true, "R3 toggles camera on leading edge");
  assert.equal(landing.rtbPressed, true, "D-pad Up requests RTB on leading edge");
  assert.equal(landing.gearPressed, true, "D-pad Down toggles gear on leading edge");
  assert.equal(landing.flapsUpPressed, true, "D-pad Left steps flaps up");
  assert.equal(landing.flapsDownPressed, true, "D-pad Right steps flaps down");

  const held = standardGamepadState(gamepad({
    buttons: { 11: true, 12: true, 13: true, 14: true, 15: true },
  }), landing);
  assert.equal(held.cameraTogglePressed, false);
  assert.equal(held.rtbPressed, false);
  assert.equal(held.gearPressed, false);
  assert.equal(held.flapsUpPressed, false);
  assert.equal(held.flapsDownPressed, false);
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
