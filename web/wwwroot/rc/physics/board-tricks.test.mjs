import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardTricks, stepBoardTricks, dirOf, boardPose, BOARD } from './board-tricks.mjs';
import { createStreetSkate, scoreTrick, bailRun, stepSkate } from './skate.mjs';

const run = (b, seconds, input, mode) => { const out = []; for (let i = 0; i < Math.round(seconds * 120); i++) out.push(...stepBoardTricks(b, input, 1 / 120, mode)); return out; };

test('directions follow the THPS2 pad', () => {
  assert.equal(dirOf({}), 'none'); assert.equal(dirOf({ x: -1 }), 'left'); assert.equal(dirOf({ x: 1 }), 'right');
  assert.equal(dirOf({ y: 1 }), 'up'); assert.equal(dirOf({ y: -1, x: .4 }), 'down');
});

test('Q in the air kickflips the board one turn, then scores it', () => {
  const b = createBoardTricks();
  run(b, .1, { air: true });
  const ev = [...stepBoardTricks(b, { air: true, flip: 'right' }, 1 / 120), ...run(b, .2, { air: true })];
  assert.equal(ev.length, 0); assert.equal(boardPose(b).axis, 'z'); assert.ok(boardPose(b).angle < -1, 'heelflip turns the other way');
  const done = run(b, .3, { air: true });
  assert.deepEqual(done.map(e => e.name), ['Heelflip']); assert.equal(boardPose(b).axis, null);
});

test('a second tap of the same flip doubles it', () => {
  const b = createBoardTricks(); run(b, .1, { air: true });
  stepBoardTricks(b, { air: true, flip: 'none' }, 1 / 120); run(b, .1, { air: true }); stepBoardTricks(b, { air: true, flip: 'left' }, 1 / 120);
  const ev = run(b, 1, { air: true });
  assert.deepEqual(ev.map(e => [e.name, e.points]), [['Double Kickflip', 660]]);
});

test('no tricks off a bump: the board must be in the air a moment first', () => {
  const b = createBoardTricks();
  assert.deepEqual(stepBoardTricks(b, { air: true, flip: 'none' }, 1 / 120), []); run(b, .5, { air: true });
  assert.equal(b.flip, null);
});

test('landing mid-flip: kid mode finishes it for you, Big Kid bails', () => {
  for (const [mode, want] of [['kid', 'trick'], ['bigKid', 'bail']]) {
    const b = createBoardTricks(); run(b, .1, { air: true }); stepBoardTricks(b, { air: true, flip: 'up' }, 1 / 120); run(b, .05, { air: true });
    const ev = stepBoardTricks(b, { air: false }, 1 / 120, mode);
    assert.equal(ev[0].type, want, mode);
  }
});

test('a held grab scores more the longer it is held, on release or landing', () => {
  const short = createBoardTricks(); run(short, .1, { air: true }); run(short, .2, { air: true, grab: 'right' });
  const a = stepBoardTricks(short, { air: true }, 1 / 120)[0];
  const long = createBoardTricks(); run(long, .1, { air: true }); run(long, 1, { air: true, grab: 'up' }); assert.equal(boardPose(long).grab, 'Nosegrab');
  const c = stepBoardTricks(long, { air: false, grab: 'up' }, 1 / 120)[0];
  assert.equal(a.name, 'Indy'); assert.equal(c.name, 'Nosegrab'); assert.ok(c.points > a.points + 300, `${a.points} ${c.points}`);
  assert.ok(c.points <= BOARD.grabBase + BOARD.grabRate * BOARD.grabCap);
});

test('street skate: board tricks combo and bank with no clock; a bail loses the combo', () => {
  const sk = createStreetSkate();
  scoreTrick(sk, 'Kickflip', 300); scoreTrick(sk, 'Indy', 400);
  assert.equal(sk.combo.tricks.length, 2); assert.equal(sk.left, Infinity);
  const car = { pos: [0, 0, 0], q: [0, 0, 0, 1], ang: [0, 0, 0], contacts: 4, speed: 0, wheels: [{}, {}, {}, {}].map(() => ({ contact: true, contactNormal: [0, 1, 0] })) };
  const session = { car, recoveries: 0, assist: {}, course: { world: { addTriangles() {}, removeGate() {} } } };
  for (let i = 0; i < 120; i++) stepSkate(sk, session, {}, 1 / 120, p => [p[0], p[2], p[1]]);
  assert.equal(sk.score, 1400); assert.equal(sk.combo, null); assert.equal(sk.over, false);
  scoreTrick(sk, 'Kickflip', 300); bailRun(sk);
  assert.equal(sk.combo, null); assert.equal(sk.score, 1400);
});

test('a board trick replaces the bare "Air" for that jump', async () => {
  const { createStreetSkate: make, scoreTrick: score } = await import('./skate.mjs');
  const sk = make(), q = [0, 0, 0, 1];
  const wheels = c => [{}, {}, {}, {}].map(() => ({ contact: c, contactNormal: [0, 1, 0] }));
  const car = { pos: [0, 0, 0], q, ang: [0, 0, 0], contacts: 0, speed: 3, wheels: wheels(false) };
  const session = { car, recoveries: 0, assist: {}, course: { world: { addTriangles() {}, removeGate() {} } } };
  const frame = p => [p[0], p[2], p[1]];
  for (let i = 0; i < 60; i++) stepSkate(sk, session, {}, 1 / 120, frame);
  score(sk, 'Kickflip', 300);
  car.contacts = 4; car.wheels = wheels(true);
  for (let i = 0; i < 120; i++) stepSkate(sk, session, {}, 1 / 120, frame);
  assert.equal(sk.score, 300);
});
