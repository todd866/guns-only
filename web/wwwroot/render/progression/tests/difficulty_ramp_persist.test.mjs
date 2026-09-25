import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../../app.js", import.meta.url);

test("director state is saved after an observed engagement and on lifecycle exit", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.match(app, /function persistDirectorObservation\(state\) \{[\s\S]*?saveDirectorState\(\)/);
  assert.match(app, /engagement_number[\s\S]*?saveDirectorState\(\)/);
  assert.match(app,
    /window\.addEventListener\("pagehide", \(\) => \{[\s\S]*?saveDirectorState\(\)/);
  assert.match(app,
    /document\.addEventListener\("visibilitychange", \(\) => \{[\s\S]*?document\.hidden[\s\S]*?saveDirectorState\(\)/);
  assert.match(app, /latestState = state;[\s\S]{0,400}persistDirectorObservation\(state\)/);
  const topGunStart = app.indexOf("function stageTopGunOnBridge()");
  const topGunEnd = app.indexOf("\nfunction ", topGunStart + 10);
  assert.doesNotMatch(
    app.slice(topGunStart, topGunEnd),
    /armDirectorRestore\(/,
    "Top Gun must not arm an F-22 director blob");
});

test("the guns-only ready brief does not promise an opening ace pair", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.doesNotMatch(app, /opening wave is a pair of Aces/);
  assert.doesNotMatch(app, /Splash the pair/);
});
