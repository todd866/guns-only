import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptiveResolution, stepAdaptiveResolution, ADAPT} from './adaptive-resolution.mjs';

const run = (a, ms, seconds) => {
  const out = [];
  for (let t = 0; t < seconds; t += ms / 1000) {
    const r = stepAdaptiveResolution(a, ms);
    if (r) out.push(r);
  }
  return out;
};

test('slow frames shed resolution in steps down to the floor, never below', () => {
  const a = createAdaptiveResolution({max: 1.75, min: 1});
  const changes = run(a, 28, 30);
  assert.ok(changes.length >= 4, `${changes}`);
  assert.equal(a.ratio, 1);
  assert.ok(changes.every((r, i) => i === 0 || r < changes[i - 1]));
});

test('frames at the refresh rate hold full resolution, and recovery climbs back after calm', () => {
  const a = createAdaptiveResolution({max: 1.75});
  assert.deepEqual(run(a, 16.7, 20), []);
  run(a, 28, 8);
  const low = a.ratio;
  assert.ok(low < 1.75);
  run(a, 16.7, 30);
  assert.equal(a.ratio, 1.75, `recovered from ${low}`);
});

test('pauses and hitches are not load', () => {
  const a = createAdaptiveResolution();
  for (let i = 0; i < 400; i++) stepAdaptiveResolution(a, i % 50 ? 16.7 : 400);
  assert.equal(a.ratio, 1.75);
  assert.ok(ADAPT.slow > ADAPT.calm);
});

test('a pacing tail at a 60 fps median keeps full resolution', () => {
  const a = createAdaptiveResolution({max: 1.75});
  for (let i = 0; i < 2000; i++) stepAdaptiveResolution(a, [16, 17, 17, 17, 18, 17, 17, 23, 17, 17][i % 10]);
  assert.equal(a.ratio, 1.75);
});
