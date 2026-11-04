import test from 'node:test';
import assert from 'node:assert/strict';
import {createGolf, stepGolf, resetGolf, golfTee, GOLF_HOLES} from './open-world/golf.mjs';
import {createStream} from './open-world/stream.mjs';
import {eventCourse, EVENTS} from './open-world/catalog.mjs';
import {createSession, stepSession} from './physics/session.mjs';
import {placeCar, rideHeight, BUGGY} from './physics/car.mjs';

test('ordinary car inputs complete all six minigolf holes without setting the ball position', () => {
  const stream = createStream({manifest: {tiles: []}, fetchTile: () => {}}),
    g = createGolf(),
    course = eventCourse(EVENTS[0], stream.world);
  course.start = golfTee(g);
  const session = createSession(course, {mode: 'bigKid'});
  session.roam = true;
  let steps = 0;
  while (!g.done && steps++ < 120 * 180) {
    stepSession(
      session,
      {throttle: session.car.speed < 1.8 ? 0.3 : 0, brake: session.car.speed > 2},
      1 / 120
    );
    const event = stepGolf(g, session.car, 1 / 120);
    if (event?.tee) placeCar(session.car, [event.tee.pos[0], rideHeight(BUGGY), event.tee.pos[2]], 0);
    assert.ok(g.ball.every(Number.isFinite));
  }
  assert.ok(g.done, `hole ${g.hole}, ball ${g.ball}, car ${session.car.pos}`);
  assert.equal(g.scores.length, GOLF_HOLES.length);
  assert.ok(g.scores.every(n => n > 0));
  stream.dispose();
});

test('misses, resets and leaving the course never strand the player', () => {
  const g = createGolf(),
    t = GOLF_HOLES[0].tee,
    car = {pos: [t[0], 0.13, t[1] + 3], vel: [0, 0, -2]};
  assert.equal(g.strokes, 0);
  resetGolf(g);
  assert.equal(g.strokes, 1);
  // The lane's brick edges keep the ball in play: knocked hard sideways, it bounces back inside the lane.
  g.velocity = [30, 0];
  for (let i = 0; i < 120; i++) stepGolf(g, car, 1 / 120);
  assert.ok(Math.abs(g.ball[0] - t[0]) < 3, `ball stays in the lane: ${g.ball}`);
  resetGolf(g);
  assert.equal(g.strokes, 2);
  assert.deepEqual(g.ball, t);
  car.pos = [0, 0, 0];
  assert.ok(stepGolf(g, car, 1 / 120).cancelled);
});

test('a stationary car cannot invent strokes or score a hole without playing', () => {
  const g = createGolf(),
    t = GOLF_HOLES[0].tee,
    car = {pos: [t[0], 0.13, t[1] + 0.6], vel: [0, 0, 0]};
  for (let i = 0; i < 120; i++) stepGolf(g, car, 1 / 120);
  assert.equal(g.strokes, 0);
  assert.equal(g.sinking, 0);
});
