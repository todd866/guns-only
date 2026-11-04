import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../physics/world.mjs';
import {perimeterSkirts, SKIRT} from './park-skirt.mjs';

test('a floating slab gets outward walls on its outer edges only, deep enough to close any gap', () => {
  const park = createWorld(4);
  // A 10 x 10 slab at y .14 with a 2 x 2 sunken pit (an inner edge) in the middle.
  const q = (x0, x1, z0, z1, y) =>
    park.addQuad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], 'concrete');
  q(0, 10, 0, 4, 0.14);
  q(0, 10, 6, 10, 0.14);
  q(0, 4, 4, 6, 0.14);
  q(6, 10, 4, 6, 0.14);
  q(4, 6, 4, 6, -0.6);
  const quads = perimeterSkirts(park);
  const world = createWorld(4);
  for (const s of quads) world.addQuad(...s, 'concrete');
  // From outside, below the slab edge, driving in: a wall. From the pit floor: nothing.
  for (const [o, d] of [
    [
      [-1, 0, 5],
      [1, 0, 0]
    ],
    [
      [11, 0, 5],
      [-1, 0, 0]
    ],
    [
      [5, 0, -1],
      [0, 0, 1]
    ],
    [
      [5, 0, 11],
      [0, 0, -1]
    ]
  ])
    assert.ok(world.raycast(o, d, 2), `wall facing ${d}`);
  assert.equal(world.raycast([5, -0.5, 5], [1, 0, 0], 2), null, 'no wall inside the pit');
  for (const s of quads) assert.ok(Math.min(...s.map(p => p[1])) <= 0.14 - SKIRT.depth + 1e-6);
});
