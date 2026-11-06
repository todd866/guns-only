import test from "node:test";
import assert from "node:assert/strict";
import {HITSTOP, addHit, confettiBurst, createJuice, rumblePulse, stepJuice} from "../juice.mjs";

test("hit-stop slows the world briefly, big pops longer, UI scale recovers", () => {
  const j = createJuice();
  addHit(j, {big: false});
  assert.equal(stepJuice(j, 0.001), HITSTOP.scale);
  assert.equal(stepJuice(j, 1), 1, "over after the stop");
  addHit(j, {big: true});
  let frames = 0;
  while (stepJuice(j, 0.016) !== 1) frames += 1;
  assert.ok(frames >= 5, "a big pop stops longer than a frame or two");
});

test("hit markers appear at the screen point and decay", () => {
  const j = createJuice();
  addHit(j, {sx: 0.3, sy: 0.7, big: true});
  assert.equal(j.markers.length, 1);
  assert.equal(j.markers[0].sx, 0.3);
  stepJuice(j, 1);
  assert.equal(j.markers.length, 0);
});

test("rumble descriptors fit gamepad.vibrationActuator.playEffect", () => {
  for (const pulse of [rumblePulse(false), rumblePulse(true), rumblePulse(false, true)]) {
    assert.ok(pulse.duration > 0 && pulse.duration <= 250);
    assert.ok(pulse.strongMagnitude >= 0 && pulse.strongMagnitude <= 1);
    assert.ok(pulse.weakMagnitude >= 0 && pulse.weakMagnitude <= 1);
  }
  assert.ok(rumblePulse(true).strongMagnitude > rumblePulse(false).strongMagnitude);
});

test("confetti bursts live a couple of seconds and fall under gravity", () => {
  const j = createJuice();
  confettiBurst(j, 30, {x: 0.5, y: 0.5});
  assert.equal(j.confetti.length, 30);
  const vy0 = j.confetti[0].vy;
  stepJuice(j, 0.1);
  assert.ok(j.confetti[0].vy < vy0, "gravity pulls");
  for (let i = 0; i < 40; i += 1) stepJuice(j, 0.1);
  assert.equal(j.confetti.length, 0);
});
