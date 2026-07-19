import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTexelStabilizedShadowFrame,
  shadowHalfExtentForMode,
} from "../shadow_stabilizer.js";

test("shadow focus snaps to the directional light texel lattice", () => {
  const frame = computeTexelStabilizedShadowFrame({
    focus: [10.31, 4.7, -9.77],
    direction: [0.3, -0.8, -0.4],
    halfExtent: 512,
    mapSize: 1024,
  });
  assert.equal(frame.worldUnitsPerTexel, 1);
  const x = frame.focus[0] * frame.right[0] + frame.focus[1] * frame.right[1] + frame.focus[2] * frame.right[2];
  const y = frame.focus[0] * frame.up[0] + frame.focus[1] * frame.up[1] + frame.focus[2] * frame.up[2];
  assert.ok(Math.abs(x - Math.round(x)) < 1e-9);
  assert.ok(Math.abs(y - Math.round(y)) < 1e-9);
});

test("mode extents prioritize carrier detail without exceeding profile distance", () => {
  assert.equal(shadowHalfExtentForMode(6000, "carrier"), 900);
  assert.equal(shadowHalfExtentForMode(6000, "combat"), 3000);
  assert.equal(shadowHalfExtentForMode(500, "carrier"), 500);
  assert.equal(shadowHalfExtentForMode(6000, "carrier", { carrier: 700 }), 700);
});
