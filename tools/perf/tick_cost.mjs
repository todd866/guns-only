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
      && document.querySelector("#ride-brief")?.hidden === false
      && window.__gunsOnlyWeekendAuthority?.phase === "paused", undefined, { timeout: 120_000 });
    await page.locator("#ride-brief-start").click();
    await page.waitForFunction(() => document.querySelector("#ride-brief")?.hidden === true
      && window.__gunsOnlyWeekendAuthority?.phase === "active", undefined, { timeout: 20_000 });
    const teaching = page.locator("#controls-onboarding-dismiss");
    if (await teaching.isVisible()) await teaching.click();
  }
  await page.bringToFront();
  await page.locator("#scene").focus().catch(() => {});
  if (MODE === "ride") {
    const before = await page.evaluate(() => ({
      x: Number(window.__gunsOnlyWeekendAuthority?.px) || 0,
      z: Number(window.__gunsOnlyWeekendAuthority?.pz) || 0,
    }));
    await page.keyboard.down("w");
    await page.waitForFunction((start) => {
      const state = window.__gunsOnlyWeekendAuthority;
      return state?.phase === "active"
        && Math.hypot(Number(state?.vx) || 0, Number(state?.vz) || 0) > 0.5
        && Math.hypot(
          (Number(state?.px) || 0) - start.x,
          (Number(state?.pz) || 0) - start.z,
        ) > 0.5;
    }, before, { timeout: 15_000 });
    await page.keyboard.up("w");
  }
  await page.waitForTimeout(8000);

  const out = await page.evaluate(async (mode) => {
    const runtime = await globalThis.getDotnetRuntime(0);
    const exports = await runtime.getAssemblyExports("GunsOnly.Web");
    const cls = mode === "f22" ? exports.GunsOnly.Web.WebBridge
      : mode === "cobra" ? exports.GunsOnly.Web.CobraWebBridge
        : exports.GunsOnly.Web.MotorcycleWebBridge;
    if (mode === "ride") {
      const before = JSON.parse(cls.GetState());
      if (before.phase !== "active") {
        throw new Error(`Weekend Ride tick probe is not active: ${before.phase ?? "missing"}`);
      }
      const initialTick = cls.Advance(0);
      cls.SetControls(1, 0, 0, 0, 0, 1);
      let finalTick = initialTick;
      for (let tick = 0; tick < 240; tick++) finalTick = cls.Advance(1 / 120);
      cls.SetControls(0, 0, 0, 0, 0, 1);
      const after = JSON.parse(cls.GetState());
      const travelM = Math.hypot(after.px - before.px, after.pz - before.pz);
      if (!(finalTick > initialTick)) throw new Error("Weekend Ride authority tick did not advance");
      if (!(travelM > 0.05)) throw new Error("Weekend Ride authority did not move the bike");
    }
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
