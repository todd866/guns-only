import assert from "node:assert/strict";
import test from "node:test";
import { cobraObjectiveCopy } from "../cobra_objective_copy.js";

test("default tip copy before the pilot has touched anything", () => {
  const copy = cobraObjectiveCopy({ control: 0, ammo_bingo: false, ammo_dry: false });
  assert.equal(copy.line, "TIP CONTROL FRIENDLY · HOLD 45s");
  assert.match(copy.detail, /W collective up/);
});

test("parked on the FOB while control bleeds hostile demands return to fight", () => {
  // Mirrors web-cobra-1786090836886-dc8wvig0 after t≈132 s: over pad, ctrl < −0.25, no lose hold yet.
  const copy = cobraObjectiveCopy({
    control: -0.3,
    over_fob: true,
    ammo_bingo: false,
    ammo_dry: false,
    defeat_control_threshold: -0.75,
  });
  assert.match(copy.line, /HOSTILES GAINING/);
  assert.match(copy.line, /RETURN TO FIGHT/);
  assert.match(copy.detail, /pad will not hold/i);
});

test("defeat hold progress outranks the tip-friendly default", () => {
  const copy = cobraObjectiveCopy({
    control: -0.8,
    defeat_hold_progress: 0.4,
    defeat_control_threshold: -0.75,
    over_fob: false,
    ammo_dry: false,
  });
  assert.match(copy.line, /BRIDGE FALLING · 40%/);
  assert.match(copy.detail, /Tab a mark/);
});

test("losing on the pad tells the pilot to leave, not rearm", () => {
  const copy = cobraObjectiveCopy({
    control: -0.76,
    defeat_hold_progress: 0.1,
    defeat_control_threshold: -0.75,
    over_fob: true,
    ammo_dry: false,
    ammo_remaining: 725,
  });
  assert.match(copy.line, /LEAVE THE PAD/);
});

test("ammo dry still wins so a empty gun can rearm", () => {
  const copy = cobraObjectiveCopy({
    control: -0.8,
    defeat_hold_progress: 0.5,
    ammo_dry: true,
    over_fob: false,
  });
  assert.match(copy.line, /REARM AT CAMP EMBER/);
});
