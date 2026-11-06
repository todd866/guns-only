import test from 'node:test';
import assert from 'node:assert/strict';
import {createGamepadInput, padGuide, mapPad, cameraMove, flyShoulder, stickAxis, STICK_DEAD} from './gamepad.mjs';

const buttons = (down = [], analog = {}) =>
  Array.from({length: 17}, (_, i) => ({value: analog[i] ?? (down.includes(i) ? 1 : 0)}));
const pad = (axes = [0, 0, 0, 0], down = [], extra = {}) => ({
  connected: true,
  id: '8BitDo Ultimate 2',
  mapping: 'standard',
  axes,
  buttons: buttons(down, extra.analog),
  ...extra
});

test('sticks use a 0.15 dead zone and full throw still reaches the stop', () => {
  assert.equal(STICK_DEAD, 0.15);
  assert.equal(stickAxis(0.14), 0);
  assert.equal(stickAxis(1), 1);
  assert.equal(stickAxis(-1), -1);
});

test('the car and the skateboard steer with the left stick and go on the triggers', () => {
  const poll = createGamepadInput(),
    p = pad([0.05, -1, 0.9, -0.8]);
  assert.equal(poll([p]).steer, 0, 'inside the dead zone');
  assert.equal(poll([p]).throttle, 0, 'stick up is not the throttle');
  p.axes = [1, -1, 0.4, 0.6];
  p.buttons[7].value = 0.7;
  p.buttons[0].value = 1;
  p.buttons[9].value = 1;
  const out = poll([p]);
  assert.equal(out.throttle, 0.7);
  assert.equal(out.steer, 1);
  assert.ok(out.lookX > 0.2 && out.lookY < -0.4, 'right stick looks, and is not steering');
  assert.equal(out.jump, true, 'A jumps');
  assert.equal(out.fire, false, 'A is not fire');
  assert.equal(out.start, true);
  assert.equal(out.boost, false);
  p.buttons[2].value = 1;
  assert.equal(poll([p]).boost, true, 'X toggles boost');
  assert.equal(poll([p]).boost, false, 'once per press');
  p.buttons[3].value = 1;
  p.buttons[5].value = 1;
  assert.equal(poll([p]).drift, true, 'Y and RB drift');
  p.buttons[6].value = 1;
  p.buttons[7].value = 0;
  assert.equal(poll([p]).throttle, -1, 'LT brakes, then reverses');
  assert.equal(poll([p]).steer, 1, 'left stick is still only steer');
  assert.equal(poll([]).throttle, 0);
  p.mapping = '';
  p.buttons[7].value = 0.7;
  p.buttons[6].value = 0;
  assert.equal(poll([p]).steer, 1, 'an unrecognised pad still steers on the left stick');
  const board = mapPad('board', pad([0.8, -1], [], {analog: {7: 1}}));
  assert.equal(board.throttle, 1);
  assert.ok(board.steer > 0.5);
  assert.equal(board.moveY > 0.5 && board.throttle === 1, true);
});

test('every connected pad drives: an idle pad listed first does not mask the active one', () => {
  const poll = createGamepadInput(),
    idle = pad(),
    active = pad([-1, -1]);
  active.buttons[7].value = 1;
  active.buttons[0].value = 1;
  const out = poll([idle, active]);
  assert.equal(out.steer, -1);
  assert.equal(out.throttle, 1, 'RT drives; the stick being up does not');
  assert.equal(out.jump, true);
  assert.equal(poll([idle, active]).jump, false, 'jump is once per press across pads');
  assert.equal(poll([idle, {...active, connected: false}]).throttle, 0);
});

test('a pad is introduced once, with the letters printed on it', () => {
  const poll = createGamepadInput(),
    sn30 = pad([0, 0, 0, 0], [], {id: '8Bitdo SN30 Pro (STANDARD GAMEPAD)'});
  assert.equal(poll([sn30]).joined, null, 'idle pads are not announced');
  sn30.buttons[7].value = 1;
  sn30.axes[0] = 1;
  const out = poll([sn30]);
  assert.equal(out.throttle, 1);
  assert.equal(out.steer, 1);
  assert.equal(out.joined, sn30.id);
  assert.equal(poll([sn30]).joined, null, 'announced once');
  assert.match(padGuide(sn30.id), /B jump/);
  assert.match(padGuide('8BitDo Ultimate 2 Wireless (STANDARD GAMEPAD Vendor: 2dc8 Product: 6012)'), /A jump/);
  assert.doesNotMatch(padGuide('8BitDo Ultimate 2'), /stick up/);
});

test('on foot the left stick moves on the camera and the right stick only looks', () => {
  const north = cameraMove(0, 0, 1);
  assert.ok(Math.abs(north.x) < 1e-9 && north.z < -0.9, 'stick up walks the way the camera looks');
  const east = cameraMove(0, 1, 0);
  assert.ok(east.x > 0.9 && Math.abs(east.z) < 1e-9, 'stick right walks camera-right');
  const turned = cameraMove(Math.PI / 2, 0, 1);
  assert.ok(turned.x > 0.9 && Math.abs(turned.z) < 1e-9, 'a camera that has turned takes the stick with it');
  const foot = mapPad('robot', pad([0, -1, 1, 1], [0, 2, 10], {analog: {6: 1, 7: 1}}));
  assert.equal(foot.throttle, 0, 'the stick is not a throttle');
  assert.equal(foot.steer, 0);
  assert.equal(foot.moveY, 1);
  assert.equal(foot.lookX, 1);
  assert.equal(foot.lookY, -1, 'stick down looks down');
  assert.equal(foot.fireHeld, true, 'RT fires');
  assert.equal(foot.aim, true, 'LT aims');
  assert.equal(foot.jumpHeld, true);
  assert.equal(foot.punch, true, 'X punches');
  assert.equal(foot.sprint, true, 'L3 sprints');
  assert.equal(foot.boostHeld, false);
});

test('flying uses the left stick to pitch and roll and the triggers as the throttle', () => {
  for (const form of ['fly', 'plane', 'gunship']) {
    const air = mapPad(form, pad([1, 1, 0.8, -0.8], [4], {analog: {7: 0.5, 6: 0}}));
    assert.equal(air.throttle, 0, `${form} stick is not the throttle`);
    assert.equal(air.pitch, 1, `${form} pull raises the nose`);
    assert.equal(air.roll, 0, `${form} stick-right and LB cancel`);
    assert.equal(air.power, 0.5);
    assert.ok(air.lookY > 0.5, `${form} right stick looks up`);
    assert.equal(air.jumpHeld, false);
  }
  const roll = mapPad('fly', pad([0, 0, 0, 0], [5]));
  assert.equal(roll.roll, 1, 'RB rolls right');
  assert.equal(mapPad('fly', pad([0, 0], [4])).roll, -1, 'LB rolls left');
  const chopper = mapPad('chopper', pad([0.6, -1, 0, 0], [], {analog: {7: 1, 6: 0}}));
  assert.equal(chopper.pitch, 0);
  assert.ok(chopper.strafe > 0.4, 'chopper left stick strafes');
  assert.equal(chopper.moveY, 1, 'chopper stick up moves');
  assert.equal(chopper.climb, 1, 'RT climbs');
  assert.equal(chopper.throttle, 0);
});

test('LB taps between flight and the chute, and a hold does not land you', () => {
  let state = null,
    step = flyShoulder(state, {flying: false, down: true, now: 0});
  assert.equal(step.takeoff, true);
  state = step.state;
  step = flyShoulder(state, {flying: true, down: false, now: 100});
  assert.equal(step.chute, false, 'releasing the takeoff press stays airborne');
  state = step.state;
  step = flyShoulder(state, {flying: true, down: true, now: 500});
  state = step.state;
  step = flyShoulder(state, {flying: true, down: false, now: 600});
  assert.equal(step.chute, true, 'a short tap in the air opens the chute');
  state = step.state;
  step = flyShoulder(state, {flying: true, down: true, now: 1000});
  state = step.state;
  step = flyShoulder(state, {flying: true, down: false, now: 1400});
  assert.equal(step.chute, false, 'holding LB rolls and does not land');
});

test('R3 recentres and Select is the map, once per press', () => {
  const poll = createGamepadInput(),
    p = pad([0, 0, 0, 0], [11, 8]);
  const out = poll([p]);
  assert.equal(out.recentre, true);
  assert.equal(out.map, true);
  assert.equal(poll([p]).recentre, false);
  assert.equal(poll([p]).map, false);
});
