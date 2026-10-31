import test from 'node:test';
import assert from 'node:assert/strict';
import {drawDetailedMinimap} from './minimap.js';

function context() {
  const calls = [];
  const c = {
    calls,
    canvas: {width: 360, height: 320},
    save() {
      calls.push('save');
    },
    restore() {
      calls.push('restore');
    },
    scale(...v) {
      calls.push(['scale', ...v]);
    },
    fillRect(...v) {
      calls.push(['fillRect', ...v]);
    },
    beginPath() {
      calls.push('begin');
    },
    moveTo(...v) {
      calls.push(['move', ...v]);
    },
    lineTo(...v) {
      calls.push(['line', ...v]);
    },
    closePath() {
      calls.push('close');
    },
    fill() {
      calls.push('fill');
    },
    stroke() {
      calls.push('stroke');
    },
    arc(...v) {
      calls.push(['arc', ...v]);
    },
    translate(...v) {
      calls.push(['translate', ...v]);
    },
    rotate(v) {
      calls.push(['rotate', v]);
    },
    setLineDash(v) {
      calls.push(['dash', ...v]);
    }
  };
  return c;
}

test('detailed minimap uses logical 180x160 space and renders course plus racers', () => {
  const ctx = context();
  const course = {
    id: 'test',
    half: 4,
    checkpoints: [
      [0, 0],
      [40, 0],
      [40, 30]
    ],
    ai: [{pos: [0, 0, 0]}, {pos: [40, 0, 30]}]
  };
  const feature = {
    properties: {building: 'yes'},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [5, 5],
          [10, 5],
          [10, 10],
          [5, 5]
        ]
      ]
    }
  };
  const world = {loaded: new Map([['0,0', {features: [feature]}]])};
  const race = {rivals: [{session: {car: {pos: [12, 0, 8]}}}]};
  assert.equal(
    drawDetailedMinimap(ctx, {world, course, race, player: {car: {pos: [4, 0, 4]}}, yaw: 0.5}),
    true
  );
  assert.deepEqual(
    ctx.calls.find(x => Array.isArray(x) && x[0] === 'scale'),
    ['scale', 2, 2]
  );
  assert.ok(ctx.calls.filter(x => x === 'stroke').length >= 2, 'route and centerline are drawn');
  assert.ok(
    ctx.calls.filter(x => Array.isArray(x) && x[0] === 'arc').length >= 2,
    'player and rival markers are drawn'
  );
});

test('roam mode returns true with no course data', () => {
  const ctx = context();
  assert.equal(
    drawDetailedMinimap(ctx, {
      world: {loaded: new Map()},
      race: {roam: true},
      player: {car: {pos: [12, 0, -4]}}
    }),
    true
  );
});
