export const DEFAULT_LEG_WARMUP_MS = 15_000;

function nonNegativeDuration(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite, non-negative duration.`);
  }
  return value;
}

export function totalLegCaptureDurationMs(
  measuredDurationMs,
  warmupMs = DEFAULT_LEG_WARMUP_MS,
) {
  return nonNegativeDuration(measuredDurationMs, "measuredDurationMs")
    + nonNegativeDuration(warmupMs, "warmupMs");
}

export function measuredFrameWindow(deltas, warmupMs = DEFAULT_LEG_WARMUP_MS) {
  if (!Array.isArray(deltas)) throw new Error("deltas must be an array.");
  nonNegativeDuration(warmupMs, "warmupMs");

  let warmupSampledMs = 0;
  let firstMeasured = 0;
  while (firstMeasured < deltas.length && warmupSampledMs < warmupMs) {
    const delta = deltas[firstMeasured];
    if (!Number.isFinite(delta) || delta < 0) {
      throw new Error(`deltas[${firstMeasured}] must be a finite, non-negative duration.`);
    }
    warmupSampledMs += delta;
    firstMeasured += 1;
  }

  for (let index = firstMeasured; index < deltas.length; index++) {
    if (!Number.isFinite(deltas[index]) || deltas[index] < 0) {
      throw new Error(`deltas[${index}] must be a finite, non-negative duration.`);
    }
  }

  return {
    firstMeasured,
    warmupSampledMs,
    measuredDeltas: deltas.slice(firstMeasured),
  };
}
