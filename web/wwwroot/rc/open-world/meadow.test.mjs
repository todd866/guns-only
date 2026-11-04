import test from 'node:test';
import assert from 'node:assert/strict';
import {MEADOW, STEER, createRoundup, stepRoundup, stunSteer} from './meadow.mjs';

const box = MEADOW.corral.box,
  mouth = [(MEADOW.corral.gate[0] + MEADOW.corral.gate[1]) / 2, box[1]];

test('a steer shies away from your dinosaur and the roundup clock starts', () => {
  const st = createRoundup(),
    s = st.steers[0],
    me = [s.pos[0] + 3, s.pos[1]];
  const before = Math.hypot(s.pos[0] - me[0], s.pos[1] - me[1]);
  const ev = [];
  for (let i = 0; i < 60; i++) ev.push(...stepRoundup(st, me, 1 / 30));
  assert.ok(Math.hypot(s.pos[0] - me[0], s.pos[1] - me[1]) > before + 2, 'moved away');
  assert.ok(ev.some(e => e.start));
});

test('the corral fence keeps steers out except through the gate', () => {
  const st = createRoundup(),
    s = st.steers[0];
  s.pos = [box[0] - 1.5, (box[1] + box[3]) / 2];
  s.yaw = Math.PI / 2; // heading straight at the west fence
  for (let i = 0; i < 90; i++) stepRoundup(st, [s.pos[0] - 4, s.pos[1]], 1 / 30);
  assert.ok(s.pos[0] < box[0] + 0.01 && !s.penned, 'stopped at the fence');
  s.pos = [mouth[0], box[1] - 1.5];
  for (let i = 0; i < 120 && !s.penned; i++) stepRoundup(st, [mouth[0], s.pos[1] - 5], 1 / 30);
  assert.ok(s.penned, 'driven in through the gate');
});

test('a patient herder can pen the whole herd', () => {
  const st = createRoundup();
  let me = [MEADOW.spring.at[0], MEADOW.spring.at[1] + 40],
    done = null;
  for (let i = 0; i < 30 * 60 * 12 && !done; i++) {
    const free = st.steers.filter(s => !s.penned);
    const s = free.reduce((a, b) =>
      Math.hypot(a.pos[0] - me[0], a.pos[1] - me[1]) < Math.hypot(b.pos[0] - me[0], b.pos[1] - me[1]) ? a : b
    );
    // Aim the steer at a point just outside the gate, then straight in.
    const out = [mouth[0], box[1] - 4],
      goal =
        Math.hypot(s.pos[0] - out[0], s.pos[1] - out[1]) < 3 ||
        (s.pos[1] > box[1] - 6 && Math.abs(s.pos[0] - mouth[0]) < 4)
          ? [mouth[0], box[1] + 6]
          : out;
    const gx = s.pos[0] - goal[0],
      gz = s.pos[1] - goal[1],
      gl = Math.hypot(gx, gz) || 1,
      want = [s.pos[0] + (gx / gl) * 5, s.pos[1] + (gz / gl) * 5];
    // Circle round wide if the steer is between you and where you want to stand.
    const dx = want[0] - me[0],
      dz = want[1] - me[1],
      dl = Math.hypot(dx, dz);
    const nearSteer = Math.hypot(s.pos[0] - me[0], s.pos[1] - me[1]) < STEER.shy + 2 && dl > 3;
    const step = Math.min(dl, (nearSteer ? 4 : 9) / 30),
      side = nearSteer ? [-dz / dl, dx / dl] : [0, 0];
    me = [me[0] + (dx / dl) * step + side[0] * 0.15, me[1] + (dz / dl) * step + side[1] * 0.15];
    for (const e of stepRoundup(st, dl > 3 && nearSteer ? null : me, 1 / 30)) if (e.done) done = e;
  }
  assert.ok(done, `penned ${st.penned} of ${st.steers.length}`);
});

test('a stunned steer does not move or separate, and recovers after its timer', () => {
  const st = createRoundup(),
    s = st.steers[0],
    before = [...s.pos];
  st.steers[1].pos = [s.pos[0] + 0.1, s.pos[1]];
  st.steers = st.steers.slice(0, 2);
  stunSteer(st.steers[1]);
  assert.equal(stunSteer(s), true);
  const held = [...s.pos];
  stepRoundup(st, [s.pos[0] + 1, s.pos[1]], 0.5);
  assert.deepEqual(s.pos, held);
  assert.equal(s.stunned, 3.5);
  assert.equal(st.started, null, 'the stunned steer does not start shying');
  stepRoundup(st, [s.pos[0] + 1, s.pos[1]], 3.5);
  assert.notDeepEqual(s.pos, before);
});

test('refreshing a steer stun preserves loot state, while a new stun resets it', () => {
  const s = createRoundup().steers[0];
  stunSteer(s);
  s.stunLooted = true;
  stunSteer(s, 2);
  assert.equal(s.stunLooted, true);
  s.stunned = 0;
  stunSteer(s, 2);
  assert.equal(s.stunLooted, false);
});
