import assert from "node:assert/strict";
import { createReadStream, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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

await mkdir(OUT, { recursive: true });
const server = serve(ROOT);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;

const browser = await chromium.launch({ headless: true, channel: "chromium" });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  // Settle the boot cover (simulating WASM firstFrame without touching #ready-screen or #ready-start).
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

  const verification = await page.evaluate(async () => {
    const ready = document.querySelector("#ready-screen");
    const selectedButton = document.querySelector(
      '#ready-screen .sortie-option[data-selected="true"] .sortie-choice',
    );
    const start = document.querySelector("#ready-start");
    const startStyle = start ? getComputedStyle(start, "::after") : null;
    const hint = document.querySelector("#ready-hint");

    // Measure .f22-value and .cvf-value with their longest real values.
    const f22Score = document.querySelector("#f22-score");
    const f22Opponent = document.querySelector("#f22-opponent");
    const f22Result = document.querySelector("#f22-result");
    if (f22Score) f22Score.textContent = "12500 · W10 ×5.5 · 0-hit +250 · land +150";
    if (f22Opponent) f22Opponent.textContent = "Competent ×2 → Veteran ×2";
    const prevF22Hidden = f22Result?.hidden ?? true;
    const prevF22Attr = ready?.getAttribute("data-f22-result");
    const prevMode = ready?.getAttribute("data-mode");
    if (f22Result) f22Result.hidden = false;
    ready?.setAttribute("data-f22-result", "final");
    ready?.setAttribute("data-mode", "debrief");
    const f22ScoreBox = f22Score
      ? {
        scrollWidth: f22Score.scrollWidth,
        clientWidth: f22Score.clientWidth,
        textOverflow: getComputedStyle(f22Score).textOverflow,
      }
      : null;
    const f22OpponentBox = f22Opponent
      ? {
        scrollWidth: f22Opponent.scrollWidth,
        clientWidth: f22Opponent.clientWidth,
        textOverflow: getComputedStyle(f22Opponent).textOverflow,
      }
      : null;
    if (f22Result) f22Result.hidden = prevF22Hidden;
    if (prevF22Attr == null) ready?.removeAttribute("data-f22-result");
    else ready?.setAttribute("data-f22-result", prevF22Attr);
    if (prevMode) ready?.setAttribute("data-mode", prevMode);

    // Measure .cvf-value with the real longest CASEVAC values.
    const cvfHost = document.createElement("aside");
    cvfHost.setAttribute("data-casevac-flight-facts", "");
    cvfHost.innerHTML = `
      <style>
        [data-casevac-flight-facts] {
          position: fixed;
          left: 16px;
          bottom: 18px;
          width: min(390px, calc(100vw - 32px));
          box-sizing: border-box;
          padding: 10px 12px 9px;
          font: 700 10px/1.25 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          letter-spacing: .055em;
        }
        [data-casevac-flight-facts] * { box-sizing: border-box; }
        .cvf-primary {
          display: grid;
          grid-template-columns: repeat(4, minmax(max-content, 1fr));
          gap: 8px;
        }
        .cvf-label { font-size: 7px; letter-spacing: .16em; }
        .cvf-value {
          display: block;
          margin-top: 2px;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
      </style>
      <div class="cvf-primary">
        <div><span class="cvf-label">AGL</span><output class="cvf-value">999 M</output></div>
        <div><span class="cvf-label">SPEED</span><output class="cvf-value">120.0 M/S</output></div>
        <div><span class="cvf-label">POWER</span><output class="cvf-value">-100%</output></div>
        <div><span class="cvf-label">RESERVE</span><output class="cvf-value">-99.9 MIN</output></div>
      </div>
    `;
    document.body.appendChild(cvfHost);
    const cvfBoxes = [...cvfHost.querySelectorAll(".cvf-value")].map((el) => ({
      text: el.textContent,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      textOverflow: getComputedStyle(el).textOverflow,
    }));
    cvfHost.remove();

    return {
      firstRunValleyKey: localStorage.getItem("guns-only.first-run-valley"),
      readyVisible: ready?.classList.contains("visible") === true,
      readyMode: ready?.dataset.mode ?? null,
      selectedNode: selectedButton?.dataset.programNode ?? null,
      selectedAircraft: selectedButton?.querySelector("strong")?.textContent?.trim() ?? null,
      startDisabled: start?.disabled ?? null,
      startLabel: start?.querySelector(".shell-action-label")?.textContent?.trim() ?? null,
      startKeyCap: start?.querySelector(".shell-action-key .keycap")?.textContent?.trim() ?? null,
      startAfterContent: startStyle?.content ?? null,
      hintAriaLabel: hint?.getAttribute("aria-label") ?? null,
      hintKeyCap: hint?.querySelector(".keycap")?.textContent?.trim() ?? null,
      f22ScoreBox,
      f22OpponentBox,
      cvfBoxes,
    };
  });

  assert.equal(verification.firstRunValleyKey, null, "first-run-valley storage key must be unset on fresh boot");
  assert.equal(verification.readyVisible, true, "#ready-screen must be visible");
  assert.equal(verification.readyMode, "program", "#ready-screen must land on data-mode=program");
  assert.equal(verification.selectedNode, "first-merge", "first-merge must be selected");
  assert.equal(verification.selectedAircraft, "F-22A", "F-22A card must be selected");
  assert.equal(verification.startDisabled, false, "Fly button must be enabled");
  assert.equal(verification.startLabel, "Fly Guns Only", "Fly button must show Fly Guns Only");
  assert.equal(verification.startKeyCap, "return", "Fly button must show the return keycap");
  assert.doesNotMatch(String(verification.startAfterContent), /Loading/i, "no Loading overlay on Fly");
  assert.equal(verification.hintKeyCap, "return", "ready-hint must render return keycap");
  assert.equal(verification.f22ScoreBox.textOverflow, "clip");
  assert.ok(
    verification.f22ScoreBox.scrollWidth <= verification.f22ScoreBox.clientWidth,
    `f22-score overflowed: ${verification.f22ScoreBox.scrollWidth} > ${verification.f22ScoreBox.clientWidth}`,
  );
  assert.ok(
    verification.f22OpponentBox.scrollWidth <= verification.f22OpponentBox.clientWidth,
    `f22-opponent overflowed: ${verification.f22OpponentBox.scrollWidth} > ${verification.f22OpponentBox.clientWidth}`,
  );
  for (const box of verification.cvfBoxes) {
    assert.equal(box.textOverflow, "clip");
    assert.ok(
      box.scrollWidth <= box.clientWidth,
      `cvf-value (${box.text}) overflowed: ${box.scrollWidth} > ${box.clientWidth}`,
    );
  }

  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((t) => {
      if (t === "light") document.documentElement.setAttribute("data-theme", "light");
      else document.documentElement.removeAttribute("data-theme");
    }, theme);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: path.join(OUT, `picker-${theme}.png`),
      fullPage: false,
    });
  }

  await writeFile(
    path.join(OUT, "manifest.json"),
    `${JSON.stringify({ url: base, verification }, null, 2)}\n`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
