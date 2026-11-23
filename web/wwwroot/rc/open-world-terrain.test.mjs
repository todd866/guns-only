import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {terrainMesh} from './open-world/terrain.mjs';
import {createTerrain} from './open-world/terrain.js';
import {BOUNDS} from './open-world/catalog.mjs';
test('source DEM horizon is finite, upward-facing and excludes playable floor', () => {
  const data = JSON.parse(fs.readFileSync(new URL('./assets/world/terrain.json', import.meta.url))),
    {positions: p, indices} = terrainMesh(data, BOUNDS);
  assert.equal(data.width, 257);
  assert.ok(Math.max(...data.valuesM) > 1400);
  assert.ok(p.every(Number.isFinite));
  assert.ok(indices.length > 300000);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3).map(k => p.slice(k * 3, k * 3 + 3)),
      x = (a[0] + b[0] + c[0]) / 3,
      z = (a[2] + b[2] + c[2]) / 3;
    assert.ok(x < BOUNDS[0] || x > BOUNDS[2] || z < BOUNDS[1] || z > BOUNDS[3]);
    assert.ok((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0);
  }
});
test('horizon slices leave the ranges behind the hub camera out of the draw', () => {
  const data = JSON.parse(fs.readFileSync(new URL('./assets/world/terrain.json', import.meta.url))),
    scene = new T.Scene(),
    horizon = createTerrain(scene, data, BOUNDS),
    meshes = scene.children.filter(mesh => mesh.name === 'USGS_DEM_Horizon'),
    eye = new T.Vector3(-3023, 80, -776);
  assert.ok(meshes.length >= 8 && meshes.length <= 40, `horizon blocks ${meshes.length}`);
  let contains = 0,
    tris = 0;
  for (const mesh of meshes) {
    const sphere = mesh.geometry.boundingSphere;
    tris += mesh.geometry.index.count / 3;
    if (sphere.center.distanceTo(eye) <= sphere.radius) contains++;
  }
  assert.ok(contains <= 2, `blocks containing the hub camera ${contains}`);
  assert.ok(tris > 100000, `horizon triangles ${tris}`);
  horizon.update(0.4, false);
  assert.ok(meshes.every(mesh => mesh.visible));
  horizon.update(0.4, true);
  assert.ok(meshes.every(mesh => !mesh.visible));
  horizon.dispose();
  assert.equal(scene.children.length, 0);
});
