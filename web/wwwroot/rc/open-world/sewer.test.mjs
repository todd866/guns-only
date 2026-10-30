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
