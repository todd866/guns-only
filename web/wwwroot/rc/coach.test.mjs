import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoach} from './coach.mjs';
import {padSvg} from './pad-art.mjs';
const run = (c, n, f) => { let r; for (let i = 0; i < n; i++) r = c({dt: 0.1, ...f}); return r; };
test('the controller drawing appears when a kid is stuck and leaves once they drive', () => {
  const c = createCoach();
  assert.equal(run(c, 10, {speed: 3}).show, false, 'driving: hidden');
  const sat = run(c, 30, {speed: 0, throttle: 0});
  assert.equal(sat.show, true, 'sitting still 3 s: shown');
  assert.ok(sat.glow.has(7), 'RT pulses');
  assert.equal(sat.glow.has('stick'), false, 'the stick is not the throttle');
  assert.equal(run(c, 20, {speed: 3, throttle: 1}).show, true, 'still shown after 2 s of driving');
  assert.equal(run(c, 20, {speed: 3, throttle: 1}).show, false, 'gone after 4 s of driving');
  const both = run(c, 15, {speed: 0.2, throttle: 1, lt: 1, rt: 1});
  assert.equal(both.why, 'both', 'both triggers held');
  assert.ok(both.glow.has(7));
  assert.equal(run(createCoach(), 1, {speed: 5, joined: true}).show, true, 'a new pad is introduced');
  assert.equal(run(c, 40, {speed: 0, active: false}).show, false, 'paused: hidden');
});

test('nobody holding the pad: no drawing over their half', () => {
  const c = createCoach();
  assert.equal(run(c, 30, {speed: 0, touched: true}).show, true, 'trying and stuck: shown');
  assert.equal(run(c, 170, {speed: 0, touched: false}).show, false, 'put down for 15 s: hidden');
  assert.equal(run(c, 30, {speed: 0, touched: true}).show, true, 'picked up and stuck again: back');
});

test('each form draws the controls that form actually uses', () => {
  const labels = (form) => padSvg('xbox', {}, {form});
  const car = labels('car'),
    foot = labels('robot'),
    air = labels('fly'),
    deck = labels('board'),
    chopper = labels('chopper'),
    gunship = labels('gunship');
  for (const svg of [car, foot, air, deck, chopper, gunship]) assert.doesNotMatch(svg, /push up/);
  assert.match(car, /STEER/);
  assert.match(car, />GO</);
  assert.match(car, /BRAKE/);
  assert.match(car, /JUMP/);
  assert.match(car, /MORPH/);
  assert.match(car, /BOOST/);
  assert.match(deck, /OLLIE/);
  assert.match(foot, /MOVE/);
  assert.match(foot, /FIRE/);
  assert.match(foot, /AIM/);
  assert.match(foot, /PUNCH/);
  assert.match(air, /CLIMB/);
  assert.match(air, /turn/);
  assert.match(air, /BRAKE/);
  assert.match(air, /FLY/);
  assert.match(air, /LAND/);
  assert.match(air, /LOOP/);
  assert.match(air, /YAW/);
  assert.doesNotMatch(air, /PITCH/);
  assert.match(gunship, /CLIMB/);
  assert.match(gunship, /LOOP/);
  assert.match(chopper, /CLIMB/);
  assert.match(chopper, /FLY/);
  assert.match(chopper, /LAND/);
  assert.doesNotMatch(chopper, />UP</);
  const footCoach = run(createCoach(), 30, {speed: 0, throttle: 0, form: 'robot'});
  assert.ok(footCoach.glow.has('stick'), 'on foot, the move stick pulses');
  assert.equal(footCoach.glow.has(7), false);
});
