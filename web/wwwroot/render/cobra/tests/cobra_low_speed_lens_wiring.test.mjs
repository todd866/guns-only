import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(
  new URL("../../../cobra-lab/main.js", import.meta.url),
  "utf8",
);

test("Cobra widens only the low-speed cockpit while retaining a fixed optical centre", () => {
  assert.match(main, /from "\.\.\/render\/camera\/low_speed_lens\.js\?v=350"/);
  assert.match(main, /wideFovDeg:\s*70/);
  assert.match(main, /cruiseFovDeg:\s*DEFAULT_CAMERA_FOV_DEG/);
  assert.match(main, /ground_speed_mps/);
  assert.match(main, /lowSpeedLensTarget\([\s\S]*COBRA_LOW_SPEED_LENS/);
  assert.match(main, /advanceLowSpeedLens\([\s\S]*presenceDeltaSeconds/);
  assert.match(main, /camera\.fov = cobraLowSpeedLens\.fovDeg;[\s\S]*camera\.updateProjectionMatrix\(\)/);
  assert.match(main, /principal point never[\s\S]*remain honest at the centre/);
  assert.match(main, /cockpitLensEvidence\(\)[\s\S]*fovDeg: camera\.fov/);
  assert.match(main, /opticalCenterX01: cobraLowSpeedLens\.opticalCenterX01/);
});

test("proof-camera release resets both the camera and the smoothed flight lens", () => {
  assert.match(main, /release\(\) \{[\s\S]*camera\.fov = DEFAULT_CAMERA_FOV_DEG;[\s\S]*cobraLowSpeedLens = neutralLowSpeedLens\(COBRA_LOW_SPEED_LENS\)/);
});
