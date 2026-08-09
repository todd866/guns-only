import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  analyzeGroundRgba,
  evaluateFirstMergeReadiness,
  evaluateGroundMetrics,
  GROUND_ROI,
  LOW_ALTITUDE_AESTHETIC_PLATE_AGL_M,
  MERGE_INTEGRITY_APPROXIMATE_AGL_M,
  resolveGroundRoi,
} from "../f22_first_merge_pixel_gate.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");

function raster(width, height, pixel) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [red, green, blue, alpha = 255] = pixel(x, y);
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = alpha;
    }
  }
  return { width, height, data };
}

function readySnapshot(overrides = {}) {
  return {
    lifecycle: { selectedBeat: 7, stagedBeat: 7, reasons: ["session"] },
    session: { phase: "PAUSED" },
    gatePause: { armed: true, paused: true, activeTick: 0, pausedAtMs: 500 },
    terrain: {
      terrainId: "terrain.ukraine.rapier-range.atlas.v1",
      sceneryEra: "ukraine-modern",
      localResidentChunks: 9,
      errors: 0,
      disposed: false,
    },
    textureProbe: {
      requested: true,
      decoded: true,
      uploaded: true,
      naturalWidth: 1_024,
      naturalHeight: 1_024,
      uploadCalls: 1,
    },
    textureResource: { responseEnd: 1_250, duration: 30 },
    ...overrides,
  };
}

test("ground ROI is fixed below the First Merge horizon", () => {
  assert.deepEqual(resolveGroundRoi(1_000, 800, GROUND_ROI), {
    x: 80,
    y: 592,
    width: 840,
    height: 192,
  });
  assert.throws(() => resolveGroundRoi(1_000, 800, {
    x: 0.8, y: 0.8, width: 0.3, height: 0.3,
  }), /outside/);
});

test("merge integrity reserves a separate low-altitude aesthetic plate", () => {
  assert.equal(MERGE_INTEGRITY_APPROXIMATE_AGL_M, 3_000);
  assert.equal(LOW_ALTITUDE_AESTHETIC_PLATE_AGL_M, 90);
});

test("uniform pale ground fails closed on variance and contrast", () => {
  const metrics = analyzeGroundRgba(raster(120, 72, () => [205, 207, 204]));
  const result = evaluateGroundMetrics(metrics);
  assert.equal(result.pass, false);
  assert.deepEqual(result.failed, ["lumaVariance", "robustLumaContrast", "macroLumaContrast"]);
  assert.ok(metrics.lumaStandardDeviation < 1e-6);
  assert.ok(metrics.robustLumaContrast < 1e-12);
  assert.ok(metrics.macroLumaContrast < 1e-12);
});

test("broad authored albedo variation passes the ground gate", () => {
  const metrics = analyzeGroundRgba(raster(240, 120, (x, y) => {
    const broad = 60 + 120 * x / 239 + 30 * Math.sin(y / 17) + 16 * Math.sin(x / 29);
    return [broad + 12, broad + 5, broad - 14];
  }));
  const result = evaluateGroundMetrics(metrics);
  assert.equal(result.pass, true, JSON.stringify({ metrics, result }));
  assert.ok(metrics.meanChroma > 0);
});

test("pixel noise cannot impersonate visible macro albedo", () => {
  const metrics = analyzeGroundRgba(raster(240, 120, (x, y) => {
    const value = (x + y) % 2 === 0 ? 70 : 210;
    return [value, value, value];
  }));
  const result = evaluateGroundMetrics(metrics);
  assert.ok(metrics.lumaStandardDeviation > 0.05);
  assert.ok(metrics.robustLumaContrast > 0.10);
  assert.ok(metrics.macroLumaContrast < 0.001);
  assert.equal(result.pass, false);
  assert.deepEqual(result.failed, ["macroLumaContrast"]);
});

test("readiness requires mission-7 residency, image decode, resource completion, and WebGL upload", () => {
  assert.equal(evaluateFirstMergeReadiness(readySnapshot()).pass, true);

  const missingLocal = readySnapshot({
    terrain: { ...readySnapshot().terrain, localResidentChunks: 0 },
  });
  assert.deepEqual(evaluateFirstMergeReadiness(missingLocal).failed,
    ["localTerrainResident"]);

  const notUploaded = readySnapshot({
    textureProbe: { ...readySnapshot().textureProbe, uploaded: false, uploadCalls: 0 },
  });
  assert.deepEqual(evaluateFirstMergeReadiness(notUploaded).failed,
    ["textureUploadedToWebGl"]);

  const wrongEra = readySnapshot({
    terrain: { ...readySnapshot().terrain, sceneryEra: "modern" },
  });
  assert.deepEqual(evaluateFirstMergeReadiness(wrongEra).failed, ["sceneryEra"]);

  const neverPaused = readySnapshot({
    session: { phase: "ACTIVE" },
    gatePause: { armed: true, paused: false, activeTick: null, pausedAtMs: null },
  });
  assert.deepEqual(evaluateFirstMergeReadiness(neverPaused).failed, ["activeAndGatePaused"]);
});

test("transparent or malformed diagnostic rasters fail closed", () => {
  const metrics = analyzeGroundRgba(raster(120, 72, (x, y) => {
    const value = 40 + x + y;
    return [value, value + 20, value, x === 0 && y === 0 ? 0 : 255];
  }));
  const result = evaluateGroundMetrics(metrics);
  assert.equal(result.pass, false);
  assert.ok(result.failed.includes("opacity"));
  assert.throws(() => analyzeGroundRgba({ width: 4, height: 4, data: new Uint8Array(4) }),
    /must contain 64 bytes/);
});

test("release gates run First Merge integrity against the published candidate", async () => {
  const [localGate, workflow, status] = await Promise.all([
    readFile(path.join(REPOSITORY_ROOT, "bin/check"), "utf8"),
    readFile(path.join(REPOSITORY_ROOT, ".github/workflows/verify.yml"), "utf8"),
    readFile(path.join(REPOSITORY_ROOT, "docs/STATUS.md"), "utf8"),
  ]);

  const localPublish = localGate.indexOf('dotnet_cli" publish web/GunsOnly.Web.csproj');
  const localPixelGate = localGate.indexOf("node tools/perf/f22_first_merge_pixel_gate.mjs");
  assert.ok(localPublish >= 0, "bin/check must publish the Web candidate");
  assert.ok(localPixelGate > localPublish,
    "bin/check must run rendered-pixel integrity after publishing");
  assert.match(localGate,
    /FIRST_MERGE_GATE_WWWROOT="\$publish_dir\/wwwroot"[\s\\]*FIRST_MERGE_GATE_OUT_DIR="\$scratch_dir\/first-merge-pixel-gate"[\s\\]*node tools\/perf\/f22_first_merge_pixel_gate\.mjs/);

  assert.match(workflow,
    /--output "\$\{\{ runner\.temp \}\}\/guns-only-publish"/);
  assert.match(workflow,
    /FIRST_MERGE_GATE_WWWROOT: \$\{\{ runner\.temp \}\}\/guns-only-publish\/wwwroot/);
  assert.match(workflow,
    /FIRST_MERGE_GATE_OUT_DIR: \$\{\{ runner\.temp \}\}\/guns-only-smoke-artifacts\/first-merge-pixel-gate/);
  assert.match(workflow, /node tools\/perf\/f22_first_merge_pixel_gate\.mjs/);
  const ciStepStart = workflow.indexOf("- name: Run First Merge published-pixel integrity gate");
  const ciStepEnd = workflow.indexOf("- name: Upload browser diagnostics", ciStepStart);
  assert.ok(ciStepStart >= 0 && ciStepEnd > ciStepStart,
    "workflow must retain a distinct First Merge pixel-integrity step");
  const ciStep = workflow.slice(ciStepStart, ciStepEnd);
  assert.match(ciStep,
    /if: \$\{\{ always\(\) && steps\.publish\.outcome == 'success' && steps\.smoke_deps\.outcome == 'success' \}\}/);
  assert.doesNotMatch(ciStep, /continue-on-error\s*:\s*true/,
    "CI rendered-pixel integrity must fail the browser-smoke job");

  assert.match(status,
    /roughly 3 km published-pixel gate proves asset residency and minimum rendered signal, not art quality or low-level detail/);
  assert.match(status,
    /A separate fixed 90 m AGL Web desktop plate is green with the exact generated atlas consumed by both streamed scenery and mission features/,
    "release truth must record the independent Web low-altitude plate without overloading the merge gate");
  assert.match(status,
    /native Unity 90 m AGL import\/player capture and fixed-camera comparison/,
    "Web low-altitude acceptance must not waive the native Unity release seam");
});
