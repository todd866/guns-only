import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld, addBox} from './physics/world.mjs';
import {createCar, carUp} from './physics/car.mjs';
import {createRace, stepRace} from './physics/race.mjs';
import {createPickups, stepPickups, pickItem, COMEBACK_ITEMS} from './physics/pickups.mjs';
import {createRCTelemetry} from './telemetry.mjs';
import {resultPanel} from './result-panel.mjs';
import {
  DIFFICULTY,
  KID_BEHIND_WEIGHTS,
  KID_MISSILE_SCALE,
  KID_RESULTS_KEY,
  LINE,
  RUBBER,
  assistStrength,
  bumperPlan,
  catchUpBoost,
  clearOfGate,
  difficultyFrom,
  kidFinishTitle,
  kidRaceLaps,
  lineAssistSteer,
  lineSample,
  nextOffSeconds,
  readKidResults,
  respawnDue,
  rubberRival,
  softenKidHit,
  trackZone,
  writeKidResult
} from './physics/kid-racing.mjs';

test('assist strength is zero on the line and rises faster the further off', () => {
  assert.equal(assistStrength(0), 0);
  assert.equal(assistStrength(LINE.dead), 0);
  assert.equal(assistStrength(LINE.full), 1);
  assert.equal(assistStrength(LINE.full + 4), 1);
  let prev = 0;
  for (let x = LINE.dead; x <= LINE.full + 1e-9; x += 0.2) {
    const s = assistStrength(x);
    assert.ok(s >= prev - 1e-12, `strength dipped at ${x}`);
    prev = s;
  }
  const mid = (LINE.dead + LINE.full) / 2;
  assert.ok(assistStrength(mid) < 0.5, 'the curve stays gentle near the line');
  assert.equal(lineAssistSteer(0.1), 0);
  assert.ok(lineAssistSteer(2) < 0, 'right of the line steers left');
  assert.ok(lineAssistSteer(-2) > 0, 'left of the line steers right');
  assert.ok(Math.abs(lineAssistSteer(LINE.full)) > Math.abs(lineAssistSteer(1)));
  assert.ok(Math.abs(lineAssistSteer(LINE.full)) <= LINE.maxSteer);
});

test('respawn waits until he has been fully off for more than 2 s', () => {
  assert.equal(respawnDue(0), false);
  assert.equal(respawnDue(2), false);
  assert.equal(respawnDue(2.01), true);
  assert.equal(nextOffSeconds(1.5, false, 0.5), 0);
  assert.equal(nextOffSeconds(1.9, true, 0.2), 2.1);
  assert.equal(trackZone(0, 2), 'on');
  assert.equal(trackZone(2.2, 2), 'edge');
  assert.equal(trackZone(8, 2), 'off');
});

test('edge bumpers redirect inward and keep forward speed, with no hop or roll', () => {
  const edge = bumperPlan({offset: 2.2, half: 2, along: 6, across: 3});
  assert.equal(edge.active, true);
  assert.ok(edge.across < 3, 'outward speed is bled off');
  assert.ok(edge.across < 0, 'the bumper pushes back onto the track');
  assert.ok(edge.along >= 2.4, 'a moving car is not stopped dead');
  assert.equal(edge.hop, 0);
  assert.equal(edge.roll, 0);
  const far = bumperPlan({offset: 10, half: 2, along: 4, across: 2});
  assert.equal(far.active, false);
  assert.equal(far.across, 2);
  const on = bumperPlan({offset: 0.2, half: 2, along: 5, across: 0});
  assert.equal(on.active, false);
});

test('rubber band eases leaders, never lets them lap him, and boosts him when behind', () => {
  const lap = 100;
  assert.equal(rubberRival(0, lap, 0.32), 1);
  assert.equal(rubberRival(RUBBER.easeFrom, lap, 0.32), 1);
  assert.ok(rubberRival(30, lap, DIFFICULTY.min) < rubberRival(30, lap, DIFFICULTY.max));
  assert.ok(rubberRival(30, lap, DIFFICULTY.max) < 1);
  assert.equal(rubberRival(lap, lap, DIFFICULTY.min), RUBBER.easeFloor);
  assert.equal(rubberRival(lap, lap, DIFFICULTY.max), RUBBER.easeFloor);
  assert.ok(rubberRival(-40, lap, DIFFICULTY.max) > 1);
  assert.ok(rubberRival(-40, lap, DIFFICULTY.max) <= RUBBER.pushCap);
  assert.ok(rubberRival(-40, lap, DIFFICULTY.max) >= rubberRival(-40, lap, DIFFICULTY.min));
  assert.equal(catchUpBoost(0, DIFFICULTY.min), 1);
  assert.ok(catchUpBoost(40, DIFFICULTY.min) > catchUpBoost(40, DIFFICULTY.max));
  assert.ok(catchUpBoost(40, DIFFICULTY.min) <= RUBBER.catchMax);
  assert.ok(catchUpBoost(40, DIFFICULTY.max) >= 1);
});

test('difficulty stays in bounds and follows his recent places', () => {
  assert.equal(difficultyFrom([]), DIFFICULTY.fresh);
  const hot = difficultyFrom([1, 1, 1, 1, 1, 1]);
  const cold = difficultyFrom([6, 6, 6, 6, 6, 6]);
  assert.ok(hot > DIFFICULTY.fresh);
  assert.ok(cold < DIFFICULTY.fresh);
  assert.ok(hot <= DIFFICULTY.max && cold >= DIFFICULTY.min);
  const store = new Map();
  const storage = {
    getItem: k => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v)
  };
  assert.deepEqual(writeKidResult(storage, 1), [1]);
  assert.deepEqual(writeKidResult(storage, 4), [1, 4]);
  assert.deepEqual(readKidResults(storage), [1, 4]);
  assert.equal(store.get(KID_RESULTS_KEY), '[1,4]');
  assert.deepEqual(readKidResults({getItem: () => '{'}), []);
});

test('kid races are two laps unless a length was chosen; sprints stay one', () => {
  assert.equal(kidRaceLaps(3, null, 'circuit'), 2);
  assert.equal(kidRaceLaps(1, null, 'circuit'), 1);
  assert.equal(kidRaceLaps(3, null, 'sprint'), 1);
  assert.equal(kidRaceLaps(3, 3, 'circuit'), 3);
  assert.equal(kidRaceLaps(1, 2, 'sprint'), 2);
});

test('finish lines cheer and never say he lost', () => {
  assert.equal(kidFinishTitle(1), 'YOU WON!');
  assert.equal(kidFinishTitle(2), '2nd place — so close!');
  assert.equal(kidFinishTitle(3), '3rd place — so close!');
  for (const place of [1, 2, 3, 4, 8, 11]) {
    const title = kidFinishTitle(place);
    assert.doesNotMatch(title, /\blose\b|\blost\b|\bfail\b/i);
  }
  assert.match(resultPanel({title: kidFinishTitle(1), stats: [], again: 'Again', cheer: true}), /YOU WON!/);
  assert.match(resultPanel({title: kidFinishTitle(2), stats: [], again: 'Again', cheer: true}), /confetti/);
  assert.doesNotMatch(resultPanel({title: 'Lap done!', stats: [], again: 'Again'}), /confetti/);
});

test('a kid hit keeps his speed and does not launch or flat-spin him', () => {
  const car = {vel: [0, 0, -8], ang: [0, 0, 0]};
  softenKidHit(car);
  assert.ok(Math.hypot(car.vel[0], car.vel[2]) > 6, 'most of his speed stays');
  assert.ok(car.vel[1] < 0.2, 'no launch');
  assert.ok(Math.abs(car.ang[1]) < 2, 'a wobble, not a spin off the track');
});

test('behind in kid mode, item odds favour a catch-up, and a homing shot at him is slower', () => {
  const comeback = ['zoom', 'pitbull', 'foxtwo'];
  const sum = Object.values(KID_BEHIND_WEIGHTS).reduce((a, b) => a + b, 0);
  const good = comeback.reduce((a, k) => a + KID_BEHIND_WEIGHTS[k], 0);
  assert.ok(good / sum >= 0.7, `comeback share ${good / sum}`);
  assert.ok(KID_MISSILE_SCALE < 1 && KID_MISSILE_SCALE >= 0.5);
  const cars = Array.from({length: 4}, (_, i) => createCar(undefined, [0, 0.13, i], 0));
  const pk = createPickups({pickups: [{pos: [0, 0.2, 0]}]}, 3);
  pk.order = cars;
  pk.kidOdds = true;
  let n = 0;
  for (let i = 0; i < 400; i++) if (COMEBACK_ITEMS.has(pickItem(pk, cars[1], true))) n++;
  assert.ok(n >= 280, `P2 kid draw ${n}/400 comeback`);
  for (let i = 0; i < 200; i++) {
    const item = pickItem(pk, cars[0], true);
    assert.notEqual(item, 'pitbull');
    assert.notEqual(item, 'zoom');
  }
  const world = createWorld();
  addBox(world, 0, 0, 80, 80, -1, 0);
  const fly = gentle => {
    const player = createCar(undefined, [0, 0.13, -20], 0);
    const rival = createCar(undefined, [0, 0.13, 0], 0);
    const box = createPickups({}, 1);
    box.kidGentle = gentle;
    box.playerCar = player;
    box.missiles.push({
      kind: 'foxtwo',
      pos: [0, 0.2, -1],
      dir: [0, 0, -1],
      owner: rival,
      target: player,
      life: 4,
      bounces: 3,
      retarget: 1
    });
    stepPickups(box, [player, rival], world, 0.4);
    return box.missiles[0].pos[2];
  };
  const kidZ = fly(true),
    bigZ = fly(false);
  assert.ok(kidZ > bigZ, `kid missile z ${kidZ} should travel less far than ${bigZ}`);
});

function straight() {
  const world = createWorld();
  addBox(world, 0, -20, 80, 80, -1, 0);
  return {
    world,
    laps: 2,
    start: {pos: [0, 0, 0], yaw: 0},
    checkpoints: [
      [0, 0, 'Start', 2],
      [0, -40, 'Finish', 2]
    ],
    ai: [
      {pos: [0, 0, 0], halfWidth: 2},
      {pos: [0, 0, -20], halfWidth: 2},
      {pos: [0, 0, -40], halfWidth: 2}
    ],
    secrets: []
  };
}

test('fully off for more than 2 s boings him onto the line ahead without taking a place', () => {
  const race = createRace(straight(), {mode: 'kid', opponents: 0, retreatCeremony: false});
  race.player.running = true;
  race.player.gate = 1;
  race.player.car.pos[0] = 14;
  race.player.car.pos[2] = -8;
  race.player.car.vel = [0, 0, 0];
  for (let i = 0; i < 240; i++) stepRace(race, {throttle: 0, steer: 0});
  assert.equal(
    race.kidFeed.some(e => e.type === 'respawn'),
    false,
    '2.0 s is not yet a respawn'
  );
  assert.ok(race.kidFeed.some(e => e.type === 'offtrack'));
  assert.ok(Math.abs(race.player.car.pos[0]) > 8, 'still off the line at 2 s');
  for (let i = 0; i < 30; i++) stepRace(race, {throttle: 0, steer: 0});
  assert.ok(race.kidFeed.some(e => e.type === 'respawn'));
  assert.ok(Math.abs(race.player.car.pos[0]) < 1.5, `back on the line x=${race.player.car.pos[0]}`);
  assert.ok(race.player.car.pos[2] < -8, 'placed ahead, not back at the gate');
  assert.equal(race.player.gate, 1);
  assert.equal(race.player.lap, 1);
  assert.equal(race.player.recoveries, 0);
  const sample = lineSample(race.line, 0, -8);
  const held = clearOfGate(race.line, sample, 10, [0, -14, 'soon', 2]);
  assert.ok(held.z > -14 && held.z < -8, `stops short of the gate (z ${held.z})`);
  assert.ok(Math.hypot(held.x, held.z + 14) > 2.4, 'respawn does not enter the next gate');
});

test('a kid car near the edge is steered back; Big Kid is not pulled or boinged', () => {
  const kid = createRace(straight(), {mode: 'kid', opponents: 0, retreatCeremony: false});
  kid.player.running = true;
  kid.player.gate = 1;
  kid.player.car.pos[0] = 2.3;
  kid.player.car.pos[2] = -8;
  kid.player.car.vel = [0, 0, -6];
  for (let i = 0; i < 40; i++) stepRace(kid, {throttle: 1, steer: 0});
  assert.ok(Math.abs(kid.player.car.pos[0]) < 2, `pulled toward the line, x=${kid.player.car.pos[0]}`);
  assert.ok(kid.player.car.forwardSpeed > 2, 'bumpers do not stop him');
  assert.ok(carUp(kid.player.car)[1] > 0.7, 'bumpers do not flip him');

  const big = createRace(straight(), {mode: 'bigKid', opponents: 0, retreatCeremony: false});
  big.player.running = true;
  big.player.car.pos[0] = 14;
  big.player.car.pos[2] = -8;
  big.player.car.vel = [0, 0, 0];
  for (let i = 0; i < 260; i++) stepRace(big, {throttle: 0, steer: 0});
  assert.equal(big.kidDifficulty, null);
  assert.equal(big.kidFeed, undefined);
  assert.ok(Math.abs(big.player.car.pos[0]) > 8, 'Big Kid stays where he drove');
});

test('wrong-way sets an arrow and a lap logs a place', () => {
  const race = createRace(straight(), {mode: 'kid', opponents: 0, retreatCeremony: false});
  race.player.running = true;
  race.player.gate = 1;
  race.player.car.pos[2] = -10;
  race.player.car.q = [0, 1, 0, 0];
  race.player.car.vel = [0, 0, 4];
  stepRace(race, {throttle: 1, steer: 0});
  assert.ok(race.kidArrow === 'left' || race.kidArrow === 'right');
  race.player.lap = 2;
  stepRace(race, {throttle: 1, steer: 0});
  assert.ok(race.kidFeed.some(e => e.type === 'lap_place' && e.lap === 1 && e.place >= 1));
});

test('offtrack, respawn and lap place reach telemetry', async () => {
  const rows = [];
  const t = createRCTelemetry({
    storage: {getItem: () => 'enabled'},
    locationObject: {hostname: 'guns-only.com', search: ''},
    outbox: {async put() { return null; }, async list() { return []; }, async remove() {}, async clear() {}},
    fetchImpl: async (_url, options) => {
      rows.push(...JSON.parse(options.body).rows);
      return {status: 200, ok: true};
    }
  });
  t.raceStart({kind: 'race', track: 'yard', mode: 'kid'});
  assert.equal(t.kidRace({type: 'offtrack', offset: 4.2}), true);
  assert.equal(t.kidRace({type: 'respawn', offset: 6}), true);
  assert.equal(t.kidRace({type: 'lap_place', lap: 1, place: 2}), true);
  assert.equal(t.kidRace({type: 'nope'}), false);
  await t.flush({force: true});
  assert.equal(rows.filter(r => r.code === 'offtrack').length, 1);
  assert.equal(rows.find(r => r.code === 'respawn').offset, 6);
  assert.equal(rows.find(r => r.code === 'lap_place').place, 2);
  assert.ok(rows.find(r => r.code === 'lap_place').race_id);
});
