import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as THREE from "../../../vendor/three.module.js";
import { missionLighting, applyMissionLighting, applyMissionTerrainLighting }
  from "../../environment/mission_lighting.js";
import { experienceById, experienceLaunchable } from "../../progression/campaign_progression.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [app, hud, sky, terrain, menu] = await Promise.all([
  read("../../../app.js"), read("../../../hud.js"), read("../scene_builders.js"),
  read("../../environment/korea_terrain.js"), read("../../../index.html"),
]);

test("shared scene constructs, updates and disposes the bounded relay pool", () => {
  assert.match(app, /this\.pathfinderRelays = createPathfinderRelays\(\)/);
  assert.match(app, /this\.scene\.add\(this\.pathfinderRelays\.group\)/);
  assert.match(app, /this\.pathfinderRelays\.update\(state\)/);
  assert.match(app, /this\.pathfinderRelays\.dispose\(\)/);
  assert.match(app, /if \(state.pathfinder\) this.updateGunEffects\(state, nowSeconds\)/);
  assert.match(app, /if \(opponentPresent \|\| state.pathfinder\) \{[\s\S]*?this.gunEffects.visible = true/);
});

test("canvas routes the relay gondola and ROE to the existing gun and mission cue surfaces", () => {
  assert.match(hud, /this\.worldPoint\.set\(cue.target.x, cue.target.y, -cue.target.z\)/);
  assert.match(hud, /this\.drawPathfinderTarget\(frame\)/);
  assert.match(hud, /if \(pathfinderHud\(state\)\?\.blocked\) return "ROE"/);
  assert.match(hud, /const cueColor = roeBlocked \? AMBER/);
  assert.match(hud, /if \(roeBlocked\) pipper.stroke = AMBER/);
  assert.match(hud, /directiveText = relayCue.row/);
  assert.match(hud, /const modeText = relayCue && missionPhase < 11 \? relayCue.row/);
  assert.match(app, /const relaySlot = nextPathfinderSlot\(latestState\);[\s\S]*?SetPlayerGunTargetSlot\?\.\(relaySlot\)/);
});

test("First Light is selectable through the existing Rapier catalogue route", () => {
  const entry = experienceById("rapier-pathfinders");
  assert.equal(entry.mission, 15);
  assert.equal(entry.aircraft, "Rapier");
  assert.equal(entry.title, "Pathfinders — First Light");
  assert.equal(entry.route, "/?program=rapier-pathfinders");
  assert.equal(experienceLaunchable(entry.id), true);
  assert.match(menu, /data-aircraft="rapier" data-program-node="rapier-pathfinders"/);
  assert.match(app, /"rapier-pathfinders": Object.freeze/);
});

test("dawn sun is visible above the FL650 horizon while ground stays before sunrise", () => {
  const lighting = missionLighting({ pathfinder: { sun_elevation_deg: -1.2 } });
  const dip = Math.acos(6371000 / (6371000 + 20600));
  assert.ok(lighting.sunY < 0);
  assert.ok(Math.asin(lighting.sunY) + dip > 0);
  assert.equal(missionLighting({}), null);
  assert.match(sky, /uDawn: \{ value: 0 \}/);
  assert.match(sky, /direction.y \+ dip \* uDawn/);
  assert.match(terrain, /lit = mix\(lit, lit \* vec3\(0.12, 0.19, 0.32\), uMissionDawn\)/);
});

test("mission light and shared ground haze settings reset without replacing renderer resources", () => {
  const color = () => new THREE.Color();
  const view = {
    sky: { uniforms: { uDawn: {value: 0}, uSunDirection: {value: new THREE.Vector3()}, uSoftWorld: {value: 0} } },
    fogLow: color(), fogHigh: color(), cloudFogColor: color(),
    ambient: {color: color(), groundColor: color(), intensity: 0.78},
    sun: {color: color(), intensity: 2.65}, renderer: {toneMappingExposure: 1.1},
  };
  const sun = new THREE.Vector3(0.50, 0.28, -0.82).normalize();
  const initialSun = sun.clone();
  const uniforms = { uMissionDawn: {value: 0}, uAtmosphereHazeColor: {value: color()} };
  const state = {pathfinder: {sun_elevation_deg: -1.2}};
  assert.equal(applyMissionLighting(view, state, sun), true);
  assert.equal(view.sky.uniforms.uDawn.value, 1);
  assert.equal(view.sky.uniforms.uSunDirection.value.y, sun.y);
  applyMissionTerrainLighting(uniforms, state);
  assert.equal(uniforms.uMissionDawn.value, 1);
  assert.ok(uniforms.uAtmosphereHazeColor.value.b > uniforms.uAtmosphereHazeColor.value.r);
  applyMissionLighting(view, {}, sun);
  applyMissionTerrainLighting(uniforms, {});
  assert.equal(view.sky.uniforms.uDawn.value, 0);
  assert.equal(uniforms.uMissionDawn.value, 0);
  assert.equal(uniforms.uAtmosphereHazeColor.value.r, 0.48);
  assert.deepEqual(sun, initialSun);
  assert.equal(view.ambient.intensity, 0.78);
  assert.equal(view.sun.intensity, 2.65);
  assert.equal(view.renderer.toneMappingExposure, 1.1);
  assert.match(app, /SUN_DIRECTION.set\(0.50, 0.28, -0.82\).normalize\(\)/);
});
