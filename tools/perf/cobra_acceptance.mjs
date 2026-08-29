import { FOREGROUND_FRAME_CONTRACT } from "../../web/wwwroot/render/telemetry/frame_contract.js";
import {
  COBRA_BATTLE_PROOF_MAX_RENDER_CALLS,
  COBRA_BATTLE_PROOF_MAX_RENDER_TRIANGLES,
} from "../cobra-scenery-gate/battle_evidence.mjs";

// This is a hardware/player-path contract. SwiftShader is useful for causal CPU-hitch diagnosis,
// but its RAF timing is not a player frame rate and must never qualify this gate.
export const COBRA_PLAYER_PATH_CONTRACT = Object.freeze({
  maximumLocalReadyMs: 8_000,
  maximumPostReadyPaintMs: 250,
  maximumInputToAuthorityMs: 250,
  // Ten seconds produces the shared contract's 600 samples at 60 Hz and stays inside the
  // deterministic threat-fire survival window of the explicit Iron Bell review spawn.
  minimumLiveSampleMs: 10_000,
  minimumSimulationRate: 0.90,
  minimumAuthorityTickRateHz: 108,
  maximumFrameMs: 100,
  maximumRenderCalls: COBRA_BATTLE_PROOF_MAX_RENDER_CALLS,
  maximumRenderTriangles: COBRA_BATTLE_PROOF_MAX_RENDER_TRIANGLES,
  frame: FOREGROUND_FRAME_CONTRACT,
});

function percentile(sorted, fraction) {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function summarizeCobraFrameDeltas(frameDeltasMs) {
  if (!Array.isArray(frameDeltasMs) || frameDeltasMs.length === 0) {
    throw new Error("frameDeltasMs must contain at least one frame duration");
  }
  const sorted = frameDeltasMs.map((value, index) => {
    const duration = finitePositive(value);
    if (duration === null) {
      throw new Error(`frameDeltasMs[${index}] must be a finite, positive duration`);
    }
    return duration;
  }).sort((left, right) => left - right);
  const sampledMs = sorted.reduce((total, value) => total + value, 0);
  const budgetMisses = sorted.filter(
    (value) => value > FOREGROUND_FRAME_CONTRACT.budgetFrameMs,
  ).length;
  return Object.freeze({
    frames: sorted.length,
    sampledMs,
    fps: sorted.length * 1_000 / sampledMs,
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maximumMs: sorted.at(-1),
    budgetMissFraction: budgetMisses / sorted.length,
  });
}

function softwareRenderer(renderer) {
  return /swiftshader|software|llvmpipe|lavapipe/i.test(String(renderer ?? ""));
}

/**
 * Judge one normal Cobra player-path run: boot to a painted Ready frame, pass through the visible
 * brief, accept pilot input, then sustain a live conquest sample on a real GPU. The input is kept
 * serialisable so the attribution harness can persist the exact evidence beside the verdict.
 */
export function evaluateCobraPlayerPath(evidence, contract = COBRA_PLAYER_PATH_CONTRACT) {
  const failures = [];
  const frames = summarizeCobraFrameDeltas(evidence?.frameDeltasMs);
  const sampleMs = finitePositive(evidence?.sampleDurationMs) ?? frames.sampledMs;
  const renderer = String(evidence?.renderer ?? "");
  if (!renderer || softwareRenderer(renderer)) {
    failures.push(`renderer is not hardware-qualified: ${renderer || "missing"}`);
  }
  if (!(Number(evidence?.readyMs) <= contract.maximumLocalReadyMs)) {
    failures.push(
      `Ready took ${Number(evidence?.readyMs).toFixed(0)} ms; ceiling ${contract.maximumLocalReadyMs} ms`,
    );
  }
  if (!(Number(evidence?.postReadyPaintMs) <= contract.maximumPostReadyPaintMs)) {
    failures.push(
      `post-Ready paint took ${Number(evidence?.postReadyPaintMs).toFixed(0)} ms; ceiling ${contract.maximumPostReadyPaintMs} ms`,
    );
  }
  if (!(Number(evidence?.inputToAuthorityMs) <= contract.maximumInputToAuthorityMs)) {
    failures.push(
      `input acknowledgement took ${Number(evidence?.inputToAuthorityMs).toFixed(0)} ms; ceiling ${contract.maximumInputToAuthorityMs} ms`,
    );
  }
  if (sampleMs < contract.minimumLiveSampleMs) {
    failures.push(`live sample covered ${sampleMs.toFixed(0)} ms; minimum ${contract.minimumLiveSampleMs} ms`);
  }
  if (evidence?.status !== "active") {
    failures.push(`sample ended with authority status ${String(evidence?.status ?? "missing")}`);
  }
  const requireCombat = evidence?.requireCombat !== false;
  if (requireCombat && evidence?.combatLive !== true) {
    failures.push("motion sample did not carry combat_live=true");
  }
  const expectedMissionActs = Array.isArray(evidence?.expectedMissionActs)
    ? evidence.expectedMissionActs.map((value) => String(value).toLowerCase())
    : ["engage", "hold"];
  if (!expectedMissionActs.includes(String(evidence?.missionAct ?? "").toLowerCase())) {
    failures.push(
      `motion sample mission act was ${String(evidence?.missionAct ?? "missing")}; expected ${expectedMissionActs.join("/")}`,
    );
  }

  const simulationElapsedS = Number(evidence?.simulationElapsedS);
  const sampleSeconds = sampleMs / 1_000;
  const simulationRate = simulationElapsedS / sampleSeconds;
  if (!(simulationRate >= contract.minimumSimulationRate)) {
    failures.push(
      `authority ran at ${simulationRate.toFixed(3)}x wall time; minimum ${contract.minimumSimulationRate.toFixed(2)}x`,
    );
  }
  const authorityTickDelta = Number(evidence?.authorityTickDelta);
  const authorityTickRateHz = authorityTickDelta / sampleSeconds;
  if (!(authorityTickRateHz >= contract.minimumAuthorityTickRateHz)) {
    failures.push(
      `authority advanced at ${authorityTickRateHz.toFixed(1)} Hz; minimum ${contract.minimumAuthorityTickRateHz} Hz`,
    );
  }

  if (!(frames.fps >= contract.frame.minimumFps)) {
    failures.push(`delivered ${frames.fps.toFixed(1)} fps; minimum ${contract.frame.minimumFps}`);
  }
  if (!(frames.p95Ms <= contract.frame.maximumP95Ms)) {
    failures.push(`frame p95 ${frames.p95Ms.toFixed(1)} ms; ceiling ${contract.frame.maximumP95Ms} ms`);
  }
  if (!(frames.p99Ms <= contract.frame.maximumP99Ms)) {
    failures.push(`frame p99 ${frames.p99Ms.toFixed(1)} ms; ceiling ${contract.frame.maximumP99Ms} ms`);
  }
  if (!(frames.budgetMissFraction <= contract.frame.maximumBudgetMissFraction)) {
    failures.push(
      `${(frames.budgetMissFraction * 100).toFixed(1)}% frames missed ${contract.frame.budgetFrameMs} ms; ceiling ${(contract.frame.maximumBudgetMissFraction * 100).toFixed(1)}%`,
    );
  }
  if (!(frames.maximumMs <= contract.maximumFrameMs)) {
    failures.push(`worst frame ${frames.maximumMs.toFixed(1)} ms; ceiling ${contract.maximumFrameMs} ms`);
  }
  if (!(Number(evidence?.renderCalls) <= contract.maximumRenderCalls)) {
    failures.push(
      `live render used ${Number(evidence?.renderCalls)} calls; ceiling ${contract.maximumRenderCalls}`,
    );
  }
  if (!(Number(evidence?.renderTriangles) <= contract.maximumRenderTriangles)) {
    failures.push(
      `live render used ${Number(evidence?.renderTriangles)} triangles; ceiling ${contract.maximumRenderTriangles}`,
    );
  }

  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      ...frames,
      sampleDurationMs: sampleMs,
      simulationRate,
      authorityTickRateHz,
    }),
  });
}
