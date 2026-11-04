import test from 'node:test';
import assert from 'node:assert/strict';
import {RAT, createRatKing, stepRatKing, landOnRat} from './rat-king.mjs';
import {bowlFloor, BOWL} from '../open-world/sewer.mjs';

const run = (k, player, secs, mode = 'kid') => {
  const ev = [];
  for (let t = 0; t < secs; t += 1 / 120) ev.push(...stepRatKing(k, player, mode, bowlFloor));
  return ev;
};
const far = {at: [48, 0, -2.5], inBowl: false, near: true, air: false};

test('the Rat King wakes when you come into the bowl room, then runs his loop on the dry floor', () => {
  const k = createRatKing();
  assert.deepEqual(run(k, {...far, near: false}, 1), []);
  const ev = run(k, far, 4);
  assert.ok(ev.some(e => e.wake));
  assert.equal(k.state, 'roam');
  for (let i = 0; i < 600; i++) {
    stepRatKing(k, far, 'kid', bowlFloor);
    assert.ok(bowlFloor(k.at[0], k.at[1]) >= k.level, 'never in the sewage');
  }
});

test('he rears up before every charge (the tell), and a charge on the floor bumps you off', () => {
  const k = createRatKing();
  run(k, far, 2);
  const you = {at: [52, bowlFloor(52, -2.5), -2.5], inBowl: true, near: true, air: false};
  const ev = run(k, you, RAT.every.kid + RAT.rear.kid + RAT.charge.time + 0.5);
  const rear = ev.findIndex(e => e.tell === 'rear'),
    charge = ev.findIndex(e => e.charge),
    bump = ev.findIndex(e => e.bump);
  assert.ok(rear >= 0 && charge > rear, JSON.stringify(ev));
  assert.ok(bump >= 0, 'a charge reaches you');
});

test('landing on him from the rim hits him; three hits flood the bowl and free him', () => {
  const k = createRatKing();
  run(k, far, 2);
  const levels = [k.level];
  for (let h = 1; h <= 3; h++) {
    const at = [k.at[0], bowlFloor(k.at[0], k.at[1]), k.at[1]];
    assert.deepEqual(landOnRat(k, at, 0.1, ['Air']), [], 'a roll-in with no air does nothing');
    const ev = landOnRat(k, at, 0.6, ['Air']);
    assert.ok(
      ev.some(e => e.ratHit === h),
      JSON.stringify(ev)
    );
    assert.deepEqual(landOnRat(k, at, 0.6, ['Air']), [], 'no double hit while he is dizzy');
    run(k, far, RAT.stun + 6);
    levels.push(k.level);
  }
  assert.ok(k.freed);
  assert.ok(levels[1] > levels[0] && levels[2] > levels[1], `the sewage rises: ${levels}`);
});

test('Big Kid has to grab on the way in', () => {
  const k = createRatKing();
  run(k, far, 2);
  const at = [k.at[0], 0, k.at[1]];
  assert.ok(landOnRat(k, at, 0.6, ['Kickflip'], 'bigKid').some(e => e.ratGrab));
  assert.ok(landOnRat(k, at, 0.6, ['Kickflip', 'Indy'], 'bigKid').some(e => e.ratHit));
});

test('every loop stays on floor that is dry at that flood level', () => {
  RAT.loops.forEach((L, i) => {
    for (let a = 0; a < 6.3; a += 0.1) {
      const x = L.c[0] + L.r[0] * Math.cos(a),
        z = L.c[1] + L.r[1] * Math.sin(a);
      assert.ok(bowlFloor(x, z) > RAT.flood[i] + 0.05, `loop ${i} at ${x.toFixed(2)},${z.toFixed(2)}`);
      assert.ok(x > BOWL.box[0] && x < BOWL.box[1] && z > BOWL.box[2] && z < BOWL.box[3]);
    }
  });
});
