// The stick curves the old tests could not see. 1371fbac is the known-good build.
// fd32ef31's linear orbit and 12 rad/s robot snap exceed it; the calm curve must not.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stickAxis, mapPad, STICK_DEAD} from './gamepad.mjs';
import {BUGGY} from './physics/car.mjs';
import {FLIGHT} from './physics/flight.mjs';
import {ROBOT} from './physics/robot.mjs';
import {vehicleParams} from './physics/vehicles.mjs';
import {buildBaseline} from './fixtures/regen-control-feel-baseline.mjs';
import {
  HEAD_CAMERA_YAW,
  HEAD_CAMERA_PITCH,
  KID_STEER_RATE,
  REST_DEAD,
  WHEELBASE,
  PHYS_DT,
  cycleSensitivity,
  feelShape,
  knownGoodResponse,
  response,
  sensitivityFor,
  steerLimit,
  stepLook
} from './control-feel.mjs';

const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/control-feel-baseline.json', import.meta.url), 'utf8'));
const CURVES = [
  'steerAngle',
  'steerRate',
  'steerYawRate',
  'cameraYawRate',
  'cameraPitchRate',
  'robotMove',
  'robotYawRate',
  'skateMove',
  'skateSteer',
  'flightPitchRate',
  'flightRollRate',
  'flightYawRate'
];

function excesses(fn) {
  const bad = [];
  for (const row of baseline.samples) {
    const got = fn(row.stick, row.speed);
    for (const key of CURVES) {
      const cap = row[key] * 1.1;
      if (got[key] > cap + 1e-6 && got[key] > row[key] + 1e-9)
        bad.push({
          stick: row.stick,
          speed: row.speed,
          key,
          got: +got[key].toFixed(4),
          base: row[key],
          cap: +cap.toFixed(4)
        });
    }
  }
  return bad;
}

// fd32ef31 / the layout before this pass: linear stickAxis, orbit 1.7/1.15, robot snap 12 rad/s,
// arcade flight rates with no expo and no resting dead zone past 0.15.
function legacyHotResponse(stick, speed) {
  const a = Math.abs(stickAxis(stick)),
    steerAngle = a * steerLimit(speed, 'kid', BUGGY.maxSteer),
    board = vehicleParams('board');
  return {
    steerAngle,
    steerRate: Math.min(BUGGY.steerRate, steerAngle / PHYS_DT),
    steerYawRate: speed * Math.tan(steerAngle) / WHEELBASE,
    cameraYawRate: a * HEAD_CAMERA_YAW,
    cameraPitchRate: a * HEAD_CAMERA_PITCH,
    robotMove: a * ROBOT.walk,
    robotYawRate: a > 0.05 ? 12 : 0,
    skateMove: 0,
    skateSteer: a * steerLimit(speed, 'kid', board.maxSteer),
    flightPitchRate: a * FLIGHT.arcade.climb * FLIGHT.arcade.pitchRate,
    flightRollRate: a * FLIGHT.arcade.bank * FLIGHT.arcade.bankRate,
    flightYawRate: 0
  };
}

test('the checked-in baseline is the regenerator output', () => {
  assert.deepEqual(baseline, buildBaseline());
});

test('fd32ef31 controls exceed the known-good baseline', () => {
  const hot = excesses(legacyHotResponse);
  assert.ok(hot.length > 0, 'the hot layout must fail the harness');
  const at = (stick, speed, key) => hot.find(row => row.stick === stick && row.speed === speed && row.key === key);
  const camera = at(0.5, 0, 'cameraYawRate');
  assert.ok(camera, `expected a camera failure at stick 0.5, got ${JSON.stringify(hot.slice(0, 8))}`);
  assert.ok(camera.got > 0.6 && camera.base < 0.2, `camera ${camera.got} vs ceiling ${camera.base}`);
  const yaw = at(0.5, 5, 'robotYawRate');
  assert.ok(yaw && yaw.got === 12 && yaw.base < 2, `robot yaw ${JSON.stringify(yaw)}`);
  const roll = at(1, 0, 'flightRollRate');
  assert.ok(roll && roll.got > 3 && roll.base <= 2.8, `flight roll ${JSON.stringify(roll)}`);
  const rest = legacyHotResponse(0.2, 5);
  assert.ok(rest.cameraYawRate > 0.05, `resting thumb camera ${rest.cameraYawRate}`);
  assert.ok(rest.steerAngle > 0, `resting thumb steer ${rest.steerAngle}`);
  const full = baseline.samples.find(row => row.stick === 1 && row.speed === 0);
  assert.equal(full.cameraYawMeasured, 0);
  assert.ok(full.cameraYawRate <= 0.85 + 1e-6 && full.cameraYawRate >= 0.8, full.cameraYawRate);
});

test('HEAD stays within 10% of the baseline, and a resting thumb does not steer or look', () => {
  const over = excesses((stick, speed) => response(stick, speed, {sensitivity: 'low', mode: 'kid'}));
  assert.deepEqual(over, [], JSON.stringify(over.slice(0, 6)));
  for (const speed of [0, 5, 10])
    for (const stick of [0, 0.1, 0.2, -0.2]) {
      const got = response(stick, speed);
      assert.equal(got.steerAngle, 0, `steer ${stick} at ${speed}`);
      assert.equal(got.steerRate, 0);
      assert.equal(got.steerYawRate, 0);
      assert.equal(got.cameraYawRate, 0, `camera ${stick}`);
      assert.equal(got.cameraPitchRate, 0);
      assert.equal(got.robotYawRate, 0);
    }
});

test('small sticks stay under the 1371fbac steer curve, and kid mode caps the steer rate', () => {
  for (const speed of [0, 5, 10])
    for (const stick of [0.3, 0.5, 0.8, 1]) {
      const calm = response(stick, speed),
        old = knownGoodResponse(stick, speed);
      assert.ok(calm.steerAngle <= old.steerAngle + 1e-9, `${stick} @ ${speed}: ${calm.steerAngle} > ${old.steerAngle}`);
      assert.ok(calm.steerYawRate <= old.steerYawRate + 1e-9);
      assert.ok(calm.steerRate <= KID_STEER_RATE + 1e-9);
      assert.ok(calm.robotYawRate <= old.robotYawRate + 1e-9);
      assert.ok(calm.flightRollRate <= old.flightRollRate + 1e-6);
      assert.ok(calm.flightPitchRate <= old.flightPitchRate + 1e-6);
    }
  assert.equal(feelShape(REST_DEAD), 0);
  assert.equal(feelShape(1), 1);
  assert.ok(feelShape(0.5) < 0.2);
  assert.equal(STICK_DEAD, 0.15);
  assert.equal(stickAxis(1), 1);
});

test('the camera eases in, then recentres about a second after the stick is released', () => {
  const target = 0.5 * HEAD_CAMERA_YAW;
  let state = stepLook(null, 0.5, 0, 1 / 60);
  assert.ok(state.yawRate > 0 && state.yawRate < target * 0.5, `first frame ${state.yawRate} should lag ${target}`);
  for (let i = 0; i < 240; i++) state = stepLook(state, 0.5, 0, 1 / 60);
  assert.ok(Math.abs(state.yawRate - target) < 0.02, state.yawRate);
  const held = state.yaw;
  state = stepLook(state, 0, 0, 0.4);
  assert.ok(Math.abs(state.yaw - held) < 1e-6, 'still waiting out the second');
  state = stepLook(state, 0, 0, 0.7);
  assert.ok(Math.abs(state.yaw) < Math.abs(held) * 0.6, `recentred ${state.yaw} from ${held}`);
  state = stepLook(state, 0.5, 0.2, 1 / 60, {recentre: true});
  assert.equal(state.yaw, 0);
  assert.equal(state.pitch, 0);
});

test('one axis is one job, and kid mode defaults the stick to low', () => {
  const feel = {sensitivity: 'low', mode: 'kid'},
    buttons = [],
    car = mapPad('car', {axes: [0.85, -1, 0.7, -0.4], buttons}, feel);
  assert.equal(car.throttle, 0, 'left stick up is not the throttle');
  assert.ok(car.steer > 0 && car.steer < 0.8);
  assert.equal(car.moveX, 0);
  assert.equal(car.pitch, 0);
  assert.ok(car.lookX > 0 && car.lookX < 0.4, 'right stick only looks, and low gain keeps it small');
  assert.equal(mapPad('car', {axes: [0.2, 0, 0.2, 0], buttons}, feel).steer, 0);
  assert.equal(mapPad('car', {axes: [0.2, 0, 0.2, 0], buttons}, feel).lookX, 0);
  const robot = mapPad('robot', {axes: [0.7, -0.8, 0.6, 0], buttons}, feel);
  assert.equal(robot.steer, 0);
  assert.equal(robot.throttle, 0);
  assert.ok(robot.moveY > 0 && robot.moveX > 0);
  const fly = mapPad('fly', {axes: [0.8, -0.8, 0.3, 0], buttons}, feel);
  assert.equal(fly.steer, 0);
  assert.equal(fly.throttle, 0);
  assert.ok(fly.pitch > 0 && fly.roll > 0 && fly.roll < 0.7);
  assert.equal(fly.lookX > 0 && fly.roll > 0, true, 'left stick flies, right stick looks');
  assert.equal(sensitivityFor('kid', null), 'low');
  assert.equal(sensitivityFor('bigKid', null), 'normal');
  assert.equal(sensitivityFor('kid', 'high'), 'high');
  assert.deepEqual([cycleSensitivity('low'), cycleSensitivity('normal'), cycleSensitivity('high')], ['normal', 'high', 'low']);
});

test('the game, the robot and the pause menu use this feel', () => {
  const main = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8'),
    robot = fs.readFileSync(new URL('./physics/robot.mjs', import.meta.url), 'utf8'),
    html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8'),
    driver = fs.readFileSync(new URL('../../../bin/deploy-rc', import.meta.url), 'utf8');
  assert.match(main, /feelNow\(\)/);
  assert.match(main, /stepLook\(/);
  assert.match(main, /KID_STEER_RATE/);
  assert.doesNotMatch(robot, /12 \* dt/);
  assert.match(html, /id="stick-sensitivity"/);
  assert.match(html, /Stick sensitivity/);
  assert.match(driver, /control-feel\.test\.mjs/);
});
