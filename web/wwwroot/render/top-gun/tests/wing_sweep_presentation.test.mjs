import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createF14 } from "../../scene/scene_builders.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const [appSource, hudSource] = await Promise.all([
  "web/wwwroot/app.js",
  "web/wwwroot/hud.js",
].map((relativePath) => readFile(path.join(ROOT, relativePath), "utf8")));

test("F-14 exterior articulates both wing panels from authoritative sweep degrees", () => {
  const tomcat = createF14();
  const left = tomcat.getObjectByName("F14_WING_PIVOT_LEFT");
  const right = tomcat.getObjectByName("F14_WING_PIVOT_RIGHT");
  const setSweep = tomcat.userData.setWingSweepDegrees;

  assert.ok(left && right);
  assert.equal(typeof setSweep, "function");
  setSweep(44);
  assert.ok(Math.abs(left.rotation.y - 24 * Math.PI / 180) < 1e-12);
  assert.ok(Math.abs(right.rotation.y + 24 * Math.PI / 180) < 1e-12);
  assert.equal(tomcat.userData.wingSweepDegrees, 44);

  setSweep(90);
  assert.equal(tomcat.userData.wingSweepDegrees, 68);
  assert.ok(Math.abs(left.rotation.y - 48 * Math.PI / 180) < 1e-12);
  setSweep(-10);
  assert.equal(tomcat.userData.wingSweepDegrees, 20);
});

test("Top Gun binds the F-14 factory and feeds only snapshot-owned actual sweep", () => {
  assert.match(appSource,
    /\["presentation\.vehicle\.f14a\.public-data-surrogate\.v1", createF14\]/);
  assert.match(appSource,
    /playerExteriorSlot\.object\?\.userData[\s\S]*?setWingSweepDegrees\?\.\(state\.wing_sweep_deg\)/);
  assert.match(appSource,
    /targetSlot\.object\?\.userData[\s\S]*?setWingSweepDegrees\?\.\(state\.opponent_wing_sweep_deg\)/);
  assert.doesNotMatch(appSource,
    /setWingSweepDegrees\?\.\([^)]*(?:mach|kcas|airspeed)/i,
    "presentation must not invent a second automatic schedule");
});

test("HUD keeps actual wing angle, mode, manual keys, and structural warning observable", () => {
  assert.match(hudSource,
    /drawF14WingSweep\(state\)[\s\S]*?wing_sweep_deg[\s\S]*?wing_sweep_mode_code[\s\S]*?WING SWEEP/);
  assert.match(hudSource,
    /binding\("wingSweepForward", "Comma"\)[\s\S]*?binding\("wingSweepAft", "Period"\)[\s\S]*?binding\("wingSweepAuto", "Slash"\)/);
  assert.match(hudSource, /state\.f14_over_g === true[\s\S]*?OVER-G/);
  assert.match(hudSource, /f14_structural_fatigue_01[\s\S]*?AIRFRAME STRAIN/);
});
