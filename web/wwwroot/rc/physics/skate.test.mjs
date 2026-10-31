import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {courseFromGlb} from './district.mjs';
import {createSession, stepSession} from './session.mjs';
import {placeCar, rideHeight} from './car.mjs';
import {bankPoint, bankLocal} from '../open-world/park-lines.mjs';
import {createSkate, stepSkate, comboText, INTRO_PARK} from './skate.mjs';

const course = courseFromGlb(fs.readFileSync(new URL('../assets/districts/skatepark.glb', import.meta.url)));
const frame = p => [...bankLocal(p), p[1]];
const parkYaw = (du, dv) => {
  const a = bankPoint(du, dv),
    o = bankPoint(0, 0);
  return Math.atan2(a[0] - o[0], -(a[2] - o[2]));
};

function ride(u, v, du, dv, policy, seconds) {
  const s = createSession(course, {mode: 'kid'});
  s.roam = true;
  const p = bankPoint(u, v);
  p[1] = course.world.raycast([p[0], 4, p[2]], [0, -1, 0], 6).point[1] + rideHeight() + 0.01;
  placeCar(s.car, p, parkYaw(du, dv));
  const sk = createSkate();
  sk.left = seconds;
  const events = [];
  for (let f = 0; f < (seconds + 4) * 120 && !sk.over; f++) {
    const input = policy(f / 120);
    stepSession(s, input, 1 / 120);
    events.push(...stepSkate(sk, s, input, 1 / 120, frame));
  }
  return {sk, events};
}
const of = (events, type) => events.filter(e => e.type === type);

test('the hip line scores the Hip Transfer gap, its goal and the K', () => {
  const a = Math.PI / 4;
  const {sk, events} = ride(
    7.4 - Math.cos(a) * 4.5,
    4.5 - Math.sin(a) * 4.5,
    Math.cos(a),
    Math.sin(a),
    () => ({throttle: 0.8, steer: 0}),
    6
  );
  assert.deepEqual(
    of(events, 'gap').map(e => e.name),
    ['HIP TRANSFER']
  );
  assert.ok(sk.goals.has('hip') && sk.letters.includes('K'));
  // Air + gap land together as one two-trick combo.
  assert.equal(of(events, 'land')[0].tricks, 2);
});

test('bowl airs bank alone unless the hop button reverts the landing', () => {
  const bowl = drift => ride(10.8, 10.25, 0, -1, t => ({throttle: 1, steer: 0, drift: drift(t)}), 15);
  const plain = bowl(() => false);
  assert.ok(
    of(plain.events, 'land').length >= 4 && of(plain.events, 'land').every(e => e.tricks === 1),
    'no input: each air banks'
  );
  // Grab late in each air and hold through the landing: Method + Revert, again and again.
  const reverted = bowl(t => t % 2.5 > 1.2 || t % 2.5 < 0.25);
  const lands = of(reverted.events, 'land');
  assert.equal(lands.length, 1, 'one continuous combo');
  assert.ok(lands[0].tricks >= 8, `combo grows (${lands[0].tricks})`);
  const methods = of(reverted.events, 'trick')
    .filter(e => e.name === 'Method')
    .map(e => e.points);
  assert.ok(methods[1] < methods[0] && methods[2] < methods[1], 'repeats are worth less each time');
  assert.ok(reverted.sk.score > plain.sk.score * 2, 'the combo is the way to score');
  assert.ok(reverted.sk.goals.has('combo') && reverted.sk.goals.has('pro'));
});

// Synthetic car states for the bookkeeping that needs no ramp.
function fake() {
  const wheel = () => ({contact: true, contactNormal: [0, 1, 0]});
  return {
    car: {
      pos: [0, 0.3, 0],
      q: [0, 0, 0, 1],
      ang: [0, 0, 0],
      contacts: 4,
      speed: 3,
      wheels: [wheel(), wheel(), wheel(), wheel()]
    },
    recoveries: 0
  };
}
const flat = p => [p[0], p[2], p[1]];

test('letters and the tape collect where the car reaches them', () => {
  const s = fake(),
    sk = createSkate();
  for (const l of INTRO_PARK.letters) {
    s.car.pos = [l.at[0], l.at[2], l.at[1]];
    stepSkate(sk, s, {}, 1 / 120, flat);
  }
  assert.deepEqual(sk.letters, ['S', 'K', 'A', 'T', 'E']);
  assert.ok(sk.goals.has('skate'));
  const t = INTRO_PARK.tape;
  s.car.pos = [t[0], t[2] - 1, t[1]];
  stepSkate(sk, s, {}, 1 / 120, flat);
  assert.ok(!sk.tape, 'a metre under the tape is not a grab');
  s.car.pos = [t[0], t[2], t[1]];
  stepSkate(sk, s, {}, 1 / 120, flat);
  assert.ok(sk.tape && sk.goals.has('tape'));
});

test('a wheels-up landing bails the combo; the clock waits for the last landing', () => {
  const s = fake(),
    sk = createSkate(),
    step = () => stepSkate(sk, s, {}, 1 / 120, flat);
  const air = (seconds, upright) => {
    s.car.contacts = 0;
    for (let i = 0; i < seconds * 120; i++) step();
    s.car.contacts = 4;
    s.car.q = upright ? [0, 0, 0, 1] : [1, 0, 0, 0];
    const out = [];
    for (let i = 0; i < 12; i++) out.push(...step());
    return out;
  };
  air(0.8, true);
  assert.equal(comboText(sk).score, '220 X 1');
  const bailed = air(0.8, false);
  assert.deepEqual(
    of(bailed, 'bail').map(e => e.lost),
    [0],
    'a crash always shows BAIL'
  );
  assert.equal(sk.combo, null);
  assert.equal(sk.score, 220, 'the first air banked when its window closed');
  s.car.q = [0, 0, 0, 1];
  sk.left = 0.01;
  s.car.contacts = 0;
  for (let i = 0; i < 60; i++) step();
  assert.ok(!sk.over, 'time is up but the car is still in the air');
  s.car.contacts = 4;
  const end = [];
  for (let i = 0; i < 12; i++) end.push(...step());
  assert.ok(sk.over && of(end, 'land').length === 1, 'the last trick lands and counts');
});

test('the secret tape takes a full-speed run up the west quarter, nothing less', () => {
  const run = (u, throttle) => ride(u, 0.5, -1, 0, () => ({throttle, steer: 0}), 4).sk.tape;
  assert.ok(run(2, 1), 'flat out from across the plaza');
  assert.ok(!run(-1, 0.7) && !run(-9, 1), 'part throttle or a short run-up falls short');
});

test("the hip forgives a kid's aim: most approaches near it score the transfer", () => {
  // Aimed at the hip's crest from the plaza, 30° (up the quarter) to 60° (across its foot), up to 0.75 m off.
  let ok = 0,
    n = 0;
  for (const ang of [30, 45, 60])
    for (const off of [-0.75, 0, 0.75])
      for (const throttle of [0.6, 1]) {
        const a = (ang * Math.PI) / 180,
          du = Math.cos(a),
          dv = Math.sin(a),
          u = 7.2 - dv * off - du * 1.5,
          v = 7.3 + du * off - dv * 1.5;
        const {events} = ride(u, v, du, dv, () => ({throttle, steer: 0}), 4);
        n++;
        if (of(events, 'gap').some(e => e.name === 'HIP TRANSFER')) ok++;
        assert.ok(!of(events, 'bail').length, `${ang}° ${off} m ${throttle}: no bail`);
      }
  assert.ok(ok / n >= 0.8, `${ok}/${n} approaches transfer`);
});
