import test from 'node:test'; import assert from 'node:assert/strict';
import { atmosphereParams, createFog, fogAmount, applyAtmosphere } from '../atmosphere.js';
class Fog { constructor(c, n, f) { Object.assign(this, { c, n, f }); } } class FogExp2 { constructor(c, d) { Object.assign(this, { c, d }); } } class Color { constructor(c) { this.c = c; } }
const T = { Fog, FogExp2, Color };
test('linear fog and sky from an RC profile', () => {
  const p = { fogColor: '#b2c6c5', near: 65, far: 150 };
  assert.deepEqual(createFog(p, T), new Fog('#b2c6c5', 65, 150));
  const scene = applyAtmosphere({}, { ...p, skyColor: '#a9d4ee' }, T);
  assert.equal(scene.background.c, '#a9d4ee'); assert.equal(scene.fog.f, 150);
  assert.equal(atmosphereParams(p).skyColor, '#b2c6c5');
});
test('exponential and none modes', () => {
  assert.equal(createFog({ mode: 'exponential', fogColor: 1, density: 0.01 }, T).d, 0.01);
  assert.equal(createFog({ mode: 'none', fogColor: 1 }, T), null);
});
test('fog amount ramps, and height thins it', () => {
  const p = { fogColor: 1, near: 100, far: 200 };
  assert.equal(fogAmount(p, 100), 0); assert.equal(fogAmount(p, 150), 0.5); assert.equal(fogAmount(p, 300), 1);
  assert.ok(fogAmount({ ...p, heightFalloff: 0.01 }, 150, 100) < 0.5);
});
test('bad ranges are rejected', () => { assert.throws(() => atmosphereParams({ fogColor: 1, near: 10, far: 5 }), RangeError); assert.throws(() => atmosphereParams({ mode: 'x' }), TypeError); });
