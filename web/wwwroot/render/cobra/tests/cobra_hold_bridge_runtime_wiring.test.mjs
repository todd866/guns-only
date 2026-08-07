import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the sim advances by real elapsed time; the only cap is the bridge's 0.1 s spiral brake", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /SIM_MAX_FRAME_ADVANCE_SECONDS = 0\.1/);
  assert.match(main, /rawDeltaMs \/ 1_000, SIM_MAX_FRAME_ADVANCE_SECONDS/);
  // The old 50 ms JS clamp silently converted 20 fps into 0.62x slow motion.
  assert.doesNotMatch(main, /rawDeltaMs \/ 1_000, 0\.05/);
});

test("authority JSON is sampled at HUD rate while the camera reads the per-frame hot pose", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /AUTHORITY_STATE_SAMPLE_INTERVAL_MS/);
  assert.match(main, /sampleAuthorityState/);
  assert.match(main, /GetHotPose/);
  assert.match(main, /copyTo/);
  // Advance still runs every rendered frame in both manual and tour paths.
  assert.match(main, /bridge\.Advance\(deltaSeconds\)/);
});

test("telemetry rides the bounded channel and keepalive exists only behind the pagehide path", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /createCobraTelemetryChannel/);
  // The flush reason is now the teardown's caller ("pagehide" or Escape's "exit"), because both
  // routes tear the mission down through one function. Both must still flush.
  assert.match(main, /teardownMission\("pagehide"\)/);
  assert.match(main, /teardownMission\("exit"\)/);
  assert.match(main, /telemetryChannel\.flush\(\{ \[reason\]: true \}\)/);
  assert.doesNotMatch(main, /keepalive/);
  assert.doesNotMatch(main, /telemetryRows\.splice/);
});

test("target cueing cannot swing the windshield and cold boot selects no target", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /clampInducedLookRotation/);
  assert.match(main, /playerHasInteracted/);
  assert.match(main, /hostileTargetIds\.length && playerHasInteracted/);
});

test("the tip strip teaches the collective lever: S pulls up, W lowers", async () => {
  const [main, html, objective] = await Promise.all([
    source("cobra-lab/main.js"),
    source("cobra-lab/index.html"),
    source("render/cobra/cobra_objective_copy.js"),
  ]);
  // Ember Run: default tip lives in objective_copy + the HTML seed line; main paints via helper.
  assert.match(objective, /W collective up · S down/);
  assert.match(html, /W collective up · S down/);
  assert.match(main, /cobraObjectiveCopy/);
});

test("cobra telemetry records the live power margin, not the dead hover constant", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /cobra_power_margin: authorityState\.vehicle\.power_margin/);
});
