import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import {createWorld} from '../physics/world.mjs';
import {createRace, driveInput, stepRace} from '../physics/race.mjs';
import {createPortal} from './portal.js';
import {PORTAL_EVENT} from './portal-course.mjs';
import {createPortalTransition, portalTransition} from './portal-transition.mjs';

test('portal transition requires unlock input and latches through cooldown', () => {
  let state = {};
  let result = portalTransition(state, [2530, 0, -1200], false, 0);
  assert.equal(result.transition, null);
  state = result.state;
  result = portalTransition(state, [2530, 0, -1200], true, 0.1);
  assert.deepEqual(result.transition, {from: 'base', to: 'alien', position: [10000, 0, 212]});
  state = result.state;
  result = portalTransition(state, [2530, 0, -1200], true, 0.2);
  assert.equal(result.transition, null);
  result = portalTransition(state, [2530, 0, -1200], true, 1.4);
  assert.equal(result.transition, null, 'still latched until the car leaves the mouth');
  result = portalTransition(state, [2540, 0, -1200], false, 1.5);
  assert.equal(result.state.latch, null);
});

test('both portal directions return exact destinations', () => {
  const transition = createPortalTransition();
  assert.deepEqual(transition.step([10000, 0, 200], true, 2), {
    from: 'alien',
    to: 'base',
    position: [2530, 0, -1188]
  });
  transition.step([10020, 0, 200], false, 2.1);
  assert.deepEqual(transition.step([2530, 0, -1200], true, 4), {
    from: 'base',
    to: 'alien',
    position: [10000, 0, 212]
  });
});

test('portal mouths cannot be triggered from a high ramp or airborne shortcut', () => {
  const result = portalTransition({}, [2530, 6, -1200], true, 1);
  assert.equal(result.transition, null);
});

test('Night Wave completes three laps on its authored elevated collision road', () => {
  const world = createWorld(),
    scene = new T.Scene(),
    portal = createPortal(scene, world);
  const points = PORTAL_EVENT.points,
    checkpoints = points.map((p, i) => [
      p[0],
      p[1],
      i === points.length - 1 ? 'Finish' : `Gate ${i + 1}`,
      PORTAL_EVENT.half
    ]);
  const ai = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
    for (let j = 0; j < n; j++)
      ai.push({
        pos: [a[0] + ((b[0] - a[0]) * j) / n, a[2] + ((b[2] - a[2]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n],
        halfWidth: PORTAL_EVENT.half
      });
  }
  const first = points[0],
    next = points[1];
  const course = {
    world,
    event: PORTAL_EVENT,
    checkpoints,
    ai,
    laps: 3,
    secrets: [],
    coins: [],
    start: {pos: [first[0], first[2], first[1]], yaw: Math.atan2(next[0] - first[0], -(next[1] - first[1]))}
  };
  const race = createRace(course, {mode: 'bigKid', opponents: 0}),
    pilot = {session: race.player, skill: 0.9, node: 0};
  race.retreat.at = Infinity;
  for (let steps = 0; !race.player.finished && steps < 120 * 600; steps++)
    stepRace(race, driveInput(race, pilot), 1 / 120);
  assert.equal(race.player.finished, true);
  assert.equal(race.player.recoveries, 0);
  portal.dispose();
});

test('locked progression keeps the remote alien portal visuals hidden', () => {
  const scene = new T.Scene(),
    world = createWorld();
  let unlocked = false;
  const portal = createPortal(scene, world, () => unlocked);
  portal.update(0, [10000, 0, 200]);
  assert.equal(portal.root.visible, false);
  portal.update(0, [2530, 0, -1200]);
  assert.equal(portal.root.visible, false);
  unlocked = true;
  portal.update(0, [2530, 0, -1200]);
  assert.equal(portal.root.visible, true);
  portal.update(0, [10000, 0, 200]);
  assert.equal(portal.root.visible, true);
  portal.dispose();
});
