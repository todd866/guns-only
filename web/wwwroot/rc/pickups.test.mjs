import test from 'node:test';
import assert from 'node:assert/strict';
import {baseCourse} from './sim.mjs';
import {createRace, stepRace} from './physics/race.mjs';
import {
  createPickups,
  stepPickups,
  use,
  modifiers,
  pickItem,
  ITEMS,
  SUPER,
  COMEBACK_ITEMS
} from './physics/pickups.mjs';
import {createCar, stepCar} from './physics/car.mjs';
import {createWorld, addBox} from './physics/world.mjs';
import {heldMissilePose} from './pickup-visuals.mjs';
import {dangleSpot} from './physics/pickups.mjs';

const flat = () => {
  const w = createWorld();
  w.addQuad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50], 'asphalt');
  return w;
};

test('driving through a crate gives an item; the crate respawns', () => {
  const car = createCar(undefined, [0, 0.13, 0], 0),
    pk = createPickups({pickups: [{pos: [0, 0.15, 0]}]});
  stepPickups(pk, [car], flat(), 1 / 120);
  assert.ok(pk.held.get(car));
  assert.ok(pk.spots[0].ready > 0);
  stepPickups(pk, [car], flat(), 5);
  assert.equal(pk.spots[0].ready, 0);
});

test('a visible crate allows a rival claim while retaining the player cooldown', () => {
  const world = flat(),
    pk = createPickups({pickups: [{pos: [0, 0.15, 0]}]}, 1, {perCar: true});
  const player = createCar(undefined, [0, 0.13, 0], 0),
    rival = createCar(undefined, [0, 0.13, 0], 0);
  stepPickups(pk, [player, rival], world, 1 / 120);
  assert.ok(pk.held.has(player));
  pk.held.delete(player);
  stepPickups(pk, [player, rival], world, 1 / 120);
  assert.ok(pk.held.has(rival), 'rival claims the still-visible box');
  assert.ok(pk.spots[0].ready > 0, 'player-facing box remains on its own cooldown');
});

test('a moving seven-car pack can collect a respawning crate over one pass', () => {
  const world = flat(),
    pk = createPickups({pickups: [{pos: [0, 0.15, 0]}]}, 1, {perCar: true});
  const cars = Array.from({length: 7}, (_, i) => createCar(undefined, [0, 0.13, 2 + i * 4], 0));
  const collected = new Set();
  for (let tick = 0; tick < 720; tick++) {
    for (const car of cars) stepCar(car, {throttle: 1}, world, 1 / 120);
    stepPickups(pk, cars, world, 1 / 120);
    cars.forEach((car, i) => {
      if (pk.held.has(car)) collected.add(i);
    });
  }
  assert.ok(collected.size >= 6, `moving pack collected ${collected.size}/7 cars`);
});

test('race pickup cadence is player-personal while Big Kid rivals share the slower crate', () => {
  const world = flat(),
    pk = createPickups({pickups: [{pos: [0, 0.15, 0]}]}, 1, {
      perCar: true,
      rivalPersonal: false,
      rivalRespawn: 8
    });
  const player = createCar(undefined, [0, 0.13, 0], 0),
    rival = createCar(undefined, [0, 0.13, 0], 0),
    rivalTwo = createCar(undefined, [0, 0.13, 0], 0);
  stepPickups(pk, [player, rival, rivalTwo], world, 1 / 120); // player claims first
  pk.held.delete(player);
  stepPickups(pk, [player, rival, rivalTwo], world, 1 / 120); // rival claims too
  assert.ok(pk.held.has(rival));
  pk.held.delete(rival);
  stepPickups(pk, [player, rival, rivalTwo], world, 1 / 120);
  assert.ok(!pk.held.has(rivalTwo), 'second rival is blocked by the shared cadence');
  for (let i = 0; i < 4 * 120; i++) stepPickups(pk, [player, rival, rivalTwo], world, 1 / 120);
  assert.ok(pk.held.has(player), 'player can reclaim after four seconds');
  pk.held.delete(player);
  assert.ok(!pk.held.has(rivalTwo), 'second rival remains blocked at four seconds');
  rival.pos = [10, 0.13, 0];
  for (let i = 0; i < 4 * 120; i++) stepPickups(pk, [player, rival, rivalTwo], world, 1 / 120);
  assert.ok(pk.held.has(rivalTwo), 'second rival can reclaim after eight seconds');
});

test('hit grace prevents stacked hits but permits a later hit', () => {
  const world = flat(),
    a = createCar(undefined, [0, 0.13, 0], 0),
    b = createCar(undefined, [0, 0.13, -3.5], 0),
    pk = createPickups({});
  pk.held.set(a, 'balloon');
  use(pk, a);
  assert.ok(stepPickups(pk, [a, b], world, 1 / 120).every(e => e.car !== b));
  let first = false;
  for (let i = 0; i < 240 && !first; i++)
    first = stepPickups(pk, [a, b], world, 1 / 120).some(e => e.car === b);
  assert.ok(first, 'first hit lands');
  b.vel = [0, 0, 0];
  pk.balloons.push({pos: [...b.pos], vel: [0, 0, 0], owner: a, life: 1});
  let chained = false;
  for (let i = 0; i < 2; i++) chained ||= stepPickups(pk, [a, b], world, 1 / 120).some(e => e.car === b);
  assert.equal(chained, false, 'second hit is rejected during grace');
  pk.balloons = [];
  for (let i = 0; i < 150; i++) stepPickups(pk, [a, b], world, 1 / 120);
  b.pos = [0, 0.13, -3.5];
  b.vel = [0, 0, 0];
  pk.held.set(a, 'balloon');
  use(pk, a);
  let later = false;
  for (let i = 0; i < 180 && !later; i++)
    later = stepPickups(pk, [a, b], world, 1 / 120).some(e => e.car === b);
  assert.ok(later, 'a later hit lands after grace expires');
});

test('a water balloon spins the car it hits, and a bubble eats the hit', () => {
  const world = flat();
  for (const shield of [false, true]) {
    const a = createCar(undefined, [0, 0.13, 0], 0),
      b = createCar(undefined, [0, 0.13, -3.5], 0),
      pk = createPickups({});
    if (shield) {
      pk.held.set(b, 'bubble');
      use(pk, b);
    }
    pk.held.set(a, 'balloon');
    use(pk, a);
    let splashed = false;
    for (let i = 0; i < 240 && !splashed; i++)
      splashed = stepPickups(pk, [a, b], world, 1 / 120).some(e => e.car === b);
    assert.equal(splashed, !shield, `shield ${shield}`);
    assert.equal(modifiers(pk, b).spinning, !shield);
  }
});

test('oil makes the next car slide, zoom raises speed', () => {
  const a = createCar(undefined, [0, 0.13, 0], 0),
    b = createCar(undefined, [0, 0.13, 3], 0),
    pk = createPickups({});
  pk.held.set(a, 'oil');
  use(pk, a);
  b.pos = [...pk.slicks[0].pos];
  stepPickups(pk, [a, b], flat(), 1 / 120);
  assert.ok(modifiers(pk, b).gripScale < 1);
  pk.held.set(a, 'zoom');
  use(pk, a);
  assert.ok(modifiers(pk, a).boost > 1);
});

test('a full race with pickups stays sane and rivals still finish', () => {
  const race = createRace(baseCourse(), {mode: 'bigKid', opponents: 3});
  let used = 0;
  for (let i = 0; i < 120 * 100 && !race.rivals.every(r => r.session.finished); i++) {
    const n = race.pickups.held.size;
    stepRace(race, {});
    used += race.pickups.held.size < n;
  }
  assert.ok(
    race.rivals.every(r => r.session.finished),
    race.rivals.map(r => r.session.gate).join(',')
  );
  assert.ok(used > 0, 'rivals used pickups');
});

test('kid mode: player is not immune, takes a cartoon tumble, steers within 0.4 s, and gets 3.5 s hitGrace', () => {
  const race = createRace(baseCourse(), {mode: 'kid', opponents: 1}),
    kid = race.player.car,
    rival = race.rivals[0].session.car,
    pk = race.pickups;
  kid.pos = [0, 0.13, -3.5];
  kid.vel = [0, 0, -4];
  rival.pos = [0, 0.13, 0];
  rival.vel = [0, 0, -4];
  pk.held.set(rival, 'balloon');
  let hitStep = -1;
  for (let i = 0; i < 60; i++) {
    stepRace(race, {throttle: 1});
    if (race.events.some(e => e.car === kid)) {
      hitStep = i;
      break;
    }
  }
  assert.ok(hitStep >= 0, 'rival balloon hits the kid player');
  assert.equal(modifiers(pk, kid).spinning, true);
  assert.equal(modifiers(pk, kid).canSteer, false);
  assert.ok(modifiers(pk, kid).hitGrace > 3.4, '3.5 s hitGrace starts on hit');
  // Controls are dead before 0.4 s, then steering works within 0.4 s while the spin finishes.
  for (let i = 0; i < 20; i++) stepRace(race, {steer: 1, throttle: 1});
  assert.equal(kid.steer, 0, 'steer locked during first 0.4 s of tumble');
  for (let i = 20; i < 48; i++) stepRace(race, {steer: 1, throttle: 1});
  assert.equal(modifiers(pk, kid).spinning, true, 'still tumbling at 0.4 s');
  assert.equal(modifiers(pk, kid).canSteer, true, 'controllable at 0.4 s');
  stepRace(race, {steer: 1, throttle: 1});
  assert.ok(kid.steer > 0, 'steer input turns the wheels within 0.4 s');
  // When the 0.9 s tumble ends, a short recovery boost auto-refills.
  for (let i = 49; i < 108; i++) stepRace(race, {throttle: 1});
  assert.equal(modifiers(pk, kid).spinning, false, 'tumble ends at 0.9 s');
  assert.ok(modifiers(pk, kid).boost > 1, 'recovery boost fires as the tumble ends');
  // Immune for 3.5 s via hitGrace (balloons and oil do not catch the player during grace).
  pk.balloons.push({pos: [...kid.pos], vel: [0, 0, 0], owner: rival, life: 1});
  pk.slicks.push({pos: [...kid.pos], life: 5, owner: rival});
  assert.equal(
    stepPickups(pk, [kid, rival], race.course.world, 1 / 120).some(e => e.car === kid),
    false,
    'immune during 3.5 s hitGrace'
  );
  assert.equal(modifiers(pk, kid).gripScale, 1, 'oil ignored during 3.5 s hitGrace');
  for (let i = 109; i < 420; i++) stepPickups(pk, [kid, rival], race.course.world, 1 / 120);
  assert.equal(modifiers(pk, kid).hitGrace, 0, '3.5 s hitGrace expires at 3.5 s');
  pk.balloons.push({pos: [...kid.pos], vel: [0, 0, 0], owner: rival, life: 1});
  assert.equal(
    stepPickups(pk, [kid, rival], race.course.world, 1 / 120).some(e => e.car === kid),
    true,
    'hit lands again once 3.5 s hitGrace expires'
  );
});

import {MISSILES, beamDir} from './physics/pickups.mjs';
const run = (pk, cars, world, n, immune = null) => {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...stepPickups(pk, cars, world, 1 / 120, immune));
  return ev;
};

test('Fox Two homes onto the car ahead even when it is off to the side', () => {
  const w = flat(),
    a = createCar(undefined, [0, 0.13, 0], 0),
    b = createCar(undefined, [3, 0.13, -12], 0),
    pk = createPickups({});
  pk.held.set(a, 'foxtwo');
  use(pk, a);
  assert.ok(run(pk, [a, b], w, 240).some(e => e.car === b)); // (the 0.9 s spin has worn off by now)
});

test('Pitbull hunts the race leader, not the nearest car', () => {
  const w = flat(),
    shooter = createCar(undefined, [0, 0.13, 0], 0),
    near = createCar(undefined, [0, 0.13, -3], 0),
    leader = createCar(undefined, [8, 0.13, -20], 0),
    pk = createPickups({});
  pk.order = [leader, near, shooter];
  pk.held.set(shooter, 'pitbull');
  use(pk, shooter);
  const ev = run(pk, [shooter, near, leader], w, 600);
  assert.ok(
    ev.some(e => e.car === leader),
    'leader hit'
  );
  assert.ok(!ev.some(e => e.car === near), 'near car spared');
});

test('Fox One rides the beam: steering sweeps it onto a car off to the side', () => {
  // b sits on the beam once it swings right (~31°), further out than where the missile rejoins it.
  const w = flat(),
    a = createCar(undefined, [0, 0.13, 0], 0),
    b = createCar(undefined, [0, 0.13, -40], 0),
    pk = createPickups({});
  a.steer = 0.4;
  const d = beamDir(a);
  a.steer = 0;
  b.pos = [d[0] * 20, 0.13, d[2] * 20]; // on the swung beam, 20 m out
  pk.held.set(a, 'foxone');
  use(pk, a);
  assert.ok(!run(pk, [a, b], w, 60).some(e => e.car === b), 'beam straight ahead: no hit yet');
  a.steer = 0.4; // steer right: the beam swings right, the missile follows it
  assert.ok(run(pk, [a, b], w, 240).some(e => e.car === b));
});

test('Zuni bounces off a wall and keeps flying', () => {
  const w = flat();
  addBox(w, 0, -5, 10, 0.3, 0, 1);
  const a = createCar(undefined, [0, 0.13, 0], 0),
    pk = createPickups({});
  pk.held.set(a, 'zuni');
  use(pk, a);
  run(pk, [a], w, 120);
  assert.equal(pk.missiles.length, 1);
  assert.ok(pk.missiles[0].dir[2] > 0, 'reflected back');
});

test('the munitions trailer behind a missile carrier takes a shot from behind and loses the load', () => {
  const w = flat(),
    a = createCar(undefined, [0, 0.13, -6], 0),
    b = createCar(undefined, [0, 0.13, 0], 0),
    pk = createPickups({});
  pk.held.set(a, 'foxtwo');
  pk.ammo.set(a, 3);
  pk.held.set(b, 'zuni');
  use(pk, b);
  run(pk, [a, b], w, 240);
  assert.equal(modifiers(pk, a).spinning, false);
  assert.equal(pk.held.has(a), false, 'trailer blown, load lost');
  assert.equal(pk.ammo.has(a), false);
});

test('kid mode: a rival cannot hit the kid player twice inside 12 s, and rivals get hit and fall back', () => {
  const race = createRace(baseCourse(), {mode: 'kid', opponents: 1}),
    kid = race.player.car,
    rival = race.rivals[0].session.car,
    pk = race.pickups;
  const setup = () => {
    kid.pos = [0, 0.13, -3.5];
    kid.vel = [0, 0, 0];
    rival.pos = [0, 0.13, 0];
    rival.vel = [0, 0, 0];
  };
  setup();
  pk.held.set(rival, 'balloon');
  for (let i = 0; i < 60; i++) stepRace(race, {});
  assert.equal(
    race.events.filter(e => e.car === kid).length,
    1,
    'first rival shot hits the kid player'
  );
  // Advance past the 3.5 s hitGrace (to 5 s), re-arm the rival, and step until 11.9 s: rival holds fire.
  for (let i = 60; i < 120 * 5; i++) stepRace(race, {});
  assert.equal(modifiers(pk, kid).hitGrace, 0, 'hitGrace has expired by 5 s');
  setup();
  pk.held.set(rival, 'balloon');
  for (let i = 120 * 5; i < 120 * 11.9; i++) {
    setup();
    stepRace(race, {});
  }
  assert.equal(
    race.events.filter(e => e.car === kid).length,
    1,
    'rival cannot hit the kid player a second time inside 12 s'
  );
  // Once 12 s have elapsed since the first hit, the rival may fire and hit again.
  for (let i = 0; i < 120 * 1.5; i++) {
    setup();
    stepRace(race, {});
  }
  assert.equal(
    race.events.filter(e => e.car === kid).length,
    2,
    'rival hits again after 12 s'
  );

  // Rivals in kid mode are not immune: the player hits a rival ahead and the rival visibly falls back.
  const race2 = createRace(baseCourse(), {mode: 'kid', opponents: 1}),
    pCar = race2.player.car,
    rCar = race2.rivals[0].session.car;
  pCar.pos = [-0.5, 0.13, 0];
  pCar.vel = [0, 0, -8];
  rCar.pos = [0.5, 0.13, -2.5];
  rCar.vel = [0, 0, -8];
  race2.pickups.held.set(pCar, 'foxtwo');
  let rivalHit = false;
  for (let i = 0; i < 150; i++) {
    stepRace(race2, {throttle: 1, fire: i === 0});
    if (race2.events.some(e => e.car === rCar && e.by === pCar)) rivalHit = true;
  }
  assert.equal(rivalHit, true, 'kid player item hits rival');
  assert.ok(pCar.pos[2] < rCar.pos[2], `rival fell back behind player (${pCar.pos[2]} vs ${rCar.pos[2]})`);
});

test('position-weighted items: P6-P8 roll >= 75% comeback over 1000 seeded rolls; P1 never rolls the strongest item', () => {
  const cars = Array.from({length: 8}, (_, i) => createCar(undefined, [0, 0.13, i], 0)),
    pk = createPickups({pickups: [{pos: [0, 0.15, 0]}]}, 42);
  pk.order = cars;
  for (const place of [5, 6, 7]) {
    let comeback = 0;
    for (let i = 0; i < 1000; i++) {
      const item = pickItem(pk, cars[place], true);
      if (COMEBACK_ITEMS.has(item)) comeback++;
      if (MISSILES.has(item)) assert.equal(pk.ammo.get(cars[place]), 3, 'back-third missiles come as 3-packs');
    }
    assert.ok(comeback >= 750, `P${place + 1} rolled ${comeback}/1000 comeback items`);
  }
  for (let i = 0; i < 1000; i++) {
    const item = pickItem(pk, cars[0], true);
    assert.notEqual(item, SUPER, 'P1 never rolls laser');
    assert.notEqual(item, 'pitbull', 'P1 never rolls pitbull');
    assert.notEqual(item, 'zoom', 'P1 never rolls zoom');
    assert.ok(ITEMS.includes(item));
  }
});

test('a 3-pack fires three times, then calls Winchester', () => {
  const w = flat(),
    a = createCar(undefined, [0, 0.13, 0], 0),
    pk = createPickups({});
  pk.held.set(a, 'zuni');
  pk.ammo.set(a, 3);
  use(pk, a);
  use(pk, a);
  assert.equal(pk.held.get(a), 'zuni');
  assert.equal(pk.ammo.get(a), 1);
  use(pk, a);
  assert.equal(pk.held.has(a), false);
  assert.ok(stepPickups(pk, [a], w, 1 / 120).some(e => e.type === 'winchester' && e.car === a));
  pk.held.set(a, 'zuni');
  use(pk, a);
  assert.ok(
    !stepPickups(pk, [a], w, 1 / 120).some(e => e.type === 'winchester'),
    'single missile: no callout'
  );
});

test('carried missile presentation stays fixed on the rear rack', () => {
  const car = createCar(undefined, [3, 0.13, -2], Math.PI / 2);
  const one = heldMissilePose(car, 0, 1),
    left = heldMissilePose(car, 0, 3),
    right = heldMissilePose(car, 2, 3);
  // A rack follows the car, without any time/orbit parameter or lateral drift.
  assert.ok(
    Math.abs(one.dir[0] - 1) < 1e-9 && Math.abs(one.dir[1]) < 1e-9 && Math.abs(one.dir[2]) < 1e-9,
    'rack missile follows the car heading'
  );
  const anchor = dangleSpot(car);
  assert.ok(
    Math.abs(one.pos[0] - anchor[0]) < 1e-9 && Math.abs(one.pos[2] - anchor[2]) < 1e-9,
    'rear rack remains centred for a single missile'
  );
  assert.ok(Math.abs(left.pos[0] - right.pos[0]) < 1e-9, 'pack spread is across the bumper');
  assert.ok(Math.abs(left.pos[2] - right.pos[2]) > 0.1, 'pack missiles separate across the car width');
});
