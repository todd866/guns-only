import assert from "node:assert/strict";
import test from "node:test";
import { createRideCueDriver, rideCueIntent } from "../ride_cue_driver.js";

test("a late apex cue steers toward the look and brakes inside 150 m", () => {
  const intent = rideCueIntent({
    speed: 32,
    apexM: 40,
    apexMps: 20,
    exit: false,
    pitOpen: false,
    look: 4,
    inPit: false,
    legal: false,
    onTrack: true,
  });
  assert.ok(intent.steerTarget > 0);
  assert.equal(intent.throttleTarget, 0);
  assert.ok(intent.brakeTarget > 0);
});

test("the pit stop snaps steer and brakes only after the lagged cue is in the box", () => {
  const decision = {
    speed: 12,
    apexM: 10,
    apexMps: 20,
    exit: false,
    pitOpen: true,
    look: 8,
    inPit: false,
    legal: false,
    onTrack: false,
  };
  const live = { ...decision, inPit: true, legal: true, speed: 8 };
  const intent = rideCueIntent(decision, live);
  assert.equal(intent.steerTarget, 0);
  assert.equal(intent.brakeTarget, 0);
});

test("decisions stay 250 ms behind the live cue", () => {
  const driver = createRideCueDriver();
  const early = driver.step({
    vx: 20, vy: 0, vz: 0,
    next_apex_m: 400, next_apex_mps: 20, next_apex_exit: false,
    pit_open: false, look_ahead_lateral_m: 0, in_pit: false,
    pit_entry_legal: false, on_track: true,
  }, 0.25);
  const late = driver.step({
    vx: 32, vy: 0, vz: 0,
    next_apex_m: 20, next_apex_mps: 20, next_apex_exit: false,
    pit_open: false, look_ahead_lateral_m: 6, in_pit: false,
    pit_entry_legal: false, on_track: true,
  }, 0.01);
  assert.ok(early.throttle > 0);
  assert.ok(late.brake < 0.05);
});
