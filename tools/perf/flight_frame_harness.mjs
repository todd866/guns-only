#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";

const requireFromSmoke = createRequire(
  new URL("../../web/smoke/package.json", import.meta.url),
);
const { chromium } = requireFromSmoke("playwright");

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WWWROOT = resolve(
  SCRIPT_DIRECTORY,
  "../../web/bin/Release/net8.0/publish/wwwroot",
);
const LONG_FRAME_MS = 33;
const DEFAULT_LEG_DURATION_MS = 60_000;
const DEFAULT_MAX_FRAME_MS = 100;
const DEFAULT_MAX_LONG_FRAME_PERCENT = 1;
const DEFAULT_MIN_FRAMES = 600;
const DEFAULT_HIGH_AGL_FT = 9_000;
const DEFAULT_LOW_AGL_FT = 2_000;
const FIXED_BEAT = 7;
const FIXED_SEED = 7;
const ROUTE_MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
});

const ENVIRONMENT = Object.freeze({
  wwwroot: "GUNS_FLIGHT_WWWROOT",
  legDurationMs: "GUNS_FLIGHT_LEG_DURATION_MS",
  maxFrameMs: "GUNS_FLIGHT_MAX_FRAME_MS",
  maxLongFramePercent: "GUNS_FLIGHT_MAX_LONG_FRAME_PCT",
  minFrames: "GUNS_FLIGHT_MIN_FRAMES",
});

function usage() {
  return [
    "Usage: node tools/perf/flight_frame_harness.mjs [options]",
    "",
    `  --wwwroot PATH              Published wwwroot (default: ${DEFAULT_WWWROOT})`,
    "  --leg-duration-ms N         Duration of EACH measured leg; minimum 60000",
    `                              (default: ${DEFAULT_LEG_DURATION_MS})`,
    `  --max-frame-ms N            MAX gate for each leg (default: ${DEFAULT_MAX_FRAME_MS})`,
    "  --max-long-frame-pct N      >33 ms percentage gate for each leg",
    `                              (default: ${DEFAULT_MAX_LONG_FRAME_PERCENT})`,
    `  --min-frames N              Minimum RAF deltas required per leg (default: ${DEFAULT_MIN_FRAMES})`,
    "  -h, --help                  Show this help",
    "",
    "Environment equivalents:",
    `  ${ENVIRONMENT.wwwroot}`,
    `  ${ENVIRONMENT.legDurationMs}`,
    `  ${ENVIRONMENT.maxFrameMs}`,
    `  ${ENVIRONMENT.maxLongFramePercent}`,
    `  ${ENVIRONMENT.minFrames}`,
    "",
    "The profile is intentionally fixed at beat 7 / seed 7, 9,000 ft AGL control,",
    "then 2,000 ft AGL low level. Profile targets are not CLI-tunable.",
  ].join("\n");
}

function finiteNumber(value, label, { minimum = -Infinity, inclusive = true } = {}) {
  const parsed = Number(value);
  const validMinimum = inclusive ? parsed >= minimum : parsed > minimum;
  if (!Number.isFinite(parsed) || !validMinimum) {
    const comparison = inclusive ? "at least" : "greater than";
    throw new Error(`${label} must be ${comparison} ${minimum}.`);
  }
  return parsed;
}

function environmentNumber(name, fallback) {
  return process.env[name] === undefined ? fallback : process.env[name];
}

function parseArguments(argv) {
  const options = {
    wwwroot: resolve(process.env[ENVIRONMENT.wwwroot] ?? DEFAULT_WWWROOT),
    legDurationMs: finiteNumber(
      environmentNumber(ENVIRONMENT.legDurationMs, DEFAULT_LEG_DURATION_MS),
      ENVIRONMENT.legDurationMs,
      { minimum: DEFAULT_LEG_DURATION_MS },
    ),
    maxFrameMs: finiteNumber(
      environmentNumber(ENVIRONMENT.maxFrameMs, DEFAULT_MAX_FRAME_MS),
      ENVIRONMENT.maxFrameMs,
      { minimum: 0, inclusive: false },
    ),
    maxLongFramePercent: finiteNumber(
      environmentNumber(
        ENVIRONMENT.maxLongFramePercent,
        DEFAULT_MAX_LONG_FRAME_PERCENT,
      ),
      ENVIRONMENT.maxLongFramePercent,
      { minimum: 0 },
    ),
    minFrames: finiteNumber(
      environmentNumber(ENVIRONMENT.minFrames, DEFAULT_MIN_FRAMES),
      ENVIRONMENT.minFrames,
      { minimum: 1 },
    ),
  };

  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === "--help" || option === "-h") {
      console.log(usage());
      process.exit(0);
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`Missing value for ${option}.\n${usage()}`);
    if (option === "--wwwroot") options.wwwroot = resolve(value);
    else if (option === "--leg-duration-ms") {
      options.legDurationMs = finiteNumber(value, option, {
        minimum: DEFAULT_LEG_DURATION_MS,
      });
    } else if (option === "--max-frame-ms") {
      options.maxFrameMs = finiteNumber(value, option, {
        minimum: 0,
        inclusive: false,
      });
    } else if (option === "--max-long-frame-pct") {
      options.maxLongFramePercent = finiteNumber(value, option, { minimum: 0 });
    } else if (option === "--min-frames") {
      options.minFrames = finiteNumber(value, option, { minimum: 1 });
    } else {
      throw new Error(`Unknown option: ${option}\n${usage()}`);
    }
  }

  if (!Number.isSafeInteger(options.legDurationMs)) {
    throw new Error("--leg-duration-ms must be an integer.");
  }
  if (!Number.isSafeInteger(options.minFrames)) {
    throw new Error("--min-frames must be an integer.");
  }
  return options;
}

function isSoftwareRenderer(renderer) {
  return /swiftshader|software|llvmpipe|lavapipe/i.test(renderer);
}

async function queryRenderer(page, canvasSelector = null) {
  return page.evaluate((selector) => {
    const canvas = selector
      ? document.querySelector(selector)
      : document.createElement("canvas");
    if (!canvas) throw new Error(`WebGL canvas not found: ${selector}`);
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) throw new Error("Chromium did not provide a WebGL context.");
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    if (!extension) {
      throw new Error(
        "WEBGL_debug_renderer_info is unavailable; cannot report UNMASKED_RENDERER_WEBGL.",
      );
    }
    return String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL));
  }, canvasSelector);
}

async function launchCandidate({ name, args, requireHardware, headless = false }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless,
      args,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto("data:text/html,<title>WebGL renderer probe</title><canvas></canvas>");
    await page.bringToFront();
    await page.locator("canvas").focus();
    const renderer = await queryRenderer(page);
    const visibility = await page.evaluate(() => ({
      state: document.visibilityState,
      focused: document.hasFocus(),
    }));
    if (visibility.state !== "visible" || !visibility.focused) {
      throw new Error(
        `probe page is not foregrounded (${visibility.state}, focused=${visibility.focused})`,
      );
    }
    if (requireHardware && isSoftwareRenderer(renderer)) {
      throw new Error(`renderer is software: ${renderer}`);
    }
    return { browser, context, page, launchName: name, probeRenderer: renderer };
  } catch (error) {
    await browser?.close().catch(() => {});
    const rawMessage = error?.message ?? String(error);
    const detail = /Crashpad[\s\S]*Operation not permitted/i.test(rawMessage)
      ? "Chromium exited because macOS denied its Crashpad service/files"
      : rawMessage.split("\n")[0];
    throw new Error(`${name}: ${detail}`);
  }
}

async function launchGpuFirst() {
  const gpuArgs = process.platform === "darwin" ? ["--use-angle=metal"] : [];
  try {
    return await launchCandidate({
      name: process.platform === "darwin"
        ? "headed Chromium / ANGLE Metal"
        : "headed Chromium / platform GPU",
      args: gpuArgs,
      requireHardware: true,
    });
  } catch (gpuError) {
    console.warn(`Real-GPU launch failed: ${gpuError.message}`);
    console.warn("Falling back to headed Chromium / ANGLE SwiftShader.");
    try {
      return await launchCandidate({
        name: "headed Chromium / ANGLE SwiftShader fallback",
        args: [
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
        requireHardware: false,
      });
    } catch (headedSoftwareError) {
      console.warn(`Headed SwiftShader launch failed: ${headedSoftwareError.message}`);
      console.warn(
        "Falling back to headless Chromium / ANGLE SwiftShader; "
        + "DOM visibility, focus, and RAF-count assertions remain mandatory.",
      );
      return launchCandidate({
        name: "headless Chromium / ANGLE SwiftShader fallback",
        args: [
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
        requireHardware: false,
        headless: true,
      });
    }
  }
}

async function assertPublishedApp(wwwroot) {
  const required = [
    wwwroot,
    resolve(wwwroot, "index.html"),
    resolve(wwwroot, "app.js"),
    resolve(wwwroot, "_framework/blazor.boot.json"),
  ];
  for (const path of required) {
    const info = await stat(path).catch(() => null);
    if (!info || (path === wwwroot ? !info.isDirectory() : !info.isFile())) {
      throw new Error(
        `Published app is incomplete at ${wwwroot}; missing ${path}. `
        + "Run: dotnet publish web/GunsOnly.Web.csproj -c Release",
      );
    }
  }
}

async function staticSite(wwwroot) {
  try {
    const site = await serveStatic(wwwroot);
    return { ...site, transport: "loopback static server", install: async () => {} };
  } catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error;
    // Some managed test sandboxes deny loopback listeners. Keep the real server as the normal
    // path, but preserve HTTP module/fetch/Range behavior through Playwright routing when the
    // environment itself forbids listen(2). This is the same fallback used by terrain-look.
    const origin = "http://flight-frame-harness.invalid";
    const root = normalize(wwwroot);
    return {
      url: `${origin}/`,
      transport: "Playwright HTTP route fallback (loopback listen denied)",
      close: async () => {},
      async install(page) {
        await page.route(`${origin}/**`, async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          let pathname = decodeURIComponent(url.pathname);
          if (pathname.endsWith("/")) pathname += "index.html";
          const filePath = normalize(join(root, pathname));
          if (filePath !== root && !filePath.startsWith(`${root}/`)) {
            await route.fulfill({ status: 403, body: "forbidden" });
            return;
          }
          const body = await readFile(filePath).catch(() => null);
          if (!body) {
            await route.fulfill({ status: 404, body: "not found" });
            return;
          }
          const headers = {
            "cache-control": "no-store",
            "content-type": ROUTE_MIME[extname(filePath).toLowerCase()]
              ?? "application/octet-stream",
          };
          const range = request.headers().range?.match(/^bytes=(\d+)-(\d+)$/);
          if (range) {
            const start = Number(range[1]);
            const end = Number(range[2]);
            if (start > end || start < 0 || end >= body.length) {
              await route.fulfill({
                status: 416,
                headers: { ...headers, "content-range": `bytes */${body.length}` },
                body: "range not satisfiable",
              });
              return;
            }
            const slice = body.subarray(start, end + 1);
            await route.fulfill({
              status: 206,
              headers: {
                ...headers,
                "accept-ranges": "bytes",
                "content-length": String(slice.length),
                "content-range": `bytes ${start}-${end}/${body.length}`,
              },
              body: slice,
            });
            return;
          }
          await route.fulfill({ status: 200, headers, body });
        });
      },
    };
  }
}

function percentile(sorted, fraction) {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function summarize(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Cannot summarize an empty sample.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.50),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1),
  };
}

function summarizeLeg(raw) {
  const timing = summarize(raw.deltas);
  const agl = summarize(raw.radarAltitudesFt);
  const speed = summarize(raw.trueAirspeedsKts);
  const longFrames = raw.deltas.filter((delta) => delta > LONG_FRAME_MS).length;
  const distanceM = Math.hypot(
    raw.after.x - raw.before.x,
    raw.after.z - raw.before.z,
  );
  return {
    name: raw.name,
    frames: raw.deltas.length,
    sampledMs: raw.deltas.reduce((sum, delta) => sum + delta, 0),
    p50Ms: timing.p50,
    p95Ms: timing.p95,
    p99Ms: timing.p99,
    maxMs: timing.max,
    longFrames,
    longFramePercent: longFrames / raw.deltas.length * 100,
    radarAltitudeFt: agl,
    trueAirspeedKts: speed,
    distanceM,
    before: raw.before,
    after: raw.after,
    terrainBefore: raw.terrainBefore,
    terrainAfter: raw.terrainAfter,
  };
}

function terrainTransferRequests(terrain) {
  return Number(terrain?.networkRequests ?? terrain?.transfer?.networkRequests ?? 0);
}

function formatLeg(leg) {
  const terrainRequests = terrainTransferRequests(leg.terrainAfter)
    - terrainTransferRequests(leg.terrainBefore);
  return [
    `${leg.name}: frames=${leg.frames} p50=${leg.p50Ms.toFixed(2)} ms `
      + `p95=${leg.p95Ms.toFixed(2)} ms p99=${leg.p99Ms.toFixed(2)} ms `
      + `MAX=${leg.maxMs.toFixed(2)} ms long(>33ms)=${leg.longFrames} `
      + `(${leg.longFramePercent.toFixed(3)}%)`,
    `  flight: median AGL=${leg.radarAltitudeFt.p50.toFixed(0)} ft `
      + `median TAS=${leg.trueAirspeedKts.p50.toFixed(0)} kt `
      + `distance=${(leg.distanceM / 1000).toFixed(1)} km`,
    `  terrain: requests=${terrainRequests >= 0 ? "+" : ""}${terrainRequests} `
      + `residentChunks=${leg.terrainBefore?.residentChunks ?? "?"}`
      + `->${leg.terrainAfter?.residentChunks ?? "?"}`,
  ].join("\n");
}

function profileValidation(legs, options) {
  const failures = [];
  const [high, low] = legs;
  for (const leg of legs) {
    if (leg.frames < options.minFrames) {
      failures.push(
        `${leg.name} captured ${leg.frames} frames; minimum is ${options.minFrames}`,
      );
    }
    if (leg.distanceM < 10_000) {
      failures.push(
        `${leg.name} crossed only ${(leg.distanceM / 1000).toFixed(1)} km; `
        + "the terrain-streaming leg requires at least 10 km",
      );
    }
    if (leg.trueAirspeedKts.p50 < 450) {
      failures.push(
        `${leg.name} median TAS was ${leg.trueAirspeedKts.p50.toFixed(0)} kt; `
        + "the high-speed profile requires at least 450 kt",
      );
    }
  }
  if (high.radarAltitudeFt.p50 < 8_000 || high.radarAltitudeFt.p50 > 10_000) {
    failures.push(
      `high-altitude control median AGL was ${high.radarAltitudeFt.p50.toFixed(0)} ft`,
    );
  }
  if (low.radarAltitudeFt.p50 < 1_500 || low.radarAltitudeFt.p50 > 2_500) {
    failures.push(
      `low-level terrain median AGL was ${low.radarAltitudeFt.p50.toFixed(0)} ft`,
    );
  }
  if (high.radarAltitudeFt.p50 - low.radarAltitudeFt.p50 < 5_000) {
    failures.push("high and low legs were not separated by at least 5,000 ft AGL");
  }
  if (terrainTransferRequests(low.terrainAfter)
    <= terrainTransferRequests(low.terrainBefore)) {
    failures.push("low-level leg did not issue any new terrain range requests");
  }
  return failures;
}

function gateFailures(legs, options) {
  const failures = [];
  for (const leg of legs) {
    if (leg.maxMs > options.maxFrameMs) {
      failures.push(
        `${leg.name} MAX ${leg.maxMs.toFixed(2)} ms > ${options.maxFrameMs.toFixed(2)} ms`,
      );
    }
    if (leg.longFramePercent > options.maxLongFramePercent) {
      failures.push(
        `${leg.name} long-frame percentage ${leg.longFramePercent.toFixed(3)}% `
        + `> ${options.maxLongFramePercent.toFixed(3)}%`,
      );
    }
  }
  return failures;
}

async function bootPublishedApp(page, siteUrl) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
  await page.goto(siteUrl, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(
    () => document.querySelector("#boot")?.classList.contains("ready") === true,
    undefined,
    { timeout: 90_000 },
  );
  const fatal = await page.evaluate(() => ({
    visible: document.querySelector("#fatal")?.classList.contains("visible") === true,
    message: document.querySelector("#fatal-message")?.textContent ?? "",
  }));
  if (fatal.visible) throw new Error(`FLIGHT KERNEL OFFLINE: ${fatal.message.slice(0, 1000)}`);

  await page.waitForFunction(
    () => globalThis.__gunsBridge && globalThis.__gunsLifecycle && globalThis.__gunsState,
    undefined,
    { timeout: 45_000 },
  );
  await page.evaluate(() => {
    if (globalThis.__gunsState?.session_phase !== "ACTIVE") {
      const started = globalThis.__gunsLifecycle.begin();
      if (started !== true) throw new Error("__gunsLifecycle.begin() rejected the flight.");
    }
  });
  await page.waitForFunction(
    () => globalThis.__gunsState?.session_phase === "ACTIVE"
      && globalThis.__gunsState?.player_terminal_state === "FLYING",
    undefined,
    { timeout: 45_000 },
  );
  await page.waitForFunction(
    () => {
      const terrain = globalThis.__gunsAssets?.snapshot?.terrain;
      return terrain?.residentChunks > 0 && terrain?.errors === 0;
    },
    undefined,
    { timeout: 120_000 },
  );
  await page.bringToFront();
  await page.locator("#scene").focus();
  const foreground = await page.evaluate(() => ({
    visibility: document.visibilityState,
    focused: document.hasFocus(),
  }));
  if (foreground.visibility !== "visible" || !foreground.focused) {
    throw new Error(
      `Flight page is not foregrounded (${foreground.visibility}, `
      + `focused=${foreground.focused}). No frame sample was accepted.`,
    );
  }
  if (pageErrors.length > 0) {
    throw new Error(`Uncaught page errors:\n${pageErrors.join("\n")}`);
  }
  return pageErrors;
}

async function flyProfile(page, options) {
  return page.evaluate(async (config) => {
    const bridge = globalThis.__gunsBridge;
    const PULL_UP = 0;
    const PUSH_DOWN = 1;
    let activePitchKey = null;
    let lastCommandChangeSimS = Number(globalThis.__gunsState?.t) || 0;
    let hiddenReason = null;
    let watchdog;

    const snapshotTerrain = () => {
      const terrain = globalThis.__gunsAssets?.snapshot?.terrain;
      return terrain ? JSON.parse(JSON.stringify(terrain)) : null;
    };
    const snapshotState = () => {
      const state = globalThis.__gunsState;
      return {
        t: Number(state?.t),
        x: Number(state?.px),
        y: Number(state?.py),
        z: Number(state?.pz),
        radarAltitudeFt: Number(state?.radar_alt_ft),
        trueAirspeedKts: Number(state?.true_airspeed_kts),
        verticalSpeedFpm: Number(state?.vertical_speed_fpm),
        terminal: state?.player_terminal_state ?? null,
      };
    };
    const foregroundFailure = () => {
      if (document.visibilityState !== "visible") {
        return `document.visibilityState=${document.visibilityState}`;
      }
      if (!document.hasFocus()) return "document.hasFocus()=false";
      return hiddenReason;
    };
    const assertFlight = () => {
      const foreground = foregroundFailure();
      if (foreground) {
        throw new Error(
          `Foreground invariant failed (${foreground}); hidden/background RAF is invalid.`,
        );
      }
      const state = globalThis.__gunsState;
      if (state?.session_phase !== "ACTIVE"
        || state?.player_terminal_state !== "FLYING") {
        throw new Error(
          `Flight ended during profile: phase=${state?.session_phase ?? "?"} `
          + `terminal=${state?.player_terminal_state ?? "?"}`,
        );
      }
    };
    const setPitchKey = (next) => {
      const simS = Number(globalThis.__gunsState?.t) || 0;
      if (next === activePitchKey) return;
      if (activePitchKey !== null) bridge.FeedKey(activePitchKey, false);
      if (next !== null) bridge.FeedKey(next, true);
      activePitchKey = next;
      lastCommandChangeSimS = simS;
    };
    const controlAltitude = (targetAglFt) => {
      const state = globalThis.__gunsState;
      const agl = Number(state?.radar_alt_ft);
      const verticalSpeed = Number(state?.vertical_speed_fpm);
      const simS = Number(state?.t);
      if (![agl, verticalSpeed, simS].every(Number.isFinite)) {
        throw new Error("Flight state contains non-finite altitude-control data.");
      }
      if (simS - lastCommandChangeSimS < 0.28) return;
      const errorFt = targetAglFt - agl;
      const desiredVerticalSpeedFpm = Math.max(
        -7_000,
        Math.min(4_500, errorFt * 1.35),
      );
      const verticalSpeedError = desiredVerticalSpeedFpm - verticalSpeed;
      let next = null;
      if (Math.abs(errorFt) <= 180 && Math.abs(verticalSpeed) <= 700) next = null;
      else if (verticalSpeedError > 650) next = PULL_UP;
      else if (verticalSpeedError < -650) next = PUSH_DOWN;
      setPitchKey(next);
    };
    const nextFrame = () => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const reachAltitude = async (targetAglFt, label) => {
      const startedAtSimS = Number(globalThis.__gunsState?.t);
      let stableSinceSimS = null;
      while (true) {
        await nextFrame();
        assertFlight();
        controlAltitude(targetAglFt);
        const state = snapshotState();
        const stable = Math.abs(state.radarAltitudeFt - targetAglFt) <= 450
          && Math.abs(state.verticalSpeedFpm) <= 1_200;
        stableSinceSimS = stable ? (stableSinceSimS ?? state.t) : null;
        if (stableSinceSimS !== null && state.t - stableSinceSimS >= 5) {
          setPitchKey(null);
          return state;
        }
        if (state.t - startedAtSimS > 240) {
          throw new Error(
            `${label} did not stabilize at ${targetAglFt} ft AGL within 240 sim seconds; `
            + `last state=${JSON.stringify(state)}`,
          );
        }
      }
    };
    const measureLeg = async (name, targetAglFt) => {
      const deltas = [];
      const radarAltitudesFt = [];
      const trueAirspeedsKts = [];
      const before = snapshotState();
      const terrainBefore = snapshotTerrain();
      let firstTimestamp = null;
      let previousTimestamp = null;
      while (true) {
        const timestamp = await nextFrame();
        assertFlight();
        controlAltitude(targetAglFt);
        const state = snapshotState();
        if (firstTimestamp === null) firstTimestamp = timestamp;
        if (previousTimestamp !== null) {
          deltas.push(timestamp - previousTimestamp);
          radarAltitudesFt.push(state.radarAltitudeFt);
          trueAirspeedsKts.push(state.trueAirspeedKts);
        }
        previousTimestamp = timestamp;
        if (timestamp - firstTimestamp >= config.legDurationMs) {
          setPitchKey(null);
          return {
            name,
            deltas,
            radarAltitudesFt,
            trueAirspeedsKts,
            before,
            after: snapshotState(),
            terrainBefore,
            terrainAfter: snapshotTerrain(),
          };
        }
      }
    };
    const markHidden = () => {
      if (document.visibilityState !== "visible") {
        hiddenReason = `visibilitychange:${document.visibilityState}`;
      }
    };
    const markBlurred = () => {
      hiddenReason = "window blur";
    };

    document.addEventListener("visibilitychange", markHidden);
    window.addEventListener("blur", markBlurred);
    watchdog = setTimeout(() => {
      hiddenReason = "profile watchdog exceeded 12 minutes";
    }, 12 * 60 * 1_000);
    try {
      assertFlight();
      bridge.SetAssistedFlight(false);
      bridge.SetAutoGcasEnabled(true);
      bridge.SetAnalogRollControl(0);
      bridge.FeedDirectThrottle(true, true);

      await reachAltitude(config.highAglFt, "high-altitude control");
      const high = await measureLeg("high-altitude control", config.highAglFt);
      await reachAltitude(config.lowAglFt, "low-level terrain");
      const low = await measureLeg("low-level terrain", config.lowAglFt);
      return [high, low];
    } finally {
      clearTimeout(watchdog);
      document.removeEventListener("visibilitychange", markHidden);
      window.removeEventListener("blur", markBlurred);
      if (activePitchKey !== null) bridge.FeedKey(activePitchKey, false);
      bridge.FeedDirectThrottle(true, false);
      bridge.SetAnalogRollControl(0);
    }
  }, {
    legDurationMs: options.legDurationMs,
    highAglFt: DEFAULT_HIGH_AGL_FT,
    lowAglFt: DEFAULT_LOW_AGL_FT,
  });
}

export async function run(options) {
  await assertPublishedApp(options.wwwroot);
  const site = await staticSite(options.wwwroot);
  let launched;
  try {
    launched = await launchGpuFirst();
    const { browser, page } = launched;
    try {
      await site.install(page);
      const pageErrors = await bootPublishedApp(page, site.url);
      const renderer = await queryRenderer(page, "#scene");
      const softwareRenderer = isSoftwareRenderer(renderer);
      const modeLabel = softwareRenderer
        ? "CPU-hitch detection only — not a frame rate"
        : "hardware-GPU frame timing and CPU-hitch detection";

      console.log(`Renderer (UNMASKED_RENDERER_WEBGL): ${renderer}`);
      console.log(`Render mode: ${modeLabel}`);
      console.log(`Launch: ${launched.launchName}`);
      console.log(`Published-app transport: ${site.transport}`);
      console.log("Visibility: visible and foreground-focused (asserted every RAF)");
      console.log(
        `Profile: fixed beat=${FIXED_BEAT} seed=${FIXED_SEED}; `
        + `${DEFAULT_HIGH_AGL_FT} ft AGL then ${DEFAULT_LOW_AGL_FT} ft AGL; `
        + `${options.legDurationMs / 1000}s per leg`,
      );

      const rawLegs = await flyProfile(page, options);
      if (pageErrors.length > 0) {
        throw new Error(`Uncaught page errors:\n${pageErrors.join("\n")}`);
      }
      const legs = rawLegs.map(summarizeLeg);
      for (const leg of legs) console.log(formatLeg(leg));

      const high = legs[0];
      const low = legs[1];
      console.log(
        "low-minus-high: "
        + `p99=${(low.p99Ms - high.p99Ms).toFixed(2)} ms `
        + `MAX=${(low.maxMs - high.maxMs).toFixed(2)} ms `
        + `long=${(low.longFramePercent - high.longFramePercent).toFixed(3)} points`,
      );
      console.log(
        `Gates: MAX <= ${options.maxFrameMs.toFixed(2)} ms; `
        + `long(>33ms) <= ${options.maxLongFramePercent.toFixed(3)}%; `
        + `minimum frames/leg = ${options.minFrames}`,
      );

      const invalidProfile = profileValidation(legs, options);
      const breaches = gateFailures(legs, options);
      if (invalidProfile.length > 0) {
        console.error("PROFILE INVALID:");
        for (const failure of invalidProfile) console.error(`  - ${failure}`);
      }
      if (breaches.length > 0) {
        console.error("FRAME GATE FAIL:");
        for (const failure of breaches) console.error(`  - ${failure}`);
      }
      if (invalidProfile.length === 0 && breaches.length === 0) {
        console.log("FRAME GATE PASS");
      }

      return {
        renderer,
        softwareRenderer,
        modeLabel,
        launch: launched.launchName,
        options,
        profile: {
          beat: FIXED_BEAT,
          seed: FIXED_SEED,
          highAglFt: DEFAULT_HIGH_AGL_FT,
          lowAglFt: DEFAULT_LOW_AGL_FT,
        },
        legs,
        lowMinusHigh: {
          p99Ms: low.p99Ms - high.p99Ms,
          maxMs: low.maxMs - high.maxMs,
          longFramePercentagePoints: low.longFramePercent - high.longFramePercent,
        },
        invalidProfile,
        breaches,
        passed: invalidProfile.length === 0 && breaches.length === 0,
      };
    } finally {
      await browser.close();
    }
  } finally {
    await site.close();
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await run(options);
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
