import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import {createWorld} from '../physics/world.mjs';
import {createExpansionVenues} from './expansion-venues.js';
import {VENUE_EVENTS, VENUE_LOCATIONS} from './expansion-venues.mjs';

test('five approved venues expose catalog records with distinct surfaces and entrances', () => {
  assert.equal(VENUE_LOCATIONS.length, 5);
  assert.deepEqual(
    VENUE_LOCATIONS.map(v => v.id),
    ['stables', 'rail', 'coldlab', 'ice', 'tropical']
  );
  assert.equal(VENUE_EVENTS.length, 5);
  assert.ok(VENUE_EVENTS.every(e => e.points.length >= 7 && e.entrance && e.hazards.length));
  assert.deepEqual(
    new Set(VENUE_EVENTS.map(e => e.surface)),
    new Set(['dirt', 'gravel', 'snow', 'ice', 'grass'])
  );
  assert.ok(VENUE_LOCATIONS.every(v => v.entrances.length >= 2));
  const bounds = {
    stables: [-1880, -1470, -1700, -1300],
    rail: [1880, 2020, 2020, 2330],
    coldlab: [1960, -740, 2120, -610],
    ice: [-1140, 1515, -1000, 1645],
    tropical: [-760, 2960, -520, 3180]
  };
  for (const event of VENUE_EVENTS)
    for (const [x, z] of event.points) {
      const b = bounds[event.location];
      assert.ok(x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3], `${event.id} route escaped venue`);
    }
});

test('venue factory batches static props and updates cosmetic hazards without losing entrances', () => {
  const scene = new T.Scene(),
    world = createWorld();
  const venues = createExpansionVenues(scene, world);
  assert.equal(venues.root.name, 'ExpansionVenues');
  const names = [];
  venues.root.traverse(o => {
    if (o.name) names.push(o.name);
  });
  for (const name of ['Venue_stables', 'Venue_rail', 'Venue_coldlab', 'Venue_ice', 'Venue_tropical'])
    assert.ok(names.includes(name));
  assert.ok(world.tris.length >= 20, 'solid shelter and boundary collision was authored');
  for (const event of venues.events)
    for (const [x, z] of event.points)
      assert.equal(world.sphereContacts([x, 0.35, z], 0.35).length, 0, `${event.id} route is blocked`);
  venues.update(10);
  assert.equal(venues.stepHazards([1950, 0, 2110], 1 / 60, 0).length, 0);
  const trainHit = venues.stepHazards([1950, 0, 2110], 1 / 60, 31.4);
  assert.equal(trainHit[0]?.type, 'train-bump');
  const iceHit = venues.stepHazards([-1070, 0, 1608], 1 / 60, 0);
  assert.equal(iceHit[0]?.type, 'resurfacer-bump');
  assert.equal(venues.root.getObjectByName('SupplyTrain_cosmetic').userData.role.includes('cosmetic'), true);
  assert.equal(
    venues.root.getObjectByName('IceResurfacer_cosmetic').userData.role.includes('cosmetic'),
    true
  );
  venues.dispose();
  assert.equal(scene.children.length, 0);
});
