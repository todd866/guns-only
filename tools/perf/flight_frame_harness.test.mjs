import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePhaseMaxima,
  worstFramePerfWindow,
} from "./flight_frame_harness.mjs";

test("worst framePerf window keeps the earlier hitch instead of the latest sample", () => {
  const early = { frame_ms_max: 91, governor_level: 2 };
  const latest = { frame_ms_max: 18, governor_level: 1 };

  assert.equal(worstFramePerfWindow([early, latest]), early);
});

test("worst framePerf window ignores malformed samples and uses telemetry frame_ms_max", () => {
  const valid = { frame_ms_max: 24 };

  assert.equal(
    worstFramePerfWindow([
      null,
      { frame_ms_max: "not-a-number" },
      { frame_ms_max: null },
      { frame_ms_max: "" },
      { frame_ms_max: -1 },
      { max_ms: 500 },
      valid,
    ]),
    valid,
  );
});

test("phase maxima retain the largest hitch from every framePerf window", () => {
  assert.deepEqual(
    aggregatePhaseMaxima([
      { update_ms_max: 1.4, render_ms_max: 3.2, frame_ms_max: 40 },
      { update_ms_max: 4.8, render_ms_max: 2.1, frame_ms_max: 18 },
      {
        update_ms_max: "bad",
        render_ms_max: null,
        physics_ms_max: 2.7,
        collision_ms_max: -0.5,
      },
    ]),
    [
      { phase: "update", msMax: 4.8 },
      { phase: "render", msMax: 3.2 },
      { phase: "physics", msMax: 2.7 },
    ],
  );
});
