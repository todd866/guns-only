import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {
  CLOUDS,
  createCloudField,
  updateCloudField,
  crossesCloudCore,
  sampleClouds,
  cloudLift
} from './clouds.mjs';
import {createClouds} from './clouds.js';
import {elevationAt} from './elevation.mjs';
import {loadProgress, saveProgress} from './catalog.mjs';
import {createFlight, stepFlight, FLIGHT} from '../physics/flight.mjs';
import {createCar} from '../physics/car.mjs';
import './sky-tour-canyon.test.mjs';

const elevation = JSON.parse(
  fs.readFileSync(new URL('../assets/world/playable-terrain.json', import.meta.url))
);
const ground = (x, z) => elevationAt(elevation, x, z);

test('14 drifting cumulus stay reachable above their ground, including track wraps', () => {
  const field = createCloudField(ground);
  assert.equal(CLOUDS.length, 14);
  assert.equal(CLOUDS.filter(c => c.along === null).length, 8);
  assert.equal(CLOUDS.filter(c => c.along !== null).length, 6);
  assert.ok(CLOUDS.reduce((n, c) => n + c.puffs, 0) <= 200);
  for (let tick = 0; tick < 400; tick++) {
    updateCloudField(field, 0.37);
    for (const c of field.clouds) {
      const groundY = ground(c.x, c.z);
      assert.ok(c.ground + c.base - groundY >= 70 && c.ground + c.base - groundY <= 100);
      assert.ok(c.ground + c.top - groundY >= 120);
      assert.ok(c.ground + c.top - groundY <= 135);
      assert.ok(c.ground + c.top < groundY + FLIGHT.ceiling);
      assert.ok(c.puffs >= 6 && c.puffs <= 12);
      const original = CLOUDS.find(d => d.id === c.id);
      if (original.along === null) assert.ok(Math.abs(c.x - original.x) <= 60);
    }
  }
});

test('a skim misses, a swept core collects once, and wheels/chutes cannot collect', () => {
  const field = createCloudField(),
    c = field.clouds[0];
  const pos = [c.x + c.radius * 0.7, c.y, c.z];
  assert.equal(crossesCloudCore(c, pos, pos), false);
  sampleClouds(field, pos);
  assert.equal(field.collectedMask, 0);
  const a = [c.x - 80, c.y, c.z],
    b = [c.x + 80, c.y, c.z];
  sampleClouds(field, b, a, false);
  assert.equal(field.collectedMask, 0);
  sampleClouds(field, b, a);
  assert.equal(field.collectedMask, 1);
  sampleClouds(field, b, a);
  assert.equal(field.collectedMask, 0);
  const saved = createCloudField(() => 0, [c.id]);
  sampleClouds(saved, b, a);
  assert.equal(saved.collectedMask, 0);
});

test('fog grows smoothly into the core; whoosh re-arms after leaving', () => {
  const field = createCloudField(),
    c = field.clouds[0],
    p = [c.x, c.y, c.z];
  sampleClouds(field, p);
  assert.equal(field.whoosh, true);
  assert.ok(field.fogTarget > 0.9);
  sampleClouds(field, p);
  assert.equal(field.whoosh, false);
  const deep = field.fogTarget;
  p[0] += c.radius * 0.6;
  sampleClouds(field, p);
  assert.ok(field.fogTarget > 0 && field.fogTarget < deep);
  p[0] += c.radius;
  sampleClouds(field, p);
  assert.equal(field.fogTarget, 0);
  p[0] = c.x;
  sampleClouds(field, p);
  assert.equal(field.whoosh, true);
  sampleClouds(field, p, p, false);
  assert.equal(field.fogTarget, 0);
});

test('rising air is local, at most 3m/s, and announced once per session', () => {
  const field = createCloudField(),
    c = field.clouds[0],
    p = [c.x, 30, c.z];
  assert.equal(cloudLift(field, p), 3);
  sampleClouds(field, p);
  assert.equal(field.rising, true);
  sampleClouds(field, p);
  assert.equal(field.rising, false);
  p[0] += c.radius * 0.9;
  assert.ok(cloudLift(field, p) > 0 && cloudLift(field, p) < 3);
  p[0] += c.radius;
  assert.equal(cloudLift(field, p), 0);
  p[0] = c.x;
  p[1] = c.base + 1;
  assert.equal(cloudLift(field, p), 0);
  p[1] = -1;
  assert.equal(cloudLift(field, p), 0);
});

const flatWorld = {
  raycast(origin, direction, reach) {
    if (direction[1] >= 0) return null;
    const dist = -origin[1] / direction[1];
    return dist >= 0 && dist <= reach ? {dist, normal: [0, 1, 0]} : null;
  }
};

test('real flight adds rising air before collision, caps at the ceiling, and excludes chutes', () => {
  const f = createFlight(),
    car = createCar();
  f.mode = 'fly';
  f.speed = 22;
  car.pos = [0, 20, 0];
  stepFlight(f, car, {assist: true, lift: 3}, flatWorld, 1 / 120);
  assert.ok(Math.abs(car.vel[1] - 3) < 1e-6);
  assert.ok(Math.abs(car.pos[1] - 20.025) < 1e-6);
  car.pos[1] = FLIGHT.ceiling - 0.1;
  for (let i = 0; i < 120; i++) stepFlight(f, car, {assist: true, lift: 30}, flatWorld, 1 / 120);
  assert.ok(car.pos[1] <= FLIGHT.ceiling);
  f.mode = 'chute';
  car.vel[1] = 0;
  stepFlight(f, car, {lift: 3}, flatWorld, 1 / 120);
  assert.ok(car.vel[1] < 0);
});

test('progress keeps only real cloud IDs and valid best times across save/load', () => {
  let data = JSON.stringify({
    clouds: ['cloud-1', 'cloud-1', 'cloud-14', 'cloud-15', null],
    canyonBest: 134.3
  });
  const storage = {
    getItem: () => data,
    setItem: (_, v) => {
      data = v;
    }
  };
  const p = loadProgress(storage);
  assert.deepEqual(p.clouds, ['cloud-1', 'cloud-14']);
  assert.equal(p.canyonBest, 134.3);
  saveProgress(storage, p);
  assert.deepEqual(loadProgress(storage).clouds, p.clouds);
  for (const bad of [-1, 0, '120', {}, null]) {
    data = JSON.stringify({clouds: 'cloud-1', canyonBest: bad});
    assert.deepEqual(loadProgress(storage).clouds, []);
    assert.equal(loadProgress(storage).canyonBest, null);
  }
});

test('cloud renderer shares one puff mesh, reuses buffers, hides in races and disposes resources', () => {
  const scene = new T.Scene(),
    view = createClouds(scene, ground, []),
    root = scene.children[0];
  const meshes = root.children.filter(o => o.isInstancedMesh);
  assert.equal(meshes.length, 1);
  assert.equal(meshes[0].count, 140);
  assert.equal(root.children.filter(o => o.isLight).length, 0);
  const matrix = meshes[0].instanceMatrix.array,
    fade = meshes[0].geometry.attributes.fade.array;
  view.frame(1 / 60, true);
  assert.equal(root.visible, true);
  view.frame(1 / 60, true);
  assert.equal(meshes[0].instanceMatrix.array, matrix);
  assert.equal(meshes[0].geometry.attributes.fade.array, fade);
  const c = view.state.clouds[0],
    p = [c.x, c.y, c.z];
  view.step(p, p, true);
  view.frame(1 / 60, true);
  assert.ok(view.state.fog > 0 && view.state.fog < view.state.fogTarget);
  view.frame(1 / 60, false);
  assert.equal(root.visible, false);
  assert.equal(view.state.fog, 0);
  const disposed = new Set();
  for (const child of root.children)
    for (const resource of [child.geometry, child.material])
      resource.addEventListener('dispose', () => disposed.add(resource));
  let instancesDisposed = false;
  meshes[0].addEventListener('dispose', () => {
    instancesDisposed = true;
  });
  view.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposed.size, 6);
  assert.ok(instancesDisposed);
});
