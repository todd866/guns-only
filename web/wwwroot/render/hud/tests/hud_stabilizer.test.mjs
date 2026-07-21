import assert from "node:assert/strict";
import test from "node:test";

import {
  HudSignalStabilizer,
  latchedRectVisibility,
  StableRateEstimate,
  StableRoundedValue,
  VisibilityEnvelope,
} from "../hud_stabilizer.js";

test("stable digits do not chatter across a rounding boundary", () => {
  const value = new StableRoundedValue();
  assert.equal(value.update(556.48), 556);
  for (const sample of [556.51, 556.47, 556.55, 556.44, 556.58]) {
    assert.equal(value.update(sample), 556);
  }
  assert.equal(value.update(556.72), 557);
});

test("visibility envelope removes one-frame dropouts without delaying urgent onset", () => {
  const envelope = new VisibilityEnvelope({ attackSeconds: 0.1, releaseSeconds: 0.2 });
  assert.equal(envelope.update(true, 0.001, { instantAttack: true }), 1);
  assert.equal(envelope.update(false, 0.02), 0.9);
  assert.equal(envelope.update(true, 0.02), 1,
    "one valid frame restores the cue instead of producing a blink");
  assert.equal(envelope.update(false, 0.1), 0.5);
  assert.equal(envelope.update(false, 0.1), 0);

  envelope.reset();
  assert.equal(envelope.update(true, 0.05), 0.5);
  assert.equal(envelope.update(true, 0.05), 1);
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

test("airspeed tape and trend reject sustained small reversals without hiding acceleration", () => {
  const filter = new HudSignalStabilizer();
  let display = filter.update({
    player_entity_id: "f22",
    indicated_airspeed_kts: 420,
    alt_ft: 12_000,
  }, 1 / 60);
  const settledTape = [];
  const settledDigits = [];
  const settledRates = [];
  for (let index = 0; index < 360; index += 1) {
    const seconds = index / 60;
    display = filter.update({
      player_entity_id: "f22",
      indicated_airspeed_kts: 420 + Math.sin(seconds * Math.PI * 2 * 1.1) * 2.2,
      alt_ft: 12_000,
    }, 1 / 60);
    if (index >= 120) {
      settledTape.push(display.indicatedKts);
      settledDigits.push(display.indicatedDigits);
      settledRates.push(display.indicatedRateKtsPerSecond);
    }
  }
  assert.ok(Math.max(...settledTape) - Math.min(...settledTape) < 1.2,
    "a small repeating IAS reversal must not make the whole scale breathe");
  assert.deepEqual([...new Set(settledDigits)], [420],
    "the boxed airspeed must not count up and down around a steady mean");
  assert.ok(Math.max(...settledRates.map(Math.abs)) < 0.35,
    "the acceleration caret must remain neutral during display chatter");

  for (let index = 0; index < 60; index += 1) {
    const measured = 420 + (60 * (index + 1) / 60);
    display = filter.update({
      player_entity_id: "f22",
      indicated_airspeed_kts: measured,
      alt_ft: 12_000,
    }, 1 / 60);
    assert.ok(Math.abs(display.indicatedKts - measured) <= 3.000001);
  }
  assert.ok(display.indicatedRateKtsPerSecond > 10,
    "a deliberate acceleration must still produce an immediate positive trend");
});

test("rate estimate waits for a sustained reversal before flipping the caret", () => {
  const rate = new StableRateEstimate({ sampleSeconds: 0.25 });
  let measured = 200;
  rate.reset(measured);
  for (let index = 0; index < 60; index += 1) {
    measured += 0.1;
    rate.update(measured, 1 / 60);
  }
  assert.ok(rate.value > 0);
  const positive = rate.value;
  for (let index = 0; index < 30; index += 1) {
    measured -= 0.005;
    rate.update(measured, 1 / 60);
  }
  assert.ok(rate.value >= 0 && rate.value < positive,
    "a weak opposite sample may relax the caret but must not flip it");
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

test("vertical speed filtering preserves sign, bounds lag, resets scope, and never invents zero", () => {
  const filter = new HudSignalStabilizer();
  let display = filter.update({
    player_entity_id: "jet",
    indicated_airspeed_kts: 140,
    alt_ft: 600,
    vertical_speed_fpm: -650,
  }, 1 / 60);
  assert.equal(display.verticalSpeedFpm, -650);
  assert.equal(display.verticalSpeedDigits, -650);

  const jittered = [];
  for (let index = 0; index < 60; index += 1) {
    display = filter.update({
      player_entity_id: "jet",
      indicated_airspeed_kts: 140,
      alt_ft: 600,
      vertical_speed_fpm: index % 2 === 0 ? -628 : -672,
    }, 1 / 60);
    jittered.push(display.verticalSpeedFpm);
    assert.equal(display.verticalSpeedDigits, -650);
  }
  assert.ok(Math.max(...jittered) - Math.min(...jittered) < 20);

  display = filter.update({
    player_entity_id: "jet",
    indicated_airspeed_kts: 180,
    alt_ft: 650,
    vertical_speed_fpm: 4000,
  }, 1 / 60);
  assert.ok(display.verticalSpeedFpm > 0, "a fast sink-to-climb reversal must be immediately legible");
  assert.ok(Math.abs(display.verticalSpeedFpm - 4000) <= 250.000001);

  display = filter.update({
    player_entity_id: "jet",
    indicated_airspeed_kts: 180,
    alt_ft: 650,
  }, 1 / 60);
  assert.equal(display.verticalSpeedFpm, null);
  assert.equal(display.verticalSpeedDigits, null);

  filter.update({
    player_entity_id: "jet",
    indicated_airspeed_kts: 180,
    alt_ft: 650,
    vertical_speed_fpm: -500,
  }, 1 / 60);
  display = filter.update({
    player_entity_id: "jet",
    replay_external: true,
    indicated_airspeed_kts: 180,
    alt_ft: 650,
    vertical_speed_fpm: 1200,
  }, 1 / 60);
  assert.equal(display.verticalSpeedFpm, 1200,
    "live-to-replay must reset instead of smearing two different timelines");
  assert.equal(display.verticalSpeedDigits, 1200);
});

test("target-box visibility uses enter and exit hysteresis", () => {
  const rectangle = { left: 100, right: 900, top: 100, bottom: 600 };
  assert.equal(latchedRectVisibility(false, { x: 126, y: 300 }, rectangle, 20, 6), true);
  assert.equal(latchedRectVisibility(false, { x: 124, y: 300 }, rectangle, 20, 6), false);
  assert.equal(latchedRectVisibility(true, { x: 116, y: 300 }, rectangle, 20, 6), true,
    "an acquired box remains until it crosses the wider exit boundary");
  assert.equal(latchedRectVisibility(true, { x: 112, y: 300 }, rectangle, 20, 6), false);
});
