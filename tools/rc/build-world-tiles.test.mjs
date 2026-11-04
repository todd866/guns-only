import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileWorldTiles, project, tileFor } from './build-world-tiles.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rc-world-'));
const fc = features => ({ type: 'FeatureCollection', attribution: 'test source', features });
const feature = (geometry, properties = {}) => ({ type: 'Feature', properties, geometry });

test('projection uses east and south runtime axes and negative tiles', () => {
  assert.deepEqual(project([0, 0], { lon: 0, lat: 0 }), [0, -0]);
  assert.ok(project([0.001, 0], { lon: 0, lat: 0 })[0] > 0);
  assert.ok(project([0, 0.001], { lon: 0, lat: 0 })[1] < 0);
  assert.deepEqual(tileFor(-0.1, -0.1), [-1, -1]);
});

test('features crossing a tile boundary are indexed in every intersected tile and holes survive', () => {
  const d = tmp(), input = path.join(d, 'in.json'), out = path.join(d, 'out');
  const origin = { lon: 0, lat: 0 }, east = 256 / 6371008.8 * 180 / Math.PI;
  const geom = { type: 'Polygon', coordinates: [
    [[0, 0], [east * 1.1, 0], [east * 1.1, -0.0001], [0, -0.0001], [0, 0]],
    [[east * .2, -0.00001], [east * .3, -0.00001], [east * .3, -0.00002], [east * .2, -0.00002], [east * .2, -0.00001]],
  ] };
  fs.writeFileSync(input, JSON.stringify(fc([feature(geom, { osm: 'way/7' })])));
  const r = compileWorldTiles({ input, out, origin });
  assert.equal(r.tileCount, 2);
  for (const f of fs.readdirSync(out).filter(x => x.startsWith('tile-'))) { const tile = JSON.parse(fs.readFileSync(path.join(out, f))); assert.equal(tile.features[0].id, 'way/7'); assert.equal(tile.features[0].geometry.coordinates.length, 2); }
});

test('output is deterministic and refuses overwrite', () => {
  const d = tmp(), input = path.join(d, 'in.json'), a = path.join(d, 'a'), b = path.join(d, 'b');
  fs.writeFileSync(input, JSON.stringify(fc([feature({ type: 'Point', coordinates: [0, 0] }, { osm: 'node/1' })])));
  compileWorldTiles({ input, out: a }); compileWorldTiles({ input, out: b });
  assert.deepEqual(fs.readdirSync(a).sort().map(f => fs.readFileSync(path.join(a, f), 'utf8')), fs.readdirSync(b).sort().map(f => fs.readFileSync(path.join(b, f), 'utf8')));
  assert.throws(() => compileWorldTiles({ input, out: a }), /new or empty/);
});

test('bad coordinates and unsupported geometry fail safely', () => {
  const d = tmp(), input = path.join(d, 'in.json'); fs.writeFileSync(input, JSON.stringify(fc([feature({ type: 'Point', coordinates: [999, 0] })])));
  assert.throws(() => compileWorldTiles({ input, out: path.join(d, 'out') }), /invalid coordinate/);
  fs.writeFileSync(input, JSON.stringify(fc([feature({ type: 'GeometryCollection', geometries: [] })])));
  assert.throws(() => compileWorldTiles({ input, out: path.join(d, 'out2') }), /unsupported geometry/);
});
