import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLD_LAB,
  COLD_LAB_RING,
  createDream,
  dreamFromSearch,
  dreamRingEdge,
  enterDream,
  stepDream,
  takeDreamEvents
} from './runner.mjs';

const players = () => [
  {id: 'p1', pos: [2040, 0.4, -600], yaw: 1.2, vel: [1, 0, -0.2], form: 'robot'},
  {id: 'p2', pos: [2042, 0.4, -599], yaw: 0.4, vel: [0, 0, 0], form: 'car'}
];

const untilIdle = dream => {
  for (let i = 0; i < 300 && dream.phase !== 'idle'; i++) stepDream(dream, 1 / 30);
};

test('enter stores every player and will not start a second dream', () => {
  const dream = createDream();
  assert.equal(enterDream(dream, 'platformer', players(), 10), true);
  assert.equal(dream.phase, 'enter');
  assert.equal(dream.shown, 'world');
  assert.deepEqual(
    dream.stored.map(p => ({id: p.id, form: p.form, pos: p.pos})),
    [
      {id: 'p1', form: 'robot', pos: [2040, 0.4, -600]},
      {id: 'p2', form: 'car', pos: [2042, 0.4, -599]}
    ]
  );
  assert.equal(enterDream(dream, 'platformer', players()), false);
  assert.equal(enterDream(createDream(), 'shooter', players()), false);
  const [entered] = takeDreamEvents(dream);
  assert.deepEqual(entered, {code: 'dream_enter', name: 'platformer', ms: 0, finished: false});
});

test('the entry ripple peaks, then the dream scene is the one showing', () => {
  const dream = createDream();
  enterDream(dream, 'platformer', [players()[0]]);
  stepDream(dream, 0.05);
  assert.equal(dream.shown, 'world');
  assert.ok(dream.ripple > 0 && dream.ripple < 1);
  stepDream(dream, 2);
  assert.equal(dream.phase, 'play');
  assert.equal(dream.shown, 'dream');
});

test('a goal ripples back and reports a finished dream', () => {
  const dream = createDream();
  enterDream(dream, 'platformer', [players()[0]]);
  stepDream(dream, 0.6);
  assert.equal(dream.phase, 'play');
  assert.equal(dream.shown, 'dream');
  assert.equal(dream.ms, 0);
  stepDream(dream, 0.45, {goal: true});
  assert.equal(dream.phase, 'exit');
  assert.equal(dream.finished, true);
  untilIdle(dream);
  assert.equal(dream.phase, 'idle');
  assert.equal(dream.shown, 'world');
  assert.equal(dream.ripple, 0);
  const exit = takeDreamEvents(dream).find(e => e.code === 'dream_exit');
  assert.equal(exit.name, 'platformer');
  assert.equal(exit.finished, true);
  assert.ok(exit.ms >= 440 && exit.ms <= 460);
  assert.equal(dream.stored[0].form, 'robot');
  assert.deepEqual(dream.stored[0].pos, [2040, 0.4, -600]);
});

test('waking up bails, and a bail beats a goal on the same step', () => {
  const dream = createDream();
  enterDream(dream, 'platformer', [players()[0]]);
  stepDream(dream, 2);
  stepDream(dream, 0.2, {goal: true, bail: true});
  assert.equal(dream.finished, false);
  untilIdle(dream);
  const exit = takeDreamEvents(dream).find(e => e.code === 'dream_exit');
  assert.equal(exit.finished, false);
  assert.ok(exit.ms >= 200);
});

test('?dream=platformer names the dream, and the cold-lab ring is its door', () => {
  assert.equal(dreamFromSearch('?dream=platformer'), 'platformer');
  assert.equal(dreamFromSearch('?dream=platformer&at=coldlab'), 'platformer');
  assert.equal(dreamFromSearch('?dream=nope'), null);
  assert.equal(dreamFromSearch('?at=coldlab'), null);
  const [x, , z] = COLD_LAB_RING.pos;
  assert.ok(Math.hypot(x - COLD_LAB[0], z - COLD_LAB[2]) < 120);
  assert.ok(z > -625, 'ring sits outside the hangar, on the open side');
  const dream = createDream();
  assert.equal(dreamRingEdge(dream, [x, 0.2, z]), 'platformer');
  assert.equal(dreamRingEdge(dream, [x, 0.2, z]), null);
  dreamRingEdge(dream, [x + 30, 0.2, z]);
  assert.equal(dreamRingEdge(dream, [x, 0.2, z]), 'platformer');
  assert.equal(dreamRingEdge(dream, [x, 8, z]), null);
});
