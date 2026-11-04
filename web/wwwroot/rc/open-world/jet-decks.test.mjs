import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../physics/world.mjs';
import {DECK, deckTris, rampQuad} from './jet-decks.mjs';

test('only upward faces above the ground become deck', () => {
  const up = [
      [0, 2, 0],
      [0, 2, 1],
      [1, 2, 0]
    ],
    down = [
      [0, 2, 0],
      [1, 2, 0],
      [0, 2, 1]
    ],
    low = [
      [0, 0.5, 0],
      [0, 0.5, 1],
      [1, 0.5, 0]
    ],
    wall = [
      [0, 2, 0],
      [0, 3, 0],
      [1, 2, 0]
    ];
  assert.deepEqual(deckTris([up, down, low, wall]), [up]);
});

test('a ramp climbs from the ground to the wing edge, solid from above, either direction', () => {
  for (const [along, dir] of [
    ['x', 1],
    ['x', -1],
    ['z', 1],
    ['z', -1]
  ]) {
    const world = createWorld(4),
      {quad, length} = rampQuad({along, dir, width: 3}, [10, 20], 4);
    world.addQuad(...quad, 'wood');
    assert.ok(Math.abs(length - 4 / DECK.slope) < 1e-9);
    const at = s => (along === 'x' ? [10 + s, 20] : [10, 20 + s]);
    const h = s => world.raycast([at(s)[0], 10, at(s)[1]], [0, -1, 0], 20)?.point[1];
    assert.ok(Math.abs(h(dir * (DECK.lip - 0.01)) - 4) < 0.02, `${along}${dir} top, just inside the edge`);
    assert.ok(h(-dir * (length - 0.05)) < 0.05, `${along}${dir} starts on the ground`);
    assert.ok(h((-dir * length) / 2) > 1.5 && h((-dir * length) / 2) < 2.5, `${along}${dir} middle`);
  }
});
