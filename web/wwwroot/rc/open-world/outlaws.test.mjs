import test from 'node:test';
import assert from 'node:assert/strict';
import {createGang, stepGang, stunOutlaw, TOWN_CENTRE, OUTLAW_POSTS, OUTLAWS} from './outlaws.mjs';
import {valleyFrame, MOUNTAIN} from './spirit-mountain.mjs';

const ground = () => MOUNTAIN.lake.floor;

test('the gang stands on the old lake floor, along the main street', () => {
  for (const p of OUTLAW_POSTS) {
    const f = valleyFrame(p[0], p[2]);
    assert.ok(f.along > 540 && f.along < 620 && Math.abs(f.across) < 8, `${f.along} ${f.across}`);
  }
});

test('only in the past, and only in town', () => {
  const g = createGang();
  assert.deepEqual(stepGang(g, {era: 'present', pos: TOWN_CENTRE, riding: true, speed: 9}), []);
  assert.deepEqual(stepGang(g, {era: 'past', pos: [0, 0, 0], riding: true, speed: 9}), []);
});

test('riding the dinosaur through them pops them apart; standing still does not', () => {
  const g = createGang(),
    e = g.enemies[0];
  assert.equal(
    stepGang(g, {era: 'past', pos: [...e.pos], riding: true, speed: 0, groundAt: ground}).filter(v => v.stomp)
      .length,
    0
  );
  const ev = stepGang(g, {era: 'past', pos: [...e.pos], riding: true, speed: 6, groundAt: ground});
  assert.ok(ev.some(v => v.stomp === e.id));
  assert.equal(e.alive, false);
});

test('they come at the dinosaur when it is near', () => {
  const g = createGang(),
    e = g.enemies[0],
    start = [...e.pos],
    me = [e.pos[0] + 6, 8, e.pos[2]];
  for (let i = 0; i < 60; i++)
    stepGang(g, {era: 'past', pos: me, riding: true, speed: 0, groundAt: ground, dt: 1 / 60});
  assert.ok(Math.hypot(me[0] - e.pos[0], me[2] - e.pos[2]) < Math.hypot(me[0] - start[0], me[2] - start[2]));
});

test('clearing the street says so once, and the gang regroups only if it was not cleared', () => {
  const g = createGang();
  let cleared = 0;
  for (const e of g.enemies)
    cleared += stepGang(g, {era: 'past', pos: [...e.pos], riding: true, speed: 6, groundAt: ground}).filter(
      v => v.cleared
    ).length;
  assert.equal(cleared, 1);
  stepGang(g, {era: 'present', pos: [0, 0, 0]});
  assert.ok(
    g.enemies.every(e => !e.alive),
    'a cleared street stays clear'
  );
  const h = createGang();
  stepGang(h, {era: 'past', pos: [...h.enemies[0].pos], riding: true, speed: 6, groundAt: ground});
  stepGang(h, {era: 'present', pos: [0, 0, 0]});
  assert.ok(
    h.enemies.every(e => e.alive),
    'an unfinished fight starts over next visit'
  );
});

test('on foot it is a real fight: a knockout sends the cowboy back up the street', () => {
  const g = createGang(),
    e = g.enemies[0],
    robot = {pos: [e.pos[0] + 0.2, 8, e.pos[2]], vel: [0, 0, 0], yaw: 0};
  let home = null;
  for (let i = 0; i < 120 * 60 && !home; i++)
    for (const v of stepGang(g, {
      era: 'past',
      pos: robot.pos,
      robot,
      input: {},
      mode: 'kid',
      groundAt: ground,
      dt: 1 / 120
    }))
      if (v.home) home = v.home;
  assert.ok(home, 'standing still among them, the cowboy gets knocked out');
  assert.deepEqual(home, OUTLAWS.home);
  assert.equal(g.fighter.batteries, g.fighter.max);
});

test('a stunned outlaw stops chasing and is looted, not stomped', () => {
  const g = createGang(),
    e = g.enemies[0],
    me = [e.pos[0] + 2, 8, e.pos[2]];
  assert.equal(stunOutlaw(e), true);
  const x = e.pos[0];
  stepGang(g, {era: 'past', pos: me, riding: true, speed: 0, groundAt: ground, dt: 0.5});
  assert.equal(e.pos[0], x);
  assert.equal(e.stunned, 3.5);
  stepGang(g, {era: 'past', pos: [...e.pos], riding: true, speed: 6, groundAt: ground, dt: 0.1});
  assert.equal(e.alive, true, 'a stunned toy is looted, not stomped; it winds back up later');
  assert.equal(e.stunned, 3.4);
});

test('outlaws stay frozen after dismounting, then recover and fight again', () => {
  const g = createGang(),
    e = g.enemies[0],
    pos = [...e.pos],
    robot = {pos: [e.pos[0] + 0.2, e.pos[1], e.pos[2]], vel: [0, 0, 0], yaw: 0};
  g.enemies = [e];
  stunOutlaw(e);
  for (let i = 0; i < 39; i++)
    assert.deepEqual(stepGang(g, {era: 'past', pos: robot.pos, robot, dt: 0.1}), []);
  assert.deepEqual(e.pos, pos);
  assert.equal(e.alive, true);
  assert.equal(g.fighter.batteries, g.fighter.max);
  assert.equal(e.state, 'stunned');
  stepGang(g, {era: 'past', pos: [0, 0, 0], dt: 0.2});
  assert.equal(e.state, 'idle', 'recovery restores the walking pose even outside town');
  let hurt = false;
  for (let i = 0; i < 30; i++)
    hurt ||= stepGang(g, {era: 'past', pos: robot.pos, robot, dt: 0.1}).some(v => v.hurt);
  assert.equal(e.stunned, 0);
  assert.equal(hurt, true);
});

test('refreshing a stun preserves loot state, while a new stun resets it', () => {
  const e = createGang().enemies[0];
  stunOutlaw(e);
  e.stunLooted = true;
  stunOutlaw(e, 2);
  assert.equal(e.stunLooted, true);
  e.stunned = 0;
  stunOutlaw(e, 2);
  assert.equal(e.stunLooted, false);
});
