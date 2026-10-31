import test from 'node:test';
import assert from 'node:assert/strict';
import { curbRails, parkRails } from './street-rails.mjs';

const road = (id, highway, coords, extra = {}) => ({ id, properties: { highway, osm: id, ...extra }, geometry: { type: 'LineString', coordinates: coords } });

test('every paved road edge near the player is a curb rail on both sides, following the ground', () => {
  const rails = curbRails([road('w1', 'residential', [[0, 0], [20, 0]]), road('w1', 'residential', [[0, 0], [20, 0]])], [10, 0], (x, z) => x * .1);
  assert.equal(rails.length, 2, 'one road seen in two tiles is built once');
  const zs = rails.map(r => r.pts[0][1]).sort((a, b) => a - b);
  assert.deepEqual(zs, [-4.5, 4.5]);   // residential roads are 9 m wide
  assert.ok(rails.every(r => r.kind === 'ledge' && r.pts.length === 6));
  assert.ok(Math.abs(rails[0].pts.at(-1)[2] - (2 + .03)) < 1e-9, 'height follows the ground');
});

test('tracks, footpaths and far-away roads are not curbs', () => {
  const rails = curbRails([road('a', 'track', [[0, 0], [20, 0]]), road('b', 'footway', [[0, 0], [20, 0]]), road('c', 'residential', [[500, 0], [520, 0]])], [10, 0], () => 0);
  assert.equal(rails.length, 0);
});

test('park rails come out in the street frame, keyed to their park', () => {
  const park = { rails: [{ id: 'r1', kind: 'rail', pts: [[0, 0, .8], [2, 0, .8]] }] };
  const [r] = parkRails('plaza', park, ([u, v, h]) => [100 + u, h, 50 + v], [100, 50]);
  assert.equal(r.key, 'plaza:r1'); assert.deepEqual(r.pts[1], [102, 50, .8]); assert.equal(r.kind, 'rail');
  assert.equal(parkRails('plaza', park, ([u, v, h]) => [100 + u, h, 50 + v], [900, 900]).length, 0);
});

test('residential streets put the curb at the asphalt edge of the rolled kerb; OSM roads inside the district are skipped', async () => {
  const { residentialCurbRails } = await import('./street-rails.mjs');
  const rails = residentialCurbRails([{ kind: 'residential', points: [[0, 0], [0, 20]] }, { kind: 'footway', points: [[5, 0], [5, 20]] }], [0, 10], () => 0);
  assert.equal(rails.length, 2);
  assert.deepEqual(rails.map(r => Math.abs(r.pts[0][0])), [2.9 + .1, 2.9 + .1]);
  assert.equal(curbRails([road('w', 'residential', [[0, 0], [20, 0]])], [10, 0], () => 0, { skip: [-5, -5, 30, 5] }).length, 0);
});
