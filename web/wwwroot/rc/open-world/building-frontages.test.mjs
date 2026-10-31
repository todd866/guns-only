import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {buildingFrontage, FRONTAGES} from './building-frontages.mjs';
import {createTileRenderer} from './render.js';
import {roadWidth, segmentDistance} from './geometry.mjs';
test('window glazing is visible from outside either source-ring winding', () => {
  for (const reverse of [false, true]) {
    const ring = [
      [1400, 600],
      [1420, 600],
      [1420, 620],
      [1400, 620],
      [1400, 600]
    ];
    if (reverse) ring.reverse();
    const scene = new T.Scene(),
      renderer = createTileRenderer(scene);
    try {
      renderer.load('5,2', {
        tile: [5, 2],
        features: [
          {
            id: 'way/1',
            bbox: [1400, 600, 1420, 620],
            properties: {building: 'yes', height: 4},
            geometry: {type: 'Polygon', coordinates: [ring]}
          }
        ]
      });
      scene.updateMatrixWorld(true);
      // The old offset surface had its front face looking into the solid wall.
      // Cast toward the center of an actual window, using normal front-face culling.
      const ray = new T.Raycaster(new T.Vector3(1401.0, 1.7, 595), new T.Vector3(0, 0, 1));
      const hits = ray.intersectObjects(scene.children, true);
      assert.ok(hits.length);
      assert.equal(hits[0].object.material.color.getHexString(), '4d6d78');
      assert.ok(hits[0].point.z < 600);
    } finally {
      renderer.dispose();
    }
  }
});
test('four authored route anchors have unique tile ownership, bounded geometry and clear roads', () => {
  const seen = new Map();
  let triangles = 0;
  for (const path of fs
    .readdirSync(new URL('../assets/world/', import.meta.url))
    .filter(p => p.startsWith('tile-'))) {
    const tile = JSON.parse(fs.readFileSync(new URL('../assets/world/' + path, import.meta.url))),
      [x, z] = tile.tile,
      b = [x * 256, z * 256, (x + 1) * 256, (z + 1) * 256];
    for (const f of tile.features) {
      const parts = buildingFrontage(f, tile.features, b);
      if (!parts.length) continue;
      assert.ok(FRONTAGES[f.id]);
      assert.ok(!seen.has(f.id), 'one owner per source footprint');
      seen.set(f.id, parts.length);
      assert.ok(parts.length <= 45);
      assert.deepEqual(parts, buildingFrontage(f, tile.features, b));
      for (const p of parts) {
        triangles += p.faces.length * 2;
        for (const face of p.faces)
          for (const [px, py, pz] of face) {
            assert.ok([px, py, pz].every(Number.isFinite));
            assert.ok(py >= 0);
            for (const r of tile.features.filter(
              r => r.properties.highway && r.geometry.type === 'LineString'
            ))
              for (let j = 1; j < r.geometry.coordinates.length; j++)
                assert.ok(
                  segmentDistance(px, pz, r.geometry.coordinates[j - 1], r.geometry.coordinates[j]) >
                    roadWidth(r.properties) / 2 + 0.5,
                  `${f.id} clears ${r.id}`
                );
          }
      }
    }
  }
  assert.deepEqual([...seen.keys()].sort(), Object.keys(FRONTAGES).sort());
  assert.ok(triangles <= 1300);
});
