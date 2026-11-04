import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {
  CANYON,
  CENTRELINE,
  CANYON_LENGTH,
  RIVER,
  canyonPoint,
  centreNear,
  canyonProfile,
  canyonDepth,
  canyonHeight,
  canyonSurface,
  canyonStrata,
  inCanyon
} from './canyon.mjs';
import {elevationAt, terrainStep, groundTriangles} from './elevation.mjs';
import {MOUNTAIN_BOUNDS} from './spirit-mountain.mjs';
import {darkPlaceById, timeGateStep, pastHolds} from './dark-world.mjs';
import {NATURAL_WATER, bodyAt} from '../physics/water.mjs';
import {createCanyonView, canyonFarGround} from './canyon.js';
import {createStream} from './stream.mjs';
import {createTileRenderer, sandTone} from './render.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../assets/world/${name}`, import.meta.url)));
const elevation = read('playable-terrain.json'),
  ground = (x, z) => elevationAt(elevation, x, z);
const box = [-3700, -4550, -1600, -2600];

test('the entire carve and rim fit inside the approved box, without clipping any centreline envelope', () => {
  assert.deepEqual(CANYON.bounds, box);
  // Every segment is a convex combination of these samples. Its complete 240 m envelope
  // therefore fits too: this proves containment between samples, not just on a raster scan.
  for (const p of CENTRELINE) {
    assert.ok(p.x - CANYON.rim >= box[0] && p.x + CANYON.rim <= box[2]);
    assert.ok(p.z - CANYON.rim >= box[1] && p.z + CANYON.rim <= box[3]);
  }
  let carved = 0;
  for (let x = box[0] - 32; x <= box[2] + 32; x += 16) {
    for (let z = box[1] - 32; z <= box[3] + 32; z += 16) {
      const depth = canyonDepth(x, z);
      assert.ok(Number.isFinite(depth) && depth >= 0 && depth <= 160);
      if (depth > 0) {
        assert.ok(inCanyon(x, z));
        carved++;
      }
    }
  }
  assert.ok(carved > 3000);
  for (let i = 0; i <= 200; i++) {
    const x = box[0] + ((box[2] - box[0]) * i) / 200,
      z = box[1] + ((box[3] - box[1]) * i) / 200;
    for (const p of [
      [x, box[1]],
      [x, box[3]],
      [box[0], z],
      [box[2], z]
    ]) {
      assert.equal(canyonDepth(...p), 0, `flush box edge ${p}`);
    }
  }
});

test('a roughly 3 km meander, sampled every 8 m, cuts 160 m down away from its open mouths', () => {
  assert.ok(CANYON_LENGTH > 2800 && CANYON_LENGTH < 3200, `length ${CANYON_LENGTH}`);
  for (let i = 1; i < CENTRELINE.length; i++) {
    const p = CENTRELINE[i],
      prev = CENTRELINE[i - 1];
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) <= 8.001);
    if (p.along >= CANYON.endFade && p.along <= CANYON_LENGTH - CANYON.endFade) {
      assert.ok(canyonDepth(p.x, p.z) >= 150);
      assert.equal(canyonHeight(p.x, p.z), -160);
    }
  }
  for (const end of [0, CANYON_LENGTH]) {
    const p = canyonPoint(end);
    assert.equal(canyonDepth(p.x, p.z), 0);
  }
  for (const along of [75, CANYON_LENGTH - 75]) {
    const p = canyonPoint(along);
    assert.ok(Math.abs(canyonDepth(p.x, p.z) - 80) < 0.001);
  }
});

test('the spatial hash agrees with an independent nearest-segment search', () => {
  for (let x = box[0] - 50; x <= box[2] + 50; x += 137) {
    for (let z = box[1] - 50; z <= box[3] + 50; z += 173) {
      let best = Infinity;
      for (let i = 1; i < CENTRELINE.length; i++) {
        const a = CENTRELINE[i - 1],
          b = CENTRELINE[i],
          dx = b.x - a.x,
          dz = b.z - a.z,
          t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
      }
      assert.ok(Math.abs(centreNear(x, z).d - best) < 1e-8);
    }
  }
  for (const side of [-18, 18]) {
    const p = canyonPoint(1404, side),
      n = centreNear(p.x, p.z);
    assert.ok(Math.abs(n.side - side) < 1e-7);
    assert.ok(Math.abs(n.along - 1404) < 1e-7);
  }
});

test('the rim is flush at distance 245 m and beyond', () => {
  let checked = 0;
  for (let along = 0; along <= CANYON_LENGTH; along += 31) {
    for (const d of [245, 260, 300, 400])
      for (const side of [-1, 1]) {
        const p = canyonPoint(along, side * d),
          near = centreNear(p.x, p.z);
        // An inside bend can be nearer another segment: d means nearest-centreline distance.
        if (near.d >= 245 - 1e-7) {
          assert.equal(canyonDepth(p.x, p.z), 0);
          checked++;
        }
      }
  }
  assert.ok(checked > 300);
});

test('profiles descend monotonically inward, with broad 115 m and 60 m benches', () => {
  for (const along of [75, 200, 450, 900, 1400, 1900, 2400, 2750, CANYON_LENGTH - 75]) {
    let prev = Infinity;
    for (let d = 0; d <= 260; d += 0.25) {
      const depth = canyonProfile(d, along);
      assert.ok(depth <= prev + 1e-10, `profile at ${along}, ${d}`);
      prev = depth;
    }
  }
  for (const along of [200, 450, 900, 1400, 1900, 2400, 2750]) {
    for (let d = 50; d <= 100; d++) assert.equal(canyonProfile(d, along), 115);
    for (let d = 160; d <= 185; d++) assert.equal(canyonProfile(d, along), 60);
  }
  // Also query actual terrain across a straight reach, not only the profile helper.
  for (const side of [-1, 1])
    for (let d = 50; d <= 100; d++) {
      const p = canyonPoint(1404, side * d);
      assert.equal(canyonDepth(p.x, p.z), 115);
    }
});

test('the carve misses every overview road vertex and the segments between them', () => {
  for (const road of read('overview.json').roads) {
    for (const p of road.points) assert.equal(canyonDepth(...p), 0, `road vertex ${p}`);
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4);
      for (let j = 1; j < count; j++)
        assert.equal(canyonDepth(a[0] + ((b[0] - a[0]) * j) / count, a[1] + ((b[1] - a[1]) * j) / count), 0);
    }
  }
});

test('the canyon footprint never touches Spirit Mountain', () => {
  assert.ok(
    box[2] < MOUNTAIN_BOUNDS[0] ||
      box[0] > MOUNTAIN_BOUNDS[2] ||
      box[3] < MOUNTAIN_BOUNDS[1] ||
      box[1] > MOUNTAIN_BOUNDS[3]
  );
});

test('cliffs are rock, benches and floor are sand, and horizontal strata stay within 0.7–1.1', () => {
  for (const [d, surface] of [
    [0, 'sand'],
    [70, 'sand'],
    [175, 'sand'],
    [26, 'rock'],
    [224, 'rock']
  ]) {
    const p = canyonPoint(1404, d);
    assert.equal(canyonSurface(p.x, p.z), surface, `at distance ${d}`);
  }
  for (let y = -200; y < 100; y += 0.25)
    assert.ok(canyonStrata(y) >= 0.7 - 1e-12 && canyonStrata(y) <= 1.1 + 1e-12);
  assert.ok(Math.abs(canyonStrata(-7) - canyonStrata(-21)) > 0.3);
});

test('4 m ground triangles and streamed collision carry the same canyon into the playable terrain', async () => {
  assert.equal(terrainStep(box), 4);
  assert.equal(terrainStep([box[2], box[3], box[2] + 256, box[3] + 256]), 4);
  assert.equal(terrainStep([0, 0, 256, 256]), 16);
  const p = canyonPoint(1404),
    x = Math.round(p.x / 4) * 4,
    z = Math.round(p.z / 4) * 4;
  const baseline = {...elevation, values: elevation.values.map(() => 0)};
  assert.equal(elevationAt(baseline, x, z), canyonHeight(x, z));
  for (const tri of groundTriangles(elevation, [x, z, x + 8, z + 8], 4))
    for (const q of tri) assert.equal(q[1], ground(q[0], q[2]));
  const stream = createStream({manifest: {tiles: []}, fetchTile: () => {}, elevation});
  try {
    await stream.update([x, ground(x, z), z]);
    const hit = stream.world.raycast([x, ground(x, z) + 5, z], [0, -1, 0], 10);
    assert.ok(hit && Math.abs(hit.point[1] - ground(x, z)) < 1e-7);
    assert.equal(hit.surface, 'sand');
  } finally {
    stream.dispose();
  }
});

test('the canyon destination is on a dry rim, looks along it, and stays in the past', () => {
  const p = darkPlaceById('past-canyon');
  assert.equal(p.name, 'The great canyon, long ago');
  assert.equal(p.short, 'Canyon');
  assert.ok(inCanyon(...p.at) && pastHolds(...p.at));
  assert.equal(canyonDepth(...p.at), 0);
  const near = centreNear(...p.at);
  assert.ok(near.d >= 240 && near.d < 260);
  const ahead = [p.at[0] + Math.sin(p.yaw) * 20, p.at[1] - Math.cos(p.yaw) * 20];
  assert.ok(centreNear(...ahead).along > near.along);
  assert.equal(timeGateStep({era: 'past'}, [p.at[0], ground(...p.at), p.at[1]]).trip, null);
  for (const q of CENTRELINE) assert.ok(pastHolds(q.x, q.z));
});

test('the sloping river is visual only, and its ribbon follows local floor + 1.2 m', () => {
  assert.ok(!NATURAL_WATER.includes(RIVER));
  const p = canyonPoint(1404);
  assert.ok(RIVER.contains(p.x, p.z));
  assert.equal(bodyAt(p.x, p.z), null);
  const scene = new T.Scene(),
    view = createCanyonView(scene, ground),
    root = scene.getObjectByName('GreatCanyon');
  let disposed = 0;
  try {
    const mesh = scene.getObjectByName('CanyonRiver'),
      positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i);
      assert.ok(centreNear(x, z).d < 18.001, 'both banks stay inside the flat 22 m half-width gorge');
      assert.ok(
        Math.abs(positions.getY(i) - ground(x, z) - 1.2) < 0.01,
        'neither bank floats or buries itself'
      );
    }
    for (let i = 0; i < positions.count; i += 2) {
      const x = (positions.getX(i) + positions.getX(i + 1)) / 2,
        z = (positions.getZ(i) + positions.getZ(i + 1)) / 2;
      assert.ok(Math.abs(positions.getY(i) - ground(x, z) - 1.2) < 0.01);
      assert.ok(inCanyon(x, z));
    }
    assert.ok(root.children.length <= 110, 'bounded distant tile count');
    assert.ok(root.children.reduce((sum, o) => sum + o.geometry.attributes.position.count, 0) < 32000);
    // Every coarse triangle containing a depressed vertex lies within bounds +/- 128 m.
    // Inspect the actual covering geometry at all 16 m nodes outside the carve; no moat can show.
    let covered = 0;
    for (let x = box[0] - 128; x <= box[2] + 128; x += 16) {
      for (let z = box[1] - 128; z <= box[3] + 128; z += 16) {
        const ix = Math.floor(x / 256),
          iz = Math.floor(z / 256),
          far = root.getObjectByName(`CanyonFar_${ix},${iz}`);
        assert.ok(far?.visible, `underlay covered at ${x},${z}`);
        if (inCanyon(x, z)) continue;
        const p = far.geometry.attributes.position,
          col = Math.round((x - ix * 256) / 16),
          row = Math.round((z - iz * 256) / 16),
          index = row * 17 + col;
        assert.ok(Math.abs(p.getY(index) - ground(p.getX(index), p.getZ(index)) + 1.5) < 0.001);
        covered++;
      }
    }
    assert.ok(covered > 4000);
    const tile = root.children.find(o => o.name.startsWith('CanyonFar_')),
      key = tile.name.slice('CanyonFar_'.length);
    view.tileLoaded(key, true);
    assert.equal(tile.visible, false);
    view.tileLoaded(key, false);
    assert.equal(tile.visible, true);
    view.update(0.2);
    view.update(1);
    root.traverse(o => o.geometry?.addEventListener('dispose', () => disposed++));
    mesh.material.addEventListener('dispose', () => disposed++);
    tile.material.addEventListener('dispose', () => disposed++);
  } finally {
    view.dispose();
  }
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, root.children.length + 2);
});

test('rendered near triangles have horizontal strata on cliffs and lighter sand on benches', () => {
  const scene = new T.Scene(),
    renderer = createTileRenderer(scene, elevation);
  try {
    renderer.load('-11,-14', {tile: [-11, -14], features: []});
    // Cliffs are drawn in the rock material and benches in the sand one: separate meshes.
    let cliffs = 0,
      benches = 0,
      low = Infinity,
      high = -Infinity;
    for (const mesh of scene.getObjectByName('WorldTile_-11,-14').children) {
      if (!mesh.geometry?.attributes.color) continue;
      const p = mesh.geometry.attributes.position,
        color = mesh.geometry.attributes.color;
      for (let i = 0; i < p.count; i += 3) {
        const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 + 0.025,
          spread =
            Math.max(p.getY(i), p.getY(i + 1), p.getY(i + 2)) -
            Math.min(p.getY(i), p.getY(i + 1), p.getY(i + 2));
        if (spread > 8) {
          assert.ok(Math.abs(color.getX(i) - canyonStrata(y)) < 1e-5, 'height determines the rock band');
          low = Math.min(low, color.getX(i));
          high = Math.max(high, color.getX(i));
          cliffs++;
        } else if (Math.abs(y + 115) < 0.001 && spread < 0.001) {
          assert.ok(Math.abs(color.getX(i) / sandTone(p.getX(i), p.getZ(i))[0] - 1.08) < 1e-5);
          benches++;
        }
      }
    }
    assert.ok(cliffs > 100 && benches > 100);
    assert.ok(high - low > 0.3, 'contrasting horizontal strata reach the actual vertex colors');
  } finally {
    renderer.dispose();
  }
  assert.equal(scene.children.length, 0);
});

test('the 64 m far underlay cannot bridge over the detailed canyon floor', () => {
  // Reconstruct the existing far mesh's actual diagonal interpolation at each river sample.
  for (const p of CENTRELINE) {
    const x = -3800 + Math.floor((p.x + 3800) / 64) * 64,
      z = -4600 + Math.floor((p.z + 4600) / 64) * 64,
      a = (p.x - x) / 64,
      b = (p.z - z) / 64,
      h = (dx, dz) => canyonFarGround(ground, x + dx, z + dz) - 3,
      y =
        a + b <= 1
          ? h(0, 0) + a * (h(64, 0) - h(0, 0)) + b * (h(0, 64) - h(0, 0))
          : h(64, 64) + (1 - a) * (h(0, 64) - h(64, 64)) + (1 - b) * (h(64, 0) - h(64, 64));
    assert.ok(y < ground(p.x, p.z) - 2);
  }
});
