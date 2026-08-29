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
import {
  COBRA_SCENERY_SCREENSHOT_TIMEOUT_MS,
  COBRA_SCENERY_VIEWS,
} from "./views.mjs";
import { stageCobraBattleEvidence } from "./battle_capture.mjs";

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
    await page.goto(`${site.url}/cobra-lab/index.html?audioQa=silent&battleQa=1`, {
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
    const meta = [];

    // The detached scenery cameras prove geometry, but the user's actual complaint is whether
    // the fight reads through the windscreen. Release the review camera, catch a fresh exact
    // Iron Bell exchange, and retain HUD + player eye in a required acceptance frame.
    await page.evaluate(() => window.__gunsOnlyCobraLabCamera.release());
    const cockpitSiteId = COBRA_SCENERY_VIEWS[0].battleSiteId;
    const cockpitEvidence = await stageCobraBattleEvidence(page, cockpitSiteId);
    const cockpitPath = join(OUT_DIR, "cockpit-battle.png");
    await page.screenshot({
      path: cockpitPath,
      type: "png",
      timeout: COBRA_SCENERY_SCREENSHOT_TIMEOUT_MS,
    });
    meta.push({
      name: "cockpit-battle",
      view: "player-eye",
      battleSiteId: cockpitSiteId,
      path: cockpitPath,
      battleEvidence: cockpitEvidence,
      render: cockpitEvidence.render,
    });
    console.log(`wrote ${cockpitPath}`);

    // Capture Plantation immediately after the cockpit while its opposing units are still spread
    // across the objective. Iron Bell follows; non-battle scenery remains in authored list order.
    const captureViews = [...COBRA_SCENERY_VIEWS].sort((left, right) => {
      if (left.name === "plantation-fight") return -1;
      if (right.name === "plantation-fight") return 1;
      return COBRA_SCENERY_VIEWS.indexOf(left) - COBRA_SCENERY_VIEWS.indexOf(right);
    });
    for (const view of captureViews) {
      await page.evaluate((v) => {
        window.__gunsOnlyCobraLabCamera.park(
          v.eastM, v.northM, v.aglM, v.yawRad, v.pitchRad, v.fovDeg,
        );
      }, view);
      let battleEvidence = null;
      if (view.battleSiteId) {
        battleEvidence = await stageCobraBattleEvidence(page, view.battleSiteId);
      } else {
        await page.waitForTimeout(1200);
      }
      const path = join(OUT_DIR, `${view.name}.png`);
      await page.screenshot({
        path,
        type: "png",
        timeout: COBRA_SCENERY_SCREENSHOT_TIMEOUT_MS,
      });
      const render = battleEvidence?.render
        ?? await page.evaluate(() => window.__gunsOnlyCobraLabCamera.renderStats());
      meta.push({ ...view, path, battleEvidence, render });
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
