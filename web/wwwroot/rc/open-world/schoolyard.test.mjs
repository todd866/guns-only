import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld } from '../physics/world.mjs';
import { createSession, stepSession } from '../physics/session.mjs';
import { placeCar, rideHeight } from '../physics/car.mjs';
import { createSkate, stepSkate } from '../physics/skate.mjs';
import { createResidentialTerrain } from './residential-terrain.mjs';
import { RESIDENTIAL_BOUNDS } from './residential-frame.mjs';
import { SCHOOLYARD, SCHOOL_PARK, YARD_PAD, POOL_HOLE, buildSchoolyard, yardWorld, yardLocal, poolDepth } from './schoolyard.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../assets/world/residential-terrain.json', import.meta.url)));
const terrain = createResidentialTerrain(data, { bounds: RESIDENTIAL_BOUNDS, edgeFeather: 128, pads: [YARD_PAD], holes: [POOL_HOLE] });
const world = createWorld(4);
for (const [a, b, c] of terrain.triangles()) world.addTri(a, b, c, 'grass');
for (const t of buildSchoolyard(terrain.holes[0])) world.addTri(t.a, t.b, t.c, t.surface);
const course = { world, checkpoints: [[-3375, -760, 'a'], [-3374, -760, 'b']], secrets: [], start: { pos: yardWorld([0, 0, 0]), yaw: 0 } };
const frame = p => { const l = yardLocal(p); return [l[0], l[2], l[1]]; };
const ground = (x, z) => world.raycast(yardWorld([x, 8, z]), [0, -1, 0], 15)?.point[1] - SCHOOLYARD.datum;

function run(x, z, dx, dz, throttle, seconds) {
  const s = createSession(course, { mode: 'kid' }); s.roam = true;
  const p = yardWorld([x, 6, z]); p[1] = world.raycast(p, [0, -1, 0], 12).point[1] + rideHeight() + .01;
  placeCar(s.car, p, Math.atan2(dx, -dz));
  const sk = createSkate(SCHOOL_PARK); sk.left = seconds; const events = [];
  for (let f = 0; f < (seconds + 4) * 120 && !sk.over; f++) { stepSession(s, { throttle, steer: 0 }, 1 / 120); events.push(...stepSkate(sk, s, { throttle }, 1 / 120, frame)); }
  return { s, sk, gaps: events.filter(e => e.type === 'gap').map(e => e.name), events };
}

test('the pool is cut into the levelled field and its deck meets the lawn flush', () => {
  const [x0, z0, x1, z1] = terrain.holes[0].map((v, i) => v - SCHOOLYARD.center[i % 2]);
  for (const [x, z] of [[x0 - .4, (z0 + z1) / 2], [x1 + .4, (z0 + z1) / 2], [(x0 + x1) / 2, z0 - .4], [(x0 + x1) / 2, z1 + .4]])
    assert.ok(Math.abs(ground(x, z)) < .02, `lawn at the datum beside the hole ${x},${z}: ${ground(x, z)}`);
  for (const [x, z] of [[x0 + .3, z0 + .3], [x1 - .3, z1 - .3]]) assert.ok(Math.abs(ground(x, z)) < .02, 'deck fills the hole corners');
  const [cx, cz] = SCHOOLYARD.pool.at;
  assert.ok(Math.abs(ground(cx, cz) + SCHOOLYARD.pool.depth) < .02, 'pool floor is below the field');
  assert.ok(Math.abs(ground(cx + 7, cz) + poolDepth(cx + 7, cz)) < .1, 'pool wall follows its transition');
});

test('a held throttle rides the pool end to end', () => {
  const r = run(2, -18, -1, 0, 1, 10);
  assert.ok(r.events.filter(e => e.type === 'trick' && e.name === 'Backside Air').length >= 2, 'pool walls return');
  assert.equal(r.s.recoveries, 0); assert.equal(r.s.hits, 0);
});

test('full speed clears the bus; less lands on its roof; neither crashes', () => {
  const fast = run(14, -32, 0, 1, 1, 4), slow = run(14, -32, 0, 1, .6, 4);
  assert.ok(fast.gaps.includes('OVER THE BUS') && fast.sk.letters.includes('S'), fast.gaps.join(','));
  assert.ok(slow.gaps.includes('ROOF LANDING') && !slow.gaps.includes('OVER THE BUS'), slow.gaps.join(','));
  for (const r of [fast, slow]) { assert.equal(r.s.hits, 0); assert.equal(r.s.recoveries, 0); }
});

test('the steps, planter and every collectable have a line', () => {
  const steps = run(13, 9, 0, 1, 1, 3);
  assert.ok(steps.gaps.includes('SCHOOL STEPS') && steps.sk.letters.includes('T'));
  const planter = run(-12, 0, 0, 1, 1, 3);
  assert.ok(planter.gaps.includes('PLANTER GAP') && planter.sk.letters.includes('A'), planter.gaps.join(','));
  assert.ok(run(-14, -18, 0, -1, .6, 3).sk.letters.includes('K'));
  assert.ok(run(11.4, -32, 0, 1, 1, 4).sk.tape, 'the tape is on the kicker-edge line');
  assert.ok(!run(15, -32, 0, 1, 1, 4).sk.tape, 'the middle of the kicker misses it');
});
