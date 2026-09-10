import test from "node:test";
import assert from "node:assert/strict";
import { createOkanaganKeyboardControls } from "../okanagan_keyboard_controls.js";

test("a real tap between frames retains each axis sign and measured duration", () => {
  for (const [code, axis, direction] of [
    ["ArrowDown", 0, 1], ["ArrowUp", 0, -1], ["ArrowRight", 1, 1],
    ["ArrowLeft", 1, -1], ["KeyD", 2, 1], ["KeyA", 2, -1],
  ]) {
    const controls = createOkanaganKeyboardControls();
    controls.down(code, 100);
    assert.deepEqual(controls.up(code, 175), { axis, direction, durationSeconds: 0.075 });
    assert.equal(controls.up(code, 180), null, "duplicate release cannot replay input");
  }
});

test("rendering without an authority tick does not count as sampling a held press", () => {
  const controls = createOkanaganKeyboardControls();
  controls.down("ArrowDown", 100);
  controls.applied(0);
  assert.equal(controls.up("ArrowDown", 110).durationSeconds, 0.01);
});

test("a sampled hold and keyboard repeat never produce a second delayed control", () => {
  const controls = createOkanaganKeyboardControls();
  controls.down("ArrowRight", 100);
  controls.applied(1);
  controls.down("ArrowRight", 140);
  assert.equal(controls.up("ArrowRight", 175), null);
  controls.down("ArrowRight", 180);
  controls.down("ArrowRight", 195);
  assert.equal(controls.up("ArrowRight", 200).durationSeconds, 0.02,
    "repeat does not replace the original physical press time");
});

test("blur/pause/restart clear cannot create a pulse from a later keyup", () => {
  const controls = createOkanaganKeyboardControls();
  controls.down("KeyD", 0);
  controls.clear();
  assert.equal(controls.up("KeyD", 90), null);
  controls.down("KeyW", 100);
  assert.equal(controls.up("KeyW", 150), null, "throttle is not a flight-axis pulse");
});

test("a stalled render cannot turn an unsampled key into a long delayed command", () => {
  const controls = createOkanaganKeyboardControls();
  controls.down("ArrowDown", 0);
  assert.equal(controls.up("ArrowDown", 5000).durationSeconds, 0.1);
});
