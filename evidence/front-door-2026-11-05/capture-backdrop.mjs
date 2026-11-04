import { createReadStream, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, "../../web/wwwroot");

function serve(root) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/_framework/blazor.webassembly.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end("globalThis.Blazor = { start: () => new Promise(() => {}) };");
      return;
    }
    const file = path.join(
      root,
      decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "index.html",
    );
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      statSync(file);
      res.writeHead(200, {
        "content-type": MIME[path.extname(file)] || "application/octet-stream",
      });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
}

async function hideBootFailure(page) {
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-launch");
    const boot = document.querySelector("#boot");
    if (boot) {
      boot.style.transition = "none";
      boot.classList.add("ready");
    }
    for (const sel of ["#shell-fallback", "#fatal"]) {
      const el = document.querySelector(sel);
      el?.classList.remove("visible");
      el?.setAttribute("hidden", "");
    }
  });
}

async function showPicker(page) {
  await hideBootFailure(page);
  await page.evaluate(() => {
    document.documentElement.classList.remove("run-paused");
    const ready = document.querySelector("#ready-screen");
    ready?.classList.add("visible");
    ready?.setAttribute("data-mode", "program");
    ready?.setAttribute("aria-hidden", "false");
    const selector = document.querySelector("#ready-selector");
    if (selector) selector.hidden = false;
    const start = document.querySelector("#ready-start");
    if (start) start.disabled = false;
    document.querySelector("#settings-screen")?.classList.remove("visible");
    document.querySelector("#controls-onboarding")?.setAttribute("hidden", "");
  });
}

async function mountBackdrop(page) {
  await page.evaluate(async () => {
    const mod = await import("./render/shell/ready_menu_backdrop.js");
    mod.mountReadyMenuBackdrop();
  });
}

await mkdir(OUT, { recursive: true });
const server = serve(ROOT);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;

const browser = await chromium.launch({ headless: true, channel: "chromium" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await showPicker(page);
  await mountBackdrop(page);
  await page.waitForFunction(() => {
    const c = document.querySelector("#ready-menu-backdrop");
    return c && !c.hidden && c.width > 0 && c.height > 0;
  });
  await page.waitForTimeout(200);

  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((t) => {
      if (t === "light") document.documentElement.setAttribute("data-theme", "light");
      else document.documentElement.removeAttribute("data-theme");
    }, theme);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: path.join(OUT, `backdrop-${theme}.png`),
      fullPage: false,
    });
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
