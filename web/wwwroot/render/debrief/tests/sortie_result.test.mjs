import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sortieResultCopy } from "../sortie_result.js";

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

test("app consumes the pure evidence-based debrief module", async () => {
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");

  assert.match(app, /import \{ sortieResultCopy \} from "\.\/render\/debrief\/sortie_result\.js";/);
  assert.doesNotMatch(app, /function sortieResultCopy\(/);
  assert.doesNotMatch(app, /The opponent's gun solution was decisive\. The loss was/);
});
