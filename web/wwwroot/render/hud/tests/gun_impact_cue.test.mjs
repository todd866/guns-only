import assert from "node:assert/strict";
import test from "node:test";

import { createHud, gunImpactCueInput } from "../../../hud.js";

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

for (const cone of [0, 6, 12]) {
  test(`mounted gun at ${cone} degrees never announces SHOOT while inhibited`, () => {
    const words = [];
    const ctx = { save() {}, restore() {}, strokeText() {},
      fillText(text) { words.push(text); } };
    const canvas = { getContext: () => ctx };
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => canvas };
    try {
      const hud = createHud(canvas);
      hud.width = 1280; hud.height = 720;
      const state = { opponent_alive: true, gun_solution: true,
        gun_gimbal_mounted: true, gun_gimbal_cone_deg: cone,
        gun_gimbal_tracking: true, gun_fire_inhibited: false };
      const frame = { state, visualGunSolution: true, now: 1 };
      hud.drawGunSight(frame, null);
      assert.ok(words.includes("SHOOT"), "clear, aligned barrel is ready");
      words.length = 0;
      state.gun_fire_inhibited = true;
      // Keep the qualified solution true: inhibition must win immediately, even in release hold.
      hud.drawGunSight(frame, null);
      assert.ok(!words.includes("SHOOT"), "an interlocked gun must not invite release");
    } finally { globalThis.document = previousDocument; }
  });
}
