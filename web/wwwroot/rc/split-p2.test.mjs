import test from 'node:test';
import assert from 'node:assert/strict';
import {splitScreenOn, toggleP2SkateForm, p2RobotPad, flightGamepadInput, rivalHumanInput} from './split-p2.mjs';

test('split stays on while either player is a robot', () => {
  const base = {split: {pad: 1}, rival: {}, started: true, p1Robot: false, p2Robot: false};
  assert.equal(splitScreenOn(base), true);
  assert.equal(splitScreenOn({...base, p1Robot: true}), true);
  assert.equal(splitScreenOn({...base, p2Robot: true}), true);
  assert.equal(splitScreenOn({...base, p1Robot: true, p2Robot: true}), true);
  assert.equal(splitScreenOn({...base, split: null}), false);
  assert.equal(splitScreenOn({...base, rival: null}), false);
  assert.equal(splitScreenOn({...base, started: false}), false);
});

test('pad 2 left face cycles car, robot, then board', () => {
  assert.equal(toggleP2SkateForm('car'), 'robot');
  assert.equal(toggleP2SkateForm('robot'), 'board');
  assert.equal(toggleP2SkateForm('board'), 'car');
});

function face(down) {
  return Array.from({length: 16}, (_, i) => ({value: down.includes(i) ? 1 : 0}));
}

test('pad 2 robot walks on the left stick, jumps on A, and the top face punches and uses', () => {
  const xbox = p2RobotPad({id: 'Xbox 360', axes: [0, -1, 0, 0], buttons: face([0, 3])});
  assert.ok(xbox.throttle > 0.9);
  assert.equal(xbox.steer, 0);
  assert.equal(xbox.jump, true);
  assert.equal(xbox.punch, true);
  assert.equal(xbox.use, true);
  const sn = p2RobotPad({id: '8BitDo SN30', axes: [0.5, 0.5, 0, 0], buttons: face([1, 3])});
  assert.ok(sn.steer > 0.3);
  assert.ok(sn.throttle < -0.3);
  assert.equal(sn.jump, true);
  assert.equal(sn.punch, true);
  assert.equal(sn.use, true);
  assert.equal(p2RobotPad({id: 'Ultimate', axes: [0, 0, 0, 0], buttons: face([1])}).jump, false);
  assert.equal(p2RobotPad({id: 'SN30 Pro', axes: [0, 0, 0, 0], buttons: face([0])}).jump, false);
  assert.equal(p2RobotPad(null).throttle, 0);
  assert.equal(p2RobotPad(null).jump, false);
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

test('rivalHumanInput holds the car while player 2 is the robot', () => {
  const out = rivalHumanInput({
    paused: false,
    uiPanel: false,
    pad2: {throttle: 1, steer: 0.4, brake: false, drift: true, boost: true},
    gp: {axes: [0.2, -0.8, 0, 0], buttons: face([0])},
    mode: 'bigKid',
    session: {flight: {mode: null}, car: {}},
    fire: true,
    tagBoost: 1,
    p2Form: 'robot'
  });
  assert.equal(out.throttle, 0);
  assert.equal(out.steer, 0);
  assert.equal(out.brake, true);
  assert.equal(out.fire, false);
  assert.equal(out.boardSpin, false);
  assert.equal(out.flight, undefined);
});
