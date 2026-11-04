import test from 'node:test';
import assert from 'node:assert/strict';
import {seasonOn, currentSeason} from './season.mjs';
import {PUMPKIN, PATCH, pumpkinField, createPumpkins, stepPumpkins, spawnPoint} from './halloween.mjs';
import {RESIDENTIAL_START} from './residential-frame.mjs';

test('Halloween decorations are out through October and the morning after, and the URL can override', () => {
  assert.equal(seasonOn(new Date(2026, 9, 30)), 'halloween');
  assert.equal(seasonOn(new Date(2026, 9, 1)), 'halloween');
  assert.equal(seasonOn(new Date(2026, 10, 1)), 'halloween');
  assert.equal(seasonOn(new Date(2026, 10, 2)), null);
  assert.equal(seasonOn(new Date(2026, 8, 30)), null);
  assert.equal(currentSeason('?season=none', new Date(2026, 9, 31)), null);
  assert.equal(currentSeason('?season=halloween', new Date(2026, 2, 3)), 'halloween');
  assert.equal(currentSeason('?season=bogus', new Date(2026, 2, 3)), null);
});

test('the first pumpkins sit straight ahead of a new run', () => {
  const [x, z] = spawnPoint(PATCH[0][0], 0),
    f = [x - RESIDENTIAL_START.pos[0], z - RESIDENTIAL_START.pos[2]];
  const yaw = RESIDENTIAL_START.yaw;
  assert.ok(
    Math.abs(f[0] / PATCH[0][0] - Math.sin(yaw)) < 1e-9 && Math.abs(f[1] / PATCH[0][0] + Math.cos(yaw)) < 1e-9
  );
});

test('driving into a pumpkin smashes it once; a parked car does not, and it regrows after the car leaves', () => {
  const porches = [{x: 500, z: 500, y: 0, yaw: 0}];
  const state = createPumpkins(pumpkinField({porches}));
  const target = state.pumpkins.at(-1);
  assert.equal(stepPumpkins(state, [500, 0.2, 500], [0, 0, 0], 0).length, 0, 'a still car is not a smash');
  const hits = stepPumpkins(state, [500.2, 0.2, 500], [4, 0, 0], 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pumpkin, target);
  assert.deepEqual(hits[0].dir, [1, 0]);
  assert.equal(stepPumpkins(state, [500.2, 0.2, 500], [4, 0, 0], 1.1).length, 0, 'one smash per pumpkin');
  assert.equal(state.smashed, 1);
  stepPumpkins(state, [505, 0.2, 500], [4, 0, 0], 1 + PUMPKIN.regrow + 1);
  assert.notEqual(target.smashedAt, null, 'it does not regrow under the car');
  stepPumpkins(state, [500 + PUMPKIN.regrowClear + 2, 0.2, 500], [4, 0, 0], 1 + PUMPKIN.regrow + 2);
  assert.equal(target.smashedAt, null);
});

test('a car flying over a pumpkin does not smash it', () => {
  const state = createPumpkins(pumpkinField({porches: [{x: 0, z: 0, y: 0}]}));
  assert.equal(stepPumpkins(state, [0, 3, 0], [5, 0, 0], 0).length, 0);
  assert.equal(stepPumpkins(state, [0, 0.3, 0], [5, 0, 0], 0.1).length, 1);
});
