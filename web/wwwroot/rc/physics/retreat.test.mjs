import test from 'node:test';
import assert from 'node:assert/strict';
import { RETREAT, createRetreat, stepRetreat } from './retreat.mjs';

const run = (r, secs, speed, ready = true) => { const ev = []; for (let t = 0; t < secs; t += .1) ev.push(...stepRetreat(r, speed, ready, .1)); return ev; };

test('the bugle comes after a while of free drive, never while not ready', () => {
  const r = createRetreat(); assert.deepEqual(run(r, RETREAT.first + 10, 5, false), []);
  assert.ok(run(r, RETREAT.first + 1, 5).some(e => e.start));
});

test('stop within the grace and hold still: a perfect retreat', () => {
  const r = createRetreat(); run(r, RETREAT.first + .2, 5);
  const ev = [...run(r, 1, 5), ...run(r, RETREAT.hold + 1, 0)];
  assert.ok(ev.some(e => e.stopped)); assert.ok(ev.some(e => e.done === true)); assert.equal(r.stood, 1);
});

test('keep driving, or drive off mid-hold: an oops, and the next bugle is minutes away', () => {
  const r = createRetreat(); run(r, RETREAT.first + .2, 5);
  assert.ok(run(r, RETREAT.grace + .5, 5).some(e => e.done === false));
  assert.ok(r.next >= RETREAT.every[0] - 1);
  run(r, r.next + .2, 5); run(r, .5, 0); assert.ok(run(r, 1, 3).some(e => e.done === false)); assert.equal(r.missed, 2);
});
