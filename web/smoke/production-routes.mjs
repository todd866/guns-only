import assert from "node:assert/strict";

/**
 * The production standalone surfaces, in one place.
 *
 * Two consumers share this table and must not drift apart: `remote-route-smoke.mjs` asserts each
 * route is healthy, and `prewarm-origin.mjs` pulls each route's asset graph so the edge is warm
 * before anyone -- a smoke run or a real visitor -- pays for a cold deployment.
 *
 * `isReady` is evaluated inside the page, so it must be self-contained and serialisable.
 */
export const PRODUCTION_ROUTES = Object.freeze([
  Object.freeze({
    id: "f22",
    path: "/",
    search: "?audioQa=silent",
    isReady: () => document.querySelector("#boot")?.classList.contains("ready") === true,
    verify: async (page) => {
      const fatal = await page.evaluate(() =>
        document.querySelector("#fatal")?.classList.contains("visible") === true);
      assert.equal(fatal, false, "F-22 remote route showed #fatal");
    },
  }),
  Object.freeze({
    id: "rapier-intercept",
    path: "/",
    search: "?program=rapier-intercept&server=off&audioQa=silent",
    isReady: () => document.querySelector("#boot")?.classList.contains("ready") === true,
    verify: async (page) => {
      const fatal = await page.evaluate(() =>
        document.querySelector("#fatal")?.classList.contains("visible") === true);
      assert.equal(fatal, false, "Rapier remote route showed #fatal");
    },
  }),
  Object.freeze({
    id: "cobra-lab",
    path: "/cobra-lab/index.html",
    search: "?audioQa=silent",
    isReady: () => document.querySelector("#status")?.dataset.ready === "true",
    verify: async (page) => {
      const status = await page.evaluate(() =>
        document.querySelector("#status span")?.textContent ?? "");
      assert.match(status, /HOLD THE BRIDGE|AH-1G ONLINE/i);
    },
  }),
  Object.freeze({
    id: "weekend-ride",
    path: "/weekend-ride/",
    search: "?audioQa=silent",
    isReady: () => document.querySelector("#status")?.dataset.ready === "true",
    verify: async (page) => {
      const status = await page.evaluate(() =>
        document.querySelector("#status span")?.textContent ?? "");
      assert.match(status, /YZF-R1 ACTIVE/i);
    },
  }),
]);

export const SWIFTSHADER_LAUNCH_ARGS = Object.freeze([
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
]);

export function routeUrl(route, origin) {
  const target = new URL(route.path, origin);
  target.search = route.search;
  return target.href;
}
