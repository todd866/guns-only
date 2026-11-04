import test from 'node:test';
import assert from 'node:assert/strict';
import {TOT, CANDY, treatHouses, createTrickOrTreat, stepTrickOrTreat, trickSize} from './trick-or-treat.mjs';

const porches = Array.from({length: 12}, (_, i) => ({index: i, x: i * 20, z: 0, y: 0, yaw: 0}));

test('one porch in three is lit, and some lit houses say BOO first', () => {
  const h = treatHouses(porches);
  assert.equal(h.length, 4);
  assert.deepEqual(
    h.map(x => x.id),
    [0, 3, 6, 9]
  );
  assert.ok(treatHouses(Array.from({length: 60}, (_, i) => ({index: i, x: i, z: 0}))).some(x => x.boo));
});

test('roll up: asked once; land a trick: candy by size, once per house; walk away and back: still given', () => {
  const t = createTrickOrTreat(treatHouses(porches)),
    at = [60, 0, 3];
  const ask = stepTrickOrTreat(t, at, null, 0);
  assert.ok(ask.some(e => e.ask));
  assert.deepEqual(stepTrickOrTreat(t, at, null, 0.1), [], 'asks only once while you stay');
  const got = stepTrickOrTreat(t, at, {name: 'kickflip', size: 'big'}, 0.2).find(e => e.treat);
  assert.equal(got.candy, CANDY.big);
  assert.equal(t.candy, 3);
  assert.deepEqual(stepTrickOrTreat(t, at, {name: 'ollie', size: 'small'}, 0.3), [], 'this house has given');
  stepTrickOrTreat(t, [60, 0, 40], null, 1);
  assert.deepEqual(stepTrickOrTreat(t, at, null, 2), []);
  // Away from every lit house long enough: they all refill.
  stepTrickOrTreat(t, [60, 0, 500], null, 3);
  stepTrickOrTreat(t, [60, 0, 500], null, 3 + TOT.reset + 1);
  assert.ok(stepTrickOrTreat(t, at, null, 400).some(e => e.ask));
});

test('a trick far from any door earns nothing', () => {
  const t = createTrickOrTreat(treatHouses(porches));
  assert.deepEqual(stepTrickOrTreat(t, [10, 0, 30], {name: 'big jump', size: 'good'}, 0), []);
  assert.equal(t.candy, 0);
});

test('trick size grows with air, spin and combo', () => {
  assert.equal(trickSize({air: 0.4}), 'small');
  assert.equal(trickSize({air: 0.8}), 'good');
  assert.equal(trickSize({spin: 540}), 'big');
  assert.equal(trickSize({combo: 3}), 'big');
});
