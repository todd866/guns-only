import test from 'node:test';
import assert from 'node:assert/strict';
import {planCell, NEAR_DETAIL} from './near-detail.js';
import {districtBounds} from './district-zones.mjs';

const ground = (surface, normal = [0, 1, 0], y = 0) => () => ({point: [0, y, 0], normal, surface});

test('a cell plans the same detail every time it is entered', () => {
  const a = planCell(12, -40, ground('grass'), {density: 14}), b = planCell(12, -40, ground('grass'), {density: 14});
  assert.deepEqual(a.items, b.items);
  assert.equal(a.items.filter(i => i.kind === 'tuft').length, 16 * 14, 'tufts per square metre x 16 m²');
});

test('grass density follows the ring, hard ground gets pebbles and cracks, skate surfaces stay clean', () => {
  assert.equal(planCell(3, 3, ground('grass'), {density: 40}).items.filter(i => i.kind === 'tuft').length, 640);
  const hard = planCell(3, 3, ground('asphalt')).items;
  assert.ok(hard.length > 0 && hard.every(i => ['pebble', 'leaf', 'crack', 'stain'].includes(i.kind)));
  for (const s of ['bowl', 'quarter', 'kerb', 'wood', 'gymfloor']) assert.equal(planCell(3, 3, ground(s)).items.length, 0, s);
  assert.equal(planCell(3, 3, ground('grass', [0.8, 0.6, 0])).items.length, 0, 'no detail on steep ramps');
});

test('scatter is not in rows: tuft positions inside a metre are uncorrelated', () => {
  const t = planCell(7, 9, ground('grass'), {density: 40}).items.filter(i => i.kind === 'tuft');
  const xs = t.map(i => i.x), zs = t.map(i => i.z), mx = xs.reduce((a, b) => a + b) / xs.length, mz = zs.reduce((a, b) => a + b) / zs.length;
  let sxz = 0, sxx = 0, szz = 0;for (let i = 0; i < t.length; i++) { sxz += (xs[i] - mx) * (zs[i] - mz); sxx += (xs[i] - mx) ** 2; szz += (zs[i] - mz) ** 2; }
  assert.ok(Math.abs(sxz / Math.sqrt(sxx * szz)) < .1, 'x/z correlation');
});

test('the BX interior gets no leaves or grass, and unloaded ground is retried', () => {
  const b = districtBounds('bx'), cx = Math.floor((b[0] + b[2]) / 2 / NEAR_DETAIL.cell), cz = Math.floor((b[1] + b[3]) / 2 / NEAR_DETAIL.cell);
  assert.equal(planCell(cx, cz, ground('concrete')).items.length, 0);
  assert.equal(planCell(1, 1, () => null).hits, 0, 'no hits: the runtime leaves the cell to plan again');
});
