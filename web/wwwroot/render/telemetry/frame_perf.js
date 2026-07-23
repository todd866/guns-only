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
} = {}) {
  let windowStartedAt = null;
  let deltas = [];
  let frames = 0;
  let longFrames = 0;
  let maxDelta = 0;

  return {
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
      windowStartedAt = now;
      deltas = [];
      frames = 0;
      longFrames = 0;
      maxDelta = 0;
      return summary;
    },
  };
}
