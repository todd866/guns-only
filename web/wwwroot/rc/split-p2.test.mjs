import test from 'node:test';
import assert from 'node:assert/strict';
import {splitScreenOn, toggleP2SkateForm, flightGamepadInput, rivalHumanInput} from './split-p2.mjs';

test('split stays on while either player flies or skates; robot on P1 drops split', () => {
  const base = {split: {pad: 1}, rival: {}, started: true, p1Robot: false};
  assert.equal(splitScreenOn(base), true);
  assert.equal(splitScreenOn({...base, p1Robot: true}), false);
  assert.equal(splitScreenOn({...base, split: null}), false);
});

test('P2 skate form toggles car and board only', () => {
  assert.equal(toggleP2SkateForm('car'), 'board');
  assert.equal(toggleP2SkateForm('board'), 'car');
});

test('flightGamepadInput maps sticks like keyboard flightInput', () => {
  const gp = {axes: [0, 0, 1, -0.5], buttons: []},
    poll = {throttle: 0.6, steer: -0.4, boost: true};
  assert.deepEqual(flightGamepadInput(gp, poll, 'bigKid'), {
    pitch: axisExpect(-(-0.5)),
    roll: 1,
    yaw: -0.4,
    power: 0.6,
    burner: true,
    assist: false
  });
  const easy = flightGamepadInput(gp, poll, 'kid');
  assert.equal(easy.easy, true);
  assert.equal(easy.climb, 0.6);
});

function axisExpect(v) {
  v = Math.max(-1, Math.min(1, v));
  return Math.abs(v) < 0.12 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.12)) / 0.88;
}

test('rivalHumanInput passes flight while airborne', () => {
  const session = {flight: {mode: 'fly'}, car: {}},
    out = rivalHumanInput({
      paused: false,
      uiPanel: false,
      pad2: {throttle: 1, steer: 0.2, brake: false, drift: false, boost: false},
      gp: {axes: [0, 0, 0, 0.5]},
      mode: 'bigKid',
      session,
      fire: false,
      tagBoost: 1,
      p2Form: 'car'
    });
  assert.ok(out.flight);
  assert.equal(out.throttle, 0);
  assert.equal(out.flight.pitch, axisExpect(-0.5));
});
