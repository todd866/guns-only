import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE,
  PLANE_Z,
  coinTotal,
  createPlatformerRun,
  solidBoxes,
  stepPlatformer
} from './platformer.mjs';

const rider = run => run.riders[0];
const place = (run, x, y, extra = {}) => Object.assign(rider(run), {x, y, vx: 0, vy: 0, grounded: false, ...extra});
const tile = kind => COURSE.find(t => t.kind === kind);
const steps = (run, n, dt, input) => {
  for (let i = 0; i < n; i++) stepPlatformer(run, dt, input);
};

function hop(run) {
  const r = rider(run);
  const boxes = solidBoxes(run, r);
  const front = r.x + r.w * 0.5 + 0.28;
  const supported = boxes.some(b => b.x <= front && b.x + b.w >= front && b.top >= r.y - 0.12 && b.top <= r.y + 0.22);
  const wall = boxes.some(
    b => b.x < r.x + r.w * 0.65 && b.x + b.w > r.x + 0.05 && b.y < r.y + r.h * 0.8 && b.top > r.y + 0.18
  );
  return {move: 1, jump: r.grounded && (!supported || wall)};
}

test('the floor catches a fall and the dream keeps the car on one plane', () => {
  const run = createPlatformerRun(['car']);
  const r = rider(run);
  r.z = 4;
  r.y = 2;
  steps(run, 180, 1 / 60, {move: 0, jump: false});
  assert.equal(r.z, PLANE_Z);
  assert.equal(r.grounded, true);
  assert.ok(r.y < 1);
});

test('a wall stops the car and a spring throws it upward', () => {
  const run = createPlatformerRun();
  const wall = COURSE.find(t => t.smash);
  place(run, wall.x - 0.3, wall.y);
  steps(run, 40, 1 / 60, {move: 1, jump: false});
  assert.ok(rider(run).x + rider(run).w * 0.5 <= wall.x + 0.05);
  const spring = tile('spring');
  const hopped = createPlatformerRun();
  place(hopped, spring.x + spring.w / 2, spring.y + spring.h + 0.4, {vy: -2});
  let peak = 0;
  for (let i = 0; i < 90; i++) {
    stepPlatformer(hopped, 1 / 60, {move: 0, jump: false});
    peak = Math.max(peak, rider(hopped).vy);
  }
  assert.ok(peak > 4, `spring vy ${peak}`);
});

test('a miss respawns at the last checkpoint and keeps the coins', () => {
  const run = createPlatformerRun();
  const marks = COURSE.filter(t => t.kind === 'checkpoint');
  const second = marks[1];
  place(run, second.x + 0.2, second.y + 0.2);
  stepPlatformer(run, 1 / 60, {move: 0});
  rider(run).coins = 3;
  rider(run).got = {1: true};
  place(run, second.x, -8, {vy: -1});
  stepPlatformer(run, 1 / 60, {move: 0});
  const r = rider(run);
  assert.ok(Math.abs(r.x - (second.x + second.w / 2)) < 0.8, `respawn x ${r.x}`);
  assert.ok(r.y > -1);
  assert.equal(r.coins, 3);
  assert.equal(r.falls, 1);
});

test('coins count once, bouncecap jumps higher, and only puffcap smashes a block', () => {
  const run = createPlatformerRun();
  const coin = tile('coin');
  place(run, coin.x + coin.w / 2, coin.y);
  stepPlatformer(run, 1 / 60, {move: 0});
  stepPlatformer(run, 1 / 60, {move: 0});
  assert.equal(rider(run).coins, 1);
  assert.ok(coinTotal() >= 8);

  const plain = createPlatformerRun();
  place(plain, 2, 0.5, {grounded: true});
  stepPlatformer(plain, 1 / 60, {move: 0, jump: true});
  let plainPeak = rider(plain).y;
  for (let i = 0; i < 80; i++) {
    stepPlatformer(plain, 1 / 60, {move: 0, jump: false});
    plainPeak = Math.max(plainPeak, rider(plain).y);
  }
  const bounce = tile('mushroom');
  assert.equal(bounce.cap, 'bounce');
  const boosted = createPlatformerRun();
  place(boosted, bounce.x + bounce.w / 2, bounce.y);
  stepPlatformer(boosted, 1 / 60, {move: 0});
  assert.equal(rider(boosted).power, 'bounce');
  rider(boosted).grounded = true;
  rider(boosted).vy = 0;
  stepPlatformer(boosted, 1 / 60, {move: 0, jump: true});
  let boostPeak = rider(boosted).y;
  for (let i = 0; i < 120; i++) {
    stepPlatformer(boosted, 1 / 60, {move: 0, jump: false});
    boostPeak = Math.max(boostPeak, rider(boosted).y);
  }
  assert.ok(boostPeak > plainPeak + 0.8, `bounce ${boostPeak} vs hop ${plainPeak}`);

  const block = COURSE.find(t => t.smash);
  const small = createPlatformerRun();
  place(small, block.x - 0.05, block.y);
  steps(small, 8, 1 / 60, {move: 1});
  assert.equal(small.gone[block.id], undefined);
  const puff = COURSE.find(t => t.kind === 'mushroom' && t.cap === 'puff');
  const big = createPlatformerRun();
  place(big, puff.x + puff.w / 2, puff.y);
  stepPlatformer(big, 1 / 60, {move: 0});
  assert.equal(rider(big).power, 'puff');
  place(big, block.x - 0.05, block.y);
  steps(big, 8, 1 / 60, {move: 1});
  assert.equal(big.gone[block.id], true);
});

test('a bridge falls after it is stood on, and a moving platform carries its rider', () => {
  const bridge = tile('bridge');
  const stood = createPlatformerRun();
  place(stood, bridge.x + bridge.w / 2, bridge.y + bridge.h + 0.02);
  steps(stood, 20, 1 / 60, {move: 0});
  assert.equal(stood.gone[bridge.id], undefined);
  steps(stood, 200, 1 / 60, {move: 0});
  assert.equal(stood.gone[bridge.id], true);

  const platform = tile('platform');
  const ride = createPlatformerRun();
  place(ride, platform.x + 0.4, platform.y + platform.h + 0.02);
  steps(ride, 30, 1 / 60, {move: 0});
  const left = rider(ride).x;
  steps(ride, 50, 1 / 60, {move: 0});
  assert.ok(Math.abs(rider(ride).x - left) > 0.15, `carried ${rider(ride).x - left}`);
});

test('the flag is the goal and a steady run clears the course in about a minute', () => {
  assert.equal(tile('flag').kind, 'flag');
  const run = createPlatformerRun(['car']);
  let t = 0;
  while (t < 120 && !rider(run).goal) {
    stepPlatformer(run, 1 / 60, hop(run));
    t += 1 / 60;
  }
  const r = rider(run);
  assert.equal(r.goal, true, `x=${r.x.toFixed(1)} falls=${r.falls} t=${t.toFixed(1)} coins=${r.coins}`);
  assert.equal(r.falls, 0);
  assert.ok(r.coins >= 4, `coins ${r.coins}`);
  assert.ok(t >= 60 && t <= 90, `course time ${t.toFixed(1)}s`);
});
