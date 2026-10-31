import test from 'node:test';
import assert from 'node:assert/strict';
import {createPickups, pickItem, use, stepPickups, modifiers, LASER, SUPER} from './physics/pickups.mjs';
import {createWorld} from './physics/world.mjs';
import {quatIdentity} from './physics/math.mjs';

const car = (x, z) => ({pos: [x, 0.1, z], vel: [0, 0, -5], ang: [0, 0, 0], q: quatIdentity()});
const course = () => ({
  world: createWorld(),
  checkpoints: [
    [0, 0, 'a'],
    [0, -50, 'b']
  ],
  pickups: [],
  start: {pos: [0, 0, 0], yaw: 0}
});

test('the laser turret is a back-of-pack draw only, and in Kid mode only the player gets it', () => {
  const cars = Array.from({length: 8}, (_, i) => car(0, i)),
    pk = createPickups(course(), 3);
  pk.order = cars;
  const draws = (c, isPlayer, n = 400) =>
    Array.from({length: n}, () => pickItem(pk, c, isPlayer)).filter(i => i === SUPER).length;
  assert.equal(draws(cars[0], true), 0, 'the leader never draws it');
  assert.ok(draws(cars[7], true) > 100, 'last place often does');
  pk.superFor = 'player';
  assert.equal(draws(cars[7], false), 0, 'Kid mode rivals never draw it');
  pk.superFor = 'all';
  assert.ok(draws(cars[7], false) > 100, 'Big Kid rivals at the back can');
});

test('firing it gives a speed boost and zaps the nearest car ahead, not one behind', () => {
  const me = car(0, 0),
    ahead = car(0, -6),
    behind = car(0, 4),
    pk = createPickups(course(), 1);
  pk.held.set(me, SUPER);
  assert.equal(use(pk, me), SUPER);
  assert.equal(modifiers(pk, me).boost, LASER.boost);
  assert.ok(modifiers(pk, me).lasering);
  let hits = [];
  for (let i = 0; i < 120 * 2; i++)
    hits.push(
      ...stepPickups(pk, [me, ahead, behind], course().world, 1 / 120).filter(e => e.type === 'laser')
    );
  assert.ok(
    hits.length >= 1 && hits.every(e => e.car === ahead && e.by === me),
    'zaps land on the car in front'
  );
  assert.ok(pk.zaps.length >= 0);
  for (let i = 0; i < 120 * LASER.seconds; i++) stepPickups(pk, [me, ahead, behind], course().world, 1 / 120);
  assert.equal(modifiers(pk, me).lasering, false, 'it runs out');
});

test('an immune car is never zapped', () => {
  const me = car(0, 0),
    kid = car(0, -5),
    pk = createPickups(course(), 1);
  pk.held.set(me, SUPER);
  use(pk, me);
  const ev = [];
  for (let i = 0; i < 120 * 3; i++) ev.push(...stepPickups(pk, [kid, me], course().world, 1 / 120, kid));
  assert.equal(ev.filter(e => e.type === 'laser').length, 0);
});
