import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {BOUNDS} from './catalog.mjs';
import {nightRadiance} from './night-environment.js';
test('baked hero GLBs retain upright metre geometry and varied corner AO', async () => {
  for (const name of ['B-52', 'C-17', 'A-10']) {
    const b = fs.readFileSync(new URL('../assets/heroes/' + name + '.glb', import.meta.url)),
      g = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    let count = 0,
      shade = new Set();
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const a = o.geometry.attributes;
      count += (o.geometry.index?.count ?? a.position.count) / 3;
      assert.ok(a.color);
      for (let i = 0; i < a.color.count; i++) shade.add(a.color.getX(i));
    });
    assert.ok(count > 2000 && count < 15000);
    assert.ok(shade.size >= 4, name + ' actual occlusion');
    const box = new T.Box3().setFromObject(g.scene);
    assert.ok(box.max.y > 0 && box.min.y < 0);
    assert.ok(box.max.z - box.min.z > box.max.y - box.min.y);
  }
});
test('original night radiance includes HDR highlights without invalid values', () => {
  const d = nightRadiance();
  assert.ok(d.every(Number.isFinite));
  assert.ok(d.some(v => v > 1));
  assert.equal(d.length, 256 * 128 * 4);
});
test('optional hero download failure preserves procedural fallback and allows retry', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error('offline');
  };
  try {
    const {prepareHeroes, heroTemplate} = await import('./hero-assets.js');
    assert.equal(await prepareHeroes(), false);
    assert.equal(heroTemplate('B-52'), null);
    assert.equal(await prepareHeroes(), false);
  } finally {
    globalThis.fetch = old;
  }
});
test('landmark bake preserves world bounds, tile batches and vertex colors', async () => {
  const b = fs.readFileSync(new URL('../assets/heroes/landmarks.glb', import.meta.url)),
    g = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  let meshes = 0,
    triangles = 0,
    tintedGround = false;
  g.scene.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    assert.ok(o.geometry.attributes.color);
    const p = o.geometry.attributes.position,
      c = o.geometry.attributes.color;
    for (let i = 0; i < p.count; i++)
      if (
        p.getX(i) > 500 &&
        p.getX(i) < 800 &&
        p.getZ(i) > 0 &&
        p.getZ(i) < 100 &&
        p.getY(i) < 0.1 &&
        c.getX(i) < 0.4
      )
        tintedGround = true;
    for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
  });
  assert.ok(tintedGround, 'export retains authored apron colors, not default white');
  assert.ok(meshes < 80 && meshes > 10);
  // Budget, not a snapshot: the 23 Oct bake was 61.6k; the 31 Oct rebake (base dressing has grown,
  // outdoor ball return removed) is 85.5k in the same 54 meshes. Raise again only with a reason.
  assert.ok(triangles > 30000 && triangles < 100000);
  const box = new T.Box3().setFromObject(g.scene);
  // The bake must stay inside the playable world (catalog BOUNDS, which grew for Spirit Mountain
  // and the canyon), with a 50 m skirt for props that overhang the edge.
  assert.ok(box.min.x >= BOUNDS[0] - 50 && box.max.x <= BOUNDS[2] + 50, `x ${box.min.x}..${box.max.x}`);
  assert.ok(box.min.z >= BOUNDS[1] - 50 && box.max.z <= BOUNDS[3] + 50, `z ${box.min.z}..${box.max.z}`);
});
