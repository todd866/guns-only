import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_NODES,
  CAMPAIGN_STORAGE_KEY,
  EXPERIENCE_CATALOG,
  EXPERIENCE_RELEASE_STATE,
  MAX_APPLIED_RAPIER_SORTIES,
  applyRapierSortieCredits,
  campaignNode,
  campaignNodeQualified,
  campaignNodeUnlocked,
  createCampaignProfile,
  experienceById,
  experienceComingSoon,
  experienceLaunchable,
  loadCampaignProfile,
  productionExperiences,
  qualifyCampaignNode,
  recommendedCampaignNode,
  saveCampaignProfile,
} from "../campaign_progression.js";

// Qualification locks are gone. Release state is separate: only experiences which have completed
// their player-path acceptance may launch from production, even when preview code remains present.

test("one catalog names every route and exposes only accepted production experiences", () => {
  assert.deepEqual(EXPERIENCE_CATALOG.map(({ id, mission, releaseState }) => (
    { id, mission, releaseState }
  )), [
    { id: "first-merge", mission: 7, releaseState: "production" },
    { id: "multiplayer", mission: 7, releaseState: "preview" },
    { id: "low-level-drone", mission: 8, releaseState: "quarantined" },
    { id: "medevac", mission: 13, releaseState: "quarantined" },
    // Circuits sits before the intercept: the trap is the hardest thing the aircraft asks for and
    // the intercept gives exactly one attempt at it, far from home and low on fuel.
    { id: "rapier-circuits", mission: 11, releaseState: "preview" },
    { id: "rapier-intercept", mission: 12, releaseState: "production" },
    // Korea last: it is the only straight-deck recovery in the game, and the only aircraft here
    // that cannot simply go around.
    { id: "korea-panther", mission: 14, releaseState: "quarantined" },
    { id: "indoor", mission: null, releaseState: "quarantined" },
    { id: "medevac-command", mission: null, releaseState: "quarantined" },
    { id: "cobra-lab", mission: null, releaseState: "production" },
    { id: "weekend-ride", mission: null, releaseState: "production" },
    { id: "top-gun", mission: null, releaseState: "production" },
  ]);

  assert.deepEqual(productionExperiences().map(({ id }) => id), [
    "first-merge",
    "rapier-intercept",
    "cobra-lab",
    "weekend-ride",
    "top-gun",
  ]);
  // Top Gun was promoted on owner acceptance 2026-08-13; it must now launch with no preview
  // acknowledgement and carry no blocker, or the promotion is cosmetic.
  assert.equal(experienceLaunchable("top-gun"), true);
  assert.equal(experienceById("top-gun").blocker, "");
  assert.equal(experienceLaunchable("multiplayer"), false);
  assert.match(experienceById("multiplayer").blocker, /matchmaking.*player path/i);
  assert.equal(experienceLaunchable("weekend-ride"), true);
  assert.equal(experienceComingSoon("weekend-ride"), false);
  assert.equal(CAMPAIGN_NODES.length, 7,
    "standalone research routes are not campaign beats");

  const fresh = createCampaignProfile();
  assert.equal(campaignNodeUnlocked(fresh, "first-merge"), true);
  assert.equal(campaignNodeUnlocked(fresh, "rapier-intercept"), true);
  assert.equal(campaignNodeUnlocked(fresh, "medevac"), false);
  assert.equal(campaignNodeUnlocked(fresh, "rapier-circuits"), false);
  assert.equal(experienceLaunchable("indoor"), false);
  assert.equal(recommendedCampaignNode(fresh).id, "first-merge");
});

test("release state is explicit, qualifications stay retired, and unknown ids are rejected", () => {
  const fresh = createCampaignProfile();
  assert.equal(campaignNodeQualified(fresh, "rapier-intercept"), false);
  assert.equal(campaignNodeUnlocked(fresh, "rapier-intercept"), true);
  assert.equal(experienceById("medevac").releaseState, EXPERIENCE_RELEASE_STATE.QUARANTINED);
  assert.match(experienceById("medevac").blocker, /end-to-end human flight/i);
  assert.equal(experienceById("carrier-conversion"), null);
  assert.equal(campaignNodeUnlocked(fresh, "carrier-conversion"), false);
  assert.equal(campaignNode("carrier-conversion"), null);
});

test("retired qualification API remains a side-effect-free compatibility no-op", () => {
  const fresh = createCampaignProfile();
  const completedFirstMerge = {
    visual_merge_evaluation: true,
    visual_merge_score: 100,
    kill_count: 3,
  };

  const first = qualifyCampaignNode(fresh, "first-merge", completedFirstMerge, 1234);
  const second = qualifyCampaignNode(first.profile, "first-merge", completedFirstMerge, 5678);

  assert.equal(first.newlyQualified, false);
  assert.equal(second.newlyQualified, false);
  assert.deepEqual(first.profile.qualifications, {});
  assert.deepEqual(second.profile, first.profile);
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
  assert.match(rapier.shortObjective,
    /thin-air M4\.2.*one gun pass.*high-altitude balloon.*re-enter.*midpoint arrestor/i,
    "the Rapier card must declare the deterministic balloon energy lesson");
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
