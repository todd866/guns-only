import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlock, stepFlock, YARD, HEN} from './chickens.mjs';

const run = (flock, seconds, scary = null) => {
  const ev = [];
  for (let t = 0; t < seconds; t += 1 / 30) ev.push(...stepFlock(flock, 1 / 30, scary));
  return ev;
};

test('left alone, the flock pecks and wanders but stays near its yard', () => {
  const f = createFlock();
  run(f, 120);
  for (const h of f.hens)
    assert.ok(Math.hypot(h.x - YARD.centre[0], h.z - YARD.centre[1]) < YARD.radius + 4, h.id);
});

test('a dinosaur close by scatters them, squawking once each, and they settle once it has gone', () => {
  const f = createFlock(),
    h = f.hens[0],
    near = [h.x + 2, h.z];
  const ev = run(f, 0.5, near);
  assert.ok(ev.some(e => e.scatter === h.id));
  assert.equal(ev.filter(e => e.scatter === h.id).length, 1, 'one squawk per fright');
  assert.ok(Math.hypot(h.x - near[0], h.z - near[1]) > 2, 'ran away from it');
  run(f, 5, [1e4, 1e4]);
  assert.ok(
    f.hens.every(x => x.state !== 'run'),
    'calm again'
  );
  assert.ok(HEN.calm > HEN.scare);
});
