import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {createBowling, stepBowling, nextDelivery, BOWLING_TEE} from './open-world/bowling.mjs';
import {ALLEY_SCENERY_BOUNDS, DOORS, LANES, insideAlley} from './open-world/bowling-alley.mjs';
import {createStream} from './open-world/stream.mjs';
import {buildBowlingAlley} from './open-world/bowling-alley.js';
import {eventCourse, EVENTS} from './open-world/catalog.mjs';
import {createSession, stepSession} from './physics/session.mjs';
import {placeCar, rideHeight, BUGGY} from './physics/car.mjs';
import {desertScatter, roadsideDetail} from './open-world/roadside-detail.mjs';
import {roadVerges} from './open-world/road-verges.mjs';
import {roadLamps} from './open-world/world-finish.mjs';
import {subtractBox} from './open-world/district-entrances.mjs';
import {followInput} from './physics/playmate.mjs';
import {createTileRenderer} from './open-world/render.js';
const data = name => JSON.parse(fs.readFileSync(new URL('./assets/world/' + name, import.meta.url)));
test('ten-frame Car Bowling plays through using real car inputs and alley collision', async () => {
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}, set: () => true})})
  };
  const stream = createStream({
    elevation: data('playable-terrain.json'),
    manifest: data('manifest.json'),
    fetchTile: async key => data('tile-' + key.replace(',', '-') + '.json')
  });
  let alley;
  try {
    await stream.update(BOWLING_TEE.pos);
    alley = buildBowlingAlley(new T.Scene(), stream.world);
    const course = eventCourse(EVENTS[0], stream.world);
    course.start = BOWLING_TEE;
    const s = createSession(course, {mode: 'bigKid'});
    s.roam = true;
    const game = createBowling();
    let steps = 0;
    while (!game.done && steps++ < 120 * 240) {
      stepSession(
        s,
        {throttle: s.car.pos[2] > LANES[0].endZ - 1.4 ? 1 : 0, brake: s.car.pos[2] <= LANES[0].endZ - 1.4},
        1 / 120
      );
      const e = stepBowling(game, s.car, 1 / 120);
      if (e?.tee) placeCar(s.car, [e.tee.pos[0], rideHeight(BUGGY), e.tee.pos[2]], 0);
    }
    assert.ok(game.done, `car ${s.car.pos}, score ${game.score}`);
    assert.ok(game.score > 0 && game.score <= 300);
    assert.equal(game.frame, 9);
    assert.equal(game.frames.length, 10);
    assert.ok(game.frames.every(f => f.length > 0));
  } finally {
    alley?.dispose();
    stream.dispose();
    globalThis.document = old;
  }
});

test('mapped recreation footprint has no streamed roadside or desert scatter', () => {
  const tileNames = ['tile--4-4.json', 'tile--5-4.json', 'tile--4-5.json', 'tile--5-5.json'];
  const padded = ALLEY_SCENERY_BOUNDS;
  const inPadded = p => p.x >= padded[0] && p.x <= padded[2] && p.z >= padded[1] && p.z <= padded[3];
  for (const name of tileNames) {
    const tile = data(name);
    const bounds = [
      tile.tile[0] * 256,
      tile.tile[1] * 256,
      (tile.tile[0] + 1) * 256,
      (tile.tile[1] + 1) * 256
    ];
    const points = [...roadsideDetail(tile, bounds), ...desertScatter(tile, bounds)];
    const verges = roadVerges(tile, bounds);
    points.push(...verges.markers, ...verges.services, ...roadLamps(tile, bounds));
    assert.ok(
      points.every(p => !inPadded(p)),
      name
    );
  }
});

test('streamed mapped building keeps both alley doors open and the wall corridor clear', async () => {
  const stream = createStream({
    elevation: data('playable-terrain.json'),
    manifest: data('manifest.json'),
    fetchTile: async key => data('tile-' + key.replace(',', '-') + '.json')
  });
  let alley;
  try {
    await stream.update(BOWLING_TEE.pos);
    alley = buildBowlingAlley(new T.Scene(), stream.world);
    assert.equal(stream.errors.size, 0);
    for (const door of DOORS) {
      const normal = door.axis === 'x' ? [0, 0, 1] : [1, 0, 0],
        tangent = door.axis === 'x' ? [1, 0, 0] : [0, 0, 1],
        at = (across, out, y = 0.35) => [
          door.center[0] + tangent[0] * across + normal[0] * out,
          y,
          door.center[1] + tangent[2] * across + normal[2] * out
        ];
      assert.ok(door.width >= 3.2);
      for (const across of [-door.width / 2 + 0.23, 0, door.width / 2 - 0.23])
        for (const dir of [-1, 1]) {
          const origin = at(across, -dir * 3),
            ray = normal.map(v => v * dir);
          assert.equal(stream.world.raycast(origin, ray, 6), null, `${door.id} corridor ${dir}, ${across}`);
          for (let t = 0; t <= 6; t += 0.25) {
            const p = origin.map((v, i) => v + ray[i] * t);
            assert.equal(stream.world.sphereContacts(p, 0.22).length, 0, `${door.id} car clearance`);
            assert.ok(stream.world.raycast(p, [0, -1, 0], 1), 'ground remains under the entrance');
          }
        }
      assert.equal(stream.world.raycast(at(0, 0.1), normal, 8), null, `${door.id} faces open ground`);
      assert.ok(
        stream.world.raycast(
          at(door.width / 2 + 0.4, 1),
          normal.map(v => -v),
          2
        ),
        'solid wall beside gap'
      );
      assert.ok(
        stream.world.raycast(
          at(0, 1, 3.2),
          normal.map(v => -v),
          2
        ),
        'solid lintel'
      );
    }
    // Drive one continuous path through both doors with the real car/steering.
    const front = DOORS[0],
      side = DOORS[1],
      course = eventCourse(EVENTS[0], stream.world);
    course.start = {pos: [front.center[0], 0, front.center[1] + 4], yaw: 0};
    const session = createSession(course, {mode: 'bigKid'});
    session.roam = true;
    const follower = {
      i: 0,
      top: 2,
      path: [
        [front.center[0], front.center[1] - 2],
        [front.center[0], side.center[1]],
        [side.center[0] - 5, side.center[1]],
        [side.center[0] + 4, side.center[1]]
      ]
    };
    let visited = false,
      exited = false;
    for (let i = 0; i < 120 * 45 && !exited; i++) {
      stepSession(session, followInput(session, follower), 1 / 120);
      visited ||= insideAlley(session.car.pos);
      exited = visited && session.car.pos[0] > side.center[0] + 1;
    }
    assert.ok(exited, `entry-to-exit drive stopped at ${session.car.pos}`);
    assert.equal(session.recoveries, 0, 'no reset teleported the car past a wall');
  } finally {
    alley?.dispose();
    stream.dispose();
  }
});

test('tile meshes leave roads, vegetation and props out of the padded alley', () => {
  const scene = new T.Scene(),
    renderer = createTileRenderer(scene, data('playable-terrain.json')),
    [x0, z0, x1, z1] = ALLEY_SCENERY_BOUNDS,
    // Float32 mesh positions can round a cut edge by 0.00006 m.
    cut = [x0 + 0.001, -100, z0 + 0.001, x1 - 0.001, 1000, z1 - 0.001],
    area = ([a, b, c]) =>
      new T.Vector3(...b)
        .sub(new T.Vector3(...a))
        .cross(new T.Vector3(...c).sub(new T.Vector3(...a)))
        .length() / 2;
  let checked = 0;
  try {
    for (const key of ['-4,4', '-5,4']) renderer.load(key, data('tile-' + key.replace(',', '-') + '.json'));
    scene.traverse(o => {
      const a = o.geometry?.attributes.position;
      if (!a) return;
      for (let i = 0; i < a.count; i += 3) {
        const tri = [0, 1, 2].map(j => [a.getX(i + j), a.getY(i + j), a.getZ(i + j)]);
        if (tri.every(p => p[1] < 0)) continue; // underlying terrain, below the alley floor
        const outside = subtractBox(tri, cut).reduce((sum, t) => sum + area(t), 0);
        assert.ok(area(tri) - outside < 1e-5, `${o.name} crosses alley footprint`);
        checked++;
      }
    });
    assert.ok(checked > 0, 'surrounding scenery still renders');
  } finally {
    renderer.dispose();
  }
});

test('idle pins do not score, skipped deliveries count as misses, and leaving cancels', () => {
  const g = createBowling(),
    car = {pos: [BOWLING_TEE.pos[0], 0.13, BOWLING_TEE.pos[2]], vel: [0, 0, 0]};
  for (let i = 0; i < 120; i++) stepBowling(g, car, 1 / 120);
  assert.equal(g.score, 0);
  assert.equal(g.done, false);
  assert.deepEqual(nextDelivery(g), BOWLING_TEE);
  assert.equal(g.delivery, 2);
  for (let i = 0; i < 18; i++) assert.ok(nextDelivery(g));
  assert.equal(nextDelivery(g), null);
  assert.ok(g.done);
  assert.equal(g.score, 0);
  assert.equal(nextDelivery(g), null);
  assert.ok(stepBowling(createBowling(), {pos: [0, 0, 0], vel: [0, 0, 0]}, 1 / 120).cancelled);
});
