import test from 'node:test';
import assert from 'node:assert/strict';
import {makeVehicleBody, VEHICLE_NAMES} from './vehicle-bodies.js';
import {vehicleParams, golfVehicleUnlocked} from './physics/vehicles.mjs';
import {BUGGY, createCar, stepCar} from './physics/car.mjs';
import {createWorld} from './physics/world.mjs';
test('vehicle body catalog has distinct finite named geometry', () => {
  const sig = [];
  for (const k of Object.keys(VEHICLE_NAMES)) {
    const g = makeVehicleBody(k);
    let n = 0;
    g.traverse(o => {
      if (o.isMesh) {
        n++;
        for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
      }
    });
    assert.ok(n > 0);
    sig.push(
      g.children
        .map(o => [...o.geometry.attributes.position.array].map(v => v.toFixed(3)).join(','))
        .join(';')
    );
    assert.equal(g.name, 'VehicleBody');
  }
  assert.equal(new Set(sig).size, Object.keys(VEHICLE_NAMES).length);
});
test('physics presets are immutable clones and stable on a flat course', () => {
  const w = createWorld();
  w.addQuad([-20, 0, -20], [-20, 0, 20], [20, 0, 20], [20, 0, -20], 'asphalt');
  const before = JSON.stringify(BUGGY);
  for (const k of ['buggy', 'monster', 'rally', 'pickup', 'golf']) {
    const p = vehicleParams(k),
      c = createCar(p, [0, 0.13, 0]);
    for (let i = 0; i < 240; i++) stepCar(c, {throttle: 1, steer: 0}, w, 1 / 120);
    assert.ok(c.pos.every(Number.isFinite));
    assert.ok(c.speed >= 0);
  }
  assert.equal(JSON.stringify(BUGGY), before);
  assert.equal(vehicleParams('golf').topSpeed, 8);
  assert.ok(vehicleParams('monster').wheelRadius > BUGGY.wheelRadius);
});
test('golf body unlock follows discovery state', () => {
  assert.equal(golfVehicleUnlocked({discovered: ['gate']}), false);
  assert.equal(golfVehicleUnlocked(['golf']), true);
});

test('presets own nested arrays and reach the finish with strict driving', async () => {
  const {createRace, stepRace, driveInput} = await import('./physics/race.mjs'),
    {eventCourse, EVENTS} = await import('./open-world/catalog.mjs'),
    {createStream} = await import('./open-world/stream.mjs');
  const stream = createStream({manifest: {tiles: []}, fetchTile: () => {}});
  for (const kind of Object.keys(VEHICLE_NAMES)) {
    const params = vehicleParams(kind),
      other = vehicleParams(kind);
    params.wheels[0].at[0] = 99;
    params.staticFriction[0] = 99;
    assert.notEqual(other.wheels[0].at[0], 99);
    assert.notEqual(vehicleParams(kind).staticFriction[0], 99);
    const race = createRace(eventCourse(EVENTS[0], stream.world), {
        mode: 'bigKid',
        opponents: 0,
        params: other
      }),
      pilot = {session: race.player, skill: 0.8, node: 0};
    race.retreat.at = Infinity;
    for (let i = 0; i < 120 * 90 && !race.player.finished; i++)
      stepRace(race, driveInput(race, pilot), 1 / 120);
    assert.ok(race.player.finished, kind + ' finishes');
    assert.equal(race.player.car.params.topSpeed, other.topSpeed);
  }
  stream.dispose();
});
