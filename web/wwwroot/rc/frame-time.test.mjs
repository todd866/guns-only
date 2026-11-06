import test from 'node:test';
import assert from 'node:assert/strict';
import {frameSeconds, cameraGlide} from './frame-time.mjs';
import {createBootTrace, summarizeBootFrames} from './boot-trace.mjs';
import {warmPresentation} from './presentation-warm.mjs';
test('startup timestamps cannot extrapolate camera damping outside its segment', () => {
  for (const [now, last] of [
    [1, 9000],
    [9000, 1],
    [9016, 9000]
  ]) {
    const dt = frameSeconds(now, last),
      blend = 1 - Math.exp(-dt * 7);
    assert.ok(blend >= 0 && blend <= 1);
    assert.ok(dt <= 0.1);
  }
  assert.equal(frameSeconds(1, 9000), 0);
  assert.equal(frameSeconds(9016, 9000), 0.016);
});

test('boot frame summary reports p50, p95, max, and how many frames passed 50 ms', () => {
  const summary = summarizeBootFrames([10, 12, 16, 70, 40, 11]);
  assert.deepEqual(summary, {p50: 16, p95: 70, max: 70, over50: 1, count: 6});
  assert.deepEqual(summarizeBootFrames([]), {p50: null, p95: null, max: null, over50: 0, count: 0});
});

test('boot trace logs each frame for ten seconds and summarizes once', () => {
  const logs = [];
  const summaries = [];
  const trace = createBootTrace({
    log: ms => logs.push(ms),
    onSummary: summary => summaries.push(summary)
  });
  assert.equal(trace.frame(16, 0), null);
  assert.equal(trace.frame(80, 5_000), null);
  assert.equal(trace.frame(12, 10_000), null);
  const summary = trace.frame(99, 10_001);
  assert.deepEqual(logs, [16, 80, 12]);
  assert.equal(summary.over50, 1);
  assert.equal(summary.count, 3);
  assert.equal(summary.p50, 16);
  assert.equal(summary.p95, 80);
  assert.equal(summary.max, 80);
  assert.equal(trace.frame(5, 11_000), null);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0], summary);
});

test('a held opening does not damp the camera, and a released one does', () => {
  assert.equal(cameraGlide(true, 0.1, 7), 0);
  const moving = cameraGlide(false, 0.016, 7);
  assert.ok(moving > 0 && moving < 1);
});

test('presentation warm compiles every material and uploads each texture once', async () => {
  const calls = [];
  const shared = {isTexture: true, name: 'shared'};
  const normal = {isTexture: true, name: 'normal'};
  const scene = {
    environment: shared,
    background: {isTexture: true, name: 'sky'},
    traverse(visit) {
      visit({
        material: [
          {map: shared, color: {r: 1}, uniforms: {diffuse: {value: normal}}},
          null
        ]
      });
    }
  };
  const camera = {name: 'chase'};
  await warmPresentation(
    {
      async compileAsync(target, cam) {
        calls.push(['compileAsync', target, cam]);
      },
      initTexture(texture) {
        calls.push(['init', texture.name]);
      }
    },
    scene,
    camera
  );
  assert.equal(calls[0][0], 'compileAsync');
  assert.equal(calls[0][1], scene);
  assert.equal(calls[0][2], camera);
  assert.deepEqual(
    calls.slice(1).map(call => call[1]),
    ['shared', 'normal', 'sky']
  );
});

test('presentation warm falls back to compile and keeps going when one texture upload throws', async () => {
  let compiled = 0;
  const uploaded = [];
  const scene = {
    traverse(visit) {
      visit({material: {map: {isTexture: true, name: 'bad'}, roughnessMap: {isTexture: true, name: 'ok'}}});
    }
  };
  await warmPresentation(
    {
      compile() {
        compiled++;
      },
      initTexture(texture) {
        if (texture.name === 'bad') throw new Error('incomplete');
        uploaded.push(texture.name);
      }
    },
    scene,
    {}
  );
  assert.equal(compiled, 1);
  assert.deepEqual(uploaded, ['ok']);
});
