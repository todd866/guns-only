import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  PRODUCTION_ROUTES,
  SWIFTSHADER_LAUNCH_ARGS,
  routeUrl,
} from "./production-routes.mjs";

/**
 * Warm a freshly promoted origin's edge cache by loading every production route once.
 *
 * WHY THIS EXISTS. Build 265 promoted cleanly and then failed post-promotion verification:
 * `cobra-lab` did not reach `#status[data-ready=true]` inside 90 s, and production correctly
 * auto-rolled back. The route was not broken -- served locally from the exact deployed tree it was
 * ready in 1.9 s. It was cold. Measured against production on 2026-08-06, the same route on a
 * 20-hour-old deployment (so the popular shell assets were already hot):
 *
 *     load 1:  58 requests, 23 HIT, 35 MISS,  ready in 5404 ms
 *     load 2:  58 requests, 58 HIT,  0 MISS,  ready in 2530 ms
 *     load 3:  58 requests, 58 HIT,  0 MISS,  ready in 2567 ms
 *
 * A 2.1x penalty from misses alone, on a deployment that was mostly warm already. On a brand-new
 * deployment every one of those 58 is a miss, and the 23 that were hits include the largest
 * objects (three.module.js at 1.27 MB, hud.js at 234 KB). The owner's own cold session on newly
 * deployed 264 took 43 s before app.js executed and 99.6 s to first frame, against 3 s warmed.
 *
 * So this is NOT a raised ceiling hiding a slow route. Readiness assertions keep their existing
 * 90 s budget and their existing strictness. This pass moves the cold-cache cost somewhere it
 * cannot produce a false negative, and -- see bin/deploy-web -- pays it before real visitors do.
 *
 * It never throws. A route that will not warm is not evidence of anything; the assertion pass
 * that follows is what decides whether production is healthy.
 */

// A warm pass is allowed to be slow, because being slow is the entire thing it is absorbing. The
// number is the owner's measured 99.6 s cold first-frame on a fresh deployment, with headroom for
// a route whose graph is larger than the one that was measured. Nothing is asserted against it.
export const WARM_BUDGET_MS = 180_000;

export async function prewarmOrigin({
  origin,
  browser,
  routes = PRODUCTION_ROUTES,
  budgetMs = WARM_BUDGET_MS,
  log = console.log,
}) {
  const results = [];
  for (const route of routes) {
    const href = routeUrl(route, origin);
    const page = await browser.newPage();
    let requests = 0;
    let misses = 0;
    page.on("response", (response) => {
      requests += 1;
      if (response.headers()["x-vercel-cache"] === "MISS") misses += 1;
    });
    const started = Date.now();
    const result = { id: route.id, href, requests: 0, misses: 0, readyMs: null, warmed: false };
    try {
      await page.goto(href, { waitUntil: "load", timeout: budgetMs });
      await page.waitForFunction(route.isReady, undefined, { polling: 200, timeout: budgetMs });
      result.readyMs = Date.now() - started;
      result.warmed = true;
    } catch (error) {
      result.error = error?.message?.split("\n")[0] ?? String(error);
    } finally {
      result.requests = requests;
      result.misses = misses;
      await page.close().catch(() => {});
    }
    results.push(result);
    log(`prewarm-origin: ${route.id} ${result.warmed ? "warm" : "NOT warm"}`
      + ` in ${result.readyMs ?? Date.now() - started} ms`
      + ` (${result.requests} requests, ${result.misses} edge misses)`
      + (result.error ? ` -- ${result.error}` : ""));
  }
  return results;
}

export async function prewarmOriginStandalone(origin, log = console.log) {
  // Routes run one at a time on purpose. Four concurrent SwiftShader Chromiums is what starved
  // the gate into false timeouts at load 70-85 on 2026-07-29.
  const browser = await chromium.launch({ headless: true, args: [...SWIFTSHADER_LAUNCH_ARGS] });
  try {
    return await prewarmOrigin({ origin, browser, log });
  } finally {
    await browser.close();
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const originArg = process.argv[2];
  if (!originArg) {
    console.error("usage: node web/smoke/prewarm-origin.mjs <https-origin>");
    process.exit(2);
  }
  const origin = new URL(originArg);
  if (origin.protocol !== "https:") {
    console.error("prewarm-origin: target must use HTTPS");
    process.exit(2);
  }
  const results = await prewarmOriginStandalone(origin.origin);
  const cold = results.filter((result) => !result.warmed).map((result) => result.id);
  const misses = results.reduce((total, result) => total + result.misses, 0);
  console.log(`prewarm-origin: warmed ${results.length - cold.length}/${results.length} routes`
    + ` at ${origin.origin}, ${misses} edge misses absorbed`
    + (cold.length > 0 ? `; not warmed: ${cold.join(", ")}` : ""));
  // Deliberately exit 0 even when a route did not warm. Warming is not a verification step; the
  // assertion pass that follows decides whether production is healthy.
}
