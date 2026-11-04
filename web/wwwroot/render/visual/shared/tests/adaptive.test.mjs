import test from 'node:test'; import assert from 'node:assert/strict';
import { createAdaptivePolicy, step, quantile } from '../adaptive.js';
import { createAdaptiveResolution, stepAdaptiveResolution } from '../../../../rc/adaptive-resolution.mjs';
const rc = { max: 1.75, min: 1, percentile: 0.75, targetMs: 1000 / 60, slowMs: 19, calmMs: 17.8 };
const feed = (ms, n, p) => { const out = []; for (let i = 0; i < n; i++) { const r = step(p, ms); if (r !== null) out.push(r); } return out; };
test('RC numbers reproduce rc/adaptive-resolution.mjs exactly over a mixed trace', () => {
  const p = createAdaptivePolicy(rc), a = createAdaptiveResolution({ max: 1.75, min: 1 });
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 6000; i++) {
    const base = i % 1500 < 700 ? 24 : 16.2;
    const ms = rnd() < 0.02 ? 150 : base + rnd() * 6 - 3;
    assert.equal(step(p, ms), stepAdaptiveResolution(a, ms), `frame ${i}`);
    assert.equal(p.ratio, a.ratio);
  }
});
test('sustained slowness sheds pixels to the floor, calm brings them back', () => {
  const p = createAdaptivePolicy(rc);
  const down = feed(25, 2000, p); assert.equal(p.ratio, 1); assert.ok(down.every((r, i) => i === 0 || r < down[i - 1]));
  feed(16, 4000, p); assert.equal(p.ratio, 1.75);
});
test('the percentile is configurable: a tail of spikes only moves the high percentile', () => {
  const trace = i => (i % 10 === 0 ? 40 : 16);   // 10% spikes
  const run = percentile => { const p = createAdaptivePolicy({ ...rc, percentile }); for (let i = 0; i < 400; i++) step(p, trace(i)); return p.ratio; };
  assert.equal(run(0.75), 1.75, 'p75 ignores a 10% pacing tail');
  assert.ok(run(0.95) < 1.75, 'p95 treats it as load');
});
test('pauses are ignored; thresholds derive from targetMs; bad options throw', () => {
  const p = createAdaptivePolicy({ targetMs: 1000 / 60 }); assert.equal(p.slowMs, 19); assert.equal(p.calmMs, 17.8);
  assert.equal(step(p, 500), null); assert.equal(step(p, 0), null); assert.equal(p.frames.length, 0);
  assert.throws(() => createAdaptivePolicy({ percentile: 2 }), RangeError); assert.throws(() => createAdaptivePolicy({ min: 2, max: 1 }), RangeError);
  assert.equal(quantile([1, 2, 3, 4], 0.75), 4);
});
