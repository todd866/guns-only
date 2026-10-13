import assert from "node:assert/strict";
import test from "node:test";
import { PRACTICE_EXERCISES, practiceExercise, practiceResult, shortFinalEvidence } from "../practice.js";

test("short final is a separate three-minute recovery start beside the ten-minute exercise", () => {
  const index = PRACTICE_EXERCISES.findIndex(p => p.id === "recovery");
  const short = PRACTICE_EXERCISES[index + 1];
  assert.equal(short.id, "shortfinal");
  assert.equal(short.code, 4);
  assert.equal(short.limit, "3 minutes");
  assert.equal(short.compact, true);
  assert.equal(practiceExercise("recovery").limit, "10 minutes");
});

test("airborne failure makes no invented touchdown or landing-deviation claim", () => {
  const result = practiceResult({ practice_exercise: "shortfinal", practice_status: "timelimit",
    runway_touchdown_contact: false, runway_touchdown_sink_mps: 0, runway_touchdown_deviations: 2 });
  assert.equal(result.title, "Time limit reached");
  assert.equal(result.brief, "CONTACT —");
  assert.equal(result.correction, ""); // evidence occupies one row, not two
});

test("failed contact reports recorded rate, runway position and deviation only", () => {
  const result = practiceResult({ practice_exercise: "shortfinal", practice_status: "lost",
    runway_touchdown_contact: true, runway_touchdown_sink_mps: 6.42,
    runway_touchdown_along_m: 1890.4, runway_touchdown_cross_m: -21.6,
    runway_touchdown_deviations: 2 | 32 | 64 });
  assert.equal(result.title, "Aircraft lost");
  assert.equal(result.brief, "↓ 6.4 m/s · RWY 1890 m · CL -22 m · SINK · LINEUP · LONG");
});

test("contact alone never claims exercise complete and missing data never becomes zero", () => {
  const state = { practice_exercise: "shortfinal", runway_touchdown_contact: true,
    runway_touchdown_survivable: true, runway_touchdown_sink_mps: null,
    runway_touchdown_along_m: NaN, runway_touchdown_cross_m: undefined };
  assert.equal(shortFinalEvidence(state), "CONTACT ✓");
  assert.equal(practiceResult(state).title, "Exercise ended");
  assert.equal(practiceResult({ ...state, practice_completed: true }).title, "Exercise complete");
});
