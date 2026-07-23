#!/usr/bin/env node
// Deterministic carved-terrain visual gate. The page is served from source, and environment-lab
// loads the exact default manifest + relative range bundle used by production's
// loadKoreaTerrain() call. Every capture is rejected unless the real Korea heightfield is
// resident without loader errors.
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
const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
});

// Three renderer-space views: +X east, +Y altitude, -Z north. These numbers are part of the
// acceptance contract; change them only when the labelled terrain version changes.
const VIEWS = Object.freeze([
  Object.freeze({
    name: "valley-floor",
    position: Object.freeze([17_800, 390, -11_700]),
    target: Object.freeze([7_200, 300, 360]),
  }),
  Object.freeze({
    name: "ridge-crossing",
    position: Object.freeze([19_500, 980, -4_000]),
    target: Object.freeze([7_200, 275, 360]),
  }),
  Object.freeze({
    name: "high-oblique",
    position: Object.freeze([-34_000, 7_800, 34_000]),
    target: Object.freeze([-4_000, 180, 10_000]),
  }),
]);

function assertTerrain(diagnostics, label) {
  if (diagnostics?.terrainId !== "terrain.korea.central-front.v2"
    || diagnostics.residentChunks <= 0
    || diagnostics.errors !== 0) {
    throw new Error(`${label}: real Korea terrain is not healthy: `
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

    await page.goto(`${site.url}environment-lab/?terrain-look=1`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => window.__terrainLookReady || window.__terrainLookError,
      { timeout: 60_000 },
    );
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
      assertTerrain(diagnostics, view.name);
      const filePath = join(OUT_DIR, `${view.name}.png`);
      await page.screenshot({ path: filePath, type: "png" });
      const size = (await stat(filePath)).size;
      if (size < MIN_PNG_BYTES) {
        throw new Error(`${view.name}: PNG is only ${size} bytes (blank render?)`);
      }
      captures.push({ ...view, filePath, size, diagnostics });
      console.log(`ok  ${filePath} (${size} bytes)`);
    }

    if (pageErrors.length > 0) {
      throw new Error(`uncaught page errors:\n${pageErrors.join("\n")}`);
    }
    if (requestFailures.length > 0) {
      throw new Error(`failed requests:\n${requestFailures.join("\n")}`);
    }
    await writeFile(join(OUT_DIR, "views.json"),
      `${JSON.stringify({ viewport: [1440, 900], captures }, null, 2)}\n`);
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
