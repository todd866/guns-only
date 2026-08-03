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
    gunnerStatusText({ selected_target_id: "u1", state: "tracking", reason: "NoBallisticSolution", fire_authorized: false }, {}),
    "GUN NO SOLUTION",
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
    "GUN MASKED",
  );
});

test("outside the turret envelope reads out of limits", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "outoflimits", reason: "OutOfLimits" }, {}),
    "GUN OUT OF LIMITS",
  );
});

test("friendly target reads friendly", () => {
  assert.equal(
    gunnerStatusText({ selected_target_id: "u1", state: "inhibited", reason: "FriendlyTarget" }, {}),
    "GUN FRIENDLY",
  );
});
