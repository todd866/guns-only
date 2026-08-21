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

test("the F-22 shell stages the valley once, without bolting on first_run_controls", async () => {
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

test("first run is a deliberate Ready interlock and Fire visibly names its live weapon", async () => {
  const [app, index, hud, readouts] = await Promise.all([
    source("app.js"), source("index.html"), source("hud.js"), source("render/hud/hud_readouts.js"),
  ]);
  assert.match(app,
    /const firstRunReady = firstRunAutostartPending[\s\S]*readyScreen\.dataset\.mode = firstRunReady[\s\S]*?"intro"/,
    "first visit must own a distinct Ready presentation instead of falling through to the picker");
  assert.match(app,
    /const firstRunReady = firstRunAutostartPending && ready && !finished;/,
    "settings, help, and background holds must not relabel staged intro authority as the picker");
  assert.match(app,
    /else if \(firstRunReady\)[\s\S]*readyStart\.textContent = "Enter valley"/,
    "the first aircraft clock must wait behind an explicit pilot action");
  assert.doesNotMatch(app,
    /firstRunAutostartPending = true;\s*autoLaunchPending = true/,
    "staging the valley must never arm launch before the pilot consents");
  assert.match(index, /id="ready-intro-replay"[^>]*>Replay valley intro</,
    "returning pilots need a visible replay action in the mission programme");
  assert.match(app,
    /readyIntroReplay\?\.addEventListener\("click"[\s\S]*searchParams\.set\("firstRun", "1"\)[\s\S]*enterReady/,
    "the replay action must restage the same authority through the explicit replay seam");
  assert.match(app,
    /if \(firstRunAutostartPending\)[\s\S]*dismissFirstRunValleyAutostart\(\);[\s\S]*clearFirstRunValleyReplayQuery\(\);[\s\S]*enterReady/,
    "choosing the programme must remove an explicit replay query before a future reload");
  assert.match(app,
    /"first-merge": Object\.freeze\(\{[\s\S]*?sortie: "F-22A vs escalating opposition · guns only · first pass safe"/);
  assert.match(app, /touchFireAriaLabel/);
  assert.match(app, /touchFireButton\.textContent = touchFireVisibleLabel\(state\)/,
    "the same F control must visibly transition from FOX 2 to GUNS with authority");
  assert.match(index, /id="touch-fire"[^>]*>FIRE</,
    "the static fallback remains FIRE until the first authoritative snapshot arrives");
  assert.match(hud,
    /firstRunValley[\s\S]*?FOX TWO → GUNS[\s\S]*?FOLLOW VALLEY · \$\{fireBinding\} FIRES TWO HEATERS, THEN GUNS/,
    "desktop Quicklook must replace generic missile fiction with the remappable first-run Fire contract");
  assert.match(readouts,
    /FOLLOW VALLEY · WEAPONS SAFE[\s\S]*?FOX TWO ×\$\{aim9Remaining\} · FIRE[\s\S]*?GUNS · FIRE/,
    "the live HUD must carry the complete first-run objective ladder after transient cues expire");
});

test("first-run Quicklook reuses the remappable Fire binding in every teaching line", async () => {
  const hud = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  const quicklook = hud.match(/const firstRunValley[\s\S]*?if \(f14WingSweep\)/u)?.[0] ?? "";
  assert.match(quicklook, /const fireBinding = binding\("fire", "KeyF"\)/u);
  assert.match(quicklook, /\$\{fireBinding\} FIRES TWO HEATERS/u);
  assert.match(quicklook, /\$\{fireBinding\}: TWO HEATERS → GUNS/u);
  assert.doesNotMatch(quicklook, /(?:^|· )F(?: |:) (?:FIRES|TWO HEATERS)/u);
});
