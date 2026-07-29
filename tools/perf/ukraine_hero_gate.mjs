#!/usr/bin/env node
// Hardware-facing Ukraine low-level performance gate. Run this on each supported device class;
// it intentionally is not part of the software-rendered CI smoke suite.
//
//   node tools/perf/ukraine_hero_gate.mjs
//   GUNS_HERO_GATE_TIERS=mobile,balanced node tools/perf/ukraine_hero_gate.mjs
//   GUNS_HERO_GATE_HEADLESS=1 node tools/perf/ukraine_hero_gate.mjs
//   GUNS_HERO_GATE_BASE_URL=http://device-host:8080/ node tools/perf/ukraine_hero_gate.mjs

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";

const require = createRequire(new URL("../../web/smoke/package.json", import.meta.url));
const { chromium } = require("playwright");

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const wwwroot = resolve(
  process.env.GUNS_HERO_GATE_WWWROOT ?? resolve(scriptDirectory, "../../web/wwwroot"),
);
const supportedTiers = new Set(["mobile", "balanced", "desktop"]);
const expectedShadowMapSize = Object.freeze({
  mobile: 512,
  balanced: 1024,
  desktop: 2048,
});
const requestedTiers = (process.env.GUNS_HERO_GATE_TIERS ?? "mobile,balanced,desktop")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
for (const tier of requestedTiers) {
  if (!supportedTiers.has(tier)) throw new Error(`Unsupported quality tier: ${tier}`);
}

const requestedBaseUrl = process.env.GUNS_HERO_GATE_BASE_URL?.trim();
const site = requestedBaseUrl
  ? {
      url: `${requestedBaseUrl.replace(/\/+$/, "")}/`,
      close: async () => {},
    }
  : await serveStatic(wwwroot);
const browser = await chromium.launch({
  // The default is deliberately headed: Chromium's macOS headless shell can force SwiftShader,
  // which measures a software rasterizer rather than the supported device GPU this gate names.
  headless: process.env.GUNS_HERO_GATE_HEADLESS === "1",
});
const results = [];

try {
  for (const tier of requestedTiers) {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
    const query = new URLSearchParams({
      site: "ukraine",
      "terrain-look": "1",
      quality: tier,
      altitude: "90",
      clouds: "1",
      "terrain-position": "-4000,274.8,-3712",
      "terrain-target": "-4218,216.5,-4101",
    });
    await page.goto(`${site.url}environment-lab/?${query}`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => window.__terrainLookReady || window.__terrainLookError,
      null,
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => window.__environmentLabDiagnostics?.snapshot().performanceGate.state !== "warming",
      null,
      { timeout: 30_000 },
    );
    const snapshot = await page.evaluate(
      () => window.__environmentLabDiagnostics.snapshot(),
    );
    await page.close();
    if (pageErrors.length) {
      throw new Error(`${tier}: uncaught page errors:\n${pageErrors.join("\n")}`);
    }
    if (snapshot.performanceGate.pass !== true) {
      throw new Error(`${tier}: 60 fps gate failed: ${JSON.stringify(snapshot)}`);
    }
    const expectedShadowPass = tier === "desktop";
    const expectedAuthoredShadowDraws = expectedShadowPass ? 4 : 0;
    if (snapshot.shadows?.rendererEnabled !== expectedShadowPass
        || snapshot.shadows?.sunCastShadow !== expectedShadowPass
        || snapshot.shadows?.pcfSoft !== true
        || snapshot.shadows?.mapSize?.[0] !== expectedShadowMapSize[tier]
        || snapshot.shadows?.mapSize?.[1] !== expectedShadowMapSize[tier]
        || snapshot.shadows?.camera?.left !== -44
        || snapshot.shadows?.camera?.right !== 44
        || snapshot.shadows?.camera?.top !== 44
        || snapshot.shadows?.camera?.bottom !== -44
        || snapshot.shadows?.camera?.near !== 10
        || snapshot.shadows?.camera?.far !== 3600
        || snapshot.shadows?.bias !== -0.00018
        || snapshot.shadows?.normalBias !== 0.16
        || snapshot.terrain?.missionFeatures?.shadowDrawCalls
          !== expectedAuthoredShadowDraws) {
      throw new Error(`${tier}: shadow-path mismatch: ${JSON.stringify(snapshot.shadows)}`);
    }
    results.push({
      tier,
      renderer: snapshot.renderer,
      shadows: snapshot.shadows,
      frameStats: snapshot.frameStats,
      gate: snapshot.performanceGate,
    });
    console.log(`ok  ${tier}: ${snapshot.frameStats.fps.toFixed(1)} fps; `
      + `p95 ${snapshot.frameStats.p95Ms.toFixed(1)} ms; `
      + `p99 ${snapshot.frameStats.p99Ms.toFixed(1)} ms; `
      + `${(snapshot.frameStats.overBudgetFraction * 100).toFixed(1)}% late`);
  }
} finally {
  await browser.close();
  await site.close();
}

console.log(JSON.stringify({ results }, null, 2));
