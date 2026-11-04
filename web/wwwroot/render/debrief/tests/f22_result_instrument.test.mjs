import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  F22_PERSONAL_BEST_KEY_PREFIX,
  createF22ResultKeyHandler,
  f22CombatDisposition,
  f22PersonalBestKey,
  f22RecoveryDisposition,
  f22ResultInstrument,
  formatAttemptClock,
  paintF22ResultInstrument,
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

test("result painting preserves shared SVGs while status, practice and recovery actions change", async () => {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      dataset: {}, textContent: "", attributes: {}, hidden: false,
      getAttribute(name) { return this.attributes[name]; },
      setAttribute(name, value) { this.attributes[name] = value; },
      querySelector(selector) { return node(`${id} ${selector}`); },
    });
    return nodes.get(id);
  };
  const root = { querySelector: node };
  const state = await fixture("f22_combat_complete.json");
  const storage = memoryStorage({ [f22PersonalBestKey(state)]: "200" });
  paintF22ResultInstrument(root, f22ResultInstrument(state, { phase: "combat", storage }));
  assert.equal(node("#f22-combat-symbol").getAttribute("href"), "#shell-check");
  assert.equal(node("#f22-recovery-symbol").getAttribute("href"), "#shell-minus");
  assert.equal(node("#f22-score").textContent, "250 · W2 ×1 · 0-hit +250 · land +0");
  assert.equal(node("#f22-best").dataset.status, "best");
  assert.equal(node("#f22-best-symbol").getAttribute("href"), "#shell-mark");
  assert.equal(node("#f22-best-delta").textContent, "+50");
  assert.equal(node("#f22-recover").hidden, false);
  paintF22ResultInstrument(root, f22ResultInstrument({ ...state, sortie_outcome: "DEFEAT" },
    { phase: "final", correction: "Close before firing", practiceExercise: "gunnery", practiceLabel: "Practise guns", storage }));
  assert.equal(node("#f22-recovery-symbol").getAttribute("href"), "#shell-close");
  assert.equal(node("#f22-recovery-symbol").textContent, "");
  assert.equal(node("#f22-best").dataset.status, "below");
  assert.equal(node("#f22-best-symbol").getAttribute("href"), "#shell-minus");
  assert.equal(node("#f22-best-delta").textContent, "-250");
  assert.equal(node("#f22-recover").hidden, true);
  assert.equal(node("#f22-practice .shell-action-label").textContent, "Practise guns");
  assert.equal(node("#f22-practice").textContent, "");
  paintF22ResultInstrument(root, null);
  assert.equal(root.hidden, true);
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

test("score row sums snapshot wave score plus deterministic untouched and landing bonuses", async () => {
  const combatState = {
    ...(await fixture("f22_combat_complete.json")),
    escalating_waves: true,
    engagements_won: 4,
    wave_score_multiplier: 2,
    combat_score: 550,
    opponent_hits: 0,
  };
  const untouchedOpenRecovery = f22ResultInstrument(combatState, {
    phase: "combat",
    storage: null,
  });
  assert.equal(untouchedOpenRecovery.score.combatScore, 550);
  assert.equal(untouchedOpenRecovery.score.wave, 4);
  assert.equal(untouchedOpenRecovery.score.multiplier, 2);
  assert.equal(untouchedOpenRecovery.score.untouched, true);
  assert.equal(untouchedOpenRecovery.score.untouchedBonus, 250);
  assert.equal(untouchedOpenRecovery.score.landingBonus, 0);
  assert.equal(untouchedOpenRecovery.score.total, 800);
  assert.match(untouchedOpenRecovery.score.value, /800/);
  assert.match(untouchedOpenRecovery.score.value, /W4 ×2/);
  assert.match(untouchedOpenRecovery.score.value, /\+250/);
  assert.equal(untouchedOpenRecovery.recovery.symbol, "–");
  assert.match(untouchedOpenRecovery.recovery.label, /Not landed.*\+150 landing bonus/);

  const landedAndUntouched = f22ResultInstrument({
    ...(await fixture("f22_recovered_victory.json")),
    escalating_waves: true,
    engagements_won: 5,
    wave_score_multiplier: 2.5,
    combat_score: 800,
    opponent_hits: 0,
  }, { phase: "final", storage: null });
  assert.equal(landedAndUntouched.score.combatScore, 800);
  assert.equal(landedAndUntouched.score.wave, 5);
  assert.equal(landedAndUntouched.score.multiplier, 2.5);
  assert.equal(landedAndUntouched.score.untouchedBonus, 250);
  assert.equal(landedAndUntouched.score.landingBonus, 150);
  assert.equal(landedAndUntouched.score.total, 1200);
  assert.match(landedAndUntouched.score.value, /1200/);
  assert.match(landedAndUntouched.score.value, /W5 ×2\.5/);
  assert.match(landedAndUntouched.score.value, /\+250/);
  assert.match(landedAndUntouched.score.value, /\+150/);
  assert.equal(landedAndUntouched.recovery.symbol, "✓");
  assert.match(landedAndUntouched.recovery.label, /Landed and stopped.*\+150 landing bonus/);

  const hitAndUnrecovered = f22ResultInstrument({
    ...combatState,
    opponent_hits: 2,
  }, { phase: "final", storage: null });
  assert.equal(hitAndUnrecovered.score.untouched, false);
  assert.equal(hitAndUnrecovered.score.untouchedBonus, 0);
  assert.equal(hitAndUnrecovered.score.landingBonus, 0);
  assert.equal(hitAndUnrecovered.score.total, 550);
});

test("personal best delta: first run has no delta, higher run is new best, lower run is negative delta", async () => {
  const storage = memoryStorage();
  const base = {
    ...(await fixture("f22_combat_complete.json")),
    escalating_waves: true,
    engagements_won: 3,
    wave_score_multiplier: 1.5,
    opponent_hits: 0,
  };

  // First run: 350 + 250 = 600. Stored as PB, no delta displayed.
  const first = f22ResultInstrument({ ...base, combat_score: 350 }, { storage });
  assert.equal(first.score.total, 600);
  assert.equal(first.score.previousBest, null);
  assert.equal(first.score.delta, null);
  assert.equal(first.score.deltaText, "");
  assert.equal(first.score.newBest, false);
  assert.equal(first.score.best, 600);
  assert.ok(f22PersonalBestKey(base).startsWith(F22_PERSONAL_BEST_KEY_PREFIX));
  assert.equal(Number(storage.getItem(f22PersonalBestKey(base))), 600);

  // Second run higher: 550 + 250 + 150 = 950. New best (+350) by symbol/status, not prose.
  const second = f22ResultInstrument({
    ...(await fixture("f22_recovered_victory.json")),
    escalating_waves: true,
    engagements_won: 4,
    wave_score_multiplier: 2,
    combat_score: 550,
    opponent_hits: 0,
  }, { storage });
  assert.equal(second.score.total, 950);
  assert.equal(second.score.previousBest, 600);
  assert.equal(second.score.delta, 350);
  assert.equal(second.score.deltaText, "+350");
  assert.equal(second.score.newBest, true);
  assert.equal(second.score.status, "best");
  assert.equal(second.score.symbol, "★");
  assert.equal(second.score.best, 950);
  assert.equal(Number(storage.getItem(f22PersonalBestKey(base))), 950);

  // Third run lower: 350 + 0 + 0 = 350. Negative delta (-600), PB preserved at 950.
  const third = f22ResultInstrument({
    ...base,
    combat_score: 350,
    opponent_hits: 1,
  }, { storage });
  assert.equal(third.score.total, 350);
  assert.equal(third.score.previousBest, 950);
  assert.equal(third.score.delta, -600);
  assert.equal(third.score.deltaText, "-600");
  assert.equal(third.score.newBest, false);
  assert.equal(third.score.status, "below");
  assert.equal(third.score.best, 950);
  assert.equal(Number(storage.getItem(f22PersonalBestKey(base))), 950);

  // Read-only / throwing storage fails safe without breaking score calculation.
  const throwingStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const readOnlyModel = f22ResultInstrument({ ...base, combat_score: 350 }, { storage: throwingStorage });
  assert.equal(readOnlyModel.score.total, 600);
  assert.equal(readOnlyModel.score.delta, null);
});

test("Space and Enter trigger Again once on result screen without firing flight controls or repeating while held", () => {
  let resultActive = true;
  let againCount = 0;
  let flightSpaceCount = 0;
  const handler = createF22ResultKeyHandler({
    isResultActive: () => resultActive,
    onAgain: () => {
      againCount++;
      resultActive = false;
    },
  });
  const dispatchDown = (code, { repeat = false, target = null } = {}) => {
    let prevented = false;
    const event = { code, repeat, target, preventDefault() { prevented = true; } };
    const consumed = handler.keydown(event);
    if (!consumed && !resultActive && code === "Space" && !repeat) flightSpaceCount++;
    return { consumed, prevented };
  };
  const dispatchUp = (code) => {
    let prevented = false;
    const consumed = handler.keyup({ code, preventDefault() { prevented = true; } });
    return { consumed, prevented };
  };

  // Pressing Space on the result screen triggers Again and closes the result screen.
  assert.deepEqual(dispatchDown("Space"), { consumed: true, prevented: true });
  assert.equal(againCount, 1);
  assert.equal(resultActive, false);

  // Holding Space across the restart into live flight neither re-triggers Again nor fires Space flight override.
  assert.deepEqual(dispatchDown("Space", { repeat: true }), { consumed: true, prevented: true });
  assert.deepEqual(dispatchDown("Space", { repeat: false }), { consumed: true, prevented: true });
  assert.equal(againCount, 1);
  assert.equal(flightSpaceCount, 0);

  // Releasing Space clears the hold; the next fresh press in flight reaches the flight control.
  assert.deepEqual(dispatchUp("Space"), { consumed: true, prevented: true });
  assert.deepEqual(dispatchDown("Space"), { consumed: false, prevented: false });
  assert.equal(flightSpaceCount, 1);

  // Enter on the result screen triggers Again; Recover/Logbook focus stays untouched.
  resultActive = true;
  const recoverButton = { id: "f22-recover", closest() { return this; } };
  const logbookButton = { id: "f22-logbook", closest() { return this; } };
  assert.deepEqual(dispatchDown("Enter", { target: recoverButton }), { consumed: false, prevented: false });
  assert.deepEqual(dispatchDown("Space", { target: logbookButton }), { consumed: false, prevented: false });
  assert.equal(againCount, 1);

  const againButton = { id: "f22-again", closest() { return this; } };
  assert.deepEqual(dispatchDown("Enter", { target: againButton }), { consumed: true, prevented: true });
  assert.equal(againCount, 2);
  assert.deepEqual(dispatchDown("Enter", { repeat: true, target: againButton }), { consumed: true, prevented: true });
  assert.equal(againCount, 2);
  dispatchUp("Enter");
});
