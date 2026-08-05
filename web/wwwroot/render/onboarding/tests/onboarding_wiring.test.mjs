import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("cobra wires the shared first-run overlay with cobra content, play shell only", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /render\/onboarding\/first_run_controls\.js\?v=264/);
  assert.match(main, /render\/onboarding\/controls_content\.js\?v=264/);
  assert.match(main, /COBRA_ONBOARDING_CONTENT/);
  assert.match(main, /maybeShowFirstRun/);
  // Lab shell (?lab=1) is the owner's inspection harness — no onboarding chrome there.
  assert.match(main, /PLAY_MODE[\s\S]{0,120}createControlsOnboarding|createControlsOnboarding[\s\S]{0,200}PLAY_MODE/);
});

test("cobra feeds the nudge scheduler from authority truth every frame", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /advanceNudges/);
  // Ground + collective idle nudge and the first-hostile nudge both exist.
  assert.match(main, /HOLD W — COLLECTIVE UP/);
  assert.match(main, /TAB TO TARGET · HOLD F TO ENGAGE/);
});

test("weekend ride wires the shared overlay with ride content and a standstill nudge", async () => {
  const main = await source("weekend-ride/main.js");
  assert.match(main, /render\/onboarding\/first_run_controls\.js\?v=264/);
  assert.match(main, /WEEKEND_RIDE_ONBOARDING_CONTENT/);
  assert.match(main, /maybeShowFirstRun/);
  assert.match(main, /advanceNudges/);
  assert.match(main, /HOLD W — THROTTLE TO RIDE/);
});

test("the overlay is one shared implementation — mission pages own no forked overlay DOM", async () => {
  const [cobra, ride] = await Promise.all([
    source("cobra-lab/main.js"),
    source("weekend-ride/main.js"),
  ]);
  for (const main of [cobra, ride]) {
    assert.doesNotMatch(main, /controls-onboarding-card/);
    assert.match(main, /createControlsOnboarding/);
  }
});

test("the F-22 shell keeps its native teaching; no second onboarding system is bolted on", async () => {
  const app = await source("app.js");
  // Ready screen legend + H quicklook remain the F-22's teaching path.
  assert.match(app, /H opens controls/);
  assert.match(app, /KeyH/);
  assert.doesNotMatch(app, /first_run_controls/);
});
