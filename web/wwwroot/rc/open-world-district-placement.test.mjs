import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld} from './physics/world.mjs';
import {createSession, stepSession, readout} from './physics/session.mjs';
import {courseFromGlb} from './physics/district.mjs';
import {createRace, driveInput} from './physics/race.mjs';
import {placeDistrictCourse} from './open-world/district-placement.mjs';

function nativeCourse() {
  const world = createWorld();
  // Elevated, sloped collision is intentional: placement must preserve Y as well as X/Z.
  world.addQuad([-30, 2, -30], [-30, 2, 30], [30, 2, 30], [30, 2, -30], 'asphalt');
  const mark = (name, pos, forward = [0, 0, -1]) => ({name, pos, forward, halfWidth: 3});
  const gates = [mark('GATE_00', [0, 2, 0]), mark('GATE_01', [0, 2, -20])];
  return {
    world,
    gates,
    grid: [mark('START_1', [0, 2, 4])],
    ai: [mark('AI_001', [1, 2, -8])],
    pickups: [mark('PICKUP_1', [2, 2, -4])],
    cams: [mark('CAM_1', [3, 4, 2])],
    checkpoints: [
      [0, -0, 'GATE_00', 3, [0, -1]],
      [0, -20, 'GATE_01', 3, [0, -1]],
      [0, 0, 'GATE_00', 3, [0, -1]]
    ],
    secrets: [{x: 4, y: 3, z: -4}],
    coins: [{name: 'COIN_1', x: 5, y: 3, z: -5}],
    alts: [
      {
        name: 'ALT_shortcut',
        nodes: [
          [1, -5, 1],
          [2, -8, 1]
        ]
      }
    ],
    start: {pos: [0, 2, 4], yaw: 0}
  };
}

test('rigid placement transforms collision, all markers, directions, and ALT nodes', () => {
  const placed = placeDistrictCourse(nativeCourse(), {anchor: [100, 7, 200], yaw: Math.PI / 2});
  assert.deepEqual(placed.start.pos, [104, 9, 200]);
  assert.ok(Math.abs(placed.start.yaw + Math.PI / 2) < 1e-9);
  assert.deepEqual(placed.checkpoints[1].slice(0, 2), [80, 200]);
  assert.deepEqual(placed.checkpoints[1][4], [-1, -6.123233995736766e-17]);
  assert.deepEqual(placed.secrets[0], {x: 96, y: 10, z: 196});
  assert.deepEqual(placed.coins[0], {name: 'COIN_1', x: 95, y: 10, z: 195});
  assert.deepEqual(placed.alts[0].nodes[0], [95, 199, 1]);
  const hit = placed.world.raycast([105, 20, 205], [0, -1, 0], 20);
  assert.ok(hit && Math.abs(hit.point[1] - 9) < 1e-9 && hit.surface === 'asphalt');
});

test('real housing, BX, and school GLBs retain markers and complete transformed laps', () => {
  for (const name of ['housing', 'bx', 'school']) {
    const native = courseFromGlb(fs.readFileSync(new URL(`./assets/districts/${name}.glb`, import.meta.url)));
    const placed = placeDistrictCourse(native, {anchor: [700, 11, -900], yaw: 0.73});
    assert.equal(placed.grid.length, native.grid.length, `${name} grid`);
    assert.equal(placed.cams.length, native.cams.length, `${name} cameras`);
    assert.equal(placed.pickups.length, native.pickups.length, `${name} pickups`);
    assert.equal(placed.gates.length, native.gates.length, `${name} gates`);
    const race = createRace(placed, {opponents: 1});
    assert.ok(
      race.rivals.length && Number.isFinite(driveInput(race, race.rivals[0]).steer),
      `${name} driveInput`
    );
    const rival = race.rivals[0];
    const start = [...rival.session.car.pos];
    for (let i = 0; i < 120 * 120; i++) stepSession(rival.session, driveInput(race, rival));
    assert.ok(rival.session.gate >= 1, `${name} transformed lap gate ${rival.session.gate}`);
    assert.ok(
      rival.session.travel >
        Math.hypot(start[0] - rival.session.car.pos[0], start[2] - rival.session.car.pos[2]),
      `${name} transformed lap moved`
    );
  }
});

test('rigidly placed lap remains driveable by the session controller', () => {
  const c = placeDistrictCourse(nativeCourse(), {anchor: [-80, 3, 40], yaw: -0.4});
  const s = createSession(c, {mode: 'kid'});
  for (let i = 0; i < 120 * 90 && !s.finished; i++) {
    const r = readout(s);
    const [x, z] = c.checkpoints[s.gate];
    const e = Math.atan2(x - r.x, -(z - r.z)) - r.yaw;
    stepSession(s, {
      throttle: r.speed > 6 ? 0.3 : 1,
      steer: Math.max(-1, Math.min(1, Math.atan2(Math.sin(e), Math.cos(e)) * 2))
    });
  }
  assert.equal(s.finished, true, `gate ${s.gate}`);
});

test('placement rejects non-unit scale and does not mutate the source course', () => {
  const c = nativeCourse();
  assert.throws(() => placeDistrictCourse(c, {anchor: [0, 0, 0], scale: 2}), /scale must be 1/);
  const out = placeDistrictCourse(c, {pos: [10, 0, 10]});
  assert.deepEqual(c.start.pos, [0, 2, 4]);
  assert.notEqual(out.world, c.world);
});
