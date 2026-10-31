import test from 'node:test'; import assert from 'node:assert/strict';
import { sunStateAt, snapToGrid, snapFocusAxisAligned, snapLightToTexels } from '../sun.js';
import { computeTexelStabilizedShadowFrame } from '../../shadow_stabilizer.js';
const profile = { sunNoon: [0xfff1db, 3.4], sunHorizon: [0xff9a50, 1], hemi: [0xd8ecf5, 0x8a7a5e, 1.35] };
test('noon is full sun, midnight has none', () => {
  const noon = sunStateAt(0.5, profile), mid = sunStateAt(0, profile);
  assert.equal(noon.sunColor, 0xfff1db); assert.equal(noon.sunIntensity, 3.4); assert.equal(noon.hemiIntensity, 1.35);
  assert.equal(mid.sunIntensity, 0); assert.ok(mid.hemiIntensity < 0.3);
  assert.equal(sunStateAt(1.5, profile).sunIntensity, noon.sunIntensity, 'day fraction wraps');
  const dawn = sunStateAt(0.27, profile); assert.ok(dawn.sunIntensity > 0 && dawn.sunIntensity < 3.4);
});
test('axis-aligned snap matches rc/visuals.js followSun arithmetic', () => {
  const texel = (38 * 2) / 2048, ref = v => Math.round(v / texel) * texel;
  const s = snapFocusAxisAligned({ x: 12.3456, y: 1.5, z: -7.891 }, 76, 2048);
  assert.equal(s.x, ref(12.3456)); assert.equal(s.z, ref(-7.891)); assert.equal(s.y, 1.5); assert.equal(snapToGrid(7, 2), 8);
});
test('snapLightToTexels agrees with the flight stabiliser and keeps the light offset', () => {
  const light = { position: { x: 100, y: 200, z: -50 }, target: { position: { x: 0, y: 0, z: 0 } } };
  const cam = { position: { x: 10.31, y: 4.7, z: -9.77 } };
  const offset = [100, 200, -50];
  const ref = computeTexelStabilizedShadowFrame({ focus: [10.31, 4.7, -9.77], direction: [-100, -200, 50], halfExtent: 512, mapSize: 1024 });
  const r = snapLightToTexels(light, cam, 1024, 512);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(r.focus[i] - ref.focus[i]) < 1e-9);
  assert.equal(r.worldUnitsPerTexel, ref.worldUnitsPerTexel);
  assert.deepEqual([light.position.x - light.target.position.x, light.position.y - light.target.position.y, light.position.z - light.target.position.z], offset);
  const again = snapLightToTexels(light, { position: { x: r.focus[0], y: r.focus[1], z: r.focus[2] } }, 1024, 512);
  assert.deepEqual(again.focus.map(c => +c.toFixed(9)), r.focus.map(c => +c.toFixed(9)), 'idempotent');
});
