import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './world.mjs';
import { createRobot, stepRobot } from './robot.mjs';
import { createFighter, createEnemy, stepCombat, roomHelp, reviveFighter, COMBAT } from './combat.mjs';

const yard = () => { const w = createWorld(); w.addQuad([-20, 0, -20], [-20, 0, 20], [20, 0, 20], [20, 0, -20], 'dirt'); return w; };
// A simple kid player: lock on, close in, punch on cooldown, step back while an enemy winds up.
function fight(enemies, mode = 'kid', seconds = 40, knockouts = 0, careful = true) {
  const w = yard(), r = createRobot([0, 0, 0], 0), f = createFighter(mode), room = { knockouts }, log = [];
  for (let i = 0; i < seconds * 120 && enemies.some(e => e.alive) && f.batteries > 0; i++) {
    const target = enemies.filter(e => e.alive).sort((a, b) => Math.hypot(a.pos[0] - r.pos[0], a.pos[2] - r.pos[2]) - Math.hypot(b.pos[0] - r.pos[0], b.pos[2] - r.pos[2]))[0];
    const d = Math.hypot(target.pos[0] - r.pos[0], target.pos[2] - r.pos[2]), danger = careful && enemies.some(e => e.state === 'windup' && e.t > .25);
    const ev = stepCombat(r, f, enemies, { lock: true, attack: !danger && d < .4 && i % 6 === 0 }, room, 1 / 120);
    const want = Math.atan2(target.pos[0] - r.pos[0], -(target.pos[2] - r.pos[2])), err = Math.atan2(Math.sin(want - r.yaw), Math.cos(want - r.yaw));
    stepRobot(r, { throttle: danger ? -1 : d > .3 && Math.abs(err) < .8 ? 1 : 0, steer: Math.max(-1, Math.min(1, err * 3)) }, w, 1 / 120);
    log.push(...ev);
  }
  return { f, log, enemies };
}

test('a careful kid beats three wind-up toys', () => {
  const es = [createEnemy('a', [0, 0, -2]), createEnemy('b', [1.5, 0, -2.5]), createEnemy('c', [-1.5, 0, -3])];
  const { f, log } = fight(es);
  assert.ok(es.every(e => !e.alive), `all popped: ${es.map(e => e.hp)}`);
  assert.ok(f.batteries > 0, `survived with ${f.batteries}`);
  assert.ok(log.some(e => e.windup), 'enemies attack');
});

test('enemies take turns: never two winding up or striking at once', () => {
  const es = [0, 1, 2, 3].map(i => createEnemy('e' + i, [Math.cos(i) * .4, 0, Math.sin(i) * .4]));
  const w = yard(), r = createRobot([0, 0, 0], 0), f = createFighter('kid');
  let worst = 0;
  for (let i = 0; i < 120 * 10; i++) { stepCombat(r, f, es, {}, {}, 1 / 120); stepRobot(r, {}, w, 1 / 120); worst = Math.max(worst, es.filter(e => e.state === 'windup' || e.state === 'strike').length); f.batteries = 9; }
  assert.equal(worst, 1);
});

test('standing still in a crowd gets you knocked out, and room help softens the next try', () => {
  const es = [0, 1, 2].map(i => createEnemy('e' + i, [Math.cos(i * 2) * .5, 0, Math.sin(i * 2) * .5]));
  const w = yard(), r = createRobot([0, 0, 0], 0), f = createFighter('kid'); let ko = false;
  for (let i = 0; i < 120 * 60 && !ko; i++) { ko = stepCombat(r, f, es, {}, {}, 1 / 120).some(e => e.knockout); stepRobot(r, {}, w, 1 / 120); }
  assert.ok(ko, 'a passive player is eventually knocked out (never immune)');
  reviveFighter(f); assert.equal(f.batteries, f.max);
  assert.ok(roomHelp({ knockouts: 2 }).windupScale > roomHelp({ knockouts: 0 }).windupScale && roomHelp({ knockouts: 3 }).weakPointGlow);
  assert.ok(COMBAT.batteries.kid > COMBAT.batteries.bigKid);
});
