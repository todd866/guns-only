import test from 'node:test';
import assert from 'node:assert/strict';
import {stepOllie, stepManual, PAD_SKATE} from './pad-skate.mjs';
import {mapPad} from './gamepad.mjs';

const hold = (seconds, dt = 1 / 60) => {
  let st = null,
    t = 0,
    r;
  for (; t < seconds; t += dt) r = stepOllie(st, true, t), (st = r.state);
  return stepOllie(st, false, t);
};

test('A crouches while held and pops on release; a tap is the old ollie, a full crouch 30% higher', () => {
  let r = stepOllie(null, true, 0);
  assert.equal(r.pop, null, 'no pop on the press');
  r = stepOllie(r.state, true, 0.25);
  assert.ok(r.crouch > 0.4 && r.crouch < 0.6, 'half crouch at 0.25 s');
  assert.ok(Math.abs(hold(0.02).pop - 1) < 0.05, 'tap = 1x');
  assert.ok(Math.abs(hold(2).pop - (1 + PAD_SKATE.maxBoost)) < 1e-9, 'capped full crouch');
  const after = stepOllie(stepOllie(stepOllie(null, true, 0).state, false, 0.1).state, false, 0.2);
  assert.equal(after.pop, null, 'one pop per press');
});

function flicks(seq, extra = {}) {
  let st = null,
    out;
  for (const [t, y] of seq) {
    out = stepManual(st, {y, now: t, speed: 3, ...extra});
    st = out.state;
  }
  return out;
}

test('up then down latches a manual, down then up a nose manual, as in THPS2', () => {
  assert.equal(flicks([[0, 1], [0.1, 0], [0.2, -1]]).wheelie, true);
  assert.equal(flicks([[0, -1], [0.1, 0], [0.2, 1]]).stoppie, true);
  assert.equal(flicks([[0, 1], [0.6, -1]]).wheelie, false, 'too slow is not a manual');
  const held = flicks([[0, 1], [0.1, -1], [0.2, 0], [1.5, 0], [3, 0]]);
  assert.equal(held.wheelie, true, 'the latch holds after the stick returns');
});

test('the manual ends on an ollie or a stop, and a flick in the air waits for the landing', () => {
  let st = flicks([[0, 1], [0.1, -1]]).state;
  assert.equal(stepManual(st, {now: 0.2, speed: 3, ollie: true}).wheelie, false, 'ollie ends it');
  st = flicks([[0, 1], [0.1, -1]]).state;
  assert.equal(stepManual(st, {now: 0.2, speed: 0.2}).wheelie, false, 'stopping ends it');
  // In the air: input before the landing, roll straight into it.
  let r = flicks([[0, 1], [0.1, -1]], {airborne: true});
  assert.equal(r.wheelie, true, 'armed in the air');
  r = stepManual(r.state, {now: 0.3, speed: 3, airborne: false});
  assert.equal(r.wheelie, true, 'still on after touchdown');
  r = stepManual(r.state, {now: 0.4, speed: 3, airborne: true});
  r = stepManual(r.state, {now: 0.41, speed: 3, airborne: false});
  assert.equal(r.wheelie, true, 'a one-frame hop over a park seam keeps it');
  for (let t = 0.5; t < 0.9; t += 0.05) r = stepManual(r.state, {now: t, speed: 3, airborne: true});
  assert.equal(r.wheelie, false, 'rolling off a ledge after the manual began ends it');
});

const pad = (down, axes = [0, 0, 0, 0]) => ({
  connected: true,
  id: '8BitDo Ultimate 2 Wireless',
  mapping: 'standard',
  axes,
  buttons: Array.from({length: 17}, (_, i) => ({value: down.includes(i) ? 1 : 0}))
});

test('board on the pad: THPS2 face (A ollie, X flip, B grab, Y grind), LB/RB spin, d-pad steers and aims', () => {
  const m = d => mapPad('board', pad(d), {sensitivity: 'low'});
  assert.equal(m([0]).jumpHeld, true);
  assert.equal(m([2]).flipHeld, true);
  assert.equal(m([1]).grabHeld, true);
  assert.equal(m([3]).grindHeld, true);
  assert.equal(m([3]).drift, false, 'Y is the grind on the board, not the revert');
  assert.equal(m([4]).spin, -1);
  assert.equal(m([5]).spin, 1);
  assert.equal(m([5]).drift, true, 'RB still reverts a landing');
  assert.equal(m([15]).steer, 1, 'd-pad right steers at full lock');
  assert.equal(m([12]).trickY, 1, 'd-pad up is a trick direction');
  assert.equal(m([14]).trickX, -1);
});
