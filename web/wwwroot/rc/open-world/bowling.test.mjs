import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canSwitchBowlingLane,
  createBowling,
  frameMarks,
  recordDelivery,
  rollBowling,
  scoreFrames,
  stepBowling,
  switchBowlingLane
} from './bowling.mjs';
import {ALLEY_FLOOR_Y, LANES} from './bowling-alley.mjs';
import {loadProgress} from './catalog.mjs';

const actor = (x = LANES[0].x, z = LANES[0].approachZ, vx = 0, vz = 0) => ({
  pos: [x, ALLEY_FLOOR_Y, z],
  vel: [vx, 0, vz]
});

test('robot may move lanes before the first roll of a frame, not mid-frame', () => {
  const g = createBowling({control: 'robot', lane: 1});
  recordDelivery(g, 3);
  recordDelivery(g, 4);
  assert.equal(g.frame, 1);
  assert.equal(g.score, 7);
  assert.ok(canSwitchBowlingLane(g));
  assert.equal(switchBowlingLane(g, 4), true);
  assert.equal(g.lane, 4);
  assert.equal(g.frame, 1);
  assert.equal(g.score, 7);
  assert.equal(g.pins[0].pos[0], LANES[3].x);
  recordDelivery(g, 2);
  assert.ok(!canSwitchBowlingLane(g));
  assert.equal(switchBowlingLane(g, 2), false);
  assert.equal(g.lane, 4);
  rollBowling(g, {power: 0.5, aim: 0, mode: 'kid'});
  assert.ok(!canSwitchBowlingLane(g));
  assert.equal(switchBowlingLane(g, 1), false);
});

test('standard scoring handles a perfect 300, all spares, and twenty misses', () => {
  const perfect = Array.from({length: 9}, () => [10]).concat([[10, 10, 10]]);
  assert.equal(scoreFrames(perfect).at(-1), 300);
  const spares = Array.from({length: 9}, () => [5, 5]).concat([[5, 5, 5]]);
  assert.equal(scoreFrames(spares).at(-1), 150);
  assert.equal(scoreFrames(Array.from({length: 10}, () => [0, 0])).at(-1), 0);
});

test('pending strike and spare totals resolve only when bonuses arrive', () => {
  assert.deepEqual(scoreFrames([[10]]), [null]);
  assert.deepEqual(scoreFrames([[10], [7, 3], [4, 2]]), [20, 34, 40]);
  assert.deepEqual(
    scoreFrames([
      [0, 10],
      [4, 2]
    ]),
    [14, 20]
  );
  assert.equal(frameMarks([0, 10], 0), '– /');
  assert.equal(frameMarks([10], 0), 'X');
});

test('tenth-frame bonus rules distinguish valid and invalid bonus balls', () => {
  const tenthStrike = Array(9)
    .fill([0, 0])
    .concat([[10, 7, 3]]);
  assert.equal(scoreFrames(tenthStrike).at(-1), 20);
  const tenthMiss = Array(9)
    .fill([0, 0])
    .concat([[10, 7, 2]]);
  assert.equal(scoreFrames(tenthMiss).at(-1), 19);
  const tenthSpare = Array(9)
    .fill([0, 0])
    .concat([[7, 3, 8]]);
  assert.equal(scoreFrames(tenthSpare).at(-1), 18);
  assert.throws(() => recordDelivery(createBowling({control: 'robot'}), 11), /pinfall/);
  const g = createBowling({control: 'robot'});
  recordDelivery(g, 0);
  assert.equal(recordDelivery(g, 10).spare, true);
});

test('two strikes and the following balls carry the correct pending bonus', () => {
  assert.deepEqual(scoreFrames([[10], [10], [4, 3]]), [24, 41, 48]);
});

test('robot rolls at minimum power and kid aim snaps to the head pin', () => {
  const g = createBowling({control: 'robot', mode: 'kid'});
  assert.equal(rollBowling(g, {power: 0, aim: 0.2, mode: 'kid'}), true);
  assert.equal(g.ball.vel[0], 0);
  assert.ok(g.ball.vel[2] < 0, 'minimum power still points down the lane');
  let result;
  for (let i = 0; i < 120 * 10; i++) {
    const event = stepBowling(g, actor(), 1 / 120);
    if (event?.rolled) {
      result = event;
      break;
    }
  }
  assert.ok(result?.pins > 0, 'minimum power reaches and knocks pins');
  assert.equal(g.ball, null);
});

test('Big Kid gutter balls cannot score after crossing back over the lane', () => {
  const g = createBowling({control: 'robot', mode: 'bigKid'});
  assert.equal(rollBowling(g, {power: 1, aim: 0.5, mode: 'bigKid'}), true);
  g.ball.pos[0] = g.ball.pos[0] + 1;
  g.ball.vel[0] = -1;
  stepBowling(g, actor(), 0.05);
  assert.equal(g.ball.gutter, true);
  g.ball.pos[0] = g.pins[0].pos[0];
  g.ball.pos[2] = g.pins[0].pos[1];
  g.ball.vel[0] = g.ball.vel[2] = 10;
  stepBowling(g, actor(), 0.05);
  assert.equal(g.pins.filter(p => p.down).length, 0);
});

test('idle robot does not consume a delivery, while a missed car returns to its tee', () => {
  const robot = createBowling({control: 'robot'});
  stepBowling(robot, actor(), 1);
  assert.equal(robot.frame, 0);
  const car = createBowling({control: 'car'});
  let result = null;
  for (let i = 0; i < 30 && !result; i++) result = stepBowling(car, actor(LANES[0].x, LANES[0].endZ), 0.2);
  assert.equal(result?.tee?.pos[0], LANES[0].x);
  assert.equal(car.frame, 0, 'a missed first ball returns the tee for delivery two');
});

test('progress migration rejects old one-frame records and preserves valid version two totals', () => {
  const load = value => loadProgress({getItem: () => JSON.stringify(value)});
  assert.equal(load({bowlingBest: 10}).bowlingBest, null);
  assert.equal(load({bowlingVersion: 1, bowlingBest: 10}).bowlingBest, null);
  assert.equal(load({bowlingVersion: 2, bowlingBest: 0}).bowlingBest, 0);
  assert.equal(load({bowlingVersion: 2, bowlingBest: 8}).bowlingBest, 8);
  assert.equal(load({bowlingVersion: 2, bowlingBest: 300}).bowlingBest, 300);
  assert.equal(load({bowlingVersion: 2, bowlingBest: -1}).bowlingBest, null);
  assert.equal(load({bowlingVersion: 2, bowlingBest: 301}).bowlingBest, null);
  assert.equal(load({bowlingVersion: 2, bowlingBest: 8.5}).bowlingBest, null);
});

test('kid bumpers bounce an off-centre ball back inside without a gutter', () => {
  const g = createBowling({control: 'robot'});
  rollBowling(g, {power: 0.7, aim: 0.5, mode: 'kid'});
  g.ball.pos[0] = LANES[0].x + 0.5;
  g.ball.vel[0] = 2;
  stepBowling(g, actor(), 1 / 120);
  assert.equal(g.ball.gutter, false);
  assert.ok(g.ball.pos[0] < LANES[0].x + 0.525);
  assert.ok(g.ball.vel[0] < 0);
  const big = createBowling({control: 'robot', mode: 'bigKid'});
  rollBowling(big, {power: 0.7, aim: 0.2, mode: 'bigKid'});
  assert.ok(big.ball.vel[0] > 0, 'Big Kid has no aim snap');
});

test('tenth-frame rack resets and bonus-ball limits use the live game state', () => {
  for (const [rolls, expected] of [
    [[10, 7, 3], 20],
    [[10, 7, 2], 19],
    [[7, 3, 8], 18],
    [[10, 10, 7], 27],
    [[7, 2], 9]
  ]) {
    const g = createBowling({control: 'robot'});
    for (let i = 0; i < 18; i++) recordDelivery(g, 0);
    assert.equal(g.frame, 9);
    for (let i = 0; i < rolls.length; i++) {
      assert.equal(g.done, false);
      const n = rolls[i];
      let remaining = n;
      for (const pin of g.pins) if (!pin.down && remaining-- > 0) pin.down = true;
      recordDelivery(g, n);
      if (i === 0 && n === 10) assert.ok(g.pins.every(p => !p.down));
      if (i === 1 && rolls[0] === 10 && n === 7) {
        assert.equal(g.rackDown, 7);
        assert.equal(g.pins.filter(p => p.down).length, 7);
        assert.throws(() => recordDelivery(g, 4), /pinfall/);
      }
    }
    assert.equal(g.done, true);
    assert.equal(g.score, expected);
    assert.equal(recordDelivery(g, 0), null);
    assert.equal(g.frames[9].length, rolls.length);
  }
});

test('perfect and all-spare games complete through the scoring state machine', () => {
  const g = createBowling({control: 'robot'});
  for (let i = 0; i < 12; i++) recordDelivery(g, 10);
  assert.equal(g.done, true);
  assert.equal(g.score, 300);
  const spare = createBowling({control: 'robot'});
  for (let i = 0; i < 21; i++) recordDelivery(spare, 5);
  assert.equal(spare.done, true);
  assert.equal(spare.score, 150);
});

test('a zero after a tenth-frame strike leaves the same rack for a spare', () => {
  const g = createBowling({control: 'robot'});
  for (let i = 0; i < 18; i++) recordDelivery(g, 0);
  recordDelivery(g, 10);
  recordDelivery(g, 0);
  const result = recordDelivery(g, 10);
  assert.equal(result.spare, true);
  assert.equal(result.strike, false);
  assert.equal(g.score, 20);
  assert.equal(frameMarks(g.frames[9], 9), 'X – /');
  assert.equal(frameMarks([0, 10, 10], 9), '– / X');
});
