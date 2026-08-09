#!/usr/bin/env node
/**
 * Silent published-candidate pixel integrity gate for the First Merge launch path.
 *
 * This is deliberately a published-app gate: source wwwroot does not contain the WASM authority.
 * Build a candidate, then point the gate at that exact output so a stale preview cannot pass:
 *
 *   dotnet publish web/GunsOnly.Web.csproj -c Release -o /private/tmp/guns-first-merge
 *   FIRST_MERGE_GATE_WWWROOT=/private/tmp/guns-first-merge/wwwroot \
 *     node tools/perf/f22_first_merge_pixel_gate.mjs
 *
 * Artifacts default to /private/tmp/guns-only-first-merge-pixel-gate. The runner always uses
 * audioQa=silent, freezes the first active mission-7 frame, and writes diagnostics.json even when
 * asset/readiness or minimum rendered-signal integrity fails. It is not an aesthetic acceptance.
 * It samples the roughly 3 km merge start; the fixed 90 m AGL aesthetic plate is evaluated
 * independently. Its Web/native/human status and remaining release seams live in docs/STATUS.md.
 */

import { createHash } from "node:crypto";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_DIR = resolve(SCRIPT_DIR, "../..");
const PLAYWRIGHT_PACKAGE = new URL("../../web/smoke/package.json", import.meta.url);

export const FIRST_MERGE_BEAT = 7;
export const EXPECTED_TERRAIN_ID = "terrain.ukraine.rapier-range.atlas.v1";
export const EXPECTED_SCENERY_ERA = "ukraine-modern";
export const MERGE_INTEGRITY_APPROXIMATE_AGL_M = 3_000;
export const LOW_ALTITUDE_AESTHETIC_PLATE_AGL_M = 90;
export const UKRAINE_V2_TEXTURE_PATH =
  "/content/packs/ukraine-modern/environment/textures/ukraine-temperate-ground-v2.webp";
export const CAPTURE_VIEWPORT = Object.freeze({ width: 1_280, height: 800 });

// The level mission-7 start puts the horizon at roughly 70% of the scene canvas. This crop stays
// below it, excludes the page HUD and menus by capturing #scene itself, and leaves a small border
// so compositor edges cannot inflate the score.
export const GROUND_ROI = Object.freeze({
  x: 0.08,
  y: 0.74,
  width: 0.84,
  height: 0.24,
});

// Calibrated below the current authored First Merge ground (historical reference: luma sigma
// 0.054, p90-p10 0.128, block p90-p10 0.104) while still rejecting a pale uniform plane, a sky
// crop, or pixel-scale noise that has no readable macro albedo.
export const GROUND_THRESHOLDS = Object.freeze({
  minimumLumaStandardDeviation: 0.025,
  minimumRobustLumaContrast: 0.065,
  minimumMacroLumaContrast: 0.030,
  minimumMeanLuma: 0.12,
  maximumMeanLuma: 0.88,
  minimumOpaqueFraction: 1,
});

const BLOCK_COLUMNS = 12;
const BLOCK_ROWS = 6;
const DEFAULT_TIMEOUT_MS = 180_000;
const ROUTE_MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
});

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function quantile(sorted, fraction) {
  if (sorted.length === 0) return Number.NaN;
  const clamped = Math.max(0, Math.min(1, Number(fraction) || 0));
  const position = (sorted.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const mix = position - lower;
  return sorted[lower] * (1 - mix) + sorted[upper] * mix;
}

export function resolveGroundRoi(imageWidth, imageHeight, roi = GROUND_ROI) {
  const width = Number(imageWidth);
  const height = Number(imageHeight);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Rendered image dimensions must be positive integers.");
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (!Number.isFinite(Number(roi?.[key]))) {
      throw new TypeError(`Ground ROI ${key} must be finite.`);
    }
  }
  const left = Math.floor(width * Number(roi.x));
  const top = Math.floor(height * Number(roi.y));
  const right = Math.ceil(width * (Number(roi.x) + Number(roi.width)));
  const bottom = Math.ceil(height * (Number(roi.y) + Number(roi.height)));
  if (left < 0 || top < 0 || right > width || bottom > height
      || right <= left || bottom <= top) {
    throw new RangeError(`Ground ROI lies outside ${width}x${height}: ${JSON.stringify(roi)}`);
  }
  return Object.freeze({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

function srgbLuma(data, offset) {
  return (0.2126 * data[offset] + 0.7152 * data[offset + 1]
    + 0.0722 * data[offset + 2]) / 255;
}

/** Score an already-cropped RGBA ground raster. */
export function analyzeGroundRgba({ width, height, data }) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Ground raster dimensions must be positive integers.");
  }
  if (!data || typeof data.length !== "number" || data.length !== width * height * 4) {
    throw new RangeError(`Ground RGBA data must contain ${width * height * 4} bytes.`);
  }

  const pixelCount = width * height;
  const luma = new Float64Array(pixelCount);
  let mean = 0;
  let sumSquares = 0;
  let opaquePixels = 0;
  let chromaSum = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const value = srgbLuma(data, offset);
    luma[pixel] = value;
    mean += value;
    sumSquares += value * value;
    if (data[offset + 3] === 255) opaquePixels += 1;
    const red = data[offset] / 255;
    const green = data[offset + 1] / 255;
    const blue = data[offset + 2] / 255;
    chromaSum += Math.sqrt(
      ((red - green) ** 2 + (green - blue) ** 2 + (blue - red) ** 2) / 3,
    );
  }
  mean /= pixelCount;
  const variance = Math.max(0, sumSquares / pixelCount - mean * mean);
  const sortedLuma = [...luma].sort((left, right) => left - right);
  const p05 = quantile(sortedLuma, 0.05);
  const p10 = quantile(sortedLuma, 0.10);
  const p90 = quantile(sortedLuma, 0.90);
  const p95 = quantile(sortedLuma, 0.95);

  // Broad block means prevent high-frequency dither, HUD specks, or a noisy blank plane from
  // impersonating a readable terrain material. Uneven block sizes retain every edge pixel.
  const blockMeans = [];
  for (let blockY = 0; blockY < BLOCK_ROWS; blockY += 1) {
    const top = Math.floor(height * blockY / BLOCK_ROWS);
    const bottom = Math.floor(height * (blockY + 1) / BLOCK_ROWS);
    for (let blockX = 0; blockX < BLOCK_COLUMNS; blockX += 1) {
      const left = Math.floor(width * blockX / BLOCK_COLUMNS);
      const right = Math.floor(width * (blockX + 1) / BLOCK_COLUMNS);
      let blockSum = 0;
      let blockPixels = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          blockSum += luma[y * width + x];
          blockPixels += 1;
        }
      }
      if (blockPixels > 0) blockMeans.push(blockSum / blockPixels);
    }
  }
  blockMeans.sort((left, right) => left - right);

  return Object.freeze({
    width,
    height,
    pixelCount,
    meanLuma: mean,
    lumaStandardDeviation: Math.sqrt(variance),
    lumaP05: p05,
    lumaP10: p10,
    lumaP90: p90,
    lumaP95: p95,
    robustLumaContrast: p90 - p10,
    extendedLumaContrast: p95 - p05,
    macroLumaContrast: quantile(blockMeans, 0.90) - quantile(blockMeans, 0.10),
    meanChroma: chromaSum / pixelCount,
    opaqueFraction: opaquePixels / pixelCount,
  });
}

export function evaluateGroundMetrics(metrics, thresholds = GROUND_THRESHOLDS) {
  const definitions = Object.freeze({
    lumaVariance: Object.freeze({
      actual: finite(metrics?.lumaStandardDeviation),
      expected: finite(thresholds.minimumLumaStandardDeviation),
      operator: ">=",
      pass: Number.isFinite(metrics?.lumaStandardDeviation)
        && metrics.lumaStandardDeviation >= thresholds.minimumLumaStandardDeviation,
    }),
    robustLumaContrast: Object.freeze({
      actual: finite(metrics?.robustLumaContrast),
      expected: finite(thresholds.minimumRobustLumaContrast),
      operator: ">=",
      pass: Number.isFinite(metrics?.robustLumaContrast)
        && metrics.robustLumaContrast >= thresholds.minimumRobustLumaContrast,
    }),
    macroLumaContrast: Object.freeze({
      actual: finite(metrics?.macroLumaContrast),
      expected: finite(thresholds.minimumMacroLumaContrast),
      operator: ">=",
      pass: Number.isFinite(metrics?.macroLumaContrast)
        && metrics.macroLumaContrast >= thresholds.minimumMacroLumaContrast,
    }),
    meanLumaFloor: Object.freeze({
      actual: finite(metrics?.meanLuma),
      expected: finite(thresholds.minimumMeanLuma),
      operator: ">=",
      pass: Number.isFinite(metrics?.meanLuma)
        && metrics.meanLuma >= thresholds.minimumMeanLuma,
    }),
    meanLumaCeiling: Object.freeze({
      actual: finite(metrics?.meanLuma),
      expected: finite(thresholds.maximumMeanLuma),
      operator: "<=",
      pass: Number.isFinite(metrics?.meanLuma)
        && metrics.meanLuma <= thresholds.maximumMeanLuma,
    }),
    opacity: Object.freeze({
      actual: finite(metrics?.opaqueFraction),
      expected: finite(thresholds.minimumOpaqueFraction),
      operator: ">=",
      pass: Number.isFinite(metrics?.opaqueFraction)
        && metrics.opaqueFraction >= thresholds.minimumOpaqueFraction,
    }),
  });
  const failed = Object.entries(definitions)
    .filter(([, check]) => check.pass !== true)
    .map(([name]) => name);
  return Object.freeze({ pass: failed.length === 0, failed: Object.freeze(failed), checks: definitions });
}

export function evaluateFirstMergeReadiness(snapshot) {
  const terrain = snapshot?.terrain;
  const texture = snapshot?.textureProbe;
  const resource = snapshot?.textureResource;
  const checks = Object.freeze({
    selectedBeat: snapshot?.lifecycle?.selectedBeat === FIRST_MERGE_BEAT,
    stagedBeat: snapshot?.lifecycle?.stagedBeat === FIRST_MERGE_BEAT,
    activeAndGatePaused: snapshot?.session?.phase === "PAUSED"
      && snapshot?.lifecycle?.reasons?.includes("session") === true
      && snapshot?.gatePause?.paused === true
      && Number.isFinite(snapshot?.gatePause?.activeTick),
    terrainIdentity: terrain?.terrainId === EXPECTED_TERRAIN_ID,
    sceneryEra: terrain?.sceneryEra === EXPECTED_SCENERY_ERA,
    localTerrainResident: Number(terrain?.localResidentChunks) > 0,
    terrainHealthy: Number(terrain?.errors) === 0 && terrain?.disposed !== true,
    textureRequested: texture?.requested === true,
    textureDecoded: texture?.decoded === true
      && Number(texture?.naturalWidth) > 0 && Number(texture?.naturalHeight) > 0,
    textureUploadedToWebGl: texture?.uploaded === true && Number(texture?.uploadCalls) > 0,
    textureResourceComplete: Number(resource?.responseEnd) > 0
      && Number(resource?.duration) >= 0,
  });
  const failed = Object.entries(checks)
    .filter(([, pass]) => pass !== true)
    .map(([name]) => name);
  return Object.freeze({ pass: failed.length === 0, failed: Object.freeze(failed), checks });
}

/**
 * Page-init instrumentation. It observes the production Image element and the renderer's native
 * texImage2D/texSubImage2D call; no game object or shader is modified.
 */
export function installUkraineV2TextureProbe(targetPath) {
  const probe = {
    targetPath,
    requested: false,
    decoded: false,
    uploaded: false,
    requestUrl: "",
    requestedAtMs: null,
    decodedAtMs: null,
    uploadedAtMs: null,
    naturalWidth: 0,
    naturalHeight: 0,
    uploadCalls: 0,
    uploadMethod: "",
    error: "",
  };
  Object.defineProperty(globalThis, "__firstMergeUkraineV2TextureProbe", {
    configurable: true,
    value: probe,
  });
  const trackedImages = new WeakSet();
  const isTargetUrl = (value) => typeof value === "string" && value.includes(targetPath);

  const imagePrototype = globalThis.HTMLImageElement?.prototype;
  const sourceDescriptor = imagePrototype
    ? Object.getOwnPropertyDescriptor(imagePrototype, "src") : null;
  if (sourceDescriptor?.get && sourceDescriptor?.set && sourceDescriptor.configurable !== false) {
    Object.defineProperty(imagePrototype, "src", {
      ...sourceDescriptor,
      get() { return sourceDescriptor.get.call(this); },
      set(value) {
        if (isTargetUrl(String(value))) {
          trackedImages.add(this);
          probe.requested = true;
          probe.requestUrl = String(value);
          probe.requestedAtMs = performance.now();
          this.addEventListener("load", () => {
            probe.decoded = true;
            probe.decodedAtMs = performance.now();
            probe.naturalWidth = Number(this.naturalWidth) || 0;
            probe.naturalHeight = Number(this.naturalHeight) || 0;
          }, { once: true });
          this.addEventListener("error", () => {
            probe.error = `Image decode failed: ${String(value)}`;
          }, { once: true });
        }
        return sourceDescriptor.set.call(this, value);
      },
    });
  } else {
    probe.error = "HTMLImageElement.src could not be instrumented";
  }

  const sourceMatches = (source) => {
    if (!source || (typeof source !== "object" && typeof source !== "function")) return false;
    if (trackedImages.has(source)) return true;
    try {
      return isTargetUrl(String(source.currentSrc || source.src || ""));
    } catch {
      return false;
    }
  };
  const recordUpload = (method, args) => {
    if (!args.some(sourceMatches)) return;
    probe.uploaded = true;
    probe.uploadedAtMs = performance.now();
    probe.uploadCalls += 1;
    probe.uploadMethod = method;
  };
  const prototypes = [
    globalThis.WebGLRenderingContext?.prototype,
    globalThis.WebGL2RenderingContext?.prototype,
  ].filter(Boolean);
  for (const prototype of prototypes) {
    for (const method of ["texImage2D", "texSubImage2D"]) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
      if (typeof descriptor?.value !== "function") continue;
      const original = descriptor.value;
      Object.defineProperty(prototype, method, {
        ...descriptor,
        value(...args) {
          recordUpload(method, args);
          return original.apply(this, args);
        },
      });
    }
  }
}

function browserSnapshot(targetPath) {
  const terrain = globalThis.__gunsAssets?.diagnostics?.()?.terrain ?? null;
  const textureProbe = globalThis.__firstMergeUkraineV2TextureProbe
    ? { ...globalThis.__firstMergeUkraineV2TextureProbe } : null;
  const resources = performance.getEntriesByType("resource")
    .filter((entry) => entry.name.includes(targetPath));
  const textureResource = resources.length > 0
    ? resources.map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    })).at(-1)
    : null;
  const canvas = document.querySelector("#scene");
  const rect = canvas?.getBoundingClientRect();
  return {
    lifecycle: globalThis.__gunsLifecycle ? {
      selectedBeat: globalThis.__gunsLifecycle.selectedBeat,
      stagedBeat: globalThis.__gunsLifecycle.stagedBeat,
      reasons: globalThis.__gunsLifecycle.reasons,
    } : null,
    session: globalThis.__gunsState ? {
      phase: globalThis.__gunsState.session_phase,
      tick: globalThis.__gunsState.tick,
      terrainProfileId: globalThis.__gunsState.terrain_profile_id,
      terrainSceneryProfile: globalThis.__gunsState.terrain_scenery_profile,
      playerPosition: [
        globalThis.__gunsState.player_x,
        globalThis.__gunsState.player_y,
        globalThis.__gunsState.player_z,
      ],
      playerHeadingRad: globalThis.__gunsState.player_chi,
      playerGammaRad: globalThis.__gunsState.player_gamma,
    } : null,
    gatePause: globalThis.__firstMergePixelGatePause
      ? { ...globalThis.__firstMergePixelGatePause } : null,
    terrain,
    textureProbe,
    textureResource,
    fatal: {
      visible: document.querySelector("#fatal")?.classList.contains("visible") === true,
      message: document.querySelector("#fatal-message")?.textContent ?? "",
    },
    canvas: canvas && rect ? {
      x: rect.x,
      y: rect.y,
      cssWidth: rect.width,
      cssHeight: rect.height,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
    } : null,
  };
}

function armFirstActiveFramePause() {
  const state = { armed: true, paused: false, activeTick: null, pausedAtMs: null };
  Object.defineProperty(globalThis, "__firstMergePixelGatePause", {
    configurable: true,
    value: state,
  });
  const observe = () => {
    if (!state.armed || state.paused) return;
    if (globalThis.__gunsState?.session_phase === "ACTIVE") {
      state.activeTick = globalThis.__gunsState.tick;
      document.querySelector("#pause-button")?.click();
      state.paused = globalThis.__gunsLifecycle?.reasons?.includes("session") === true;
      state.pausedAtMs = performance.now();
      if (state.paused) return;
    }
    requestAnimationFrame(observe);
  };
  requestAnimationFrame(observe);
}

async function cropPngInBrowser(page, pngBuffer, roi) {
  const dataUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;
  return page.evaluate(async ({ imageUrl, crop }) => {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > image.naturalWidth
        || crop.y + crop.height > image.naturalHeight) {
      throw new RangeError(`Crop outside ${image.naturalWidth}x${image.naturalHeight}`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D diagnostic canvas unavailable");
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height,
      0, 0, crop.width, crop.height);
    const pixels = context.getImageData(0, 0, crop.width, crop.height);
    return {
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      width: crop.width,
      height: crop.height,
      rgba: Array.from(pixels.data),
      pngBase64: canvas.toDataURL("image/png").split(",", 2)[1],
    };
  }, { imageUrl: dataUrl, crop: roi });
}

async function sha256File(path) {
  const bytes = await readFile(path);
  return Object.freeze({
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

async function localCandidateSite(wwwroot) {
  try {
    const site = await serveStatic(wwwroot);
    return { ...site, transport: "loopback", install: async () => {} };
  } catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error;
    // Some managed CI shells deny loopback listeners. Route interception preserves browser HTTP
    // URLs and the terrain bundle's Range contract, so the rendered frame remains production code.
    const origin = "http://first-merge-gate.invalid";
    const routeDiagnostics = {
      requests: 0,
      rangeRequests: 0,
      bytesRead: 0,
      listenerError: `${error.code}: ${error.message}`,
    };
    return {
      url: `${origin}/`,
      transport: "playwright-route",
      close: async () => {},
      diagnostics: () => Object.freeze({ ...routeDiagnostics }),
      async install(page) {
        await page.route(`${origin}/**`, async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          let pathname = decodeURIComponent(url.pathname);
          if (pathname.endsWith("/")) pathname += "index.html";
          const filePath = normalize(join(wwwroot, pathname));
          if (filePath !== wwwroot && !filePath.startsWith(`${wwwroot}/`)) {
            await route.fulfill({ status: 403, body: "forbidden" });
            return;
          }
          const info = await stat(filePath).catch(() => null);
          if (!info?.isFile()) {
            await route.fulfill({ status: 404, body: "not found" });
            return;
          }
          routeDiagnostics.requests += 1;
          const headers = {
            "content-type": ROUTE_MIME[extname(filePath).toLowerCase()]
              ?? "application/octet-stream",
            "cache-control": "no-store",
          };
          const range = request.headers().range?.match(/^bytes=(\d+)-(\d+)$/);
          if (range) {
            const start = Number(range[1]);
            const end = Number(range[2]);
            if (start > end || start < 0 || end >= info.size) {
              await route.fulfill({
                status: 416,
                headers: { ...headers, "content-range": `bytes */${info.size}` },
                body: "",
              });
              return;
            }
            const length = end - start + 1;
            const body = Buffer.allocUnsafe(length);
            const handle = await open(filePath, "r");
            try {
              let offset = 0;
              while (offset < length) {
                const { bytesRead } = await handle.read(
                  body, offset, length - offset, start + offset,
                );
                if (bytesRead === 0) throw new Error(`Unexpected EOF reading ${filePath}`);
                offset += bytesRead;
              }
            } finally {
              await handle.close();
            }
            routeDiagnostics.rangeRequests += 1;
            routeDiagnostics.bytesRead += body.length;
            await route.fulfill({
              status: 206,
              headers: {
                ...headers,
                "accept-ranges": "bytes",
                "content-range": `bytes ${start}-${end}/${info.size}`,
                "content-length": String(body.length),
              },
              body,
            });
            return;
          }
          const body = await readFile(filePath);
          routeDiagnostics.bytesRead += body.length;
          await route.fulfill({ status: 200, headers, body });
        });
      },
    };
  }
}

function configuredTimeoutMs() {
  const requested = Number(process.env.FIRST_MERGE_GATE_TIMEOUT_MS);
  return Number.isFinite(requested) && requested >= 10_000
    ? Math.round(requested) : DEFAULT_TIMEOUT_MS;
}

function requiredWwwroot() {
  const requested = process.env.FIRST_MERGE_GATE_WWWROOT || process.env.SMOKE_WWWROOT;
  if (!requested) {
    throw new Error(
      "FIRST_MERGE_GATE_WWWROOT must name the published candidate wwwroot; "
      + "the gate refuses to guess a possibly stale preview.",
    );
  }
  return resolve(requested);
}

async function bestEffortFailureCapture(page, outputDirectory, report) {
  if (!page || page.isClosed()) return;
  report.browserSnapshot = await page.evaluate(browserSnapshot, UKRAINE_V2_TEXTURE_PATH)
    .catch(() => report.browserSnapshot ?? null);
  const pagePath = join(outputDirectory, "first-merge-failure-page.png");
  await page.screenshot({ path: pagePath, type: "png", fullPage: false, timeout: 15_000 })
    .then(() => { report.artifacts.failurePage = pagePath; })
    .catch(() => undefined);
}

export async function runFirstMergePixelGate() {
  const wwwroot = requiredWwwroot();
  const outputDirectory = resolve(process.env.FIRST_MERGE_GATE_OUT_DIR
    ?? "/private/tmp/guns-only-first-merge-pixel-gate");
  const timeoutMs = configuredTimeoutMs();
  await mkdir(outputDirectory, { recursive: true });
  const diagnosticsPath = join(outputDirectory, "diagnostics.json");
  const scenePath = join(outputDirectory, "first-merge-scene.png");
  const roiPath = join(outputDirectory, "first-merge-ground-roi.png");
  const expectedTexturePath = join(REPO_DIR, UKRAINE_V2_TEXTURE_PATH.replace(/^\//, ""));
  const candidateTexturePath = join(wwwroot, UKRAINE_V2_TEXTURE_PATH);
  const report = {
    schema: "guns-only.first-merge-rendered-pixel-gate.v1",
    generatedAt: new Date().toISOString(),
    result: "running",
    launch: {
      beat: FIRST_MERGE_BEAT,
      program: "first-merge",
      audioQa: "silent",
      server: "off",
      viewport: CAPTURE_VIEWPORT,
      timeoutMs,
      wwwroot,
    },
    scope: {
      assertion: "published-candidate-asset-readiness-and-minimum-rendered-signal",
      approximateMergeAglM: MERGE_INTEGRITY_APPROXIMATE_AGL_M,
      aestheticAcceptance: false,
      lowAltitudeAcceptance: false,
      separateAestheticPlateAglM: LOW_ALTITUDE_AESTHETIC_PLATE_AGL_M,
    },
    artifacts: { diagnostics: diagnosticsPath },
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
  };
  let site = null;
  let browser = null;
  let page = null;
  let gateError = null;

  try {
    const framework = await stat(join(wwwroot, "_framework")).catch(() => null);
    if (!framework?.isDirectory()) {
      throw new Error(`${wwwroot} is not a published candidate (missing _framework).`);
    }
    const [expectedTexture, candidateTexture] = await Promise.all([
      sha256File(expectedTexturePath),
      sha256File(candidateTexturePath),
    ]);
    report.textureCandidate = {
      sourcePath: expectedTexturePath,
      candidatePath: candidateTexturePath,
      source: expectedTexture,
      candidate: candidateTexture,
      matchesSource: expectedTexture.sha256 === candidateTexture.sha256,
    };
    if (!report.textureCandidate.matchesSource) {
      throw new Error("Published candidate does not contain the current Ukraine v2 texture.");
    }

    site = await localCandidateSite(wwwroot);
    report.launch.transport = site.transport;
    const require = createRequire(PLAYWRIGHT_PACKAGE);
    const { chromium } = require("playwright");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    page = await browser.newPage({
      viewport: CAPTURE_VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-US",
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    await site.install(page);
    await page.addInitScript(installUkraineV2TextureProbe, UKRAINE_V2_TEXTURE_PATH);
    page.on("pageerror", (error) => report.pageErrors.push(error.message ?? String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") report.consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => report.requestFailures.push({
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText ?? "failed",
    }));

    const launchUrl = new URL(site.url);
    launchUrl.searchParams.set("program", "first-merge");
    launchUrl.searchParams.set("server", "off");
    launchUrl.searchParams.set("audioQa", "silent");
    report.launch.url = launchUrl.href;
    await page.goto(launchUrl.href, { waitUntil: "load", timeout: timeoutMs });
    await page.waitForFunction(
      (beat) => document.querySelector("#boot")?.classList.contains("ready") === true
        && globalThis.__gunsLifecycle?.selectedBeat === beat
        && globalThis.__gunsLifecycle?.stagedBeat === beat
        && globalThis.__gunsState?.session_phase === "READY",
      FIRST_MERGE_BEAT,
      { timeout: timeoutMs, polling: "raf" },
    );
    await page.evaluate(armFirstActiveFramePause);
    await page.locator("#ready-start").click({ timeout: 30_000 });
    await page.waitForFunction(
      () => globalThis.__gunsState?.session_phase === "PAUSED"
        && globalThis.__gunsLifecycle?.reasons?.includes("session") === true
        && globalThis.__firstMergePixelGatePause?.paused === true,
      undefined,
      { timeout: timeoutMs, polling: "raf" },
    );
    await page.waitForFunction(
      (targetPath) => {
        const terrain = globalThis.__gunsAssets?.diagnostics?.()?.terrain ?? null;
        const texture = globalThis.__firstMergeUkraineV2TextureProbe ?? null;
        const textureResource = performance.getEntriesByType("resource")
          .filter((entry) => entry.name.includes(targetPath)).at(-1) ?? null;
        return terrain?.terrainId === "terrain.ukraine.rapier-range.atlas.v1"
          && terrain?.sceneryEra === "ukraine-modern"
          && Number(terrain?.localResidentChunks) > 0
          && Number(terrain?.errors) === 0
          && texture?.decoded === true
          && texture?.uploaded === true
          && Number(texture?.uploadCalls) > 0
          && Number(textureResource?.responseEnd) > 0;
      },
      UKRAINE_V2_TEXTURE_PATH,
      { timeout: timeoutMs, polling: "raf" },
    );
    // Pausing the authority intentionally opens the normal Resume menu over the canvas. Remove
    // only that DOM chrome for this diagnostic capture; the simulation remains authoritatively
    // PAUSED and the renderer continues producing dt=0 frames underneath it.
    const hiddenChrome = await page.evaluate(() => {
      const scene = document.querySelector("#scene");
      const hidden = [];
      for (const element of document.body.children) {
        if (element === scene || element.tagName === "SCRIPT") continue;
        element.style.setProperty("visibility", "hidden", "important");
        hidden.push(element.id ? `#${element.id}` : element.tagName.toLowerCase());
      }
      return hidden;
    });
    // Renderer frames continue while the simulation clock is held. Two frames settle the backing
    // store after the texture upload without advancing the mission or camera.
    await page.evaluate(() => new Promise((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
    }));

    report.browserSnapshot = await page.evaluate(browserSnapshot, UKRAINE_V2_TEXTURE_PATH);
    report.readiness = evaluateFirstMergeReadiness(report.browserSnapshot);
    if (!report.readiness.pass) {
      throw new Error(`First Merge readiness failed: ${report.readiness.failed.join(", ")}`);
    }
    if (report.browserSnapshot.fatal?.visible || report.pageErrors.length > 0) {
      throw new Error(`First Merge page failed: ${JSON.stringify({
        fatal: report.browserSnapshot.fatal,
        pageErrors: report.pageErrors,
      })}`);
    }

    const canvas = page.locator("#scene");
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox || canvasBox.x !== 0 || canvasBox.y !== 0
        || canvasBox.width !== CAPTURE_VIEWPORT.width
        || canvasBox.height !== CAPTURE_VIEWPORT.height) {
      throw new Error(`Scene canvas is not exact ${CAPTURE_VIEWPORT.width}x${CAPTURE_VIEWPORT.height}: `
        + JSON.stringify(canvasBox));
    }
    const scenePng = await canvas.screenshot({
      path: scenePath,
      type: "png",
      animations: "disabled",
      scale: "css",
      timeout: 30_000,
    });
    report.artifacts.scene = scenePath;
    const roi = resolveGroundRoi(CAPTURE_VIEWPORT.width, CAPTURE_VIEWPORT.height);
    const crop = await cropPngInBrowser(page, scenePng, roi);
    if (crop.imageWidth !== CAPTURE_VIEWPORT.width
        || crop.imageHeight !== CAPTURE_VIEWPORT.height) {
      throw new Error(`Scene PNG is ${crop.imageWidth}x${crop.imageHeight}, expected `
        + `${CAPTURE_VIEWPORT.width}x${CAPTURE_VIEWPORT.height}.`);
    }
    await writeFile(roiPath, Buffer.from(crop.pngBase64, "base64"));
    report.artifacts.groundRoi = roiPath;
    report.capture = {
      viewport: CAPTURE_VIEWPORT,
      normalizedGroundRoi: GROUND_ROI,
      groundRoi: roi,
      pauseProbe: await page.evaluate(() => ({ ...globalThis.__firstMergePixelGatePause })),
      hiddenChrome,
    };
    report.metrics = analyzeGroundRgba({
      width: crop.width,
      height: crop.height,
      data: crop.rgba,
    });
    report.thresholds = GROUND_THRESHOLDS;
    report.pixelIntegrity = evaluateGroundMetrics(report.metrics);
    if (!report.pixelIntegrity.pass) {
      throw new Error(`Ground rendered-pixel integrity failed: `
        + report.pixelIntegrity.failed.join(", "));
    }
    report.result = "pass";
  } catch (error) {
    gateError = error;
    report.result = "fail";
    report.error = {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      stack: error?.stack ?? "",
    };
    await bestEffortFailureCapture(page, outputDirectory, report);
  } finally {
    report.staticServer = site?.diagnostics?.() ?? null;
    await writeFile(diagnosticsPath, `${JSON.stringify(report, null, 2)}\n`);
    await browser?.close().catch(() => undefined);
    await site?.close().catch(() => undefined);
  }

  if (gateError) {
    throw new Error(`${gateError.message}\nDiagnostics: ${diagnosticsPath}`, { cause: gateError });
  }
  return Object.freeze(report);
}

async function main() {
  const report = await runFirstMergePixelGate();
  console.log(`ok  First Merge terrain: sigma ${report.metrics.lumaStandardDeviation.toFixed(4)}; `
    + `p90-p10 ${report.metrics.robustLumaContrast.toFixed(4)}; `
    + `macro ${report.metrics.macroLumaContrast.toFixed(4)}`);
  console.log(`artifacts  ${report.artifacts.diagnostics}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
