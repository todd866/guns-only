// Render frame-time telemetry. The 20 Hz state stream is sim-tick-scheduled and cannot see
// render stalls, so the recorder summarizes requestAnimationFrame deltas into one low-rate
// "perf" row per interval. Aggregation is pure with an injected clock: node tests drive window
// boundaries exactly, and the browser recorder stays a thin enqueue shim.

import {
  evaluateForegroundFrameContract,
  FOREGROUND_FRAME_CONTRACT,
} from "./frame_contract.js";

export const FRAME_PERF_INTERVAL_MS = 5_000;
// A 60 Hz browser does not present every requestAnimationFrame callback at exactly 16.667 ms:
// compositor scheduling and timer precision add a small amount of jitter. 18.5 ms is the
// foreground-flight scheduling tolerance shared with the closed-loop frame governor. It is
// deliberately separate from the 22 ms hardware acceptance ceiling retained below.
export const FRAME_PERF_BUDGET_MS = FOREGROUND_FRAME_CONTRACT.budgetFrameMs;
// Align with FRAME_GOVERNOR_LATE_FRAME_MS: one missed display interval. The old 50 ms threshold
// left felt-30-fps tapes reporting ~0 long frames while p95 sat at 33 ms.
export const FRAME_PERF_LONG_FRAME_MS = 22;
// Percentiles read a bounded sample window: 4096 samples covers a full 5 s interval beyond
// 800 Hz, so the bound — not the display refresh rate — owns worst-case memory. frames,
// long_frames / frames_over_22ms, and frame_ms_max stay exact even past the bound.
export const FRAME_PERF_MAX_WINDOW_SAMPLES = 4_096;

function nearestRank(sortedDeltas, quantile) {
  const rank = Math.ceil(quantile * sortedDeltas.length);
  return sortedDeltas[Math.min(sortedDeltas.length - 1, Math.max(0, rank - 1))];
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function roundedFraction(value) {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Windowed requestAnimationFrame-delta aggregator. `observe(deltaMs, nowMs)` returns null while
 * a window is filling and one summary object when `nowMs` closes the window (the closing frame
 * is included in that window). Invalid deltas and clocks are ignored rather than thrown: frame
 * accounting must never be able to disturb the render loop.
 */
export function createFramePerfAggregator({
  intervalMs = FRAME_PERF_INTERVAL_MS,
  budgetFrameMs = FRAME_PERF_BUDGET_MS,
  longFrameMs = FRAME_PERF_LONG_FRAME_MS,
  maxWindowSamples = FRAME_PERF_MAX_WINDOW_SAMPLES,
  // Optional () => ({name: number}) of renderer/scene counters, sampled ONCE per closed window
  // rather than per frame, so a scene traversal costs 0.2 Hz and never enters the frame budget.
  //
  // Frame deltas alone cannot localise a stall. Build 103's tape showed p50 pinned at 16.7 ms
  // while p95 stepped to exactly 50.0 ms — missed vsync intervals, degrading with each kill and
  // never recovering — and there was no way to tell accumulating geometry from accumulating draw
  // calls from terrain streaming, because the row carried no counters. These are that fix.
  sampleScene = null,
} = {}) {
  let windowStartedAt = null;
  let deltas = [];
  let frames = 0;
  let longFrames = 0;
  let budgetMissFrames = 0;
  let budgetMissStreak = 0;
  let longestBudgetMissStreak = 0;
  let observedMilliseconds = 0;
  let maxDelta = 0;
  // name -> { sum, count, max } of main-thread milliseconds. See observePhase.
  let phases = new Map();
  let compressionRequestedTicks = 0;
  let compressionExecutedTicks = 0;
  let compressionCostDroppedTicks = 0;
  let compressionMaximumFactor = 1;

  function resetPhases() {
    if (phases.size) phases = new Map();
  }

  return {
    /**
     * Attribute main-thread milliseconds to a named phase of the render loop.
     *
     * A frame delta says a stall happened; it cannot say WHERE. Two separate multi-hundred-
     * millisecond stalls have now been chased by elimination — terrain meshing (found: 9.5 ms of
     * synchronous array work per chunk) and the simulation catch-up spiral (found: one frame
     * advancing 0.25 s of 120 Hz ticks) — and a third is still live: a Build 115 tape holds two
     * ten-second windows whose MEDIAN frame is 116 ms with geometries, programs, textures and
     * scene objects all flat, so nothing is being built, compiled or uploaded. Elimination has run
     * out of things to eliminate. This measures instead.
     *
     * Mean and max per window is deliberately all it keeps: two numbers per phase localise a
     * 100 ms stall to a code block immediately, and the cost is one addition per phase per frame.
     */
    observePhase(name, milliseconds) {
      const value = Number(milliseconds);
      if (!name || !Number.isFinite(value) || value < 0) return;
      const entry = phases.get(name);
      if (!entry) phases.set(name, { sum: value, count: 1, max: value });
      else {
        entry.sum += value;
        entry.count += 1;
        if (value > entry.max) entry.max = value;
      }
    },

    /**
     * Record compression backpressure explicitly. A measured-cost cap is allowed to decline work;
     * hiding that truncation would make a slow machine's replay look like the kernel chose ×1.
     */
    observeTimeCompression({
      requestedTicks = 0,
      executedTicks = 0,
      costDroppedTicks = 0,
      factor = 1,
    } = {}) {
      const requested = Math.max(0, Math.floor(Number(requestedTicks) || 0));
      const executed = Math.max(0, Math.floor(Number(executedTicks) || 0));
      const dropped = Math.max(0, Math.floor(Number(costDroppedTicks) || 0));
      const selectedFactor = Math.max(1, Math.floor(Number(factor) || 1));
      compressionRequestedTicks += requested;
      compressionExecutedTicks += executed;
      compressionCostDroppedTicks += dropped;
      compressionMaximumFactor = Math.max(compressionMaximumFactor, selectedFactor);
    },

    observe(deltaMs, nowMs) {
      const delta = Number(deltaMs);
      const now = Number(nowMs);
      if (!Number.isFinite(delta) || delta <= 0 || !Number.isFinite(now)) return null;
      if (windowStartedAt === null) windowStartedAt = now;
      frames += 1;
      observedMilliseconds += delta;
      if (delta > budgetFrameMs) {
        budgetMissFrames += 1;
        budgetMissStreak += 1;
        longestBudgetMissStreak = Math.max(longestBudgetMissStreak, budgetMissStreak);
      } else {
        budgetMissStreak = 0;
      }
      if (delta > longFrameMs) longFrames += 1;
      if (delta > maxDelta) maxDelta = delta;
      if (deltas.length < maxWindowSamples) deltas.push(delta);
      if (now - windowStartedAt < intervalMs) return null;

      const sorted = deltas.slice().sort((a, b) => a - b);
      const p50 = rounded(nearestRank(sorted, 0.50));
      const p95 = rounded(nearestRank(sorted, 0.95));
      const p99 = rounded(nearestRank(sorted, 0.99));
      const deliveredFps = rounded(frames * 1_000 / observedMilliseconds);
      const budgetMissFraction = budgetMissFrames / frames;
      const budgetMissRate = roundedFraction(budgetMissFraction);
      const summary = {
        frame_ms_p50: p50,
        frame_ms_p95: p95,
        frame_ms_p99: p99,
        frame_ms_max: rounded(maxDelta),
        long_frames: longFrames,
        frames,
        window_ms: rounded(observedMilliseconds),
        delivered_fps: deliveredFps,
        frame_budget_ms: budgetFrameMs,
        frame_budget_misses: budgetMissFrames,
        frame_budget_miss_rate: budgetMissRate,
        longest_frame_budget_miss_streak: longestBudgetMissStreak,
        frames_over_18_5ms: budgetMissFrames,
        // Alias of long_frames under the 22 ms contract so agent tapes and harness gates share one
        // name with the closed-loop governor without breaking older consumers of long_frames.
        frames_over_22ms: longFrames,
        contract_pass: evaluateForegroundFrameContract({
          fps: deliveredFps,
          p95Ms: p95,
          p99Ms: p99,
          // Evaluate the unrounded ratio. A 3.4% miss rate must not become a passing 3% merely
          // because the diagnostic display is rounded.
          budgetMissFraction,
        }) ? 1 : 0,
      };
      if (sampleScene) {
        // Guarded exactly like the rest of the recorder: diagnostics must never be able to
        // disturb — or crash — the render loop.
        try {
          const counters = sampleScene();
          if (counters && typeof counters === "object") {
            for (const [name, value] of Object.entries(counters)) {
              const numeric = Number(value);
              if (Number.isFinite(numeric)) summary[name] = Math.round(numeric);
            }
          }
        } catch { /* a broken counter must not cost a frame */ }
      }
      for (const [name, entry] of phases) {
        summary[`${name}_ms_avg`] = rounded(entry.sum / entry.count);
        summary[`${name}_ms_max`] = rounded(entry.max);
      }
      if (compressionRequestedTicks > 0) {
        summary.time_compression_requested_ticks = compressionRequestedTicks;
        summary.time_compression_executed_ticks = compressionExecutedTicks;
        summary.time_compression_cost_dropped_ticks = compressionCostDroppedTicks;
        summary.time_compression_factor_max = compressionMaximumFactor;
      }
      windowStartedAt = now;
      deltas = [];
      frames = 0;
      longFrames = 0;
      budgetMissFrames = 0;
      budgetMissStreak = 0;
      longestBudgetMissStreak = 0;
      observedMilliseconds = 0;
      maxDelta = 0;
      compressionRequestedTicks = 0;
      compressionExecutedTicks = 0;
      compressionCostDroppedTicks = 0;
      compressionMaximumFactor = 1;
      resetPhases();
      return summary;
    },

    reset() {
      windowStartedAt = null;
      deltas = [];
      frames = 0;
      longFrames = 0;
      budgetMissFrames = 0;
      budgetMissStreak = 0;
      longestBudgetMissStreak = 0;
      observedMilliseconds = 0;
      maxDelta = 0;
      compressionRequestedTicks = 0;
      compressionExecutedTicks = 0;
      compressionCostDroppedTicks = 0;
      compressionMaximumFactor = 1;
      resetPhases();
    },
  };
}
