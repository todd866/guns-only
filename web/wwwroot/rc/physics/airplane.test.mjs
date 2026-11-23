import assert from 'node:assert/strict';
import test from 'node:test';

import {PLANE, applyAssist, gunsightLead, noseVector, specificEnergy, stepAirplane} from './airplane.mjs';

const DT = 1 / 60;

function cruise(extra = {}) {
  return {
    x: 0, y: 40, z: 0,
    heading: 0, pitch: 0, bank: 0,
    speed: 14, vy: 0,
    assist: 'pilot',
    ...extra
  };
}

function run(craft, cmd, seconds, env) {
  for (let t = 0; t < seconds; t += DT) stepAirplane(craft, cmd, DT, PLANE, env);
  return craft;
}

test('velocity converges to the nose direction, with lag', () => {
  const craft = cruise();
  // Point the nose up-right of the path and hold it there.
  craft.pitch = 0.3;
  craft.heading = 0.4;
  stepAirplane(craft, {lever: 0.6}, DT);
  const early = noseVector(craft);
  const vEarly = {x: craft.vx / craft.speed, y: craft.vy / craft.speed, z: craft.vz / craft.speed};
  const dotEarly = early.x * vEarly.x + early.y * vEarly.y + early.z * vEarly.z;
  assert.ok(dotEarly < 0.999, 'the path lags the nose at first');
  run(craft, {lever: 0.6}, 3);
  const nose = noseVector(craft);
  const vDir = {x: craft.vx / craft.speed, y: craft.vy / craft.speed, z: craft.vz / craft.speed};
  const dot = nose.x * vDir.x + nose.y * vDir.y + nose.z * vDir.z;
  assert.ok(dot > 0.995, `velocity follows the nose (dot ${dot.toFixed(4)})`);
});

test('bank to turn: right wing down turns right, faster means a wider turn', () => {
  const slow = run(cruise({speed: 10}), {roll: 0, lever: 0.4}, 0);
  slow.bank = 0.6;
  const fast = cruise({speed: 18});
  fast.bank = 0.6;
  const h0 = slow.heading;
  run(slow, {lever: 0.4}, 1);
  run(fast, {lever: 0.9}, 1);
  // Aviation sign in this frame: a right turn is heading decreasing.
  assert.ok(slow.heading < h0, 'right bank turns right');
  assert.ok(Math.abs(slow.heading - h0) > Math.abs(fast.heading - h0),
    'the slower jet out-turns the faster one at the same bank');
});

test('a coordinated turn needs no rudder and reads more than 1 g', () => {
  const craft = cruise({speed: 14});
  craft.bank = 0.9;
  run(craft, {lever: 0.8}, 1);
  assert.ok(craft.gLoad > 1.3, `turn g ${craft.gLoad.toFixed(2)}`);
  const level = run(cruise(), {lever: 0.5}, 1);
  assert.ok(Math.abs(level.gLoad - 1) < 0.1, `level g ${level.gLoad.toFixed(2)}`);
});

test('climbing bleeds speed and diving gains it', () => {
  const up = cruise();
  up.pitch = 0.5;
  run(up, {lever: 0.5}, 1.5);
  assert.ok(up.speed < 14, `climb bled speed to ${up.speed.toFixed(1)}`);
  assert.ok(up.y > 40, 'and bought height');
  const down = cruise();
  down.pitch = -0.5;
  run(down, {lever: 0.5}, 1.5);
  assert.ok(down.speed > 14, `dive gained speed ${down.speed.toFixed(1)}`);
});

test('turning bleeds energy', () => {
  const straight = cruise({speed: 16});
  const turning = cruise({speed: 16});
  turning.bank = 1.0;
  run(straight, {lever: 0.6}, 3);
  run(turning, {lever: 0.6}, 3);
  assert.ok(specificEnergy(turning) < specificEnergy(straight),
    `turning energy ${specificEnergy(turning).toFixed(0)} < straight ${specificEnergy(straight).toFixed(0)}`);
});

test('below Vs the jet stalls: it sinks, the nose sags, and speed recovers it', () => {
  const craft = cruise({speed: 4});
  craft.pitch = 0.4;
  const y0 = craft.y;
  let sank = 0;
  let stalled = false;
  for (let t = 0; t < 1.5; t += DT) {
    stepAirplane(craft, {lever: 0}, DT);
    sank = Math.min(sank, craft.vy);
    stalled = stalled || craft.stalled;
  }
  assert.equal(stalled, true);
  assert.ok(sank < -1, `a stalled wing sinks (worst vy ${sank.toFixed(1)})`);
  assert.ok(craft.y < y0, 'and loses height');
  assert.ok(craft.pitch < 0.4, 'the nose sags, gently');
  run(craft, {lever: 1}, 6);
  assert.equal(craft.stalled, false, `power and a low nose recover (v ${craft.speed.toFixed(1)})`);
});

test('no hover: idle and slow always descends', () => {
  const craft = cruise({speed: 0.5});
  craft.pitch = 0.6; // holding the nose up does not help
  const y0 = craft.y;
  run(craft, {lever: 0, pitch: 1}, 1.5);
  assert.ok(craft.y < y0, 'a plane with no airspeed falls');
});

test('kid assist levels hands-off, keeps speed, and defends the floor', () => {
  const craft = cruise({assist: 'kid'});
  craft.bank = 0.8;
  craft.pitch = 0.4;
  run(craft, {lever: 0.5}, 2);
  assert.ok(Math.abs(craft.bank) < 0.1, `hands off rolls level (bank ${craft.bank.toFixed(2)})`);
  assert.ok(Math.abs(craft.pitch) < 0.1, 'and settles the nose');

  const slow = cruise({assist: 'kid', speed: 3});
  run(slow, {lever: 0}, 3);
  assert.ok(slow.speed > PLANE.vs, `stall protection holds speed (v ${slow.speed.toFixed(1)})`);

  const low = cruise({assist: 'kid', y: 2, speed: 12});
  low.pitch = -0.4;
  run(low, {lever: 0.5}, 1.5, {groundY: 0});
  assert.ok(low.y > 0.8, `the floor pull-up saved it (y ${low.y.toFixed(1)})`);

  const pilot = cruise({assist: 'pilot'});
  pilot.bank = 0.8;
  const cmd = applyAssist(pilot, {roll: 0, pitch: 0, lever: 0.5, assist: 'pilot'});
  assert.equal(cmd.roll, 0, 'pilot gets the raw stick');
});

test('the gunsight pipper leads a crossing target onto the shot', () => {
  const shooter = {x: 0, y: 10, z: 0};
  const target = {x: 0, y: 10, z: 30, vx: 8, vy: 0, vz: 0};
  const lead = gunsightLead(shooter, target, 32);
  assert.ok(lead.x > 5, `pipper sits ahead of the target (x ${lead.x.toFixed(1)})`);
  // Fly the shot at the pipper and the dart meets the toy.
  const t = lead.time;
  const shotAt = {x: (lead.x / Math.hypot(lead.x, lead.y - 10, lead.z)) * 32 * t,
    z: (lead.z / Math.hypot(lead.x, lead.y - 10, lead.z)) * 32 * t};
  const targetAt = {x: target.x + target.vx * t, z: target.z};
  assert.ok(Math.hypot(shotAt.x - targetAt.x, shotAt.z - targetAt.z) < 1.5, 'the lead solution meets the target');
});
