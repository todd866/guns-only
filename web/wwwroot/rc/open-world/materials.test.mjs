import test from 'node:test';
import assert from 'node:assert/strict';
import {SURFACE_NAMES, generateSurface} from './materials.mjs';
import {createSurfaceMaps} from './materials.js';
test('surface sets are finite, deterministic, periodic and distinct', () => {
  const all = [];
  for (const k of SURFACE_NAMES) {
    const a = generateSurface(k),
      b = generateSurface(k);
    assert.deepEqual(a.albedo, b.albedo);
    for (const data of [a.albedo, a.roughness, a.normal]) {
      assert.ok(data.every(Number.isFinite));
      for (let y = 0; y < 128; y++)
        assert.deepEqual(
          [...data.slice(y * 128 * 4, y * 128 * 4 + 4)],
          [...data.slice((y * 128 + 127) * 4, (y * 128 + 127) * 4 + 4)]
        );
      for (let x = 0; x < 128; x++)
        assert.deepEqual(
          [...data.slice(x * 4, x * 4 + 4)],
          [...data.slice((127 * 128 + x) * 4, (127 * 128 + x) * 4 + 4)]
        );
    }
    all.push(a.albedo.join(','));
  }
  assert.equal(new Set(all).size, SURFACE_NAMES.length);
});
test('normal maps are encoded upward and Three adapter sets PBR texture semantics', () => {
  const p = generateSurface('roof');
  for (let i = 0; i < p.normal.length; i += 4) {
    const n = Array.from(p.normal.slice(i, i + 3), v => (v / 255) * 2 - 1);
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 0.04);
    assert.equal(p.normal[i + 3], 255);
  }
  const m = createSurfaceMaps('asphalt');
  assert.equal(m.map.wrapS, 1000);
  assert.equal(m.map.colorSpace, 'srgb');
  assert.equal(m.normalMap.image.width, 128);
  m.dispose();
});
test('toy-scale palette keeps road dark and architecture warm', () => {
  const sample = kind => {
    const p = generateSurface(kind);
    return [p.albedo[0], p.albedo[1], p.albedo[2]];
  };
  const asphalt = sample('asphalt'),
    stucco = sample('stucco'),
    roof = sample('roof');
  assert.ok(asphalt[0] < 100 && asphalt[1] < 110 && asphalt[2] < 120, 'asphalt should read as charcoal');
  assert.ok(stucco[0] > stucco[2] && stucco[1] > stucco[2], 'stucco should read warm');
  assert.ok(roof[0] > roof[2], 'roof should retain terracotta warmth');
  assert.ok(Math.max(...stucco) - Math.min(...stucco) > 18, 'stucco should not collapse to grey');
});
