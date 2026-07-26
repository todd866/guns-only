import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_NODES,
  CAMPAIGN_STORAGE_KEY,
  campaignNode,
  campaignNodeQualified,
  campaignNodeUnlocked,
  createCampaignProfile,
  loadCampaignProfile,
  recommendedCampaignNode,
  saveCampaignProfile,
} from "../campaign_progression.js";

// The qualification ladder is GONE. It was scaffolding from when this was a programme of graded
// exercises; the game is now two missions, and locking one behind the other only stood between the
// pilot and the aircraft they wanted to fly. These tests exist to stop it growing back.

test("the menu is two missions and both are always available", () => {
  assert.deepEqual(CAMPAIGN_NODES.map(({ id, mission, aircraft }) => ({ id, mission, aircraft })), [
    { id: "first-merge", mission: 7, aircraft: "F-22A" },
    { id: "rapier-intercept", mission: 10, aircraft: "Rapier" },
  ]);

  const fresh = createCampaignProfile();
  for (const node of CAMPAIGN_NODES) {
    assert.equal(campaignNodeUnlocked(fresh, node.id), true,
      `${node.id} must be available from a cold start — nothing is gated any more`);
  }
  assert.equal(recommendedCampaignNode(fresh).id, "first-merge");
});

test("nothing is locked, nothing is qualified, and unknown ids are still rejected", () => {
  const fresh = createCampaignProfile();
  assert.equal(campaignNodeQualified(fresh, "rapier-intercept"), false);
  assert.equal(campaignNodeUnlocked(fresh, "rapier-intercept"), true);
  // A node that does not exist is still not a node.
  assert.equal(campaignNodeUnlocked(fresh, "carrier-conversion"), false);
  assert.equal(campaignNode("carrier-conversion"), null);
});

test("the two missions are genuinely different aircraft and different fights", () => {
  const guns = campaignNode("first-merge");
  const rapier = campaignNode("rapier-intercept");
  assert.notEqual(guns.mission, rapier.mission);
  assert.notEqual(guns.aircraft, rapier.aircraft);
  // Neither advertises a qualification: there is nothing to earn.
  assert.equal(guns.qualification, "");
  assert.equal(rapier.qualification, "");
});

test("anonymous selection survives storage failures and malformed saved data", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
  };

  const saved = saveCampaignProfile(createCampaignProfile(), storage);
  assert.ok(saved);
  assert.equal(loadCampaignProfile(storage).version, saved.version);

  memory.set(CAMPAIGN_STORAGE_KEY, "{not json");
  assert.equal(loadCampaignProfile(storage).version, createCampaignProfile().version);

  const hostile = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.doesNotThrow(() => loadCampaignProfile(hostile));
  assert.doesNotThrow(() => saveCampaignProfile(createCampaignProfile(), hostile));
});
