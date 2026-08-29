import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

async function source(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

const STANDALONE_ROUTES = Object.freeze([
  Object.freeze({
    id: "cobra-lab",
    html: "web/wwwroot/cobra-lab/index.html",
    main: "web/wwwroot/cobra-lab/main.js",
    brief: "mission-brief",
    pause: "pause-menu",
    result: "debrief",
    authorityHold: /missionBriefOpen \|\| missionPaused \|\| onboarding\?\.isOpen\(\) === true/,
    audioHold: /missionBriefOpen[\s\S]*?missionPaused[\s\S]*?onboarding\?\.isOpen\(\) === true[\s\S]*?audioEnabled/,
  }),
  Object.freeze({
    id: "weekend-ride",
    html: "web/wwwroot/weekend-ride/index.html",
    main: "web/wwwroot/weekend-ride/main.js",
    brief: "ride-brief",
    pause: "pause-menu",
    result: "ride-result",
    authorityHold: /!dispatchOpen && !teachingOpen && !paused && !terminal[\s\S]*?bridge\.Advance/,
    audioHold: /muted: dispatchOpen \|\| teachingOpen \|\| paused \|\| terminal/,
  }),
  Object.freeze({
    id: "okanagan-fireboss",
    html: "web/wwwroot/okanagan/index.html",
    main: "web/wwwroot/okanagan/main.js",
    brief: "sortie-menu",
    pause: "pause-menu",
    result: "mission-result",
    authorityHold: /if \(running && !paused\)[\s\S]*?bridge\.Advance/,
    audioHold: /updateFlightAudio\(flightState, \{ muted: paused/,
  }),
]);

test("every standalone production route owns brief, pause, and result dialogs", async () => {
  for (const route of STANDALONE_ROUTES) {
    const html = await source(route.html);
    for (const surface of [route.brief, route.pause, route.result]) {
      const openingTag = html.match(new RegExp(`<[^>]+id="${surface}"[^>]*>`))?.[0] ?? "";
      assert.match(openingTag, /role="dialog"/, `${route.id} ${surface} must be a dialog`);
      assert.match(openingTag, /aria-modal="true"/, `${route.id} ${surface} must own modal focus`);
      assert.match(openingTag, /aria-labelledby="[^"]+"/,
        `${route.id} ${surface} must name itself`);
    }
    assert.match(html, /class="[^"]*mission-card[^"]*"/,
      `${route.id} must use the shared mission-card vocabulary`);
    assert.match(html, /class="[^"]*mission-kicker[^"]*"/,
      `${route.id} must use a mission kicker`);
    assert.match(html, /class="[^"]*mission-summary[^"]*"/,
      `${route.id} must carry a concise mission summary`);
    assert.match(html, /class="[^"]*mission-action mission-action--primary[^"]*"/,
      `${route.id} must expose one primary action`);
    assert.match(html, /class="[^"]*mission-correction[^"]*"/,
      `${route.id} must teach a first move or next rep`);
    assert.equal(html.includes(`href="/?program=${route.id}&amp;menu=1"`), true,
      `${route.id} must hand back to its selected aircraft card`);
  }
});

test("standalone modal ownership pauses authority and restores the flight surface", async () => {
  for (const route of STANDALONE_ROUTES) {
    const main = await source(route.main);
    assert.match(main, /\.inert\s*=|setMissionBackgroundInert|setCobraMissionBackgroundInert/,
      `${route.id} must inert the background under modal surfaces`);
    assert.match(main, /focus\(\{ preventScroll: true \}\)/,
      `${route.id} must move focus on lifecycle transitions`);
    assert.match(main, /Escape/,
      `${route.id} must expose an Escape lifecycle path`);
    assert.match(main, route.authorityHold,
      `${route.id} must stop authority under its brief, teaching, pause, and result surfaces`);
    assert.match(main, route.audioHold,
      `${route.id} must mute continuous flight audio under non-flight surfaces`);
  }
});

test("the root shell uses the same explicit lifecycle and action vocabulary", async () => {
  const [html, app] = await Promise.all([
    source("web/wwwroot/index.html"),
    source("web/wwwroot/app.js"),
  ]);
  const ready = html.match(/<div id="ready-screen"[^>]*>/)?.[0] ?? "";
  assert.match(ready, /role="dialog"/);
  assert.match(ready, /aria-modal="true"/);
  assert.match(ready, /aria-labelledby="ready-menu-title"/);
  assert.match(app, /readyScreen\.dataset\.mode = firstRunReady[\s\S]*?"intro"[\s\S]*?"program"[\s\S]*?"debrief"[\s\S]*?"pause"/);
  assert.match(app, /readyRestart\.textContent = finished \? "Repeat sortie" : "Restart sortie"/);
  assert.match(app, /readyReturn\.textContent = "Choose sortie"/);
  assert.match(app, /syncReadyModalOwnership\(showScreen\)/);
  assert.match(app, /readyReplay\.textContent = "Replay"/);
  assert.match(app, /const singleCorrection = result\.safetyCorrection[\s\S]*?visualMerge\?\.correction[\s\S]*?result\.correction/);
  assert.doesNotMatch(app, /Did well ·|Fight turned ·|Next rep ·|replay cached/);
});

test("the first taught control cannot dismiss onboarding and operate a vehicle", async () => {
  const controls = await source("web/wwwroot/render/onboarding/first_run_controls.js");
  assert.match(controls, /aria-modal/);
  assert.match(controls, /setBackgroundInert\(true\)/);
  assert.match(controls, /stopImmediatePropagation/);
  assert.match(controls, /return "block"/);
  assert.doesNotMatch(controls, /Any key dismisses/);
});
