import assert from "node:assert/strict";
import test from "node:test";

import { f22SortieResult } from "../f22_sortie_result.js";
import { sortieResultCopy } from "../sortie_result.js";

const MISSION = "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1";
const VALLEY = "mission.modern.visual-merge.first-run-valley.v1";

function state(overrides = {}) {
  return {
    mission_definition_id: MISSION,
    practice_exercise: "none",
    sortie_outcome: "DEFEAT",
    ...overrides,
  };
}

const recovered = {
  runway_recovery_complete: true,
  runway_touchdown_contact: true,
  runway_touchdown_survivable: true,
};

test("F-22 result is scoped to the exact mission and live sorties", () => {
  assert.ok(f22SortieResult(state()));
  assert.ok(f22SortieResult({ ...state(), mission_definition_id: VALLEY }));
  assert.equal(f22SortieResult({ ...state(), mission_definition_id: "mission.other" }), null);
  for (const exercise of ["gunnery", "recovery", "valley"]) {
    assert.equal(f22SortieResult(state({ practice_exercise: exercise })), null);
  }
  assert.ok(f22SortieResult(state({ practice_exercise: "none" })));
});

test("two kills never imply two completed engagements or a victory", () => {
  const result = f22SortieResult(state({
    sortie_outcome: "DEFEAT",
    kill_count: 2,
  }));
  assert.equal(result.title, "Aircraft lost");
  assert.equal(result.practiceExercise, "gunnery");
  assert.deepEqual(result.facts, ["Targets destroyed 2"]);

  const acePair = f22SortieResult(state({
    ...recovered,
    sortie_outcome: "VICTORY",
    kill_count: 2,
  }));
  assert.equal(acePair.title, "Sortie complete");
  assert.equal(acePair.recoveryComplete, true);
});

test("victory requires outcome plus complete contact and survivable recovery", () => {
  for (const missing of Object.keys(recovered)) {
    const incomplete = { ...recovered };
    delete incomplete[missing];
    const result = f22SortieResult(state({ ...incomplete, sortie_outcome: "VICTORY" }));
    assert.equal(result.title, "Recovery incomplete", missing);
    assert.equal(result.recoveryComplete, false, missing);
  }

  const contactButUnsafelyRecovered = f22SortieResult(state({
    sortie_outcome: "VICTORY",
    runway_recovery_complete: true,
    runway_touchdown_contact: true,
    runway_touchdown_survivable: false,
  }));
  assert.equal(contactButUnsafelyRecovered.title, "Recovery incomplete");

  const discontinued = f22SortieResult(state({
    ...recovered,
    sortie_outcome: "DISCONTINUED",
  }));
  assert.equal(discontinued.title, "Recovered early");
  assert.equal(discontinued.practiceExercise, "gunnery");
});

test("a mutual kill remains a combat loss and recommends gunnery practice", () => {
  const result = f22SortieResult(state({
    sortie_outcome: "DRAW",
    kill_count: 1,
  }));
  assert.equal(result.title, "Mutual kill");
  assert.equal(result.brief, "Both aircraft lost.");
  assert.equal(result.correction, "Disengage before the exchange.");
  assert.equal(result.practiceExercise, "gunnery");
  assert.equal(result.recoveryComplete, false);
});

test("malformed numeric evidence stays out of F-22 facts and lessons", () => {
  const malformed = f22SortieResult(state({
    ...recovered,
    sortie_outcome: "VICTORY",
    kill_count: "two",
    fuel_lb: "NaN",
    fuel_reserve_margin_lb: "Infinity",
    runway_touchdown_deviations: "lineup",
  }));
  assert.equal(malformed.title, "Sortie complete");
  assert.deepEqual(malformed.facts, []);

  const negative = f22SortieResult(state({
    sortie_outcome: "DEFEAT",
    kill_count: -4.8,
  }));
  assert.deepEqual(negative.facts, ["Targets destroyed 0"]);
});

test("early bingo and partial success keep the recovery facts honest", () => {
  const bingo = f22SortieResult(state({
    ...recovered,
    sortie_outcome: "DISCONTINUED",
    kill_count: 1,
    fuel_lb: 3120.4,
    fuel_reserve_margin_lb: -879.6,
  }), { handoff: { occurred: true, returnReason: "BINGO_FUEL" } });
  assert.equal(bingo.title, "Recovered early");
  assert.equal(bingo.brief, "Bingo fuel. Aircraft safely recovered.");
  assert.equal(bingo.correction, "Use shorter passes to protect landing fuel.");
  assert.equal(bingo.practiceExercise, "gunnery");
  assert.deepEqual(bingo.facts, ["Targets destroyed 1", "Landing fuel 3120 LB", "Reserve −880 LB"]);

  const partial = f22SortieResult(state({ ...recovered, sortie_outcome: "DISCONTINUED" }), {
    handoff: { occurred: true, returnReason: "PILOT_KNOCK_IT_OFF" },
  });
  assert.equal(partial.brief, "Aircraft safe. Combat task unfinished.");
  assert.equal(partial.correction, "Practise tracking before the next gun engagement.");
  assert.equal(partial.practiceExercise, "gunnery");
  assert.doesNotMatch(partial.facts.join(" "), /fuel|reserve/i);
});

test("landing deviation masks follow the C# priority order", () => {
  const cases = [
    [1 | 2, "Lower and lock the gear before touchdown."],
    [128 | 512 | 1024 | 2, "Stabilise the aircraft attitude before touchdown."],
    [2 | 8, "Reduce the descent rate before touchdown."],
    [4 | 16 | 32 | 2048, "Restore approach speed before touchdown."],
    [16 | 32 | 2048 | 64, "Align with the runway before touchdown."],
    [64, "Go around when the landing runs long."],
  ];
  for (const [mask, correction] of cases) {
    const result = f22SortieResult(state({
      sortie_outcome: "DEFEAT",
      runway_touchdown_contact: true,
      runway_touchdown_deviations: mask,
    }));
    assert.equal(result.correction, correction, `mask ${mask}`);
    assert.equal(result.practiceExercise, "recovery");
  }
});

test("recovery and valley practice suggestions use recorded evidence", () => {
  const recovery = f22SortieResult(state({
    sortie_outcome: "DEFEAT",
    runway_touchdown_contact: true,
    runway_touchdown_deviations: 0,
  }));
  assert.equal(recovery.practiceExercise, "recovery");

  const valley = f22SortieResult(state({
    sortie_outcome: "DEFEAT",
    first_run_weapons_cold: true,
  }));
  assert.equal(valley.practiceExercise, "valley");

  const gunnery = f22SortieResult(state({ sortie_outcome: "DEFEAT" }));
  assert.equal(gunnery.practiceExercise, "gunnery");

  const groundLoss = f22SortieResult(state({
    sortie_outcome: "DEFEAT",
    player_impact_surface: "GROUND",
  }));
  assert.equal(groundLoss.practiceExercise, "valley");

  const returningGcas = f22SortieResult(state({
    sortie_outcome: "DEFEAT",
    auto_gcas_activation_count: 1,
  }), { handoff: { occurred: true } });
  assert.equal(returningGcas.practiceExercise, "recovery");

  const noFabricatedFuel = f22SortieResult(state({ ...recovered, sortie_outcome: "VICTORY" }));
  assert.deepEqual(noFabricatedFuel.facts, []);
});

test("caller safety lessons still override the F-22 card safely", () => {
  const result = sortieResultCopy(state({
    ...recovered,
    sortie_outcome: "VICTORY",
    kill_count: 2,
    auto_gcas_activation_count: 1,
  }));
  assert.equal(result.f22Sortie, true);
  assert.equal(result.safetyCorrection, "Discontinue after an Auto-GCAS fly-up.");
  assert.equal(result.practiceExercise, "valley");
});
