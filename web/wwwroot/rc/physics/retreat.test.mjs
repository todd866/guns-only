import test from 'node:test';
import assert from 'node:assert/strict';
import {RETREAT, createRetreat, stepRetreat} from './retreat.mjs';

// Drive the day clock: 20 minutes a day, as in open-world/daylight.mjs.
const run = (r, from, secs, speed, ready = true) => {
  const ev = [];
  for (let t = 0; t < secs; t += 0.1)
    ev.push(...stepRetreat(r, speed, ready, 0.1, ((from + t) % 1200) / 1200));
  return ev;
};

test('the bugle sounds at sunset (Retreat) and at sunrise (Reveille), and not in between', () => {
  const r = createRetreat();
  assert.deepEqual(run(r, 0, 290, 5), [], 'noon to just before sunset');
  assert.ok(run(r, 290, 20, 5).some(e => e.start === 'retreat'));
  const r2 = createRetreat();
  run(r2, 600, 290, 5);
  assert.ok(run(r2, 890, 20, 5).some(e => e.start === 'reveille'));
});

test('never while flying or paused', () => {
  const r = createRetreat();
  assert.deepEqual(run(r, 290, 20, 5, false), []);
});

test('stop within the grace and hold still: perfect; drive on: an oops', () => {
  const r = createRetreat();
  run(r, 299, 1.2, 5);
  const ev = [...run(r, 300, 1, 5), ...run(r, 301, RETREAT.hold + 1, 0)];
  assert.ok(ev.some(e => e.stopped));
  assert.ok(ev.some(e => e.done === true && e.kind === 'retreat'));
  assert.equal(r.stood, 1);
  const r2 = createRetreat();
  run(r2, 299, 1.2, 5);
  assert.ok(run(r2, 300, RETREAT.grace + 0.5, 5).some(e => e.done === false));
  assert.equal(r2.missed, 1);
});
