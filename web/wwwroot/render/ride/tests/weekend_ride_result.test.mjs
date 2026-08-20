import assert from "node:assert/strict";
import test from "node:test";

import { weekendRideResult } from "../weekend_ride_result.js";

test("a first clean record is credited to this ride", () => {
  const result = weekendRideResult({
    lap: 2,
    last_lap_s: 84.21,
    best_lap_s: 82.456,
    lap_time_s: 19.2,
    lap_valid: true,
    off_track_s: 0,
    best_sector_s: [20.1, 20.2, 20.3, 21.856],
  });

  assert.equal(result.title, "PERSONAL BEST");
  assert.equal(result.verdict, "CLEAN LAP BANKED");
  assert.equal(result.improvedRecord, true);
  assert.match(result.correction, /repeat the clean line/i);
  assert.deepEqual(result.metrics.slice(0, 3).map(({ value }) => value), [
    "2", "1:24.21", "1:22.45",
  ]);
  assert.deepEqual(result.sectors, ["0:20.10", "0:20.20", "0:20.30", "0:21.85"]);
});

test("a carried record is not falsely claimed as a personal best", () => {
  const result = weekendRideResult({
    lap: 1,
    last_lap_s: 90,
    best_lap_s: 82,
    lap_time_s: 8,
    lap_valid: true,
    off_track_s: 0,
  }, { recordAtStartSeconds: 82 });

  assert.equal(result.title, "RIDE COMPLETE");
  assert.equal(result.verdict, "LAPS RECORDED");
  assert.equal(result.improvedRecord, false);
  assert.match(result.summary, /Standing record 1:22\.00/);
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

  assert.equal(result.verdict, "NO CLEAN LAP");
  assert.match(result.summary, /Open lap invalid at 0:43\.50/);
  assert.match(result.correction, /brake before turn-in/i);
  assert.deepEqual(result.metrics.find(({ label }) => label === "OPEN LAP"), {
    label: "OPEN LAP", value: "INVALID", tone: "warning",
  });
  assert.equal(result.metrics.find(({ label }) => label === "OFF TRACK").value, "7.3 s");
  assert.deepEqual(result.sectors, ["—:——", "—:——", "—:——", "—:——"]);
});

test("ending before motion degrades to an honest empty session", () => {
  const result = weekendRideResult({});

  assert.equal(result.title, "RIDE COMPLETE");
  assert.equal(result.verdict, "SESSION BANKED");
  assert.match(result.summary, /0 completed laps\. No open timed lap\./);
  assert.match(result.correction, /complete one measured lap/i);
});

test("a grid reset cannot turn retained off-track evidence into a clean debrief", () => {
  const result = weekendRideResult({
    lap: 0,
    lap_time_s: 0,
    lap_valid: true,
    off_track_s: 4.5,
  });

  assert.equal(result.verdict, "NO CLEAN LAP");
  assert.equal(result.metrics.find(({ label }) => label === "OFF TRACK").value, "4.5 s");
  assert.match(result.correction, /keep both wheels inside the paint/i);
});
