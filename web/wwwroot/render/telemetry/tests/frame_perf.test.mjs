import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createFramePerfAggregator,
  FRAME_PERF_BUDGET_MS,
  FRAME_PERF_INTERVAL_MS,
  FRAME_PERF_LONG_FRAME_MS,
  FRAME_PERF_MAX_WINDOW_SAMPLES,
} from "../frame_perf.js";

const appUrl = new URL("../../../app.js", import.meta.url);

test("a window closes after the interval and summarizes exactly its own deltas", () => {
  const aggregator = createFramePerfAggregator({ intervalMs: 5_000 });
  // Clean 16.7 ms frames with one 120 ms stall: the window closes at >= 5 s of wall time.
  let now = 0;
  let summary = null;
  let observed = 0;
  while (summary === null) {
    const delta = observed === 150 ? 120 : 16.7;
    now += delta;
    summary = aggregator.observe(delta, now);
    observed += 1;
  }

  assert.ok(now >= 5_000, "window must span at least the configured interval");
  assert.equal(summary.frames, observed);
  assert.equal(summary.frame_ms_p50, 16.7);
  assert.equal(summary.frame_ms_p95, 16.7);
  assert.equal(summary.frame_ms_p99, 16.7);
  assert.equal(summary.frame_ms_max, 120);
  assert.equal(summary.long_frames, 1);
  assert.equal(summary.frame_budget_misses, 1);
  assert.equal(summary.frame_budget_miss_rate, Number((1 / observed).toFixed(4)));
  assert.equal(summary.longest_frame_budget_miss_streak, 1);
  assert.equal(summary.frames_over_18_5ms, 1);
  assert.equal(summary.frames_over_22ms, 1);
  assert.equal(summary.window_ms, Number((16.7 * (observed - 1) + 120).toFixed(2)));
  assert.equal(summary.delivered_fps,
    Number((observed * 1_000 / summary.window_ms).toFixed(2)));
  assert.deepEqual(Object.keys(summary),
    ["frame_ms_p50", "frame_ms_p95", "frame_ms_p99", "frame_ms_max", "long_frames", "frames",
      "window_ms", "delivered_fps", "frame_budget_ms", "frame_budget_misses",
      "frame_budget_miss_rate", "longest_frame_budget_miss_streak",
      "frames_over_18_5ms", "frames_over_22ms", "contract_pass"]);

  // The next window starts empty: its summary must not inherit the previous stall.
  let next = null;
  while (next === null) {
    now += 20;
    next = aggregator.observe(20, now);
  }
  assert.equal(next.frame_ms_max, 20);
  assert.equal(next.long_frames, 0);
  assert.ok(next.frame_budget_misses > 0, "20 ms misses the 60 Hz scheduling budget");
  assert.equal(next.frames_over_22ms, 0);
});

test("felt 30 fps frames over 22 ms count as long even when under the old 50 ms blind spot", () => {
  const aggregator = createFramePerfAggregator({ intervalMs: 100 });
  aggregator.observe(16.7, 0);
  aggregator.observe(33, 50);
  const summary = aggregator.observe(16.7, 100);
  assert.equal(summary.frames_over_22ms, 1);
  assert.equal(summary.frames_over_18_5ms, 1);
  assert.equal(summary.long_frames, 1);
  assert.equal(summary.frame_ms_max, 33);
});

test("percentiles use nearest-rank over the sorted window", () => {
  const aggregator = createFramePerfAggregator({ intervalMs: 1_000 });
  // Deltas 1..20 ms; the 20th observation lands past the interval and closes the window,
  // so nearest-rank reads sorted values: p50 = 10th of 20, p95 = 19th of 20.
  let summary = null;
  for (let i = 1; i <= 19; i += 1) {
    summary = aggregator.observe(i, i);
    assert.equal(summary, null, "window must not close inside the interval");
  }
  summary = aggregator.observe(20, 2_000);
  assert.notEqual(summary, null);
  assert.equal(summary.frame_ms_p50, 10);
  assert.equal(summary.frame_ms_p95, 19);
  assert.equal(summary.frame_ms_p99, 20);
  assert.equal(summary.frame_ms_max, 20);
  assert.equal(summary.frames, 20);
  assert.equal(summary.long_frames, 0);
});

test("counts and max stay exact past the bounded percentile window", () => {
  const aggregator = createFramePerfAggregator({ intervalMs: 100, maxWindowSamples: 4 });
  aggregator.observe(10, 10);
  aggregator.observe(10, 20);
  aggregator.observe(10, 30);
  aggregator.observe(10, 40);
  aggregator.observe(80, 50);   // beyond the sample bound: still counted, still the max
  const summary = aggregator.observe(60, 120);

  assert.equal(summary.frames, 6);
  assert.equal(summary.long_frames, 2);
  assert.equal(summary.frame_ms_max, 80);
  assert.equal(summary.frame_ms_p95, 10, "percentiles read only the bounded sample window");
});

test("invalid deltas and clocks are ignored instead of poisoning the window", () => {
  const aggregator = createFramePerfAggregator({ intervalMs: 100 });
  assert.equal(aggregator.observe(Number.NaN, 10), null);
  assert.equal(aggregator.observe(-5, 20), null);
  assert.equal(aggregator.observe(0, 30), null);
  assert.equal(aggregator.observe(16, Number.NaN), null);
  const summary = aggregator.observe(16, 200);
  // Only the two valid observations exist; the window opened at the first valid one.
  assert.equal(summary, null);
  assert.equal(aggregator.observe(16, 350).frames, 2);
});

test("exported defaults match the documented perf-row contract", () => {
  assert.equal(FRAME_PERF_INTERVAL_MS, 5_000);
  assert.equal(FRAME_PERF_BUDGET_MS, 18.5);
  // Align with the closed-loop frame governor: one missed display interval, not a 50 ms stall.
  assert.equal(FRAME_PERF_LONG_FRAME_MS, 22);
  assert.ok(FRAME_PERF_MAX_WINDOW_SAMPLES >= 4_000);
});

test("the browser recorder feeds raw render deltas and never displaces state rows", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app,
    /_framePerf: createFramePerfAggregator\(\{ sampleScene: \(\) => sampleSceneCounters\(\) \}\)/);
  // The counters must come off the LIVE renderer, and geometries/textures must be among them:
  // those are the live GPU resource counts that tell a leak apart from load.
  assert.match(app, /function sampleSceneCounters\(\) \{[\s\S]*?activeView\?\.renderer\?\.info/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?geometries: info\.memory\?\.geometries/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?textures: info\.memory\?\.textures/);
  // Load context localises a stall: governor level, stream radius, scenery shed, and fight pressure.
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?governor_level:/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?stream_radius_m:/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?scenery_suppressed:/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?micro_required:/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?radar_alt_ft:/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?engagement:/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?bandit_alive:/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?catapult_active:/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?terrain_queued_loads:/);
  assert.match(app, /function sampleSceneCounters\(\)[\s\S]*?resolution_scale_pct:/);
  // The render loop hands the recorder the raw delta before the simulation-advance clamp, so a
  // stall is measured at its true length rather than at the length the kernel was willing to run.
  assert.match(app,
    /const renderDeltaMs = now - previous;[\s\S]{0,500}?recorder\.observeFrameDelta\(renderDeltaMs,[\s\S]{0,300}?session_phase === "ACTIVE"[\s\S]{0,500}?clamp\(renderDeltaMs \/ 1000, 0, SIM_CATCHUP_CAP_SECONDS\)/);
  assert.match(app,
    /observeFrameDelta\(deltaMs, activeForeground\) \{[\s\S]*?this\._framePerf\.reset\(\)[\s\S]*?active_foreground: 1/);
  // That cap is a spiral brake. At 120 Hz a healthy 60 fps frame owes the kernel 2 ticks; letting
  // one frame catch up 0.25 s meant THIRTY, so a single hitch bought its own successor and the tape
  // showed five-second windows with a 166 ms and a 283 ms MEDIAN frame. Keep it within a handful of
  // ticks — if this ever climbs back toward 0.25 s the death spiral comes with it.
  const cap = app.match(/const SIM_CATCHUP_CAP_SECONDS = ([^;]+);/)?.[1];
  assert.ok(cap, "the simulation catch-up cap must stay a named, documented constant");
  const capSeconds = Number(new Function(`return ${cap}`)());
  assert.ok(capSeconds > 2 / 120 && capSeconds <= 12 / 120,
    `catch-up cap must recover an ordinary hitch without spiralling, got ${capSeconds}s`);
  // Healthy windows remain expendable under backpressure; a failed foreground contract is
  // admitted so bounded retention can preserve the latest breach.
  assert.match(app, /observeFrameDelta\(deltaMs, activeForeground\) \{[\s\S]*?this\.buf\.length >= TELEMETRY_BUFFER_LIMIT && summary\.contract_pass === 1[\s\S]*?k: "perf"/);
  // Perf rows share the time base of every other recorder row.
  assert.match(app, /k: "perf",[\s\S]*?t: Math\.round\(performance\.now\(\)\),[\s\S]*?\.\.\.summary/);
});

test("scene counters are sampled once per closed window and merged into the summary", () => {
  let samples = 0;
  const aggregator = createFramePerfAggregator({
    intervalMs: 100,
    sampleScene: () => {
      samples += 1;
      return { draw_calls: 120 + samples, geometries: 900, textures: 40.4, programs: 12 };
    },
  });

  // Frames inside the window must not sample: a scene traversal per frame would be the very
  // cost this row exists to find.
  assert.equal(aggregator.observe(16, 0), null);
  assert.equal(aggregator.observe(16, 50), null);
  assert.equal(samples, 0);

  const summary = aggregator.observe(16, 100);
  assert.equal(samples, 1);
  assert.equal(summary.draw_calls, 121);
  assert.equal(summary.geometries, 900);
  assert.equal(summary.textures, 40);      // rounded to an integer count
  assert.equal(summary.programs, 12);
  assert.equal(summary.frames, 3);
});

test("a throwing or non-numeric scene sampler cannot disturb frame accounting", () => {
  const throwing = createFramePerfAggregator({
    intervalMs: 100,
    sampleScene: () => { throw new Error("renderer disposed mid-window"); },
  });
  throwing.observe(16, 0);
  const summary = throwing.observe(16, 100);
  assert.equal(summary.frames, 2);
  assert.equal(summary.draw_calls, undefined);

  const garbage = createFramePerfAggregator({
    intervalMs: 100,
    sampleScene: () => ({ draw_calls: "lots", triangles: NaN, geometries: 7 }),
  });
  garbage.observe(16, 0);
  const kept = garbage.observe(16, 100);
  assert.equal(kept.draw_calls, undefined);
  assert.equal(kept.triangles, undefined);
  assert.equal(kept.geometries, 7);
});

test("no sampler leaves the row exactly as it was before instrumentation", () => {
  const plain = createFramePerfAggregator({ intervalMs: 100 });
  plain.observe(16, 0);
  const summary = plain.observe(16, 100);
  assert.deepEqual(Object.keys(summary).sort(),
    ["delivered_fps", "frame_budget_miss_rate", "frame_budget_misses", "frame_budget_ms",
      "frame_ms_max", "frame_ms_p50", "frame_ms_p95", "frame_ms_p99", "frames",
      "frames_over_18_5ms", "frames_over_22ms", "long_frames",
      "longest_frame_budget_miss_streak", "window_ms", "contract_pass"].sort());
});

test("budget miss streaks expose sustained 30 fps runs instead of only a total", () => {
  const aggregator = createFramePerfAggregator({ intervalMs: 100 });
  aggregator.observe(16, 0);
  aggregator.observe(33, 25);
  aggregator.observe(34, 50);
  aggregator.observe(16, 75);
  const summary = aggregator.observe(40, 100);

  assert.equal(summary.frame_budget_misses, 3);
  assert.equal(summary.longest_frame_budget_miss_streak, 2);
  assert.equal(summary.frames_over_18_5ms, 3);
  assert.equal(summary.frames_over_22ms, 3);
  assert.equal(summary.window_ms, 139);
  assert.equal(summary.delivered_fps, 35.97);
  assert.equal(summary.contract_pass, 0);
});

test("contract evaluation does not round a failing miss fraction down to three percent", () => {
  const aggregator = createFramePerfAggregator({ intervalMs: 100 });
  for (let index = 0; index < 29; index += 1) {
    aggregator.observe(index === 0 ? 19 : 16, index);
  }
  const summary = aggregator.observe(16, 100);

  assert.equal(summary.frames, 30);
  assert.equal(summary.frame_budget_miss_rate, 0.0333);
  assert.equal(summary.contract_pass, 0);
});

test("reset discards an ineligible partial window and all phase ownership", () => {
  const aggregator = createFramePerfAggregator({ intervalMs: 100 });
  aggregator.observePhase("view", 80);
  aggregator.observe(80, 0);
  aggregator.reset();
  aggregator.observePhase("view", 4);
  aggregator.observe(16, 100);
  const summary = aggregator.observe(16, 200);

  assert.equal(summary.frames, 2);
  assert.equal(summary.frame_ms_max, 16);
  assert.equal(summary.view_ms_max, 4);
  assert.equal(summary.contract_pass, 1);
});
