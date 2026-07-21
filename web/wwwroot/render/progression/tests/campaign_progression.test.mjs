import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_NODES,
  CAMPAIGN_STORAGE_KEY,
  campaignNodeSatisfied,
  campaignNodeUnlocked,
  createCampaignProfile,
  loadCampaignProfile,
  nextCampaignNode,
  qualifyCampaignNode,
  recommendedCampaignNode,
  saveCampaignProfile,
} from "../campaign_progression.js";

test("the Raptor program is linear and carrier conversion sits behind three qualifications", () => {
  assert.deepEqual(CAMPAIGN_NODES.map(({ id, mission, aircraft }) => ({ id, mission, aircraft })), [
    { id: "first-merge", mission: 7, aircraft: "F-22A" },
    { id: "raid-defence", mission: 8, aircraft: "F-22A" },
    { id: "endurance-merge", mission: 7, aircraft: "F-22A" },
    { id: "carrier-conversion", mission: 5, aircraft: "F-35C" },
  ]);
  const fresh = createCampaignProfile();
  assert.equal(recommendedCampaignNode(fresh).id, "first-merge");
  assert.equal(campaignNodeUnlocked(fresh, "first-merge"), true);
  assert.equal(campaignNodeUnlocked(fresh, "raid-defence"), false);
  assert.equal(campaignNodeUnlocked(fresh, "carrier-conversion"), false);
});

test("performance, not opening a menu, unlocks each next mission", () => {
  let profile = createCampaignProfile();
  let result = qualifyCampaignNode(profile, "first-merge", {
    visual_merge_evaluation: true,
    kill_count: 0,
  }, 100);
  assert.equal(result.newlyQualified, false);

  result = qualifyCampaignNode(profile, "first-merge", {
    visual_merge_evaluation: true,
    visual_merge_score: 72,
    kill_count: 1,
  }, 101);
  assert.equal(result.newlyQualified, true);
  profile = result.profile;
  assert.equal(nextCampaignNode(profile, "first-merge").id, "raid-defence");

  assert.equal(campaignNodeSatisfied("raid-defence", {
    drone_raid_evaluation: true,
    drone_raid_finished: true,
    drone_raid_score: 64,
    drone_raid_kills: 4,
    drone_raid_leakers: 0,
  }), false);
  result = qualifyCampaignNode(profile, "raid-defence", {
    drone_raid_evaluation: true,
    drone_raid_finished: true,
    drone_raid_score: 78,
    drone_raid_kills: 3,
    drone_raid_leakers: 1,
  }, 102);
  profile = result.profile;
  assert.equal(result.newlyQualified, true);

  result = qualifyCampaignNode(profile, "endurance-merge", {
    visual_merge_evaluation: true,
    visual_merge_score: 82,
    kill_count: 2,
  }, 103);
  profile = result.profile;
  assert.equal(result.newlyQualified, true);
  assert.equal(nextCampaignNode(profile, "endurance-merge").id, "carrier-conversion");
  assert.equal(campaignNodeUnlocked(profile, "carrier-conversion"), true);
});

test("carrier qualification requires a stopped trap victory", () => {
  const base = createCampaignProfile({ qualifications: {
    "first-merge": { qualifiedAt: 1 },
    "raid-defence": { qualifiedAt: 2 },
    "endurance-merge": { qualifiedAt: 3 },
  } });
  assert.equal(campaignNodeSatisfied("carrier-conversion", {
    finished: true,
    sortie_outcome: "DRAW",
    recovery: "BOLTER",
  }), false);
  const result = qualifyCampaignNode(base, "carrier-conversion", {
    finished: true,
    sortie_outcome: "VICTORY",
    recovery: "TRAP",
  }, 4);
  assert.equal(result.newlyQualified, true);
  assert.equal(nextCampaignNode(result.profile, "carrier-conversion"), null);
});

test("anonymous progress survives storage failures and malformed saved data", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  const qualified = qualifyCampaignNode(createCampaignProfile(), "first-merge", {
    visual_merge_evaluation: true,
    kill_count: 1,
  }, 20).profile;
  saveCampaignProfile(qualified, storage);
  assert.ok(memory.has(CAMPAIGN_STORAGE_KEY));
  assert.ok(loadCampaignProfile(storage).qualifications["first-merge"]);

  memory.set(CAMPAIGN_STORAGE_KEY, "{not-json");
  assert.deepEqual(loadCampaignProfile(storage), createCampaignProfile());
});
