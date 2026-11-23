// Dev-only opening measurement (?trace=boot). The first ten seconds of frame
// deltas, then one summary. p50 matches the in-page frame readout (upper median).
export const BOOT_TRACE_MS = 10_000;
export const BOOT_HITCH_MS = 50;

export function summarizeBootFrames(samples) {
  if (!samples?.length) return {p50: null, p95: null, max: null, over50: 0, count: 0};
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: sorted[sorted.length >> 1],
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    max: sorted.at(-1),
    over50: samples.reduce((count, ms) => count + (ms > BOOT_HITCH_MS ? 1 : 0), 0),
    count: samples.length
  };
}

export function createBootTrace({windowMs = BOOT_TRACE_MS, log = () => {}, onSummary = () => {}} = {}) {
  const samples = [];
  let startedAt = null;
  let finished = false;
  return {
    frame(ms, at) {
      if (finished) return null;
      if (startedAt === null) startedAt = at;
      if (at - startedAt > windowMs) {
        finished = true;
        const summary = summarizeBootFrames(samples);
        onSummary(summary);
        return summary;
      }
      const value = Number(ms);
      if (Number.isFinite(value) && value >= 0) {
        samples.push(value);
        log(value);
      }
      return null;
    }
  };
}
