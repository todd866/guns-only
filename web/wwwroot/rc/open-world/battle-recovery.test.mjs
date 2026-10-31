import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {loadOpenWorld} from './runtime.js';
import {buildBattleArenas} from './battle-arenas.js';
import {BATTLE_EVENTS} from './battle-arenas.mjs';
import {createSession, recover} from '../physics/session.mjs';
test('battle recovery stays on each arena deck instead of the base road network', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async url =>
    new Response(fs.readFileSync(new URL(String(url), new URL('../', import.meta.url))));
  try {
    for (const e of BATTLE_EVENTS) {
      const world = await loadOpenWorld('?event=' + e.id);
      const art = buildBattleArenas(new T.Scene(), world.stream.world);
      try {
        const session = createSession(world.course);
        session.roam = true;
        session.car.pos = [e.points[0][0] + 3, -2, e.points[0][1] + 2];
        recover(session);
        assert.ok(
          Math.hypot(session.car.pos[0] - e.points[0][0], session.car.pos[2] - e.points[0][1]) < 15,
          e.id
        );
        assert.ok(
          session.car.pos[1] > e.points[0][2] && session.car.pos[1] < e.points[0][2] + 0.5,
          e.id + ' deck'
        );
      } finally {
        art.dispose();
        world.dispose();
      }
    }
  } finally {
    globalThis.fetch = old;
  }
});
