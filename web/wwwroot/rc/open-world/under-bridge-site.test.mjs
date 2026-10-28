import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NY, NY_BOUNDS } from './under-bridge.mjs';
import { EVENTS, LOCATIONS } from './catalog.mjs';
import { inside, roadWidth, segmentDistance } from './geometry.mjs';
import { insideBase } from './boundary.mjs';
import { SCENERY_BOUNDS } from './district-zones.mjs';
import { SKATESTREET, SKATESTREET_BOUNDS } from './skatestreet.mjs';
import { PLAZA_BOUNDS } from './town-plaza.mjs';
import { BOARDWALK_BOUNDS } from './boardwalk.mjs';
import { HANGAR, hangarWorld } from './skate-hangar.mjs';
import { YARD_PAD } from './schoolyard.mjs';
import { MARSEILLE_PAD } from './marseille-site.mjs';
import { roadsideDetail, desertScatter } from './roadside-detail.mjs';
import { elevationAt } from './elevation.mjs';

const root = new URL('../assets/world/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root)));
const [x0, z0, x1, z1] = NY_BOUNDS;
const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const ring = [...corners, corners[0]];
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
const intersects = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
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
  const p = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, z]) => hangarWorld([x * (HANGAR.length / 2 + 3), 0, z * (HANGAR.width / 2 + 3)]));
  return [Math.min(...p.map(v => v[0])), Math.min(...p.map(v => v[2])), Math.max(...p.map(v => v[0])), Math.max(...p.map(v => v[2]))];
})();
const otherParks = [SKATESTREET_BOUNDS, PLAZA_BOUNDS, BOARDWALK_BOUNDS, hangarBounds, YARD_PAD.bounds, MARSEILLE_PAD.bounds];

test('Under the Bridge site is a flat, inside-base parcel clear of authored venues', () => {
  assert.deepEqual(NY.center, [452, 0, 1152]);
  assert.deepEqual(NY_BOUNDS, [420, 1130, 484, 1174]);
  const terrain = read('playable-terrain.json');
  for (let x = x0; x <= x1; x += 3) for (let z = z0; z <= z1; z += 3) assert.equal(elevationAt(terrain, x, z), 0, `flat datum at ${x},${z}`);
  for (const [x, z] of corners) assert.ok(insideBase(x, z), `site corner inside base: ${x},${z}`);
  for (const b of [...SCENERY_BOUNDS, ...otherParks]) assert.ok(!overlaps(NY_BOUNDS, b), `overlaps authored scenery ${b}`);
  for (const p of LOCATIONS.filter(p => p.skate !== 'ny')) assert.ok(Math.hypot(p.pos[0] - NY.center[0], p.pos[2] - NY.center[2]) > 100, `${p.id} too close`);
  assert.ok(Math.hypot(NY.center[0] - SKATESTREET.center[0], NY.center[2] - SKATESTREET.center[2]) > 94, '40 m NY radius clears 54 m Skatestreet radius');
});

test('Under the Bridge site clears every road, rail, building, course, and generated scatter item', () => {
  for (let tx = Math.floor(x0 / 256) - 1; tx <= Math.floor(x1 / 256) + 1; tx++) for (let tz = Math.floor(z0 / 256) - 1; tz <= Math.floor(z1 / 256) + 1; tz++) {
    const file = new URL(`tile-${tx}-${tz}.json`, root);
    const tile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { tile: [tx, tz], features: [] };
    for (const f of tile.features) {
      const g = f.geometry, p = f.properties;
      if (g.type === 'LineString' && (p.highway || p.aeroway || p.railway)) for (let i = 1; i < g.coordinates.length; i++) assert.ok(clearance(g.coordinates[i - 1], g.coordinates[i]) > roadWidth(p) / 2 + 2.5, `route ${f.id}`);
      if (g.type === 'Polygon' && (p.building || p.aeroway || p.amenity === 'parking')) {
        const r = g.coordinates[0];
        assert.ok(!r.some(p => inside(...p, ring)) && !ring.some(p => inside(...p, r)), `footprint ${f.id}`);
        for (let i = 1; i < r.length; i++) assert.ok(clearance(r[i - 1], r[i]) > 0, `footprint edge ${f.id}`);
      }
    }
    const bounds = [tx * 256, tz * 256, (tx + 1) * 256, (tz + 1) * 256];
    for (const p of [...roadsideDetail(tile, bounds), ...desertScatter(tile, bounds)]) assert.ok(!inside(p.x, p.z, ring), `runtime scatter through Under the Bridge at ${p.x},${p.z}`);
  }
  for (const e of EVENTS) if (Array.isArray(e.points)) for (let i = 1; i < e.points.length; i++) assert.ok(clearance(e.points[i - 1], e.points[i]) > (e.half ?? 6) + 3, `${e.id} crosses Under the Bridge`);
});

test('Under the Bridge has a unique skate location beside Skatestreet', () => {
  const park = LOCATIONS.find(p => p.skate === 'ny');
  assert.ok(park);
  assert.equal(park.id, 'ny');
  assert.deepEqual(park.pos, [NY.center[0] - 24, .04, NY.center[2] - 7]);
  assert.equal(new Set(LOCATIONS.map(p => p.id)).size, LOCATIONS.length);
});
