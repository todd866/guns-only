import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../physics/world.mjs';
import { createCar, stepCar } from '../physics/car.mjs';
import { vehicleParams } from '../physics/vehicles.mjs';
import { HOT_WHEELS, trackQuads, boosterPoints, boost, guideCar, worldFrames, startPose, toWorld, loopEntry, stepLoop, trackFrames } from './hot-wheels.mjs';

function ride(kind = 'buggy', seconds = 12) {
  const w = createWorld(4);
  for (const q of trackQuads()) { w.addQuad(...q.v, 'concrete'); if (q.kind === 'rail') w.addQuad(q.v[0], q.v[3], q.v[2], q.v[1], 'concrete'); }
  const lake = 2000; w.addQuad([HOT_WHEELS.at[0] - lake, 0, HOT_WHEELS.at[2] - lake], [HOT_WHEELS.at[0] - lake, 0, HOT_WHEELS.at[2] + lake], [HOT_WHEELS.at[0] + lake, 0, HOT_WHEELS.at[2] + lake], [HOT_WHEELS.at[0] + lake, 0, HOT_WHEELS.at[2] - lake], 'concrete');
  const s = startPose(), car = createCar(vehicleParams(kind), s.pos, s.yaw), boosters = boosterPoints(), frames = worldFrames(), log = [];
  let loop = null;
  for (let i = 0; i < seconds * 120; i++) {
    if (!loop) loop = loopEntry(car);
    if (loop && !stepLoop(loop, car, 1 / 120)) loop = null;
    if (!loop) { car.vel = boost(boosters, car.pos, car.vel, 1 / 120); guideCar(frames, car, 1 / 120); stepCar(car, { throttle: 1 }, w, 1 / 120); }
    if (i % 6 === 0) log.push([...car.pos, Math.hypot(...car.vel)]);
  }
  return { car, log };
}

test('from the tower, full throttle: down the drop, boosted round the loop, and on along the track', () => {
  const { log } = ride();
  const loopTop = HOT_WHEELS.loopR * 2;
  const peak = Math.max(...log.slice(40).map(p => p[1]));
  assert.ok(peak > loopTop - .6, `reached the top of the loop: ${peak.toFixed(2)} of ${loopTop}`);
  const fastest = Math.max(...log.map(p => p[3]));
  assert.ok(fastest > 15, `boosters bring it up to speed: ${fastest.toFixed(1)} m/s`);
  // Past the loop, it must still be on the track, not dropped out of the loop onto the lake.
  const exit = toWorld([5 + 20 + 10 + 6, 0, HOT_WHEELS.width + .5]);
  const reached = log.some(p => Math.hypot(p[0] - exit[0], p[2] - exit[2]) < 2.5 && p[1] < 1.5);
  assert.ok(reached, 'came out of the loop on the exit straight');
  // And all the way round: the banked turn, the kicker, the jump and the landing ramp.
  const end = toWorld([0, 0, 0]), last = log.at(-1);
  assert.ok(log.some(p => p[2] < HOT_WHEELS.at[2] - 2 * HOT_WHEELS.bankR - 1 && p[0] > HOT_WHEELS.at[0] - 20), 'round the banked turn and back toward the tower'); void end;
  // The jump lands on the landing ramp, not out on the lake.
  const rampEnd = toWorld(trackFrames().at(-1).p);
  assert.ok(log.some(p => Math.hypot(p[0] - rampEnd[0], p[2] - rampEnd[2]) < 6 && p[1] < .8), `landed near the end of the track: last ${last.map(v => v.toFixed(1))}`);
});
