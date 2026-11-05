import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoach} from './coach.mjs';
const run = (c, n, f) => { let r; for (let i = 0; i < n; i++) r = c({dt: 0.1, ...f}); return r; };
test('the controller drawing appears when a kid is stuck and leaves once they drive', () => {
  const c = createCoach();
  assert.equal(run(c, 10, {speed: 3}).show, false, 'driving: hidden');
  const sat = run(c, 30, {speed: 0, throttle: 0});
  assert.equal(sat.show, true, 'sitting still 3 s: shown');
  assert.ok(sat.glow.has('stick'), 'GO pulses');
  assert.equal(run(c, 20, {speed: 3, throttle: 1}).show, true, 'still shown after 2 s of driving');
  assert.equal(run(c, 20, {speed: 3, throttle: 1}).show, false, 'gone after 4 s of driving');
  const both = run(c, 15, {speed: 0.2, throttle: 1, lt: 1, rt: 1});
  assert.equal(both.why, 'both', 'both triggers held');
  assert.ok(both.glow.has(7));
  assert.equal(run(createCoach(), 1, {speed: 5, joined: true}).show, true, 'a new pad is introduced');
  assert.equal(run(c, 40, {speed: 0, active: false}).show, false, 'paused: hidden');
});
