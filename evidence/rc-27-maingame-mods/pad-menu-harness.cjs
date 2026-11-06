// Integration harness for render/input/shell_menu_pad.js in real headless
// Chromium: the real module graph (gamepad-menu, join, toy_session,
// flight_layout) served from web/wwwroot, a real DOM, synthetic pads, and a
// hand-stepped rAF. Verifies: highlight seeds and moves, A clicks, Start acts
// as Escape, and a second pad's Start opens the toy fight with the join
// request. No WASM runtime needed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../../web/wwwroot");
const mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css" };

(async () => {
  let browser;
  const harnessHtml = `<!doctype html><html><body>
      <div id="ready" class="visible" aria-hidden="false" data-mode="program" style="position:absolute;top:0;left:0">
        <button id="b1" style="display:block;width:120px;height:30px">Mission one</button>
        <button id="b2" style="display:block;width:120px;height:30px">Mission two</button>
      </div>
      <div id="settings" aria-hidden="true" style="display:none"><button id="s1">Done</button></div>
    </body></html>`;
  const server = http.createServer((req, res) => {
    if (new URL(req.url, "http://localhost").pathname === "/harness.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(harnessHtml);
      return;
    }
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
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on("pageerror", (e) => { console.error("pageerror", e); process.exitCode = 1; });
    await page.goto(`${base}/harness.html`);
    const result = await page.evaluate(async (origin) => {
      const mod = await import(`${origin}/render/input/shell_menu_pad.js`);
      const out = { clicks: [], escapes: 0, toyOpened: 0 };
      const ready = document.querySelector("#ready");
      const settings = document.querySelector("#settings");
      document.querySelector("#b2").addEventListener("click", () => out.clicks.push("b2"));
      const pad = (index, id) => ({
        connected: true, index, id, mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
      });
      let pads = [pad(0, "8BitDo Ultimate 2")];
      const toyRoot = document.createElement("section");
      toyRoot.hidden = true;
      const toySession = { phase: "fly", split: false, crafts: [], _prev: {}, p1Pad: null };
      const toyFight = {
        root: toyRoot,
        session: toySession,
        open() { out.toyOpened += 1; toyRoot.hidden = false; },
      };
      let frames = [];
      mod.installShellMenuPad({
        readyScreen: ready,
        settingsScreen: settings,
        toyFight,
        pressEscape() { out.escapes += 1; },
        pads: () => pads,
        raf: (fn) => frames.push(fn),
        doc: document,
      });
      let now = 0;
      const step = (ms = 50) => { now += ms; const fn = frames.shift(); fn && fn(now); };
      step(); // first frame: seed the highlight
      out.seeded = document.querySelector("#ready .pad-focus")?.id ?? null;
      // D-pad down moves to the second button.
      pads[0].buttons[13] = { value: 1, pressed: true };
      step(400);
      pads[0].buttons[13] = { value: 0, pressed: false };
      step(50);
      out.moved = document.querySelector("#ready .pad-focus")?.id ?? null;
      // A clicks the focused control.
      pads[0].buttons[0] = { value: 1, pressed: true };
      step(50);
      pads[0].buttons[0] = { value: 0, pressed: false };
      step(50);
      // P1 Start on the picker: nothing (A launches, Start reserved).
      pads[0].buttons[9] = { value: 1, pressed: true };
      step(50);
      pads[0].buttons[9] = { value: 0, pressed: false };
      step(50);
      out.escapesAfterP1Start = out.escapes;
      // Second pad's Start on the picker: opens the 2P toy fight, join requested.
      pads = [pads[0], pad(1, "8BitDo SN30 Pro")];
      pads[1].buttons[9] = { value: 1, pressed: true };
      step(50);
      out.wantJoin = toySession._wantJoin === true;
      pads[1].buttons[9] = { value: 0, pressed: false };
      // With the toy fight open the shell pad stands down: no highlight churn.
      step(50);
      out.standsDown = document.querySelector("#ready .pad-focus") == null;
      // Close the toy fight; in flight (no menus) Start means Escape (pause).
      toyRoot.hidden = true;
      ready.classList.remove("visible");
      step(50);
      pads[0].buttons[9] = { value: 1, pressed: true };
      step(50);
      pads[0].buttons[9] = { value: 0, pressed: false };
      out.escapesAfterFlightStart = out.escapes;
      return out;
    }, base);
    console.log(JSON.stringify(result, null, 2));
    assert.equal(result.seeded, "b1", "highlight seeds on the first control");
    assert.equal(result.moved, "b2", "d-pad down steps to the next control");
    assert.deepEqual(result.clicks, ["b2"], "A clicks the focused control");
    assert.equal(result.escapesAfterP1Start, 0, "P1 Start is reserved on the picker");
    assert.equal(result.toyOpened, 1, "second pad Start opens the 2P toy fight");
    assert.equal(result.wantJoin, true, "the join is requested for player two");
    assert.equal(result.standsDown, true, "shell pad stands down while the toy fight is open");
    assert.equal(result.escapesAfterFlightStart, 1, "in flight Start acts as Escape (pause)");
    console.log("PASS");
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
