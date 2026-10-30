import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../physics/world.mjs';
import { createRobot, stepRobot } from '../physics/robot.mjs';
import { checkDungeon, openChest, pressPlate, tryDoor, reachable } from '../physics/dungeon.mjs';
import { buildMine, doorTris, MINE_DUNGEON, CHESTS, PLATES, createMineState, mineWorldTris, MINE } from './mine.mjs';

test('the mine is a fair Ocarina-style dungeon: one small-key door at a time, and the boss is reachable', () => {
  const r = checkDungeon(MINE_DUNGEON);
  assert.ok(r.ok, r.problems.join('; '));
  assert.deepEqual([...r.d.log.map(l => l.got)], ['small', 'big']);
});

// The level geometry with the doors that are shut right now (a world per door state).
function level(open) { const w = createWorld(); for (const t of [...buildMine(), ...doorTris(open)]) w.addTri(t.a, t.b, t.c, t.surface); return w; }
// Walk the robot through waypoints with a simple heading follower; climbs and crawls happen by themselves.
function walk(world, r, points, seconds = 30) {
  let i = 0;
  for (let n = 0; n < seconds * 120 && i < points.length; n++) {
    const [x, z] = points[i], dx = x - r.pos[0], dz = z - r.pos[2];
    if (Math.hypot(dx, dz) < .25) { i++; continue; }
    const want = Math.atan2(dx, -dz), err = Math.atan2(Math.sin(want - r.yaw), Math.cos(want - r.yaw));
    stepRobot(r, { throttle: Math.abs(err) < .6 ? 1 : 0, steer: Math.max(-1, Math.min(1, err * 3)) }, world, 1 / 120);
  }
  return i === points.length;
}

test('the robot plays the mine on foot: crawls in, climbs for the key, opens the doors, reaches the boss', () => {
  const d = createMineState();
  let w = level(d.open), crouched = false;
  const r = createRobot([0, 0, 5.5], 0);
  // Crawl under the fallen timber into the hub, then to the east stage and climb it for the key.
  assert.ok(walk(w, r, [[0, 4], [0, 2], [0, -1]]), `into the hub ${r.pos}`);
  assert.ok(walk(w, r, [[3, -4], [5.2, -4], [7.2, -4]]), `up the east stage ${r.pos}`);
  assert.ok(r.pos[1] > .3, `on the stage ${r.pos}`);
  assert.equal(openChest(d, 'K1'), 'small');
  assert.ok(tryDoor(d, 'A').ok); w = level(d.open);
  // Through door A to the plate, which opens the west door.
  assert.ok(walk(w, r, [[5.3, -4], [2, -4], [0, -6], [0, -9], [0, -12]]), `to the plate ${r.pos}`);
  assert.ok(pressPlate(d, 'P1')); w = level(d.open);
  // West stope: two climbs to the big key.
  assert.ok(walk(w, r, [[0, -9], [0, -6], [-3, -4], [-5.8, -4], [-7, -4], [-8, -4]]), `up to the big key ${r.pos}`);
  assert.ok(r.pos[1] > .55, `on the top step ${r.pos}`);
  assert.equal(openChest(d, 'BK'), 'big');
  assert.ok(tryDoor(d, 'B').ok); w = level(d.open);
  assert.ok(walk(w, r, [[-6.2, -4], [-3, -4], [0, -6], [0, -9], [0, -13], [0, -16]]), `into the boss hall ${r.pos}`);
  assert.ok(reachable(d).has('R5'));
});

test('shut doors really block the robot', () => {
  const r = createRobot([0, 0, -6], 0), w = level(new Set());
  walk(w, r, [[0, -12]], 5);
  assert.ok(r.pos[2] > -8.1, `stopped at door A ${r.pos}`);
});

test('in the world, gated door triangles block until the gate opens', () => {
  const w = createWorld(); for (const t of mineWorldTris()) w.addTri(t.a, t.b, t.c, t.surface, t.gate);
  const [ax, ay, az] = MINE.anchor, from = [ax, ay + .2, az - 6], dir = [0, 0, -1];
  assert.ok(w.raycast(from, dir, 3)?.dist < 2.2, 'door A is shut');
  w.openGate('mine:A');
  const hit = w.raycast(from, dir, 3); assert.ok(!hit || hit.dist > 2.2, 'door A is open');
});
