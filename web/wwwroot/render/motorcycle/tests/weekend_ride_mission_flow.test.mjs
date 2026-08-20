import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("the browser bridge exposes an authoritative End Ride transition", async () => {
  const bridge = await source("../MotorcycleWebBridge.cs");

  assert.match(bridge, /\[JSExport\]\s+public static void EndRide\(\)/u);
  assert.match(bridge, /EndRide\(\)[\s\S]*?runtime\.Finish\(\)/u);
  assert.match(bridge, /EndRide\(\)[\s\S]*?_accumulatorSeconds = 0\.0/u);
});

test("pause and terminal result are distinct dialogs with explicit actions", async () => {
  const html = await source("weekend-ride/index.html");

  assert.match(html, /id="pause-menu"[^>]*class="mission-overlay mission-pause"[^>]*role="dialog"/u);
  assert.match(html, /id="pause-resume"[\s\S]*id="pause-end"[\s\S]*id="pause-return"/u);
  assert.match(html, /id="ride-result"[^>]*class="mission-overlay mission-result"[^>]*role="dialog"/u);
  assert.match(html, /id="result-retry"[^>]*>Ride again<\/button>/u);
  assert.match(html, /id="result-return"[^>]*>Return to aircraft<\/a>/u);
  assert.match(html, /id="result-correction"[^>]*class="mission-correction"/u);
});

test("Escape only owns pause while End Ride owns terminalization", async () => {
  const main = await source("weekend-ride/main.js");

  assert.match(main, /weekendRideEscapeAction\(\{[\s\S]*?onboardingOpen:[\s\S]*?paused,[\s\S]*?terminal,/u);
  assert.match(main, /setRidePaused\(action === "pause"\)/u);
  assert.doesNotMatch(main, /event\.code === "Escape"[\s\S]{0,300}EndRide\(/u);
  assert.match(main, /pauseEnd\?\.addEventListener\("click", endRide\)/u);
  assert.match(main, /function endRide\(\)[\s\S]*?bridge\.EndRide\(\)[\s\S]*?showRideResult/u);
  assert.match(main, /state\.phase === "finished"[\s\S]*?showRideResult\(state\)/u);
});

test("the result follows the shared semantic evidence and next-rep shape", async () => {
  const [main, html, styles] = await Promise.all([
    source("weekend-ride/main.js"),
    source("weekend-ride/index.html"),
    source("weekend-ride/styles.css"),
  ]);

  for (const className of [
    "mission-kicker", "mission-verdict", "mission-metrics", "mission-sectors",
    "mission-correction", "mission-actions", "mission-action--primary",
  ]) assert.match(html, new RegExp(`class="[^"]*${className}`));
  assert.match(main, /weekendRideResult\(state, \{ recordAtStartSeconds \}\)/u);
  assert.match(main, /resultCorrection\.textContent = result\.correction/u);
  assert.match(styles, /\.mission-card > \.mission-correction/u);
});

test("retry and return preserve a deliberate mission handoff", async () => {
  const [main, html] = await Promise.all([
    source("weekend-ride/main.js"),
    source("weekend-ride/index.html"),
  ]);

  assert.equal((html.match(/href="\/\?program=weekend-ride&amp;menu=1"/gu) ?? []).length, 2);
  assert.match(main, /function rideAgain\(\)[\s\S]*?teardownRide\("ride_again"\)[\s\S]*?window\.location\.reload\(\)/u);
  assert.doesNotMatch(main, /preventDefault[\s\S]{0,200}return_to_aircraft/u,
    "a teardown exception must not cancel the anchors' native navigation");
  assert.match(main, /pagehide[\s\S]*?teardownRide\("pagehide"\)/u);
});

test("dialogs make the background inert and restore focus to the ride surface", async () => {
  const [main, html, styles] = await Promise.all([
    source("weekend-ride/main.js"),
    source("weekend-ride/index.html"),
    source("weekend-ride/styles.css"),
  ]);

  assert.match(html, /<canvas id="scene" tabindex="-1"><\/canvas>/u);
  assert.match(main, /function setMissionBackgroundInert\(inert\)[\s\S]*?node\.inert = inert === true/u);
  assert.match(main, /setMissionBackgroundInert\(paused\)/u);
  assert.match(main, /setMissionBackgroundInert\(true\)/u);
  assert.match(main, /canvas\.focus\?\.\(\{ preventScroll: true \}\)/u);
  assert.match(styles, /\.mission-overlay[\s\S]*?inset: 0;/u);
  assert.match(styles, /body\[data-terminal="true"\] #controls-onboarding-reopen/u);
});
