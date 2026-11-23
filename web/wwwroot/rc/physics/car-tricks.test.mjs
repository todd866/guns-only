import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld, addBox} from './world.mjs';
import {createSession, stepSession} from './session.mjs';
import {placeCar, rideHeight, carUp} from './car.mjs';
import {createStreetSkate, stepSkate, scoreTrick, bailRun, comboText} from './skate.mjs';
import {carGrindName, setSkateRails} from './grind.mjs';
import {mapPad} from '../gamepad.mjs';
import {
  carTrickCommand,
  carTrickSettle,
  createCarTricks,
  carTrickHeld,
  CAR_FLIP,
  CAR_GRAB
} from './car-tricks.mjs';

const dt = 1 / 120;
const frame = p => [p[0], p[2], p[1]];
const worldPoint = p => [p[0], p[2], p[1]];

function flatWorld() {
  const world = createWorld(4);
  world.addQuad([-40, 0, -40], [-40, 0, 40], [40, 0, 40], [40, 0, -40], 'concrete');
  return world;
}

function ride({
  mode = 'kid',
  pts = [
    [0, 0, 0.55],
    [0, -12, 0.55]
  ],
  kind = 'rail',
  id = 'hub-rail'
} = {}) {
  const world = flatWorld();
  const park = {id: 'hub', rails: [{id, kind, pts}], gaps: [], letters: [], goals: [], airCapture: true};
  const s = createSession(
    {
      world,
      checkpoints: [
        [0, 0],
        [0, -40]
      ],
      secrets: [],
      start: {pos: [0, 0.5, -0.2], yaw: 0}
    },
    {mode}
  );
  s.roam = true;
  setSkateRails(s, park, worldPoint);
  const sk = createStreetSkate();
  sk.park = park;
  const tricks = createCarTricks();
  const events = [];
  const step = (input = {}) => {
    const air = s.car.contacts === 0;
    const raw = {throttle: 1, carForm: true, ...input};
    const drive = carTrickCommand(tricks, {air, flip: raw.flip ?? null, grab: raw.grab ?? null}, dt);
    stepSession(s, {...raw, carTrick: drive}, dt);
    for (const ev of carTrickSettle(tricks, s.car, {air: s.car.contacts === 0, grab: raw.grab ?? null}, dt, mode)) {
      events.push(ev);
      if (ev.type === 'trick') scoreTrick(sk, ev.name, ev.points);
      else if (ev.type === 'bail') bailRun(sk);
    }
    events.push(...stepSkate(sk, s, raw, dt, frame));
  };
  const drive = (seconds, input) => {
    for (let i = 0; i < seconds * 120; i++) step(typeof input === 'function' ? input(i * dt) : input);
  };
  return {s, sk, tricks, events, step, drive};
}

test('car grind names are the three kid words', () => {
  assert.equal(carGrindName({}), 'Rail Slide');
  assert.equal(carGrindName({y: 1}), 'Wheelie Grind');
  assert.equal(carGrindName({y: -1}), 'Wheelie Grind');
  assert.equal(carGrindName({x: 1}), 'Belly Slide');
  assert.equal(carGrindName({}, true), 'Belly Slide');
});

test('the car snaps onto a hub rail, slides, and exits', () => {
  const r = ride();
  placeCar(r.s.car, [0.1, 0.85, -1], 0);
  r.s.car.vel = [0, -1, -4];
  r.s.car.speed = 4;
  r.drive(0.35, {grind: true});
  assert.equal(r.s.skateRide.active?.name, 'Rail Slide');
  assert.equal(r.s.assist.grindSparks, 1, 'chassis sparks while it slides');
  const along = [];
  for (let i = 0; i < 700 && r.s.skateRide.active; i++) {
    r.step({grind: true});
    const g = r.s.skateRide.active;
    if (g) along.push(g.distance);
  }
  assert.ok(along.length > 10, 'it stays on the rail');
  assert.ok(along.at(-1) > along[0] + 0.4, 'it slides forward');
  assert.equal(r.s.skateRide.active, null, 'it leaves the end of the rail');
  assert.equal(r.s.recoveries, 0);
  assert.ok(r.events.some(e => e.name === 'Rail Slide'));
});

test('the car snaps onto coping, slides, and hops off', () => {
  const r = ride({
    kind: 'coping',
    id: 'bowl-coping',
    pts: [
      [0, 0, 0.45],
      [0, -8, 0.45]
    ]
  });
  placeCar(r.s.car, [0.35, 0.8, -1], 0.4);
  r.s.car.vel = [0.2, -0.4, -3.4];
  r.drive(0.3, {grind: true});
  assert.ok(r.s.skateRide.active, 'coping snaps');
  assert.equal(r.s.skateRide.active.name, 'Rail Slide');
  const start = r.s.skateRide.active.distance;
  r.drive(0.25, {grind: true});
  assert.ok(r.s.skateRide.active.distance > start + 0.2, 'slides the coping');
  r.step({grind: true, hop: true});
  assert.equal(r.s.skateRide.active, null, 'hop exits');
  assert.ok(r.s.car.vel[1] > 0);
});

test('stick up on the rail is a wheelie grind and stick sideways is a belly slide', () => {
  const names = [];
  for (const [grindDir, want] of [
    [{y: 1}, 'Wheelie Grind'],
    [{x: -1}, 'Belly Slide']
  ]) {
    const r = ride();
    placeCar(r.s.car, [0.1, 0.85, -1], 0);
    r.s.car.vel = [0, -1, -4];
    r.drive(0.3, {grind: true, grindDir});
    names.push(r.s.skateRide.active?.name);
    assert.equal(r.s.skateRide.active?.name, want);
  }
  assert.deepEqual(names, ['Wheelie Grind', 'Belly Slide']);
});

test('a car flip rotates in the air, lands wheels down, and scores', () => {
  const r = ride({pts: []});
  placeCar(r.s.car, [0, 2.2, 0], 0);
  r.s.car.vel = [0, 3.2, -2];
  r.drive(0.12, {throttle: 0});
  let tipped = false;
  // One press, once the car is already in the air.
  r.step({throttle: 0, flip: 'none'});
  for (let i = 0; i < 90; i++) {
    r.step({throttle: 0});
    if (carUp(r.s.car)[1] < 0.35) tipped = true;
  }
  assert.equal(CAR_FLIP.none.name, 'Flip');
  assert.ok(tipped, 'the body actually rotates');
  for (let i = 0; i < 180; i++) r.step({throttle: 0});
  assert.ok(carUp(r.s.car)[1] > 0.8, `lands wheels down (${carUp(r.s.car)[1]})`);
  assert.equal(r.s.recoveries, 0);
  assert.ok(r.sk.score > 0, `scored ${r.sk.score}`);
  assert.ok(r.events.some(e => e.name === 'Flip'));
});

test('a grab in the air scores a toy gag and a 360 is its own trick', () => {
  assert.equal(CAR_GRAB.none.name, 'Honk');
  assert.equal(CAR_GRAB.up.name, '360 Spin');
  const r = ride({pts: []});
  placeCar(r.s.car, [0, 2.4, 0], 0);
  r.s.car.vel = [0, 4, -1];
  r.drive(0.12, {throttle: 0});
  r.drive(0.25, {throttle: 0, grab: 'none'});
  r.drive(0.2, {throttle: 0});
  assert.ok(r.events.some(e => e.name === 'Honk'), JSON.stringify(r.events.map(e => e.name)));
});

test('landing banks the combo and a crash loses it', () => {
  const r = ride({pts: []});
  placeCar(r.s.car, [0, rideHeight() + 0.02, 0], 0);
  for (let i = 0; i < 30; i++) r.step({throttle: 0});
  scoreTrick(r.sk, 'Flip', 300);
  scoreTrick(r.sk, 'Rail Slide', 100);
  assert.match(comboText(r.sk).tricks, /Flip \+ Rail Slide/);
  assert.match(comboText(r.sk).score, /X 2/);
  for (let i = 0; i < 80; i++) r.step({throttle: 0});
  assert.ok(r.sk.score >= 800, `banked ${r.sk.score}`);
  assert.equal(r.sk.combo, null);
  const kept = r.sk.score;
  scoreTrick(r.sk, 'Honk', 150);
  r.s.car.wallImpact = 4;
  r.events.push(...stepSkate(r.sk, r.s, {carForm: true}, dt, frame));
  assert.equal(r.sk.combo, null, 'a crash drops the combo');
  assert.equal(r.sk.score, kept);
  assert.equal(r.sk.special, 0);
});

test('a wheelie on the flat keeps the combo alive', () => {
  const r = ride({pts: []});
  for (let i = 0; i < 90; i++) r.step({throttle: 1, grind: false});
  scoreTrick(r.sk, 'Flip', 300);
  let named = false;
  for (let i = 0; i < 120; i++) {
    r.step({throttle: 0, wheelie: true, grind: false});
    if (r.events.some(e => e.name === 'Wheelie')) named = true;
  }
  assert.ok(named, 'wheelie joins the combo');
  assert.equal(
    r.events.filter(e => e.type === 'land').length,
    0,
    'the combo stays open on the rear wheels'
  );
  assert.ok(r.sk.combo?.tricks.includes('Wheelie'));
});

test('the car wall-rides a vertical face and a hop plants off', () => {
  const world = flatWorld();
  addBox(world, 1.3, -3, 0.3, 8, 0, 3, 'vert');
  const s = createSession(
    {
      world,
      checkpoints: [
        [0, 0],
        [0, -20]
      ],
      secrets: [],
      start: {pos: [0, 0.4, -3], yaw: Math.PI / 2}
    },
    {mode: 'kid'}
  );
  s.roam = true;
  const sk = createStreetSkate();
  const events = [];
  placeCar(s.car, [0.55, 1.15, -2], 0);
  s.car.vel = [1.6, 0.6, -3.4];
  const step = input => {
    const raw = {throttle: 1, carForm: true, ...input};
    stepSession(s, raw, dt);
    events.push(...stepSkate(sk, s, raw, dt, frame));
  };
  for (let i = 0; i < 40 && !s.wallRide; i++) step({});
  assert.ok(s.wallRide, 'snaps onto the wall');
  const z0 = s.car.pos[2];
  for (let i = 0; i < 30; i++) step({});
  assert.ok(s.wallRide, 'still riding');
  assert.ok(Math.abs(s.car.pos[2] - z0) > 0.15, 'slides along the face');
  step({hop: true});
  assert.equal(s.wallRide, null);
  assert.ok(s.car.vel[1] > 0.5, 'plant pops off');
  for (let i = 0; i < 20; i++) step({});
  assert.ok(events.some(e => e.name === 'Wall Ride' || e.name === 'Wall Plant'));
});

test('standard pad, THPS2 face: A jumps, X flips, B grabs, Y grinds, with keyboard twins', () => {
  const buttons = down => Array.from({length: 17}, (_, i) => ({value: down.includes(i) ? 1 : 0}));
  const pad = (down, axes = [0, 0, 0, 0]) => ({
    connected: true,
    id: '8BitDo Ultimate 2',
    mapping: 'standard',
    axes,
    buttons: buttons(down)
  });
  const a = mapPad('car', pad([0]));
  assert.equal(a.jumpHeld, true, 'A jumps');
  assert.equal(a.grindHeld, false);
  const x = mapPad('car', pad([2]));
  assert.equal(x.flipHeld, true, 'X flips');
  const b = mapPad('car', pad([1], [0.8, 0]));
  assert.equal(b.grabHeld, true, 'B grabs');
  const y = mapPad('car', pad([3]));
  assert.equal(y.grindHeld, true, 'Y grinds');
  const keys = new Set(['Space', 'KeyQ', 'KeyE', 'KeyV']);
  assert.deepEqual(carTrickHeld({pad: {}, keys}), {jump: true, flip: true, grab: true, grind: true});
  assert.deepEqual(carTrickHeld({pad: y, keys: new Set()}), {
    jump: false,
    flip: false,
    grab: false,
    grind: true
  });
});
