// One foreground-flight delivery contract shared by the live governor, five-second telemetry,
// authored environment lab, and hardware harness. Keep hardware/driver qualification outside this
// object: these numbers describe the picture the pilot receives once a supported foreground sortie
// is active.
export const FOREGROUND_FRAME_CONTRACT = Object.freeze({
  targetFps: 60,
  minimumFps: 59,
  budgetFrameMs: 18.5,
  maximumP95Ms: 18.5,
  maximumP99Ms: 22,
  maximumBudgetMissFraction: 0.03,
  backgroundStallMs: 250,
  labSampleCount: 600,
});

export function evaluateForegroundFrameContract({
  fps,
  p95Ms,
  p99Ms,
  budgetMissFraction,
} = {}) {
  return Number(fps) >= FOREGROUND_FRAME_CONTRACT.minimumFps
    && Number(p95Ms) <= FOREGROUND_FRAME_CONTRACT.maximumP95Ms
    && Number(p99Ms) <= FOREGROUND_FRAME_CONTRACT.maximumP99Ms
    && Number(budgetMissFraction) <= FOREGROUND_FRAME_CONTRACT.maximumBudgetMissFraction;
}
