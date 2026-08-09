#!/usr/bin/env node

/** Capture three silent, HUD/ownship-free Weekend Web world plates from a published wwwroot. */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COBRA_CHROMIUM_ARGS } from "../../web/smoke/cobra_authority.mjs";
import {
  CAPTURE_HEIGHT,
  CAPTURE_MANIFEST_SCHEMA,
  CAPTURE_WIDTH,
  WeekendAcceptanceError,
  loadAcceptanceContract,
} from "./acceptance-contract.mjs";
import { decodeCapturePng } from "./compare-unity.mjs";

const require = createRequire(new URL("../../web/smoke/package.json", import.meta.url));
const { chromium } = require("playwright");
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(MODULE_DIR, "../..");
const OUT_DIR = resolve(process.env.WEEKEND_VISUAL_SHOT_DIR ?? join(MODULE_DIR, "shots/web"));

function resolveWwwroot() {
  const explicit = process.env.WEEKEND_VISUAL_WWWROOT || process.env.SMOKE_WWWROOT;
  if (explicit) return resolve(explicit);
  const preview = resolve(process.env.GUNS_PREVIEW_OUT ?? "/tmp/guns-only-web", "wwwroot");
  if (existsSync(join(preview, "_framework"))) return preview;
  throw new Error(
    "Need a published wwwroot. Set WEEKEND_VISUAL_WWWROOT or run:\n"
      + "  OPEN=0 GUNS_PREVIEW_OUT=/tmp/guns-only-web bin/preview-web",
  );
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
    server.on("error", reject);
  });
}

async function servePython(wwwroot) {
  const port = await freePort();
  const child = spawn(
    "python3",
    ["-m", "http.server", String(port), "--bind", "127.0.0.1"],
    { cwd: wwwroot, stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(resolveReady, 400);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`python http.server exited ${code}: ${stderr}`));
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    close() { child.kill("SIGTERM"); },
  };
}

function same(value, expected, label) {
  if (value !== expected) {
    throw new WeekendAcceptanceError(`${label} must be ${JSON.stringify(expected)}; got ${JSON.stringify(value)}.`);
  }
}

function sameVector(actual, expected, label, tolerance = 1e-9) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new WeekendAcceptanceError(`${label} must contain ${expected.length} channels.`);
  }
  for (let index = 0; index < expected.length; index++) {
    if (!Number.isFinite(actual[index]) || Math.abs(actual[index] - expected[index]) > tolerance) {
      throw new WeekendAcceptanceError(
        `${label}[${index}] must be ${expected[index]} ± ${tolerance}; got ${actual[index]}.`,
      );
    }
  }
}

export function validateWebDiagnostics(diagnostics, loadedContract, expectedViewId) {
  if (!diagnostics?.ready || !diagnostics.active || diagnostics.failure) {
    throw new WeekendAcceptanceError(`Weekend Web QA did not settle: ${JSON.stringify(diagnostics)}`);
  }
  same(diagnostics.acceptanceContractSha256, loadedContract.sha256, "acceptance contract hash");
  same(
    diagnostics.circuitSemanticSha256,
    loadedContract.contract.scenes.circuit.semantic_sha256,
    "circuit semantic hash",
  );
  same(
    diagnostics.circuitFileSha256,
    loadedContract.contract.scenes.circuit.file_sha256,
    "circuit file hash",
  );
  same(
    diagnostics.openRoadFileSha256,
    loadedContract.contract.scenes.open_road.file_sha256,
    "open-road file hash",
  );
  same(diagnostics.circuitRoot, "weekend-track-day", "circuit root");
  same(diagnostics.openRoadRoot, "weekend-open-road-network", "open-road root");
  same(diagnostics.roadCount, 8, "open-road count");
  same(diagnostics.roadsideInstanceCount, 144, "roadside instance count");
  same(diagnostics.ownshipVisible, false, "R1 ownship visibility");
  same(diagnostics.currentView, expectedViewId, "parked view");
  const expectedView = loadedContract.contract.views.find((view) => view.id === expectedViewId);
  if (!expectedView) throw new WeekendAcceptanceError(`Unknown acceptance view '${expectedViewId}'.`);
  sameVector(diagnostics.camera?.position_m, expectedView.position_m, "live camera position");
  const direction = expectedView.target_m.map(
    (channel, index) => channel - expectedView.position_m[index],
  );
  const range = Math.hypot(...direction);
  sameVector(
    diagnostics.camera?.forward_unit,
    direction.map((channel) => channel / range),
    "live camera forward",
  );
  const forward = direction.map((channel) => channel / range);
  const worldUp = expectedView.up;
  const upProjection = worldUp.reduce(
    (sum, channel, index) => sum + channel * forward[index],
    0,
  );
  const screenUp = worldUp.map(
    (channel, index) => channel - forward[index] * upProjection,
  );
  const upRange = Math.hypot(...screenUp);
  sameVector(
    diagnostics.camera?.screen_up_unit,
    screenUp.map((channel) => channel / upRange),
    "live camera screen up",
  );
  same(diagnostics.canvas?.clientWidth, CAPTURE_WIDTH, "canvas CSS width");
  same(diagnostics.canvas?.clientHeight, CAPTURE_HEIGHT, "canvas CSS height");
  same(diagnostics.canvas?.backingWidth, CAPTURE_WIDTH, "canvas backing width");
  same(diagnostics.canvas?.backingHeight, CAPTURE_HEIGHT, "canvas backing height");
  same(diagnostics.output?.antiAliasingSamples, 4, "WebGL anti-aliasing samples");
  // Chromium/ANGLE may allocate an alpha-capable drawing buffer even when Three is constructed
  // with alpha:false. The renderer's opaque clear plus decoded PNG alpha is the portable truth.
  same(diagnostics.output?.clearAlpha, 1, "renderer clear alpha");
  same(diagnostics.output?.srgb, true, "renderer sRGB output");
  same(diagnostics.output?.acesFilmic, true, "renderer ACES filmic output");
  same(diagnostics.output?.exposure, 1.04, "renderer tone-mapping exposure");
  same(diagnostics.camera?.fov, 68, "camera FOV");
  same(diagnostics.camera?.aspect, 1.6, "camera aspect");
  same(diagnostics.camera?.near, 0.25, "camera near plane");
  same(diagnostics.camera?.far, 24_000, "camera far plane");
  const expectedTextures = new Set([
    "TEX_WEEKEND_TRACK_ASPHALT_V1",
    "TEX_WEEKEND_HINTERLAND_GROUND_V1",
    "TEX_WEEKEND_FIELD_LANDCOVER_V1",
    "TEX_WEEKEND_ROADSIDE_ATLAS_V1",
  ]);
  if (!Array.isArray(diagnostics.textures) || diagnostics.textures.length !== 4) {
    throw new WeekendAcceptanceError("Weekend Web QA did not report exactly four world textures.");
  }
  for (const texture of diagnostics.textures) {
    if (!expectedTextures.delete(texture.name)
        || !texture.complete
        || !(texture.width > 0)
        || !(texture.height > 0)) {
      throw new WeekendAcceptanceError(`Weekend Web texture is not exact/ready: ${JSON.stringify(texture)}`);
    }
  }
  if (expectedTextures.size !== 0) {
    throw new WeekendAcceptanceError("Weekend Web QA omitted a required world texture.");
  }
  return diagnostics;
}

export function buildWebCaptureManifest(loadedContract) {
  const { contract } = loadedContract;
  return {
    schema: CAPTURE_MANIFEST_SCHEMA,
    renderer: "web",
    acceptance_contract_sha256: loadedContract.sha256,
    width_px: CAPTURE_WIDTH,
    height_px: CAPTURE_HEIGHT,
    opaque: true,
    vertical_fov_deg: contract.capture.vertical_fov_deg,
    aspect: contract.capture.aspect,
    scenes: {
      circuit_semantic_sha256: contract.scenes.circuit.semantic_sha256,
      circuit_file_sha256: contract.scenes.circuit.file_sha256,
      open_road_file_sha256: contract.scenes.open_road.file_sha256,
    },
    views: contract.views.map((view) => ({
      id: view.id,
      file: view.web_file,
      position_m: view.position_m,
      target_m: view.target_m,
    })),
  };
}

export async function captureWeb(options = {}) {
  const wwwroot = resolve(options.wwwroot ?? resolveWwwroot());
  const outDir = resolve(options.outDir ?? OUT_DIR);
  const loadedContract = await loadAcceptanceContract(options.contractPath);
  await mkdir(outDir, { recursive: true });
  const site = await servePython(wwwroot);
  const browser = await chromium.launch({ headless: true, args: [...COBRA_CHROMIUM_ARGS] });
  try {
    const page = await browser.newPage({
      viewport: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
      deviceScaleFactor: 1,
    });
    page.on("pageerror", (error) => process.stderr.write(`pageerror: ${error.message}\n`));
    await page.goto(`${site.url}/weekend-ride/index.html?audioQa=silent&visualQa=world`, {
      waitUntil: "load",
      timeout: 180_000,
    });
    // Clean world plate only. Production menu/HUD styles are not modified on disk.
    await page.addStyleTag({ content: `
      html, body { width: 1600px !important; height: 1000px !important; }
      body { display: block !important; grid-template-rows: none !important; }
      body > header, body > :not(main):not(script) { display: none !important; visibility: hidden !important; }
      main, .viewport { position: relative !important; inset: auto !important; width: 1600px !important; height: 1000px !important; }
      .viewport > :not(#scene) { display: none !important; visibility: hidden !important; }
      .viewport::after { content: none !important; display: none !important; background: none !important; box-shadow: none !important; }
      #scene { width: 1600px !important; height: 1000px !important; filter: none !important; }
    ` });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForFunction(
      () => document.querySelector("#status")?.dataset.ready === "true"
        && window.__gunsOnlyWeekendAuthority?.phase === "active",
      undefined,
      { timeout: 240_000 },
    );
    await page.waitForFunction(
      () => window.__gunsOnlyWeekendVisualQa?.ready === true,
      undefined,
      { timeout: 120_000 },
    );

    for (const view of loadedContract.contract.views) {
      await page.evaluate((id) => window.__gunsOnlyWeekendVisualQa.park(id), view.id);
      await page.evaluate(() => new Promise((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
      }));
      const diagnostics = await page.evaluate(() => window.__gunsOnlyWeekendVisualQa.diagnostics());
      validateWebDiagnostics(diagnostics, loadedContract, view.id);
      const path = join(outDir, view.web_file);
      await page.screenshot({
        path,
        type: "png",
        scale: "css",
        clip: { x: 0, y: 0, width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
      });
      decodeCapturePng(await readFile(path), `Web ${view.id}`);
      process.stdout.write(`weekend-web-capture: wrote ${path}\n`);
    }
    await writeFile(
      join(outDir, "capture.json"),
      `${JSON.stringify(buildWebCaptureManifest(loadedContract), null, 2)}\n`,
      "utf8",
    );
  } finally {
    await browser.close();
    site.close();
  }
  return outDir;
}

export async function main() {
  try {
    await captureWeb();
    return 0;
  } catch (error) {
    process.stderr.write(`weekend-web-capture: ${error instanceof Error ? error.stack : String(error)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = await main();
