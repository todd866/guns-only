#!/usr/bin/env node
// Per-tick cost of each kernel, measured outside the render loop: drive Advance() directly with
// a known delta and divide by the fixed-step ticks it actually executed. This separates the
// per-call interop overhead from the per-tick simulation cost, which is what decides whether the
// sim can ever fit in a frame budget.

import { launch, PORT } from "./frame_attribution.mjs";

const MODE = process.argv[2] ?? "cobra";
const BASE = `http://127.0.0.1:${PORT}/`;

const { browser, page } = await launch({
  deviceScaleFactor: 1, viewport: { width: 1440, height: 900 }, countGl: false,
});
try {
  if (MODE === "f22") {
    await page.goto(`${BASE}?program=first-merge&audioQa=silent`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(() => document.querySelector("#boot")?.classList.contains("ready") === true, undefined, { timeout: 180_000 });
    await page.waitForFunction(() => globalThis.__gunsBridge && globalThis.__gunsLifecycle, undefined, { timeout: 90_000 });
    await page.evaluate(() => { if (globalThis.__gunsState?.session_phase !== "ACTIVE") globalThis.__gunsLifecycle.begin(); });
    await page.waitForFunction(() => globalThis.__gunsState?.session_phase === "ACTIVE"
      && globalThis.__gunsState?.player_terminal_state === "FLYING", undefined, { timeout: 240_000 });
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
  await page.waitForTimeout(8000);

  const out = await page.evaluate(async (mode) => {
    const runtime = await globalThis.getDotnetRuntime(0);
    const exports = await runtime.getAssemblyExports("GunsOnly.Web");
    const cls = mode === "f22" ? exports.GunsOnly.Web.WebBridge
      : mode === "cobra" ? exports.GunsOnly.Web.CobraWebBridge
        : exports.GunsOnly.Web.MotorcycleWebBridge;
    const rows = [];
    // Warm the JIT/AOT paths first.
    for (let i = 0; i < 60; i++) cls.Advance(1 / 120, ...(mode === "f22" ? [1] : []));
    for (const dt of [0, 1 / 240, 1 / 120, 1 / 60, 1 / 30, 1 / 20, 1 / 10]) {
      const samples = [];
      for (let i = 0; i < 120; i++) {
        const t0 = performance.now();
        cls.Advance(dt, ...(mode === "f22" ? [1] : []));
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      rows.push({
        dtMs: +(dt * 1000).toFixed(3),
        p50: +samples[60].toFixed(3),
        mean: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3),
        max: +samples.at(-1).toFixed(3),
      });
    }
    return rows;
  }, MODE);

  console.log(`mode=${MODE}`);
  console.log("dtMs,advanceP50Ms,advanceMeanMs,advanceMaxMs");
  for (const r of out) console.log([r.dtMs, r.p50, r.mean, r.max].join(","));
} finally {
  await browser.close();
}
