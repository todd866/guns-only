import test from 'node:test';
import assert from 'node:assert/strict';
import { raceIsAvailable } from './race-menu.js';
import { eventById, loadProgress } from './open-world/catalog.mjs';

test('a fresh save can start public base races while the lab stays locked', () => {
  const fresh = loadProgress({ getItem: () => null });
  assert.equal(raceIsAvailable(fresh, eventById('district-housing')), true);
  assert.equal(raceIsAvailable(fresh, eventById('district-bx')), true);
  assert.equal(raceIsAvailable(fresh, eventById('district-school')), true);
  assert.equal(raceIsAvailable(fresh, eventById('dreamland')), false);
});
