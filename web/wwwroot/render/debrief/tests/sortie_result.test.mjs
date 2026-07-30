import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  combatHandoffPresentation,
  sortieResultCopy,
} from "../sortie_result.js";

test("handoff presentation fails closed before the first simulation snapshot", () => {
  for (const state of [undefined, null, false, 0, ""]) {
    assert.deepEqual(combatHandoffPresentation(state), {
      phase: "",
      requested: false,
      active: false,
      playerRtbActive: false,
      reliefKills: 0,
      occurred: false,
      available: false,
      status: "HANDOFF UNAVAILABLE",
    });
  }
});

test("medevac handoff debrief uses custody and coordination evidence, never combat copy", () => {
  const onTime = sortieResultCopy({
    casevac_mission: true,
    casevac_disposition: "TRANSFERRED_ON_TIME",
    casevac_assessment_safe: "PASS",
    casevac_assessment_controlled: "PASS",
    casevac_assessment_masked: "ASSESSED",
    casevac_assessment_timely: "ASSESSED",
    casevac_primary_correction: "Hold the masked lane until the orchard turn.",
    sortie_outcome: "VICTORY",
  });
  const late = sortieResultCopy({
    casevac_mission: true,
    casevac_disposition: "TRANSFERRED_AFTER_REQUESTED_TIME",
    casevac_assessment_safe: "PASS",
    casevac_assessment_controlled: "PASS",
    casevac_assessment_masked: "ASSESSED",
    casevac_assessment_timely: "ASSESSED",
  });

  assert.equal(onTime.title, "Handoff Complete");
  assert.match(onTime.brief, /custody transferred.*within the requested coordination window/i);
  assert.match(onTime.brief,
    /Safe: PASS · Controlled: PASS · Masked: ASSESSED · Timely: ASSESSED/);
  assert.match(onTime.brief, /Hold the masked lane/);
  assert.doesNotMatch(onTime.brief, /victory|opponent|patient|surviv|treatment/i);
  assert.equal(late.title, "Handoff After Requested Time");
  assert.match(late.brief, /after the requested coordination window/i);
  assert.doesNotMatch(late.brief, /death|died|patient/i);
  assert.match(late.brief, /No primary correction was recorded/);
});

test("medevac terminal dispositions preserve capsule custody and never invent a fight", () => {
  const aborted = sortieResultCopy({
    casevac_mission: true,
    casevac_disposition: "CONTROLLED_ABORT",
  });
  const lostEmpty = sortieResultCopy({
    casevac_mission: true,
    casevac_disposition: "AIRCRAFT_LOST_EMPTY",
  });
  const lostOccupied = sortieResultCopy({
    casevac_mission: true,
    casevac_disposition: "AIRCRAFT_LOST_OCCUPIED",
  });

  assert.equal(aborted.title, "Controlled Abort");
  assert.match(aborted.brief, /safe-exit volume/i);
  assert.equal(lostEmpty.title, "Aircraft Lost");
  assert.match(lostEmpty.brief, /before capsule custody transferred aboard/i);
  assert.equal(lostOccupied.title, "Aircraft Lost With Capsule Aboard");
  assert.match(lostOccupied.brief, /custody remained aboard/i);
  for (const result of [aborted, lostEmpty, lostOccupied]) {
    assert.doesNotMatch(result.brief, /victory|opponent|gun|patient|surviv/i);
  }
});

test("carrier water loss teaches from the recorded physical cause", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "WATER",
    recent_events: [],
  });

  assert.equal(result.title, "Aircraft Lost");
  assert.match(result.brief, /approach ended in the water/i);
  assert.match(result.brief, /marked decision/i);
  assert.doesNotMatch(result.brief, /opponent/i);
});

test("deck and carrier-structure losses remain physically distinct", () => {
  const deck = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "FLIGHT_DECK",
  });
  const structure = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "CARRIER_STRUCTURE",
  });

  assert.match(deck.brief, /flight deck/i);
  assert.match(deck.brief, /touchdown assessment/i);
  assert.match(structure.brief, /carrier structure/i);
  assert.match(structure.brief, /approach geometry/i);
});

test("carrier qualification makes trap evidence authoritative instead of combat victory copy", () => {
  const result = sortieResultCopy({
    mission_definition_id: "mission.carrier-qualification.v1",
    carrier: true,
    sortie_outcome: "VICTORY",
    recovery: "Trap",
    arrest_phase: "STOPPED",
    wire: 3,
    touchdown_grade: "FAIR",
    touchdown_deviations: "FAST|LINEUP",
    touchdown_primary_correction: "STABILIZE IAS",
    opponent_health: 1,
  });

  assert.equal(result.title, "Trapped · Wire 3");
  assert.match(result.brief, /FAIR/);
  assert.match(result.brief, /FAST · LINEUP/);
  assert.match(result.brief, /STABILIZE IAS/);
  assert.doesNotMatch(result.brief, /opponent|damaged flight/i);
});

test("carrier qualification reports a bolter even when the generic outcome token is draw", () => {
  const result = sortieResultCopy({
    mission_definition_id: "mission.carrier-qualification.v1",
    carrier: true,
    sortie_outcome: "DRAW",
    recovery: "Bolter",
    bolter: true,
    touchdown_grade: "NO GRADE",
    touchdown_deviations: "HARD SINK RATE",
    touchdown_primary_correction: "ADD POWER EARLIER",
  });

  assert.equal(result.title, "Bolter · No wire");
  assert.match(result.brief, /No arresting wire was caught/);
  assert.match(result.brief, /HARD SINK RATE/);
  assert.match(result.brief, /ADD POWER EARLIER/);
  assert.doesNotMatch(result.brief, /mutual|opponent/i);
});

test("an explicit opponent destruction event retains the combat-loss diagnosis", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "WATER",
    recent_events: [{ type: "DESTROYED", source: "OPPONENT", target: "PLAYER" }],
  });

  assert.match(result.brief, /opponent's gun solution was decisive/i);
  assert.match(result.brief, /physical impact and wreck settling/i);
});

test("a numerical terminal guard is not mislabeled as physical settlement", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    player_impact_surface: "SIMULATION_BOUNDARY",
  });

  assert.match(result.brief, /numerical guard/i);
  assert.match(result.brief, /unresolved/i);
  assert.doesNotMatch(result.brief, /settled|settling/i);
});

test("unknown defeat cause fails honest instead of inventing combat", () => {
  const result = sortieResultCopy({ sortie_outcome: "DEFEAT" });

  assert.match(result.brief, /recorded causal chain/i);
  assert.doesNotMatch(result.brief, /opponent/i);
});

test("maintenance score copy preserves recovered and incomplete outcomes", () => {
  const recovered = sortieResultCopy({
    maintenance_scenario: true,
    maintenance_score: 82.4,
    maintenance_max_score: 100,
    maintenance_recovered: true,
    maintenance_procedure_complete: false,
  });
  const lost = sortieResultCopy({
    maintenance_scenario: true,
    maintenance_score: 40,
    maintenance_max_score: 100,
    maintenance_recovered: false,
  });

  assert.equal(recovered.title, "Procedure Incomplete");
  assert.match(recovered.brief, /82\/100/);
  assert.equal(lost.title, "Aircraft Lost");
  assert.match(lost.brief, /40\/100/);
});

test("drone raid debrief distinguishes containment, penetration, and ownship loss", () => {
  const defeated = sortieResultCopy({
    drone_raid_evaluation: true,
    drone_raid_zero_leakers: true,
    drone_raid_kills: 4,
    drone_raid_targets_total: 4,
    drone_raid_leakers: 0,
    drone_raid_score: 94,
    drone_raid_max_score: 100,
    sortie_outcome: "VICTORY",
  });
  const penetrated = sortieResultCopy({
    drone_raid_evaluation: true,
    drone_raid_zero_leakers: false,
    drone_raid_kills: 3,
    drone_raid_targets_total: 4,
    drone_raid_leakers: 1,
    drone_raid_score: 61,
    drone_raid_max_score: 100,
    sortie_outcome: "DEFEAT",
  });
  const lost = sortieResultCopy({
    drone_raid_evaluation: true,
    drone_raid_ownship_lost: true,
    drone_raid_kills: 1,
    drone_raid_targets_total: 4,
    drone_raid_leakers: 3,
    drone_raid_score: 32,
    drone_raid_max_score: 100,
    sortie_outcome: "DEFEAT",
  });

  assert.equal(defeated.title, "Raid Defeated");
  assert.match(defeated.brief, /physical gunfire/i);
  assert.doesNotMatch(defeated.brief, /wreck|impact|settling/i);
  assert.equal(penetrated.title, "Raid Penetrated");
  assert.match(penetrated.brief, /crossed the defended ring/i);
  assert.equal(lost.title, "Ownship Lost");
  assert.match(lost.brief, /unresolved raider.*penetration/i);
});

test("sorties without G-LOC preserve their established copy exactly", () => {
  const expected = sortieResultCopy({ sortie_outcome: "VICTORY" });
  const withZeroCount = sortieResultCopy({
    sortie_outcome: "VICTORY",
    pilot_g_loc_count: 0,
    pilot_peak_positive_g: 9.1,
    pilot_peak_negative_g: -1.4,
    pilot_push_pull_penalty_g: 0.8,
  });

  assert.deepEqual(withZeroCount, expected);
});

test("G-LOC teaching decorates combat, carrier, maintenance, and drone results once", () => {
  const physiology = {
    pilot_g_loc_count: 2,
    pilot_peak_positive_g: 9.24,
    pilot_peak_negative_g: -1.36,
    pilot_push_pull_penalty_g: 0.78,
  };
  const results = [
    sortieResultCopy({ ...physiology, sortie_outcome: "VICTORY" }),
    sortieResultCopy({
      ...physiology,
      sortie_outcome: "DEFEAT",
      carrier: true,
      player_impact_surface: "FLIGHT_DECK",
    }),
    sortieResultCopy({
      ...physiology,
      maintenance_scenario: true,
      maintenance_recovered: true,
      maintenance_procedure_complete: true,
      maintenance_score: 100,
      maintenance_max_score: 100,
    }),
    sortieResultCopy({
      ...physiology,
      drone_raid_evaluation: true,
      drone_raid_zero_leakers: true,
      drone_raid_targets_total: 4,
      drone_raid_kills: 4,
    }),
  ];

  for (const result of results) {
    assert.match(result.brief, /Pilot G-LOC: 2 episodes \(sortie peak \+9\.2 G/);
    assert.match(result.brief, /modeled push-pull penalty 0\.8 G after a −1\.4 G push/);
    assert.match(result.brief, /review unload timing, G-onset rate, and cumulative exposure/i);
    assert.equal(result.brief.match(/Pilot G-LOC:/g)?.length, 1);
    assert.doesNotMatch(result.brief, /injur|safe|good G|low G/i);
  }
});

test("sub-threshold push-pull state stays out of the concise G-LOC lesson", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DRAW",
    pilot_g_loc_count: 1,
    pilot_peak_positive_g: 7.45,
    pilot_peak_negative_g: -0.9,
    pilot_push_pull_penalty_g: 0.5,
  });

  assert.match(result.brief, /Pilot G-LOC: 1 episode \(sortie peak \+7\.5 G\)/);
  assert.doesNotMatch(result.brief, /push-pull|negative|penalty/i);
});

test("sorties without an Auto-GCAS fly-up preserve established copy exactly", () => {
  const expected = sortieResultCopy({ sortie_outcome: "VICTORY" });
  const withInactiveSystem = sortieResultCopy({
    sortie_outcome: "VICTORY",
    auto_gcas_available: true,
    auto_gcas_activation_count: 0,
    auto_gcas_phase: "ARMED",
  });

  assert.deepEqual(withInactiveSystem, expected);
});

test("an Auto-GCAS intervention teaches the procedural response without guessing cause", () => {
  const result = sortieResultCopy({
    sortie_outcome: "VICTORY",
    auto_gcas_activation_count: 2,
    auto_gcas_override_count: 1,
  });

  assert.match(result.brief, /Auto-GCAS: 2 fly-ups; 1 pilot paddle override\./);
  assert.match(result.brief, /valid or uncertain fly-up as a discontinue\/RTB event/i);
  assert.match(result.brief,
    /review terrain prediction, recovery G, system status, and control state/i);
  assert.doesNotMatch(result.brief, /distracted|unconscious|pilot error|saved/i,
    "a counter alone cannot diagnose why the intervention occurred");
});

test("G-LOC and Auto-GCAS lessons coexist exactly once", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    player_impact_surface: "GROUND",
    pilot_g_loc_count: 1,
    pilot_peak_positive_g: 8.7,
    auto_gcas_activation_count: 1,
  });

  assert.equal(result.brief.match(/Pilot G-LOC:/g)?.length, 1);
  assert.equal(result.brief.match(/Auto-GCAS:/g)?.length, 1);
});

test("Rapier exceedance evidence queues review without inventing damage or cost", () => {
  const result = sortieResultCopy({
    sortie_outcome: "VICTORY",
    service_life_record_available: true,
    service_life_exceedance_review_required: true,
    service_life_over_structural_limit_s: 9.245,
    service_life_over_dynamic_pressure_s: 58.231,
    service_life_max_g: 15.043,
    service_life_damage_assessment: "not_computed",
    service_life_cost_projection: "not_computed",
  });

  assert.equal(result.serviceLifeReviewRequired, true);
  assert.match(result.brief, /9\.2 s above the structural limit, peak 15\.0 G/);
  assert.match(result.brief, /58\.2 s above the q placard/);
  assert.match(result.brief, /Maintenance assessment pending/);
  assert.match(result.brief, /no damage or repair cost has been inferred/);
  assert.doesNotMatch(result.brief, /\$|grounded|condemned/i);
});

test("a clean or unfinished lifecycle record adds no debrief clutter", () => {
  const expected = sortieResultCopy({ sortie_outcome: "VICTORY" });
  assert.deepEqual(sortieResultCopy({
    sortie_outcome: "VICTORY",
    service_life_record_available: false,
    service_life_exceedance_review_required: true,
  }), expected);
  assert.deepEqual(sortieResultCopy({
    sortie_outcome: "VICTORY",
    service_life_record_available: true,
    service_life_exceedance_review_required: false,
  }), expected);
});

test("combat handoff presentation preserves every authoritative phase flag", () => {
  const available = combatHandoffPresentation({
    combat_handoff_phase: "AVAILABLE",
    combat_handoff_requested: false,
    combat_handoff_active: false,
    player_rtb_active: false,
    relief_kills: 0,
  });
  const rtb = combatHandoffPresentation({
    combat_handoff_phase: 5,
    combat_handoff_requested: true,
    combat_handoff_active: true,
    player_rtb_active: true,
    relief_kills: 3,
  });

  assert.equal(available.available, true);
  assert.equal(available.occurred, false);
  assert.equal(rtb.phase, "PLAYER_RTB");
  assert.equal(rtb.requested, true);
  assert.equal(rtb.active, true);
  assert.equal(rtb.playerRtbActive, true);
  assert.equal(rtb.reliefKills, 3);
  assert.equal(rtb.status, "PLAYER RTB");
});

test("recovered handoff debrief keeps player and relief kills separate", () => {
  const result = sortieResultCopy({
    sortie_outcome: "VICTORY",
    combat_handoff_phase: "RECOVERED",
    combat_handoff_requested: true,
    combat_handoff_active: true,
    player_rtb_active: false,
    kill_count: 2,
    relief_kills: 4,
    fuel_lb: 4650,
    fuel_reserve_target_lb: 4000,
    fuel_reserve_margin_lb: 650,
  });

  assert.equal(result.title, "Handoff Complete · Home");
  assert.equal(result.handoff, true);
  assert.equal(result.playerKills, 2);
  assert.equal(result.reliefKills, 4);
  assert.match(result.brief, /Your credited kills: 2\./);
  assert.match(result.brief, /Relief kills: 4 \(tracked separately and not credited to you\)/);
  assert.match(result.brief, /650 LB above reserve/);
  assert.doesNotMatch(result.brief, /6 kills|total kills/i);
});

test("handoff does not hide a subsequent ownship loss or invent reserve evidence", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    combat_handoff_phase: "RELIEF_ENGAGED",
    combat_handoff_requested: true,
    combat_handoff_active: true,
    player_rtb_active: true,
    kill_count: 1,
    relief_kills: 0,
    fuel_reserve_target_lb: 4000,
    fuel_reserve_margin_lb: null,
  });

  assert.equal(result.title, "Aircraft Lost After Handoff");
  assert.match(result.brief, /Recovery reserve result was unavailable/);
});

test("app consumes the pure evidence-based debrief module", async () => {
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");

  assert.match(app,
    /import \{[\s\S]*?combatHandoffPresentation,[\s\S]*?sortieResultCopy,[\s\S]*?} from "\.\/render\/debrief\/sortie_result\.js\?v=207";/);
  assert.doesNotMatch(app, /function sortieResultCopy\(/);
  assert.doesNotMatch(app, /The opponent's gun solution was decisive\. The loss was/);
});

test("carrier debrief keeps physical outcome, full-pass trend, and touchdown facts distinct", async () => {
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");

  assert.match(app,
    /function carrierQualificationPhysicalOutcome\(state\)[\s\S]*?surface === "WATER"\) return "In the water"[\s\S]*?surface === "CARRIER_STRUCTURE"\) return "Carrier structure impact"/);
  assert.match(app,
    /carrier_pass_waveoff_required[\s\S]*?wave-off complied[\s\S]*?wave-off not complied/,
    "the pass assessment must state whether an issued wave-off was obeyed");
  assert.match(app,
    /Full-pass primary · \$\{carrierFacts\.passCorrection\}[\s\S]*?Touchdown assessment · \$\{carrierFacts\.touchdown\}[\s\S]*?Touchdown primary · \$\{carrierFacts\.touchdownCorrection\}/,
    "pass correction and touchdown assessment must not overwrite one another");
  assert.match(app,
    /readySortieLabel\.textContent = result\.handoff[\s\S]*?carrierQualification \? "Physical outcome"[\s\S]*?readyConfigLabel\.textContent = result\.handoff[\s\S]*?carrierQualification[\s\S]*?"Full-pass assessment"/,
    "handoff may add a branch, but carrier labels must retain their distinct physical/pass meanings");
});
