import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  combatHandoffPresentation,
  sortieResultCopy,
  topGunCarrierDebriefCopy,
  visualMergeDebriefPresentation,
} from "../sortie_result.js";
import { RELEASE_BUILD } from "../../release/release_identity.js";

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

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
      returnReason: "NONE",
      automatic: false,
      status: "HANDOFF UNAVAILABLE",
    });
  }
});

test("call-it-a-day presentation covers Rapier and automatic Bingo RTB", () => {
  const manual = combatHandoffPresentation({
    rtb_available: true,
    rtb_reason: "NONE",
  });
  assert.equal(manual.available, true);
  assert.equal(manual.status, "CALL IT A DAY · RTB AVAILABLE");

  const bingo = combatHandoffPresentation({
    player_rtb_active: true,
    rtb_reason: "BINGO_FUEL",
    rtb_automatic: true,
  });
  assert.equal(bingo.playerRtbActive, true);
  assert.equal(bingo.returnReason, "BINGO_FUEL");
  assert.equal(bingo.automatic, true);
  assert.equal(bingo.status, "BINGO · KNOCK IT OFF · RTB");
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

test("carrier water loss keeps the physical cause and one correction distinct", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "WATER",
    recent_events: [],
  });

  assert.equal(result.title, "Aircraft Lost");
  assert.equal(result.brief, "Water impact.");
  assert.equal(result.correction, "Fix energy and flight path before recommitting.");
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

  assert.equal(deck.brief, "Flight deck impact.");
  assert.equal(deck.correction, "Correct the first approach deviation.");
  assert.equal(structure.brief, "Carrier structure impact.");
  assert.equal(structure.correction, "Recheck approach geometry.");
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

test("Panther barrier retention is neither a trap, bolter, nor generic mutual kill", () => {
  const result = sortieResultCopy({
    mission_definition_id: "mission.korea.panther-sortie.v1",
    carrier: true,
    sortie_outcome: "DRAW",
    recovery: "BarrierEngagement",
    barrier_engagement: true,
    arrest_phase: "STOPPED",
    bolter: true,
    hook_outcome: "MissedWires",
    wire: 0,
    touchdown_grade: "NO GRADE",
    touchdown_deviations: "LINEUP",
    touchdown_primary_correction: "ESTABLISH LINEUP EARLIER",
  });

  assert.equal(result.title, "Barrier · Missed wires");
  assert.match(result.brief, /raised barrier retained the aircraft aboard/i);
  assert.match(result.brief, /arresting wires were missed; no wire was caught/i);
  assert.match(result.brief, /LINEUP/);
  assert.match(result.brief, /ESTABLISH LINEUP EARLIER/);
  assert.doesNotMatch(`${result.title} ${result.brief}`, /trap|bolter|mutual/i);
});

test("an explicit opponent destruction event retains the combat-loss diagnosis", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    carrier: true,
    player_impact_surface: "WATER",
    recent_events: [{ type: "DESTROYED", source: "OPPONENT", target: "PLAYER" }],
  });

  assert.equal(result.brief, "Bandit gunfire destroyed the aircraft.");
  assert.equal(result.correction, "Break the gun solution earlier.");
});

test("an unresolved terminal guard stays honest without simulation metadata", () => {
  const result = sortieResultCopy({
    sortie_outcome: "DEFEAT",
    player_impact_surface: "SIMULATION_BOUNDARY",
  });

  assert.equal(result.brief, "Outcome unresolved.");
  assert.equal(result.correction, "Review the final flight path.");
  assert.doesNotMatch(result.brief, /numerical|recorded|simulat|settled|settling/i);
});

test("unknown defeat cause fails honest instead of inventing combat", () => {
  const result = sortieResultCopy({ sortie_outcome: "DEFEAT" });

  assert.equal(result.brief, "Aircraft lost.");
  assert.equal(result.correction, "Review the first controllable deviation.");
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
  assert.equal(recovered.brief, "Aircraft recovered aboard.");
  assert.deepEqual(recovered.facts, ["Procedure 82/100", "Demerits 0"]);
  assert.equal(recovered.correction, "Complete the procedure before recovery.");
  assert.equal(lost.title, "Aircraft Lost");
  assert.equal(lost.brief, "Aircraft not recovered.");
  assert.deepEqual(lost.facts, ["Procedure 40/100", "Demerits 0"]);
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
  assert.equal(defeated.brief, "All raiders destroyed.");
  assert.deepEqual(defeated.facts, ["Score 94/100", "Kills 4/4", "Leakers 0"]);
  assert.equal(defeated.correction, "Repeat the clean intercept.");
  assert.equal(penetrated.title, "Raid Penetrated");
  assert.equal(penetrated.brief, "1 raider penetrated.");
  assert.deepEqual(penetrated.facts, ["Score 61/100", "Kills 3/4", "Leakers 1"]);
  assert.equal(lost.title, "Ownship Lost");
  assert.equal(lost.brief, "Ownship lost.");
  assert.deepEqual(lost.facts, [
    "Score 32/100",
    "Kills 1/4",
    "Leakers 3",
    "Unresolved raiders score as leakers",
  ]);
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

test("G-LOC evidence decorates combat, carrier, maintenance, and drone results once", () => {
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
    const facts = result.facts.join(" · ");
    assert.match(facts, /G-LOC ×2 · peak \+9\.2 G/);
    assert.match(facts, /push-pull 0\.8 G after −1\.4 G/);
    assert.equal(facts.match(/G-LOC/g)?.length, 1);
    assert.equal(result.safetyCorrection, "Ease G onset and unload earlier.");
    assert.doesNotMatch(facts, /injur|safe|good G|low G/i);
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

  assert.deepEqual(result.facts, ["G-LOC ×1 · peak +7.5 G"]);
  assert.doesNotMatch(result.facts.join(" "), /push-pull|negative|penalty/i);
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

test("an Auto-GCAS intervention keeps evidence and response terse without guessing cause", () => {
  const result = sortieResultCopy({
    sortie_outcome: "VICTORY",
    auto_gcas_activation_count: 2,
    auto_gcas_override_count: 1,
  });

  assert.deepEqual(result.facts, ["Auto-GCAS ×2 · overrides 1"]);
  assert.equal(result.safetyCorrection, "Discontinue after an Auto-GCAS fly-up.");
  assert.doesNotMatch(result.facts.join(" "), /distracted|unconscious|pilot error|saved/i,
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

  const facts = result.facts.join(" · ");
  assert.equal(facts.match(/G-LOC/g)?.length, 1);
  assert.equal(facts.match(/Auto-GCAS/g)?.length, 1);
  assert.equal(result.safetyCorrection, "Discontinue after an Auto-GCAS fly-up.");
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
  assert.deepEqual(result.facts, [
    "Airframe review · structural +9.2 s · peak 15.0 G · q +58.2 s · damage/cost not inferred",
  ]);
  assert.equal(result.safetyCorrection, "Hold the aircraft for maintenance review.");
  assert.doesNotMatch(result.facts.join(" "), /\$|grounded|condemned/i);
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

test("visual-merge presentation routes measured evidence to one terse correction", () => {
  const baseline = {
    visual_merge_evaluation: true,
    visual_merge_score: 72,
    minimum_merge_range_m: 180,
    minimum_energy_kias: 320,
    peak_closure_kts: 220,
    rear_quarter_dwell_s: 5.4,
    evaluated_projectile_hits: 2,
    head_on_trigger_violations: 0,
    high_aspect_trigger_violations: 0,
    overshoot_count: 0,
  };
  const cases = [
    [{ head_on_trigger_violations: 1 }, "Hold fire through the first pass."],
    [{ high_aspect_trigger_violations: 1 }, "Wait for rear-quarter geometry."],
    [{ minimum_merge_range_m: 140 }, "Open first-pass spacing to 150 m."],
    [{ minimum_energy_kias: 285 }, "Keep 300 KIAS through the first turn."],
    [{ peak_closure_kts: 310 }, "Settle closure below 250 KT."],
    [{ rear_quarter_dwell_s: 3.8 }, "Hold the rear quarter for 5.0 s."],
    [{ evaluated_projectile_hits: 1 }, "Turn the stable solution into two hits."],
    [{}, "Repeat the stable rear-quarter pass."],
  ];

  for (const [override, expected] of cases) {
    const result = visualMergeDebriefPresentation({ ...baseline, ...override });
    assert.equal(result.correction, expected);
    assert.equal(result.evidence, result.facts.join(" · "));
    assert.ok(result.facts.length <= 7);
    assert.ok(wordCount(result.evidence) <= 24, result.evidence);
    assert.ok(wordCount(result.correction) <= 8, result.correction);
  }
});

test("F-22 default debrief copy stays below the combat-card density budget", () => {
  const states = [
    { sortie_outcome: "VICTORY" },
    { sortie_outcome: "DRAW" },
    { sortie_outcome: "DEFEAT", player_impact_surface: "GROUND" },
    { sortie_outcome: "DEFEAT", player_impact_surface: "SIMULATION_BOUNDARY" },
    { sortie_outcome: "DISCONTINUED" },
    {
      drone_raid_evaluation: true,
      drone_raid_zero_leakers: false,
      drone_raid_kills: 3,
      drone_raid_targets_total: 4,
      drone_raid_leakers: 1,
      drone_raid_score: 61,
    },
    {
      maintenance_scenario: true,
      maintenance_recovered: true,
      maintenance_procedure_complete: false,
      maintenance_score: 82,
    },
    {
      sortie_outcome: "VICTORY",
      combat_handoff_phase: "RECOVERED",
      combat_handoff_requested: true,
      kill_count: 2,
      relief_kills: 1,
      fuel_lb: 4650,
      fuel_reserve_target_lb: 4000,
      fuel_reserve_margin_lb: 650,
    },
    {
      sortie_outcome: "VICTORY",
      pilot_g_loc_count: 1,
      pilot_peak_positive_g: 8.7,
      auto_gcas_activation_count: 1,
      service_life_record_available: true,
      service_life_exceedance_review_required: true,
      service_life_over_structural_limit_s: 2.4,
      service_life_max_g: 10.2,
    },
  ];
  const banned = /did well|fight turned|next rep|deterministic|instrumented|recorded|simulat|physical terminal|decision record/i;

  for (const state of states) {
    const result = sortieResultCopy(state);
    const correction = result.safetyCorrection || result.correction;
    const visible = [result.title, result.brief, ...(result.facts || []), correction].join(" ");
    assert.ok(wordCount(result.title) <= 6, result.title);
    assert.ok(wordCount(result.brief) <= 6, result.brief);
    assert.ok(wordCount(correction) <= 8, correction);
    for (const fact of result.facts || []) assert.ok(wordCount(fact) <= 16, fact);
    assert.doesNotMatch(visible, banned);
  }

  const merge = visualMergeDebriefPresentation({
    visual_merge_evaluation: true,
    visual_merge_score: 72,
    minimum_merge_range_m: 140,
    minimum_energy_kias: 285,
    peak_closure_kts: 310,
    rear_quarter_dwell_s: 3.8,
    evaluated_projectile_hits: 1,
    overshoot_count: 1,
  });
  const victory = sortieResultCopy({ sortie_outcome: "VICTORY" });
  assert.ok(wordCount([
    victory.title, victory.brief, merge.evidence, merge.correction,
  ].join(" ")) <= 36);
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
    runway_recovery_complete: true,
    runway_touchdown_contact: true,
    runway_touchdown_survivable: true,
  });

  assert.equal(result.title, "Handoff Complete · Home");
  assert.equal(result.handoff, true);
  assert.equal(result.playerKills, 2);
  assert.equal(result.reliefKills, 4);
  assert.equal(result.brief, "Combat passed to relief.");
  assert.deepEqual(result.facts, [
    "Kills 2",
    "Relief 4 uncredited",
    "Fuel 4650 LB · reserve +650 LB",
  ]);
  assert.equal(result.correction, "Repeat the clean handoff and recovery.");
  assert.doesNotMatch(result.facts.join(" "), /6 kills|total kills/i);
});

test("a recovered handoff phase cannot invent a physical runway recovery", () => {
  const recovered = {
    sortie_outcome: "VICTORY",
    combat_handoff_phase: "RECOVERED",
    combat_handoff_requested: true,
    combat_handoff_active: true,
    runway_recovery_complete: true,
    runway_touchdown_contact: true,
    runway_touchdown_survivable: true,
  };

  for (const field of [
    "runway_recovery_complete",
    "runway_touchdown_contact",
    "runway_touchdown_survivable",
  ]) {
    const result = sortieResultCopy({ ...recovered, [field]: false });
    assert.notEqual(result.title, "Handoff Complete · Home", `${field} must be required`);
    assert.equal(result.correction, "Complete RTB and recovery.");
  }

  const phaseStillOpen = sortieResultCopy({
    ...recovered,
    combat_handoff_phase: "RELIEF_COMPLETE",
  });
  assert.notEqual(phaseStillOpen.title, "Handoff Complete · Home");
  assert.equal(phaseStillOpen.correction, "Complete RTB and recovery.");
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
  assert.equal(result.brief, "Ownship lost after handoff.");
  assert.deepEqual(result.facts, ["Kills 1", "Relief 0 uncredited", "Reserve unavailable"]);
  assert.equal(result.correction, "Review the first controllable deviation.");
});

test("Top Gun debrief preserves combat custody and the physical carrier pass", () => {
  const state = {
    mission_definition_id: "mission.top-gun.acm.f14a-vs-mig28.v1",
    carrier: true,
    sortie_outcome: "VICTORY",
    recovery: "TRAP",
    arrest_phase: "STOPPED",
    wire: 3,
    touchdown_grade: "OK_UNDERLINE",
    touchdown_deviations: "HIGH_START|SETTLED",
    touchdown_primary_correction: "HOLD_MIDDLE",
    combat_handoff_phase: "RECOVERED",
    combat_handoff_requested: true,
    combat_handoff_active: false,
    player_rtb_active: false,
    kill_count: 2,
    relief_kills: 1,
    fuel_lb: 2650,
    fuel_reserve_target_lb: 2000,
    fuel_reserve_margin_lb: 650,
  };

  const result = sortieResultCopy(state);
  assert.deepEqual(result, topGunCarrierDebriefCopy(state));
  assert.equal(result.kicker, "Top Gun combat + carrier debrief");
  assert.equal(result.title, "Trapped · Wire 3");
  assert.equal(result.handoff, true);
  assert.equal(result.carrierRecovery, true);
  assert.equal(result.playerKills, 2);
  assert.equal(result.reliefKills, 1);
  assert.deepEqual(result.facts, [
    "Kills 2",
    "Relief 1 uncredited",
    "Fuel 2650 LB · reserve +650 LB",
  ]);
  assert.match(result.brief, /Carrier recovery: Trapped · Wire 3/);
  assert.match(result.brief, /OK UNDERLINE/);
  assert.match(result.brief, /Primary correction: HOLD MIDDLE/);
  assert.equal(result.correction, "Repeat the clean handoff and recovery.");
});

test("Top Gun carrier assessment remains useful without a handoff record", () => {
  const result = sortieResultCopy({
    mission_definition_id: "mission.top-gun.acm.f14a-vs-mig28.v1",
    carrier: true,
    recovery: "TRAP",
    wire: 2,
    touchdown_grade: "FAIR",
  });

  assert.equal(result.title, "Trapped · Wire 2");
  assert.equal(result.carrierRecovery, true);
  assert.equal(result.handoff, undefined);
  assert.doesNotMatch(result.brief, /Your credited kills|Relief kills/);
});

test("app consumes the pure evidence-based debrief module", async () => {
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");

  assert.match(app,
    new RegExp(`import \\{[\\s\\S]*?combatHandoffPresentation,[\\s\\S]*?sortieResultCopy,[\\s\\S]*?visualMergeDebriefPresentation,[\\s\\S]*?} from "\\.\\/render\\/debrief\\/sortie_result\\.js\\?v=${RELEASE_BUILD}";`));
  assert.doesNotMatch(app, /function sortieResultCopy\(/);
  assert.doesNotMatch(app, /function visualMergeDebriefPresentation\(/);
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
    /const carrierHandoff = carrierQualification && result\.handoff === true;/,
    "a combined carrier/handoff result needs an explicit two-axis presentation branch");
  assert.match(app,
    /const visualMerge = carrierHandoff \? null : visualMergeEvidence;/,
    "generic merge coaching must not overwrite Top Gun's combat and carrier axes");
  assert.match(app,
    /readySortieLabel\.textContent = carrierHandoff[\s\S]*?"Carrier recovery"[\s\S]*?carrierQualification \? "Physical outcome"[\s\S]*?readyConfigLabel\.textContent = carrierHandoff[\s\S]*?"Combat \+ full pass"[\s\S]*?"Full-pass assessment"/,
    "carrier recovery and combat custody must retain distinct labels");
  assert.match(app,
    /const resultFacts = Array\.isArray\(result\.facts\)[\s\S]*?readyConfig\.textContent = carrierHandoff[\s\S]*?appendResultFacts\([\s\S]*?carrierFacts\.passGrade[\s\S]*?carrierFacts\.waveOff/,
    "Top Gun summary must combine credited/uncredited kills with the full-pass assessment");
  assert.match(app,
    /readyControls\.textContent = carrierHandoff[\s\S]*?Full-pass primary · \$\{carrierFacts\.passCorrection\}[\s\S]*?Touchdown assessment · \$\{carrierFacts\.touchdown\}[\s\S]*?Touchdown primary · \$\{carrierFacts\.touchdownCorrection\}/,
    "Top Gun controls must expose reserve, pass correction and touchdown correction together");
});
