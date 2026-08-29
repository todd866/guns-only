import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MISSION_AI_SELECTION,
  MISSION_AI_RUNNERS,
  parseMissionAiSelection,
  runMissionAiSuite,
} from "./mission_ai_suite.mjs";

test("coverage ledger includes each autonomous production-input mission family", () => {
  assert.deepEqual(DEFAULT_MISSION_AI_SELECTION, [
    "cobra", "f22", "first-run", "top-gun", "rapier", "indoor", "weekend", "okanagan",
    "casevac",
  ]);
  for (const name of DEFAULT_MISSION_AI_SELECTION) {
    assert.equal(typeof MISSION_AI_RUNNERS[name], "function", name);
  }
});

test("selection rejects silent coverage typos and removes duplicates", () => {
  assert.deepEqual(parseMissionAiSelection("cobra, f22,cobra"), ["cobra", "f22"]);
  assert.throws(
    () => parseMissionAiSelection("cobra,unknown"),
    /unknown AI mission: unknown; available:/,
  );
});

test("suite runs sequentially, isolates artifacts and preserves failures", async () => {
  const calls = [];
  const runners = {
    alpha: async (options) => {
      calls.push(["alpha", options]);
      return { assessment: { pass: true, metrics: { authorityHz: 120 } } };
    },
    bravo: async (options) => {
      calls.push(["bravo", options]);
      throw new Error("terminal evidence missing");
    },
  };
  let clock = 1_000;
  const result = await runMissionAiSuite({
    wwwroot: "/published/wwwroot",
    missions: ["alpha", "bravo"],
    hardware: true,
    outputDirectory: "/tmp/evidence",
    runners,
    now: () => (clock += 250),
  });

  assert.equal(result.pass, false);
  assert.deepEqual(calls, [
    ["alpha", {
      wwwroot: "/published/wwwroot",
      hardware: true,
      outputDirectory: "/tmp/evidence/alpha",
    }],
    ["bravo", {
      wwwroot: "/published/wwwroot",
      hardware: true,
      outputDirectory: "/tmp/evidence/bravo",
    }],
  ]);
  assert.deepEqual(result.results[0], {
    mission: "alpha",
    pass: true,
    elapsedSeconds: 0.25,
    metrics: { authorityHz: 120 },
  });
  assert.match(result.results[1].error, /terminal evidence missing/);
});

test("suite treats a non-passing returned assessment as failure", async () => {
  const result = await runMissionAiSuite({
    wwwroot: "/published/wwwroot",
    missions: ["alpha"],
    runners: {
      alpha: async () => ({ assessment: { pass: false, failures: ["crashed"] } }),
    },
  });
  assert.equal(result.pass, false);
  assert.equal(result.results[0].error, "crashed");
});
