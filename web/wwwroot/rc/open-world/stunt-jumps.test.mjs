import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {
  STUNT_JUMPS,
  createStuntJumps,
  inLandingZone,
  jumpLocal,
  jumpPoint,
  stepStuntJumps,
  stuntTimeScale
} from './stunt-jumps.mjs';
import {buildStuntJumps} from './stunt-jumps.js';
import {createStream} from './stream.mjs';
import {createSession, stepSession} from '../physics/session.mjs';
import {FLIGHT} from '../physics/flight.mjs';
import {rotate} from '../physics/math.mjs';
import {DISTRICT_BOUNDS} from './district-zones.mjs';
import {BOUNDS, EVENTS, inEventArea, loadProgress} from './catalog.mjs';
import {inside} from './geometry.mjs';
import {inResidential} from './residential-frame.mjs';
import {elevationAt} from './elevation.mjs';

const worldDir = new URL('../assets/world/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, worldDir)));
const manifest = read('manifest.json');
const elevation = read('playable-terrain.json');
const heightAt = (x, z) => elevationAt(elevation, x, z);
const makeStream = () =>
  createStream({
    manifest,
    elevation,
    fetchTile: key => read(`tile-${key.replace(',', '-')}.json`)
  });
const samples = j => {
  const out = [];
  for (let a = -40; a <= j.length + j.landing[1] + 1; a += 2)
    for (const side of [-j.landing[2], -j.width / 2 - 1, 0, j.width / 2 + 1, j.landing[2]])
      out.push(jumpPoint(j, a, side));
  return out;
};
const segmentDistance = (p, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[2] - a[1] - t * dz);
};
const pointInBuildings = (p, features) =>
  features.some(
    f =>
      f.properties?.building &&
      f.geometry?.type === 'Polygon' &&
      inside(p[0], p[2], f.geometry.coordinates[0])
  );
const rectCorners = (j, near, far, halfWidth) => [
  jumpPoint(j, near, -halfWidth),
  jumpPoint(j, far, -halfWidth),
  jumpPoint(j, far, halfWidth),
  jumpPoint(j, near, halfWidth)
];
const footprintOverlapsPolygon = (corners, ring) => {
  const side = (p, q, r) => (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]),
    crosses = (a, b, c, d) => {
      const ab = side(a, b, c),
        ad = side(a, b, d),
        cd = side(c, d, a),
        cb = side(c, d, b);
      return (
        ab * ad <= 0 &&
        cd * cb <= 0 &&
        Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
          Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
        Math.max(Math.min(a[2], b[2]), Math.min(c[2], d[2])) <=
          Math.min(Math.max(a[2], b[2]), Math.max(c[2], d[2]))
      );
    };
  return (
    corners.some(p => inside(p[0], p[2], ring)) ||
    ring.some(p =>
      inside(
        p[0],
        p[1],
        corners.map(c => [c[0], c[2]])
      )
    ) ||
    ring.some((p, i) => {
      const q = ring[(i + 1) % ring.length],
        a = [p[0], 0, p[1]],
        b = [q[0], 0, q[1]];
      return corners.some((c, k) => crosses(c, corners[(k + 1) % corners.length], a, b));
    })
  );
};

test('all eight jumps are in the playable base, clear race areas, and avoid OSM and residential buildings', () => {
  const features = manifest.tiles.flatMap(([x, z]) => read(`tile-${x}-${z}.json`).features ?? []);
  assert.equal(STUNT_JUMPS.length, 8);
  assert.equal(STUNT_JUMPS.filter(j => !j.big).length, 5);
  assert.equal(STUNT_JUMPS.filter(j => j.big).length, 3);
  for (const j of STUNT_JUMPS) {
    for (const p of samples(j)) {
      assert.ok(
        p[0] >= BOUNDS[0] && p[0] <= BOUNDS[2] && p[2] >= BOUNDS[1] && p[2] <= BOUNDS[3],
        `${j.id} escaped base bounds`
      );
      assert.equal(inResidential(p), false, `${j.id} is inside residential bounds`);
      assert.equal(inEventArea(p[0], p[2]), false, `${j.id} is inside a race event area at ${p}`);
      assert.equal(pointInBuildings(p, features), false, `${j.id} is inside an OSM building at ${p}`);
      for (const event of EVENTS)
        for (let i = 1; i < event.points.length; i++)
          assert.ok(
            segmentDistance(p, event.points[i - 1], event.points[i]) > (event.half ?? 12),
            `${j.id} overlaps ${event.id} race line at ${p}`
          );
    }
    // Check the entire approach, ramp, sign and landing corridor, including buildings
    // wholly enclosed by it. This is wider than the drivable ramp, on purpose.
    const corners = rectCorners(j, -40, j.length + j.landing[1] + 1, Math.max(6.2, j.landing[2]));
    for (const feature of features.filter(f => f.properties?.building && f.geometry?.type === 'Polygon'))
      assert.equal(
        footprintOverlapsPolygon(corners, feature.geometry.coordinates[0]),
        false,
        `${j.id} overlaps building ${feature.id}`
      );
    for (const [x0, z0, x1, z1] of DISTRICT_BOUNDS)
      assert.equal(
        footprintOverlapsPolygon(corners, [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1]
        ]),
        false,
        `${j.id} overlaps an authored district`
      );
    for (const event of EVENTS)
      for (let i = 1; i < event.points.length; i++) {
        const a = event.points[i - 1],
          b = event.points[i],
          endpoints = [
            [a[0], 0, a[1]],
            [b[0], 0, b[1]]
          ];
        assert.equal(footprintOverlapsPolygon(corners, [a, b]), false, `${j.id} crosses ${event.id}`);
        const distances = corners.map(p => segmentDistance(p, a, b));
        for (const p of endpoints)
          corners.forEach((c, k) => {
            const d = corners[(k + 1) % 4];
            distances.push(segmentDistance(p, [c[0], c[2]], [d[0], d[2]]));
          });
        assert.ok(Math.min(...distances) > (event.half ?? 12), `${j.id} is too close to ${event.id}`);
      }
    const landing = jumpPoint(j, j.length + (j.landing[0] + j.landing[1]) / 2);
    landing[1] = heightAt(landing[0], landing[2]) + 0.1;
    assert.equal(inLandingZone(j, landing, heightAt), true);
  }
  // Race areas are authoritative for non-road events; road events intentionally do not count here.
  assert.ok(EVENTS.some(e => e.road));
});

test('visual builder adds one solid ramp and chevron sign group per jump', () => {
  const stream = makeStream(),
    scene = new T.Scene();
  try {
    const visual = buildStuntJumps(scene, stream.world, heightAt);
    const root = scene.getObjectByName('Stunt jumps');
    assert.ok(root);
    assert.equal(root.children.filter(c => c.isMesh).length, STUNT_JUMPS.length);
    assert.equal(root.children.filter(c => c.isGroup).length, STUNT_JUMPS.length);
    for (const j of STUNT_JUMPS) {
      const mid = jumpPoint(j, j.length / 2);
      const top = stream.world.raycast([mid[0], heightAt(mid[0], mid[2]) + 4, mid[2]], [0, -1, 0], 4);
      assert.equal(top?.surface, 'wood', `${j.id} has a drivable top`);
      assert.ok(top.normal[1] > 0.9);
      const back = jumpPoint(j, j.length + 0.5, 0, heightAt(j.x, j.z) + j.height / 2);
      assert.equal(
        stream.world.raycast(back, [-Math.sin(j.heading), 0, -Math.cos(j.heading)], 1)?.surface,
        'wood',
        `${j.id} has a solid back`
      );
      const side = jumpPoint(j, j.length / 2, j.width / 2 + 0.5, heightAt(j.x, j.z) + j.height / 8);
      assert.equal(
        stream.world.raycast(side, [-Math.cos(j.heading), 0, Math.sin(j.heading)], 1)?.surface,
        'wood',
        `${j.id} has a solid side`
      );
    }
    visual.dispose();
    assert.equal(scene.getObjectByName('Stunt jumps'), undefined);
  } finally {
    stream.dispose();
  }
});

test('real kid-mode physics lands every jump, slow cars land short, and big jumps need boost', async () => {
  const stream = makeStream(),
    visual = buildStuntJumps(new T.Scene(), stream.world, heightAt);
  try {
    for (const j of STUNT_JUMPS) {
      const start = jumpPoint(j, -40);
      await stream.update(start);
      const drive = (throttle, boost) => {
        const session = createSession(
          {world: stream.world, start: {pos: start, yaw: Math.PI - j.heading}, checkpoints: [], secrets: []},
          {mode: 'kid'}
        );
        session.roam = true;
        const state = createStuntJumps([], heightAt),
          events = [];
        let acc = 0,
          launchSpeed = 0,
          slowed = 0;
        // Match main's frame accumulator: slowdown changes elapsed simulation time,
        // never the car's physics timestep or launch velocity.
        for (let frame = 0; frame < 60 * 20; frame++) {
          const scale = stuntTimeScale(state, session.car, 1 / 60, true);
          slowed += ((1 - scale) * 2) / 60;
          acc += scale / 60;
          while (acc >= 1 / 120) {
            stepSession(session, {throttle, boost}, 1 / 120);
            const step = stepStuntJumps(state, session.car, 1 / 120, true);
            if (step.some(e => e.type === 'launch')) launchSpeed = session.car.speed;
            events.push(...step);
            acc -= 1 / 120;
            if (step.some(e => e.type !== 'launch'))
              return {state, car: session.car, events, launchSpeed, slowed};
          }
        }
        return {state, car: session.car, events, launchSpeed, slowed};
      };
      const good = drive(1, j.big ? FLIGHT.burnerBoost : 1);
      assert.deepEqual(
        good.events.map(e => e.type),
        ['launch', 'found'],
        j.id
      );
      assert.equal(good.events.at(-1).id, j.id);
      assert.equal(good.events.at(-1).fresh, true);
      assert.equal(good.state.found.size, 1);
      assert.ok(inLandingZone(j, good.car.pos, heightAt), j.id);
      assert.ok(rotate(good.car.q, [0, 1, 0])[1] >= 0.65, `${j.id} lands upright`);
      assert.ok(good.launchSpeed >= j.minSpeed, `${j.id} launch speed`);
      if (!j.big) assert.ok(good.launchSpeed < 13, `${j.id} needs only ordinary speed`);
      assert.ok(good.slowed > 0 && good.slowed <= 1.5 + 1e-8, `${j.id} slow-motion wall time`);
      const slow = drive(j.big ? 1 : 0.15, 1);
      assert.deepEqual(
        slow.events.map(e => e.type),
        ['launch', 'miss'],
        `${j.id} slow miss`
      );
      assert.equal(slow.state.found.size, 0);
      assert.ok(jumpLocal(j, slow.car.pos)[0] < j.length + j.landing[0], `${j.id} slow car lands short`);
    }
  } finally {
    visual.dispose();
    stream.dispose();
  }
});

function scriptedCar(j, overrides = {}) {
  const lip = jumpPoint(j, j.length, 0);
  return {
    pos: lip,
    placement: 0,
    speed: j.minSpeed + 1,
    vel: [Math.sin(j.heading) * (j.minSpeed + 1), 0, Math.cos(j.heading) * (j.minSpeed + 1)],
    q: [0, 0, 0, 1],
    contacts: 0,
    impact: 0,
    wallImpact: 0,
    wheels: [],
    ...overrides
  };
}

test('only contact on this ramp near its lip can arm a jump', () => {
  const j = STUNT_JUMPS[0],
    state = createStuntJumps([], () => 0),
    car = scriptedCar(j);
  state.previous = {pos: [...car.pos], placement: car.placement};
  assert.deepEqual(stepStuntJumps(state, car, 1 / 120), [], 'flying over a lip is not a launch');
  const along = j.length - 0.1,
    point = jumpPoint(j, along, 0, j.height * (along / j.length) ** 2),
    grounded = {
      ...car,
      pos: jumpPoint(j, along, 0, point[1] + 0.1),
      contacts: 1,
      wheels: [{contact: true, contactPoint: point}]
    };
  stepStuntJumps(
    state,
    {...grounded, wheels: [{contact: true, contactPoint: jumpPoint(STUNT_JUMPS[1], 8)}]},
    0.2
  );
  assert.equal(state.riding, null, 'contact on a different ramp cannot arm this one');
  stepStuntJumps(state, grounded, 0.2);
  assert.equal(state.riding?.jump.id, j.id);
  assert.equal(stuntTimeScale(state, grounded, 1 / 60), 1);
  assert.equal(state.riding?.jump.id, j.id, 'frame clock preserves the ramp contact');
  assert.deepEqual(stepStuntJumps(state, car, 0.2), [{type: 'launch', id: j.id}]);
});

test('short, long, side, overturned and wall-crash landings all miss without saving', () => {
  const j = STUNT_JUMPS[0],
    base = scriptedCar(j),
    goodPos = jumpPoint(j, j.length + 10, 0, 0.1);
  for (const [label, car] of [
    ['short', {...base, pos: jumpPoint(j, j.length + 2, 0, 0.1), contacts: 1}],
    ['long', {...base, pos: jumpPoint(j, j.length + j.landing[1] + 1, 0, 0.1), contacts: 1}],
    ['side', {...base, pos: jumpPoint(j, j.length + 10, j.landing[2] + 1, 0.1), contacts: 1}],
    ['overturned', {...base, pos: goodPos, contacts: 1, q: [1, 0, 0, 0]}],
    ['wall', {...base, pos: goodPos, contacts: 1, wallImpact: 2}]
  ]) {
    const state = createStuntJumps();
    state.previous = {pos: [...car.pos], placement: 0};
    state.attempt = {jump: j, fast: true, air: 0.5};
    state.slow = 1;
    const events = stepStuntJumps(state, car, 1 / 120);
    assert.equal(events[0]?.type, 'miss', label);
    assert.equal(state.found.size, 0, label);
    assert.equal(state.attempt, null);
    assert.equal(state.slow, 0);
  }
});

test('slow, crashed, foreign, duplicate, race, reset, and over-budget attempts do not save', () => {
  const j = STUNT_JUMPS[0],
    base = scriptedCar(j);
  const armed = (found = []) => {
    const state = createStuntJumps(found, () => 0);
    state.previous = {pos: jumpPoint(j, j.length + 1, 0), placement: 0};
    state.attempt = {jump: j, fast: true, air: 0.3};
    return state;
  };
  const shortState = armed();
  shortState.attempt.fast = false;
  const short = stepStuntJumps(shortState, {...base, pos: jumpPoint(j, j.length + 2, 0), contacts: 1}, 0.2);
  assert.equal(short[0].type, 'miss');
  assert.equal(short[0].fresh, false);
  const duplicateState = armed([j.id]);
  duplicateState.previous = {pos: jumpPoint(j, j.length + 6, 0, 0.1), placement: 0};
  const duplicate = stepStuntJumps(
    duplicateState,
    {...base, pos: jumpPoint(j, j.length + 10, 0, 0.1), contacts: 1},
    0.2
  );
  assert.equal(duplicate[0].type, 'found');
  assert.equal(duplicate[0].fresh, false);
  assert.equal(duplicate[0].count, 1);
  for (const [label, state, car, enabled] of [
    ['race', armed(), {...base, pos: jumpPoint(j, j.length + 2, 0), contacts: 1}, false],
    ['reset', armed(), {...base, pos: jumpPoint(j, j.length + 2, 0), placement: 1}, true],
    ['crash', armed(), {...base, pos: jumpPoint(j, j.length + 2, 0), contacts: 0, wallImpact: 2}, true]
  ]) {
    stepStuntJumps(state, car, 0.2, enabled);
    assert.equal(state.attempt, null, `${label} clears the attempt`);
  }
  const budgetState = armed();
  budgetState.attempt.air = 6;
  const budget = stepStuntJumps(budgetState, {...base, pos: jumpPoint(j, j.length + 5, 0), contacts: 0}, 0.2);
  assert.equal(
    budget.some(e => e.type === 'found'),
    false
  );
  assert.equal(budgetState.attempt, null);
});

test('slow motion is free-drive only and consumes at most 1.5 seconds of wall time', () => {
  const j = STUNT_JUMPS[0],
    state = createStuntJumps([], () => 0),
    car = scriptedCar(j);
  state.previous = {pos: [...car.pos], placement: car.placement};
  state.attempt = {jump: j, fast: true, air: 0};
  state.slow = 1.5;
  assert.equal(stuntTimeScale(state, car, 0.1, true), 0.5);
  assert.equal(state.slow, 1.4);
  assert.equal(stuntTimeScale(state, car, 2, true), 0.65);
  assert.equal(state.slow, 0);
  assert.equal(stuntTimeScale(state, car, 0.1, true), 1);
  state.slow = 1.5;
  assert.equal(stuntTimeScale(state, {...car, contacts: 1}, 1 / 60), 1);
  assert.ok(state.attempt, 'landing must still be evaluated by the next physics step');
  state.attempt = {jump: j, fast: true, air: 0};
  state.slow = 1.5;
  assert.equal(stuntTimeScale(state, car, 0.1, false), 1);
  assert.equal(state.attempt, null);
});

test('progress accepts only the eight authored jump ids', () => {
  const storage = {
    getItem: () => JSON.stringify({stuntJumps: [STUNT_JUMPS[0].id, STUNT_JUMPS[0].id, 'fake', 4, null]})
  };
  assert.deepEqual(loadProgress(storage).stuntJumps, [STUNT_JUMPS[0].id]);
});
