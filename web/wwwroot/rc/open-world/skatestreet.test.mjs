import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld} from '../physics/world.mjs';
import {createSession, stepSession} from '../physics/session.mjs';
import {placeCar, rideHeight} from '../physics/car.mjs';
import {createSkate, stepSkate} from '../physics/skate.mjs';
import {createStream} from './stream.mjs';
import {insideBase} from './boundary.mjs';
import {SCENERY_BOUNDS} from './district-zones.mjs';
import {HANGAR, hangarWorld} from './skate-hangar.mjs';
import {desertScatter, roadsideDetail} from './roadside-detail.mjs';
import {elevationAt} from './elevation.mjs';
import {inside, segmentDistance, roadWidth} from './geometry.mjs';
import {LOCATIONS} from './catalog.mjs';
import {
  SKATESTREET as P,
  SKATESTREET_BOUNDS,
  SKATESTREET_PARK as PARK,
  buildSkatestreet,
  skatestreetWorld as W,
  skatestreetLocal as L,
  streetBowlHeight
} from './skatestreet.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL(`../assets/world/${name}`, import.meta.url)));
const terrain = read('playable-terrain.json'),
  triangles = buildSkatestreet(),
  world = createWorld(4);
world.addQuad([400, 0, 800], [400, 0, 1200], [800, 0, 1200], [800, 0, 800], 'asphalt');
const addPark = world => {
  for (const t of triangles) world.addTri(W(t.a), W(t.b), W(t.c), t.surface);
};
addPark(world);
const frame = p => {
  const l = L(p);
  return [l[0], l[2], l[1]];
};
const ground = (x, z) => world.raycast(W([x, 10, z]), [0, -1, 0], 15);
const height = (x, z) => ground(x, z)?.point[1];
function run(x, z, dx, dz, seconds, throttle = 1, drift = false, collision = world) {
  const course = {
    world: collision,
    checkpoints: [
      [560, 1000, 'a'],
      [561, 1000, 'b']
    ],
    secrets: [],
    start: {pos: W([0, 0, 0]), yaw: 0}
  };
  const s = createSession(course, {mode: 'kid'});
  s.roam = true;
  const p = W([x, 10, z]);
  p[1] = collision.raycast(p, [0, -1, 0], 15).point[1] + rideHeight() + 0.01;
  placeCar(s.car, p, Math.atan2(dx, -dz));
  const sk = createSkate(PARK);
  sk.left = seconds;
  const events = [],
    landings = [];
  let peak = 0;
  for (let f = 0; f < (seconds + 4) * 120 && !sk.over; f++) {
    const input = {throttle, steer: 0, drift};
    stepSession(s, input, 1 / 120);
    const air = sk.air;
    events.push(...stepSkate(sk, s, input, 1 / 120, frame));
    if (air && !sk.air && air.time > 0.3)
      landings.push({kind: air.kind, from: air.from, to: frame(s.car.pos)});
    peak = Math.max(peak, L(s.car.pos)[1]);
  }
  return {s, sk, events, landings, peak, gaps: events.filter(e => e.type === 'gap').map(e => e.name)};
}
const clean = r => {
  assert.equal(r.s.hits, 0, 'no wall hits');
  assert.equal(r.s.recoveries, 0, 'no rescue');
  assert.ok(!r.events.some(e => e.type === 'bail'), 'no bail');
};

test('Skatestreet fits the flat base hardstand without covering buildings, roads or another venue', () => {
  const b = SKATESTREET_BOUNDS,
    corners = [
      [b[0], b[1]],
      [b[2], b[1]],
      [b[2], b[3]],
      [b[0], b[3]]
    ],
    ring = [...corners, corners[0]];
  const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  for (const p of corners) assert.ok(insideBase(...p));
  for (const other of SCENERY_BOUNDS) assert.ok(!overlaps(b, other));
  const hc = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ].map(([x, z]) => hangarWorld([x * (HANGAR.length / 2 + 3), 0, z * (HANGAR.width / 2 + 3)]));
  assert.ok(
    !overlaps(b, [
      Math.min(...hc.map(p => p[0])),
      Math.min(...hc.map(p => p[2])),
      Math.max(...hc.map(p => p[0])),
      Math.max(...hc.map(p => p[2]))
    ])
  );
  for (let x = b[0]; x <= b[2]; x += 3)
    for (let z = b[1]; z <= b[3]; z += 3) assert.equal(elevationAt(terrain, x, z), 0);
  const tiles = [];
  for (let x = Math.floor(b[0] / 256) - 1; x <= Math.floor(b[2] / 256) + 1; x++)
    for (let z = Math.floor(b[1] / 256) - 1; z <= Math.floor(b[3] / 256) + 1; z++) {
      const file = new URL(`../assets/world/tile-${x}-${z}.json`, import.meta.url);
      if (fs.existsSync(file)) tiles.push(JSON.parse(fs.readFileSync(file)));
    }
  const intersects = (a, b, c, d) => {
    const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
  };
  for (const tile of tiles) {
    for (const f of tile.features) {
      const g = f.geometry,
        p = f.properties;
      if (g.type === 'Polygon' && (p.building || p.amenity === 'parking')) {
        const r = g.coordinates[0];
        assert.ok(
          !corners.some(p => inside(...p, r)) && !r.some(p => inside(...p, ring)),
          `footprint ${f.id}`
        );
        for (let i = 1; i < r.length; i++)
          for (let j = 1; j < ring.length; j++)
            assert.ok(!intersects(r[i - 1], r[i], ring[j - 1], ring[j]), `footprint edge ${f.id}`);
      }
      if (g.type === 'LineString' && (p.highway || p.aeroway))
        for (let i = 1; i < g.coordinates.length; i++) {
          const a = g.coordinates[i - 1],
            c = g.coordinates[i],
            clear = roadWidth(p) / 2 + 2.5;
          assert.ok(!inside(...a, ring) && !inside(...c, ring));
          for (let j = 1; j < ring.length; j++) {
            const u = ring[j - 1],
              v = ring[j];
            assert.ok(!intersects(a, c, u, v), `road crosses park ${f.id}`);
            const distance = Math.min(
              segmentDistance(...u, a, c),
              segmentDistance(...v, a, c),
              segmentDistance(...a, u, v),
              segmentDistance(...c, u, v)
            );
            assert.ok(distance > clear, `road clearance ${f.id}: ${distance} <= ${clear}`);
          }
        }
    }
    const [x, z] = tile.tile,
      bounds = [x * 256, z * 256, (x + 1) * 256, (z + 1) * 256];
    for (const p of [...desertScatter(tile, bounds), ...roadsideDetail(tile, bounds)])
      assert.ok(!inside(p.x, p.z, ring), 'no foliage through the floor');
  }
  const place = LOCATIONS.find(l => l.skate === PARK.id);
  assert.ok(place);
  assert.ok(Math.hypot(place.pos[0] - P.center[0], place.pos[2] - P.center[2]) < 54);
});

test('bowls, hip, roll-in, vert, mini, banks, stairs and ledges have upward riding faces at design height', () => {
  const arc = t => 1 - Math.sqrt(1 - t * t);
  const checks = [
    [-41, -10.5, 1.64],
    [-39.5, -10.5, 3.24],
    [-35.5, -8, 3.24],
    [-23, -10, 0.04],
    [0, -10, 1.04],
    [-10, -10.5, 1.5],
    [32, -13, 0.04 + 4 * arc(0.5)],
    [36, -13, 4.04],
    [37, 0, 2.04],
    [14.8, 5, 0.04 + 1.6 * arc(0.5)],
    [23.2, 5, 0.04 + 1.6 * arc(0.5)],
    [19, 5, 0.01],
    [-21, 19, 1.24],
    [-23.5, 19, 0.64],
    [-1, 16, 0.54],
    [-1, 21, 0.74],
    [12.5, 15, 1.24],
    [12.5, 18.4, 1],
    [12.5, 19.2, 0.76],
    [12.5, 20, 0.52],
    [12.5, 20.8, 0.28],
    [26, 22, 0.64],
    [-21, -29, 3.24],
    [16, -20, 1.64],
    [-20, 7.5, 1.64]
  ];
  const {at, height: datum} = PARK.start,
    start = W([at[0], datum, at[1]]);
  assert.ok(
    Math.abs(world.raycast([start[0], start[1] + 3, start[2]], [0, -1, 0], 6).point[1] - datum) < 0.01,
    'runtime start ray reaches the raised deck'
  );
  for (const [x, z, want] of checks)
    assert.ok(Math.abs(height(x, z) - want) < 0.05, `${x},${z}: ${height(x, z)} want ${want}`);
  for (const [x, z] of [
    [-34, -10],
    [-33, -6],
    [-28, -19],
    [-23, -18.5],
    [-12, -17],
    [8, -10],
    [4, -19]
  ])
    assert.ok(Math.abs(height(x, z) - streetBowlHeight(x, z)) < 0.08, `curved bowl ${x},${z}`);
});

test('bowl and hip triangles face upward and the rays hit the intended transition', () => {
  for (const [x, z, surface] of [
    [-23, -10, 'bowl'],
    [0, -10, 'bowl'],
    [-10, -10.5, 'hip'],
    [-34, -10, 'bowl'],
    [32, -13, 'vert']
  ]) {
    const hit = ground(x, z);
    assert.equal(hit?.surface, surface);
    assert.ok(hit.normal[1] > 0);
  }
});

test('every authored rail has a solid grindable top within five centimetres along its polyline', () => {
  assert.ok(PARK.rails.length >= 10);
  for (const rail of PARK.rails) {
    assert.ok(['rail', 'ledge', 'coping', 'edge'].includes(rail.kind));
    assert.ok(rail.pts.length >= 2);
    for (let i = 1; i < rail.pts.length; i++)
      for (const t of [0, 0.02, 0.25, 0.5, 0.75, 0.98, 1]) {
        const a = rail.pts[i - 1],
          b = rail.pts[i],
          p = a.map((v, k) => v + (b[k] - v) * t);
        assert.equal(
          ground(p[0], p[1])?.surface,
          rail.kind === 'coping' ? (rail.id.startsWith('vert') ? 'vert' : 'bowl') : 'metal'
        );
        assert.ok(
          Math.abs(height(p[0], p[1]) - p[2]) < 0.05,
          `${rail.id} at ${t}: ${height(p[0], p[1])} want ${p[2]}`
        );
      }
  }
});

test('held throttle from the run start drops into the super bowl and transfers to the shallow bowl', () => {
  const {at, toward} = PARK.start,
    r = run(...at, ...toward, 12);
  clean(r);
  assert.ok(r.gaps.includes('SUPER DROP') && r.gaps.includes('BOWL TO BOWL'));
  assert.ok(r.sk.letters.includes('S') && r.sk.letters.includes('K'));
  assert.ok(
    r.landings.some(a => a.kind === 'transfer' && a.from[0] < -10 && a.to[0] > -9.5),
    'a physical hip transfer'
  );
});

test('deep bowl and mini return at held throttle from short 9 m and 3.4 m run-ups', () => {
  for (const throttle of [0.6, 1]) {
    const superBowl = run(-23, -6, -1, 0, 12, throttle),
      mini = run(19, 5, -1, 0, 10, throttle);
    clean(superBowl);
    clean(mini);
    assert.ok(superBowl.gaps.includes('SUPER AIR'));
    assert.ok(mini.events.filter(e => e.type === 'trick' && e.name === 'Backside Air').length >= 3);
  }
});

test('the big vert air and A need only a straight 13 m run-up', () => {
  const r = run(17, -13, 1, 0, 6);
  clean(r);
  assert.ok(r.peak > 6);
  assert.ok(r.gaps.includes('VERT ALERT'));
  assert.ok(r.sk.letters.includes('A'));
});

test('funbox, kicker-to-ledge and stairs each have a clean full-throttle line', () => {
  for (const [line, gap, letter] of [
    [[-33, 19, 1, 0, 4], 'FUNBOX FLIGHT', 'T'],
    [[-1, 13, 0, 1, 3], 'KICKER TO LEDGE', null],
    [[12.5, 11, 0, 1, 2.6], 'STAIR MAIL', 'E']
  ]) {
    const r = run(...line);
    clean(r);
    assert.ok(r.gaps.includes(gap), gap);
    if (letter) assert.ok(r.sk.letters.includes(letter), letter);
    if (gap === 'KICKER TO LEDGE')
      assert.ok(
        r.landings.some(a => a.to[1] >= 20 && a.to[1] <= 22 && a.to[2] > 0.7),
        'lands on the actual ledge'
      );
  }
});

test('the mezzanine bank, drop and hidden tape room are driveable without a launch assist', () => {
  const bank = run(16, -12, 0, -1, 2.2);
  clean(bank);
  assert.ok(L(bank.s.car.pos)[1] > 3);
  const drop = run(-28.5, -29, 0, 1, 3);
  clean(drop);
  assert.ok(drop.gaps.includes('MEZZANINE DROP'));
  const tape = run(-28.5, -24.5, 0, -1, 1.1);
  clean(tape);
  assert.ok(tape.sk.tape);
  assert.ok(!run(-21, -24, -1, 0, 1.6).sk.tape, 'the room conceals the tape from the bowl-side route');
});

test('two-minute driven runs calibrate scores and make the combo goal attainable', t => {
  const plain = run(...PARK.start.at, ...PARK.start.toward, 120),
    grab = run(...PARK.start.at, ...PARK.start.toward, 120, 1, true);
  clean(plain);
  clean(grab);
  t.diagnostic(
    `held throttle: ${plain.sk.score}; throttle + grab: ${grab.sk.score}; best combo: ${grab.sk.best}`
  );
  assert.ok(plain.sk.over && grab.sk.over);
  assert.ok(
    plain.sk.goals.has('high') && plain.sk.goals.has('pro') && !plain.sk.goals.has('sick'),
    `plain ${plain.sk.score}`
  );
  assert.ok(
    grab.sk.goals.has('sick') && grab.sk.goals.has('combo'),
    `grab ${grab.sk.score}, combo ${grab.sk.best}`
  );
});

test('the headline line also works over streamed real terrain and OSM collision', async () => {
  const stream = createStream({
    manifest: read('manifest.json'),
    elevation: terrain,
    fetchTile: key => read(`tile-${key.replace(',', '-')}.json`)
  });
  try {
    await stream.update(P.center);
    assert.ok(stream.ready(P.center));
    addPark(stream.world);
    const r = run(...PARK.start.at, ...PARK.start.toward, 12, 1, false, stream.world);
    clean(r);
    assert.ok(r.gaps.includes('BOWL TO BOWL'));
  } finally {
    stream.dispose();
  }
});
