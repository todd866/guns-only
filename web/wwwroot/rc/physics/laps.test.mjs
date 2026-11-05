import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld, addBox} from './world.mjs';
import {createSession, stepSession} from './session.mjs';
import {createCar, placeCar, rideHeight} from './car.mjs';
import {createRace, stepRace, progress} from './race.mjs';
import {
  createPickups,
  stepPickups,
  pickItem,
  modifiers,
  ITEMS,
  MISSILES,
  SUPER,
  COMEBACK_ITEMS
} from './pickups.mjs';
function fixture() {
  const world = createWorld();
  addBox(world, 0, 0, 100, 100, -1, 0);
  return {
    world,
    laps: 3,
    start: {pos: [0, 0, 0], yaw: 0},
    checkpoints: [
      [0, 0, 'Start', 1],
      [10, 0, 'A', 1],
      [10, 10, 'B', 1],
      [0, 10, 'C', 1],
      [0, 0, 'Finish', 1]
    ],
    secrets: []
  };
}
function gate(s, i) {
  const p = s.course.checkpoints[i];
  placeCar(s.car, [p[0], rideHeight(s.car.params), p[1]], 0);
  stepSession(s, {throttle: 0, steer: 0}, 1 / 120);
}
test('three full circuits required, ordered gates prevent finish-line farming', () => {
  const s = createSession(fixture());
  gate(s, 0);
  for (let lap = 1; lap <= 3; lap++) {
    for (let i = 1; i < 5; i++) gate(s, i);
    assert.equal(s.finished, lap === 3);
    assert.equal(s.lap, Math.min(3, lap + 1));
    if (lap < 3) {
      assert.equal(s.gate, 1);
      gate(s, 0);
      assert.equal(s.gate, 1);
    }
  }
  assert.equal(s.lapTimes.length, 3);
  assert.ok(Math.abs(s.lapTimes.reduce((a, b) => a + b, 0) - s.time) < 1e-9);
});
test('place progress keeps the next lap ahead and sprint remains one pass', () => {
  const a = createSession(fixture()),
    b = createSession(fixture());
  a.lap = 2;
  a.gate = 1;
  b.gate = 4;
  assert.ok(progress(a) > progress(b));
  const sprint = createSession({...fixture(), laps: 1});
  for (let i = 0; i < 5; i++) gate(sprint, i);
  assert.equal(sprint.finished, true);
});

test('P6-P8 roll >= 75% comeback over 1000 seeded rolls and P1 never rolls the strongest item', () => {
  const cars = Array.from({length: 8}, (_, i) => createCar(undefined, [0, 0.13, i], 0)),
    pk = createPickups({pickups: [{pos: [0, 0.15, 0]}]}, 7);
  pk.order = cars;
  for (const place of [5, 6, 7]) {
    let comeback = 0;
    for (let i = 0; i < 1000; i++) {
      const item = pickItem(pk, cars[place], true);
      if (COMEBACK_ITEMS.has(item)) comeback++;
      if (MISSILES.has(item)) assert.equal(pk.ammo.get(cars[place]), 3);
    }
    assert.ok(comeback >= 750, `P${place + 1} rolled ${comeback}/1000 comeback items`);
  }
  for (let i = 0; i < 1000; i++) {
    const item = pickItem(pk, cars[0], true);
    assert.notEqual(item, SUPER);
    assert.notEqual(item, 'pitbull');
    assert.notEqual(item, 'zoom');
    assert.ok(ITEMS.includes(item));
  }
});

test('kid player takes a hit then is controllable within 0.4 s and immune for 3.5 s; a rival cannot hit twice inside 12 s', () => {
  const race = createRace(fixture(), {mode: 'kid', opponents: 1}),
    kid = race.player.car,
    rival = race.rivals[0].session.car,
    pk = race.pickups;
  const align = () => {
    kid.pos = [0, 0.13, -3.5];
    kid.vel = [0, 0, 0];
    rival.pos = [0, 0.13, 0];
    rival.vel = [0, 0, 0];
  };
  align();
  pk.held.set(rival, 'balloon');
  while (!race.events.some(e => e.car === kid)) stepRace(race, {throttle: 1});
  assert.equal(modifiers(pk, kid).spinning, true);
  assert.equal(modifiers(pk, kid).canSteer, false);
  assert.ok(modifiers(pk, kid).hitGrace > 3.4);
  for (let i = 0; i < 48; i++) stepRace(race, {steer: 1, throttle: 1});
  assert.equal(modifiers(pk, kid).canSteer, true, 'controllable within 0.4 s');
  stepRace(race, {steer: 1, throttle: 1});
  assert.ok(kid.steer > 0, 'steer works within 0.4 s');
  for (let i = 49; i < 108; i++) stepRace(race, {throttle: 1});
  assert.equal(modifiers(pk, kid).spinning, false);
  assert.ok(modifiers(pk, kid).boost > 1, 'auto-refills short boost on recovery');
  // Immune during 3.5 s hitGrace.
  pk.balloons.push({pos: [...kid.pos], vel: [0, 0, 0], owner: rival, life: 1});
  assert.equal(
    stepPickups(pk, [kid, rival], race.course.world, 1 / 120).some(e => e.car === kid),
    false
  );
  // Advance past 3.5 s hitGrace (to 5 s), re-arm rival, and verify rival cannot hit twice inside 12 s.
  for (let i = 109; i < 120 * 5; i++) stepRace(race, {});
  assert.equal(modifiers(pk, kid).hitGrace, 0);
  pk.held.set(rival, 'balloon');
  for (let i = 120 * 5; i < 120 * 11.8; i++) {
    align();
    stepRace(race, {});
  }
  assert.equal(race.events.filter(e => e.car === kid).length, 1, 'not hit twice inside 12 s');
});
