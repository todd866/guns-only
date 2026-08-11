#!/usr/bin/env node
// Driver: boots each mode, captures parked + in-motion windows at DPR 1 and 2, and
// (optionally) a GL-counting pass and a fill-scaling sweep.
//
// Usage: node tools/perf/run_attribution.mjs --mode cobra|f22|ride --dpr 1 --count --fill

import { writeFile, mkdir } from "node:fs/promises";
import process from "node:process";
import { launch, capture, BRIDGE_PROBE, PORT, OUT } from "./frame_attribution.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
};
const MODE = String(flag("mode", "cobra"));
const DPR = Number(flag("dpr", 1));
const COUNT = !!flag("count", false);
const FILL = !!flag("fill", false);
const WINDOW_MS = Number(flag("window", 8000));
const WARMUP_MS = Number(flag("warmup", 6000));
const BASE = `http://127.0.0.1:${PORT}/`;
const VIEWPORT = {
  width: Number(flag("vw", 1440)),
  height: Number(flag("vh", 900)),
};

const log = (...a) => console.log(...a);

// ---------------------------------------------------------------------------
const MODES = {
  cobra: {
    url: `${BASE}cobra-lab/index.html?audioQa=silent`,
    async boot(page) {
      await page.waitForFunction(
        () => document.querySelector("#status")?.dataset.ready === "true"
          && !!window.__gunsOnlyCobraAuthority?.vehicle,
        undefined, { timeout: 120_000 },
      );
      await page.bringToFront();
      await page.locator("#scene").focus().catch(() => {});
    },
    // "Parked": tour camera off, no control input, ship sitting.
    async park(page) {
      await page.evaluate(() => {
        const tour = document.querySelector("#tour");
        if (tour?.checked) tour.click();
      });
      await page.waitForTimeout(1500);
    },
    async move(page) {
      await page.keyboard.down("w");
      await page.keyboard.down("ShiftLeft");
      await page.waitForTimeout(1200);
    },
    async rest(page) {
      await page.keyboard.up("w").catch(() => {});
      await page.keyboard.up("ShiftLeft").catch(() => {});
    },
  },
  f22: {
    url: `${BASE}?program=first-merge&audioQa=silent`,
    async boot(page) {
      await page.waitForFunction(
        () => document.querySelector("#boot")?.classList.contains("ready") === true,
        undefined, { timeout: 180_000 },
      );
      await page.waitForFunction(
        () => globalThis.__gunsBridge && globalThis.__gunsLifecycle && globalThis.__gunsState,
        undefined, { timeout: 90_000 },
      );
      await page.evaluate(() => {
        if (globalThis.__gunsState?.session_phase === "ACTIVE") return;
        globalThis.__gunsLifecycle.begin();
      });
      await page.waitForFunction(
        () => globalThis.__gunsState?.session_phase === "ACTIVE"
          && globalThis.__gunsState?.player_terminal_state === "FLYING",
        undefined, { timeout: 240_000 },
      );
      await page.waitForFunction(
        () => (globalThis.__gunsAssets?.snapshot?.terrain?.residentChunks ?? 0) > 0,
        undefined, { timeout: 180_000 },
      );
      await page.bringToFront();
      await page.locator("#scene").focus().catch(() => {});
    },
    // "Parked" for a jet = paused: Advance() is skipped, RefreshHotFrame() still runs.
    // That isolates the simulation-advance cost exactly.
    async park(page) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1200);
    },
    async move(page) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1500);
    },
    async rest() {},
  },
  // Same boot as f22, but flown down to the low-altitude / high-triangle regime the production
  // stutter complaints come from. "parked" here means high-altitude cruise, "motion" means
  // low-level over terrain: the two legs isolate what altitude costs.
  f22low: {
    url: `${BASE}?program=first-merge&audioQa=silent`,
    async boot(page) { await MODES.f22.boot(page); },
    async park(page) { await page.waitForTimeout(500); },
    async move(page) {
      await page.evaluate(async () => {
        const bridge = globalThis.__gunsBridge;
        const PULL_UP = 0, PUSH_DOWN = 1;
        const next = () => new Promise((r) => requestAnimationFrame(r));
        const alt = () => Number(globalThis.__gunsState?.radar_alt_ft) || 0;
        const deadline = performance.now() + 90_000;
        let held = null;
        const hold = (key) => {
          if (held === key) return;
          if (held !== null) bridge.FeedKey(held, false);
          held = key;
          if (key !== null) bridge.FeedKey(key, true);
        };
        while (performance.now() < deadline) {
          const a = alt();
          if (a < 3500 && a > 1200) break;
          hold(a > 2500 ? PUSH_DOWN : PULL_UP);
          await next();
        }
        // Level off and let the terrain streamer settle before the measurement window.
        hold(null);
        const settle = performance.now() + 6000;
        while (performance.now() < settle) {
          const a = alt();
          hold(a > 3200 ? PUSH_DOWN : a < 1500 ? PULL_UP : null);
          await next();
        }
        hold(null);
      });
    },
    async rest() {},
  },
  ride: {
    url: `${BASE}weekend-ride/?audioQa=silent`,
    async boot(page) {
      await page.waitForFunction(
        () => document.querySelector("#status")?.dataset.ready === "true"
          && !!window.__gunsOnlyWeekendAuthority,
        undefined, { timeout: 120_000 },
      );
      await page.bringToFront();
      await page.locator("#scene").focus().catch(() => {});
    },
    async park() {},
    async move(page) {
      await page.keyboard.down("w");
      await page.waitForTimeout(2500);
    },
    async rest(page) { await page.keyboard.up("w").catch(() => {}); },
  },
};

// ---------------------------------------------------------------------------
async function bridgePhases(page, ms) {
  // Zero the accumulators, wait, read. Only wired where a bridge handle is reachable.
  const before = await page.evaluate(() => {
    const acc = globalThis.__perfBridgeAcc;
    if (!acc) return null;
    for (const key of Object.keys(acc)) if (typeof acc[key] === "number") acc[key] = 0;
    return performance.now();
  });
  if (before === null) return null;
  await page.waitForTimeout(ms);
  return page.evaluate((t0) => {
    const acc = globalThis.__perfBridgeAcc;
    return { ...acc, wrapped: undefined, wallMs: performance.now() - t0 };
  }, before);
}

async function cdpMetrics(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  const read = async () => {
    const { metrics } = await client.send("Performance.getMetrics");
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  };
  return { read, close: () => client.detach().catch(() => {}) };
}

function delta(a, b, keys) {
  const out = {};
  for (const k of keys) out[k] = +(((b[k] ?? 0) - (a[k] ?? 0)) * 1000).toFixed(1);
  return out;
}

async function main() {
  const mode = MODES[MODE];
  if (!mode) throw new Error(`unknown mode ${MODE}`);
  const { browser, page } = await launch({
    deviceScaleFactor: DPR, viewport: VIEWPORT, countGl: COUNT,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message ?? String(e)));
  const result = { mode: MODE, dpr: DPR, countGl: COUNT, viewport: VIEWPORT, legs: {}, errors };
  try {
    log(`[${MODE} dpr=${DPR}] navigating…`);
    await page.goto(mode.url, { waitUntil: "load", timeout: 120_000 });
    await mode.boot(page);
    log(`[${MODE} dpr=${DPR}] booted; warming ${WARMUP_MS} ms`);
    await page.waitForTimeout(WARMUP_MS);

    const bridgeWrap = await page.evaluate(BRIDGE_PROBE);
    result.bridgeWrap = bridgeWrap;
    const metrics = await cdpMetrics(page);
    const cdpKeys = ["TaskDuration", "ScriptDuration", "LayoutDuration",
      "RecalcStyleDuration", "V8CompileDuration"];

    for (const leg of ["parked", "motion"]) {
      if (leg === "parked") await mode.park(page);
      else { await mode.move(page); }
      await page.waitForTimeout(1500);
      const m0 = await metrics.read();
      const [summary, bridge] = await Promise.all([
        capture(page, WINDOW_MS),
        bridgePhases(page, WINDOW_MS),
      ]);
      const m1 = await metrics.read();
      const context = await page.evaluate(() => {
        const s = globalThis.__gunsState;
        let framePerf = null;
        try { framePerf = JSON.parse(document.documentElement.dataset.framePerf ?? "null"); }
        catch { }
        return {
          framePerf,
          terrain: globalThis.__gunsAssets?.snapshot?.terrain ?? null,
          radarAltFt: s ? Number(s.radar_alt_ft) : null,
          tasKts: s ? Number(s.true_airspeed_kts) : null,
          phase: s?.session_phase ?? null,
        };
      });
      result.legs[leg] = {
        context,
        summary: { ...summary, rows: undefined },
        rowsSample: summary.rows?.slice(0, 200),
        bridge,
        cdp: delta(m0, m1, cdpKeys),
        cdpWindowMs: WINDOW_MS,
        heapMB: +(m1.JSHeapUsedSize / 1e6).toFixed(1),
      };
      log(`[${MODE} dpr=${DPR}] ${leg}: fps=${(1000 / summary.delta.p50).toFixed(1)} `
        + `delta p50=${summary.delta.p50.toFixed(2)} p95=${summary.delta.p95.toFixed(2)} `
        + `cb p50=${summary.callback.p50.toFixed(2)} mean=${summary.callback.mean.toFixed(2)} `
        + `gpu=${summary.gpu ? summary.gpu.p50.toFixed(2) : "n/a"}`);
      if (leg === "motion") await mode.rest(page);
    }

    if (FILL) {
      result.fill = [];
      await mode.move(page);
      for (const scale of [1.0, 0.7, 0.5, 0.35, 0.25]) {
        const w = Math.round(VIEWPORT.width * scale);
        const h = Math.round(VIEWPORT.height * scale);
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(2500);
        const s = await capture(page, 5000);
        const px = w * h * DPR * DPR;
        result.fill.push({
          scale, w, h, devicePixels: px,
          deltaP50: s.delta.p50, cbP50: s.callback.p50, cbMean: s.callback.mean,
          gpuP50: s.gpu?.p50 ?? null,
        });
        log(`[${MODE} dpr=${DPR}] fill ${w}x${h} (${(px / 1e6).toFixed(2)} Mpx): `
          + `delta p50=${s.delta.p50.toFixed(2)} cb p50=${s.callback.p50.toFixed(2)} `
          + `gpu=${s.gpu ? s.gpu.p50.toFixed(2) : "n/a"}`);
      }
      await page.setViewportSize(VIEWPORT);
      await mode.rest(page);
    }
    await metrics.close();
  } finally {
    await mkdir(OUT, { recursive: true }).catch(() => {});
    const name = `${MODE}-dpr${DPR}${COUNT ? "-count" : ""}${FILL ? "-fill" : ""}.json`;
    await writeFile(`${OUT}/${name}`, JSON.stringify(result, null, 2));
    log(`wrote ${OUT}/${name}`);
    await browser.close();
  }
}

await main();
