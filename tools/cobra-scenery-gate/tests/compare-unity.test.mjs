import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";
import {
  CAPTURE_HEIGHT,
  CAPTURE_WIDTH,
  DEFAULT_THRESHOLDS,
  LOW_FREQUENCY_BLUR_RADIUS_PX,
  LOW_FREQUENCY_NOTICE_BYTE_ERROR,
  ParityInputError,
  VIEW_PAIRS,
  amplifiedDifferenceImage,
  checkerboardImage,
  compareCaptureImages,
  decodeCapturePng,
  parseArgs,
  runComparison,
  validateCaptureImage,
  writePairArtifacts,
} from "../compare-unity.mjs";

function fixtureImage() {
  const data = Buffer.alloc(CAPTURE_WIDTH * CAPTURE_HEIGHT * 4);
  for (let y = 0; y < CAPTURE_HEIGHT; y++) {
    for (let x = 0; x < CAPTURE_WIDTH; x++) {
      const offset = (y * CAPTURE_WIDTH + x) * 4;
      const ground = y > 250 + 0.18 * x + 70 * Math.sin(x / 170);
      const river = ground && Math.abs(x - (1_300 - y * 0.72)) < 65;
      let red = ground ? 45 + (x % 73) : 110;
      let green = ground ? 95 + (y % 61) : 145;
      let blue = ground ? 38 : 170;
      if (river) [red, green, blue] = [14, 55, 72];
      if ((x - 380) ** 2 + (y - 650) ** 2 < 110 ** 2) {
        [red, green, blue] = [130, 70, 35];
      }
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }
  }
  return { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data };
}

function translated(image, dx, dy) {
  const data = Buffer.alloc(image.data.length);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  for (let y = 0; y < CAPTURE_HEIGHT; y++) {
    for (let x = 0; x < CAPTURE_WIDTH; x++) {
      const sourceX = x - dx;
      const sourceY = y - dy;
      if (sourceX < 0 || sourceX >= CAPTURE_WIDTH
          || sourceY < 0 || sourceY >= CAPTURE_HEIGHT) continue;
      const target = (y * CAPTURE_WIDTH + x) * 4;
      const source = (sourceY * CAPTURE_WIDTH + sourceX) * 4;
      data[target] = image.data[source];
      data[target + 1] = image.data[source + 1];
      data[target + 2] = image.data[source + 2];
    }
  }
  return { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data };
}

function mirrored(image) {
  const data = Buffer.alloc(image.data.length);
  for (let y = 0; y < CAPTURE_HEIGHT; y++) {
    for (let x = 0; x < CAPTURE_WIDTH; x++) {
      const target = (y * CAPTURE_WIDTH + x) * 4;
      const source = (y * CAPTURE_WIDTH + CAPTURE_WIDTH - 1 - x) * 4;
      data[target] = image.data[source];
      data[target + 1] = image.data[source + 1];
      data[target + 2] = image.data[source + 2];
      data[target + 3] = 255;
    }
  }
  return { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data };
}

function recolored(image) {
  const data = Buffer.from(image.data);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = Math.min(255, data[offset] + 24);
    data[offset + 1] = Math.min(255, data[offset + 1] + 12);
    data[offset + 2] = Math.min(255, data[offset + 2] + 6);
  }
  return { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data };
}

function withAtmosphericPatch(image) {
  const data = Buffer.from(image.data);
  const centerX = 1_100;
  const centerY = 170;
  const radiusX = 120;
  const radiusY = 72;
  const fog = [180, 180, 185];
  for (let y = centerY - radiusY; y <= centerY + radiusY; y++) {
    for (let x = centerX - radiusX; x <= centerX + radiusX; x++) {
      const distanceSquared = ((x - centerX) / radiusX) ** 2
        + ((y - centerY) / radiusY) ** 2;
      if (distanceSquared >= 1) continue;
      const alpha = 0.20 * (1 - distanceSquared);
      const offset = (y * CAPTURE_WIDTH + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        data[offset + channel] = Math.round(
          data[offset + channel] * (1 - alpha) + fog[channel] * alpha,
        );
      }
    }
  }
  return { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data };
}

function withSinglePixelRasterEdgeNoise(image) {
  const data = Buffer.from(image.data);
  const x = 1_030;
  for (let y = 80; y < 920; y++) {
    const offset = (y * CAPTURE_WIDTH + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] = Math.min(255, data[offset + channel] + 24);
    }
  }
  return { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data };
}

const reference = fixtureImage();
const REPORT_ONLY_APPEARANCE_THRESHOLDS = Object.freeze({
  maxLinearRgbMae: null,
  maxLinearRgbRmse: null,
  maxP95LumaError: null,
  minLuminanceSsim: null,
  maxLowFrequencySrgbByteError: null,
  maxLowFrequencySrgbFractionOver4: null,
});

test("localized defaults retain WebGL/Metal edge headroom below the mist regression", () => {
  assert.equal(DEFAULT_THRESHOLDS.maxLowFrequencySrgbByteError, 10);
  assert.equal(DEFAULT_THRESHOLDS.maxLowFrequencySrgbFractionOver4, 0.0025);
  assert.ok(DEFAULT_THRESHOLDS.maxLowFrequencySrgbByteError < 12.24);
});

test("canonical Web and Unity filenames are paired in contract order", () => {
  assert.deepEqual(VIEW_PAIRS, [
    { id: "camp-ember", web: "camp-ember.png", unity: "world_00_camp-ember.png" },
    { id: "mid-gorge", web: "mid-gorge.png", unity: "world_01_mid-gorge.png" },
    { id: "iron-bell", web: "iron-bell.png", unity: "world_02_iron-bell.png" },
  ]);
});

test("inputs must be exactly 1600x1000 RGBA and fully opaque", () => {
  assert.equal(validateCaptureImage(reference), reference);
  assert.throws(
    () => validateCaptureImage({ width: 1_599, height: 1_000, data: Buffer.alloc(0) }),
    (error) => error instanceof ParityInputError && /exactly 1600x1000/.test(error.message),
  );
  const translucent = { ...reference, data: Buffer.from(reference.data) };
  translucent.data[(713 * CAPTURE_WIDTH + 421) * 4 + 3] = 254;
  assert.throws(
    () => validateCaptureImage(translucent, "Unity fixture"),
    (error) => error instanceof ParityInputError
      && /Unity fixture must be fully opaque/.test(error.message)
      && /\(421, 713\)/.test(error.message),
  );
  assert.throws(
    () => decodeCapturePng(Buffer.from("not a png"), "broken fixture"),
    (error) => error instanceof ParityInputError && /not a readable PNG/.test(error.message),
  );
});

test("identical plates have zero appearance error and exact structural alignment", () => {
  const result = compareCaptureImages(reference, reference);
  assert.ok(result.structure.edgeNccAtOrigin > 0.999999);
  assert.ok(result.structure.bestUnmirrored.edgeNcc > 0.999999);
  assert.deepEqual(result.structure.bestUnmirrored.unityContentOffsetPx, { x: 0, y: 0 });
  assert.ok(result.structure.chiralityMargin > DEFAULT_THRESHOLDS.minChiralityMargin);
  assert.equal(result.appearance.linearRgbMae, 0);
  assert.equal(result.appearance.linearRgbRmse, 0);
  assert.equal(result.appearance.p95LinearLumaError, 0);
  assert.equal(result.appearance.luminanceSsim, 1);
  assert.equal(result.appearance.lowFrequencySrgbMaxByteError, 0);
  assert.equal(result.appearance.lowFrequencySrgbPixelsOver4, 0);
  assert.equal(result.appearance.lowFrequencySrgbFractionOver4, 0);
  assert.equal(
    result.appearance.lowFrequencySrgbPixelsEvaluated,
    CAPTURE_WIDTH * CAPTURE_HEIGHT,
  );
  assert.equal(result.analysis.lowFrequencyBoxBlurRadiusPx, LOW_FREQUENCY_BLUR_RADIUS_PX);
  assert.equal(result.analysis.lowFrequencyNoticeByteError, LOW_FREQUENCY_NOTICE_BYTE_ERROR);
  assert.equal(result.gating.appearanceReportOnly, false);
  assert.equal(result.gating.pass, true);
});

test("localized atmospheric mismatch cannot hide below the whole-frame P95", () => {
  const result = compareCaptureImages(reference, withAtmosphericPatch(reference));
  assert.ok(result.appearance.p95LinearLumaError <= DEFAULT_THRESHOLDS.maxP95LumaError);
  assert.ok(result.appearance.linearRgbMae <= DEFAULT_THRESHOLDS.maxLinearRgbMae);
  assert.ok(result.appearance.linearRgbRmse <= DEFAULT_THRESHOLDS.maxLinearRgbRmse);
  assert.ok(result.appearance.luminanceSsim >= DEFAULT_THRESHOLDS.minLuminanceSsim);
  assert.ok(
    result.appearance.lowFrequencySrgbMaxByteError
      > DEFAULT_THRESHOLDS.maxLowFrequencySrgbByteError,
  );
  assert.ok(
    result.appearance.lowFrequencySrgbFractionOver4
      > DEFAULT_THRESHOLDS.maxLowFrequencySrgbFractionOver4,
  );
  assert.equal(result.gating.structuralFailures.length, 0);
  assert.deepEqual(
    result.gating.appearanceFailures.map((failure) => failure.split("=")[0]),
    ["lowFrequencySrgbMaxByteError", "lowFrequencySrgbFractionOver4"],
  );
  assert.equal(result.gating.pass, false);
});

test("single-pixel raster edge noise is suppressed by the low-frequency gate", () => {
  const result = compareCaptureImages(reference, withSinglePixelRasterEdgeNoise(reference));
  assert.ok(
    result.appearance.lowFrequencySrgbMaxByteError
      < DEFAULT_THRESHOLDS.maxLowFrequencySrgbByteError,
  );
  assert.equal(result.appearance.lowFrequencySrgbPixelsOver4, 0);
  assert.equal(result.appearance.lowFrequencySrgbFractionOver4, 0);
  assert.equal(result.gating.pass, true);
});

test("translation search reports Unity content offset and enforces the structural limit", () => {
  // Deliberately off the 4x analysis grid: refinement must retain one-pixel plate precision.
  const shifted = translated(reference, 7, -3);
  const failed = compareCaptureImages(reference, shifted);
  assert.deepEqual(
    failed.structure.bestUnmirrored.unityContentOffsetPx,
    { x: 7, y: -3 },
  );
  assert.deepEqual(
    failed.structure.bestUnmirrored.unityShiftToAlignPx,
    { x: -7, y: 3 },
  );
  assert.equal(failed.gating.pass, false);
  assert.ok(failed.gating.structuralFailures.some((failure) => /translation=7,-3px/.test(failure)));

  const permitted = compareCaptureImages(reference, shifted, {
    thresholds: {
      ...REPORT_ONLY_APPEARANCE_THRESHOLDS,
      minEdgeNcc: 0.99,
      maxTranslationPx: 12,
    },
  });
  assert.equal(permitted.gating.pass, true, JSON.stringify(permitted.gating));
  assert.equal(permitted.appearance.lowFrequencySrgbMaxByteError, 0);
  assert.equal(permitted.appearance.lowFrequencySrgbPixelsOver4, 0);
  assert.deepEqual(permitted.appearance.alignmentAppliedPx, { x: -7, y: 3 });
});

test("translation search includes the exact positive 32px boundary", () => {
  const boundary = compareCaptureImages(reference, translated(reference, 32, 0), {
    thresholds: { ...REPORT_ONLY_APPEARANCE_THRESHOLDS, maxTranslationPx: 32 },
  });
  assert.deepEqual(boundary.structure.bestUnmirrored.unityContentOffsetPx, { x: 32, y: 0 });
  assert.equal(boundary.gating.pass, true, JSON.stringify(boundary.gating));
  assert.equal(boundary.appearance.lowFrequencySrgbMaxByteError, 0);
  assert.equal(boundary.appearance.lowFrequencySrgbPixelsOver4, 0);
});

test("a horizontal mirror is diagnosed and rejected as wrong chirality", () => {
  const result = compareCaptureImages(reference, mirrored(reference));
  assert.ok(result.structure.bestMirrored.edgeNcc > 0.999999);
  assert.ok(result.structure.bestMirrored.edgeNcc > result.structure.bestUnmirrored.edgeNcc);
  assert.ok(result.structure.chiralityMargin < 0);
  assert.equal(result.gating.pass, false);
  assert.ok(result.gating.structuralFailures.some((failure) =>
    failure.startsWith("wrong-chirality:")));
});

test("calibrated appearance gates by default and report-only remains available to callers", () => {
  const colorShift = recolored(reference);
  const calibrated = compareCaptureImages(reference, colorShift);
  assert.ok(calibrated.structure.bestUnmirrored.edgeNcc > 0.999999);
  assert.ok(calibrated.appearance.linearRgbMae > 0.04);
  assert.ok(calibrated.appearance.linearRgbRmse > calibrated.appearance.linearRgbMae);
  assert.ok(calibrated.appearance.p95LinearLumaError > 0.05);
  assert.ok(calibrated.appearance.luminanceSsim < 0.98);
  assert.equal(calibrated.gating.appearanceGateEnabled, true);
  assert.equal(calibrated.gating.appearanceReportOnly, false);
  assert.equal(calibrated.gating.appearanceFailures.length, 6);
  assert.equal(calibrated.gating.pass, false);

  const reportOnly = compareCaptureImages(reference, colorShift, {
    thresholds: REPORT_ONLY_APPEARANCE_THRESHOLDS,
  });
  assert.ok(reportOnly.structure.bestUnmirrored.edgeNcc > 0.999999);
  assert.ok(reportOnly.appearance.linearRgbMae > 0.04);
  assert.ok(reportOnly.appearance.linearRgbRmse > reportOnly.appearance.linearRgbMae);
  assert.ok(reportOnly.appearance.p95LinearLumaError > 0.05);
  assert.ok(reportOnly.appearance.luminanceSsim < 0.98);
  assert.equal(reportOnly.gating.appearanceGateEnabled, false);
  assert.equal(reportOnly.gating.appearanceReportOnly, true);
  assert.equal(reportOnly.gating.pass, true);

});

test("diagnostic images are fixed-coordinate, opaque, deterministic pixel transforms", () => {
  const colorShift = recolored(reference);
  const checkerboard = checkerboardImage(reference, colorShift, 80);
  const difference = amplifiedDifferenceImage(reference, colorShift, 4);
  const webPixel = (10 * CAPTURE_WIDTH + 10) * 4;
  const unityPixel = (10 * CAPTURE_WIDTH + 90) * 4;
  assert.deepEqual(
    [...checkerboard.data.subarray(webPixel, webPixel + 4)],
    [...reference.data.subarray(webPixel, webPixel + 4)],
  );
  assert.deepEqual(
    [...checkerboard.data.subarray(unityPixel, unityPixel + 4)],
    [...colorShift.data.subarray(unityPixel, unityPixel + 4)],
  );
  assert.deepEqual(
    [...difference.data.subarray(webPixel, webPixel + 4)],
    [96, 48, 24, 255],
  );
});

test("pair writer emits per-view JSON, checkerboard and amplified difference PNGs", async (t) => {
  const outDir = await mkdtemp(join(tmpdir(), "guns-only-parity-artifacts-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const colorShift = recolored(reference);
  const comparison = compareCaptureImages(reference, colorShift);
  const written = await writePairArtifacts({
    outDir,
    id: "camp-ember",
    webImage: reference,
    unityImage: colorShift,
    report: comparison,
    diffGain: 4,
  });
  assert.deepEqual((await readdir(outDir)).sort(), [
    "camp-ember.checkerboard.png",
    "camp-ember.diff.png",
    "camp-ember.parity.json",
  ]);
  const json = JSON.parse(await readFile(join(outDir, "camp-ember.parity.json"), "utf8"));
  assert.equal(json.id, "camp-ember");
  assert.equal(json.artifacts.diagnosticsUseFixedCoordinates, true);
  assert.equal(json.artifacts.differenceGain, 4);
  assert.deepEqual(json.gating, written.gating);
  for (const name of ["camp-ember.checkerboard.png", "camp-ember.diff.png"]) {
    const image = PNG.sync.read(await readFile(join(outDir, name)));
    assert.equal(image.width, CAPTURE_WIDTH);
    assert.equal(image.height, CAPTURE_HEIGHT);
    validateCaptureImage(image, name);
  }
});

test("CLI parsing applies calibrated parity gates and accepts explicit overrides", () => {
  const base = parseArgs(["--web", "web", "--unity", "unity", "--out", "out"]);
  assert.deepEqual(base.thresholds, DEFAULT_THRESHOLDS);
  const calibrated = parseArgs([
    "--web", "web",
    "--unity", "unity",
    "--out", "out",
    "--min-edge-ncc", "0.7",
    "--max-translation-px", "8",
    "--min-chirality-margin", "0.05",
    "--max-linear-mae", "0.06",
    "--max-linear-rmse", "0.09",
    "--max-p95-luma", "0.14",
    "--min-luma-ssim", "0.9",
    "--max-lowfreq-byte-error", "12",
    "--max-lowfreq-over4-frac", "0.02",
  ]);
  assert.deepEqual(calibrated.thresholds, {
    minEdgeNcc: 0.7,
    maxTranslationPx: 8,
    minChiralityMargin: 0.05,
    maxLinearRgbMae: 0.06,
    maxLinearRgbRmse: 0.09,
    maxP95LumaError: 0.14,
    minLuminanceSsim: 0.9,
    maxLowFrequencySrgbByteError: 12,
    maxLowFrequencySrgbFractionOver4: 0.02,
  });
  assert.throws(
    () => parseArgs(["--web", "web", "--unity", "unity"]),
    /--web, --unity and --out are required/,
  );
  assert.throws(
    () => parseArgs(["--web", "web", "--unity", "unity", "--out", "out", "--mode", "maybe"]),
    /--mode must be 'fail' or 'warn'/,
  );
  assert.throws(
    () => parseArgs(["--web", "web", "--unity", "unity", "--out", "out", "--wat", "1"]),
    /Unknown option '--wat'/,
  );
});

test("invalid CLI inputs fail closed per view and preserve configured appearance mode", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "guns-only-parity-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const webDir = join(root, "web");
  const unityDir = join(root, "unity");
  const outDir = join(root, "out");
  await Promise.all([mkdir(webDir), mkdir(unityDir)]);
  await Promise.all(VIEW_PAIRS.flatMap((pair) => [
    writeFile(join(webDir, pair.web), Buffer.from(`broken web ${pair.id}`)),
    writeFile(join(unityDir, pair.unity), Buffer.from(`broken unity ${pair.id}`)),
  ]));
  const summary = await runComparison({
    webDir,
    unityDir,
    outDir,
    thresholds: { maxLinearRgbMae: 0.06 },
    diffGain: 4,
  });
  assert.equal(summary.pass, false);
  assert.equal(summary.appearanceGateEnabled, true);
  assert.equal(summary.views.length, 3);
  assert.ok(summary.views.every((view) =>
    view.structuralFailures.includes("invalid-input") && /not a readable PNG/.test(view.inputError)));
  assert.deepEqual((await readdir(outDir)).sort(), [
    "camp-ember.parity.json",
    "iron-bell.parity.json",
    "mid-gorge.parity.json",
    "summary.json",
  ]);
  const camp = JSON.parse(await readFile(join(outDir, "camp-ember.parity.json"), "utf8"));
  assert.equal(camp.gating.appearanceGateEnabled, true);
  assert.equal(camp.gating.appearanceReportOnly, false);
  assert.equal(camp.gating.pass, false);
});
