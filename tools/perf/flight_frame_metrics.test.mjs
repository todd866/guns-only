import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LEG_WARMUP_MS,
  foregroundFrameGateFailures,
  measuredFrameWindow,
  summarizeFrameDeltas,
  totalLegCaptureDurationMs,
} from "./flight_frame_metrics.mjs";

test("capture duration adds warmup ahead of the complete measured window", () => {
  assert.equal(DEFAULT_LEG_WARMUP_MS, 15_000);
  assert.equal(totalLegCaptureDurationMs(60_000), 75_000);
  assert.equal(totalLegCaptureDurationMs(60_000, 5_000), 65_000);
});

test("warmup is discarded without shortening the configured measurement", () => {
  const deltas = Array.from({ length: 75 }, () => 1_000);
  const window = measuredFrameWindow(deltas, 15_000);

  assert.equal(window.firstMeasured, 15);
  assert.equal(window.warmupSampledMs, 15_000);
  assert.equal(window.measuredDeltas.length, 60);
  assert.equal(
    window.measuredDeltas.reduce((total, delta) => total + delta, 0),
    60_000,
  );
});

test("the first frame crossing the warmup boundary remains excluded", () => {
  const window = measuredFrameWindow([8_000, 8_000, 10_000, 10_000], 15_000);

  assert.equal(window.firstMeasured, 2);
  assert.equal(window.warmupSampledMs, 16_000);
  assert.deepEqual(window.measuredDeltas, [10_000, 10_000]);
});

test("invalid frame durations fail instead of corrupting the report", () => {
  assert.throws(
    () => measuredFrameWindow([16.7, Number.NaN], 0),
    /deltas\[1\] must be a finite, non-negative duration/,
  );
  assert.throws(
    () => totalLegCaptureDurationMs(-1),
    /measuredDurationMs must be a finite, non-negative duration/,
  );
});

test("frame summaries report delivered FPS and both budget thresholds", () => {
  const summary = summarizeFrameDeltas([10, 20, 30, 40]);

  assert.equal(summary.frames, 4);
  assert.equal(summary.sampledMs, 100);
  assert.equal(summary.fps, 40);
  assert.equal(summary.p50Ms, 20);
  assert.equal(summary.p95Ms, 40);
  assert.equal(summary.p99Ms, 40);
  assert.equal(summary.maxMs, 40);
  assert.equal(summary.budgetFrameMs, 18.5);
  assert.equal(summary.budgetMissFrames, 3);
  assert.equal(summary.budgetMissFraction, 0.75);
  assert.equal(summary.longFrameMs, 22);
  assert.equal(summary.longFrames, 2);
});

test("foreground gate accepts every shared-contract boundary plus the MAX safety boundary", () => {
  const failures = foregroundFrameGateFailures({
    fps: 59,
    p95Ms: 18.5,
    p99Ms: 22,
    budgetMissFraction: 0.03,
    maxMs: 100,
  }, { maxFrameMs: 100 });

  assert.deepEqual(failures, []);
});

test("foreground gate reports each independent contract breach", () => {
  const failures = foregroundFrameGateFailures({
    name: "low-level terrain",
    fps: 58.99,
    p95Ms: 18.51,
    p99Ms: 22.01,
    budgetMissFraction: 0.0301,
    maxMs: 100.01,
  }, { maxFrameMs: 100 });

  assert.equal(failures.length, 5);
  assert.match(failures[0], /delivered FPS 58\.99 < 59\.00/);
  assert.match(failures[1], /p95 18\.51 ms > 18\.50 ms/);
  assert.match(failures[2], /p99 22\.01 ms > 22\.00 ms/);
  assert.match(failures[3], /frames over 18\.50 ms 3\.010% > 3\.000%/);
  assert.match(failures[4], /MAX 100\.01 ms > 100\.00 ms/);
});

test("legacy long-frame percentage override remains usable as a stricter budget gate", () => {
  const failures = foregroundFrameGateFailures({
    fps: 60,
    p95Ms: 18,
    p99Ms: 21,
    budgetMissFraction: 0.02,
    maxMs: 50,
  }, {
    maximumBudgetMissFraction: 0.01,
    maxFrameMs: 100,
  });

  assert.equal(failures.length, 1);
  assert.match(failures[0], /2\.000% > 1\.000%/);
});
