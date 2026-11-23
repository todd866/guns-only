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

// Playtest 7 Nov, hub skatepark. The two bowl samples are the flat concrete the car was
// sitting on (y≈0.23), beside short lips. The wall it was nose-into is the sim unstick
// case; these points must not fall through and must still roll.
const RECORDED = {
  bowl: [
    [-3019, 0.23, -775],
    [-3033, 0.24, -792]
  ],
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

test('the recorded bowl spots roll toward the hub and stay above the floor', () => {
  const {world} = parkWorld();
  const center = parkPoint([0, 0.2, 0]);
  for (const spot of RECORDED.bowl) {
    const yaw = Math.atan2(center[0] - spot[0], -(center[2] - spot[2]));
    const course = {
      world,
      checkpoints: [
        [center[0], center[2], 'centre'],
        [center[0], center[2] - 1, 'on']
      ],
      secrets: [],
      start: {pos: [spot[0], 0.4, spot[2]], yaw}
    };
    const s = createSession(course, {mode: 'kid'});
    s.roam = true;
    placeCar(s.car, [spot[0], 0.4, spot[2]], yaw);
    const start = [s.car.pos[0], s.car.pos[2]];
    let minY = s.car.pos[1];
    for (let i = 0; i < 120 * 8; i++) {
      const r = readout(s);
      const e = Math.atan2(center[0] - r.x, -(center[2] - r.z)) - r.yaw;
      const err = Math.atan2(Math.sin(e), Math.cos(e));
      stepSession(s, {throttle: 1, steer: Math.max(-1, Math.min(1, err * 2))});
      minY = Math.min(minY, s.car.pos[1]);
    }
    const moved = Math.hypot(s.car.pos[0] - start[0], s.car.pos[2] - start[1]);
    assert.equal(s.recoveries, 0, `teleported at ${spot}`);
    assert.ok(minY > -1, `fell under the park at ${spot} (y ${minY})`);
    assert.ok(moved > 2, `planted at ${spot} (${moved.toFixed(2)} m)`);
  }
});
