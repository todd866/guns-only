import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../physics/world.mjs';
import { createSession, stepSession } from '../physics/session.mjs';
import { placeCar, rideHeight } from '../physics/car.mjs';
import { createSkate, stepSkate } from '../physics/skate.mjs';
import { HANGAR, HANGAR_PARK, buildHangar, hangarWorld, hangarLocal } from './skate-hangar.mjs';

const world = createWorld(4);
world.addQuad([200, 0, 500], [200, 0, 1300], [950, 0, 1300], [950, 0, 500], 'asphalt');
for (const t of buildHangar()) world.addTri(hangarWorld(t.a), hangarWorld(t.b), hangarWorld(t.c), t.surface);
const course = { world, checkpoints: [[560, 900, 'a'], [561, 900, 'b']], secrets: [], start: { pos: hangarWorld([20, 0, 0]), yaw: 0 } };
const frame = p => { const l = hangarLocal(p); return [l[0], l[2], l[1]]; };

function run(x, z, dx, dz, throttle, seconds) {
  const s = createSession(course, { mode: 'kid' }); s.roam = true;
  const p = hangarWorld([x, 6, z]); p[1] = world.raycast(p, [0, -1, 0], 10).point[1] + rideHeight() + .01;
  const q = hangarWorld([x + dx, 0, z + dz]), o = hangarWorld([x, 0, z]);
  placeCar(s.car, p, Math.atan2(q[0] - o[0], -(q[2] - o[2])));
  const sk = createSkate(HANGAR_PARK); sk.left = seconds; const events = []; let peak = 0;
  for (let f = 0; f < (seconds + 4) * 120 && !sk.over; f++) {
    stepSession(s, { throttle, steer: 0 }, 1 / 120); events.push(...stepSkate(sk, s, { throttle }, 1 / 120, frame));
    peak = Math.max(peak, hangarLocal(s.car.pos)[1]);
  }
  return { s, sk, events, peak };
}
const gaps = r => r.events.filter(e => e.type === 'gap').map(e => e.name);

test('every riding surface is solid from above at its designed height', () => {
  const v = HANGAR.vert, R = v.radius, [x0, x1] = v.bottom, arc = (t, r) => r * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
  const checks = [[-17.5, 0, .01], [x0 - R * .5, 3, arc(.5, R)], [x1 + R * .5, -3, arc(.5, R)], [x0 - R - 1, 0, R], [x1 + R + 1, 2, R],
    [x1 + R + v.deck + HANGAR.back.run / 2, 0, R / 2], [HANGAR.pyramid.at[0], 0, HANGAR.pyramid.height], [HANGAR.pyramid.at[0] + 3, 0, HANGAR.pyramid.height * (4.5 - 3) / 3], [10, -20 + 1.2, arc(.5, 2.4)]];
  for (const [x, z, want] of checks) {
    const hit = world.raycast(hangarWorld([x, 9, z]), [0, -1, 0], 12);
    assert.ok(hit && Math.abs(hit.point[1] - want) < .08, `surface at ${x},${z}: ${hit?.point[1]} want ${want}`);
  }
});

test('the door line goes over the pyramid, up the bank, drops in and rides the vert', () => {
  const r = run(24, 0, -1, 0, 1, 16);
  assert.ok(gaps(r).includes('DROP IN') && gaps(r).filter(g => g === 'HANGTIME').length >= 2, gaps(r).join(','));
  assert.ok(r.sk.letters.includes('S') && r.sk.letters.includes('K'));
  assert.ok(r.peak > 5.5, `big air above the coping (${r.peak.toFixed(2)} m)`);
  assert.equal(r.s.recoveries, 0); assert.equal(r.s.hits, 0);
});

test('a held throttle from rest rides the halfpipe wall to wall, any throttle', () => {
  for (const throttle of [.6, 1]) {
    const r = run(-17.5, 0, -1, 0, throttle, 12);
    const airs = r.events.filter(e => e.type === 'trick' && e.name === 'Backside Air').length;
    assert.ok(airs >= 3, `throttle ${throttle}: ${airs} wall-to-wall airs`);
    if (throttle === 1) assert.ok(gaps(r).includes('HANGTIME'), 'flat out earns hangtime');
    assert.ok(!r.events.some(e => e.type === 'bail') && r.s.recoveries === 0 && r.s.hits === 0, `throttle ${throttle} lands clean`);
  }
});

test('the wall quarters, deck and tape each have a line that reaches them', () => {
  assert.ok(run(10, -10, 0, -1, 1, 4).sk.letters.includes('T'));
  assert.ok(run(20, 10, 0, 1, 1, 4).sk.letters.includes('E'));
  assert.ok(run(22, 5, -1, 0, 1, 6).sk.letters.includes('A'));
  assert.ok(run(-17.5, -4, -1, 0, 1, 8).sk.tape, 'flat out on the off-centre line');
  assert.ok(!run(-17.5, -4, -1, 0, .7, 8).sk.tape, 'part throttle falls short');
});
