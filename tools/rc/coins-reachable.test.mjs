// Every challenge coin (COIN_01..COIN_05 in each district GLB) must be reachable by the real car
// physics: from the racing line, along the coin's authored approach (node extras approach_xy,
// Blender XY), through the coin (collected by the game's own rule in session.mjs), and back to
// the racing line along return_xy (default: the approach reversed), with no stall over 2 s and
// no auto-unstick hop, in kid and Big Kid modes. If a coin fails here, move the coin.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { courseFromGlb, parseGlb, walkNodes } from '../../web/wwwroot/rc/physics/district.mjs';
import { drivePath, fromBlender } from './drive-path.mjs';

const DISTRICTS = process.env.RC_DISTRICTS?.split(',') ?? ['housing', 'bx', 'school'];
const load = name => {
  const b = fs.readFileSync(fileURLToPath(new URL(`../../web/wwwroot/rc/assets/districts/${name}.glb`, import.meta.url)));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const pairs = flat => { const out = []; for (let i = 0; i + 1 < (flat?.length ?? 0); i += 2) out.push([flat[i], flat[i + 1]]); return out; };

function coinsOf(buffer) {
  const out = [];
  walkNodes(parseGlb(buffer), (n, m) => {
    if (/^COIN_\d{2}$/.test(n.name ?? '')) out.push({ name: n.name, x: m[12], y: m[13], z: m[14], extras: n.extras ?? {} });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

for (const district of DISTRICTS) {
  const buffer = load(district), course = courseFromGlb(buffer), coins = coinsOf(buffer);
  const ai = course.ai.map(n => [n.pos[0], n.pos[2]]);
  const nearestAI = p => ai.reduce((best, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(best[0] - p[0], best[1] - p[1]) ? q : best);

  test(`${district}: five coins, each with an authored approach`, () => {
    assert.deepEqual(coins.map(c => c.name), ['COIN_01', 'COIN_02', 'COIN_03', 'COIN_04', 'COIN_05']);
    assert.deepEqual(course.coins.map(c => c.name), coins.map(c => c.name));
    for (const c of coins) assert.ok(pairs(c.extras.approach_xy).length >= 1, `${c.name} has no approach_xy`);
  });

  for (const c of coins) {
    const approach = pairs(c.extras.approach_xy).map(fromBlender);
    const back = (c.extras.return_xy ? pairs(c.extras.return_xy) : pairs(c.extras.approach_xy).reverse()).map(fromBlender);
    const path = [nearestAI(approach[0]), ...approach, [c.x, c.z, 0.45], ...back, nearestAI(back[back.length - 1])];
    for (const mode of ['kid', 'bigKid']) {
      test(`${district} ${c.name} (${c.extras.hint ?? ''}) is reachable and back in ${mode} mode`, () => {
        const r = drivePath(course, path, { mode, maxTime: 120 });
        assert.ok(r.reached, `stopped at waypoint ${r.target}/${r.nodes} at ${r.at.map(v => v.toFixed(2))} after ${r.t.toFixed(1)} s`);
        assert.ok(r.worstStall <= 2, `stalled ${r.worstStall.toFixed(2)} s`);
        assert.equal(r.recoveries, 0, 'needed an auto-unstick hop');
        assert.ok(r.coins.includes(c.name), `${c.name} not collected (collected: ${r.coins.join(', ') || 'none'})`);
      });
    }
  }
}
