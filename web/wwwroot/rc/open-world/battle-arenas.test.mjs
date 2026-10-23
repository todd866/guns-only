import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import { createWorld } from '../physics/world.mjs';
import { BATTLE_ARENAS, BATTLE_EVENTS } from './battle-arenas.mjs';
import { buildBattleArenas } from './battle-arenas.js';

test('battle catalog keeps all four MK64 correspondences and closed arena loops', () => {
  assert.deepEqual(BATTLE_ARENAS.map(a => a.source), ['Big Donut', 'Block Fort', 'Double Deck', 'Skyscraper']);
  assert.equal(BATTLE_EVENTS.every(e => e.kind === 'arena' && e.battle), true);
  assert.equal(BATTLE_ARENAS.every(a => a.points[0][0] === a.points.at(-1)[0] && a.points[0][1] === a.points.at(-1)[1]), true);
  assert.equal(BATTLE_EVENTS.every(e => e.points.every(p => p.length === 3 && Number.isFinite(p[2]))), true);
});

test('arena ramps expose continuous route geometry at a safe actual gradient', () => {
  const scene = new T.Scene(), world = createWorld(4), arenas = buildBattleArenas(scene, world);
  assert.equal(scene.children.includes(arenas.root), true);
  const ramps = [];
  arenas.root.traverse(node => { if (node.name === 'ArenaRamp') ramps.push(node); });
  assert.equal(ramps.length, 6, 'Fuel Ring is flat; the other arenas expose six authored ramps');
  for (const ramp of ramps) {
    const r = ramp.userData.route;
    assert.ok(r && r.width > 0, 'ramp must publish its route width');
    const dx = r.to[0] - r.from[0], dz = r.to[2] - r.from[2], length = Math.hypot(dx, dz);
    const gradient = Math.abs(r.to[1] - r.from[1]) / length;
    assert.ok(gradient <= .3, `ramp gradient ${gradient.toFixed(3)} exceeds RC safe limit`);
    for (const t of [.08, .25, .5, .75, .92]) {
      const x = r.from[0] + dx * t, z = r.from[2] + dz * t, y = r.from[1] + (r.to[1] - r.from[1]) * t;
      const hit = world.raycast([x, y + 1.2, z], [0, -1, 0], 2.4);
      assert.ok(hit, `ramp has no collision at t=${t}`);
      assert.ok(Math.abs(hit.point[1] - y) <= .06, `ramp collision height drift ${hit.point[1]} vs ${y}`);
    }
    for (const endpoint of [r.from, r.to]) {
      const hit = world.raycast([endpoint[0], endpoint[1] + 1.2, endpoint[2]], [0, -1, 0], 2.4);
      assert.ok(hit, 'ramp endpoint must have a collision face');
      assert.ok(Math.abs(hit.point[1] - endpoint[1]) <= .06, `ramp endpoint mismatch ${hit.point[1]} vs ${endpoint[1]}`);
    }
  }
  arenas.dispose();
  assert.equal(scene.children.includes(arenas.root), false);
});

test('battle event spawn floors are explicit and map to declared arena levels', () => {
  for (const arena of BATTLE_ARENAS) {
    const event = BATTLE_EVENTS.find(e => e.id === arena.id);
    assert.ok(arena.levels.includes(arena.startY), `${arena.id} startY must be one of its authored deck levels`);
    assert.equal(event.points[0][2], arena.startY);
    assert.ok(event.clearingBounds[0] < arena.center[0] && event.clearingBounds[2] > arena.center[0]);
  }
});
