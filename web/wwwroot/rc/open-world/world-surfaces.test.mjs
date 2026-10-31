import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import {buildWorldSurfaces} from './world-surfaces.js';

test('world overlays remain upward, finite, bounded and disposable without physics', () => {
  const scene = new T.Scene(),
    art = buildWorldSurfaces(scene);
  let triangles = 0;
  assert.ok(art.root.children.length < 35, 'bounded material/tile batches');
  for (const mesh of art.root.children) {
    const p = mesh.geometry.attributes.position,
      n = mesh.geometry.attributes.normal,
      uv = mesh.geometry.attributes.uv;
    triangles += p.count / 3;
    assert.ok([...p.array, ...uv.array].every(Number.isFinite));
    for (let i = 0; i < p.count; i++) {
      assert.ok(n.getY(i) > 0.99, 'overlay faces the driver');
      assert.ok(p.getY(i) >= 0.015 && p.getY(i) < 0.03, 'visual depth does not become an obstacle');
    }
  }
  assert.ok(triangles < 150, 'surface pass cannot grow into a prop-heavy scene');
  art.dispose();
  assert.equal(scene.children.length, 0);
});
