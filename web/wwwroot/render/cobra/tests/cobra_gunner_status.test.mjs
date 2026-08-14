import test from "node:test";
import assert from "node:assert/strict";
import { gunnerStatusText } from "../cobra_gunner_status.js";

test("no selected target reads idle", () => {
  assert.equal(gunnerStatusText({ selected_target_id: null, state: "awaitingtarget", reason: "NoTarget" }, {}), "GUN —");
});

test("dry magazine outranks every other state", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "tracking", reason: "ConsentReleased" }, { ammo_dry: true }),
    "GUN DRY",
  );
});

test("firing while authorized", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "tracking", reason: "None", fire_authorized: true }, {}),
    "GUN FIRING",
  );
});

test("tracking without consent tells the pilot to hold F", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "tracking", reason: "ConsentReleased", fire_authorized: false }, {}),
    "GUN ON TARGET — HOLD F",
  );
});

test("mount still converging reads slewing", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "tracking", reason: "SightNotCoincident", fire_authorized: false }, {}),
    "GUN SLEWING",
  );
});

test("no ballistic solution reads no solution", () => {
  assert.equal(
    gunnerStatusText({
      selected_target_id: "u1",
      state: "tracking",
      reason: "NoBallisticSolution",
      target_within_range: true,
      fire_authorized: false,
    }, {}),
    "GUN NO BALLISTIC SOLUTION",
  );
});

test("range failure is distinct from an in-range ballistic failure", () => {
  assert.equal(
    gunnerStatusText({
      selected_target_id: "u1",
      state: "tracking",
      reason: "NoBallisticSolution",
      target_within_range: false,
      fire_authorized: false,
    }, {}),
    "GUN OUT OF RANGE",
  );
});

test("crew still qualifying the track reads acquiring", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "acquiring", reason: "Acquiring" }, {}),
    "GUN ACQUIRING",
  );
});

test("terrain or obstacle in the way reads masked", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "masked", reason: "Masked" }, {}),
    "GUN MASKED — NO LOS",
  );
});

test("outside the turret envelope tells the pilot the target is out of arc", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "outoflimits", reason: "OutOfLimits" }, {}),
    "GUN OUT OF ARC",
  );
});

test("friendly target reads friendly", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "inhibited", reason: "FriendlyTarget" }, {}),
    "GUN FRIENDLY",
  );
});

test("a masked state with a non-masked reason surfaces the bridge reason, never a MASKED relabel", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "masked", reason: "OutOfLimits" }, {}),
    "GUN OUT OF ARC",
  );
});

test("unrecognized bridge reasons pass through as spaced uppercase instead of being relabeled", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "outoflimits", reason: "OutsideTurretEnvelope" }, {}),
    "GUN OUTSIDE TURRET ENVELOPE",
  );
});
