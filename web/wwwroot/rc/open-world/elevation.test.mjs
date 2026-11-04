import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {elevationAt, groundTriangles} from './elevation.mjs';
import {createStream} from './stream.mjs';
import {EVENTS, LOCATIONS} from './catalog.mjs';
import {createSession, stepSession} from '../physics/session.mjs';
import {MARSEILLE_TERRAIN} from './marseille-site.mjs';
const data = JSON.parse(fs.readFileSync(new URL('../assets/world/playable-terrain.json', import.meta.url)));
test('source contours are nonflat but runtime grading protects every venue and race gate', () => {
  assert.ok(data.values.some(v => v > 10));
  assert.ok(data.values.some(v => v < -5));
  // The Canyon Run is down in the carved canyon on purpose; every other place is graded flat.
  for (const p of LOCATIONS.filter(p => p.game !== 'canyon-run'))
    assert.equal(elevationAt(data, p.pos[0], p.pos[2], MARSEILLE_TERRAIN), 0, p.id);
  for (const e of EVENTS)
    for (const p of e.points) assert.equal(elevationAt(data, p[0], p[1], MARSEILLE_TERRAIN), 0, e.id);
});
test('terrain diagonal interpolation matches collision and remains continuous at tile seams', async () => {
  const stream = createStream({manifest: {tiles: []}, fetchTile: () => {}, elevation: data});
  const k = data.values.findIndex(v => v > 10),
    x = data.origin[0] + (k % data.width) * data.step,
    z = data.origin[1] + Math.floor(k / data.width) * data.step;
  await stream.update([x, 0, z]);
  for (const [a, b] of [
    [x, z],
    [x + 3, z + 5],
    [x + 12, z + 11]
  ]) {
    const h = elevationAt(data, a, b),
      hit = stream.world.raycast([a, h + 5, b], [0, -1, 0], 10);
    assert.ok(hit);
    assert.ok(Math.abs(hit.point[1] - h) < 1e-7);
    assert.ok(hit.normal[1] > 0.95);
  }
  const tris = groundTriangles(data, [0, 0, 256, 256]);
  assert.equal(tris.length, 512);
  stream.dispose();
});
test('ordinary car input traverses a sourced natural slope without floor penetration', async () => {
  const k = data.values.findIndex(v => v > 10),
    x = data.origin[0] + (k % data.width) * data.step,
    z = data.origin[1] + Math.floor(k / data.width) * data.step,
    stream = createStream({manifest: {tiles: []}, fetchTile: () => {}, elevation: data});
  await stream.update([x, 0, z]);
  const {eventCourse} = await import('./catalog.mjs');
  const course = eventCourse(EVENTS[0], stream.world);
  course.start = {pos: [x, elevationAt(data, x, z), z], yaw: 0};
  const s = createSession(course, {mode: 'bigKid'});
  s.roam = true;
  for (let i = 0; i < 600; i++) {
    stepSession(s, {throttle: 1}, 1 / 120);
    assert.ok(s.car.pos[1] > elevationAt(data, s.car.pos[0], s.car.pos[2]) - 0.3);
  }
  assert.ok(s.travel > 8);
  stream.dispose();
});
test('height triangles resolve narrow activity surfaces at contact coordinates', async () => {
  const stream = createStream({manifest: {tiles: []}, fetchTile: () => {}, elevation: data});
  await stream.update([-555, 0, 3388]);
  const hit = stream.world.raycast([-555, 2, 3388], [0, -1, 0], 3);
  assert.equal(hit.surface, 'water');
  assert.ok(stream.world.sphereContacts([-555, 0.1, 3388], 0.2).some(h => h.surface === 'water'));
  assert.notEqual(stream.world.raycast([-555, 2, 3326], [0, -1, 0], 3).surface, 'water');
  // The wavepool is a real basin now (physics/water.mjs): water surface, floor below the beach.
  {
    const pool = stream.world.raycast([-545, 2, 3357], [0, -1, 0], 4);
    assert.equal(pool.surface, 'water');
    assert.ok(pool.point[1] < -0.3, `basin floor ${pool.point[1]}`);
  }
  stream.dispose();
});
