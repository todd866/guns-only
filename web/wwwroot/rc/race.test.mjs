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

test('kid mode: rivals wait for a slow player instead of vanishing', () => {
  const race = createRace(course, { mode: 'kid', opponents: 3 });
  // A dawdling six-year-old: crawls the route at walking pace via the same controller as a rival.
  let maxLead = 0;
  for (let i = 0; i < 120 * 40; i++) {
    stepRace(race, i % 240 < 120 ? { throttle: 0.35 } : {});
    maxLead = Math.max(maxLead, ...race.rivals.map(r => progress(r.session) - progress(race.player)));
  }
  assert.ok(maxLead < 3.5, `rivals ran ${maxLead.toFixed(2)} gates ahead`);
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
