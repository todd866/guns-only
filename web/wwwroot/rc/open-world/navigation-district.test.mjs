import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoadGraph, roadRoute} from './navigation.mjs';

test('road graph excludes segments crossing padded authored district shells', () => {
  const roads = [
    {
      kind: 'residential',
      points: [
        [-80, 0],
        [80, 0]
      ]
    },
    {
      kind: 'residential',
      points: [
        [-80, 100],
        [80, 100]
      ]
    }
  ];
  const g = buildRoadGraph(roads, [[-52.3, -33.3, 52.3, 43.3]]);
  assert.equal(g.length, 2);
  const route = roadRoute(g, [-80, 0], [80, 0]);
  assert.ok(route.every(([x, z]) => !(x >= -56.3 && x <= 56.3 && z >= -37.3 && z <= 47.3)));
});

test('clear road remains connected around district shell', () => {
  const roads = [
    {
      kind: 'residential',
      points: [
        [-80, 100],
        [80, 100],
        [80, 60],
        [-80, 60]
      ]
    }
  ];
  const g = buildRoadGraph(roads, [[-52.3, -33.3, 52.3, 43.3]]);
  const route = roadRoute(g, [-80, 100], [80, 100]);
  assert.ok(route.length > 2);
  assert.ok(route.every(([x, z]) => !(x >= -56.3 && x <= 56.3 && z >= -37.3 && z <= 47.3)));
});
