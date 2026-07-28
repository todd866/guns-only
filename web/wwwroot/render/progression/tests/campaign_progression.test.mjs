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
// exercises; every shipping mission is available immediately. These tests stop the gate from
// growing back as new mission types and environments are added.

test("the menu is four missions and all are always available", () => {
  assert.deepEqual(CAMPAIGN_NODES.map(({ id, mission, aircraft }) => ({ id, mission, aircraft })), [
    { id: "first-merge", mission: 7, aircraft: "F-22A" },
    { id: "low-level-drone", mission: 8, aircraft: "F-22A" },
    // Circuits sits before the intercept: the trap is the hardest thing the aircraft asks for and
    // the intercept gives exactly one attempt at it, far from home and low on fuel.
    { id: "rapier-circuits", mission: 11, aircraft: "Rapier" },
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

test("the missions are genuinely different fights and expose their aircraft honestly", () => {
  const guns = campaignNode("first-merge");
  const drone = campaignNode("low-level-drone");
  const rapier = campaignNode("rapier-intercept");
  assert.notEqual(guns.mission, drone.mission);
  assert.notEqual(drone.mission, rapier.mission);
  assert.notEqual(guns.mission, rapier.mission);
  assert.notEqual(guns.aircraft, rapier.aircraft);
  assert.match(rapier.shortObjective, /M0\.90.*FL560.*live ram handover.*FL700/,
    "the Rapier card must teach the altitude-gated ram acceleration profile");
  // None advertises a qualification: there is nothing to earn.
  assert.equal(guns.qualification, "");
  assert.equal(drone.qualification, "");
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
