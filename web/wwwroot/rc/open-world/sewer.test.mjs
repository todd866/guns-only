import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDungeon } from '../physics/dungeon.mjs';
import { createWorld } from '../physics/world.mjs';
import { SEWER_DUNGEON, SEWER_PARK, sewerWorldTris, sewerWorld, buildSewer, inChannel, CHANNELS, ARRIVE, PIPE_Y, roomAt, CHESTS } from './sewer.mjs';

test('the sewers play through fairly to the trick shrine (the combo door is the last lock)', () => {
  const r = checkDungeon(SEWER_DUNGEON);
  assert.ok(r.d.items.has('board'), 'the board chest is reachable before the pipes');
  assert.ok(r.problems.every(p => !p.startsWith('choice')), r.problems.join('; '));
});

test('every chest stands on walkway, never over sewage', () => {
  for (const c of Object.values(CHESTS)) { assert.equal(inChannel(c.at), false); assert.ok(roomAt(c.at)); }
});

test('walkways are solid, channels drop to the pit, and the pipes span the whole S3 channel', () => {
  const world = createWorld(4);
  for (const t of sewerWorldTris()) world.addTri(t.a, t.b, t.c, t.surface, t.gate);
  const down = p => world.raycast(sewerWorld([p[0], 1, p[1]]), [0, -1, 0], 3);
  assert.ok(Math.abs(down([ARRIVE.at[0], ARRIVE.at[2]]).point[1] - sewerWorld([0, 0, 0])[1]) < 1e-6);
  assert.equal(down([28, -2.5]).surface, 'sewage');
  assert.equal(down([4.1, 0]).surface, 'wood', 'footbridge over the junction channel');
  const [x0, x1] = CHANNELS.find(c => c.room === 'S3').box;
  for (const r of SEWER_PARK.rails.filter(r => r.id.startsWith('pipe'))) { assert.ok(r.pts[0][0] < x0 && r.pts.at(-1)[0] > x1); assert.equal(r.pts[0][2], PIPE_Y); }
  assert.ok(buildSewer().length > 100);
});

test('the bowl is a pool: deck at 0, a shallow end by the door, a deep end, coping on all four sides', async () => {
  const { BOWL, bowlFloor } = await import('./sewer.mjs');
  const world = createWorld(4);
  for (const t of sewerWorldTris()) world.addTri(t.a, t.b, t.c, t.surface, t.gate);
  const y = (x, z) => world.raycast(sewerWorld([x, 1, z]), [0, -1, 0], 4).point[1] - sewerWorld([0, 0, 0])[1];
  assert.ok(Math.abs(y(47.8, -2.5)) < 1e-6, 'deck by the door');
  assert.ok(Math.abs(y(54.5, -2.5) + BOWL.deep) < .02, 'deep end');
  assert.ok(y(50, -2.5) > -BOWL.shallow - .02 && y(50, -2.5) < -.1, 'shallow end');
  assert.ok(Math.abs(y(54.5, -2.5) - bowlFloor(54.5, -2.5)) < .02);
  assert.equal(SEWER_PARK.rails.filter(r => r.id.startsWith('coping')).length, 4);
});
