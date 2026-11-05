import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const playwrightUrl = await (async () => {
  for (const candidate of [
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
import { serveStatic } from "../../../web/wwwroot/render/hud/tests/harness/static_server.mjs";
import { applyShellTheme } from "../../../web/wwwroot/render/shell/shell_theme.js";
import { paintMissionStrip } from "../../../web/wwwroot/render/shell/mission_strip.js";
import {
  f22ResultInstrument,
  paintF22ResultInstrument,
} from "../../../web/wwwroot/render/debrief/f22_result_instrument.js";
import {
  CONTROL_BINDINGS,
  DEFAULT_PLAYER_SETTINGS,
  controlCodeLabel,
} from "../../../web/wwwroot/render/settings/player_settings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const wwwroot = join(repoRoot, "web/wwwroot");
const outDir = __dirname;

const VARIANTS = [
  { id: "glass", label: "GLASS · Brushed MFD + Cyan HUD Rule" },
  { id: "canopy", label: "CANOPY · Gold/Emerald Tint + Backlit Keycaps" },
  { id: "ink", label: "INK · Warm Paper & Vermilion Editorial" },
  { id: "bezel", label: "BEZEL · Machined Cluster + Dial Reticles" },
];

const SCREENS = [
  { id: "picker", label: "Picker (Ready)" },
  { id: "pause", label: "Pause" },
  { id: "settings", label: "Settings" },
  { id: "debrief", label: "Debrief (F-22 Result)" },
];

const SCHEMES = ["dark", "light"];

const debriefSnapshot = {
  ...JSON.parse(
    await readFile(
      join(wwwroot, "render/debrief/tests/fixtures/f22_recovered_victory.json"),
      "utf8",
    ),
  ),
  player_terminal_state: "FLYING",
  escalating_waves: true,
  engagements_won: 4,
  wave_reached: 4,
  wave_score_multiplier: 2,
  combat_score: 950,
  opponent_hits: 0,
  sortie_hits: 18,
  sortie_rounds_fired: 480,
};

const debriefModel = f22ResultInstrument(debriefSnapshot, {
  phase: "final",
  durationSeconds: 134,
  correction: "Close before firing",
  practiceExercise: "gunnery",
  practiceLabel: "Practise guns",
  storage: {
    getItem: () => "1000",
    setItem: () => {},
  },
});

const pauseStripState = {
  attempt_elapsed_s: 74,
  engagements_won: 1,
  engagement_cap: 2,
};

const keyBindingRows = (() => {
  const rowsPerColumn = Math.ceil(CONTROL_BINDINGS.length / 2);
  const rows = [];
  for (let i = 0; i < rowsPerColumn; i++) {
    const left = CONTROL_BINDINGS[i];
    const right = CONTROL_BINDINGS[i + rowsPerColumn];
    const pair = [left, right].filter(Boolean).map((def) => ({
      action: def.action,
      label: def.label,
      keyLabel: controlCodeLabel(DEFAULT_PLAYER_SETTINGS.bindings[def.action]),
    }));
    rows.push(pair);
  }
  return rows;
})();

await mkdir(outDir, { recursive: true });

const site = await serveStatic(wwwroot);
const browser = await chromium.launch({ headless: true, channel: "chromium" });

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  // Fulfill classic/module scripts with an empty module so the inline bootstrap never reloads or
  // triggers boot fallback while we drive the authored DOM states directly.
  await context.route("**/*.js*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "export {};",
    }),
  );

  const page = await context.newPage();

  for (const variant of VARIANTS) {
    for (const scheme of SCHEMES) {
      for (const screen of SCREENS) {
        const url = `${site.url}?shellTheme=${variant.id}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });

        await page.evaluate(
          ({ variantId, schemeName, screenId, stripState, resultModel, bindingRows }) => {
            const html = document.documentElement;
            html.className = "run-paused";
            html.removeAttribute("data-launch");
            if (schemeName === "light") {
              html.setAttribute("data-theme", "light");
            } else {
              html.removeAttribute("data-theme");
            }
            html.classList.add(`shell-theme-${variantId}`);

            // Hide boot cover completely so the menu screen is unobstructed
            const boot = document.getElementById("boot");
            if (boot) {
              boot.classList.add("ready");
              boot.style.display = "none";
            }

            const readyScreen = document.getElementById("ready-screen");
            const settingsScreen = document.getElementById("settings-screen");
            const f22Result = document.getElementById("f22-result");
            const missionStripEl = document.getElementById("ready-mission-strip");
            const selector = document.getElementById("ready-selector");
            const readyStart = document.getElementById("ready-start");
            const readyStartLabel = readyStart?.querySelector(".shell-action-label");
            const readyHandoff = document.getElementById("ready-handoff");
            const readyRestart = document.getElementById("ready-restart");

            // Populate settings defaults and keyboard table
            const setChecked = (id, val) => {
              const el = document.getElementById(id);
              if (el) el.checked = val;
            };
            setChecked("setting-audio", true);
            setChecked("setting-music", true);
            setChecked("setting-interface-sounds", true);
            setChecked("setting-radio-voice", true);
            setChecked("setting-radio-captions", false);
            setChecked("setting-high-contrast", false);
            setChecked("setting-reduced-motion", false);
            setChecked("setting-large-text", false);
            setChecked("setting-autogcas", true);
            setChecked("setting-telemetry-sharing", false);

            const bindingsBody = document.getElementById("settings-bindings");
            if (bindingsBody) {
              bindingsBody.replaceChildren();
              for (const pair of bindingRows) {
                const tr = document.createElement("tr");
                tr.className = "settings-binding";
                for (const item of pair) {
                  const th = document.createElement("th");
                  th.scope = "row";
                  th.textContent = item.label;
                  const td = document.createElement("td");
                  const btn = document.createElement("button");
                  btn.type = "button";
                  btn.dataset.bindAction = item.action;
                  btn.textContent = item.keyLabel;
                  td.append(btn);
                  tr.append(th, td);
                }
                bindingsBody.append(tr);
              }
              const reportRow = document.createElement("tr");
              reportRow.className = "settings-binding";
              const rTh = document.createElement("th");
              rTh.scope = "row";
              rTh.textContent = "Report";
              const rTd = document.createElement("td");
              const kbd = document.createElement("kbd");
              kbd.textContent = "F8";
              rTd.append(kbd);
              reportRow.append(rTh, rTd);
              bindingsBody.append(reportRow);
            }

            // Reset common states
            delete readyScreen.dataset.f22Result;
            if (f22Result) f22Result.hidden = true;
            if (settingsScreen) {
              settingsScreen.classList.remove("visible");
              settingsScreen.setAttribute("aria-hidden", "true");
              settingsScreen.inert = true;
            }
            if (readyScreen) {
              readyScreen.classList.add("visible");
              readyScreen.setAttribute("aria-hidden", "false");
              readyScreen.inert = false;
            }

            if (screenId === "picker") {
              readyScreen.dataset.mode = "program";
              if (selector) selector.hidden = false;
              if (readyStartLabel) readyStartLabel.textContent = "Fly First Merge";
              const introReplay = document.getElementById("ready-intro-replay");
              if (introReplay) {
                introReplay.hidden = false;
                introReplay.querySelector(".shell-action-label").textContent = "Replay valley intro";
              }
            } else if (screenId === "pause") {
              readyScreen.dataset.mode = "pause";
              if (selector) selector.hidden = true;
              if (readyStartLabel) readyStartLabel.textContent = "Resume";
              if (readyRestart) {
                readyRestart.hidden = false;
                readyRestart.querySelector(".shell-action-label").textContent = "Restart";
              }
              if (readyHandoff) {
                readyHandoff.disabled = false;
                readyHandoff.querySelector(".shell-action-label").textContent = "RTB";
              }
              if (missionStripEl) {
                missionStripEl.hidden = false;
                const mode = missionStripEl.querySelector("#ready-mission-mode");
                if (mode) {
                  mode.textContent = "Guns Only";
                  mode.parentElement.hidden = false;
                }
                const clock = missionStripEl.querySelector("#ready-mission-clock");
                if (clock) {
                  clock.hidden = false;
                  clock.querySelector(".console-number").textContent = "1:14";
                }
                const eng = missionStripEl.querySelector("#ready-mission-engagements");
                if (eng) {
                  eng.hidden = false;
                  eng.querySelector(".console-number").textContent = "1/2";
                }
              }
            } else if (screenId === "settings") {
              readyScreen.dataset.mode = "pause";
              if (selector) selector.hidden = true;
              if (settingsScreen) {
                settingsScreen.inert = false;
                settingsScreen.classList.add("visible");
                settingsScreen.setAttribute("aria-hidden", "false");
              }
            } else if (screenId === "debrief") {
              readyScreen.dataset.mode = "debrief";
              readyScreen.dataset.f22Result = "final";
              if (selector) selector.hidden = true;
              if (f22Result) {
                f22Result.hidden = false;
                const $ = (id) => f22Result.querySelector(`#${id}`);
                const setStatusSymbol = (el, status) => {
                  const icon = status === "complete" || status === "recovered" ? "check"
                    : status === "best" ? "mark"
                    : status === "lost" ? "close" : "minus";
                  el?.setAttribute("href", `#shell-${icon}`);
                };
                $("f22-combat").dataset.status = resultModel.combat.status;
                setStatusSymbol($("f22-combat-symbol"), resultModel.combat.status);
                $("f22-combat-value").textContent = resultModel.combat.value;
                $("f22-recovery").dataset.status = resultModel.recovery.status;
                setStatusSymbol($("f22-recovery-symbol"), resultModel.recovery.status);
                $("f22-score").textContent = resultModel.score.value;
                $("f22-best").dataset.status = resultModel.score.status;
                setStatusSymbol($("f22-best-symbol"), resultModel.score.status);
                $("f22-best-delta").textContent = resultModel.score.deltaText;
                $("f22-gun").textContent = resultModel.gun.value;
                $("f22-clock").textContent = resultModel.gun.clock;
                $("f22-opponent").textContent = resultModel.opponent.value;
                const corrRow = $("f22-row-correction");
                if (resultModel.correction) {
                  corrRow.hidden = false;
                  $("f22-correction").textContent = resultModel.correction.text;
                  const prac = $("f22-practice");
                  prac.hidden = !resultModel.correction.practiceExercise;
                  prac.querySelector(".shell-action-label").textContent = resultModel.correction.practiceLabel;
                } else {
                  corrRow.hidden = true;
                }
                $("f22-recover").hidden = !resultModel.actions.recover;
              }
            }
          },
          {
            variantId: variant.id,
            schemeName: scheme,
            screenId: screen.id,
            stripState: pauseStripState,
            resultModel: debriefModel,
            bindingRows: keyBindingRows,
          },
        );

        await page.addStyleTag({
          content: `*, *::before, *::after { transition: none !important; animation: none !important; }`,
        });
        await page.evaluate(async () => {
          await document.fonts?.ready;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });

        const fileName = `${variant.id}-${screen.id}-${scheme}.png`;
        await page.screenshot({ path: join(outDir, fileName) });
      }
    }

    // Compose a per-variant PNG (4 screens × light/dark side by side)
    const variantHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0d12;
    color: #eef3f8;
    font: 600 16px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    padding: 20px;
    width: 1320px;
  }
  h1 {
    font-size: 20px;
    letter-spacing: 0.08em;
    margin-bottom: 14px;
    color: #f4cf83;
    border-bottom: 1px solid #2a3441;
    padding-bottom: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .cell {
    background: #121720;
    border: 1px solid #2a3441;
    border-radius: 4px;
    overflow: hidden;
  }
  .cell-label {
    padding: 6px 10px;
    font-size: 12px;
    letter-spacing: 0.08em;
    color: #a9b6c6;
    border-bottom: 1px solid #2a3441;
    display: flex;
    justify-content: space-between;
  }
  .cell img {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
</head>
<body>
  <h1>${variant.label} (?shellTheme=${variant.id})</h1>
  <div class="grid">
    ${SCREENS.flatMap((screen) =>
      SCHEMES.map(
        (scheme) => `
      <div class="cell">
        <div class="cell-label"><span>${screen.label.toUpperCase()}</span><span>${scheme.toUpperCase()} · 1280×720</span></div>
        <img src="./${variant.id}-${screen.id}-${scheme}.png">
      </div>`,
      ),
    ).join("")}
  </div>
</body>
</html>`;
    const variantHtmlPath = join(outDir, `_compose_${variant.id}.html`);
    await writeFile(variantHtmlPath, variantHtml);
  }

  // Also compose the master sheet.png (all 4 variants × 4 screens × light/dark)
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
  .variant-block {
    margin-bottom: 24px;
    background: #0d1219;
    border: 1px solid #25303d;
    border-radius: 6px;
    padding: 14px;
  }
  .variant-block:last-child { margin-bottom: 0; }
  .variant-header {
    font-size: 18px;
    letter-spacing: 0.1em;
    color: #f4cf83;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #25303d;
    display: flex;
    justify-content: space-between;
  }
  .screens-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .pair {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cell {
    background: #141b24;
    border: 1px solid #2c3949;
    border-radius: 4px;
    overflow: hidden;
  }
  .cell-label {
    padding: 5px 8px;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: #9fb0c4;
    border-bottom: 1px solid #2c3949;
    display: flex;
    justify-content: space-between;
  }
  .cell img {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
</head>
<body>
  ${VARIANTS.map(
    (variant) => `
  <section class="variant-block">
    <div class="variant-header">
      <span>${variant.label}</span>
      <span>?shellTheme=${variant.id}</span>
    </div>
    <div class="screens-grid">
      ${SCREENS.map(
        (screen) => `
      <div class="pair">
        ${SCHEMES.map(
          (scheme) => `
        <div class="cell">
          <div class="cell-label"><span>${screen.label.toUpperCase()}</span><span>${scheme.toUpperCase()}</span></div>
          <img src="./${variant.id}-${screen.id}-${scheme}.png">
        </div>`,
        ).join("")}
      </div>`,
      ).join("")}
    </div>
  </section>`,
  ).join("")}
</body>
</html>`;
  const masterHtmlPath = join(outDir, "_compose_sheet.html");
  await writeFile(masterHtmlPath, masterHtml);

  // Serve outDir to screenshot the composed sheets cleanly
  const sheetServer = await serveStatic(outDir);
  try {
    const composePage = await browser.newPage({
      viewport: { width: 1320, height: 900 },
      deviceScaleFactor: 1,
    });
    for (const variant of VARIANTS) {
      await composePage.goto(`${sheetServer.url}_compose_${variant.id}.html`, {
        waitUntil: "networkidle",
      });
      await composePage.screenshot({
        path: join(outDir, `${variant.id}.png`),
        fullPage: true,
      });
    }
    await composePage.setViewportSize({ width: 2640, height: 1200 });
    await composePage.goto(`${sheetServer.url}_compose_sheet.html`, {
      waitUntil: "networkidle",
    });
    await composePage.screenshot({
      path: join(outDir, "sheet.png"),
      fullPage: true,
    });
    await composePage.close();
  } finally {
    await sheetServer.close();
    for (const variant of VARIANTS) {
      await rm(join(outDir, `_compose_${variant.id}.html`), { force: true });
    }
    await rm(masterHtmlPath, { force: true });
  }
} finally {
  await browser.close();
  await site.close();
}
