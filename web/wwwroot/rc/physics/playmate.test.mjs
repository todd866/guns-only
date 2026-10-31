import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from './world.mjs';
import {createRace, stepRace} from './race.mjs';
import {createPlaymates, stepPlaymates, PLAYMATE} from './playmate.mjs';
import {placeCar} from './car.mjs';

const seeded =
  (s = 5) =>
  () =>
    (s = (s * 16807) % 2147483647) / 2147483647;
function setting() {
  const world = createWorld();
  world.addQuad([-50, 0, -900], [-50, 0, 60], [700, 0, 60], [700, 0, -900], 'asphalt');
  const course = {
    world,
    start: {pos: [0, 0.2, 0], yaw: 0},
    checkpoints: [
      [0, 0],
      [0, -40],
      [0, -80, 'finish']
    ],
    secrets: [],
    ai: null
  };
  const race = createRace(course, {mode: 'kid', opponents: 2, roam: true});
  // An L-shaped road: 400 m north, then 200 m east to the place.
  const place = {id: 'bx', short: 'BX', pos: [200, 0, -400]};
  const route = from => [
    [from[0], from[2]],
    [0, -400],
    [200, -400]
  ];
  return {race, place, world: {places: [place], route}};
}
const drive = (race, input, seconds, each) => {
  for (let i = 0; i < seconds * 120; i++) {
    stepRace(race, input(i / 120), 1 / 120);
    each?.(i / 120);
  }
};

test('a playmate pulls up behind the player on its own trail and calls a race to a place in range', () => {
  const {race, world} = setting(),
    pm = createPlaymates(seeded());
  let start = null;
  drive(
    race,
    () => ({throttle: 0.6}),
    70,
    t => {
      const e = stepPlaymates(pm, {player: race.player, rivals: race.rivals, world, time: t, dt: 1 / 120});
      if (e?.start) start ??= {...e.start, t};
    }
  );
  assert.ok(start, 'a challenge started');
  assert.ok(start.t >= PLAYMATE.firstAfter[0] && start.t <= PLAYMATE.firstAfter[1] + 0.1, `at ${start.t}`);
  assert.equal(start.dest.id, 'bx');
  assert.ok(
    start.spawn.pos[2] > race.player.car.pos[2],
    'spawned behind the player (south of it on a northbound run)'
  );
});

test('the playmate drives the route and wins if the player dawdles; a quick player wins', () => {
  for (const [label, playerFast] of [
    ['dawdle', false],
    ['quick', true]
  ]) {
    const {race, world, place} = setting(),
      pm = createPlaymates(seeded());
    pm.next = 0;
    // Put both cars at the start with a short trail so the playmate spawns just behind.
    placeCar(race.player.car, [0, 0.2, -20], 0);
    let finish = null;
    for (let i = 0; i < 120 * 140 && !finish; i++) {
      const t = i / 120,
        p = race.player.car.pos;
      // The player drives the same L: north, then east at the corner.
      const heading = p[2] > -396 ? 0 : Math.PI / 2,
        yaw = -Math.atan2(
          2 * (race.player.car.q[3] * race.player.car.q[1]),
          1 - 2 * race.player.car.q[1] ** 2
        );
      const err = Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw));
      stepRace(race, {throttle: playerFast ? 1 : 0.35, steer: Math.max(-1, Math.min(1, err * 2))}, 1 / 120);
      const e = stepPlaymates(pm, {player: race.player, rivals: race.rivals, world, time: t, dt: 1 / 120});
      if (e?.start)
        placeCar(
          e.start.rival.session.car,
          [e.start.spawn.pos[0], 0.2, e.start.spawn.pos[2]],
          e.start.spawn.yaw
        );
      if (e?.finish) finish = e.finish;
    }
    assert.ok(finish, `${label}: race finished`);
    assert.equal(
      finish.winner,
      playerFast ? 'player' : 'rival',
      `${label}: ${finish.winner} in ${finish.time}s`
    );
    assert.equal(finish.dest, place);
  }
});
