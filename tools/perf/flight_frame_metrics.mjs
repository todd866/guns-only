import { FOREGROUND_FRAME_CONTRACT } from "../../web/wwwroot/render/telemetry/frame_contract.js";

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

function nearestRank(sortedValues, fraction) {
  const index = Math.max(0, Math.ceil(sortedValues.length * fraction) - 1);
  return sortedValues[index];
}

export function summarizeFrameDeltas(
  deltas,
  {
    budgetFrameMs = FOREGROUND_FRAME_CONTRACT.budgetFrameMs,
    longFrameMs = FOREGROUND_FRAME_CONTRACT.maximumP99Ms,
  } = {},
) {
  if (!Array.isArray(deltas) || deltas.length === 0) {
    throw new Error("deltas must contain at least one frame duration.");
  }
  const sorted = [...deltas];
  let sampledMs = 0;
  let budgetMissFrames = 0;
  let longFrames = 0;
  for (let index = 0; index < sorted.length; index++) {
    const delta = sorted[index];
    if (!Number.isFinite(delta) || delta <= 0) {
      throw new Error(`deltas[${index}] must be a finite, positive duration.`);
    }
    sampledMs += delta;
    if (delta > budgetFrameMs) budgetMissFrames += 1;
    if (delta > longFrameMs) longFrames += 1;
  }
  sorted.sort((left, right) => left - right);
  return {
    frames: deltas.length,
    sampledMs,
    fps: deltas.length * 1_000 / sampledMs,
    p50Ms: nearestRank(sorted, 0.50),
    p95Ms: nearestRank(sorted, 0.95),
    p99Ms: nearestRank(sorted, 0.99),
    maxMs: sorted.at(-1),
    budgetFrameMs,
    budgetMissFrames,
    budgetMissFraction: budgetMissFrames / deltas.length,
    budgetMissPercent: budgetMissFrames / deltas.length * 100,
    longFrameMs,
    longFrames,
    longFramePercent: longFrames / deltas.length * 100,
  };
}

export function foregroundFrameGateFailures(
  summary,
  {
    contract = FOREGROUND_FRAME_CONTRACT,
    maximumBudgetMissFraction = contract.maximumBudgetMissFraction,
    maxFrameMs = Number.POSITIVE_INFINITY,
    label = summary?.name ?? "frame window",
  } = {},
) {
  const failures = [];
  if (!Number.isFinite(summary?.fps)) {
    failures.push(`${label} delivered FPS is unavailable`);
  } else if (summary.fps < contract.minimumFps) {
    failures.push(
      `${label} delivered FPS ${summary.fps.toFixed(2)} < ${contract.minimumFps.toFixed(2)}`,
    );
  }
  if (!Number.isFinite(summary?.p95Ms)) {
    failures.push(`${label} p95 frame time is unavailable`);
  } else if (summary.p95Ms > contract.maximumP95Ms) {
    failures.push(
      `${label} p95 ${summary.p95Ms.toFixed(2)} ms > `
      + `${contract.maximumP95Ms.toFixed(2)} ms`,
    );
  }
  if (!Number.isFinite(summary?.p99Ms)) {
    failures.push(`${label} p99 frame time is unavailable`);
  } else if (summary.p99Ms > contract.maximumP99Ms) {
    failures.push(
      `${label} p99 ${summary.p99Ms.toFixed(2)} ms > `
      + `${contract.maximumP99Ms.toFixed(2)} ms`,
    );
  }
  if (!Number.isFinite(summary?.budgetMissFraction)) {
    failures.push(`${label} frame-budget miss fraction is unavailable`);
  } else if (summary.budgetMissFraction > maximumBudgetMissFraction) {
    failures.push(
      `${label} frames over ${contract.budgetFrameMs.toFixed(2)} ms `
      + `${(summary.budgetMissFraction * 100).toFixed(3)}% > `
      + `${(maximumBudgetMissFraction * 100).toFixed(3)}%`,
    );
  }
  if (!Number.isFinite(summary?.maxMs)) {
    failures.push(`${label} MAX frame time is unavailable`);
  } else if (summary.maxMs > maxFrameMs) {
    failures.push(
      `${label} MAX ${summary.maxMs.toFixed(2)} ms > ${maxFrameMs.toFixed(2)} ms`,
    );
  }
  return failures;
}
