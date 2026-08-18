import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("WebBridge exports StartFirstRunValley as a factory overlay, not a new BuiltIn index", async () => {
  const bridge = await source("../WebBridge.cs");
  assert.match(bridge,
    /\[JSExport\][\s\S]*?void StartFirstRunValley\(\)[\s\S]*?Beats\.ModernVisualMergeFirstRun/,
    "first-run valley must cross the JSExport boundary into the overlay factory");
  assert.doesNotMatch(bridge,
    /StartFirstRunValley\(\)[\s\S]*?StartBeat\(\s*7/,
    "StartFirstRunValley must not silently stage beat 7");
});

test("the F-22 shell auto-starts the valley once, without bolting on first_run_controls", async () => {
  const app = await source("app.js");
  assert.match(app, /render\/onboarding\/first_run_valley\.js\?v=\d+/);
  assert.match(app, /shouldAutoStartFirstRunValley/);
  assert.match(app, /firstRunValleyPending/);
  assert.match(app, /markFirstRunValleySeen/);
  assert.match(app, /firstRunValleyMissionAuthority/);
  assert.match(app, /bridge\.StartFirstRunValley\(\)/);
  assert.doesNotMatch(app, /first_run_controls/,
    "the F-22 shell keeps its native teaching; valley auto-start is not the cobra overlay");
});

test("Playwright and menu keep the picker; firstRun=1 is the QA replay seam", async () => {
  const app = await source("app.js");
  assert.match(app, /navigator\.webdriver/);
  assert.match(app, /searchParams\.get\("menu"\)/);
  assert.match(app, /searchParams\.get\("firstRun"\)/);
});

test("enterReady and boot stage the valley when auto-starting instead of StartBeat(7)", async () => {
  const app = await source("app.js");
  assert.match(app,
    /function enterReady\([\s\S]*shouldStageFirstRunValley\(\)[\s\S]*bridge\.StartFirstRunValley\(\)[\s\S]*refreshStagedMissionSnapshot\(\)/,
    "Ready restage must not drop a pending first-run into the high merge");
  assert.match(app,
    /bridge\.StartFirstRunValley\(\);[\s\S]*stagedMissionAuthority = firstRunValleyMissionAuthority\(\)/);
  assert.match(app,
    /function launchMission\([\s\S]*FIRST_RUN_VALLEY[\s\S]*prepareMissionTerrain/,
    "auto-launch must not restage production beat 7 over a live first-run authority");
});

test("the first successful beginFlight stamps seen so Fly again is guns-only first-merge", async () => {
  const app = await source("app.js");
  const begin = app.match(/function beginFlight\(\) \{[\s\S]*?\nfunction activateReadyAction/)?.[0] || "";
  assert.match(begin, /markFirstRunValleySeen/);
  assert.match(begin, /firstRunAutostartPending = false/);
  assert.doesNotMatch(app,
    /markFirstRunValleySeen\([\s\S]{0,40}\)[\s\S]{0,80}function boot/,
    "boot must not stamp seen before the valley actually launched");
});

test("the picker stays hidden during first-run warmup and the Guns Only tile copy stays guns-only", async () => {
  const [app, index] = await Promise.all([source("app.js"), source("index.html")]);
  assert.match(app,
    /function renderPauseUi\([\s\S]*firstRunAutostartPending[\s\S]*readyScreen\.classList\.toggle\("visible"/,
    "first visit must skip the six-tile picker while the valley is auto-launching");
  assert.match(app,
    /"first-merge": Object\.freeze\(\{[\s\S]*?sortie: "F-22A vs escalating opposition · guns only · first pass safe"/);
  assert.match(app, /touchFireAriaLabel/);
  assert.match(index, /id="touch-fire"[^>]*>FIRE</,
    "the visible touch label stays FIRE even while heaters are live");
});
