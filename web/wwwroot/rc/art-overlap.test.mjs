import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {buildLandmarks} from './open-world/landmarks.js';
import {createWorld} from './physics/world.mjs';

test('the shipped BX finish line has one painted surface per checker square', async () => {
  const bytes = fs.readFileSync(new URL('./assets/districts/bx.glb', import.meta.url));
  const {scene} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse(o => { if (o.isMesh && o.name.startsWith('VIS_')) meshes.push(o); });
  for (let k = 0; k < 17; k++) {
    const names = [];
    for (const x of [-.125, .125]) {
      // Avoid triangle diagonals, edges and bottom faces. These are the actual exported meshes.
      const ray = new T.Raycaster(new T.Vector3(x, .02, 42.9 - k * .5 - .19), new T.Vector3(0, -1, 0), 0, .015);
      const hits = ray.intersectObjects(meshes, false).filter(h => Math.abs(h.point.y - .006) < 1e-5);
      assert.equal(hits.length, 1, `checker ${k} at ${x}: overlapping paint surfaces`);
      names.push(hits[0].object.material.name);
    }
    assert.notEqual(names[0], names[1], 'neighbouring checker squares alternate');
  }
  scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
});

test('main-gate signs do not occupy the same plane and screen area', () => {
  const previous = globalThis.document;
  globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}, set: () => true})})};
  let art;
  try {
    const scene = new T.Scene();
    art = buildLandmarks(scene, createWorld());
    const signs = scene.children.filter(o => o.geometry?.type === 'PlaneGeometry' && Math.abs(o.position.z + 29) < .01);
    assert.ok(signs.length, 'the gate still has a location sign');
    scene.updateMatrixWorld(true);
    for (let i = 0; i < signs.length; i++) for (let j = i + 1; j < signs.length; j++)
      assert.equal(new T.Box3().setFromObject(signs[i]).intersectsBox(new T.Box3().setFromObject(signs[j])), false, 'coplanar gate labels flicker');
  } finally { art?.dispose(); globalThis.document = previous; }
});
