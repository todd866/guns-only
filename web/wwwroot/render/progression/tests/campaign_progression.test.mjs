import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_NODES,
  CAMPAIGN_STORAGE_KEY,
  MAX_APPLIED_RAPIER_SORTIES,
  applyRapierSortieCredits,
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

test("the menu is six missions and all are always available", () => {
  assert.deepEqual(CAMPAIGN_NODES.map(({ id, mission, aircraft }) => ({ id, mission, aircraft })), [
    { id: "first-merge", mission: 7, aircraft: "F-22A" },
    { id: "low-level-drone", mission: 8, aircraft: "F-22A" },
    { id: "medevac", mission: 13, aircraft: "Air Ambulance" },
    // Circuits sits before the intercept: the trap is the hardest thing the aircraft asks for and
    // the intercept gives exactly one attempt at it, far from home and low on fuel.
    { id: "rapier-circuits", mission: 11, aircraft: "Rapier" },
    { id: "rapier-intercept", mission: 12, aircraft: "Rapier" },
    // Korea last: it is the only straight-deck recovery in the game, and the only aircraft here
    // that cannot simply go around.
    { id: "korea-panther", mission: 14, aircraft: "F9F-2 Panther" },
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
  const medevac = campaignNode("medevac");
  const rapier = campaignNode("rapier-intercept");
  assert.notEqual(guns.mission, drone.mission);
  assert.notEqual(drone.mission, medevac.mission);
  assert.notEqual(medevac.mission, rapier.mission);
  assert.notEqual(drone.mission, rapier.mission);
  assert.notEqual(guns.mission, rapier.mission);
  assert.notEqual(guns.aircraft, rapier.aircraft);
  assert.match(medevac.shortObjective, /pickup.*capsule.*clinic/i);
  assert.match(rapier.shortObjective, /balloon.*transport.*operating balance/i,
    "the Rapier card must declare the varied economic contract");
  // None advertises a qualification: there is nothing to earn.
  assert.equal(guns.qualification, "");
  assert.equal(drone.qualification, "");
  assert.equal(medevac.qualification, "");
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

test("Rapier sortie hashes apply exactly once and remain bounded", () => {
  const key = "a".repeat(64);
  const first = applyRapierSortieCredits(createCampaignProfile(), key, 75);
  assert.equal(first.applied, true);
  assert.equal(first.profile.rapierBalanceCredits, 75);

  const duplicate = applyRapierSortieCredits(first.profile, key, 75);
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.profile.rapierBalanceCredits, 75);
  assert.equal(duplicate.profile.appliedRapierSortieKeys.length, 1);

  let profile = duplicate.profile;
  for (let i = 0; i < MAX_APPLIED_RAPIER_SORTIES + 8; i += 1) {
    profile = applyRapierSortieCredits(
      profile,
      i.toString(16).padStart(64, "0"),
      1,
    ).profile;
  }
  assert.equal(profile.appliedRapierSortieKeys.length, MAX_APPLIED_RAPIER_SORTIES);
  assert.equal(profile.rapierBalanceCredits, 75 + MAX_APPLIED_RAPIER_SORTIES + 8);
});

test("legacy points migrate into the Rapier balance without importing junk keys", () => {
  const profile = createCampaignProfile({
    pointsBalance: -12,
    appliedRapierSortieKeys: [
      "not-a-hash",
      "b".repeat(64),
      "b".repeat(64),
    ],
  });
  assert.equal(profile.rapierBalanceCredits, -12);
  assert.deepEqual(profile.appliedRapierSortieKeys, ["b".repeat(64)]);
});
