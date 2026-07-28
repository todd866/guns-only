import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LEG_WARMUP_MS,
  measuredFrameWindow,
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
