import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Weekend Ride gives the helmet view the full viewport and keeps prose in H controls", async () => {
  const [html, css, main] = await Promise.all([
    source("weekend-ride/index.html"),
    source("weekend-ride/styles.css"),
    source("weekend-ride/main.js"),
  ]);

  assert.doesNotMatch(html, /<aside\b|class="instructions"/);
  assert.doesNotMatch(html, /Gamepad: left stick|temporary runway circuit/);
  assert.match(html, /<section class="viewport" aria-label="Helmet-mounted weekend ride">/);
  assert.match(css, /\.viewport\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/);
  assert.doesNotMatch(css, /grid-template-columns:\s*240px/);

  assert.match(main, /createControlsOnboarding/);
  assert.match(main, /WEEKEND_RIDE_ONBOARDING_CONTENT/);
  assert.match(main, /maybeShowFirstRun\(\)/);
});

test("first-person presence and RPM telemetry consume authoritative ride state", async () => {
  const main = await source("weekend-ride/main.js");

  assert.match(main, /render\/motorcycle\/r1_first_person\.js\?v=\d+/);
  assert.match(main, /camera\.add\(r1FirstPerson\.object3d\)/);
  assert.match(main, /r1FirstPerson\.update\(state\)/);
  assert.match(main, /ride_engine_rpm:\s*state\.rpm/);
  assert.doesNotMatch(main, /ride_engine_rpm:\s*state\.engine_rpm/);
});

test("one connected Weekend world consumes the one-time open-road graph and exact atlas", async () => {
  const main = await source("weekend-ride/main.js");

  assert.match(main, /weekend_open_road_presentation\.js\?v=\d+/);
  assert.match(main, /new THREE\.TextureLoader\(\)\.load\(WEEKEND_ROADSIDE_ATLAS_URL\)/);
  assert.match(main, /buildOpenRoadPresentation\(JSON\.parse\(bridge\.GetRoadNetwork\(\)\)\)/);
  assert.match(main, /surfaceTexture:\s*trackSurfaceTexture/);
  assert.match(main, /roadsideAtlas:\s*roadsideAtlasTexture/);
  assert.match(main, /window\.__gunsOnlyWeekendOpenRoad = openRoadPresentation\.plan/);
  assert.match(main, /new THREE\.PerspectiveCamera\(68, 1, 0\.25, 24_000\)/);
  assert.doesNotMatch(main, /GetRoadNetwork\([^)]+\)/);
});

test("Weekend golden path is sim-authored and shared rather than re-planned in the renderer", async () => {
  const main = await source("weekend-ride/main.js");

  assert.match(main, /state\.golden_path_token/);
  assert.match(main, /state\.golden_path_kind/);
  assert.match(main, /__gunsOnlyWeekendGoldenPath/);
  assert.match(main, /ride_on_open_road:\s*state\.on_open_road/);
  assert.match(main, /ride_open_road_distance_m:\s*state\.open_road_distance_m/);
  assert.doesNotMatch(main, /planWeekendGoldenPathCue\(/);
});

test("detailed engineering HUD is off by default and remains keyboard and pointer accessible", async () => {
  const [html, main] = await Promise.all([
    source("weekend-ride/index.html"),
    source("weekend-ride/main.js"),
  ]);

  assert.match(html, /id="diagnostics-toggle"[\s\S]*?aria-keyshortcuts="I"[\s\S]*?aria-pressed="false"/);
  assert.match(html, /id="ride-announcer"[\s\S]*?aria-live="polite"/);
  assert.match(main, /setDiagnosticsEnabled\(false, \{ announce: false \}\)/);
  assert.match(main, /event\.code === "KeyI"/);
  assert.match(main, /diagnosticsToggle\?\.addEventListener\("click", toggleDiagnostics\)/);
  assert.match(main, /helmetHud\.setDiagnosticsEnabled\(diagnosticsEnabled\)/);
});
