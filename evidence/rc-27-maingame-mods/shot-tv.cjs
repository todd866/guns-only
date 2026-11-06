// One-shot QA stills for rc-27: the TV launcher (light + dark, pad overlay via
// shot=full) and the main game picker with the pad-focus highlight. Headless
// Chromium per AGENTS.md; servers and browser closed in finally.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const root = path.resolve(__dirname, "../../web/wwwroot");
const out = __dirname;
const mime = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
  ".json": "application/json", ".html": "text/html", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
};

(async () => {
  let browser;
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/\/$/, "/index.html"));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Content-Length": stat.size });
      fs.createReadStream(file).pipe(res);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch({ headless: true, channel: "chromium", ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const theme of ["light", "dark"]) {
      await page.goto(`${base}/tv/?theme=${theme}&shot=full`);
      await page.waitForSelector("#games .tile");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, `tv-${theme}.png`) });
    }
    // The main game picker: static markup is usable before the 20 MB runtime.
    await page.goto(`${base}/?menu=1`);
    await page.waitForSelector("#ready-screen", { state: "attached" });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const button = document.querySelector("#ready-screen button:not([hidden])");
      button?.classList.add("pad-focus");
      button?.scrollIntoView({ block: "center" });
    });
    await page.screenshot({ path: path.join(out, "ready-pad-focus.png") });
    console.log(JSON.stringify({ errors }, null, 2));
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
