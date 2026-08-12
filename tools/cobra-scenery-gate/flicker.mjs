#!/usr/bin/env node
/**
 * Static-scene flicker probe. Screenshots cannot see temporal artifacts, so nothing in the
 * gate ever measured the z-fight shimmer the owner reports. This instrument parks the free
 * camera at each authored view, captures consecutive frames, and reports the fraction of
 * pixels whose channel delta exceeds a hard threshold between frames. Z-fighting flips
 * whole surfaces between colors frame-to-frame and screams in this number; honest animation
 * (river shader, rotor) moves few pixels smoothly.
 *
 * Instrument first, gate later: it PRINTS per-view numbers and exits nonzero only above a
 * generous ceiling, so a flaky hard gate cannot block ships before the numbers are trusted.
 *
 * Usage (same serving contract as shot.mjs):
 *   COBRA_SCENERY_WWWROOT=/tmp/guns-only-web/wwwroot node tools/cobra-scenery-gate/flicker.mjs
 */

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { PNG } from "pngjs";
import {
  COBRA_CHROMIUM_ARGS,
  waitForCobraAuthority,
} from "../../web/smoke/cobra_authority.mjs";

const require = createRequire(new URL("../../web/smoke/package.json", import.meta.url));
const { chromium } = require("playwright");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(SCRIPT_DIR, "../..");

// Fraction of pixels allowed to jump hard between consecutive parked frames. The river and
// haze animate smoothly; a z-fighting plate flips entire regions. Generous by design.
const HARD_DELTA = 14;
const CEILING_FRACTION = 0.06;

const VIEWS = [
  { name: "camp-ember-overhead", eastM: -6_775, northM: -6_200, aglM: 150, yawRad: 0.0, pitchRad: -1.35 },
  { name: "camp-ember-pad", eastM: -6_800, northM: -6_200, aglM: 8, yawRad: 1.35, pitchRad: -0.15 },
  { name: "mid-gorge", eastM: -4_557, northM: -3_661, aglM: 50, yawRad: -0.5, pitchRad: -0.2 },
];

function resolveWwwroot() {
  const explicit = process.env.COBRA_SCENERY_WWWROOT || process.env.SMOKE_WWWROOT;
  if (explicit) return resolve(explicit);
  const preview = resolve(process.env.GUNS_PREVIEW_OUT ?? "/tmp/guns-only-web", "wwwroot");
  if (existsSync(join(preview, "_framework"))) return preview;
  throw new Error("Need a published wwwroot (COBRA_SCENERY_WWWROOT or bin/preview-web).");
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
  await new Promise((resolveReady) => setTimeout(resolveReady, 700));
  return { url: `http://127.0.0.1:${port}`, stop: () => child.kill("SIGTERM") };
}

function hardDeltaFraction(bufferA, bufferB) {
  const a = PNG.sync.read(bufferA);
  const b = PNG.sync.read(bufferB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("flicker probe frames differ in size");
  }
  let hard = 0;
  const pixels = a.width * a.height;
  for (let index = 0; index < pixels; index++) {
    const offset = index * 4;
    const delta = Math.max(
      Math.abs(a.data[offset] - b.data[offset]),
      Math.abs(a.data[offset + 1] - b.data[offset + 1]),
      Math.abs(a.data[offset + 2] - b.data[offset + 2]),
    );
    if (delta > HARD_DELTA) hard++;
  }
  return hard / pixels;
}

async function main() {
  const wwwroot = resolveWwwroot();
  const site = await servePython(wwwroot);
  const browser = await chromium.launch({ headless: true, args: [...COBRA_CHROMIUM_ARGS] });
  let worst = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${site.url}/cobra-lab/index.html?audioQa=silent`, {
      waitUntil: "load",
      timeout: 180_000,
    });
    await waitForCobraAuthority(page, 240_000);
    await page.waitForFunction(
      () => typeof window.__gunsOnlyCobraLabCamera?.park === "function",
      undefined,
      { timeout: 60_000 },
    );
    for (const view of VIEWS) {
      await page.evaluate((v) => {
        window.__gunsOnlyCobraLabCamera.park(v.eastM, v.northM, v.aglM, v.yawRad, v.pitchRad);
      }, view);
      await page.waitForTimeout(2000);
      const frames = [];
      for (let i = 0; i < 4; i++) {
        frames.push(await page.screenshot({ type: "png" }));
        await page.waitForTimeout(180);
      }
      let viewWorst = 0;
      for (let i = 1; i < frames.length; i++) {
        viewWorst = Math.max(viewWorst, hardDeltaFraction(frames[i - 1], frames[i]));
      }
      worst = Math.max(worst, viewWorst);
      console.log(`flicker: ${view.name} worst hard-delta fraction ${(viewWorst * 100).toFixed(2)}%`);
    }
  } finally {
    await browser.close();
    site.stop();
  }
  if (worst > CEILING_FRACTION) {
    console.error(
      `flicker: FAIL — worst ${(worst * 100).toFixed(2)}% exceeds the ${(CEILING_FRACTION * 100).toFixed(0)}% ceiling`,
    );
    process.exit(1);
  }
  console.log(`flicker: OK — worst ${(worst * 100).toFixed(2)}% within the ceiling`);
}

await main();
