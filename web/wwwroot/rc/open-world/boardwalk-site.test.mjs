import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOARDWALK_BOUNDS, BOARDWALK } from './boardwalk.mjs';
import { EVENTS, LOCATIONS } from './catalog.mjs';
import { inside, roadWidth, segmentDistance } from './geometry.mjs';
import { insideBase } from './boundary.mjs';
import { SCENERY_BOUNDS } from './district-zones.mjs';
import { SKATESTREET_BOUNDS } from './skatestreet.mjs';
import { HANGAR, hangarWorld } from './skate-hangar.mjs';
import { roadsideDetail, desertScatter } from './roadside-detail.mjs';
import { elevationAt } from './elevation.mjs';
import { WAVEPOOL_BEACH } from './wavepool-course.mjs';

const root = new URL('../assets/world/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root)));
const [x0, z0, x1, z1] = BOARDWALK_BOUNDS;
const ring = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const intersects = (a, b, c, d) => {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
};
const clearance = (a, b) => {
  a = a.slice(0, 2); b = b.slice(0, 2);
  if (inside(...a, ring) || inside(...b, ring)) return 0;
  let distance = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const c = ring[i - 1], d = ring[i];
    if (intersects(a, b, c, d)) return 0;
    distance = Math.min(distance, segmentDistance(...a, c, d), segmentDistance(...b, c, d), segmentDistance(...c, a, b), segmentDistance(...d, a, b));
  }
  return distance;
};
const hangarBounds = (() => {
  const c = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, z]) => hangarWorld([x * (HANGAR.length / 2 + 3), 0, z * (HANGAR.width / 2 + 3)]));
  return [Math.min(...c.map(p => p[0])), Math.min(...c.map(p => p[2])), Math.max(...c.map(p => p[0])), Math.max(...c.map(p => p[2]))];
})();

test('Boardwalk site is flat, inside the base, and clear of authored scenery', () => {
  assert.deepEqual(BOARDWALK_BOUNDS, [-700, 3400, -636, 3442]);
  assert.deepEqual(BOARDWALK.center, [-668, 0, 3421]);
  const terrain = read('playable-terrain.json');
  for (let x = x0; x <= x1; x += 3) for (let z = z0; z <= z1; z += 3) assert.equal(elevationAt(terrain, x, z), 0, `flat datum at ${x},${z}`);
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) assert.ok(insideBase(x, z), `site corner inside base: ${x},${z}`);
  for (const b of [...SCENERY_BOUNDS, SKATESTREET_BOUNDS, hangarBounds]) assert.ok(!overlaps(BOARDWALK_BOUNDS, b), `overlaps authored scenery ${b}`);
  for (const p of LOCATIONS.filter(p => !['waterpark', 'venice'].includes(p.id))) assert.ok(Math.hypot(p.pos[0] + 668, p.pos[2] - 3421) > 100, `${p.id} too close`);
});

test('Boardwalk site clears every real road, building, event, and the Wavepool loop', () => {
  for (let tx = Math.floor(x0 / 256) - 1; tx <= Math.floor(x1 / 256) + 1; tx++) for (let tz = Math.floor(z0 / 256) - 1; tz <= Math.floor(z1 / 256) + 1; tz++) {
    const file = new URL(`tile-${tx}-${tz}.json`, root), tile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { tile: [tx, tz], features: [] };
    for (const f of tile.features) {
      const g = f.geometry, p = f.properties;
      if (g.type === 'LineString' && (p.highway || p.aeroway || p.railway)) for (let i = 1; i < g.coordinates.length; i++) assert.ok(clearance(g.coordinates[i - 1], g.coordinates[i]) > roadWidth(p) / 2 + 2.5, `road ${f.id}`);
      if (g.type === 'Polygon' && (p.building || p.aeroway || p.amenity === 'parking')) {
        const r = g.coordinates[0];
        assert.ok(!r.some(p => inside(...p, ring)) && !ring.some(p => inside(...p, r)), `footprint ${f.id}`);
        for (let i = 1; i < r.length; i++) assert.ok(clearance(r[i - 1], r[i]) > 0, `footprint edge ${f.id}`);
      }
    }
  }
  for (const e of EVENTS) if (Array.isArray(e.points)) for (let i = 1; i < e.points.length; i++) assert.ok(clearance(e.points[i - 1], e.points[i]) > (e.half ?? 6) + 3, `${e.id} crosses Boardwalk`);
  const pointClearance = ([x, z]) => { if (inside(x, z, ring)) return 0; return Math.min(...ring.slice(1).map((b, i) => segmentDistance(x, z, ring[i], b))); };
  for (const [name, p] of Object.entries(WAVEPOOL_BEACH.landmarks)) assert.ok(pointClearance(p) > 3, `Wavepool landmark ${name} inside Boardwalk`);
});

test('Boardwalk site leaves generated scatter outside the skate floor', () => {
  for (let tx = Math.floor(x0 / 256) - 1; tx <= Math.floor(x1 / 256) + 1; tx++) for (let tz = Math.floor(z0 / 256) - 1; tz <= Math.floor(z1 / 256) + 1; tz++) {
    const file = new URL(`tile-${tx}-${tz}.json`, root), tile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { tile: [tx, tz], features: [] }, bounds = [tx * 256, tz * 256, (tx + 1) * 256, (tz + 1) * 256];
    for (const p of [...roadsideDetail(tile, bounds), ...desertScatter(tile, bounds, null, 460)]) assert.ok(!inside(p.x, p.z, ring), `runtime scatter through Boardwalk at ${p.x},${p.z}`);
  }
});


test('Venice has a unique skate location beside the existing After Hours Boardwalk race',()=>{
  const park=LOCATIONS.find(l=>l.skate==='venice');assert.ok(park);assert.equal(park.id,'venice');
  assert.equal(new Set(LOCATIONS.map(l=>l.id)).size,LOCATIONS.length);
  assert.equal(LOCATIONS.find(l=>l.id==='boardwalk').event,'after-hours-boardwalk');
});
