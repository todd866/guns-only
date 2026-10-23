import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import { createWorld } from '../physics/world.mjs';
import { buildWavepoolBeach } from './wavepool.js';
import { WAVEPOOL_BEACH } from './wavepool-course.mjs';

test('Wavepool Beach exposes the MK64 loop and a rejoining sandbar shortcut', () => {
  assert.equal(WAVEPOOL_BEACH.route[0][0], WAVEPOOL_BEACH.route.at(-1)[0]);
  assert.ok(WAVEPOOL_BEACH.route.length >= 10);
  assert.equal(WAVEPOOL_BEACH.sandbarShortcut.length, 3);
  assert.equal(WAVEPOOL_BEACH.sandbarShortcut[0][0], WAVEPOOL_BEACH.route[WAVEPOOL_BEACH.sandbarFromCheckpoint][0]);
  assert.equal(WAVEPOOL_BEACH.sandbarShortcut.at(-1)[0], WAVEPOOL_BEACH.route[WAVEPOOL_BEACH.sandbarToCheckpoint][0]);
});

test('Wavepool Beach builds, animates foam, and disposes cleanly', () => {
  const scene = new T.Scene();
  const world = createWorld(16);
  const beach = buildWavepoolBeach(scene, world);
  assert.equal(scene.children.includes(beach.root), true);
  const before = beach.root.children.find(o => o.name === 'WaveFoam_0').scale.x;
  const edge = beach.root.children.find(o => o.name === 'WavepoolFoamEdge');
  assert.equal(edge.material.isLineBasicMaterial, true, 'foam edge must use a line-safe GPU material');
  beach.update(1.25);
  const after = beach.root.children.find(o => o.name === 'WaveFoam_0').scale.x;
  assert.notEqual(before, after);
  for (const [a, b] of WAVEPOOL_BEACH.sandbarShortcut.slice(0, -1).map((p, i) => [p, WAVEPOOL_BEACH.sandbarShortcut[i + 1]])) {
    const x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2, y = (a[2] + b[2]) / 2;
    const hit = world.raycast([x, y + 1, z], [0, -1, 0], 2);
    assert.ok(hit && hit.surface === 'dirt', `sandbar segment at ${x},${z} should be drivable`);
  }
  const hit = world.raycast([-594, 4, 3340], [0, -1, 0], 8);
  assert.ok(hit && hit.surface === 'rock', 'tunnel shoulders should be solid');
  beach.dispose();
  assert.equal(scene.children.includes(beach.root), false);
});

