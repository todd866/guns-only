#!/usr/bin/env node
// Deterministic Ukraine soft-world visual gate. The page is served from source, and
// environment-lab loads the exact jet-range atlas + relative range bundles used by production.
// Every capture is rejected unless the Ukraine terrain is resident without loader errors.
//
// Usage:
//   node tools/terrain-look/shot.mjs
//   TERRAIN_LOOK_DIR=/tmp/terrain-look node tools/terrain-look/shot.mjs

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";

const require = createRequire(new URL("../../web/smoke/package.json", import.meta.url));
const { chromium } = require("playwright");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WWWROOT = resolve(SCRIPT_DIR, "../../web/wwwroot");
const OUT_DIR = resolve(process.env.TERRAIN_LOOK_DIR ?? join(SCRIPT_DIR, "shots"));
const MIN_PNG_BYTES = 50 * 1024;
const EXPECTED_TERRAIN_ID = "terrain.ukraine.rapier-range.atlas.v1";
const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
});

// Three renderer-space views: +X east, +Y altitude, -Z north. They cover the low-level meadow
// layer, the middle-distance shelterbelt grammar, and the country-scale atmospheric read.
const VIEWS = Object.freeze([
  Object.freeze({
    name: "steppe-low",
    position: Object.freeze([-2_400, 240, 3_200]),
    target: Object.freeze([-6_500, 80, -1_200]),
  }),
  Object.freeze({
    name: "corridor-mid",
    position: Object.freeze([-12_000, 1_800, 18_000]),
    target: Object.freeze([-40_000, 180, -8_000]),
  }),
  Object.freeze({
    name: "high-oblique",
    position: Object.freeze([-34_000, 7_800, 34_000]),
    target: Object.freeze([-4_000, 180, 10_000]),
  }),
  Object.freeze({
    // The owner's quilt complaint aspect: zoom-apex altitude looking steeply down-range,
    // where hero cells read as naked rectangles over the regional base (2026-07-29).
    name: "zoom-apex",
    position: Object.freeze([-8_000, 15_000, 20_000]),
    target: Object.freeze([-30_000, 0, -20_000]),
  }),
  Object.freeze({
    // The owner's actual flight condition: 72,000 ft (21,946 m) inverted over the theatre.
    // Environment-lab's orbit clamp used to pull "high" views down to ~5 km AGL, so this
    // aspect was never truly captured until the terrain-look maxDistance override.
    name: "combat-apex-72k",
    position: Object.freeze([-8_000, 21_946, 20_000]),
    target: Object.freeze([-30_000, 0, -20_000]),
  }),
]);

function assertTerrain(diagnostics, label, { requireLocalScenery = false } = {}) {
  if (diagnostics?.terrainId !== EXPECTED_TERRAIN_ID
    || diagnostics.residentChunks <= 0
    || diagnostics.localResidentChunks <= 0
    || requireLocalScenery && diagnostics.localSceneryChunks <= 0
    || diagnostics.ambientSceneryEnabled !== true
    || diagnostics.errors !== 0) {
    throw new Error(`${label}: Ukraine jet-range terrain is not healthy: `
      + JSON.stringify(diagnostics));
  }
}

async function staticSite() {
  try {
    const site = await serveStatic(WWWROOT);
    return { ...site, install: async () => {} };
  } catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error;
    // Managed test sandboxes may deny loopback listeners. Playwright routing preserves the same
    // HTTP URLs, module resolution, fetch semantics, and Range contract without weakening the
    // normal runner, which still uses the repository's shared static server above.
    const origin = "http://terrain-look.invalid";
    return {
      url: `${origin}/`,
      close: async () => {},
      async install(page) {
        await page.route(`${origin}/**`, async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          let pathname = decodeURIComponent(url.pathname);
          if (pathname.endsWith("/")) pathname += "index.html";
          const filePath = normalize(join(WWWROOT, pathname));
          if (filePath !== WWWROOT && !filePath.startsWith(`${WWWROOT}/`)) {
            await route.fulfill({ status: 403, body: "forbidden" });
            return;
          }
          const body = await readFile(filePath).catch(() => null);
          if (!body) {
            await route.fulfill({ status: 404, body: "not found" });
            return;
          }
          const headers = {
            "content-type": MIME[extname(filePath).toLowerCase()]
              ?? "application/octet-stream",
            "cache-control": "no-store",
          };
          const range = request.headers().range?.match(/^bytes=(\d+)-(\d+)$/);
          if (range) {
            const start = Number(range[1]);
            const end = Number(range[2]);
            const slice = body.subarray(start, end + 1);
            await route.fulfill({
              status: 206,
              headers: {
                ...headers,
                "accept-ranges": "bytes",
                "content-range": `bytes ${start}-${end}/${body.length}`,
                "content-length": String(slice.length),
              },
              body: slice,
            });
            return;
          }
          await route.fulfill({ status: 200, headers, body });
        });
      },
    };
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const site = await staticSite();
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  const requestFailures = [];
  const captures = [];

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    await site.install(page);
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
    page.on("requestfailed", (request) => requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`,
    ));

    await page.goto(`${site.url}environment-lab/?terrain-look=1&site=ukraine`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    try {
      await page.waitForFunction(
        () => window.__terrainLookReady || window.__terrainLookError,
        null,
        { timeout: 120_000 },
      );
    } catch (error) {
      const stalled = await page.evaluate(() => ({
        ready: window.__terrainLookReady ?? null,
        error: window.__terrainLookError ?? null,
        diagnostics: window.__terrainLookProbe?.() ?? null,
        documentReadyState: document.readyState,
        marker: document.documentElement.dataset.terrainLookReady ?? null,
      })).catch(() => null);
      throw new Error(
        `${error.message}; environment state=${JSON.stringify(stalled)}; `
        + `pageErrors=${JSON.stringify(pageErrors)}; `
        + `requestFailures=${JSON.stringify(requestFailures)}`,
        { cause: error },
      );
    }
    const initial = await page.evaluate(() => ({
      ready: window.__terrainLookReady,
      error: window.__terrainLookError,
    }));
    if (initial.error) throw new Error(`environment-lab: ${initial.error}`);
    assertTerrain(initial.ready, "initial load");

    for (const view of VIEWS) {
      const diagnostics = await page.evaluate(
        (nextView) => window.__terrainLookSetView(nextView),
        view,
      );
      assertTerrain(diagnostics, view.name, {
        requireLocalScenery: view.name === "steppe-low",
      });
      const filePath = join(OUT_DIR, `${view.name}.png`);
      await page.screenshot({ path: filePath, type: "png" });
      const size = (await stat(filePath)).size;
      if (size < MIN_PNG_BYTES) {
        throw new Error(`${view.name}: PNG is only ${size} bytes (blank render?)`);
      }
      // Look-gate provenance: never score governor-shed / wrong-tier frames as desktop Ukraine.
      const provenance = Object.freeze({
        qualityTier: diagnostics?.qualityTier ?? "desktop",
        governorLevel: Number(diagnostics?.governorLevel) || 0,
        softWorld: true,
        terrainId: diagnostics?.terrainId ?? EXPECTED_TERRAIN_ID,
      });
      captures.push({ ...view, filePath, size, diagnostics, provenance });
      console.log(`ok  ${filePath} (${size} bytes)`);
    }

    if (pageErrors.length > 0) {
      throw new Error(`uncaught page errors:\n${pageErrors.join("\n")}`);
    }
    if (requestFailures.length > 0) {
      throw new Error(`failed requests:\n${requestFailures.join("\n")}`);
    }
    await writeFile(join(OUT_DIR, "views.json"),
      `${JSON.stringify({
        viewport: [1440, 900],
        lookGate: { theatre: "ukraine", softWorld: true },
        captures,
      }, null, 2)}\n`);
  } finally {
    await browser.close();
    await site.close();
  }

  console.log(`\n${captures.length} deterministic terrain PNGs written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
