import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {createStream} from './stream.mjs';
import {createTileRenderer} from './render.js';
import {roadsideDetail, desertScatter} from './roadside-detail.mjs';
import {elevationAt, groundTriangles} from './elevation.mjs';
import {
  MARSEILLE,
  MARSEILLE_HOLE,
  MARSEILLE_PAD,
  MARSEILLE_TERRAIN,
  marseilleWorld,
  marseilleLocal
} from './marseille-site.mjs';
import {EVENTS, LOCATIONS} from './catalog.mjs';
import {SCENERY_BOUNDS} from './district-zones.mjs';
import {insideBase} from './boundary.mjs';
import {inside, segmentDistance, roadWidth} from './geometry.mjs';
import {SKATESTREET_BOUNDS} from './skatestreet.mjs';

const [cx, cz] = MARSEILLE.center;
const data = {
  origin: [cx - 100, cz - 100],
  step: 10,
  width: 41,
  height: 41,
  values: Array.from({length: 41 * 41}, (_, i) => (i % 41) * 0.1 + Math.floor(i / 41) * 0.05)
};
const tileOf = (x, z) => [Math.floor(x / 256), Math.floor(z / 256)];
const b = MARSEILLE_PAD.bounds,
  corners = [
    [b[0], b[1]],
    [b[2], b[1]],
    [b[2], b[3]],
    [b[0], b[3]]
  ],
  ring = [...corners, corners[0]];
const intersects = (a, b, c, d) => {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
};
const clearance = (a, b) => {
  a = a.slice(0, 2);
  b = b.slice(0, 2);
  if (inside(...a, ring) || inside(...b, ring)) return 0;
  let distance = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const c = ring[i - 1],
      d = ring[i];
    if (intersects(a, b, c, d)) return 0;
    distance = Math.min(
      distance,
      segmentDistance(...a, c, d),
      segmentDistance(...b, c, d),
      segmentDistance(...c, a, b),
      segmentDistance(...d, a, b)
    );
  }
  return distance;
};

test('Marseille site publishes a reversible local frame and exact cut bounds', () => {
  assert.deepEqual(MARSEILLE.center, [2200, 2464]);
  assert.deepEqual(MARSEILLE.bounds, [-40, -24, 32, 32]);
  assert.deepEqual(MARSEILLE_HOLE, [cx - 40, cz - 24, cx + 32, cz + 32]);
  assert.deepEqual(MARSEILLE_PAD.bounds, [cx - 48, cz - 32, cx + 40, cz + 40]);
  const p = marseilleWorld([-40, 0, -24]);
  assert.deepEqual(marseilleLocal(p), [-40, 0, -24]);
});

test('pad grading is shared by sampled heights and generated ground triangles', () => {
  assert.equal(elevationAt(data, cx, cz, MARSEILLE_TERRAIN), 0);
  const tri = groundTriangles(data, [cx - 8, cz - 8, cx + 8, cz + 8], 8, MARSEILLE_TERRAIN);
  assert.ok(tri.length > 0);
  assert.ok(
    tri.every(t => t.every(p => p[1] === 0)),
    'the deck is level at the authored datum'
  );
  for (const [x, z] of [
    [cx - 90, cz],
    [cx, cz - 90],
    [cx + 90, cz + 90]
  ])
    assert.equal(
      elevationAt(data, x, z, MARSEILLE_TERRAIN),
      elevationAt(data, x, z),
      'outside the feather is unchanged'
    );
});

test('stream clips Marseille hole from sourced collision and keeps its datum perimeter', async () => {
  const stream = createStream({
    manifest: {tiles: [tileOf(cx, cz)]},
    elevation: data,
    terrainSite: MARSEILLE_TERRAIN,
    fetchTile: async key => ({tile: key.split(',').map(Number), features: []})
  });
  await stream.update([cx, 0, cz]);
  assert.equal(
    stream.world.raycast([cx, 5, cz], [0, -1, 0], 8),
    null,
    'no base terrain is left in the bowl cut'
  );
  const edge = stream.world.raycast([MARSEILLE_HOLE[0] - 1, 5, cz], [0, -1, 0], 8);
  assert.ok(edge, 'the surrounding ground remains solid');
  assert.ok(Math.abs(edge.point[1]) < 0.05, 'the perimeter is at the Marseille datum');
  stream.dispose();
});

test('flat fallback also respects the authored hole', async () => {
  const stream = createStream({
    manifest: {tiles: []},
    terrainSite: MARSEILLE_TERRAIN,
    fetchTile: async () => ({tile: tileOf(cx, cz), features: []})
  });
  await stream.update([cx, 0, cz]);
  assert.equal(stream.world.raycast([cx, 2, cz], [0, -1, 0], 4), null);
  assert.equal(stream.world.raycast([MARSEILLE_HOLE[0] - 1, 2, cz], [0, -1, 0], 4).point[1], 0);
  stream.dispose();
});

test('real playable terrain stays solid on all four hole seams', async () => {
  const root = new URL('../assets/world/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root)));
  const elevation = JSON.parse(fs.readFileSync(new URL('playable-terrain.json', root)));
  const stream = createStream({
    manifest,
    elevation,
    terrainSite: MARSEILLE_TERRAIN,
    fetchTile: async key => {
      const file = new URL(`tile-${key.replace(',', '-')}.json`, root);
      return fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file))
        : {tile: key.split(',').map(Number), features: []};
    }
  });
  await stream.update([cx, 0, cz]);
  for (const [x, z] of [
    [MARSEILLE_HOLE[0] - 1, cz],
    [MARSEILLE_HOLE[2] + 1, cz],
    [cx, MARSEILLE_HOLE[1] - 1],
    [cx, MARSEILLE_HOLE[3] + 1]
  ]) {
    const hit = stream.world.raycast([x, 4, z], [0, -1, 0], 10);
    assert.ok(hit, `terrain seam at ${x},${z}`);
    assert.ok(Math.abs(hit.point[1]) < 1e-3, `graded seam at ${x},${z}`);
  }
  assert.equal(stream.world.raycast([cx, 4, cz], [0, -1, 0], 10), null);
  stream.dispose();
});

test('real rendered tile has no base triangles inside the bowl hole', () => {
  const root = new URL('../assets/world/', import.meta.url);
  const elevation = JSON.parse(fs.readFileSync(new URL('playable-terrain.json', root)));
  const scene = new T.Scene(),
    renderer = createTileRenderer(scene, elevation, null, MARSEILLE_TERRAIN);
  const keys = new Set(
    [tileOf(MARSEILLE_HOLE[0], MARSEILLE_HOLE[1]), tileOf(MARSEILLE_HOLE[0], MARSEILLE_HOLE[3])].map(
      ([x, z]) => `${x},${z}`
    )
  );
  for (const key of keys) {
    const file = new URL(`tile-${key.replace(',', '-')}.json`, root);
    const tile = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : {tile: key.split(',').map(Number), features: []};
    renderer.load(key, tile);
  }
  let triangles = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 9) {
      triangles++;
      const a = [positions[i], positions[i + 2]],
        b = [positions[i + 3], positions[i + 5]],
        c = [positions[i + 6], positions[i + 8]];
      for (let u = 0; u <= 4; u++)
        for (let v = 0; v <= 4 - u; v++) {
          const w = 1 - u / 4 - v / 4,
            x = a[0] * w + (b[0] * u) / 4 + (c[0] * v) / 4,
            z = a[1] * w + (b[1] * u) / 4 + (c[1] * v) / 4;
          assert.ok(
            !(
              x > MARSEILLE_HOLE[0] &&
              x < MARSEILLE_HOLE[2] &&
              z > MARSEILLE_HOLE[1] &&
              z < MARSEILLE_HOLE[3]
            ),
            `rendered triangle sample in hole: ${x},${z}`
          );
        }
    }
  });
  assert.ok(triangles > 0);
  renderer.dispose();
});

test('real roads, footprints and scatter leave the entire graded pad empty', () => {
  const root = new URL('../assets/world/', import.meta.url);
  for (let tx = Math.floor(b[0] / 256) - 1; tx <= Math.floor(b[2] / 256) + 1; tx++)
    for (let tz = Math.floor(b[1] / 256) - 1; tz <= Math.floor(b[3] / 256) + 1; tz++) {
      const file = new URL(`tile-${tx}-${tz}.json`, root),
        tile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {tile: [tx, tz], features: []};
      for (const f of tile.features) {
        const g = f.geometry,
          p = f.properties;
        if (g.type === 'LineString' && (p.highway || p.aeroway || p.railway))
          for (let i = 1; i < g.coordinates.length; i++)
            assert.ok(
              clearance(g.coordinates[i - 1], g.coordinates[i]) > roadWidth(p) / 2 + 2.5,
              `road ${f.id}`
            );
        if (g.type === 'Polygon' && (p.building || p.aeroway || p.amenity === 'parking')) {
          const r = g.coordinates[0];
          assert.ok(
            !corners.some(p => inside(...p, r)) && !r.some(p => inside(...p, ring)),
            `footprint ${f.id}`
          );
          for (let i = 1; i < r.length; i++)
            assert.ok(clearance(r[i - 1], r[i]) > 0, `footprint edge ${f.id}`);
        }
      }
      const bounds = [tx * 256, tz * 256, (tx + 1) * 256, (tz + 1) * 256];
      for (const p of [
        ...roadsideDetail(tile, bounds, null, b),
        ...desertScatter(tile, bounds, null, 460, b)
      ])
        assert.ok(!inside(p.x, p.z, ring), 'no plants or stones through the concrete');
    }
});

test('site is clear of authored venues, races, scenery, and the base boundary', () => {
  assert.ok(Math.hypot(cx - 1950, cz - 2180) > 150, 'Rail Depot clearance');
  for (const e of EVENTS)
    for (let i = 1; i < e.points.length; i++)
      assert.ok(clearance(e.points[i - 1], e.points[i]) > (e.half ?? 6) + 3, `${e.id} crosses Marseille pad`);
  for (const p of LOCATIONS.filter(p => p.skate !== 'marseille'))
    assert.ok(Math.hypot(p.pos[0] - cx, p.pos[2] - cz) > 100, `${p.id} too close`);
  for (const b of [...SCENERY_BOUNDS, SKATESTREET_BOUNDS])
    assert.ok(
      !(
        MARSEILLE_PAD.bounds[0] <= b[2] &&
        MARSEILLE_PAD.bounds[2] >= b[0] &&
        MARSEILLE_PAD.bounds[1] <= b[3] &&
        MARSEILLE_PAD.bounds[3] >= b[1]
      ),
      'overlaps authored scenery'
    );
  for (const x of [b[0] - MARSEILLE_PAD.feather, b[2] + MARSEILLE_PAD.feather])
    for (const z of [b[1] - MARSEILLE_PAD.feather, b[3] + MARSEILLE_PAD.feather])
      assert.ok(insideBase(x, z), `graded corner outside base: ${x},${z}`);
});

test('the site parameter leaves distant terrain, street meshes, lights and planting unchanged', async () => {
  const root = new URL('../assets/world/', import.meta.url),
    read = name => JSON.parse(fs.readFileSync(new URL(name, root)));
  const elevation = read('playable-terrain.json'),
    tile = read('tile--3--1.json'),
    bounds = [-768, -256, -512, 0];
  const plain = createStream({manifest: {tiles: []}, elevation, fetchTile: () => {}}),
    site = createStream({
      manifest: {tiles: []},
      elevation,
      terrainSite: MARSEILLE_TERRAIN,
      fetchTile: () => {}
    });
  const scenes = [new T.Scene(), new T.Scene()],
    renders = [
      createTileRenderer(scenes[0], elevation),
      createTileRenderer(scenes[1], elevation, null, MARSEILLE_TERRAIN)
    ];
  try {
    await plain.update([-640, 0, -128]);
    await site.update([-640, 0, -128]);
    for (let x = bounds[0]; x < bounds[2]; x += 16)
      for (let z = bounds[1]; z < bounds[3]; z += 16)
        assert.deepEqual(
          site.world.raycast([x, 30, z], [0, -1, 0], 60),
          plain.world.raycast([x, 30, z], [0, -1, 0], 60)
        );
    renders.forEach(r => r.load('-3,-1', tile));
    const geometry = s => {
      const a = [];
      s.traverse(o => {
        if (o.isMesh) a.push([...o.geometry.attributes.position.array]);
      });
      return a;
    };
    assert.deepEqual(geometry(scenes[1]), geometry(scenes[0]));
    assert.deepEqual(renders[1].fixtures(), renders[0].fixtures());
    assert.deepEqual(roadsideDetail(tile, bounds, null, b), roadsideDetail(tile, bounds));
    assert.deepEqual(desertScatter(tile, bounds, null, 460, b), desertScatter(tile, bounds));
  } finally {
    plain.dispose();
    site.dispose();
    renders.forEach(r => r.dispose());
  }
});
