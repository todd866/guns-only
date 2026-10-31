import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './world.mjs';
import { createRobot, stepRobot } from './robot.mjs';
import { createFighter, roomHelp } from './combat.mjs';
import { createBoss, stepBoss, bossWorld, BOSS } from './boss.mjs';
import { buildMine, BOSS_AT } from '../open-world/mine.mjs';

const DT = 1 / 120;
// A kid who knows the pattern: wait on the cab step through the sweep, step off the slam ring,
// climb back and punch while the control box glows. Positions are set directly (the pattern, not
// the walking, is under test here; the climb is tested below with real robot physics).
function play(mode = 'kid', careful = true, seconds = 90) {
  const b = createBoss(BOSS_AT), f = createFighter(mode), r = { pos: [0, BOSS.step.top, BOSS_AT[2] + 1.5], vel: [0, 0, 0], yaw: Math.PI }, log = [];
  const onStepPos = [0, BOSS.step.top, BOSS_AT[2] + 1.5], floorPos = [0, 0, BOSS_AT[2] + 3.5];
  for (let i = 0; i < seconds / DT && !b.freed && f.batteries > 0; i++) {
    f.invuln = Math.max(0, f.invuln - DT);
    if (careful) r.pos = b.state === 'slamAim' && b.t > .3 ? [...floorPos] : [...onStepPos];
    log.push(...stepBoss(b, r, f, { attack: b.state === 'stuck' && i % 30 === 0 }, roomHelp({}), DT));
  }
  return { b, f, log };
}

test('a kid who learns the pattern frees the excavator in three rounds', () => {
  const { b, f, log } = play();
  assert.ok(b.freed, `freed (hits ${b.hits}, state ${b.state})`);
  assert.equal(log.filter(e => e.hit).length, BOSS.hits);
  assert.equal(f.batteries, f.max, 'no damage taken when the tells are read');
  assert.ok(log.some(e => e.tell === 'sweep') && log.some(e => e.tell === 'slam'), 'both attacks are telegraphed');
});

test('standing in the open gets swept and slammed; the cab step clears the sweep', () => {
  const b = createBoss(BOSS_AT), f = createFighter('kid'), r = { pos: [0, 0, BOSS_AT[2] + 2.2], vel: [0, 0, 0], yaw: 0 }, log = [];
  for (let i = 0; i < 12 / DT; i++) { f.invuln = Math.max(0, f.invuln - DT); log.push(...stepBoss(b, r, f, {}, roomHelp({}), DT)); }
  assert.ok(log.some(e => e.why === 'sweep'), 'swept'); assert.ok(log.some(e => e.why === 'slam'), 'slammed');
  const b2 = createBoss(BOSS_AT), f2 = createFighter('kid'), up = { pos: [0, BOSS.step.top, BOSS_AT[2] + 1.5], vel: [0, 0, 0], yaw: 0 }, l2 = [];
  for (let i = 0; i < 4 / DT; i++) l2.push(...stepBoss(b2, up, f2, {}, roomHelp({}), DT));
  assert.ok(!l2.some(e => e.why === 'sweep'), 'the step is above the arm');
});

test('the weak point only takes punches while stuck, from the step', () => {
  const b = createBoss(BOSS_AT), f = createFighter('kid'), floor = { pos: [0, 0, BOSS_AT[2] + 1.9], vel: [0, 0, 0], yaw: 0 };
  for (let i = 0; i < 20 / DT && !b.hits; i++) stepBoss(b, floor, f, { attack: true }, roomHelp({}), DT);
  assert.equal(b.hits, 0, 'punching from the floor does nothing');
});

test('room help slows the tells after knockouts', () => {
  const t = help => { const b = createBoss(BOSS_AT), f = createFighter('kid'), r = { pos: [0, .3, BOSS_AT[2] + 1.5], vel: [0, 0, 0], yaw: 0 }; let n = 0; while (b.state !== 'sweep' && n < 2000) { stepBoss(b, r, f, {}, help, DT); n++; } return n; };
  assert.ok(t(roomHelp({ knockouts: 2 })) > t(roomHelp({})));
});

test('the robot can climb the cab step from the hall floor', () => {
  const w = createWorld(); for (const t of buildMine()) w.addTri(t.a, t.b, t.c, t.surface);
  const r = createRobot([0, 0, BOSS_AT[2] + 4], 0);
  for (let i = 0; i < 6 / DT; i++) stepRobot(r, { throttle: 1 }, w, DT);
  assert.ok(r.pos[1] > BOSS.step.top - .05, `on the step: y ${r.pos[1].toFixed(2)} z ${r.pos[2].toFixed(2)}`);
});
