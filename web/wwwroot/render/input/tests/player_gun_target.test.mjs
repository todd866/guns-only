import assert from "node:assert/strict";
import test from "node:test";

import {
  desiredPlayerGunTargetSlot,
  syncPlayerGunTargetSelection,
  wingmanPadlockPromotedToPrimary,
} from "../player_gun_target.js";

const livePair = Object.freeze({
  selected_player_gun_target_slot: 0,
  rapier_pattern_only: false,
  opponent_body_present: true,
  bandit_alive: true,
  opponent_alive: true,
  w1_present: 1,
  w1_alive: 1,
});

test("combat target selection persists independently of padlock view state", () => {
  assert.equal(desiredPlayerGunTargetSlot({
    selectedTarget: "wingman",
    state: livePair,
  }), 1);
  assert.equal(desiredPlayerGunTargetSlot({
    selectedTarget: "wingman",
    state: livePair,
  }), 1, "forward view must retain TARGET 2");
  assert.equal(desiredPlayerGunTargetSlot({
    selectedTarget: "wingman",
    state: { ...livePair, w1_alive: 0 },
  }), 0);
  assert.equal(desiredPlayerGunTargetSlot({
    selectedTarget: "wingman",
    state: { ...livePair, rapier_pattern_only: true },
  }), 0);
});

test("rejected bridge selections are not cached and authoritative slots reconcile", () => {
  const calls = [];
  let accept = false;
  const bridge = {
    SetPlayerGunTargetSlot(slot) {
      calls.push(slot);
      return accept;
    },
  };

  let result = syncPlayerGunTargetSelection({
    bridge,
    state: livePair,
    selectedTarget: "wingman",
    appliedSlot: 0,
  });
  assert.deepEqual(calls, [1]);
  assert.equal(result.accepted, false);
  assert.equal(result.appliedSlot, 0, "a rejected request must retain kernel truth");

  result = syncPlayerGunTargetSelection({
    bridge,
    state: livePair,
    selectedTarget: "wingman",
    appliedSlot: result.appliedSlot,
  });
  assert.deepEqual(calls, [1, 1], "a later frame retries the rejected selection");

  accept = true;
  result = syncPlayerGunTargetSelection({
    bridge,
    state: livePair,
    selectedTarget: "wingman",
    appliedSlot: result.appliedSlot,
  });
  assert.equal(result.appliedSlot, 1);
  assert.deepEqual(calls, [1, 1, 1]);

  result = syncPlayerGunTargetSelection({
    bridge,
    state: { ...livePair, selected_player_gun_target_slot: 1 },
    selectedTarget: "wingman",
    appliedSlot: result.appliedSlot,
  });
  assert.equal(result.requested, false);
  assert.deepEqual(calls, [1, 1, 1], "matching hot truth never crosses the bridge");

  result = syncPlayerGunTargetSelection({
    bridge,
    state: { ...livePair, selected_player_gun_target_slot: 1 },
    selectedTarget: "wingman",
    appliedSlot: result.appliedSlot,
  });
  assert.equal(result.appliedSlot, 1);
  assert.deepEqual(calls, [1, 1, 1],
    "releasing padlock never changes the selected gun target");

  result = syncPlayerGunTargetSelection({
    bridge,
    state: { ...livePair, selected_player_gun_target_slot: 1 },
    selectedTarget: "bandit",
    appliedSlot: result.appliedSlot,
  });
  assert.equal(result.appliedSlot, 0);
  assert.deepEqual(calls, [1, 1, 1, 0], "an explicit Tab selection changes target");
});

test("kernel fallback from a dead w1 reconciles without re-requesting the stale slot", () => {
  const calls = [];
  const result = syncPlayerGunTargetSelection({
    bridge: {
      SetPlayerGunTargetSlot(slot) {
        calls.push(slot);
        return true;
      },
    },
    state: {
      ...livePair,
      selected_player_gun_target_slot: 0,
      w1_alive: 0,
    },
    selectedTarget: "wingman",
    appliedSlot: 1,
  });

  assert.equal(result.appliedSlot, 0);
  assert.equal(result.requested, false);
  assert.deepEqual(calls, []);
});

test("same-engagement w1 promotion rebinds the existing tally to primary", () => {
  const promotion = {
    padlock: true,
    padlockTarget: "wingman",
    padlockEntityId: "entity.bandit.7.wingman",
    padlockEngagement: 3,
    state: {
      engagement_number: 3,
      bandit_entity_id: "entity.bandit.8",
      selected_player_gun_target_slot: 0,
      // The wire state promotion ACTUALLY produces: the survivor left w1 for the primary slot and
      // the freed slot backfilled with the killed leader's still-falling wreck (present, dead).
      w1_present: 1,
      w1_alive: 0,
      bandit_alive: true,
      opponent_alive: true,
    },
  };

  assert.equal(wingmanPadlockPromotedToPrimary(promotion), true);
  assert.equal(wingmanPadlockPromotedToPrimary({
    ...promotion,
    state: { ...promotion.state, w1_present: 0 },
  }), true, "a slot emptied outright is the same promotion");
  assert.equal(wingmanPadlockPromotedToPrimary({
    ...promotion,
    padlockEngagement: 2,
  }), false, "a new engagement must not inherit the old tally");
  assert.equal(wingmanPadlockPromotedToPrimary({
    ...promotion,
    state: { ...promotion.state, w1_present: 1, w1_alive: 1 },
  }), false, "a wingman still occupying w1 was not promoted");
  assert.equal(wingmanPadlockPromotedToPrimary({
    ...promotion,
    state: { ...promotion.state, opponent_alive: false },
  }), false, "a dead target still gets the ordinary kill-cam path");
});

// REGRESSION: promotion frees the w1 slot and the wire immediately backfills it with the killed
// leader's wreck (present=1, alive=0) so the falling airframe does not blink out of the sky. A
// promotion test written against w1_present therefore reads "wingman still in slot 1", the
// promotion branch declines, and app.js falls through to `padlock && !padlockTargetValid(...)` —
// wingman validity needs present AND alive — which parks the pilot in a SPLASH kill cam tracking
// the DEAD leader's live falling coordinates while the promoted survivor flies off unlocked.
// Promotion is a question about LIVENESS in the slot, never about occupancy.
test("promotion is detected when the freed w1 slot carries the leader's wreck", () => {
  const wreckInSlot = {
    padlock: true,
    padlockTarget: "wingman",
    padlockEntityId: "entity.bandit.7.wingman",
    padlockEngagement: 3,
    state: {
      engagement_number: 3,
      bandit_entity_id: "entity.bandit.8",
      selected_player_gun_target_slot: 0,
      w1_present: 1,
      w1_alive: 0,
      bandit_alive: true,
      opponent_alive: true,
    },
  };

  assert.equal(wingmanPadlockPromotedToPrimary(wreckInSlot), true,
    "a wreck occupying w1 must not mask the promotion into a false kill cam");
  assert.equal(wingmanPadlockPromotedToPrimary({
    ...wreckInSlot,
    state: { ...wreckInSlot.state, w1_alive: 1 },
  }), false, "a LIVING wingman in w1 was not promoted");
  assert.equal(wingmanPadlockPromotedToPrimary({
    ...wreckInSlot,
    padlockEntityId: "entity.bandit.8.wingman",
  }), false, "the padlocked wingman of the CURRENT primary was not promoted");
});
