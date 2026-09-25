import assert from "node:assert/strict";
import test from "node:test";
import { sortieGradeBoard } from "../sortie_grade.js";

test("a clean kill with disciplined gunnery is an A", () => {
  const board = sortieGradeBoard({
    kill_count: 1,
    sortie_hits: 12,
    sortie_rounds_fired: 40,
    simulation_time_s: 95,
    pilot_peak_positive_g: 7.4,
    sortie_outcome: "QUALIFIED",
    player_health: 1,
  });
  assert.equal(board.kills, "1");
  assert.equal(board.accuracy, "30%");
  assert.equal(board.g, "7.4");
  assert.equal(board.time, "1:35");
});

test("a kill with no recorded rounds is a B, not a fabricated accuracy", () => {
  const board = sortieGradeBoard({
    kill_count: 2,
    sortie_hits: 0,
    sortie_rounds_fired: 0,
    simulation_time_s: 40,
  });
  assert.equal(board.accuracy, "—");
  assert.equal(board.g, "—");
});

test("dying without a kill is a D", () => {
  const board = sortieGradeBoard({
    kill_count: 0,
    sortie_hits: 3,
    sortie_rounds_fired: 80,
    sortie_outcome: "AIRCRAFT_LOST",
    simulation_time_s: 12.2,
    pilot_peak_positive_g: 9,
  });
  assert.equal(board.time, "0:12");
});

test("missing snapshot fields stay blank rather than NaN", () => {
  const board = sortieGradeBoard(null);
  assert.deepEqual(board, {
    kills: "0",
    accuracy: "—",
    g: "—",
    time: "—",
  });
});
