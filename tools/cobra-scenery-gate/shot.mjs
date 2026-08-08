#!/usr/bin/env node
/**
 * Capture silent cobra-lab stills from a *published* wwwroot, then run the emptiness gate.
 *
 * Source web/wwwroot alone has no WASM publish — serve a publish tree:
 *   OPEN=0 GUNS_PREVIEW_OUT=/tmp/guns-only-web bin/preview-web
 *   COBRA_SCENERY_WWWROOT=/tmp/guns-only-web/wwwroot node tools/cobra-scenery-gate/shot.mjs
 *
 * Uses python http.server (same as bin/preview-web). The Node smoke static_server has been
 * observed to land cobra-lab on the root FLIGHT KERNEL OFFLINE shell instead of the mission.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import {
  COBRA_CHROMIUM_ARGS,
  waitForCobraAuthority,
} from "../../web/smoke/cobra_authority.mjs";

const require = createRequire(new URL("../../web/smoke/package.json", import.meta.url));
const { chromium } = require("playwright");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(SCRIPT_DIR, "../..");
const OUT_DIR = resolve(process.env.COBRA_SCENERY_SHOT_DIR ?? join(SCRIPT_DIR, "shots"));

function resolveWwwroot() {
  const explicit = process.env.COBRA_SCENERY_WWWROOT || process.env.SMOKE_WWWROOT;
  if (explicit) return resolve(explicit);
  const preview = resolve(process.env.GUNS_PREVIEW_OUT ?? "/tmp/guns-only-web", "wwwroot");
  if (existsSync(join(preview, "_framework"))) return preview;
  throw new Error(
    "Need a published wwwroot. Set COBRA_SCENERY_WWWROOT or run:\n"
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
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => resolveReady(), 400);
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
    async close() {
      child.kill("SIGTERM");
    },
  };
}

// Exterior park poses — scenery only. eastM/northM match landmark.positionLocalM
// [east, up, north] (camera z = -north). Overnight stills used wrong origin coords.
const VIEWS = Object.freeze([
  Object.freeze({
    name: "camp-ember",
    eastM: -6_500,
    northM: -6_200,
    aglM: 38,
    yawRad: 0.9,
    pitchRad: -0.25,
  }),
  Object.freeze({
    name: "mid-gorge",
    // Long Fang approach — looks across village/canopy rather than up a blank hillside.
    eastM: -4_557,
    northM: -3_661,
    aglM: 50,
    yawRad: -0.5,
    pitchRad: -0.2,
  }),
  Object.freeze({
    name: "iron-bell",
    eastM: -2_710,
    northM: -500,
    aglM: 58,
    yawRad: -0.55,
    pitchRad: -0.14,
  }),
]);

async function main() {
  const wwwroot = resolveWwwroot();
  console.log(`shot: wwwroot ${wwwroot}`);
  await mkdir(OUT_DIR, { recursive: true });
  const site = await servePython(wwwroot);
  const browser = await chromium.launch({
    headless: true,
    args: [...COBRA_CHROMIUM_ARGS],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("pageerror", (error) => console.error("pageerror:", error.message));
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
    await page.evaluate(() => {
      document.querySelector("[data-onboarding-dismiss], #onboarding-dismiss, .onboarding button")
        ?.click();
    });
    // First park may flip quality→desktop and rebuild presentation — wait for that to settle.
    await page.evaluate((v) => {
      window.__gunsOnlyCobraLabCamera.park(v.eastM, v.northM, v.aglM, v.yawRad, v.pitchRad);
    }, VIEWS[0]);
    await page.waitForTimeout(2500);
    await page.waitForFunction(
      () => window.__gunsOnlyCobraAuthority?.status === "active"
        && document.querySelector("#status")?.dataset.ready === "true",
      undefined,
      { timeout: 120_000 },
    );

    const meta = [];
    for (const view of VIEWS) {
      await page.evaluate((v) => {
        window.__gunsOnlyCobraLabCamera.park(v.eastM, v.northM, v.aglM, v.yawRad, v.pitchRad);
      }, view);
      await page.waitForTimeout(1200);
      const path = join(OUT_DIR, `${view.name}.png`);
      await page.screenshot({ path, type: "png" });
      meta.push({ ...view, path });
      console.log(`wrote ${path}`);
    }
    await writeFile(join(OUT_DIR, "views.json"), `${JSON.stringify(meta, null, 2)}\n`);
  } finally {
    await browser.close();
    await site.close();
  }

  const score = spawnSync(
    process.execPath,
    [join(SCRIPT_DIR, "score.mjs"), "--shots", OUT_DIR, "--mode", "fail"],
    { stdio: "inherit", cwd: REPO_DIR },
  );
  process.exitCode = score.status === null ? 1 : score.status;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
