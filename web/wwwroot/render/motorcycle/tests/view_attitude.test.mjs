import assert from "node:assert/strict";
import test from "node:test";

import { viewPitchRad } from "../view_attitude.js";

test("sim-authored pitch passes through to the helmet view", () => {
  assert.equal(viewPitchRad({ pitch_rad: 0.42 }), 0.42);
  assert.equal(viewPitchRad({ pitch_rad: -0.17 }), -0.17);
  assert.equal(viewPitchRad({ pitch_rad: 0 }), 0);
});

test("a bridge without pitch_rad reads as level, never NaN", () => {
  assert.equal(viewPitchRad({}), 0);
  assert.equal(viewPitchRad(undefined), 0);
  assert.equal(viewPitchRad(null), 0);
  assert.equal(viewPitchRad({ pitch_rad: undefined }), 0);
  assert.equal(viewPitchRad({ pitch_rad: Number.NaN }), 0);
  assert.equal(viewPitchRad({ pitch_rad: Infinity }), 0);
});
