import assert from "node:assert/strict";
import { chromium } from "playwright";

import {
  PRODUCTION_ROUTES,
  SWIFTSHADER_LAUNCH_ARGS,
  routeUrl,
} from "./production-routes.mjs";
import { prewarmOrigin } from "./prewarm-origin.mjs";

/**
 * Post-promotion / preview route matrix. Complements remote-smoke.mjs, which always rewrites its
 * target to `/` and therefore only proves the default F-22 shell. This script proves every
 * promoted player entry—including the guided first run, root-shell programmes, and standalone
 * routes—can boot under ?audioQa=silent without inventing combat outcomes.
 *
 * The readiness budget below is deliberately UNCHANGED at 90 s. A route that cannot reach ready in
 * 90 s on a warm origin is a defect and must fail. `bin/deploy-web` warms the edge (see
 * prewarm-origin.mjs) before calling this, so the cold-cache cost that failed Build 265 is paid
 * outside the assertion. Pass --prewarm to do that warming here instead, when running this
 * script by hand against a deployment nobody has touched yet.
 */

const args = process.argv.slice(2);
const prewarm = args.includes("--prewarm");
const originArg = args.find((argument) => !argument.startsWith("--"));
assert.ok(originArg, "usage: node web/smoke/remote-route-smoke.mjs <https-origin> [--prewarm]");
const origin = new URL(originArg);
assert.equal(origin.protocol, "https:", "remote route smoke target must use HTTPS");

const READY_TIMEOUT_MS = 90_000;

const browser = await chromium.launch({
  headless: true,
  args: [...SWIFTSHADER_LAUNCH_ARGS],
});
try {
  if (prewarm) await prewarmOrigin({ origin: origin.origin, browser });
  for (const route of PRODUCTION_ROUTES) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
    let misses = 0;
    page.on("response", (response) => {
      if (response.headers()["x-vercel-cache"] === "MISS") misses += 1;
    });
    const href = routeUrl(route, origin);
    const started = Date.now();
    const response = await page.goto(href, { waitUntil: "load", timeout: READY_TIMEOUT_MS });
    assert.ok(response?.ok(), `${route.id} returned HTTP ${response?.status() ?? "unknown"}`);
    try {
      await page.waitForFunction(route.isReady, undefined,
        { polling: 100, timeout: READY_TIMEOUT_MS });
    } catch (error) {
      // Say which failure this is. Build 265 rolled back on a timeout that looked like a broken
      // route and was a cold edge; the miss count is the difference and costs nothing to report.
      error.message = `${route.id} did not reach ready within ${READY_TIMEOUT_MS} ms`
        + ` (${misses} edge cache misses during the attempt)\n${error.message}`;
      throw error;
    }
    await route.verify(page);
    assert.deepEqual(
      pageErrors,
      [],
      `${route.id} page errors:\n${pageErrors.join("\n")}`,
    );
    await page.close();
    console.log(`remote-route-smoke: verified ${route.id} at ${href}`
      + ` in ${Date.now() - started} ms (${misses} edge cache misses)`);
  }
} finally {
  await browser.close();
}
