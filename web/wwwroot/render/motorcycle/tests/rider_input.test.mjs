import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAxisDeadzone,
  dominantSignedAxis,
  gamepadRiderAxes,
} from "../rider_input.js";

test("gamepad axes are deadzoned and triggers remain progressive", () => {
  const gamepad = {
    axes: [0.5, 0, -0.4, 0.7],
    buttons: Array.from({ length: 8 }, () => ({ value: 0 })),
  };
  gamepad.buttons[6] = { value: 0.35 };
  gamepad.buttons[7] = { value: 0.8 };

  const input = gamepadRiderAxes(gamepad);

  assert.ok(input.turn > 0.4 && input.turn < 0.5);
  assert.ok(input.bodyLateral < -0.3 && input.bodyLateral > -0.4);
  assert.ok(input.bodyForeAft < -0.6 && input.bodyForeAft > -0.7);
  assert.equal(input.brake, 0.35);
  assert.equal(input.throttle, 0.8);
});

test("small stick noise is neutral and keyboard-scale input wins", () => {
  assert.equal(applyAxisDeadzone(0.08), 0);
  assert.equal(applyAxisDeadzone(-0.11), 0);
  assert.equal(dominantSignedAxis(-1, 0.7), -1);
  assert.equal(dominantSignedAxis(0, 0.7), 0.7);
});
