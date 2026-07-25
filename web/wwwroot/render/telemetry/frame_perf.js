// Render frame-time telemetry. The 20 Hz state stream is sim-tick-scheduled and cannot see
// render stalls, so the recorder summarizes requestAnimationFrame deltas into one low-rate
// "perf" row per interval. Aggregation is pure with an injected clock: node tests drive window
// boundaries exactly, and the browser recorder stays a thin enqueue shim.

export const FRAME_PERF_INTERVAL_MS = 5_000;
export const FRAME_PERF_LONG_FRAME_MS = 50;
// Percentiles read a bounded sample window: 4096 samples covers a full 5 s interval beyond
// 800 Hz, so the bound — not the display refresh rate — owns worst-case memory. frames,
// long_frames, and frame_ms_max stay exact even past the bound.
export const FRAME_PERF_MAX_WINDOW_SAMPLES = 4_096;

function nearestRank(sortedDeltas, quantile) {
  const rank = Math.ceil(quantile * sortedDeltas.length);
  return sortedDeltas[Math.min(sortedDeltas.length - 1, Math.max(0, rank - 1))];
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Windowed requestAnimationFrame-delta aggregator. `observe(deltaMs, nowMs)` returns null while
 * a window is filling and one summary object when `nowMs` closes the window (the closing frame
 * is included in that window). Invalid deltas and clocks are ignored rather than thrown: frame
 * accounting must never be able to disturb the render loop.
 */
export function createFramePerfAggregator({
  intervalMs = FRAME_PERF_INTERVAL_MS,
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
  let maxDelta = 0;
  // name -> { sum, count, max } of main-thread milliseconds. See observePhase.
  let phases = new Map();

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

    observe(deltaMs, nowMs) {
      const delta = Number(deltaMs);
      const now = Number(nowMs);
      if (!Number.isFinite(delta) || delta <= 0 || !Number.isFinite(now)) return null;
      if (windowStartedAt === null) windowStartedAt = now;
      frames += 1;
      if (delta > longFrameMs) longFrames += 1;
      if (delta > maxDelta) maxDelta = delta;
      if (deltas.length < maxWindowSamples) deltas.push(delta);
      if (now - windowStartedAt < intervalMs) return null;

      const sorted = deltas.slice().sort((a, b) => a - b);
      const summary = {
        frame_ms_p50: rounded(nearestRank(sorted, 0.50)),
        frame_ms_p95: rounded(nearestRank(sorted, 0.95)),
        frame_ms_max: rounded(maxDelta),
        long_frames: longFrames,
        frames,
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
      windowStartedAt = now;
      deltas = [];
      frames = 0;
      longFrames = 0;
      maxDelta = 0;
      resetPhases();
      return summary;
    },
  };
}
