import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld} from '../physics/world.mjs';
import {createCar, stepCar, rideHeight, placeCar} from '../physics/car.mjs';
import {createSession, stepSession, readout} from '../physics/session.mjs';
import {courseFromGlb} from '../physics/district.mjs';
import {placeDistrictCourse} from './district-placement.mjs';
import {perimeterSkirts} from './park-skirt.mjs';
import {RESIDENTIAL_PARK, parkPoint} from './residential-frame.mjs';
import {createResidentialTerrain, boundsOfPoints} from './residential-terrain.mjs';

// Playtest 7 Nov, hub skatepark.
const RECORDED = {
  bowl: [-3019, 0.23, -775],
  under: [-2998, -2.31, -704]
};

function parkWorld() {
  const bytes = fs.readFileSync(new URL('../assets/districts/skatepark.glb', import.meta.url));
  const placed = placeDistrictCourse(courseFromGlb(bytes), RESIDENTIAL_PARK);
  const world = createWorld(4);
  for (const t of placed.world.tris) world.addTri(t.a, t.b, t.c, t.surface);
  for (const q of perimeterSkirts(placed.world)) world.addQuad(...q, 'concrete');
  const terrainData = JSON.parse(
    fs.readFileSync(new URL('../assets/world/residential-terrain.json', import.meta.url))
  );
  const residential = JSON.parse(fs.readFileSync(new URL('../assets/world/residential.json', import.meta.url)));
  const parkPad = boundsOfPoints(
    [parkPoint([-28, 0, -28]), parkPoint([-28, 0, 28]), parkPoint([28, 0, 28]), parkPoint([28, 0, -28])].map(
      p => [p[0], p[2]]
    )
  );
  const raw = createResidentialTerrain(terrainData, {bounds: residential.bounds, edgeFeather: 128});
  const pads = residential.buildings
    .filter(b => b.kind === 'school' || b.kind === 'civic')
    .map(b => {
      const bounds = boundsOfPoints(b.points);
      if (!bounds) return null;
      const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
      return {bounds, datum: raw.rawHeightAt(...center), feather: 25};
    })
    .filter(Boolean);
  const terrain = createResidentialTerrain(terrainData, {
    bounds: residential.bounds,
    edgeFeather: 128,
    pads: terrainData.pads ?? [...(parkPad ? [{bounds: parkPad, datum: 0, feather: 50}] : []), ...pads]
  });
  for (const tri of terrain.triangles()) {
    const xs = tri.map(p => p[0]),
      zs = tri.map(p => p[2]);
    if (Math.max(...xs) < -3160 || Math.min(...xs) > -2880 || Math.max(...zs) < -1000 || Math.min(...zs) > -620)
      continue;
    world.addTri(...tri, 'grass');
  }
  return {world, terrain};
}

test('a car under the residential skin at the recorded spot is put back on it, not left at y=-8', () => {
  const {world, terrain} = parkWorld();
  const [x, , z] = RECORDED.under;
  const ground = terrain.heightAt(x, z);
  assert.ok(ground < -2 && ground > -4, `terrain at the recorded point is ${ground}`);
  const car = createCar(undefined, [x, -8, z], 0);
  for (let i = 0; i < 30; i++) stepCar(car, {}, world, 1 / 120);
  assert.ok(car.pos[1] > ground && car.pos[1] < ground + rideHeight() + 0.25, `y ${car.pos[1]} ground ${ground}`);
  assert.ok(Math.abs(car.pos[0] - x) < 0.05 && Math.abs(car.pos[2] - z) < 0.05, 'stays on the same spot');
});

test('a car in a room under a ceiling is not ejected through the roof', () => {
  const world = createWorld();
  world.addQuad([-4, 0, -4], [-4, 0, 4], [4, 0, 4], [4, 0, -4], 'concrete');
  world.addQuad([-4, 2, 4], [-4, 2, -4], [4, 2, -4], [4, 2, 4], 'concrete');
  const car = createCar(undefined, [0, rideHeight() + 0.02, 0], 0);
  for (let i = 0; i < 60; i++) stepCar(car, {throttle: 0.2}, world, 1 / 120);
  assert.ok(car.pos[1] < 1, `ejected to ${car.pos[1]}`);
  assert.ok(car.pos[1] > 0, `fell through the floor ${car.pos[1]}`);
});

test('throttle into the recorded skatepark wedge hops the car free without a teleport', () => {
  const {world} = parkWorld();
  const center = parkPoint([0, 0.2, 0]);
  const course = {
    world,
    checkpoints: [
      [center[0], center[2], 'centre'],
      [center[0], center[2] - 1, 'on']
    ],
    secrets: [],
    start: {pos: [RECORDED.bowl[0], 0.4, RECORDED.bowl[2]], yaw: 0}
  };
  const s = createSession(course, {mode: 'kid'});
  s.roam = true;
  const yaw = Math.atan2(center[0] - RECORDED.bowl[0], -(center[2] - RECORDED.bowl[2]));
  placeCar(s.car, [RECORDED.bowl[0], 0.4, RECORDED.bowl[2]], yaw);
  let slowAt = null,
    escaped = 0;
  for (let i = 0; i < 120 * 12; i++) {
    const r = readout(s);
    const e = Math.atan2(center[0] - r.x, -(center[2] - r.z)) - r.yaw;
    const err = Math.atan2(Math.sin(e), Math.cos(e));
    const before = [s.car.pos[0], s.car.pos[2]];
    stepSession(s, {throttle: 1, steer: Math.max(-1, Math.min(1, err * 2))});
    const step = Math.hypot(s.car.pos[0] - before[0], s.car.pos[2] - before[2]);
    if (i > 120 * 3 && s.car.speed < 0.4 && step < 0.01) slowAt ??= [s.car.pos[0], s.car.pos[2]];
    if (slowAt) escaped = Math.max(escaped, Math.hypot(s.car.pos[0] - slowAt[0], s.car.pos[2] - slowAt[2]));
  }
  assert.equal(s.recoveries, 0, 'teleported');
  assert.ok(slowAt, 'the recorded line never wedged, so the fixture is not the playtest');
  assert.ok(escaped > 0.4, `still planted after the hop (${escaped.toFixed(2)} m)`);
  assert.ok(s.car.pos[1] > -1, `fell under the park ${s.car.pos[1]}`);
});
