import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import {createWorld} from '../physics/world.mjs';
import {createRace, driveInput, stepRace} from '../physics/race.mjs';
import {createAlienWorld} from './alien-world.js';
import {ALIEN_EVENTS} from './alien-world.mjs';

const courseFor = (event, world) => {
  const points = event.points;
  const checkpoints = points.map(([x, z], i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[i === points.length - 1 ? 0 : i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [
      x,
      z,
      i === points.length - 1 ? 'Finish' : `Gate ${i + 1}`,
      event.half,
      [(b[0] - a[0]) / d, (b[1] - a[1]) / d]
    ];
  });
  const ai = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
    for (let j = 0; j < n; j++)
      ai.push({
        pos: [a[0] + ((b[0] - a[0]) * j) / n, a[2] + ((b[2] - a[2]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n],
        halfWidth: event.half
      });
  }
  const first = points[0],
    next = points[1];
  return {
    world,
    event,
    checkpoints,
    ai,
    start: {pos: [first[0], first[2], first[1]], yaw: Math.atan2(next[0] - first[0], -(next[1] - first[1]))},
    secrets: [],
    coins: []
  };
};

test('alien courses have separated authored routes and a visible hub', () => {
  const scene = new T.Scene(),
    world = createWorld(),
    alien = createAlienWorld(scene, world);
  assert.equal(alien.events.length, 3);
  assert.deepEqual(
    alien.events.map(e => e.id),
    ['lunar-paddock', 'comet-quarry', 'gravity-garden']
  );
  assert.ok(world.tris.length > 30, 'hub roads and course surfaces are collidable');
  assert.equal(
    world.raycast([10000, 1, 200], [0, -1, 0], 2)?.surface,
    'asphalt',
    'alien hub has a drivable collision surface'
  );
  for (const event of alien.events) {
    assert.ok(event.points.every(([, , y]) => y >= 0 && y <= 18));
    for (let i = 1; i < event.points.length; i++) {
      const a = event.points[i - 1],
        b = event.points[i];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      assert.equal(world.raycast([mid[0], mid[2] + 3, mid[1]], [0, -1, 0], 5)?.surface, 'asphalt');
    }
  }
  alien.dispose();
  assert.equal(scene.children.length, 0);
});

test('all three alien courses finish three laps with the real driver', () => {
  for (const event of ALIEN_EVENTS) {
    const scene = new T.Scene(),
      world = createWorld();
    const alien = createAlienWorld(scene, world),
      course = {...courseFor(event, world), laps: 3};
    const race = createRace(course, {mode: 'bigKid', opponents: 0}),
      pilot = {session: race.player, skill: 0.9, node: 0};
    race.retreat.at = Infinity;
    let steps = 0;
    while (!race.player.finished && steps++ < 120 * 600) stepRace(race, driveInput(race, pilot), 1 / 120);
    assert.ok(
      race.player.finished,
      `${event.id} did not finish: gate ${race.player.gate}, lap ${race.player.lap}, recoveries ${race.player.recoveries}`
    );
    assert.equal(race.player.recoveries, 0, `${event.id} required recovery`);
    alien.dispose();
  }
});
