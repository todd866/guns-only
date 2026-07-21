import assert from "node:assert/strict";
import test from "node:test";

import {
  HudSignalStabilizer,
  latchedRectVisibility,
  StableRoundedValue,
} from "../hud_stabilizer.js";

test("stable digits do not chatter across a rounding boundary", () => {
  const value = new StableRoundedValue();
  assert.equal(value.update(556.48), 556);
  for (const sample of [556.51, 556.47, 556.55, 556.44, 556.58]) {
    assert.equal(value.update(sample), 556);
  }
  assert.equal(value.update(556.72), 557);
});

test("F-22 tape filtering removes sample jitter but bounds manoeuvre lag", () => {
  const filter = new HudSignalStabilizer();
  let display = filter.update({
    player_entity_id: "f22",
    indicated_airspeed_kts: 556,
    ground_speed_kts: 690,
    alt_ft: 18_000,
    heading_deg: 359,
  }, 1 / 60);
  const jittered = [];
  for (let index = 0; index < 120; index += 1) {
    display = filter.update({
      player_entity_id: "f22",
      indicated_airspeed_kts: 556 + (index % 2 === 0 ? 0.42 : -0.42),
      ground_speed_kts: 690,
      alt_ft: 18_000 + (index % 2 === 0 ? 0.8 : -0.8),
      heading_deg: index % 2 === 0 ? 359.1 : 358.9,
    }, 1 / 60);
    jittered.push(display.indicatedKts);
    assert.equal(display.indicatedDigits, 556);
  }
  assert.ok(Math.max(...jittered) - Math.min(...jittered) < 0.2);

  for (let index = 0; index < 60; index += 1) {
    const measured = 556 - (100 * (index + 1) / 60);
    display = filter.update({
      player_entity_id: "f22",
      indicated_airspeed_kts: measured,
      ground_speed_kts: measured,
      alt_ft: 18_000,
      heading_deg: 1,
    }, 1 / 60);
    assert.ok(Math.abs(display.indicatedKts - measured) <= 3.000001);
  }
  assert.ok(display.headingDeg < 10, "heading smoothing must cross north by the short path");
});

test("a replacement ownship resets filters rather than animating stale airdata", () => {
  const filter = new HudSignalStabilizer();
  filter.update({ player_entity_id: "old", indicated_airspeed_kts: 120, alt_ft: 800 }, 1 / 60);
  const replacement = filter.update({
    player_entity_id: "new", indicated_airspeed_kts: 560, alt_ft: 18_000,
  }, 1 / 60);
  assert.equal(replacement.indicatedKts, 560);
  assert.equal(replacement.altitudeFt, 18_000);
});

test("target-box visibility uses enter and exit hysteresis", () => {
  const rectangle = { left: 100, right: 900, top: 100, bottom: 600 };
  assert.equal(latchedRectVisibility(false, { x: 126, y: 300 }, rectangle, 20, 6), true);
  assert.equal(latchedRectVisibility(false, { x: 124, y: 300 }, rectangle, 20, 6), false);
  assert.equal(latchedRectVisibility(true, { x: 116, y: 300 }, rectangle, 20, 6), true,
    "an acquired box remains until it crosses the wider exit boundary");
  assert.equal(latchedRectVisibility(true, { x: 112, y: 300 }, rectangle, 20, 6), false);
});
