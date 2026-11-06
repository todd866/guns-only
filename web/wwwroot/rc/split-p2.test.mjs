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

test('pad 2 robot walks on the camera, jumps on A, and X punches and uses', () => {
  const xbox = p2RobotPad({id: 'Xbox 360', axes: [0, -1, 1, 0], buttons: face([0, 2])});
  assert.ok(xbox.move.z < -0.9, 'stick up walks the way a north-facing camera looks');
  assert.equal(xbox.throttle, 0);
  assert.equal(xbox.steer, 0);
  assert.equal(xbox.jump, true);
  assert.equal(xbox.punch, true);
  assert.equal(xbox.use, true);
  assert.equal(Math.abs(xbox.move.x) < 1e-9, true, 'the right stick does not walk');
  const sn = p2RobotPad({id: '8BitDo SN30', axes: [0.5, 0.5, 0, 0], buttons: face([0, 2])}, 0);
  assert.ok(sn.move.x > 0.3, 'stick right walks camera-right');
  assert.ok(sn.move.z > 0.2, 'stick down walks back');
  assert.equal(sn.jump, true, 'index 0 jumps on every pad');
  assert.equal(sn.punch, true);
  assert.equal(p2RobotPad({id: 'Ultimate', axes: [0, 0, 0, 0], buttons: face([1])}).jump, false, 'B is morph, not jump');
  assert.equal(p2RobotPad(null).move.x, 0);
  assert.equal(p2RobotPad(null).jump, false);
});

test('flightGamepadInput pitches and rolls on the left stick for both players', () => {
  const gp = {axes: [1, 1, 0.5, -0.5], buttons: Array.from({length: 17}, () => ({value: 0}))};
  gp.buttons[7] = {value: 0.6};
  const poll = {boost: true};
  assert.deepEqual(flightGamepadInput(gp, poll, 'bigKid'), {
    pitch: 1,
    roll: 1,
    yaw: 0,
    power: 0.6,
    burner: true,
    assist: false
  });
  const kid = flightGamepadInput(gp, poll, 'kid');
  assert.equal(kid.pitch, 1);
  assert.equal(kid.power, 0.6);
  assert.equal(kid.assist, true);
  assert.equal(kid.easy, undefined, 'the right stick is the camera, not an easy-fly steer');
});

test('rivalHumanInput passes flight while airborne', () => {
  const session = {flight: {mode: 'fly'}, car: {}},
    out = rivalHumanInput({
      paused: false,
      uiPanel: false,
      pad2: {throttle: 0, steer: 0, moveX: 0.2, brake: false, drift: false, boost: true},
      gp: {axes: [0, 1, 0, 0.5], buttons: face([])},
      mode: 'bigKid',
      session,
      fire: false,
      tagBoost: 1,
      p2Form: 'car'
    });
  assert.ok(out.flight);
  assert.equal(out.throttle, 0);
  assert.equal(out.flight.pitch, 1, 'stick pulled back raises the nose');
  assert.equal(out.flight.burner, true);
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
