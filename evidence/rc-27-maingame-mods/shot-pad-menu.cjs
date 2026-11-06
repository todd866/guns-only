// Pad-menu QA on the real published shell: synthetic standard-mapping pads
// drive the picker (highlight appears, d-pad moves it) and a second pad's
// Start opens the split-screen 2P toy fight. Headless Chromium; everything
// closed in finally.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");

const root = path.resolve(process.env.SHELL_ROOT || "/tmp/guns-only-web-rc27/wwwroot");
const out = __dirname;
const mime = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
  ".json": "application/json", ".html": "text/html", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
  ".dat": "application/octet-stream", ".glb": "model/gltf-binary",
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
    await page.addInitScript(() => {
      const pad = (index, id) => ({
        connected: true, index, id, mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
        timestamp: 0,
      });
      window.__pads = [];
      window.__makePad = pad;
      navigator.getGamepads = () => window.__pads;
    });
    await page.goto(`${base}/`);
    await page.waitForFunction(() => document.querySelector("#ready-start")?.disabled === false, null, { timeout: 90000 });
    console.log("shell ready");

    // One pad appears: the picker grows a gold pad-focus highlight.
    await page.evaluate(() => { window.__pads = [window.__makePad(0, "8BitDo Ultimate 2")]; });
    await page.waitForFunction(() => document.querySelector("#ready-screen .pad-focus") != null, null, { timeout: 5000 });
    const first = await page.evaluate(() => document.querySelector("#ready-screen .pad-focus")?.id
      || document.querySelector("#ready-screen .pad-focus")?.textContent?.trim());
    await page.screenshot({ path: path.join(out, "picker-pad-focus.png") });

    // D-pad down: the highlight steps to a neighbour.
    await page.evaluate(() => { window.__pads[0].buttons[13] = { value: 1, pressed: true }; });
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__pads[0].buttons[13] = { value: 0, pressed: false }; });
    await page.waitForTimeout(100);
    const second = await page.evaluate(() => document.querySelector("#ready-screen .pad-focus")?.id
      || document.querySelector("#ready-screen .pad-focus")?.textContent?.trim());
    assert.notEqual(second, first, "d-pad must move the highlight");
    console.log("highlight moved:", first, "→", second);

    // A second pad's Start opens the 2P toy fight and asks for the join.
    await page.evaluate(() => {
      window.__pads = [window.__pads[0], window.__makePad(1, "8BitDo SN30 Pro")];
      window.__pads[1].buttons[9] = { value: 1, pressed: true };
    });
    await page.waitForFunction(() => {
      const toy = document.querySelector(".toy-fight");
      return toy != null && toy.hidden === false;
    }, null, { timeout: 5000 });
    await page.evaluate(() => { window.__pads[1].buttons[9] = { value: 0, pressed: false }; });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, "second-pad-start-2p.png") });
    console.log(JSON.stringify({ errors }, null, 2));
    assert.deepEqual(errors, []);
    console.log("PASS");
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
