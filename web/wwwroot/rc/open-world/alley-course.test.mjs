import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {EVENTS, eventById, eventCourse, eventLaps, locationById, loadProgress} from './catalog.mjs';
import {
  ALLEY_RACE_POINTS,
  RACE_LANES,
  LANES,
  DOORS,
  PINSETTER_Z,
  BALL_RETURN_Z,
  SNACK_COUNTER,
  insideAlley
} from './bowling-alley.mjs';
import {buildBowlingAlley} from './bowling-alley.js';
import {createBowlingVisual} from './bowling.js';
import {createBowling} from './bowling.mjs';
import {createStream} from './stream.mjs';
import {buildLandmarks} from './landmarks.js';
import {buildActivities} from './activities.js';
import {loadOpenWorld} from './runtime.js';
import {createRace, driveInput, stepRace} from '../physics/race.mjs';
import {raceIsAvailable} from '../race-menu.js';

const event = eventById('alley-cat');
const data = name => JSON.parse(fs.readFileSync(new URL('../assets/world/' + name, import.meta.url)));
const canvas = () => ({getContext: () => new Proxy({}, {get: () => () => {}, set: () => true})});

test('Alley Cat headlines recreation; both races remain public secondary-menu choices', () => {
  assert.equal(locationById('rec').event, 'alley-cat');
  assert.equal(event.name, 'Alley Cat');
  assert.equal(event.kind, 'circuit');
  assert.equal(event.night, true);
  assert.equal(event.surface, 'gymfloor');
  assert.deepEqual(event.medals, [20, 28, 40]);
  const choices = EVENTS.filter(e => e.location === 'rec' && raceIsAvailable(loadProgress(), e));
  // Order-free: Alley Cat sits last in EVENTS (see catalog.mjs), not beside Rink Drift.
  assert.deepEqual(choices.map(e => e.id).sort(), ['alley-cat', 'rink-drift']);
  const rink = choices.find(e => e.id === 'rink-drift');
  assert.deepEqual(rink.points[0], [-940, 1260]);
  assert.equal(rink.half, 4);
  assert.deepEqual(rink.medals, [20, 28, 40]);
  assert.deepEqual(ALLEY_RACE_POINTS.at(-1), ALLEY_RACE_POINTS[0]);
});

test('race line clears solid walls, uses both doors and lanes, and crosses the return ramps', () => {
  const stream = createStream({manifest: {tiles: []}, fetchTile() {}}),
    alley = buildBowlingAlley(new T.Scene(), stream.world);
  try {
    for (let i = 1; i < ALLEY_RACE_POINTS.length; i++) {
      const a = ALLEY_RACE_POINTS[i - 1],
        b = ALLEY_RACE_POINTS[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const hit = stream.world.raycast(
        [a[0], 0.32, a[1]],
        [(b[0] - a[0]) / length, 0, (b[1] - a[1]) / length],
        length
      );
      assert.equal(hit, null, `solid wall across segment ${i}`);
      for (let t = 0; t <= length; t += 0.2) {
        const x = a[0] + ((b[0] - a[0]) * t) / length,
          z = a[1] + ((b[1] - a[1]) * t) / length;
        // Above the small return ramps, a car-sized sweep catches corners that
        // a centre-line ray alone would miss (including the stepped perimeter).
        assert.equal(stream.world.sphereContacts([x, 0.46, z], 0.22).length, 0, `car clearance ${i}`);
        if (z < DOORS[0].center[1] && x < DOORS[1].center[0])
          assert.ok(insideAlley([x, 0.46, z]), `indoor segment ${i} escaped the mapped shell`);
      }
    }
    for (const id of RACE_LANES) {
      const lane = LANES[id - 1];
      assert.ok(ALLEY_RACE_POINTS.some(([x, z]) => x === lane.x && z === lane.headZ));
      for (const dir of [-1, 1]) {
        const z = PINSETTER_Z - dir;
        assert.equal(stream.world.raycast([lane.x, 0.32, z], [0, 0, dir], 2), null);
        for (let t = 0; t <= 2; t += 0.1)
          assert.equal(
            stream.world.sphereContacts([lane.x, 0.32, z + dir * t], 0.22).length,
            0,
            `lane ${id}: car-sized clearance through pinsetter opening in direction ${dir}`
          );
      }
    }
    for (const door of DOORS) {
      assert.ok(ALLEY_RACE_POINTS.some(([x, z]) => Math.hypot(x - door.center[0], z - door.center[1]) < 2.1));
    }
    assert.ok(
      ALLEY_RACE_POINTS.some(([, z]) => z < PINSETTER_Z),
      'behind the pinsetter wall'
    );
    assert.ok(
      stream.world.raycast([DOORS[0].center[0], 0.32, PINSETTER_Z - 0.6], [0, 0, 1], 1),
      'pinsetter wall is solid'
    );
    for (let i = 0; i < LANES.length - 1; i++) {
      const x = (LANES[i].x + LANES[i + 1].x) / 2;
      const hit = stream.world.raycast([x, 1, BALL_RETURN_Z], [0, -1, 0], 2);
      assert.equal(hit.surface, 'metal');
      assert.ok(hit.point[1] > 0.19, 'small driveable return hump');
    }
    assert.equal(alley.root.getObjectByName('SnackCounter').position.x, SNACK_COUNTER.x);
  } finally {
    alley.dispose();
    stream.dispose();
  }
});

test('reference driver jumps the ball returns and beats bronze without recovery', () => {
  const stream = createStream({manifest: {tiles: []}, fetchTile() {}}),
    alley = buildBowlingAlley(new T.Scene(), stream.world);
  try {
    const race = createRace(eventCourse(event, stream.world), {mode: 'bigKid', opponents: 0}),
      pilot = {session: race.player, skill: 0.9, node: 0};
    race.retreat.at = Infinity;
    let jumpTime = 0;
    for (let i = 0; i < 120 * event.medals[2] && !race.player.finished; i++) {
      stepRace(race, driveInput(race, pilot), 1 / 120);
      const car = race.player.car,
        [x, , z] = car.pos;
      if (x > LANES[0].x && x < LANES.at(-1).x && Math.abs(z - BALL_RETURN_Z) < 0.6 && !car.grounded)
        jumpTime += 1 / 120;
    }
    assert.ok(
      race.player.finished,
      `gate ${race.player.gate}, time ${race.player.time}, ${race.player.car.pos}`
    );
    assert.equal(race.player.recoveries, 0);
    assert.ok(race.player.time < event.medals[2]);
    assert.ok(jumpTime > 0.05, 'tyres leave the floor over the ball returns');
  } finally {
    alley.dispose();
    stream.dispose();
  }
});

for (const mode of ['kid', 'bigKid'])
  test(`${mode}: all seven rivals finish Alley Cat with real alley, source and landmark collision`, async () => {
    const old = globalThis.document;
    globalThis.document = {createElement: canvas};
    const stream = createStream({
      manifest: data('manifest.json'),
      elevation: data('playable-terrain.json'),
      fetchTile: async key => data('tile-' + key.replace(',', '-') + '.json')
    });
    let alley, landmarks, activities;
    try {
      const scene = new T.Scene();
      await stream.update([event.points[0][0], 0, event.points[0][1]]);
      landmarks = buildLandmarks(scene, stream.world, undefined, data('overview.json').roads);
      alley = buildBowlingAlley(scene, stream.world);
      activities = buildActivities(scene, stream.world);
      const course = {...eventCourse(event, stream.world), laps: eventLaps(event)},
        race = createRace(course, {mode, opponents: 7}),
        pilot = {session: race.player, skill: 0.9, node: 0},
        sessions = [race.player, ...race.rivals.map(r => r.session)];
      race.retreat.at = Infinity;
      for (let i = 0; i < 120 * 240 && !sessions.every(s => s.finished); i++) {
        stepRace(race, driveInput(race, pilot), 1 / 120);
        activities.update(i / 120, race.player.car.pos);
        for (const s of sessions) activities.step(s.car, 1 / 120);
      }
      for (const [i, s] of sessions.entries()) {
        assert.ok(s.finished, `car ${i}: gate ${s.gate}, lap ${s.lap}, ${s.car.pos}`);
        assert.ok(s.car.pos.every(Number.isFinite));
      }
    } finally {
      alley?.dispose();
      landmarks?.dispose();
      activities?.dispose();
      stream.dispose();
      globalThis.document = old;
    }
  });

test('race-lane pins hide for Alley Cat and return for bowling', () => {
  const scene = new T.Scene(),
    visual = createBowlingVisual(scene),
    matrix = new T.Matrix4();
  try {
    const bodies = scene.getObjectsByProperty('isInstancedMesh', true);
    visual.update(null, 'alley-cat');
    for (const mesh of bodies)
      for (const lane of LANES) {
        mesh.getMatrixAt((lane.id - 1) * 10, matrix);
        assert.equal(matrix.determinant() === 0, RACE_LANES.includes(lane.id));
      }
    visual.update(createBowling({lane: 1}));
    for (const mesh of bodies) {
      mesh.getMatrixAt(0, matrix);
      assert.ok(matrix.determinant() > 0);
    }
  } finally {
    visual.dispose();
  }
});

test('runtime refuses racing during bowling and bowling during racing, then unlocks on exit', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url =>
    new Response(fs.readFileSync(new URL(String(url), new URL('../', import.meta.url))));
  let world;
  try {
    world = await loadOpenWorld('?at=rec&mode=drive');
    assert.ok(world.startActivity('bowling', {lane: 1}));
    const game = world.activity();
    // A game nobody has rolled in yet (the robot just crossed an approach) never blocks a race.
    assert.ok(world.canRace());
    game.launched = true; // a ball is out: now racing waits
    assert.equal(world.canRace(), false);
    assert.equal(world.eventURL(locationById('rec')), null);
    assert.equal(world.setRacing(true), false);
    assert.equal(world.activity(), game);
    world.cancelActivity();
    assert.ok(world.canRace());
    assert.match(world.eventURL(locationById('rec')), /event=alley-cat/);
    assert.match(world.eventURL({...locationById('rec'), event: 'rink-drift'}), /event=rink-drift/);
    world.dispose();
    world = await loadOpenWorld('?event=alley-cat&mode=race');
    assert.equal(world.startActivity('bowling', {lane: 6, control: 'robot'}), null);
    assert.equal(world.activity(), null);
    world.setRacing(false);
    assert.ok(world.startActivity('bowling', {lane: 6, control: 'robot'}));
    world.activity().done = true;
    assert.ok(world.canRace(), 'finished bowling releases the race');
  } finally {
    world?.dispose();
    globalThis.fetch = oldFetch;
  }
});
