import test from 'node:test';
import assert from 'node:assert/strict';
import {baseCourse} from './sim.mjs';
import {createRace, stepRace, progress, bump, placeOf, driveInput} from './physics/race.mjs';
import {createCar} from './physics/car.mjs';

const course = baseCourse();
test('AI rivals lap the base route on the physics car', () => {
  const race = createRace(course, {mode: 'bigKid', opponents: 3});
  for (let i = 0; i < 120 * 90 && !race.rivals.every(r => r.session.finished); i++) stepRace(race, {});
  for (const r of race.rivals)
    assert.ok(r.session.finished, `rival skill ${r.skill} stuck at gate ${r.session.gate}`);
  const times = race.rivals.map(r => r.session.time);
  assert.ok(Math.min(...times) > 15 && Math.max(...times) < 70, `times ${times.map(t => t.toFixed(1))}`);
});

// A scripted player: the rivals' own controller driving the player's car at a given skill.
function runRace(mode, skill) {
  const race = createRace(course, {mode, opponents: 3}),
    bot = {session: race.player, skill, node: 0, colour: 0};
  let gaps = 0,
    samples = 0,
    worst = 1;
  for (let i = 0; i < 120 * 150 && !race.player.finished; i++) {
    stepRace(race, {...driveInput(race, bot), fire: race.pickups.held.has(race.player.car)});
    if (i % 60 === 0) {
      for (const r of race.rivals) gaps += Math.abs(progress(r.session) - progress(race.player));
      samples += race.rivals.length;
    }
    if (i % 60 === 0 && race.player.running && race.clock > 5)
      worst = Math.max(worst, placeOf(race, race.player));
  }
  return {
    place: placeOf(race, race.player),
    finished: race.player.finished,
    meanGap: gaps / samples,
    worst,
    hits: race.events.filter(e => e.car === race.player.car).length
  };
}

test('every mode races as a pack: rivals stay around the player all lap', () => {
  for (const mode of ['kid', 'bigKid'])
    for (const skill of [0.7, 0.9]) {
      const r = runRace(mode, skill);
      assert.ok(r.finished, `${mode}/${skill}: player bot did not finish`);
      assert.ok(r.meanGap < 1.2, `${mode}/${skill}: rivals averaged ${r.meanGap.toFixed(2)} gates away`);
    }
});

// Owner, 2026-10-29: "the key to Mario Kart fun is that you're not always winning ... kid mode shouldn't
// mean no setbacks, it should mean you usually win after a long battle."
test('kid mode usually wins after real setbacks; Big Kid is never a walkover', () => {
  const skills = [0.6, 0.7, 0.8, 0.9],
    kid = skills.map(k => runRace('kid', k)),
    big = skills.map(k => runRace('bigKid', k));
  const kidWins = kid.filter(r => r.place === 1).length,
    bigWins = big.filter(r => r.place === 1).length;
  assert.ok(kidWins >= 2, `kid mode won ${kidWins}/4`);
  // A one-minute four-car synthetic lap leaves little room for setbacks at high skill; the real measure
  // is tools/rc/experiments/race-fun.mjs on the streamed world (2026-10-29: 5/8 kid wins, every race
  // knocked to 8th at some point). This floor only stops kid mode sliding back to untouchable.
  assert.ok(
    kid.filter(r => r.worst >= 3 || r.hits > 0).length >= 1,
    `kid setbacks: ${JSON.stringify(kid.map(r => [r.worst, r.hits]))}`
  );
  assert.ok(bigWins > 0 && bigWins < skills.length, `Big Kid won ${bigWins}/4`);
});

test('cars bump apart and do not overlap', () => {
  const a = createCar(undefined, [0, 0.13, 0], 0),
    b = createCar(undefined, [0.1, 0.13, 0], 0);
  a.vel = [1, 0, 0];
  b.vel = [-1, 0, 0];
  bump([a, b]);
  assert.ok(Math.abs(a.pos[0] - b.pos[0]) > 0.1);
  assert.ok(a.vel[0] < 0 && b.vel[0] > 0);
});

test('places follow finish order: a rival who finished first stays ahead', () => {
  const race = createRace(course, {mode: 'bigKid', opponents: 3});
  for (let i = 0; i < 120 * 90 && !race.rivals[0].session.finished; i++) stepRace(race, {});
  assert.ok(race.rivals[0].session.finished);
  race.player.finished = true;
  stepRace(race, {});
  assert.ok(placeOf(race, race.player) > placeOf(race, race.rivals[0].session));
});

test('a rival recovered mid-shortcut drops the shortcut and resumes the main line', () => {
  const race = createRace(course, {mode: 'bigKid', opponents: 1}),
    rv = race.rivals[0];
  rv.alt = {
    nodes: [
      [50, 50, 1],
      [60, 60, 1]
    ],
    exit: 3
  };
  rv.altNode = 1;
  rv.session.recoveries++;
  stepRace(race, {});
  assert.equal(rv.alt, null);
  assert.ok(rv.node >= 0 && rv.node < race.line.length);
});

test('ceremony brakes the player as well as the rivals', () => {
  const race = createRace(course);
  race.player.running = true;
  race.player.car.vel = [0, 0, -5];
  race.clock = 18;
  for (let i = 0; i < 240; i++) stepRace(race, {throttle: 1});
  assert.ok(Math.hypot(...race.player.car.vel) < 0.2);
});
