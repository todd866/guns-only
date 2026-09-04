import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import { geographicToWorld } from "../okanagan_world.js";
import {
  OKANAGAN_FIRE_VISUAL_CONTRACT,
  createOkanaganFireEffects,
  okanaganFireVisualProfile,
  okanaganFireline,
  okanaganIncidentPlume,
} from "../okanagan_fire_effects.js";

const CELL_SIZE_M = 140;
const activeCell = Object.freeze({
  column: 20,
  row: 22,
  x: 1_200,
  y: 810,
  z: -2_400,
  intensity: 0.72,
});

function angularHeightDeg(sizeM, rangeM) {
  return Math.atan(sizeM / rangeM) * (180 / Math.PI);
}

test("published intensity owns fire presence and a cell-scale ground scar", () => {
  assert.equal(okanaganFireVisualProfile({ ...activeCell, intensity: 0.02 }), null);
  const profile = okanaganFireVisualProfile(activeCell, 12);

  assert.equal(profile.x, activeCell.x);
  assert.equal(profile.y, activeCell.y);
  assert.equal(profile.z, activeCell.z);
  assert.ok(profile.groundRadiusM >= CELL_SIZE_M * 0.55,
    "neighbouring cells must overlap so the flank reads as one fire, not orange dots");
  assert.ok(profile.groundRadiusM <= OKANAGAN_FIRE_VISUAL_CONTRACT.maximumGroundRadiusM);
  assert.ok(profile.outerHeightM > 18,
    "in-cell flame is timber-scale; the incident plume carries long-range smoke");
  assert.ok(profile.coreRadiusM < profile.outerRadiusM);
});

test("an established west-side fire has a column you can read from the lake join", () => {
  const lakeJoin = geographicToWorld(49.935, -119.492, 780);
  const westFlank = geographicToWorld(49.850, -119.655, 810);
  const rangeM = lakeJoin.distanceTo(westFlank);
  const cells = [
    { ...activeCell, x: westFlank.x, y: westFlank.y, z: westFlank.z, intensity: 0.72 },
    { ...activeCell, column: 21, x: westFlank.x + 140, y: westFlank.y, z: westFlank.z, intensity: 0.58 },
    { ...activeCell, column: 19, x: westFlank.x - 140, y: westFlank.y, z: westFlank.z, intensity: 0.61 },
  ];
  const plume = okanaganIncidentPlume(cells, 12);
  assert.ok(plume, "an established flank must publish one incident column");
  assert.ok(Math.abs(plume.x - westFlank.x) < 200);
  assert.ok(Math.abs(plume.z - westFlank.z) < 200);
  assert.ok(
    angularHeightDeg(plume.heightM, rangeM) >= 2.4,
    `column ${plume.heightM.toFixed(0)} m at ${rangeM.toFixed(0)} m is only `
      + `${angularHeightDeg(plume.heightM, rangeM).toFixed(2)}° from the lake`,
  );
  assert.ok(plume.pallRadiusM >= 220, "the pall must be wider than a cell so it reads as smoke, not a puff");
  assert.ok(plume.pallRadiusM >= 500, "from Kelowna the pall must be a sky feature, not a smudge");
  assert.ok(plume.heightM >= 1_400, "the column must clear the west-side ridge from the field");
});

test("hot cells on a flank produce a fireline you can aim from two kilometres", () => {
  const westFlank = geographicToWorld(49.850, -119.655, 810);
  const cells = [
    { ...activeCell, x: westFlank.x, y: westFlank.y, z: westFlank.z, intensity: 0.72 },
    { ...activeCell, column: 21, x: westFlank.x, y: westFlank.y, z: westFlank.z + 140, intensity: 0.64 },
    { ...activeCell, column: 22, x: westFlank.x, y: westFlank.y, z: westFlank.z + 280, intensity: 0.58 },
    { ...activeCell, column: 18, x: westFlank.x + 140, y: westFlank.y, z: westFlank.z + 140, intensity: 0.02 },
  ];
  const line = okanaganFireline(cells);
  assert.ok(line, "an established flank must publish a fireline");
  assert.ok(line.lengthM >= 250, `fireline was only ${line.lengthM.toFixed(0)} m`);
  assert.ok(line.heightM >= 36, "the front must clear timber from a drop run");
  assert.ok(line.widthM >= 40);
  assert.ok(angularHeightDeg(line.heightM, 2_000) >= 1.0,
    "from two kilometres the front must still have a degree of sky");
});

test("one authority cell produces a footprint, hot core, outer flame and smoke, plus an incident plume", () => {
  const scene = new THREE.Scene();
  const effects = createOkanaganFireEffects(scene, 2);
  const counts = effects.update([
    activeCell,
    { ...activeCell, column: 21, x: 1_340, intensity: 0.01 },
  ], 12);

  assert.equal(counts.cells, 1);
  assert.ok(counts.smokePuffs >= 1);
  assert.equal(counts.incidentPlumes, 1);
  assert.equal(counts.firelineSegments, 0, "a single cell is a column, not a flank");
  assert.equal(effects.layers.footprints.count, 1);
  assert.equal(effects.layers.flames.count, 1);
  assert.equal(effects.layers.cores.count, 1);
  assert.ok(effects.layers.plume.count >= 1);
  assert.equal(effects.group.parent, scene);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  effects.layers.flames.getMatrixAt(0, matrix);
  matrix.decompose(position, quaternion, scale);
  assert.equal(position.x, activeCell.x);
  assert.equal(position.z, activeCell.z);
  assert.ok(position.y > activeCell.y);
  assert.ok(scale.y > scale.x,
    "the authority cell must present as a flame column, not a flat marker");
});

test("quenched cells clear every visual layer and capacity remains bounded", () => {
  const scene = new THREE.Scene();
  const effects = createOkanaganFireEffects(scene, 1);
  const offset = { ...activeCell, column: 21, x: activeCell.x + 140 };
  const saturated = effects.update([activeCell, offset], 1);
  assert.equal(saturated.cells, 1);
  assert.equal(saturated.incidentPlumes, 1);

  const quenched = effects.update([{ ...activeCell, intensity: 0 }], 2);
  assert.deepEqual(quenched, {
    cells: 0, smokePuffs: 0, incidentPlumes: 0, firelineSegments: 0, steamPuffs: 0,
  });
  for (const layer of Object.values(effects.layers)) assert.equal(layer.count, 0);
});

test("credited water on the fire publishes steam that a miss does not", () => {
  const scene = new THREE.Scene();
  const effects = createOkanaganFireEffects(scene, 2);
  const miss = effects.update([activeCell], 4, new THREE.Vector3(0.42, 0, 0.91), {
    kg: 0,
    x: activeCell.x,
    y: activeCell.y,
    z: activeCell.z,
    dtSeconds: 1 / 60,
  });
  assert.equal(miss.steamPuffs, 0);

  const hit = effects.update([activeCell], 4, new THREE.Vector3(0.42, 0, 0.91), {
    kg: 420,
    x: activeCell.x,
    y: activeCell.y,
    z: activeCell.z,
    dtSeconds: 1 / 60,
  });
  assert.ok(hit.steamPuffs >= 4, "a credited drop must kick a visible steam cloud");
  assert.ok(effects.layers.steam.count >= 4);
});

test("a connected flank draws a fireline segment the drop run can fly", () => {
  const scene = new THREE.Scene();
  const effects = createOkanaganFireEffects(scene, 8);
  const westFlank = geographicToWorld(49.850, -119.655, 810);
  const counts = effects.update([
    { ...activeCell, x: westFlank.x, y: westFlank.y, z: westFlank.z, intensity: 0.72 },
    { ...activeCell, column: 21, x: westFlank.x, y: westFlank.y, z: westFlank.z + 140, intensity: 0.64 },
    { ...activeCell, column: 22, x: westFlank.x, y: westFlank.y, z: westFlank.z + 280, intensity: 0.58 },
  ], 8);
  assert.ok(counts.firelineSegments >= 1);
  assert.ok(effects.layers.fireline.count >= 1);
});

test("the fireline is a run of flame posts you can aim, not one glowing box", () => {
  const westFlank = geographicToWorld(49.850, -119.655, 810);
  const cells = [
    { ...activeCell, x: westFlank.x, y: westFlank.y, z: westFlank.z, intensity: 0.72 },
    { ...activeCell, column: 21, x: westFlank.x, y: westFlank.y, z: westFlank.z + 140, intensity: 0.64 },
    { ...activeCell, column: 22, x: westFlank.x, y: westFlank.y, z: westFlank.z + 280, intensity: 0.58 },
  ];
  const line = okanaganFireline(cells);
  assert.ok(line.posts.length >= 6, `flank only published ${line.posts?.length ?? 0} posts`);
  const spacings = line.posts.slice(1).map((post, index) => Math.hypot(
    post.x - line.posts[index].x,
    post.z - line.posts[index].z,
  ));
  assert.ok(Math.max(...spacings) <= 48, "posts must overlap so the front reads as a line");
  assert.ok(line.posts.every((post) => post.heightM >= 36));

  const scene = new THREE.Scene();
  const effects = createOkanaganFireEffects(scene, 8);
  effects.update(cells, 8);
  assert.ok(effects.layers.fireline.count >= line.posts.length);
  assert.equal(effects.layers.fireline.material.fog, false);
});

test("the incident column ignores valley fog so it still reads from the lake", () => {
  const scene = new THREE.Scene();
  const effects = createOkanaganFireEffects(scene, 2);
  effects.update([activeCell], 12);
  assert.equal(effects.layers.plume.material.fog, false);
  assert.equal(effects.layers.plume.material.isMeshBasicMaterial, true,
    "lit smoke washes into the haze; the column must be an unlit dark mass");
  assert.ok(effects.layers.plume.material.opacity >= 0.78);
});

test("credited steam sits on the fire, not at drop height", () => {
  const scene = new THREE.Scene();
  const effects = createOkanaganFireEffects(scene, 2);
  effects.update([activeCell], 4, new THREE.Vector3(0.42, 0, 0.91), {
    kg: 420,
    x: activeCell.x + 12,
    y: activeCell.y + 110,
    z: activeCell.z - 8,
    dtSeconds: 1 / 60,
  });
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  effects.layers.steam.getMatrixAt(0, matrix);
  matrix.decompose(position, quaternion, scale);
  assert.ok(Math.abs(position.y - activeCell.y) < 18,
    `steam spawned at ${position.y.toFixed(1)} m, fire is ${activeCell.y} m`);
});
