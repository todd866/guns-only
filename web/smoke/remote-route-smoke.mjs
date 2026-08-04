import assert from "node:assert/strict";
import { chromium } from "playwright";

/**
 * Post-promotion / preview route matrix. Complements remote-smoke.mjs, which always rewrites its
 * target to `/` and therefore only proves the default F-22 shell. This script proves each
 * production standalone surface can boot under ?audioQa=silent without inventing combat outcomes.
 */

const originArg = process.argv[2];
assert.ok(originArg, "usage: node web/smoke/remote-route-smoke.mjs <https-origin>");
const origin = new URL(originArg);
assert.equal(origin.protocol, "https:", "remote route smoke target must use HTTPS");

const routes = Object.freeze([
  {
    id: "f22",
    path: "/",
    search: "?audioQa=silent",
    assertReady: async (page) => {
      await page.waitForFunction(
        () => document.querySelector("#boot")?.classList.contains("ready") === true,
        undefined,
        { polling: 100, timeout: 90_000 },
      );
      const fatal = await page.evaluate(() =>
        document.querySelector("#fatal")?.classList.contains("visible") === true);
      assert.equal(fatal, false, "F-22 remote route showed #fatal");
    },
  },
  {
    id: "rapier-intercept",
    path: "/",
    search: "?program=rapier-intercept&server=off&audioQa=silent",
    assertReady: async (page) => {
      await page.waitForFunction(
        () => document.querySelector("#boot")?.classList.contains("ready") === true,
        undefined,
        { polling: 100, timeout: 90_000 },
      );
      const fatal = await page.evaluate(() =>
        document.querySelector("#fatal")?.classList.contains("visible") === true);
      assert.equal(fatal, false, "Rapier remote route showed #fatal");
    },
  },
  {
    id: "cobra-lab",
    path: "/cobra-lab/index.html",
    search: "?audioQa=silent",
    assertReady: async (page) => {
      await page.waitForFunction(
        () => document.querySelector("#status")?.dataset.ready === "true",
        undefined,
        { polling: 100, timeout: 90_000 },
      );
      const status = await page.evaluate(() =>
        document.querySelector("#status span")?.textContent ?? "");
      assert.match(status, /HOLD THE BRIDGE|AH-1G ONLINE/i);
    },
  },
  {
    id: "weekend-ride",
    path: "/weekend-ride/",
    search: "?audioQa=silent",
    assertReady: async (page) => {
      await page.waitForFunction(
        () => document.querySelector("#status")?.dataset.ready === "true",
        undefined,
        { polling: 100, timeout: 90_000 },
      );
      const status = await page.evaluate(() =>
        document.querySelector("#status span")?.textContent ?? "");
      assert.match(status, /YZF-R1 ACTIVE/i);
    },
  },
]);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  for (const route of routes) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
    const target = new URL(route.path, origin);
    target.search = route.search;
    const response = await page.goto(target.href, { waitUntil: "load", timeout: 90_000 });
    assert.ok(response?.ok(), `${route.id} returned HTTP ${response?.status() ?? "unknown"}`);
    await route.assertReady(page);
    assert.deepEqual(
      pageErrors,
      [],
      `${route.id} page errors:\n${pageErrors.join("\n")}`,
    );
    await page.close();
    console.log(`remote-route-smoke: verified ${route.id} at ${target.href}`);
  }
} finally {
  await browser.close();
}
