import test from 'node:test'; import assert from 'node:assert/strict';
import { baseCourse } from './sim.mjs';
import { createRace, stepRace, progress, bump, placeOf } from './physics/race.mjs';
import { createCar } from './physics/car.mjs';

const course = baseCourse();
test('AI rivals lap the base route on the physics car', () => {
  const race = createRace(course, { mode: 'bigKid', opponents: 3 });
  for (let i = 0; i < 120 * 90 && !race.rivals.every(r => r.session.finished); i++) stepRace(race, {});
  for (const r of race.rivals) assert.ok(r.session.finished, `rival skill ${r.skill} stuck at gate ${r.session.gate}`);
  const times = race.rivals.map(r => r.session.time);
  assert.ok(Math.min(...times) > 15 && Math.max(...times) < 70, `times ${times.map(t => t.toFixed(1))}`);
});

test('kid mode: rivals ease off ahead but still race to the flag (no instant wins)', () => {
  // A dawdling player crawls the route; in kid mode rivals slow down when well ahead instead of
  // parking up the road, so the dawdler still loses, just not by a whole lap of daylight.
  const finish = mode => {
    const race = createRace(course, { mode, opponents: 3 });
    for (let i = 0; i < 120 * 120 && !race.rivals.some(r => r.session.finished); i++) stepRace(race, i % 240 < 120 ? { throttle: 0.35 } : {});
    const done = race.rivals.filter(r => r.session.finished);
    assert.ok(done.length > 0, `${mode}: no rival finished; rivals parked`);
    return Math.min(...done.map(r => r.session.time));
  };
  const kid = finish('kid'), big = finish('bigKid');
  assert.ok(kid > big * 1.15, `kid-mode leader ${kid.toFixed(1)} s should trail Big Kid ${big.toFixed(1)} s`);
});

test('cars bump apart and do not overlap', () => {
  const a = createCar(undefined, [0, 0.13, 0], 0), b = createCar(undefined, [0.1, 0.13, 0], 0);
  a.vel = [1, 0, 0]; b.vel = [-1, 0, 0];
  bump([a, b]);
  assert.ok(Math.abs(a.pos[0] - b.pos[0]) > 0.1); assert.ok(a.vel[0] < 0 && b.vel[0] > 0);
});

test('places follow finish order: a rival who finished first stays ahead', () => {
  const race = createRace(course, { mode: 'bigKid', opponents: 3 });
  for (let i = 0; i < 120 * 90 && !race.rivals[0].session.finished; i++) stepRace(race, {});
  assert.ok(race.rivals[0].session.finished);
  race.player.finished = true; stepRace(race, {});
  assert.ok(placeOf(race, race.player) > placeOf(race, race.rivals[0].session));
});

test('a rival recovered mid-shortcut drops the shortcut and resumes the main line', () => {
  const race = createRace(course, { mode: 'bigKid', opponents: 1 }), rv = race.rivals[0];
  rv.alt = { nodes: [[50, 50, 1], [60, 60, 1]], exit: 3 }; rv.altNode = 1;
  rv.session.recoveries++; stepRace(race, {});
  assert.equal(rv.alt, null);
  assert.ok(rv.node >= 0 && rv.node < race.line.length);
});
