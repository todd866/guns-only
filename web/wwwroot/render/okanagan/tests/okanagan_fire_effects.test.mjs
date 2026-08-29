import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import {
  OKANAGAN_FIRE_VISUAL_CONTRACT,
  createOkanaganFireEffects,
  okanaganFireVisualProfile,
} from "../okanagan_fire_effects.js";

const activeCell = Object.freeze({
  column: 20,
  row: 22,
  x: 1_200,
  y: 810,
  z: -2_400,
  intensity: 0.72,
});

test("published intensity owns fire presence and its readable in-cell envelope", () => {
  assert.equal(okanaganFireVisualProfile({ ...activeCell, intensity: 0.02 }), null);
  const profile = okanaganFireVisualProfile(activeCell, 12);

  assert.equal(profile.x, activeCell.x);
  assert.equal(profile.y, activeCell.y);
  assert.equal(profile.z, activeCell.z);
  assert.ok(profile.groundRadiusM >= 44);
  assert.ok(profile.groundRadiusM <= OKANAGAN_FIRE_VISUAL_CONTRACT.maximumGroundRadiusM);
  assert.ok(profile.outerHeightM > 70,
    "an established cell must read above the timber on ingress");
  assert.ok(profile.coreRadiusM < profile.outerRadiusM);
});

test("one authority cell produces a footprint, hot core, outer flame and smoke column", () => {
  const scene = new THREE.Scene();
  const effects = createOkanaganFireEffects(scene, 2);
  const counts = effects.update([
    activeCell,
    { ...activeCell, column: 21, x: 1_340, intensity: 0.01 },
  ], 12);

  assert.deepEqual(counts, {
    cells: 1,
    smokePuffs: OKANAGAN_FIRE_VISUAL_CONTRACT.smokeLayersPerCell,
  });
  assert.equal(effects.layers.footprints.count, 1);
  assert.equal(effects.layers.flames.count, 1);
  assert.equal(effects.layers.cores.count, 1);
  assert.equal(effects.layers.smoke.count, 3);
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
  assert.deepEqual(saturated, { cells: 1, smokePuffs: 3 });

  const quenched = effects.update([{ ...activeCell, intensity: 0 }], 2);
  assert.deepEqual(quenched, { cells: 0, smokePuffs: 0 });
  for (const layer of Object.values(effects.layers)) assert.equal(layer.count, 0);
});
