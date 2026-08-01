import assert from "node:assert/strict";
import test from "node:test";

import {
  ContactRangeTracker,
  contactRangeIdentity,
  contactRangeLifecycle,
} from "../contact_range_tracker.js";

const player = { x: 0, y: 0, z: 0 };

function sample(tracker, state, role, rangeM, nowSeconds) {
  return tracker.update({
    identity: contactRangeIdentity(state, role),
    lifecycle: contactRangeLifecycle(state),
    position: { x: rangeM, y: 0, z: 0 },
    playerPosition: player,
    nowSeconds,
  });
}

test("range-rate history follows entity identity instead of a reused formation role", () => {
  const tracker = new ContactRangeTracker();
  const first = {
    player_entity_id: "entity.player.1",
    mission_definition_id: "mission.test",
    engagement_number: 1,
    bandit_entity_id: "entity.bandit.1",
  };
  assert.equal(sample(tracker, first, "bandit", 1_000, 1.0).closureKts, null);
  assert.ok(sample(tracker, first, "bandit", 990, 1.1).closureKts > 190);

  const replacement = { ...first, bandit_entity_id: "entity.bandit.2" };
  assert.equal(sample(tracker, replacement, "bandit", 100, 1.2).closureKts, null,
    "a replacement primary must not inherit the previous primary's closure");
});

test("primary and wingman maintain independent identity histories", () => {
  const tracker = new ContactRangeTracker();
  const state = {
    player_entity_id: "entity.player.1",
    mission_definition_id: "mission.test",
    engagement_number: 1,
    bandit_entity_id: "entity.bandit.4",
  };
  assert.equal(contactRangeIdentity(state, "bandit"), "entity.bandit.4");
  assert.equal(contactRangeIdentity(state, "wingman"), "entity.bandit.4.wingman");
  sample(tracker, state, "bandit", 1_000, 2.0);
  sample(tracker, state, "wingman", 2_000, 2.0);
  assert.ok(sample(tracker, state, "bandit", 990, 2.1).closureKts > 0);
  assert.ok(sample(tracker, state, "wingman", 2_010, 2.1).closureKts < 0);
});

test("sortie lifecycle changes and missing identity reset closure safely", () => {
  const tracker = new ContactRangeTracker();
  const state = {
    player_entity_id: "entity.player.1",
    mission_definition_id: "mission.test",
    engagement_number: 1,
    bandit_entity_id: "entity.bandit.1",
  };
  sample(tracker, state, "bandit", 1_000, 3.0);
  assert.ok(sample(tracker, state, "bandit", 990, 3.1).closureKts > 0);

  const restaged = { ...state, player_entity_id: "entity.player.2" };
  assert.equal(sample(tracker, restaged, "bandit", 500, 3.2).closureKts, null);
  assert.equal(sample(tracker, { ...restaged, bandit_entity_id: "" }, "bandit", 490, 3.3)
    .closureKts, null);
});

test("a long presentation gap starts a fresh rate estimate", () => {
  const tracker = new ContactRangeTracker();
  const state = { bandit_entity_id: "entity.bandit.1" };
  sample(tracker, state, "bandit", 1_000, 1.0);
  assert.equal(sample(tracker, state, "bandit", 100, 1.5).closureKts, null);
});

test("reading one contact twice in a frame is idempotent", () => {
  const tracker = new ContactRangeTracker();
  const state = { bandit_entity_id: "entity.bandit.1" };
  sample(tracker, state, "bandit", 1_000, 4.0);
  const firstLayer = sample(tracker, state, "bandit", 990, 4.1);
  const secondLayer = sample(tracker, state, "bandit", 990, 4.1);
  assert.equal(secondLayer.closureKts, firstLayer.closureKts,
    "HUD draw order must not erase a closure computed earlier in the same frame");
});
