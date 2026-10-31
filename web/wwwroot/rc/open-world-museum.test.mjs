import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {buildMuseum} from './open-world/museum.js';
import {createWorld} from './physics/world.mjs';

test('museum hardware is bounded, finite, collision-safe, dynamic, and disposable', () => {
  const scene = new T.Scene(),
    world = createWorld(),
    museum = buildMuseum(scene, world),
    meshes = [];
  scene.traverse(o => {
    if (o.isMesh) meshes.push(o);
  });
  assert.ok(meshes.length <= 32, `museum uses ${meshes.length} meshes`);
  let triangles = 0,
    disposed = 0;
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    triangles += (m.geometry.index?.count ?? p.count) / 3;
    m.geometry.addEventListener('dispose', () => disposed++);
    for (const v of p.array) assert.ok(Number.isFinite(v), 'finite geometry');
  }
  assert.ok(triangles < 15000, `museum uses ${triangles} triangles`);
  const box = new T.Box3().setFromObject(scene);
  assert.ok(box.min.x > -1412 && box.max.x < -1310);
  assert.ok(box.min.z > 1992 && box.max.z < 2059);
  assert.equal(world.tris.length, 74, 'solid chassis collision boxes');
  assert.equal(world.sphereContacts([-1361, 1, 2074], 0.8).length, 0, 'entrance remains open');
  assert.ok(meshes.some(m => m.name === 'zsu-23-4-four-barrel-turret'));
  assert.equal(meshes.filter(m => m.name === 'fan-song-side-dish').length, 2);
  assert.ok(meshes.some(m => m.name === 'fan-song-rectangular-antenna'));
  const before = scene.children[0].children.find(o => o.type === 'Group');
  museum.update(0, [-1300, 0, 2040]);
  const first = before.rotation.y;
  museum.update(Math.PI, [-1400, 0, 2040]);
  assert.notEqual(first, before.rotation.y, 'radar tracks player');
  museum.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, meshes.length, 'all geometry disposal events observed');
});
