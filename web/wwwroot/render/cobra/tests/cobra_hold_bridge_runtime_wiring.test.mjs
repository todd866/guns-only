import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("an armed sortie advances by real elapsed time; the only cap is the bridge's 0.1 s spiral brake", async () => {
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
  assert.match(main,
    /authorityState = JSON\.parse\(bridge\.GetState\(\)\);[\s\S]*?syncParkedAirframes\(\);[\s\S]*?window\.__gunsOnlyCobraAuthority = authorityState;/,
    "the cold Ready snapshot must be inspectable without advancing authority time");
  // Manual and parked-review frames reach authority only through the per-sortie Ready interlock.
  // Guided tour deliberately freezes the unpiloted aircraft rather than crashing it off-camera.
  const guardedAdvances = main.match(
    /sortieReadiness\.advance\(deltaSeconds, \(step\) => bridge\.Advance\(step\)\)/g,
  ) ?? [];
  assert.equal(guardedAdvances.length, 2);
  assert.doesNotMatch(main, /bridge\.Advance\(deltaSeconds\)/);
  assert.match(main, /A guided scenery camera has no pilot/);
  assert.match(main,
    /StartRoute\([\s\S]{0,120}?routeSelect\.selectedIndex,[\s\S]{0,80}?!PLAY_MODE \|\| BATTLE_REVIEW_MODE,[\s\S]{0,80}?BATTLE_REVIEW_MODE/,
    "both unattended modes must request no wind while only battle review requests its spawn");
});

test("a cold spare rebases the gunner onto the continuing mission tick line", async () => {
  const bridge = await source("../CobraWebBridge.cs");
  assert.match(bridge, /_gunnerNeedsAuthorityRebase = true/);
  assert.match(bridge, /RebaseAuthorityTick\(runtime\.Cobra\.State\.Tick\)/);
  assert.match(bridge, /enableTerrainWind: !visualLab && !battleReview/);
});

test("authentic pilot input never feeds aircraft attitude back as a hidden hold", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /advanceCobraPilotControls\(pilotControls/);
  assert.doesNotMatch(main, /attitude:\s*pose/);
  assert.doesNotMatch(main, /idle-stick leveling assist/);
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

test("Tab selects and V padlocks like the F-22 gun-target / view contract", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /nextHostileTargetId/);
  assert.match(main, /acquireAuthorityVisualLockTarget/);
  assert.match(main, /TrySetVisualLockTarget/);
  assert.match(main, /advancePadlockLosGrace/);
  assert.match(main, /resolveAuthorityLookAtPoint/);
  assert.match(main, /event\.code === "KeyV"/);
  assert.match(main, /event\.code === "Tab"/);
  assert.match(main, /padlockActive/);
  assert.match(main, /playerHasInteracted/);
  assert.match(main, /hostileTargetIds\.length && playerHasInteracted/);
  // Soft ±0.05 rad lean is no longer the padlock substitute.
  assert.doesNotMatch(main, /clampInducedLookRotation/);
});

test("the tip strip teaches the collective lever: W raises, S lowers", async () => {
  const [main, html, objective] = await Promise.all([
    source("cobra-lab/main.js"),
    source("cobra-lab/index.html"),
    source("render/cobra/cobra_objective_copy.js"),
  ]);
  // Ember Run: default tip lives in objective_copy + the HTML seed line; main paints via helper.
  assert.match(objective, /W up \/ S down/);
  assert.match(html, /W collective up · S down/);
  assert.match(main, /cobraObjectiveCopy/);
});

test("cobra telemetry records the live power margin, not the dead hover constant", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /cobra_power_margin: authorityState\.vehicle\.power_margin/);
});

test("cobra telemetry records yaw residual and local wind for SCAS vs wind audits", async () => {
  const main = await source("cobra-lab/main.js");
  assert.match(main, /cobra_yaw_rad:/);
  assert.match(main, /cobra_pedal:/);
  assert.match(main, /cobra_yaw_residual_rad_s:/);
  assert.match(main, /cobra_scas_roll_rad_s:/);
  assert.match(main, /cobra_scas_pitch_rad_s:/);
  assert.match(main, /cobra_scas_yaw_rad_s:/);
  assert.match(main, /cobra_wind_e_mps:/);
  assert.match(main, /cobra_wind_n_mps:/);
  assert.match(main, /cobra_gust_pitch_moment_nm:/);
  assert.match(main, /cobra_gust_yaw_moment_nm:/);
  assert.match(main, /cobra_gust_roll_moment_nm:/);
  assert.match(main, /cobra_advance_ratio:/);
  assert.match(main, /cobra_directional_air_speed_mps:/);
  assert.match(main, /cobra_air_track_rad:/);
  assert.match(main, /cobra_sideslip_rad:/);
});
