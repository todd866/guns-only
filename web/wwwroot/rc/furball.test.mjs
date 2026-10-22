import test from 'node:test'; import assert from 'node:assert/strict';
import { baseCourse } from './sim.mjs';
import { createRace, stepRace } from './physics/race.mjs';
import { stepFurball, flying, FURBALL } from './physics/furball.mjs';
import { modifiers } from './physics/pickups.mjs';

const course = baseCourse();

test('a hit pops a balloon and gives Chaff; the last balloon shoots the car down', () => {
  const race = createRace(course, { mode: 'bigKid', opponents: 2, furball: true });
  const [a, b] = race.rivals.map(r => r.session.car), me = race.player.car;
  assert.equal(race.furball.lives.get(me), 3);
  stepFurball(race, [{ type: 'boom', car: a, by: me }], 0.01);
  assert.equal(race.furball.lives.get(a), 2);
  assert.ok(modifiers(race.pickups, a).shielded, 'popped car gets Chaff');
  const ev = stepFurball(race, [{ type: 'boom', car: a, by: me }, { type: 'boom', car: a, by: me }], 0.01);
  assert.ok(race.furball.out.has(a));
  assert.deepEqual(ev.map(e => e.type), ['downed']);
  assert.equal(race.furball.kills.get(me), 1); assert.equal(ev[0].kills, 1);
  assert.equal(flying(race).length, 2);
  // Down the other rival: the player is the last jet flying.
  const end = stepFurball(race, [1, 2, 3].map(() => ({ type: 'splash', car: b, by: me })), 0.01);
  assert.ok(race.furball.over); assert.equal(race.furball.winner, race.player);
  assert.ok(end.some(e => e.type === 'furball-over'));
});

test('kid Furball: even balloons (no instant wins) and rivals may target the kid', () => {
  const race = createRace(course, { mode: 'kid', opponents: 3, furball: true });
  assert.equal(race.furball.lives.get(race.player.car), FURBALL.balloons.kid[0]);
  assert.equal(race.furball.lives.get(race.rivals[0].session.car), FURBALL.balloons.kid[1]);
});

test('rivals fight a Furball on their own: crates get used and balloons get popped', () => {
  const race = createRace(course, { mode: 'bigKid', opponents: 4, furball: true });
  let used = 0;
  for (let i = 0; i < 120 * 90 && !race.furball.over; i++) {
    const n = race.pickups.held.size; stepRace(race, {}); used += race.pickups.held.size < n;
    for (const s of flying(race)) for (const v of [...s.car.pos, ...s.car.vel]) assert.ok(Number.isFinite(v), 'car state stays finite');
  }
  const popped = [...race.furball.lives.values()].reduce((t, n) => t + (3 - n), 0);
  assert.ok(used > 0, 'rivals used pickups');
  assert.ok(popped > 0, 'somebody lost a balloon in 90 s');
});
