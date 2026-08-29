import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  COBRA_SCENERY_SCREENSHOT_TIMEOUT_MS,
  COBRA_SCENERY_VIEWS,
} from "../views.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GATE_DIR = resolve(TEST_DIR, "..");
const REPO_DIR = resolve(GATE_DIR, "../..");

test("Cobra proof cameras hold four authored scenery and battle compositions", () => {
  assert.equal(COBRA_SCENERY_SCREENSHOT_TIMEOUT_MS, 120_000);
  assert.ok(Object.isFrozen(COBRA_SCENERY_VIEWS));
  assert.ok(COBRA_SCENERY_VIEWS.every(Object.isFrozen));
  assert.deepEqual(COBRA_SCENERY_VIEWS, [
    {
      name: "iron-bell",
      eastM: -3_050,
      northM: -700,
      aglM: 50,
      yawRad: -1.075,
      pitchRad: -0.05,
      fovDeg: 56,
      battleSiteId: "site.iron-bell-bridge.v1",
    },
    {
      name: "plantation-fight",
      eastM: 50,
      northM: -3_750,
      aglM: 40,
      yawRad: -2.125,
      pitchRad: -0.12,
      fovDeg: 46,
      battleSiteId: "site.plantation-water-tower.v1",
    },
    {
      name: "camp-ember",
      eastM: -3_605,
      northM: -4_712,
      aglM: 18,
      yawRad: 1.047,
      pitchRad: -0.08,
    },
    {
      name: "mid-gorge",
      eastM: -4_557,
      northM: -3_661,
      aglM: 50,
      yawRad: -0.5,
      pitchRad: -0.2,
    },
  ]);
});

test("the still gate enters a truth-backed live battle before capture", () => {
  const source = readFileSync(resolve(GATE_DIR, "shot.mjs"), "utf8");
  const capture = readFileSync(resolve(GATE_DIR, "battle_capture.mjs"), "utf8");
  assert.match(source, /battleQa=1/);
  assert.match(capture, /restartBattleReview/);
  assert.match(capture, /stepBattleReview/);
  assert.match(capture, /const PROOF_STEP_SECONDS = 0\.05/);
  assert.match(capture, /await page\.waitForTimeout\(PROOF_STEP_WALL_TIME_MS\)/);
  assert.doesNotMatch(capture, /attempt === 0 \? COBRA_BATTLE_PROOF_MIN_ELAPSED_S/,
    "the proof must not compress several seconds of transient effects into one wall-clock frame");
  assert.match(capture, /war\?\.combat_live === true/);
  assert.doesNotMatch(source, /#status.*dataset\.ready/,
    "incoming-fire status warnings must not make a real battle fail readiness");
  assert.match(capture, /event\?\.kind !== "small-arms"/);
  assert.match(capture, /event\?\.site_id !== input\.siteId/);
  assert.match(capture, /renderedBattleEvidence\(input\.siteId, event\.tick, event\.unit_id\)/);
  assert.match(capture, /COBRA_BATTLE_PROOF_MIN_EXCHANGE_RANGE_M/);
  assert.match(capture, /projectSimPointToScreen/);
  assert.match(capture, /sourceFlashInSafeFrame/);
  assert.match(capture, /COBRA_BATTLE_PROOF_MIN_RENDERED_DASHES/);
  assert.match(capture, /COBRA_BATTLE_PROOF_MIN_RENDERED_SPAN_PX/);
  assert.match(capture, /bestForFaction\("friendly"\)/);
  assert.match(capture, /bestForFaction\("hostile"\)/);
  assert.match(capture, /friendlyAlive/);
  assert.match(capture, /hostileAlive/);
  assert.doesNotMatch(source, /waitForTimeout\(90\)/,
    "the gate must latch the rendered frame instead of hoping a wall-clock sleep lands on fire");
  assert.match(source, /__gunsOnlyCobraLabCamera\.release\(\)/,
    "the gate must prove the battle from the player's own cockpit view");
  assert.match(source, /cockpit-battle\.png/);
  const flicker = readFileSync(resolve(GATE_DIR, "flicker.mjs"), "utf8");
  assert.doesNotMatch(flicker, /battleQa=1/);
  assert.match(flicker, /honest animation/);
});

test("still and flicker probes consume the shared poses without retired world coordinates", () => {
  const retiredWorldCoordinate = /-(?:6_?775|6_?200)\b/;
  for (const file of ["shot.mjs", "flicker.mjs"]) {
    const source = readFileSync(resolve(GATE_DIR, file), "utf8");
    assert.match(source, /COBRA_SCENERY_SCREENSHOT_TIMEOUT_MS/);
    assert.match(source, /COBRA_SCENERY_VIEWS/);
    assert.match(source, /from "\.\/views\.mjs";/);
    assert.match(source, /for \(const view of (?:COBRA_SCENERY_VIEWS|captureViews)\)/);
    assert.match(source, /timeout: COBRA_SCENERY_SCREENSHOT_TIMEOUT_MS/);
    assert.doesNotMatch(source, /\bconst VIEWS\b/);
    assert.doesNotMatch(source, retiredWorldCoordinate);
  }
});

test("bin/look passes its still directory through the shot probe's public variable", () => {
  const source = readFileSync(resolve(REPO_DIR, "bin/look"), "utf8");
  assert.match(
    source,
    /COBRA_SCENERY_SHOT_DIR="\$dir" node tools\/cobra-scenery-gate\/shot\.mjs/,
  );
  assert.doesNotMatch(
    source,
    /COBRA_SCENERY_STILLS="\$dir" node tools\/cobra-scenery-gate\/shot\.mjs/,
  );
  assert.match(source, /plantation-fight\.png/);
  assert.match(source, /cockpit-battle\.png/);
});

test("the player-eye frame is pixel-scored, not merely required by filename", () => {
  const source = readFileSync(resolve(GATE_DIR, "score.mjs"), "utf8");
  assert.match(source, /"cockpit-battle\.png"/);
  assert.match(source, /filter\(\(name\) => EXPECTED_STILLS\.includes\(name\)\)/);
  assert.doesNotMatch(source, /name !== "cockpit-battle\.png"/);
});
