import assert from "node:assert/strict";
import test from "node:test";

import { weekendRideResult } from "../weekend_ride_result.js";

test("a legal stop that beats the stored record is a personal best", () => {
  const result = weekendRideResult({
    lap: 2,
    last_lap_s: 84.21,
    best_lap_s: 82.456,
    clean_lap_s: 82.456,
    clean_flying_laps: 1,
    legal_stop: true,
    lap_time_s: 19.2,
    lap_valid: true,
    off_track_s: 0,
    best_sector_s: [20.1, 20.2, 20.3, 21.856],
  }, { recordAtStartSeconds: 90 });

  assert.equal(result.title, "PERSONAL BEST");
  assert.equal(result.verdict, "NEW RECORD");
  assert.equal(result.improvedRecord, true);
  assert.equal(result.summary, "In the box. New record · 1:22.45.");
  assert.equal(result.correction, "Next · the corner speed comes off the card.");
  assert.deepEqual(result.metrics.slice(0, 3).map(({ value }) => value), [
    "2", "1:24.21", "1:22.45",
  ]);
  assert.deepEqual(result.sectors, ["0:20.10", "0:20.20", "0:20.30", "0:21.85"]);
  assert.equal(result.metrics.find(({ label }) => label === "LAST").visible, true);
  assert.equal(result.metrics.find(({ label }) => label === "RECORD").visible, true);
  assert.equal(result.hasSectorEvidence, true);
});

test("a legal stop with a clean lap that misses the stored record is not a personal best", () => {
  const result = weekendRideResult({
    lap: 2,
    last_lap_s: 90,
    best_lap_s: 82,
    clean_lap_s: 90,
    clean_flying_laps: 1,
    legal_stop: true,
    lap_time_s: 8,
    lap_valid: true,
    off_track_s: 0,
  }, { recordAtStartSeconds: 82 });

  assert.equal(result.title, "RIDE COMPLETE");
  assert.equal(result.verdict, "IN THE BOX");
  assert.equal(result.improvedRecord, false);
  assert.equal(result.summary, "In the box. Clean lap 1:30.00.");
  assert.equal(result.correction, "Next · repeat it clean.");
});

test("an invalid open lap and off-track evidence remain explicit", () => {
  const result = weekendRideResult({
    lap: 0,
    lap_time_s: 43.5,
    best_lap_s: 0,
    last_lap_s: 0,
    lap_valid: false,
    off_track_s: 7.25,
    best_sector_s: [],
  });

  assert.equal(result.title, "STILL ON TRACK");
  assert.equal(result.summary, "Still on track.");
  assert.equal(result.correction, "Next · the session ends in the box.");
  assert.deepEqual(result.metrics.find(({ label }) => label === "OPEN LAP"), {
    label: "OPEN LAP", value: "INVALID", tone: "warning",
  });
  assert.equal(result.metrics.find(({ label }) => label === "OFF TRACK").value, "7.3 s");
  assert.deepEqual(result.sectors, ["—:——", "—:——", "—:——", "—:——"]);
  assert.equal(result.metrics.find(({ label }) => label === "LAST").visible, false);
  assert.equal(result.metrics.find(({ label }) => label === "RECORD").visible, false);
  assert.equal(result.hasSectorEvidence, false);
});

test("ending before motion degrades to an honest empty session", () => {
  const result = weekendRideResult({});

  assert.equal(result.title, "STILL ON TRACK");
  assert.equal(result.verdict, "STILL OUT");
  assert.equal(result.summary, "Still on track.");
  assert.equal(result.correction, "Next · the session ends in the box.");
});

test("an invalid lap with zero off-track time is not mislabeled as leaving the paint", () => {
  const result = weekendRideResult({
    lap: 0,
    lap_time_s: 21,
    lap_valid: false,
    off_track_s: 0,
  });

  assert.equal(result.summary, "Still on track.");
  assert.equal(result.correction, "Next · the session ends in the box.");
  assert.doesNotMatch(`${result.summary} ${result.correction}`, /off track|inside the paint/i);
});

test("a grid reset cannot turn retained off-track evidence into a clean debrief", () => {
  const result = weekendRideResult({
    lap: 0,
    lap_time_s: 0,
    lap_valid: true,
    off_track_s: 4.5,
  });

  assert.equal(result.title, "STILL ON TRACK");
  assert.equal(result.metrics.find(({ label }) => label === "OFF TRACK").value, "4.5 s");
  assert.equal(result.summary, "Still on track.");
  assert.equal(result.correction, "Next · the session ends in the box.");
});

test("a quit before the hairpin says how far the apex still was", () => {
  const result = weekendRideResult({
    lap: 0,
    lap_time_s: 5.7,
    lap_valid: true,
    off_track_s: 0,
    next_apex_m: 2600,
    progress_m: 124,
  });

  assert.equal(result.title, "STILL ON TRACK");
  assert.equal(result.summary, "Stopped ~2.6 km before the hairpin.");
  assert.equal(result.correction, "Next · the session ends in the box.");
});

test("a nearer apex is stated in metres from the same progress field", () => {
  const result = weekendRideResult({
    lap: 0,
    lap_time_s: 6.2,
    lap_valid: true,
    off_track_s: 0,
    next_apex_m: 340,
  });

  assert.equal(result.summary, "Stopped ~340 m before the hairpin.");
});

test("a legal stop with no clean flying lap names the paint", () => {
  const result = weekendRideResult({
    legal_stop: true,
    lap: 2,
    clean_flying_laps: 0,
    off_track_s: 3.25,
  });
  assert.equal(result.title, "IN THE BOX");
  assert.equal(result.summary, "In the box. No clean lap. 3.3 s off the paint.");
  assert.equal(result.correction, "Next · both hairpins inside the paint, then the box.");
});

test("coming in before the checker is a completed stop and a missed session", () => {
  const result = weekendRideResult({
    legal_stop: true,
    came_in_early: true,
    lap: 1,
    clean_flying_laps: 1,
    clean_lap_s: 80,
  });
  assert.equal(result.title, "CAME IN EARLY");
  assert.equal(result.summary, "In the box on lap 1. The checker was still out.");
  assert.equal(result.correction, "Next · take both laps, then bring it in.");
});

test("a hot pit entry is named only after a later legal stop", () => {
  const stopped = weekendRideResult({
    legal_stop: true,
    hot_pit_entry: true,
    lap: 2,
    clean_flying_laps: 1,
    clean_lap_s: 80,
  });
  assert.equal(stopped.summary, "In the box. One pit entry was over 60 km/h.");
  assert.equal(stopped.correction, "Next · be at 60 before the box, then stop.");

  const quit = weekendRideResult({
    legal_stop: false,
    hot_pit_entry: true,
    next_apex_m: 400,
  });
  assert.equal(quit.title, "STILL ON TRACK");
  assert.equal(quit.summary, "Stopped ~400 m before the hairpin.");
});

test("quitting after a tip does not claim a parked bike", () => {
  const result = weekendRideResult({
    legal_stop: false,
    tip_count: 1,
    next_apex_m: 200,
  });
  assert.equal(result.summary, "Still on track. The bike went back to the grid.");
  assert.equal(result.correction, "Next · bring it in.");
});

test("a clean lap after a tip still completes the ride", () => {
  const result = weekendRideResult({
    legal_stop: true,
    tip_count: 1,
    clean_flying_laps: 1,
    clean_lap_s: 88.2,
    best_lap_s: 88.2,
    lap: 3,
  }, { recordAtStartSeconds: 88.2 });
  assert.equal(result.title, "RIDE COMPLETE");
  assert.equal(result.summary, "In the box. Clean lap 1:28.20. The bike went back to the grid once.");
});

test("debrief prose stays compact beside authoritative metrics", () => {
  const result = weekendRideResult({
    lap: 12,
    last_lap_s: 82,
    best_lap_s: 80,
    lap_time_s: 15,
    lap_valid: true,
  }, { recordAtStartSeconds: 80 });

  assert.ok(result.summary.length <= 40);
  assert.ok(result.correction.length <= 48);
  assert.doesNotMatch(result.summary, /completed|standing|open lap clean/i);
});
