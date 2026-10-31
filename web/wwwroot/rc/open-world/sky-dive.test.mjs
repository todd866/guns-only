import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  SKY_JUMPS,
  skyStars,
  createSkyDive,
  startSkyDive,
  stepSkyDive,
  skyJumpNear,
  recordSkyDive,
  skyLandingText,
  skyDiveCamera
} from './sky-dive.mjs';
import {createFlight, stepFlight, FLIGHT} from '../physics/flight.mjs';
import {createCar, BUGGY, carYaw} from '../physics/car.mjs';
import {dot, norm, sub} from '../physics/math.mjs';
import {flightInput} from '../driving-input.mjs';
import {createStream} from './stream.mjs';
import {elevationAt} from './elevation.mjs';
import {loadProgress, saveProgress, locationById, canEnter, canVisit} from './catalog.mjs';
import {bodyAt} from '../physics/water.mjs';
import {Scene} from '../../vendor/three.module.js';
import {createSkyDiveVisual} from './sky-dive.js';

test('gold, white, blue and a friendly miss, including exact ring edges', () => {
  for (const [m, stars] of [
    [0, 3],
    [4, 3],
    [4.01, 2],
    [10, 2],
    [10.01, 1],
    [20, 1],
    [20.01, 0],
    [NaN, 0],
    [-1, 0]
  ])
    assert.equal(skyStars(m), stars);
  assert.equal(skyLandingText({stars: 3, metres: 0}), '🎯 Bullseye! ⭐⭐⭐');
  assert.equal(skyLandingText({stars: 0, metres: 30.2}), '🪂 Nice jump! 30 m from the middle');
});

const flatRun = () => {
  const state = createSkyDive(),
    flight = createFlight(),
    car = createCar(BUGGY),
    jump = SKY_JUMPS[1];
  assert.ok(startSkyDive(state, jump, flight, car, () => 0));
  return {state, flight, car, jump};
};
test('a jump opens the chute, clears stale retro state and cannot restart in the air or in a race', () => {
  const {state, flight, car, jump} = flatRun();
  assert.equal(flight.mode, 'chute');
  assert.equal(car.pos[1], 120);
  assert.equal(
    startSkyDive(state, jump, flight, car, () => 0),
    false
  );
  const fresh = createSkyDive();
  flight.mode = null;
  assert.equal(
    startSkyDive(fresh, jump, flight, car, () => 0, {roam: false}),
    false
  );
  flight.retro = true;
  assert.ok(startSkyDive(fresh, SKY_JUMPS[2], flight, car, () => 0));
  assert.equal(car.pos[1], 600);
  assert.equal(flight.retro, false);
});
test('only touchdown ends a run with a score; recovery, cancellation and duplicate steps do not count', () => {
  const {state, flight, car, jump} = flatRun();
  assert.equal(stepSkyDive(state, flight, car), null);
  flight.mode = null; // Recover clears the mode without a physics touchdown.
  assert.equal(stepSkyDive(state, flight, car), null);
  assert.equal(state.active, null);
  assert.ok(startSkyDive(state, jump, flight, car, () => 0));
  car.pos = [jump.target[0] + 30, 0.2, jump.target[1]];
  flight.mode = null;
  flight.landings++;
  const report = stepSkyDive(state, flight, car);
  assert.equal(report.stars, 0);
  assert.equal(report.metres, 30);
  assert.equal(stepSkyDive(state, flight, car), null);
  const progress = loadProgress();
  recordSkyDive(progress, report);
  recordSkyDive(progress, {...report, metres: 0, stars: 3});
  recordSkyDive(progress, report);
  assert.equal(progress.skyJumps, 3);
  assert.equal(progress.bestLanding, 0);
});
test('left and right keys turn the canopy in opposite directions at 0.6 rad/s', () => {
  for (const [key, sign] of [
    ['ArrowLeft', -1],
    ['ArrowRight', 1]
  ]) {
    const flight = createFlight(),
      car = createCar(BUGGY, [0, 100, 0]);
    flight.mode = 'chute';
    for (let i = 0; i < 120; i++) stepFlight(flight, car, flightInput(new Set([key])), null, 1 / 120);
    assert.ok(Math.abs(carYaw(car) - sign * FLIGHT.chuteTurn) < 0.01);
    assert.ok(car.pos[0] * sign > 0.1);
    assert.ok(car.pos[2] < -1);
  }
});

const get = async name =>
  JSON.parse(await readFile(new URL(`../assets/world/${name}`, import.meta.url), 'utf8'));
const elevation = await get('playable-terrain.json'),
  manifest = await get('manifest.json');
const heightAt = (x, z) => elevationAt(elevation, x, z);
for (const jump of SKY_JUMPS) {
  test(`${jump.name}: drive-on pad, dry rings and a scripted wrong turn corrected to within 10 m`, async () => {
    const stream = createStream({
      manifest,
      elevation,
      fetchTile: key => get(`tile-${key.replace(',', '-')}.json`)
    });
    const visual = createSkyDiveVisual(new Scene(), stream.world, heightAt);
    try {
      const pad = [jump.pad[0], heightAt(...jump.pad) + 0.2, jump.pad[1]];
      await stream.update(pad);
      assert.ok(stream.ready([jump.launch[0], 0, jump.launch[1]]));
      assert.equal(skyJumpNear(pad, heightAt), jump);
      assert.equal(skyJumpNear([pad[0], pad[1] + 10, pad[2]], heightAt), null);
      assert.equal(skyJumpNear([pad[0] + 8, pad[1], pad[2]], heightAt), null);
      for (let dx = -20; dx <= 20; dx += 4)
        for (let dz = -20; dz <= 20; dz += 4)
          assert.equal(bodyAt(jump.target[0] + dx, jump.target[1] + dz), null, 'dry target');
      const state = createSkyDive(),
        flight = createFlight(),
        car = createCar(BUGGY, pad);
      assert.ok(startSkyDive(state, jump, flight, car, heightAt));
      const view = skyDiveCamera(car.pos, carYaw(car)),
        toRings = norm(sub([jump.target[0], heightAt(...jump.target), jump.target[1]], view.eye)),
        aim = norm(sub(view.look, view.eye));
      assert.ok(Math.acos(dot(toRings, aim)) < Math.PI / 6, 'rings in the 60 degree camera view');
      let report,
        maxSteer = 0;
      for (let i = 0; i < 150 * 120 && !report; i++) {
        const want = Math.atan2(jump.target[0] - car.pos[0], -(jump.target[1] - car.pos[2])),
          error = Math.atan2(Math.sin(want - carYaw(car)), Math.cos(want - carYaw(car))),
          steer = i < 100 ? -1 : Math.max(-1, Math.min(1, error * 2));
        maxSteer = Math.max(maxSteer, steer);
        stepFlight(flight, car, {steer}, stream.world, 1 / 120);
        report = stepSkyDive(state, flight, car);
      }
      assert.ok(maxSteer > 0.1, 'corrected the wrong turn');
      assert.ok(report, 'landed');
      assert.ok(report.metres <= 10, `${report.metres.toFixed(2)} m from the middle`);
      assert.equal(flight.mode, null);
      assert.ok(flight.retros > 0, 'retro thrusters softened the landing');
      assert.equal(stepSkyDive(state, flight, car), null);
      console.log(`${jump.name}: ${report.metres.toFixed(2)} m, ${report.stars} stars`);
      // A child who leaves the keys alone still lands in the rings (a star), never the gold: steering
      // is the game. Both sides of the alternating off-line start.
      for (let n = 0; n < 2; n++) {
        assert.ok(startSkyDive(state, jump, flight, car, heightAt));
        let handsOff;
        for (let i = 0; i < 120 * 120 && !handsOff; i++) {
          stepFlight(flight, car, {}, stream.world, 1 / 120);
          handsOff = stepSkyDive(state, flight, car);
        }
        assert.ok(
          handsOff && handsOff.metres > 4 && handsOff.metres <= 20,
          `hands off: ${handsOff?.metres ?? 'no landing'} m`
        );
      }
    } finally {
      visual.dispose();
      stream.dispose();
    }
  });
}
test('places are always available and saved stats validate and round-trip', () => {
  let stored;
  const storage = {
    getItem: () => stored,
    setItem: (key, value) => {
      stored = value;
    }
  };
  const progress = loadProgress(storage);
  // The summit pad is found by climbing, so it is the one jump not listed in Places.
  assert.equal(locationById('mountain-jump'), undefined);
  for (const jump of SKY_JUMPS.filter(j => j.place !== false)) {
    const p = locationById(jump.id);
    assert.equal(p.kind, 'activity');
    assert.equal(p.game, 'sky-dive');
    assert.ok(canEnter(progress, p) && canVisit(progress, p));
  }
  recordSkyDive(progress, {metres: 2.4});
  saveProgress(storage, progress);
  assert.equal(loadProgress(storage).skyJumps, 1);
  assert.equal(loadProgress(storage).bestLanding, 2.4);
  for (const bad of [-1, '3', null, 1e99]) {
    stored = JSON.stringify({skyJumps: bad, bestLanding: -1});
    assert.equal(loadProgress(storage).skyJumps, 0);
    assert.equal(loadProgress(storage).bestLanding, null);
  }
  stored = '{bad';
  assert.equal(loadProgress(storage).skyJumps, 0);
});
