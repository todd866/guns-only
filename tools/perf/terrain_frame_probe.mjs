#!/usr/bin/env node

import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const requireFromSmoke = createRequire(
  new URL("../../web/smoke/package.json", import.meta.url),
);
const { chromium } = requireFromSmoke("playwright");

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WWWROOT = resolve(
  SCRIPT_DIRECTORY,
  "../../web/bin/Release/net8.0/publish/wwwroot",
);
const DEFAULT_DURATION_MS = 15_000;
const DEFAULT_SETTLE_MS = 4_000;

const MIME = {
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
};

function usage() {
  return [
    "Usage: node tools/perf/terrain_frame_probe.mjs [options]",
    "",
    `  --wwwroot PATH       Published wwwroot (default: ${DEFAULT_WWWROOT})`,
    "  --duration-ms N      RAF sample window, at least 15000 (default: 15000)",
    "  --settle-ms N        Input/terrain settle time before sampling (default: 4000)",
    "  --label TEXT         Label included in the result (default: terrain)",
    "  --screenshot PATH    Save the measured terrain-facing frame as a PNG",
  ].join("\n");
}

function parseArguments(argv) {
  const parsed = {
    wwwroot: DEFAULT_WWWROOT,
    durationMs: DEFAULT_DURATION_MS,
    settleMs: DEFAULT_SETTLE_MS,
    label: "terrain",
    screenshot: null,
  };
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === "--help" || option === "-h") {
      console.log(usage());
      process.exit(0);
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`Missing value for ${option}.\n${usage()}`);
    if (option === "--wwwroot") parsed.wwwroot = resolve(value);
    else if (option === "--duration-ms") parsed.durationMs = Number(value);
    else if (option === "--settle-ms") parsed.settleMs = Number(value);
    else if (option === "--label") parsed.label = value;
    else if (option === "--screenshot") parsed.screenshot = resolve(value);
    else throw new Error(`Unknown option: ${option}\n${usage()}`);
  }
  if (!Number.isFinite(parsed.durationMs) || parsed.durationMs < DEFAULT_DURATION_MS) {
    throw new Error("--duration-ms must be at least 15000.");
  }
  if (!Number.isFinite(parsed.settleMs) || parsed.settleMs < 0) {
    throw new Error("--settle-ms must be non-negative.");
  }
  return parsed;
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!match) return null;
  let start = match[1] === "" ? null : Number(match[1]);
  let end = match[2] === "" ? null : Number(match[2]);
  if (start === null) {
    const suffixLength = Math.min(size, end ?? 0);
    start = size - suffixLength;
    end = size - 1;
  } else {
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || start > end || start >= size) return null;
  return { start, end };
}

async function serveStatic(root) {
  const rootPath = resolve(root);
  const rootInfo = await stat(rootPath).catch(() => null);
  if (!rootInfo?.isDirectory()) {
    throw new Error(`Published wwwroot does not exist: ${rootPath}`);
  }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const filePath = resolve(rootPath, `.${pathname}`);
      const relativePath = relative(rootPath, filePath);
      if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(filePath).catch(() => null);
      if (!info?.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }

      const rangeHeader = request.headers.range;
      const range = rangeHeader ? parseRange(rangeHeader, info.size) : null;
      if (rangeHeader && !range) {
        response.writeHead(416, { "content-range": `bytes */${info.size}` }).end();
        return;
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? info.size - 1;
      const headers = {
        "accept-ranges": "bytes",
        "cache-control": "no-store",
        "content-length": String(end - start + 1),
        "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      };
      if (range) headers["content-range"] = `bytes ${start}-${end}/${info.size}`;
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(filePath, { start, end }).pipe(response);
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolveClose, rejectClose) =>
      server.close((error) => error ? rejectClose(error) : resolveClose())),
  };
}

function percentile(sorted, fraction) {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function summarize(deltas) {
  if (!Array.isArray(deltas) || deltas.length === 0) {
    throw new Error("The page returned no requestAnimationFrame deltas.");
  }
  const sorted = [...deltas].sort((left, right) => left - right);
  return {
    samples: sorted.length,
    sampledMs: deltas.reduce((total, value) => total + value, 0),
    p50Ms: percentile(sorted, 0.50),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1),
  };
}

function projectedState() {
  const state = globalThis.__gunsState;
  const terrain = globalThis.__gunsAssets?.snapshot?.terrain ?? null;
  return {
    sessionPhase: state?.session_phase ?? null,
    terminalState: state?.player_terminal_state ?? null,
    radarAltitudeFt: Number(state?.radar_alt_ft),
    altitudeFt: Number(state?.alt_ft),
    position: [Number(state?.px), Number(state?.py), Number(state?.pz)],
    terrain,
  };
}

export async function run(options) {
  const site = await serveStatic(options.wwwroot);
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));

    await page.goto(site.url, { waitUntil: "load", timeout: 60_000 });
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
      () => globalThis.__gunsState?.session_phase === "ACTIVE"
        && globalThis.__gunsState?.player_terminal_state === "FLYING",
      undefined,
      { timeout: 45_000 },
    );
    await page.waitForFunction(
      () => {
        const terrain = globalThis.__gunsAssets?.snapshot?.terrain;
        return terrain?.residentChunks > 0
          && (terrain.activeLoads ?? terrain.activePageLoads ?? 0) === 0
          && (terrain.queuedLoads ?? terrain.queuedPageLoads ?? 0) === 0;
      },
      undefined,
      { timeout: 120_000 },
    );

    await page.locator("#scene").focus();
    await page.keyboard.down("ArrowDown");
    await page.keyboard.down("ArrowRight");
    try {
      await page.waitForTimeout(options.settleMs);
      await page.waitForFunction(
        () => Number(globalThis.__gunsState?.radar_alt_ft) <= 2_500
          && globalThis.__gunsState?.player_terminal_state === "FLYING",
        undefined,
        { timeout: 240_000 },
      );
      const before = await page.evaluate(projectedState);
      const deltas = await page.evaluate((durationMs) => new Promise((resolveSample) => {
        const values = [];
        let firstTimestamp = null;
        let previousTimestamp = null;
        const sample = (timestamp) => {
          if (firstTimestamp === null) firstTimestamp = timestamp;
          if (previousTimestamp !== null) values.push(timestamp - previousTimestamp);
          previousTimestamp = timestamp;
          if (timestamp - firstTimestamp >= durationMs) resolveSample(values);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }), options.durationMs);
      const after = await page.evaluate(projectedState);
      if (options.screenshot) {
        await page.screenshot({ path: options.screenshot });
      }
      if (pageErrors.length) {
        throw new Error(`Uncaught page errors:\n${pageErrors.join("\n")}`);
      }
      return {
        label: options.label,
        renderer: "Chromium headless / ANGLE SwiftShader",
        viewport: "1280x720@1x",
        durationTargetMs: options.durationMs,
        ...summarize(deltas),
        before,
        after,
      };
    } finally {
      await page.keyboard.up("ArrowRight").catch(() => {});
      await page.keyboard.up("ArrowDown").catch(() => {});
    }
  } finally {
    await browser.close();
    await site.close();
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await run(options);
    console.log(
      `${result.label}: samples=${result.samples} p50=${result.p50Ms.toFixed(2)} ms `
      + `p95=${result.p95Ms.toFixed(2)} ms max=${result.maxMs.toFixed(2)} ms`,
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  }
}

if (globalThis.process?.argv?.[1]
  && import.meta.url === pathToFileURL(resolve(globalThis.process.argv[1])).href) await main();
