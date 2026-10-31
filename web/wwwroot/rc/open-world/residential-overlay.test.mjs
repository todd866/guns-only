import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import {createTileRenderer} from './render.js';

test('legacy crossing road and parking surfaces are clipped out of graded neighbourhood', () => {
  const scene = new T.Scene(),
    renderer = createTileRenderer(scene, null, {bounds: [40, 40, 80, 80]});
  try {
    renderer.load('0,0', {
      tile: [0, 0],
      features: [
        {
          id: 'road1',
          properties: {highway: 'residential'},
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 60],
              [120, 60]
            ]
          }
        },
        {
          id: 'park1',
          properties: {amenity: 'parking'},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [30, 30],
                [90, 30],
                [90, 90],
                [30, 90],
                [30, 30]
              ]
            ]
          }
        }
      ]
    });
    let checked = 0;
    scene.traverse(mesh => {
      const p = mesh.geometry?.attributes.position;
      if (!p) return;
      for (let i = 0; i < p.count; i += 3) {
        const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3,
          z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
        assert.ok(!(x > 40 && x < 80 && z > 40 && z < 80), 'no flat slab covers the replacement terrain');
        checked++;
      }
    });
    assert.ok(checked > 0, 'outside road and parking remain');
  } finally {
    renderer.dispose();
  }
});
