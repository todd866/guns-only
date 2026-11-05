import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const playwrightUrl = await (async () => {
  for (const candidate of [
    new URL("../../../node_modules/playwright/index.mjs", import.meta.url),
    new URL("../../../web/smoke/node_modules/playwright/index.mjs", import.meta.url),
    new URL("file:///Users/iantodd/Projects/guns-only/web/smoke/node_modules/playwright/index.mjs"),
  ]) {
    try {
      await readFile(candidate);
      return candidate.href;
    } catch { /* try next */ }
  }
  return "playwright";
})();
const { chromium } = await import(playwrightUrl);

import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";
import {
  DIRECTOR_STATE_STORAGE,
} from "../../web/wwwroot/render/progression/difficulty_ramp_persist.js";
import {
  F22_FIRST_MERGE_MISSION,
} from "../../web/wwwroot/render/shell/front_door.js";
import { f22PersonalBestKey } from "../../web/wwwroot/render/debrief/f22_result_instrument.js";
import { LOGBOOK_KEY } from "../../web/wwwroot/render/progression/pilot_logbook.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const wwwroot = join(repoRoot, "web/wwwroot");
const outDir = __dirname;

const VARIANTS = [
  { id: "a", label: "A · Hero card + RC pill" },
  { id: "b", label: "B · Hero banner + row under" },
  { id: "c", label: "C · Single hero + folded picker" },
];
const SCHEMES = ["dark", "light"];

const FIXTURE_BLOB = "v3|2|1|1|0|-|0|3|0|0.0|0|0|0|0|0|0|1|0|0|0|1";
const FIXTURE_PB = "1350";
const FIXTURE_LOGBOOK = JSON.stringify({
  version: 1,
  attempts: [{
    id: "fixture-front-door",
    activity: "Guns Only",
    kind: "sortie",
    exercise: "",
    startedAt: 1,
    endedAt: 2,
    durationSeconds: 134,
    outcome: "Victory",
    rung: 2,
    opponent: "Competent",
    assist: "manual",
    combat: "complete",
    recovery: "recovered",
    rounds: 480,
    hits: 18,
    kills: 2,
    recovered: true,
  }],
});

await mkdir(outDir, { recursive: true });

const site = await serveStatic(wwwroot);
const browser = await chromium.launch({ headless: true, channel: "chromium" });

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  await context.addInitScript(({ blob, pb, pbKey, logbookKey, logbook }) => {
    try {
      localStorage.setItem("guns-only.fight-director.v2", blob);
      localStorage.setItem(pbKey, pb);
      localStorage.setItem(logbookKey, logbook);
    } catch { /* private mode */ }
  }, {
    blob: FIXTURE_BLOB,
    pb: FIXTURE_PB,
    pbKey: f22PersonalBestKey({ mission_definition_id: F22_FIRST_MERGE_MISSION }),
    logbookKey: LOGBOOK_KEY,
    logbook: FIXTURE_LOGBOOK,
  });

  await context.route("**/*", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/render/") && !path.endsWith("/app.js")) return route.continue();
    if (/\.m?js(\?|$)/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "export {};",
      });
    }
    return route.continue();
  });

  const page = await context.newPage();

  for (const variant of VARIANTS) {
    for (const scheme of SCHEMES) {
      const url = `${site.url}?frontDoor=${variant.id}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });

      await page.evaluate(async ({ variantId, schemeName }) => {
        const { applyFrontDoor, syncFrontDoor } = await import("./render/shell/front_door.js");
        const html = document.documentElement;
        html.className = "run-paused";
        html.removeAttribute("data-launch");
        if (schemeName === "light") html.setAttribute("data-theme", "light");
        else html.removeAttribute("data-theme");
        applyFrontDoor(html, { href: `?frontDoor=${variantId}` });

        const boot = document.getElementById("boot");
        if (boot) {
          boot.classList.add("ready");
          boot.style.display = "none";
        }

        const readyScreen = document.getElementById("ready-screen");
        readyScreen?.classList.add("visible");
        readyScreen?.setAttribute("aria-hidden", "false");
        readyScreen.dataset.mode = "program";
        readyScreen.inert = false;

        const selector = document.getElementById("ready-selector");
        if (selector) selector.hidden = false;

        const start = document.getElementById("ready-start");
        if (start) {
          start.disabled = false;
          start.querySelector(".shell-action-label").textContent = "Fly";
        }

        document.getElementById("settings-screen")?.classList.remove("visible");
        syncFrontDoor(document, { href: `?frontDoor=${variantId}` }, localStorage);
      }, { variantId: variant.id, schemeName: scheme });

      await page.addStyleTag({
        content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
      });
      await page.evaluate(async () => {
        await document.fonts?.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });

      await page.screenshot({
        path: join(outDir, `${variant.id}-${scheme}.png`),
      });
    }
  }

  const masterHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #070a0f;
    color: #eef3f8;
    font: 600 14px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    padding: 20px;
    width: 2640px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .variant {
    background: #0d1219;
    border: 1px solid #25303d;
    border-radius: 6px;
    padding: 12px;
  }
  .variant h2 {
    font-size: 16px;
    letter-spacing: .08em;
    color: #f4cf83;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
  }
  .pair { display: flex; flex-direction: column; gap: 8px; }
  .cell {
    background: #141b24;
    border: 1px solid #2c3949;
    border-radius: 4px;
    overflow: hidden;
  }
  .cell-label {
    padding: 5px 8px;
    font-size: 11px;
    letter-spacing: .08em;
    color: #9fb0c4;
    border-bottom: 1px solid #2c3949;
    display: flex;
    justify-content: space-between;
  }
  .cell img { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
  <div class="grid">
    ${VARIANTS.map((variant) => `
    <section class="variant">
      <h2><span>${variant.label}</span><span>?frontDoor=${variant.id}</span></h2>
      <div class="pair">
        ${SCHEMES.map((scheme) => `
        <div class="cell">
          <div class="cell-label"><span>${scheme.toUpperCase()}</span><span>1280×720</span></div>
          <img src="./${variant.id}-${scheme}.png" alt="">
        </div>`).join("")}
      </div>
    </section>`).join("")}
  </div>
</body>
</html>`;
  const masterHtmlPath = join(outDir, "_compose_sheet.html");
  await writeFile(masterHtmlPath, masterHtml);

  const sheetServer = await serveStatic(outDir);
  try {
    const composePage = await browser.newPage({ viewport: { width: 2640, height: 2400 }, deviceScaleFactor: 1 });
    await composePage.goto(`${sheetServer.url}_compose_sheet.html`, { waitUntil: "networkidle" });
    await composePage.screenshot({ path: join(outDir, "sheet.png"), fullPage: true });
    await composePage.close();
  } finally {
    await sheetServer.close();
    await rm(masterHtmlPath, { force: true });
  }
} finally {
  await browser.close();
  await site.close();
}
