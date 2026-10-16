import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  f22CombatDisposition, f22RecoveryDisposition, f22ResultInstrument, formatAttemptClock,
} from "../f22_result_instrument.js";

// Both fixtures are written by sim.Tests F22FiniteSortieTests from the real kernel projection.
const fixture = async (name) => ({ player_terminal_state: "FLYING", ...JSON.parse(
  await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) });

test("combat boundary: complete combat, recovery open, Recover offered, no landing claimed", async () => {
  const state = { ...(await fixture("f22_combat_complete.json")), sortie_hits: 2, sortie_rounds_fired: 61 };
  const model = f22ResultInstrument(state, { phase: "combat", durationSeconds: 95.4 });
  assert.equal(model.combat.status, "complete");
  assert.equal(model.combat.value, "2/2");
  assert.equal(model.recovery.status, "open");
  assert.match(model.recovery.label, /Not landed/);
  assert.equal(model.gun.value, "2/61");
  assert.equal(model.gun.clock, "1:35");
  assert.equal(model.opponent.value, "Competent → Ace ×2");
  assert.equal(model.opponent.changed, true);
  assert.match(model.opponent.label, /uprated/);
  assert.equal(model.correction, null);
  assert.equal(model.actions.recover, true);
});

test("beat 7 compact combat row shows wave count and score in one callout", async () => {
  const state = {
    ...(await fixture("f22_combat_complete.json")),
    escalating_waves: true,
    engagements_won: 4,
    combat_score: 950,
  };
  const model = f22ResultInstrument(state, { phase: "combat" });
  assert.equal(model.combat.value, "W4 · 950");
  assert.equal(model.combat.label, "4 waves won · 950 points · Combat complete");
  assert.ok(model.combat.label.length <= 64, "instrument callout must remain compact");
});

test("recovered victory: both results complete, no Recover, no landing lesson", async () => {
  const state = await fixture("f22_recovered_victory.json");
  const model = f22ResultInstrument(state, { phase: "final", correction: "" });
  assert.equal(model.combat.status, "complete");
  assert.equal(model.recovery.status, "recovered");
  assert.equal(model.recovery.symbol, "✓");
  assert.equal(model.actions.recover, false);
  assert.equal(model.correction, null);
});

test("early end after combat is a debrief with combat complete and LAND open", async () => {
  const state = {
    ...(await fixture("f22_combat_complete.json")),
    finished: true,
    sortie_outcome: "VICTORY",
    sortie_ended_early: true,
    runway_recovery_complete: false,
    runway_touchdown_contact: false,
    runway_touchdown_survivable: false,
  };
  const model = f22ResultInstrument(state, { phase: "final" });
  assert.equal(model.combat.status, "complete");
  assert.equal(model.recovery.status, "open");
  assert.match(model.recovery.label, /Not landed/);
  assert.equal(model.actions.recover, false);
  assert.equal(model.recovery.symbol, "–");
});

test("Recover is only offered while the real aircraft can continue", async () => {
  const boundary = await fixture("f22_combat_complete.json");
  for (const change of [
    { player_rtb_active: false },
    { sortie_outcome: "DEFEAT" },
    { combat_complete: false },
  ]) {
    assert.equal(f22ResultInstrument({ ...boundary, ...change }, { phase: "combat" })
      .actions.recover, false, JSON.stringify(change));
  }
  assert.equal(f22ResultInstrument(boundary, { phase: "final" }).actions.recover, false);
});

test("dispositions keep combat and recovery separate", async () => {
  const base = await fixture("f22_combat_complete.json");
  assert.equal(f22CombatDisposition({ ...base, combat_complete: false }), "open");
  assert.equal(f22CombatDisposition({ ...base, combat_complete: false, sortie_outcome: "DEFEAT" }), "lost");
  // A crash on landing after a completed fight: combat stands, recovery is lost.
  assert.equal(f22CombatDisposition({ ...base, sortie_outcome: "DEFEAT" }), "complete");
  assert.equal(f22RecoveryDisposition({ ...base, sortie_outcome: "DEFEAT" }), "lost");
  assert.equal(f22CombatDisposition({ ...base, practice_exercise: "gunnery" }), null);
});

test("a correction row appears only when there is a correction or a practice", async () => {
  const state = { ...(await fixture("f22_combat_complete.json")), sortie_outcome: "DEFEAT",
    combat_complete: false, difficulty_rung: 0, earned_opponent_skill: "COMPETENT",
    earned_opponent_count: 1, earned_opponent_mount: "Baseline" };
  const model = f22ResultInstrument(state, {
    phase: "final", correction: "Close before firing.", practiceExercise: "gunnery",
    practiceLabel: "Practise guns",
  });
  assert.deepEqual({ ...model.correction }, {
    text: "Close before firing.", practiceExercise: "gunnery", practiceLabel: "Practise guns",
  });
  assert.equal(model.combat.symbol, "×");
  assert.equal(model.opponent.value, "Competent → same");
  assert.equal(model.opponent.changed, false);
});

test("BFM lesson reuses the opponent row and uses the kernel correction", async () => {
  const state = {
    ...(await fixture("f22_combat_complete.json")),
    sortie_opponent_skill: "VETERAN", sortie_opponent_count: 1,
    bfm_lesson: "D1", bfm_next_lesson: "D1", bfm_lesson_outcome: "failed",
    bfm_lesson_criterion: "survive 12 s and force an overshoot",
    bfm_correction: "Break into him",
  };
  const model = f22ResultInstrument(state, {
    phase: "final", correction: "Track the lead", practiceExercise: "gunnery",
  });
  assert.equal(model.opponent.value, "D1 × → D1");
  assert.match(model.opponent.label, /Criterion: survive 12 s and force an overshoot/);
  assert.match(model.opponent.label, /Next lesson: D1/);
  assert.deepEqual({ ...model.correction }, {
    text: "Break into him", practiceExercise: "", practiceLabel: "",
  });
  assert.deepEqual({ ...model.lesson }, {
    id: "D1", next: "D1", outcome: "failed",
    criterion: "survive 12 s and force an overshoot",
  });
});

test("a passed BFM lesson shows the next lesson and suppresses generic correction", async () => {
  const model = f22ResultInstrument({
    ...(await fixture("f22_combat_complete.json")),
    sortie_opponent_skill: "COMPETENT", sortie_opponent_count: 1,
    bfm_lesson: "O1", bfm_next_lesson: "D1", bfm_lesson_outcome: "passed",
    bfm_lesson_criterion: "physical gun kill", bfm_correction: "ignored on pass",
  }, { correction: "Track the lead", practiceExercise: "gunnery" });
  assert.equal(model.opponent.value, "O1 ✓ → D1");
  assert.equal(model.correction, null);
  assert.equal(model.lesson.outcome, "passed");
});

test("unknown values render as a dash, never a fabricated number", () => {
  assert.equal(formatAttemptClock(null), "—");
  assert.equal(formatAttemptClock(Number.NaN), "—");
  assert.equal(formatAttemptClock(61.6), "1:02");
  const model = f22ResultInstrument({
    mission_definition_id: "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
    practice_exercise: "none",
  });
  assert.equal(model.opponent.value, "—");
  assert.equal(model.combat.value, "");
  assert.equal(model.gun.value, "0/0");
});

for (const terminal of ["DESTROYED_AIRBORNE", "IMPACTED"]) {
  test(`physical ${terminal} before final outcome loses recovery and cannot Recover`, async () => {
    const state = { ...(await fixture("f22_combat_complete.json")),
      player_terminal_state: terminal, sortie_outcome: "NONE", session_phase: "ACTIVE" };
    assert.equal(f22RecoveryDisposition(state), "lost");
    assert.equal(f22ResultInstrument(state, { phase: "combat" }).actions.recover, false);
    assert.equal(f22CombatDisposition(state), "complete");
    assert.equal(f22CombatDisposition({ ...state, combat_complete: false }), "lost");
  });
}
