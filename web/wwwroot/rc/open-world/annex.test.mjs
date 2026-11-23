import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../physics/world.mjs';
import {createCar, stepCar, rideHeight, BUGGY} from '../physics/car.mjs';
import {createRobot, stepRobot, ROBOT} from '../physics/robot.mjs';
import {LAB} from './lab-accident.mjs';
import {labLocal, labWorld} from './lab-accident.mjs';
import {
  SAVE_KEY,
  TURN_GATE,
  LEVER,
  TURN,
  BULKHEAD,
  GAPS,
  PLATES,
  ALIEN_HOMES,
  annexWorldTris,
  gapFits,
  plateLive,
  annexDark,
  annexFell,
  leverNear,
  loadAnnex,
  saveAnnex,
  createAnnexState,
  stepAnnex,
  checkpointSpawn,
  roofSeat
} from './annex.mjs';

const storage = () => {
  const m = new Map();
  return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))};
};
const at = (x, z, y = 0.2) => labWorld([x, y, z]);
const player = (x, z, extra = {}) => ({pos: at(x, z), use: false, form: 'car', ...extra});

function drive(car, world, n, throttle = 1) {
  for (let i = 0; i < n; i++) stepCar(car, {throttle, steer: 0, brake: false}, world, 1 / 120);
}

test('checkpoints remember in guns-only.rc.annex.v1 and ignore a broken store', () => {
  assert.equal(SAVE_KEY, 'guns-only.rc.annex.v1');
  const s = storage();
  assert.deepEqual(loadAnnex(s), {checkpoint: 0, got: [false, false]});
  assert.deepEqual(loadAnnex(null), {checkpoint: 0, got: [false, false]});
  const state = createAnnexState();
  state.checkpoint = 2;
  state.got = [true, true];
  state.robots = 2;
  saveAnnex(s, state);
  assert.equal(s.getItem(SAVE_KEY).includes('"v":1'), true);
  const back = loadAnnex(s);
  assert.equal(back.checkpoint, 2);
  assert.deepEqual(back.got, [true, true]);
  s.setItem(SAVE_KEY, '{');
  assert.equal(loadAnnex(s).checkpoint, 0);
  s.setItem(SAVE_KEY, JSON.stringify({checkpoint: 9, got: [1, 0]}));
  assert.equal(loadAnnex(s).checkpoint, 1);
  assert.equal(loadAnnex({getItem() { throw new Error('no'); }}).checkpoint, 0);
  assert.equal(saveAnnex({setItem() { throw new Error('no'); }}, state), undefined);
});

test('the descent stays in the lab frame, so the entry can move with the chamber', () => {
  const tris = annexWorldTris();
  assert.ok(tris.length > 40 && tris.length < 900, tris.length);
  assert.ok(tris.some(t => t.gate === TURN_GATE));
  const sample = tris[0].a;
  assert.ok(Math.abs(sample[1] - LAB.anchor[1]) < 4);
  assert.ok(Math.hypot(sample[0] - LAB.anchor[0], sample[2] - LAB.anchor[2]) < 80);
  assert.equal(annexDark(labWorld([0, 0.2, -25])), true);
  assert.equal(annexDark(labWorld([0, 0.2, -60])), true);
  assert.equal(annexDark(labWorld([0, 0.2, 0])), false);
  assert.equal(annexDark([2040, 2, -690]), false);
  assert.equal(annexFell(labWorld([0, -4, -30])), true);
  assert.equal(annexFell(labWorld([0, 0.2, -30])), false);
});

test('floor plates spark on a timer and only slow the car that is on one', () => {
  assert.equal(plateLive(PLATES[0], 0.05), true);
  assert.equal(plateLive(PLATES[0], 1.2), false);
  const hot = createAnnexState();
  stepAnnex(hot, 0.05, {players: [player(PLATES[0].x, PLATES[0].z)]});
  assert.equal(hot.live[0], true);
  assert.deepEqual(hot.zaps, [0]);
  assert.ok(hot.shock[0] > 0.5);
  stepAnnex(hot, 0.05, {players: [player(PLATES[0].x, PLATES[0].z)]});
  assert.deepEqual(hot.zaps, []);
  const cold = createAnnexState();
  stepAnnex(cold, 1.2, {players: [player(PLATES[0].x, PLATES[0].z)]});
  assert.equal(cold.live[0], false);
  assert.deepEqual(cold.zaps, []);
  const miss = createAnnexState();
  stepAnnex(miss, 0.05, {players: [player(0, -25)]});
  assert.deepEqual(miss.zaps, []);
  const words = [...hot.events, ...hot.cues, ...cold.events].join(' ');
  assert.doesNotMatch(words, /hurt|blood|gore|shoot|dead|damage/i);
});

test('either car can hold the lever; the turntable stops open, then spins again', () => {
  const s = createAnnexState();
  assert.equal(s.blocked, true);
  assert.equal(leverNear(at(LEVER.at[0], LEVER.at[2])), true);
  assert.equal(leverNear(at(0, -34.4)), false);
  stepAnnex(s, 1, {
    players: [player(0, -34.2), player(LEVER.at[0], LEVER.at[2], {use: true})]
  });
  assert.equal(s.holder, 1);
  assert.equal(s.blocked, false);
  assert.ok(Math.abs(s.angle - TURN.openAt) < 0.25, s.angle);
  assert.deepEqual(s.events.filter(e => e === 'annex_coop_lever'), ['annex_coop_lever']);
  stepAnnex(s, 0.2, {players: [player(0, -34.2), player(LEVER.at[0], LEVER.at[2], {use: true})]});
  assert.equal(s.events.filter(e => e === 'annex_coop_lever').length, 1);
  stepAnnex(s, 0.3, {players: [player(0, -34.2), player(LEVER.at[0], LEVER.at[2], {use: false})]});
  assert.equal(s.blocked, false, 'grace keeps the mouth open so one driver can cross');
  stepAnnex(s, TURN.grace, {players: [player(0, -20), player(1, -20)]});
  assert.equal(s.blocked, true);
  assert.equal(s.holder, -1);
});

test('player 1 holding the lever is the same stop, and a tap does not stick forever', () => {
  const s = createAnnexState();
  stepAnnex(s, 1, {players: [player(LEVER.at[0], LEVER.at[2], {use: true})]});
  assert.equal(s.blocked, false);
  assert.equal(s.holder, 0);
  stepAnnex(s, TURN.grace + 0.2, {players: [player(0, -22)]});
  assert.equal(s.blocked, true);
});

test('each terminal saves a robot on the car that reached it', () => {
  const s = storage();
  const state = createAnnexState();
  stepAnnex(state, 0.1, {players: [player(-4, -30), player(0, -43.6)], storage: s});
  assert.equal(state.checkpoint, 1);
  assert.equal(state.robots, 1);
  assert.deepEqual(state.roofs, [0, 1]);
  assert.ok(state.events.includes('annex_checkpoint_1'));
  assert.ok(state.events.includes('annex_zone_1'));
  const saved = JSON.parse(s.getItem(SAVE_KEY));
  assert.equal(saved.checkpoint, 1);
  assert.equal(saved.robots, 1);
  stepAnnex(state, 0.1, {players: [player(0, -43.6)], storage: s});
  assert.equal(state.robots, 1);
  stepAnnex(state, 0.1, {players: [player(0, -64.3, {form: 'robot'})], storage: s});
  assert.equal(state.checkpoint, 2);
  assert.equal(state.robots, 2);
  assert.equal(state.roofs[0], 1);
  assert.ok(state.events.includes('annex_checkpoint_2'));
  assert.ok(state.events.includes('annex_zone_2'));
  const again = createAnnexState(loadAnnex(s));
  assert.equal(again.checkpoint, 2);
  assert.deepEqual(again.got, [true, true]);
  stepAnnex(again, 0.1, {players: [player(0, -64.3)], storage: s});
  assert.equal(again.robots, 2);
  const spawn = checkpointSpawn(1);
  assert.equal(labLocal(spawn.p1)[2] > -43.6, true);
  assert.ok(Math.abs(spawn.p1[0] - spawn.p2[0]) > 0.7);
  assert.equal(checkpointSpawn(0), null);
  const seat = roofSeat(spawn.p1, spawn.yaw, 1);
  assert.ok(seat[1] > spawn.p1[1] + 0.25);
});

test('sleepy aliens follow the nearer car, bump, and never hurt anyone', () => {
  const home = ALIEN_HOMES[0];
  const s = createAnnexState();
  stepAnnex(s, 0.05, {players: [player(home[0], home[2]), player(6.2, -60)]});
  assert.equal(s.aliens[0].focus, 0);
  assert.equal(s.aliens[0].awake, true);
  assert.ok(s.pushes.some(p => p.index === 0));
  assert.ok(s.cues.includes('giggle'));
  assert.ok(s.events.includes('annex_bump'));
  assert.equal(s.events.includes('annex_hurt'), false);
  const chase = createAnnexState();
  const far = [home[0] + 4, home[2]];
  stepAnnex(chase, 1, {players: [player(far[0], far[1])]});
  const moved = Math.hypot(chase.aliens[0].pos[0] - home[0], chase.aliens[0].pos[2] - home[2]);
  assert.ok(moved > 0.8, moved);
  assert.ok(
    Math.hypot(chase.aliens[0].pos[0] - far[0], chase.aliens[0].pos[2] - far[1]) <
      Math.hypot(home[0] - far[0], home[2] - far[1])
  );
});

test('the slit is the robot gap and the east opening is the car and board lane', () => {
  assert.equal(gapFits('robot', 'slit'), true);
  assert.equal(gapFits('car', 'slit'), false);
  assert.equal(gapFits('board', 'slit'), false);
  assert.equal(gapFits('car', 'lane'), true);
  assert.equal(gapFits('board', 'lane'), true);
  assert.ok(GAPS.slit.width < 0.2 && GAPS.slit.width > ROBOT.radius * 2);
  assert.ok(GAPS.lane.width > 1.2);
  assert.ok(GAPS.slit.width < BUGGY.wheels[1].at[0] * 2);
});

function worldOf() {
  const w = createWorld();
  for (const t of annexWorldTris()) w.addTri(t.a, t.b, t.c, t.surface, t.gate);
  return w;
}
function settle(car, world) {
  for (let i = 0; i < 60; i++) stepCar(car, {throttle: 0, steer: 0, brake: true}, world, 1 / 120);
}

test('the turntable gate stops a car until it is opened, and both routes match their forms', () => {
  const blocked = worldOf();
  const mouth = labWorld([0, 0, -33.1]);
  const car = createCar(BUGGY, [mouth[0], mouth[1] + rideHeight(BUGGY) + 0.4, mouth[2]], 0);
  settle(car, blocked);
  drive(car, blocked, 360);
  assert.ok(labLocal(car.pos)[2] > -34.35, labLocal(car.pos)[2]);

  const open = worldOf();
  open.openGate(TURN_GATE);
  const through = createCar(BUGGY, [mouth[0], mouth[1] + rideHeight(BUGGY) + 0.4, mouth[2]], 0);
  settle(through, open);
  drive(through, open, 420);
  assert.ok(labLocal(through.pos)[2] < -36, labLocal(through.pos)[2]);

  const slit = worldOf();
  const slitAt = labWorld([0, 0.02, -52.35]);
  const robot = createRobot([slitAt[0], slitAt[1], slitAt[2]], 0);
  for (let i = 0; i < 700; i++) stepRobot(robot, {throttle: 1, steer: 0}, slit, 1 / 120);
  assert.ok(labLocal(robot.pos)[2] < BULKHEAD.z0, labLocal(robot.pos).join(','));

  const wedged = createCar(BUGGY, [slitAt[0], slitAt[1] + rideHeight(BUGGY) + 0.4, slitAt[2]], 0);
  settle(wedged, slit);
  drive(wedged, slit, 360);
  assert.ok(labLocal(wedged.pos)[2] > BULKHEAD.z1, labLocal(wedged.pos)[2]);

  const laneX = (BULKHEAD.lane[0] + BULKHEAD.lane[1]) / 2;
  const laneAt = labWorld([laneX, 0, -52.35]);
  const board = createCar(BUGGY, [laneAt[0], laneAt[1] + rideHeight(BUGGY) + 0.4, laneAt[2]], 0);
  settle(board, slit);
  drive(board, slit, 420);
  assert.ok(labLocal(board.pos)[2] < BULKHEAD.z0, labLocal(board.pos)[2]);
});
