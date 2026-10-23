import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import { createWorld } from '../physics/world.mjs';
import { buildWavepoolBeach } from './wavepool.js';
import { WAVEPOOL_BEACH } from './wavepool-course.mjs';

test('Wavepool Beach exposes the MK64 loop and a rejoining sandbar shortcut', () => {
  assert.equal(WAVEPOOL_BEACH.route[0][0], WAVEPOOL_BEACH.route.at(-1)[0]);
  assert.ok(WAVEPOOL_BEACH.route.length >= 10);
  assert.equal(WAVEPOOL_BEACH.sandbarShortcut.length, 4);
});

test('Wavepool Beach builds, animates foam, and disposes cleanly', () => {
  const scene = new T.Scene();
  const world = createWorld(16);
  const beach = buildWavepoolBeach(scene, world);
  assert.equal(scene.children.includes(beach.root), true);
  const before = beach.root.children.find(o => o.name === 'WaveFoam_0').scale.x;
  beach.update(1.25);
  const after = beach.root.children.find(o => o.name === 'WaveFoam_0').scale.x;
  assert.notEqual(before, after);
  const hit = world.raycast([-594, 4, 3340], [0, -1, 0], 8);
  assert.ok(hit && hit.surface === 'rock', 'tunnel shoulders should be solid');
  beach.dispose();
  assert.equal(scene.children.includes(beach.root), false);
});

