import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {buildDressing} from './open-world/base-dressing.js';
import {createWorld} from './physics/world.mjs';
test('base dressing is finite, bounded, batched, and disposable', () => {
  const scene = new T.Scene(),
    world = createWorld(),
    d = buildDressing(scene, world),
    ms = [];
  scene.traverse(o => {
    if (o.isMesh) ms.push(o);
  });
  assert.equal(ms.length, 1);
  const p = ms[0].geometry.attributes.position;
  for (const v of p.array) assert.ok(Number.isFinite(v));
  assert.ok(p.count / 3 < 12000);
  assert.ok(world.tris.length > 0);
  d.dispose();
  assert.equal(scene.children.length, 0);
});
