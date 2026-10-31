import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {createBowling, stepBowling, nextDelivery, BOWLING_TEE} from './open-world/bowling.mjs';
import {createStream} from './open-world/stream.mjs';
import {buildLandmarks} from './open-world/landmarks.js';
import {eventCourse, EVENTS} from './open-world/catalog.mjs';
import {createSession, stepSession} from './physics/session.mjs';
import {placeCar, rideHeight, BUGGY} from './physics/car.mjs';
const data = name => JSON.parse(fs.readFileSync(new URL('./assets/world/' + name, import.meta.url)));
test('two-delivery bowling plays through using real car inputs and source collision', async () => {
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}, set: () => true})})
  };
  const stream = createStream({
    manifest: data('manifest.json'),
    fetchTile: async key => data('tile-' + key.replace(',', '-') + '.json')
  });
  try {
    await stream.update(BOWLING_TEE.pos);
    buildLandmarks(new T.Scene(), stream.world);
    const course = eventCourse(EVENTS[0], stream.world);
    course.start = BOWLING_TEE;
    const s = createSession(course, {mode: 'bigKid'});
    s.roam = true;
    const game = createBowling();
    let steps = 0;
    while (!game.done && steps++ < 120 * 40) {
      stepSession(s, {throttle: s.car.pos[2] > 1232 ? 1 : 0, brake: s.car.pos[2] <= 1232}, 1 / 120);
      const e = stepBowling(game, s.car, 1 / 120);
      if (e?.tee) placeCar(s.car, [e.tee.pos[0], rideHeight(BUGGY), e.tee.pos[2]], 0);
    }
    assert.ok(game.done, `car ${s.car.pos}, score ${game.score}`);
    assert.ok(game.score > 0 && game.score <= 10);
    assert.equal(game.score, game.pins.filter(p => p.down).length);
  } finally {
    stream.dispose();
    globalThis.document = old;
  }
});
test('idle pins do not score, deliveries are limited, and leaving cancels', () => {
  const g = createBowling(),
    car = {pos: [-1020, 0.13, 1258], vel: [0, 0, 0]};
  for (let i = 0; i < 120; i++) stepBowling(g, car, 1 / 120);
  assert.equal(g.score, 0);
  assert.equal(g.done, false);
  assert.equal(nextDelivery(g), BOWLING_TEE);
  assert.equal(g.delivery, 2);
  assert.equal(nextDelivery(g), null);
  assert.ok(g.done);
  assert.ok(stepBowling(createBowling(), {pos: [0, 0, 0], vel: [0, 0, 0]}, 1 / 120).cancelled);
});
