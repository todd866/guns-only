import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { chromium } from "playwright";

// Boots the PUBLISHED web app (its wwwroot passed via SMOKE_WWWROOT) in headless Chromium and
// requires it to reach a running flight kernel. Blazor loads the WASM sim, then app.js constructs
// the Three.js FlightView; boot() forwards any failure to showFatal(), which reveals the
// "#fatal" modal. The Node --test / dotnet suites never execute app.js's render path, so a missing
// symbol (e.g. the createOceanGeometry deletion in Build 56) passed every gate yet broke boot.
// This test closes that hole.

const WWWROOT = process.env.SMOKE_WWWROOT;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveStatic(root) {
  const rootNormal = normalize(root);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const filePath = normalize(join(rootNormal, pathname));
      if (filePath !== rootNormal && !filePath.startsWith(rootNormal)) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(filePath).catch(() => null);
      if (!info || !info.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(await readFile(filePath));
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("the published web app boots to a running flight kernel (no fatal render error)", async () => {
  assert.ok(WWWROOT, "SMOKE_WWWROOT must point at the published wwwroot");

  const site = await serveStatic(WWWROOT);
  // Software WebGL (SwiftShader) so the Three.js renderer initialises in headless CI.
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));

    await page.goto(site.url, { waitUntil: "load", timeout: 60000 });

    // #boot gains the "ready" class when boot settles — on success (boot()) AND on a fatal error
    // (showFatal()). Waiting for it makes the assertion below deterministic instead of timing-based.
    await page.waitForFunction(
      () => document.querySelector("#boot")?.classList.contains("ready") === true,
      { timeout: 45000 },
    );

    const fatalVisible = await page.evaluate(
      () => document.querySelector("#fatal")?.classList.contains("visible") === true,
    );
    const fatalMessage = await page.evaluate(
      () => document.querySelector("#fatal-message")?.textContent ?? "",
    );

    assert.equal(
      fatalVisible,
      false,
      `the app booted into FLIGHT KERNEL OFFLINE:\n${fatalMessage.slice(0, 800)}`,
    );
    assert.deepEqual(
      pageErrors,
      [],
      `uncaught page errors during boot:\n${pageErrors.join("\n")}`,
    );
  } finally {
    await browser.close();
    await site.close();
  }
});
