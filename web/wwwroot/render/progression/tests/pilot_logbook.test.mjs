import test from "node:test";
import assert from "node:assert/strict";
import { createPilotLogbook, LOGBOOK_KEY, snapshotAttemptResult, compareAttempts } from "../pilot_logbook.js";

function fixture() {
  const data = new Map(); let clock = 1_780_000_000_000; let id = 0;
  const storage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v) };
  return { data, storage, book: createPilotLogbook({ storage, now: () => clock++, newId: () => `attempt-${++id}` }) };
}
test("real lifecycle edges record once and preserve epoch dates and separate practice", () => {
  const { book } = fixture();
  // The session clock had already run 200 s in an earlier attempt; duration is this attempt's.
  book.begin({ activity: "Valley", exercise: "valley", startSimSeconds: 200 });
  book.begin({ activity: "duplicate" });
  const result = snapshotAttemptResult({ practice_exercise: "valley", practice_status: "completed",
    simulation_time_s: 278, sortie_rounds_fired: 0, sortie_hits: 0, kill_count: 0,
    first_run_valley_available: true, first_run_weapons_cold: false },
  { startSimSeconds: book.pendingStartSimSeconds });
  book.finish(result); book.finish(result);
  const [record] = book.list();
  assert.equal(book.list().length, 1);
  assert.equal(record.kind, "practice"); assert.equal(record.activity, "Valley");
  assert.equal(record.startedAt, 1_780_000_000_000); assert.equal(record.durationSeconds, 78);
  assert.equal(record.outcome, "Exercise complete"); assert.equal(record.valleyCleared, true);
  assert.equal(record.recovered, false);
});
test("abandonment never becomes a success and recovery uses physical snapshot names", () => {
  assert.equal(snapshotAttemptResult({ sortie_outcome: "VICTORY" }, { abandoned: true }).outcome, "Left before completion");
  assert.equal(snapshotAttemptResult({ combat_handoff_phase: 5 }).recovered, false);
  assert.equal(snapshotAttemptResult({ runway_recovery_phase_name: "RECOVERED" }).recovered, true);
});
test("corrupt and denied storage do not break the loop; history stays bounded", () => {
  const { storage, data } = fixture(); data.set(LOGBOOK_KEY, "bad JSON");
  let n = 0;
  const book = createPilotLogbook({ storage, newId: () => `a${n++}` });
  assert.deepEqual(book.list(), []);
  for (let i = 0; i < 105; i++) { book.begin({ activity: "Gunnery" }); book.finish({ outcome: "Ended" }); }
  assert.equal(book.list().length, 100); assert.equal(book.list()[0].id, "a5");
  const denied = createPilotLogbook({ storage: { getItem() { throw Error(); }, setItem() { throw Error(); } }, newId: () => "private" });
  denied.begin({ activity: "F22" }); denied.finish({ outcome: "Ended" });
  assert.equal(denied.list().length, 1); assert.equal(denied.storageAvailable, false);
});
test("another tab's completed record is merged and clearing removes local history", () => {
  const { book, storage } = fixture();
  const other = createPilotLogbook({ storage, newId: () => "other" });
  book.begin({ activity: "A" }); other.begin({ activity: "B" });
  other.finish({ outcome: "Ended" }); book.finish({ outcome: "Ended" });
  assert.deepEqual(book.list().map((a) => a.activity).sort(), ["A", "B"]);
  assert.equal(other.list().length, 2, "opening another tab's notebook refreshes history");
  book.clear(); assert.equal(JSON.parse(storage.getItem(LOGBOOK_KEY)).attempts.length, 0);
  assert.equal(other.list().length, 0);
  other.begin({ activity: "C" }); other.finish({ outcome: "Ended" });
  assert.deepEqual(book.list().map((a) => a.activity), ["C"], "cleared records stay deleted");
});
test("comparison uses like-for-like attempts and excludes unfinished speed claims", () => {
  const a = { id: "a", activity: "Guns", kind: "practice", exercise: "gunnery", rounds: 20, hits: 2 };
  const b = { ...a, id: "b", rounds: 10, hits: 2 };
  assert.match(compareAttempts([a, b], b), /\+10.0 percentage points/);
  assert.equal(compareAttempts([{ ...a, kind: "sortie" }], b), "First recorded attempt");
});

test("quota failures retain unsaved attempts and clear remains effective in memory", () => {
  const { storage } = fixture(); let denied = true; let id = 0;
  const book = createPilotLogbook({ newId: () => `quota-${++id}`, storage: {
    getItem: storage.getItem,
    setItem(k, v) { if (denied) throw Error("quota"); storage.setItem(k, v); },
  } });
  book.begin({ activity: "A" }); book.finish({ outcome: "Ended" });
  book.begin({ activity: "B" }); book.finish({ outcome: "Ended" });
  assert.equal(book.list().length, 2);
  book.clear(); assert.equal(book.list().length, 0);
  denied = false; book.begin({ activity: "C" }); book.finish({ outcome: "Ended" });
  assert.equal(book.storageAvailable, true);
  assert.deepEqual(book.list().map((a) => a.activity), ["C"]);
});

const F22 = "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1";
const f22 = (overrides = {}) => ({
  mission_definition_id: F22, practice_exercise: "none", sortie_rung: 0,
  sortie_opponent_skill: "COMPETENT", sortie_opponent_count: 1, assisted_flight: false,
  sortie_rounds_fired: 100, sortie_hits: 2, ...overrides,
});

test("attempt duration ignores the monotonic session clock and prefers a kernel epoch", () => {
  assert.equal(snapshotAttemptResult(f22({ simulation_time_s: 412.5 }),
    { startSimSeconds: 400 }).durationSeconds, 12.5);
  assert.equal(snapshotAttemptResult(f22({ simulation_time_s: 412.5 })).durationSeconds, null);
  assert.equal(snapshotAttemptResult(f22({ simulation_time_s: 412.5, attempt_elapsed_s: 3 }),
    { startSimSeconds: 400 }).durationSeconds, 3);
});

test("F-22 attempts store the contract and separate combat from recovery", () => {
  const { book } = fixture();
  book.begin({ activity: "Guns Only", startSimSeconds: 0 });
  const boundary = book.finish(snapshotAttemptResult(f22({
    combat_complete: true, sortie_outcome: "NONE", simulation_time_s: 95,
  }), { combatResult: true, startSimSeconds: 0 }));
  assert.equal(boundary.outcome, "Combat complete");
  assert.equal(boundary.combat, "complete");
  assert.equal(boundary.recovery, "open");
  assert.equal(boundary.recovered, false);
  assert.equal(boundary.rung, 0);
  assert.equal(boundary.opponent, "COMPETENTx1");
  assert.equal(boundary.assist, "manual");

  const landed = snapshotAttemptResult(f22({
    combat_complete: true, sortie_outcome: "VICTORY", runway_recovery_complete: true,
    runway_touchdown_contact: true, runway_touchdown_survivable: true,
  }));
  assert.equal(landed.combat, "complete");
  assert.equal(landed.recovery, "recovered");

  const lost = snapshotAttemptResult(f22({ sortie_outcome: "DEFEAT" }));
  assert.equal(lost.combat, "lost");
  assert.equal(lost.recovery, "lost");

  const left = snapshotAttemptResult(f22({ sortie_outcome: "NONE" }), { abandoned: true });
  assert.equal(left.combat, "open");
  assert.equal(left.recovery, "open");
});

test("comparisons are like-for-like: a harder opponent is not a regression", () => {
  const { book } = fixture();
  const fly = (overrides) => {
    book.begin({ activity: "Guns Only", startSimSeconds: 0 });
    return book.finish(snapshotAttemptResult(f22({ sortie_outcome: "DEFEAT", ...overrides })));
  };
  fly({ sortie_hits: 20 });
  const veteran = fly({ sortie_rung: 1, sortie_opponent_skill: "VETERAN", sortie_hits: 2 });
  assert.equal(compareAttempts(book.list(), veteran), "First attempt against this opponent");
  const assisted = fly({ sortie_rung: 1, sortie_opponent_skill: "VETERAN", assisted_flight: true });
  assert.equal(compareAttempts(book.list(), assisted), "First attempt against this opponent");
  const again = fly({ sortie_rung: 1, sortie_opponent_skill: "VETERAN", sortie_hits: 4 });
  assert.match(compareAttempts(book.list(), again), /^Hit rate \+2\.0 percentage points/);
});
