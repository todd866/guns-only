import test from 'node:test'; import assert from 'node:assert/strict';
import { baseCourse } from './sim.mjs';
import { createRace, stepRace } from './physics/race.mjs';
import { createPickups, stepPickups, use, modifiers } from './physics/pickups.mjs';
import { createCar } from './physics/car.mjs';
import { createWorld } from './physics/world.mjs';

const flat = () => { const w = createWorld(); w.addQuad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50], 'asphalt'); return w; };

test('driving through a crate gives an item; the crate respawns', () => {
  const car = createCar(undefined, [0, 0.13, 0], 0), pk = createPickups({ pickups: [{ pos: [0, 0.15, 0] }] });
  stepPickups(pk, [car], flat(), 1 / 120);
  assert.ok(pk.held.get(car)); assert.ok(pk.spots[0].ready > 0);
  stepPickups(pk, [car], flat(), 5); assert.equal(pk.spots[0].ready, 0);
});

test('a water balloon spins the car it hits, and a bubble eats the hit', () => {
  const world = flat();
  for (const shield of [false, true]) {
    const a = createCar(undefined, [0, 0.13, 0], 0), b = createCar(undefined, [0, 0.13, -3.5], 0), pk = createPickups({});
    if (shield) { pk.held.set(b, 'bubble'); use(pk, b); }
    pk.held.set(a, 'balloon'); use(pk, a);
    let splashed = false; for (let i = 0; i < 240 && !splashed; i++) splashed = stepPickups(pk, [a, b], world, 1 / 120).some(e => e.car === b);
    assert.equal(splashed, !shield, `shield ${shield}`);
    assert.equal(modifiers(pk, b).spinning, !shield);
  }
});

test('oil makes the next car slide, zoom raises speed', () => {
  const a = createCar(undefined, [0, 0.13, 0], 0), b = createCar(undefined, [0, 0.13, 3], 0), pk = createPickups({});
  pk.held.set(a, 'oil'); use(pk, a); b.pos = [...pk.slicks[0].pos];
  stepPickups(pk, [a, b], flat(), 1 / 120); assert.ok(modifiers(pk, b).gripScale < 1);
  pk.held.set(a, 'zoom'); use(pk, a); assert.ok(modifiers(pk, a).boost > 1);
});

test('a full race with pickups stays sane and rivals still finish', () => {
  const race = createRace(baseCourse(), { mode: 'bigKid', opponents: 3 });
  let used = 0;
  for (let i = 0; i < 120 * 100 && !race.rivals.every(r => r.session.finished); i++) { const n = race.pickups.held.size; stepRace(race, {}); used += race.pickups.held.size < n; }
  assert.ok(race.rivals.every(r => r.session.finished), race.rivals.map(r => r.session.gate).join(','));
  assert.ok(used > 0, 'rivals used pickups');
});
