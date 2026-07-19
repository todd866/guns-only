import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../../app.js", import.meta.url);

test("production creates the pack-local environment and effects adapters", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /createKoreaEnvironmentFactory\(THREE,[\s\S]*environmentFactory,/);
  assert.match(source, /createKoreaEffectsFactory\(THREE,[\s\S]*effectsFactory,/);
  assert.match(source, /this\.tacticalClouds\.group\.visible = false/,
    "the pack cloud layers replace rather than double-render the procedural field");
  assert.match(source, /manageFog: true/,
    "the selected visual profile owns standard-material fog while its environment is active");
  assert.match(source, /emitPackEffect\("event\.weapon\.gun-fire\.v1"/);
  assert.match(source, /emitPackEffect\("event\.weapon\.gun-impact\.v1"/);
  assert.match(source, /emitPackEffect\("event\.vehicle\.destroyed\.v1"/);
});

test("hidden replay exterior is preloaded and obsolete pack runtimes are disposed", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source,
    /resolveSlot\(this\.playerExteriorSlot, \{ preload: true \}\)/,
    "the first replay must not start on the compatibility exterior");
  assert.match(source,
    /if \(!pack\?\.profile \|\| !key\) \{[\s\S]*const epoch = \+\+this\.visualRuntimeEpoch;[\s\S]*queueVisualRuntimeTransition/,
    "an unstaged or invalidated pack must retire its old visual runtime");
  assert.match(source, /previous\?\.dispose\(\)/);
});

test("multiplayer consumes pack slots at physical scale with a separate distant contact", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /createDynamicSlot\([\s\S]*projection\.presentationId/);
  assert.match(source, /createDistantAircraftImpostor\(THREE,/);
  assert.match(source, /entry\.slot\.root\.scale\.setScalar\(1\)/);
  assert.match(source,
    /entry\.slot\.root\.visible = !entry\.alive \|\| contactPresentation\.modelVisible/,
    "terminal bodies remain physical while only live distant aircraft use the impostor");
  assert.doesNotMatch(source, /assistScale|entry\.visual\.scale\.setScalar/,
    "remote aircraft must never be range-enlarged");
  assert.match(source, /projectedPixelHeight \* \(2 \*\* -bias\)/,
    "quality-tier LOD bias must affect registry selection without changing physical scale");
  assert.match(source, /texture\.anisotropy = anisotropy/,
    "quality-tier anisotropy must reach authored model textures");
});

test("FlightView teardown releases pack tasks, inline resources, PMREM, and renderer", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /await this\.visualRuntimeTransitions\.idle\(\)/);
  assert.match(source, /this\.visualRuntimeTransitions\.enqueue\(operation\)/);
  assert.match(source, /disposeSceneResources\(this\.sky\.mesh\)/);
  assert.match(source, /this\.environmentTarget\.dispose\(\)/);
  assert.match(source, /this\.renderer\.dispose\(\)/);
});

test("replay stream changes clear transients and baseline cumulative weapon counters", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /if \(consumption\.streamChanged\) \{[\s\S]*packEffectsAdapter\?\.clear/);
  assert.match(source, /if \(consumption\.streamChanged\) \{[\s\S]*playerDamageSmoke\.clear\(\)[\s\S]*banditDamageSmoke\.clear\(\)/);
  assert.match(source, /lastRoundsFired = Number\(state\.rounds_fired\) \|\| 0/);
  assert.match(source,
    /lastOpponentRoundsFired = Number\(state\.opponent_rounds_fired\) \|\| 0/);
  assert.match(source, /lastHitCount = Number\(state\.hits\) \|\| 0/);
});
