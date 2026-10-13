import assert from "node:assert/strict";
import test from "node:test";

import { gunImpactCueInput } from "../../../hud.js";

test("gimbal impact cue selects the authoritative intercept and mirrors sim Z", () => {
  const cue = gunImpactCueInput({
    gun_gimbal_cone_deg: 3,
    gun_gimbal_deg: 1.25,
    gun_impact_x: 550,
    gun_impact_y: 12,
    gun_impact_z: 80,
    gun_barrel_x: 0.02,
    gun_barrel_y: 0.01,
    gun_barrel_z: -0.999,
  });

  assert.deepEqual(cue.point, { x: 550, y: 12, z: -80 });
  assert.equal(cue.coneDeg, 3);
  assert.equal(cue.gimbalDeg, 1.25);
  assert.deepEqual(cue.barrel, { x: 0.02, y: 0.01, z: -0.999 });
});

test("impact cue stays absent without a configured gimbal or a complete intercept", () => {
  assert.equal(gunImpactCueInput({
    gun_gimbal_cone_deg: 0,
    gun_impact_x: 1,
    gun_impact_y: 2,
    gun_impact_z: 3,
  }), null);
  assert.equal(gunImpactCueInput({
    gun_gimbal_cone_deg: 1.5,
    gun_impact_x: 1,
    gun_impact_y: 2,
  }), null);
  assert.equal(gunImpactCueInput({
    gun_gimbal_cone_deg: "not-a-number",
    gun_impact_x: 1,
    gun_impact_y: 2,
    gun_impact_z: 3,
  }), null);
});


test("assist none retains the physical mounted-barrel impact without implying acquisition", () => {
  const cue = gunImpactCueInput({gun_gimbal_mounted: true, gun_gimbal_cone_deg: 0,
    gun_impact_x: 0, gun_impact_y: 3000, gun_impact_z: 550});
  assert.deepEqual(cue.point, {x: 0, y: 3000, z: -550});
  assert.equal(cue.coneDeg, 0);
});
