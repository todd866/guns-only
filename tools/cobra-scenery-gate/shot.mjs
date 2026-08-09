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
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import {
  COBRA_CHROMIUM_ARGS,
  waitForCobraAuthority,
} from "../../web/smoke/cobra_authority.mjs";

const require = createRequire(new URL("../../web/smoke/package.json", import.meta.url));
const { chromium } = require("playwright");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(SCRIPT_DIR, "../..");
const VISUAL_CONTRACT = JSON.parse(readFileSync(resolve(
  REPO_DIR,
  "content/packs/cobra-vietnam/environment/cobra-canyon-visual-contract.v1.json",
), "utf8"));
const OUT_DIR = resolve(process.env.COBRA_SCENERY_SHOT_DIR ?? join(SCRIPT_DIR, "shots"));
const CAPTURE_WIDTH = 1600;
const CAPTURE_HEIGHT = 1000;
const HIDDEN_ROLES = String(process.env.COBRA_SCENERY_HIDE_ROLES ?? "")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean);

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

// Exterior scenery poses come from the same portable contract Unity consumes. This prevents a
// renderer or QA script from quietly improving its score by moving a difficult camera.
const VIEWS = Object.freeze(VISUAL_CONTRACT.acceptanceViews.map(({ id, ...view }) => Object.freeze({
  name: id,
  ...view,
})));

async function parkAndSettle(page, view) {
  const hiddenRoleMatches = await page.evaluate(({ parkedView, hiddenRoles }) => {
    window.__gunsOnlyCobraLabCamera.park(
      parkedView.eastM,
      parkedView.northM,
      parkedView.aglM,
      parkedView.yawRad,
      parkedView.pitchRad,
    );
    const matches = {};
    for (const role of hiddenRoles) {
      matches[role] = window.__gunsOnlyCobraLabCamera.setPresentationRoleVisible(role, false);
    }
    return matches;
  }, { parkedView: view, hiddenRoles: HIDDEN_ROLES });
  for (const [role, matches] of Object.entries(hiddenRoleMatches)) {
    if (!Number.isInteger(matches) || matches < 1) {
      throw new Error(`QA role suppression matched no presentation object for ${role}`);
    }
  }

  // Two actual renderer frames replace arbitrary sleeps: the first applies the parked pose and
  // desktop rebuild, the second proves presentation LOD and the backing store have settled.
  await page.evaluate(() => new Promise((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
  }));

  const diagnostics = await page.evaluate(() => {
    const canvas = document.querySelector("#scene");
    const rect = canvas?.getBoundingClientRect();
    return {
      presentation: window.__gunsOnlyCobraLabCamera?.presentationDiagnostics?.() ?? null,
      frame: window.__gunsOnlyCobraFrameProfile?.read?.() ?? null,
      airframeVisible: window.__gunsOnlyCobraAirframeVisible?.() ?? null,
      canvas: canvas && rect ? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
      } : null,
      render: window.__gunsOnlyCobraRenderInfo
        ? {
          calls: window.__gunsOnlyCobraRenderInfo.render?.calls ?? null,
          triangles: window.__gunsOnlyCobraRenderInfo.render?.triangles ?? null,
        }
        : null,
    };
  });
  const presentation = diagnostics.presentation;
  const canvas = diagnostics.canvas;
  if (diagnostics.airframeVisible !== false) {
    throw new Error(`parked capture still contains the AH-1G presence: ${JSON.stringify(diagnostics)}`);
  }
  if (presentation?.qualityTier !== "desktop"
      || presentation?.ambientBudgetLevel !== 0
      || presentation?.nearRingVisible !== true) {
    throw new Error(`parked presentation did not settle: ${JSON.stringify(presentation)}`);
  }
  if (!canvas
      || canvas.x !== 0
      || canvas.y !== 0
      || canvas.width !== CAPTURE_WIDTH
      || canvas.height !== CAPTURE_HEIGHT
      || canvas.backingWidth !== CAPTURE_WIDTH
      || canvas.backingHeight !== CAPTURE_HEIGHT) {
    throw new Error(`capture canvas is not exact ${CAPTURE_WIDTH}x${CAPTURE_HEIGHT}: ${JSON.stringify(canvas)}`);
  }
  return { ...diagnostics, hiddenRoleMatches };
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
    const page = await browser.newPage({
      viewport: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
      deviceScaleFactor: 1,
    });
    page.on("pageerror", (error) => console.error("pageerror:", error.message));
    await page.goto(`${site.url}/cobra-lab/index.html?audioQa=silent`, {
      waitUntil: "load",
      timeout: 180_000,
    });
    // QA-only clean plates. Production menu/HUD CSS is untouched; park() still owns mission and
    // 3D-state suppression while this session style removes DOM chrome and the filmed vignette.
    await page.addStyleTag({ content: `
      body > :not(.flight-stage):not(script) {
        display: none !important;
        visibility: hidden !important;
      }
      .viewport > :not(#scene) {
        display: none !important;
        visibility: hidden !important;
      }
      .viewport::after {
        content: none !important;
        display: none !important;
        background: none !important;
      }
    ` });
    await waitForCobraAuthority(page, 240_000);
    await page.waitForFunction(
      () => typeof window.__gunsOnlyCobraLabCamera?.park === "function",
      undefined,
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      () => window.__gunsOnlyCobraLabCamera?.foliageAtlasReady?.() === true,
      undefined,
      { timeout: 60_000 },
    );
    await page.evaluate(() => {
      document.querySelector("[data-onboarding-dismiss], #onboarding-dismiss, .onboarding button")
        ?.click();
    });
    await page.waitForFunction(
      () => window.__gunsOnlyCobraAuthority?.status === "active"
        && document.querySelector("#status")?.dataset.ready === "true",
      undefined,
      { timeout: 120_000 },
    );

    const meta = [];
    for (const view of VIEWS) {
      const diagnostics = await parkAndSettle(page, view);
      const path = join(OUT_DIR, `${view.name}.png`);
      await page.screenshot({
        path,
        type: "png",
        scale: "css",
        clip: { x: 0, y: 0, width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
      });
      meta.push({ ...view, path, diagnostics });
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
