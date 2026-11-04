import {createRace} from './physics/race.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runwayFurniture} from './open-world/runways.mjs';
import {roadWidth, buildingInfo} from './open-world/geometry.mjs';
import {eventCourse, eventById} from './open-world/catalog.mjs';
import {createPickups, stepPickups} from './physics/pickups.mjs';
import {createWorld} from './physics/world.mjs';
import {createCar} from './physics/car.mjs';
test('public runway axes retain distinct widths, endpoint paint and continuous edge lights', () => {
  const found = new Map();
  for (const name of fs
    .readdirSync(new URL('./assets/world/', import.meta.url))
    .filter(n => n.startsWith('tile-'))) {
    for (const f of JSON.parse(fs.readFileSync(new URL('./assets/world/' + name, import.meta.url))).features)
      if (f.properties.aeroway === 'runway') found.set(f.properties.ref, f);
  }
  assert.equal(found.size, 2);
  for (const [ref, f] of found) {
    const width = roadWidth(f.properties);
    assert.equal(width, ref === '03L/21R' ? 61 : 46);
    const d = runwayFurniture(f, width);
    assert.ok(d.paint.length > 50);
    assert.ok(d.lights.length > 100);
    for (const p of [...d.paint.flat(), ...d.lights]) assert.ok(p.every(Number.isFinite));
  }
});
test('Runway Drag crates only award Afterburner across repeated respawns', () => {
  const world = createWorld(),
    course = eventCourse(eventById('runway-drag'), world),
    pk = createPickups(course),
    car = createCar();
  for (let i = 0; i < 40; i++) {
    car.pos = [...pk.spots[i % pk.spots.length].pos];
    pk.held.delete(car);
    for (const s of pk.spots) s.ready = 0;
    stepPickups(pk, [car], world, 1 / 120);
    assert.equal(pk.held.get(car), 'zoom');
  }
});
test('OSM building=no never becomes a solid museum-sized box', () => {
  assert.equal(buildingInfo({properties: {building: 'no'}, geometry: {coordinates: []}}), null);
});

test('runway race restrictions never remove weapons from Furball or free drive', () => {
  const course = eventCourse(eventById('runway-drag'), createWorld());
  assert.deepEqual(createRace(course).pickups.items, ['zoom']);
  assert.ok(createRace(course, {furball: true}).pickups.items.includes('foxtwo'));
  assert.ok(createRace(course, {roam: true}).pickups.items.includes('balloon'));
});
