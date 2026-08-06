#!/usr/bin/env node
// Clean fill isolation: pause the simulation so the CPU side is ~constant and near-zero, run the
// browser uncapped so no vsync back-pressure inflates the GPU timer, then sweep render pixels by
// changing only the viewport. Slope of frame time vs Mpx is the fill cost.

import { createRequire } from "node:module";
import { launch, capture, PORT } from "./frame_attribution.mjs";

const requireFromSmoke = createRequire(process.env.GUNS_SMOKE_PACKAGE);
const MODE = process.argv[2] ?? "f22";
const BASE = `http://127.0.0.1:${PORT}/`;

const SIZES = [
  { width: 640, height: 400 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1200 },
  { width: 2560, height: 1600 },
  { width: 3200, height: 2000 },
];

const { browser, page } = await launch({
  deviceScaleFactor: 1, viewport: SIZES[0], countGl: false,
});
try {
  if (MODE === "f22") {
    await page.goto(`${BASE}?program=first-merge&audioQa=silent`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(() => document.querySelector("#boot")?.classList.contains("ready") === true, undefined, { timeout: 180_000 });
    await page.waitForFunction(() => globalThis.__gunsBridge && globalThis.__gunsLifecycle, undefined, { timeout: 90_000 });
    await page.evaluate(() => { if (globalThis.__gunsState?.session_phase !== "ACTIVE") globalThis.__gunsLifecycle.begin(); });
    await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "ACTIVE"
      && globalThis.__gunsState?.player_terminal_state === "FLYING", undefined, { timeout: 240_000 });
    await page.waitForFunction(() => (globalThis.__gunsAssets?.snapshot?.terrain?.residentChunks ?? 0) > 0, undefined, { timeout: 180_000 });
  } else if (MODE === "cobra") {
    await page.goto(`${BASE}cobra-lab/index.html?audioQa=silent`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.ready === "true"
      && !!window.__gunsOnlyCobraAuthority?.vehicle, undefined, { timeout: 120_000 });
  } else {
    await page.goto(`${BASE}weekend-ride/?audioQa=silent`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.ready === "true"
      && !!window.__gunsOnlyWeekendAuthority, undefined, { timeout: 120_000 });
  }
  await page.bringToFront();
  await page.locator("#scene").focus().catch(() => {});
  await page.waitForTimeout(6000);
  if (MODE === "f22") { await page.keyboard.press("Escape"); await page.waitForTimeout(1500); }

  console.log("mode,width,height,renderPixels,Mpx,deltaP50,cbP50,cbMean,gpuP50,fps");
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await page.waitForTimeout(4000);
    const s = await capture(page, 5000);
    const px = await page.evaluate(() => {
      const c = document.querySelector("#scene");
      return c ? c.width * c.height : null;
    });
    console.log([MODE, size.width, size.height, px, (px / 1e6).toFixed(2),
      s.delta.p50.toFixed(2), s.callback.p50.toFixed(2), s.callback.mean.toFixed(2),
      s.gpu ? s.gpu.p50.toFixed(2) : "", (1000 / s.delta.p50).toFixed(1)].join(","));
  }
} finally {
  await browser.close();
}
