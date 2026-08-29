import test from "node:test";
import assert from "node:assert/strict";
import {
  carrierRecoveryLesson,
  formatWholeLb,
  procedureLabelFromState,
  TopGunRtbDisclosureLatch,
  topGunNavDecision,
} from "../mesh_nd_chrome.js";

test("Top Gun recovery teaches the active conventional Case I leg", () => {
  const lesson = carrierRecoveryLesson({
    presentation_theme: "top-gun-anime-1986",
    player_rtb_active: true,
    approach_guidance_active: true,
    approach_next_label: "DOWNWIND · DIRTY",
    approach_next_alt_m: 202.88,
    approach_next_tas_mps: 90,
    deck_alt: 20,
    cheading: 0,
    landing_heading: -9 * Math.PI / 180,
  });
  assert.equal(lesson.step, "3 / 8 · CASE I");
  assert.equal(lesson.title, "Establish downwind");
  assert.equal(lesson.targets, "600 FT AGL · 175 KTAS · LANDING CONFIG · COURSE 180°");
  assert.match(lesson.action, /left of the ship/i);
});

test("formatWholeLb rounds and localizes", () => {
  assert.equal(formatWholeLb(null), "—");
  assert.equal(formatWholeLb(4210.4), "4,210 LB");
});

test("Top Gun navigation turns the replacement dwell into an explicit carrier choice", () => {
  const choice = topGunNavDecision({
    presentation_theme: "top-gun-anime-1986",
    combat_handoff_phase: 1,
    opponent_replacement_pending: true,
    opponent_replacement_s: 2.34,
    engagement_number: 1,
  });

  assert.equal(choice.mode, "post-kill");
  assert.equal(choice.title, "NEXT JET IN 2.3 SEC");
  assert.equal(choice.action, "RTB TO CARRIER");
  assert.match(choice.detail, /next opponent launches automatically/i);
});

test("Top Gun carrier choice fails closed outside an available live handoff", () => {
  assert.equal(topGunNavDecision({ presentation_theme: "top-gun-anime-1986" }), null);
  assert.equal(topGunNavDecision({
    presentation_theme: "top-gun-anime-1986",
    combat_handoff_phase: 2,
    combat_handoff_requested: true,
  }), null);
  assert.equal(topGunNavDecision({
    presentation_theme: "another-theme",
    combat_handoff_phase: 1,
  }), null);
});

test("accepted Top Gun RTB opens navigation once and respects a manual close", () => {
  const latch = new TopGunRtbDisclosureLatch();
  const active = {
    mission_definition_id: "mission.top-gun.acm.f14a-vs-mig28.v1",
    player_rtb_active: true,
  };

  assert.equal(latch.update(active, { disclosureRelevant: false }), false,
    "the edge waits until the console has route or recovery content");
  assert.equal(latch.update(active, { disclosureRelevant: true }), true,
    "the first useful accepted-RTB frame opens navigation");
  assert.equal(latch.update(active, { disclosureRelevant: true }), false,
    "closing navigation manually is respected while the same RTB remains active");
  assert.equal(latch.update({ ...active, player_rtb_active: false }), false);
  assert.equal(latch.update(active, { disclosureRelevant: true }), true,
    "a later accepted RTB transition is a fresh disclosure edge");
  assert.equal(latch.update({
    mission_definition_id: "mission.modern.visual-merge.endurance.v1",
    player_rtb_active: true,
  }), false, "ordinary RTB does not trigger Top Gun onboarding");
});

test("F-22 gets the same visible RTB button contract as Top Gun", () => {
  const choice = topGunNavDecision({
    mission_definition_id: "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
    rtb_available: true,
    recovery_display_name: "Soniachne west recovery runway",
  });
  assert.equal(choice.mode, "return");
  assert.equal(choice.action, "RTB TO RUNWAY");
  assert.match(choice.detail, /world-space corridor/i);
  assert.match(choice.detail, /Soniachne west recovery runway/i);
});

test("procedureLabelFromState maps kind codes", () => {
  assert.equal(procedureLabelFromState({ recovery_procedure_kind: 3 }), "STRAIGHT-IN");
  assert.equal(procedureLabelFromState({ rapier_pattern_only: true }), "CIRCUITS · DEFAULT");
  assert.equal(procedureLabelFromState({}), "NONE");
});
