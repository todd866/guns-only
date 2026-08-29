import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  COBRA_PLAYER_PATH_CONTRACT,
  evaluateCobraPlayerPath,
  summarizeCobraFrameDeltas,
} from "./cobra_acceptance.mjs";

function passingEvidence() {
  // Exactly 60 fps for thirty seconds, with a small healthy tail under the shared contract.
  const frameDeltasMs = Array.from({ length: 1_800 }, () => 16.6);
  frameDeltasMs[0] = 21;
  frameDeltasMs[1] = 18;
  return {
    renderer: "ANGLE (Apple, Apple M3 Pro, Metal)",
    readyMs: 2_600,
    postReadyPaintMs: 17,
    inputToAuthorityMs: 34,
    sampleDurationMs: 30_000,
    frameDeltasMs,
    simulationElapsedS: 29.95,
    authorityTickDelta: 3_594,
    status: "active",
    combatLive: true,
    missionAct: "engage",
    renderCalls: COBRA_PLAYER_PATH_CONTRACT.maximumRenderCalls - 1,
    renderTriangles: COBRA_PLAYER_PATH_CONTRACT.maximumRenderTriangles - 1,
  };
}

test("Cobra player-path contract accepts a painted, responsive 60 fps live battle", () => {
  const result = evaluateCobraPlayerPath(passingEvidence());
  assert.equal(result.pass, true, result.failures.join("\n"));
  assert.ok(result.metrics.fps >= 59);
  assert.ok(result.metrics.simulationRate >= 0.99);
  assert.ok(result.metrics.authorityTickRateHz >= 119);
});

test("the same delivery contract accepts a healthy normal departure without inventing combat", () => {
  const evidence = passingEvidence();
  evidence.combatLive = false;
  evidence.missionAct = "depart";
  evidence.requireCombat = false;
  evidence.expectedMissionActs = ["depart", "ingress"];
  const result = evaluateCobraPlayerPath(evidence);
  assert.equal(result.pass, true, result.failures.join("\n"));
});

test("Cobra player-path contract rejects a green boot hiding paused or slow play", () => {
  const evidence = passingEvidence();
  evidence.renderer = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))";
  evidence.readyMs = 9_000;
  evidence.postReadyPaintMs = 900;
  evidence.inputToAuthorityMs = 600;
  evidence.sampleDurationMs = 9_000;
  evidence.frameDeltasMs = Array.from({ length: 900 }, () => 33.3);
  evidence.frameDeltasMs[0] = 180;
  evidence.simulationElapsedS = 4;
  evidence.authorityTickDelta = 500;
  evidence.status = "vehicle-authority-lost";
  evidence.combatLive = false;
  evidence.missionAct = "brief";
  evidence.renderCalls = COBRA_PLAYER_PATH_CONTRACT.maximumRenderCalls + 1;
  evidence.renderTriangles = COBRA_PLAYER_PATH_CONTRACT.maximumRenderTriangles + 1;
  const result = evaluateCobraPlayerPath(evidence);
  assert.equal(result.pass, false);
  const failures = result.failures.join("\n");
  for (const phrase of [
    "not hardware-qualified",
    "Ready took",
    "post-Ready paint",
    "input acknowledgement",
    "live sample covered",
    "authority status",
    "combat_live",
    "mission act",
    "wall time",
    "authority advanced",
    "delivered",
    "frame p95",
    "frame p99",
    "frames missed",
    "worst frame",
    "render used",
  ]) assert.match(failures, new RegExp(phrase));
});

test("frame summary uses delivered rate and the shared scheduling budget", () => {
  const summary = summarizeCobraFrameDeltas([16, 16, 20, 24]);
  assert.equal(summary.frames, 4);
  assert.equal(summary.sampledMs, 76);
  assert.equal(summary.fps, 4_000 / 76);
  assert.equal(summary.p95Ms, 24);
  assert.equal(summary.p99Ms, 24);
  assert.equal(summary.maximumMs, 24);
  assert.equal(summary.budgetMissFraction, 0.5);
});

test("the attribution Cobra path clears the brief and proves live authority before timing motion", () => {
  const source = readFileSync(resolve("tools/perf/run_attribution.mjs"), "utf8");
  const probe = readFileSync(resolve("tools/perf/frame_attribution.mjs"), "utf8");
  assert.match(source, /#mission-brief-start/);
  assert.match(source, /#mission-brief[^\n]*hidden/);
  assert.match(source, /#controls-onboarding-dismiss/);
  assert.match(source, /vehicle\?\.tick[^\n]*>[^\n]*beforeTick/);
  assert.match(source, /combatLive/);
  assert.match(source,
    /synthetic teleport[\s\S]*?transitionWarmupMs[\s\S]*?GATE && MODE === "cobra"/,
    "the battle sample must begin after the QA-only Iron Bell teleport has settled");
  assert.match(source,
    /battleAuthorityResetAfterStreamingWarmup[\s\S]*?samplePreparation/,
    "the settled battle sample needs fresh authority after the QA-only streaming exposure");
  assert.match(source, /evaluateCobraPlayerPath/);
  assert.match(probe, /captureWindow = \{ start: cobraSnapshot\(\), end: null \}/);
  assert.match(probe, /P\.captureWindow\.end = cobraSnapshot\(\)/);
});
