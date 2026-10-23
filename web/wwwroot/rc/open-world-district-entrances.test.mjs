import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { courseFromGlb } from './physics/district.mjs';
import { DISTRICT_ENTRANCES, clipDistrictTriangle, subtractBox } from './open-world/district-entrances.mjs';

const area = t => (t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[1][2] - t[0][2]) * (t[2][0] - t[0][0]);
test('metadata records all native shells and doorway corridors', () => {
  assert.deepEqual(DISTRICT_ENTRANCES.map(d => d.id), ['housing', 'bx', 'school']);
  for (const d of DISTRICT_ENTRANCES) assert.ok(d.bounds[0] < d.bounds[2] && d.bounds[1] < d.bounds[3]);
});
test('clips backdrop, cuts doorway, preserves winding and interpolates attributes', () => {
  const t = [[-130, 2, 0, 0], [130, 2, 0, 1], [0, 2, 100, 0.5]];
  const out = clipDistrictTriangle('housing', t);
  assert.ok(out.length && out.every(q => area(q) > 0));
  assert.ok(out.every(q => q.every(v => v[0] >= -108 - 1e-7 && v[0] <= 108 + 1e-7 && v[2] >= -80 - 1e-7 && v[2] <= 80 + 1e-7)));
  assert.ok(out.some(q => q.some(v => v[3] > 0 && v[3] < 1)), 'boundary attrs are interpolated');
  const door = clipDistrictTriangle('housing', [[1, 2, 50], [5, 2, 50], [3, 2, 70]]);
  assert.equal(door.length, 0);
  const floor = clipDistrictTriangle('housing', [[-2, 0, 50], [8, 0, 50], [3, 0, 70]]);
  assert.ok(floor.length, 'ground remains traversable');
  const wall = clipDistrictTriangle('housing', [[1, 0, 50], [5, 0, 50], [3, 5, 50]]);
  assert.ok(wall.some(q => q.some(v => v[1] > 3)), 'upper wall remains above doorway cut');
});
test('subtractBox keeps vertical and roof faces without duplicate coplanar output', () => {
  const wall = subtractBox([[1, 0, 50], [5, 0, 50], [3, 5, 50]], [0, -.5, 43, 6, 3, 82]);
  assert.ok(wall.length && wall.every(q => Math.abs(area(q)) < 1e-8));
  assert.ok(wall.some(q => q.some(v => v[1] > 3)));
  const roof = subtractBox([[1, 4, 50], [5, 4, 50], [3, 4, 70]], [0, -.5, 43, 6, 3, 82]);
  assert.equal(roof.length, 1);
});
test('real district collision triangles retain shells while opening corridors', () => {
  for (const d of DISTRICT_ENTRANCES) {
    const native = courseFromGlb(fs.readFileSync(new URL(`./assets/districts/${d.id}.glb`, import.meta.url)));
    const clipped = native.world.tris.flatMap(t => clipDistrictTriangle(d.id, [t.a, t.b, t.c]));
    assert.ok(clipped.length, `${d.id} clipped collision`);
    assert.ok(clipped.length < native.world.tris.length * 2, `${d.id} remains bounded`);
  }
});
