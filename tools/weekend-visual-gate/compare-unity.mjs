#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_THRESHOLDS as COBRA_THRESHOLDS,
  amplifiedDifferenceImage,
  checkerboardImage,
  compareCaptureImages as compareGenericCaptureImages,
  decodeCapturePng,
  validateCaptureImage,
  writePairArtifacts,
} from "../cobra-scenery-gate/compare-unity.mjs";
import {
  CAPTURE_HEIGHT,
  CAPTURE_WIDTH,
  WeekendAcceptanceError,
  loadAcceptanceContract,
  validateCaptureManifest,
} from "./acceptance-contract.mjs";

export { CAPTURE_HEIGHT, CAPTURE_WIDTH, amplifiedDifferenceImage, checkerboardImage, decodeCapturePng, validateCaptureImage };
export const DEFAULT_THRESHOLDS = Object.freeze({
  ...COBRA_THRESHOLDS,
  // The accepted low riding-line Web plates have exact self margins 0.820/0.655/0.587.
  // Retain Cobra's strict 0.50 floor: it leaves narrow raster headroom on the weakest open-road
  // view while a clip-X/chirality regression remains decisively negative.
  minChiralityMargin: 0.50,
  // Two independent Chromium/ANGLE + Unity/Metal 4x-MSAA captures were byte-identical. Their
  // remaining signed residual is confined to thin track markings, foliage silhouettes and mip
  // transitions: RMSE 0.003854, p95 luma 0.002472, 17px-blur maximum 24.727 bytes and >4-byte
  // fraction 0.014423. These are the smallest rounded bounds above that repeated raster floor.
  // Keep MAE/SSIM and all structural bounds at Cobra strictness; the checked Art5 missing-fog
  // calibration still fails every view on edge NCC, MAE, RMSE and both low-frequency bounds.
  maxLinearRgbRmse: 0.004,
  maxP95LumaError: 0.0025,
  maxLowFrequencySrgbByteError: 25,
  maxLowFrequencySrgbFractionOver4: 0.015,
});

export function compareCaptureImages(webImage, unityImage, options = {}) {
  const result = compareGenericCaptureImages(webImage, unityImage, options);
  return Object.freeze({ ...result, schema: "guns-only.weekend-web-unity-parity.v1" });
}

async function readManifest(path, renderer, loadedContract) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new WeekendAcceptanceError(`${renderer} capture manifest '${path}' is unreadable: ${error.message}`);
  }
  return validateCaptureManifest(manifest, renderer, loadedContract);
}

function appearanceGateEnabled(thresholds) {
  return [
    thresholds.maxLinearRgbMae,
    thresholds.maxLinearRgbRmse,
    thresholds.maxP95LumaError,
    thresholds.minLuminanceSsim,
    thresholds.maxLowFrequencySrgbByteError,
    thresholds.maxLowFrequencySrgbFractionOver4,
  ].some((value) => value !== null);
}

export async function runComparison(options) {
  const webDir = resolve(options.webDir);
  const unityDir = resolve(options.unityDir);
  const outDir = resolve(options.outDir);
  const loadedContract = await loadAcceptanceContract(options.contractPath);
  const thresholds = Object.freeze({ ...DEFAULT_THRESHOLDS, ...(options.thresholds ?? {}) });
  const gateAppearance = appearanceGateEnabled(thresholds);
  await mkdir(outDir, { recursive: true });

  let webManifest;
  let unityManifest;
  let manifestError = null;
  try {
    [webManifest, unityManifest] = await Promise.all([
      readManifest(join(webDir, "capture.json"), "web", loadedContract),
      readManifest(join(unityDir, "weekend_visual_capture.json"), "unity", loadedContract),
    ]);
  } catch (error) {
    manifestError = error instanceof Error ? error.message : String(error);
  }

  const views = [];
  for (let index = 0; index < loadedContract.contract.views.length; index++) {
    const view = loadedContract.contract.views[index];
    const webPath = join(webDir, view.web_file);
    const unityPath = join(unityDir, view.unity_file);
    let report;
    try {
      if (manifestError) throw new WeekendAcceptanceError(manifestError);
      const webEntry = webManifest.views[index];
      const unityEntry = unityManifest.views[index];
      if (webEntry.file !== view.web_file || unityEntry.file !== view.unity_file) {
        throw new WeekendAcceptanceError(`Capture file pairing changed for '${view.id}'.`);
      }
      const [webBytes, unityBytes] = await Promise.all([readFile(webPath), readFile(unityPath)]);
      const webImage = decodeCapturePng(webBytes, `Web ${view.id}`);
      const unityImage = decodeCapturePng(unityBytes, `Unity ${view.id}`);
      const comparison = compareCaptureImages(webImage, unityImage, {
        webLabel: `Web ${view.id}`,
        unityLabel: `Unity ${view.id}`,
        thresholds,
      });
      report = await writePairArtifacts({
        outDir,
        id: view.id,
        webImage,
        unityImage,
        report: {
          ...comparison,
          contract: {
            path: loadedContract.path,
            sha256: loadedContract.sha256,
            circuitSemanticSha256: loadedContract.contract.scenes.circuit.semantic_sha256,
            openRoadFileSha256: loadedContract.contract.scenes.open_road.file_sha256,
          },
          sources: { web: webPath, unity: unityPath },
        },
        diffGain: options.diffGain ?? 4,
      });
    } catch (error) {
      report = {
        schema: "guns-only.weekend-web-unity-parity.v1",
        id: view.id,
        sources: { web: webPath, unity: unityPath },
        inputError: error instanceof Error ? error.message : String(error),
        gating: {
          structuralFailures: ["invalid-contract-or-input"],
          appearanceGateEnabled: gateAppearance,
          appearanceReportOnly: !gateAppearance,
          appearanceFailures: [],
          pass: false,
        },
      };
      await writeFile(
        join(outDir, `${view.id}.parity.json`),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      );
    }
    views.push(report);
  }

  const summary = {
    schema: "guns-only.weekend-web-unity-parity-summary.v1",
    pass: views.every((view) => view.gating.pass),
    acceptanceContractSha256: loadedContract.sha256,
    manifestError,
    appearanceGateEnabled: gateAppearance,
    thresholds,
    views: views.map((view) => ({
      id: view.id,
      pass: view.gating.pass,
      structuralFailures: view.gating.structuralFailures,
      appearanceFailures: view.gating.appearanceFailures,
      inputError: view.inputError ?? null,
    })),
  };
  await writeFile(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

function numeric(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${option} requires a finite number.`);
  return parsed;
}

function next(argv, index, option) {
  if (index + 1 >= argv.length) throw new TypeError(`${option} requires a value.`);
  return argv[index + 1];
}

export function parseArgs(argv) {
  const options = { webDir: null, unityDir: null, outDir: null, contractPath: undefined, mode: "fail", diffGain: 4, thresholds: {} };
  const thresholdOptions = new Map([
    ["--min-edge-ncc", "minEdgeNcc"],
    ["--max-translation-px", "maxTranslationPx"],
    ["--min-chirality-margin", "minChiralityMargin"],
    ["--max-linear-mae", "maxLinearRgbMae"],
    ["--max-linear-rmse", "maxLinearRgbRmse"],
    ["--max-p95-luma", "maxP95LumaError"],
    ["--min-luma-ssim", "minLuminanceSsim"],
    ["--max-lowfreq-byte-error", "maxLowFrequencySrgbByteError"],
    ["--max-lowfreq-over4-frac", "maxLowFrequencySrgbFractionOver4"],
  ]);
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === "-h" || option === "--help") return { help: true };
    const value = next(argv, index, option);
    if (option === "--web") options.webDir = resolve(value);
    else if (option === "--unity") options.unityDir = resolve(value);
    else if (option === "--out") options.outDir = resolve(value);
    else if (option === "--contract") options.contractPath = resolve(value);
    else if (option === "--mode") options.mode = value;
    else if (option === "--diff-gain") options.diffGain = numeric(value, option);
    else if (thresholdOptions.has(option)) options.thresholds[thresholdOptions.get(option)] = numeric(value, option);
    else throw new TypeError(`Unknown option '${option}'.`);
    index++;
  }
  if (!options.webDir || !options.unityDir || !options.outDir) {
    throw new TypeError("--web, --unity and --out are required.");
  }
  if (!new Set(["fail", "warn"]).has(options.mode)) throw new TypeError("--mode must be 'fail' or 'warn'.");
  if (!(options.diffGain > 0)) throw new RangeError("--diff-gain must be greater than zero.");
  return options;
}

const HELP = `Usage: node tools/weekend-visual-gate/compare-unity.mjs --web DIR --unity DIR --out DIR [options]\n\nThe gate requires capture manifests pinned to the same Weekend acceptance/circuit/open-road hashes, then compares three exact 1600x1000 opaque PNG pairs using translation, edge NCC, chirality, linear appearance, SSIM and low-frequency residual metrics.\n`;

export async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); }
  catch (error) {
    process.stderr.write(`weekend-parity: ${error.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  let summary;
  try { summary = await runComparison(options); }
  catch (error) {
    process.stderr.write(`weekend-parity: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  for (const view of summary.views) {
    process.stdout.write(`${view.id}: ${view.pass ? "PASS" : "FAIL"}${view.inputError ? ` · ${view.inputError}` : ""}\n`);
  }
  return summary.pass || options.mode === "warn" ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = await main();
