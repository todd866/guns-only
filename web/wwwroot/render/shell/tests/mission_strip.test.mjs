import assert from "node:assert/strict";
import test from "node:test";
import { missionStrip, paintMissionStrip } from "../mission_strip.js";

test("pause strip uses the attempt epoch and finite engagement contract", () => {
  assert.deepEqual(missionStrip({ attempt_elapsed_s: 66, simulation_time_s: 900,
    engagements_won: 1, engagement_cap: 2 }, { mode: "Guns Only", startSeconds: 800 }),
  { mode: "Guns Only", clock: "1:06", engagements: "1/2" });
});

test("restarts and practice use their own clocks instead of the session clock", () => {
  assert.equal(missionStrip({ simulation_time_s: 900 }, { startSeconds: 895 }).clock, "0:05");
  assert.equal(missionStrip({ practice_exercise: "gunnery", practice_elapsed_s: 14,
    attempt_elapsed_s: 200 }).clock, "0:14");
});

test("missing clocks and unavailable engagement contracts are omitted, not zero-filled", () => {
  for (const state of [null, {}, { simulation_time_s: 300 },
    { attempt_elapsed_s: Number.NaN, engagements_won: 0, engagement_cap: 0 },
    { engagements_won: null, engagement_cap: 2 }, { engagements_won: 0 },
    { engagements_won: 0, engagement_cap: -1 }]) {
    const model = missionStrip(state);
    assert.equal(model.clock, null);
    assert.equal(model.engagements, null);
  }
  assert.equal(missionStrip({ engagements_won: 0, engagement_cap: 2 }).engagements, "0/2");
});

test("painting a different mission hides stale metrics without rebuilding controls", () => {
  const mode = { textContent: "", parentElement: {} };
  const metric = () => ({ hidden: true, number: { textContent: "" }, querySelector() { return this.number; } });
  const clock = metric(), engagements = metric();
  const root = { querySelector: id => ({ "#ready-mission-mode": mode,
    "#ready-mission-clock": clock, "#ready-mission-engagements": engagements })[id] };
  paintMissionStrip(root, { attempt_elapsed_s: 0, engagements_won: 0, engagement_cap: 2 },
    { mode: "Guns Only" });
  assert.equal(root.hidden, false);
  assert.equal(clock.number.textContent, "0:00");
  assert.equal(engagements.number.textContent, "0/2");
  paintMissionStrip(root, {}, { mode: "Circuits" });
  assert.equal(mode.textContent, "Circuits");
  assert.equal(clock.hidden, true);
  assert.equal(engagements.hidden, true);
  paintMissionStrip(root, {});
  assert.equal(root.hidden, true);
  assert.equal(mode.parentElement.hidden, true);
  paintMissionStrip(root, { attempt_elapsed_s: 12 });
  assert.equal(root.hidden, false, "a clock alone is enough session evidence to show");
  assert.equal(clock.hidden, false);
  assert.equal(clock.number.textContent, "0:12");
});
