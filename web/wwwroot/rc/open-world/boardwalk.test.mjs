import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {createStream} from './stream.mjs';
import {createBoardwalk} from './boardwalk.js';
import {createWorld} from '../physics/world.mjs';
import {createSession, stepSession} from '../physics/session.mjs';
import {placeCar, rideHeight} from '../physics/car.mjs';
import {createSkate, stepSkate} from '../physics/skate.mjs';
import {
  BOARDWALK as P,
  BOARDWALK_PARK as PARK,
  BOARDWALK_SHORE,
  BOARDWALK_FAR_SHORE,
  buildBoardwalk,
  boardwalkHeight,
  boardwalkRampHeight,
  boardwalkWorld as W,
  boardwalkLocal as L
} from './boardwalk.mjs';
const world = createWorld(4);
world.addQuad(W([-100, 0, -100]), W([-100, 0, 100]), W([100, 0, 100]), W([100, 0, -100]), 'dirt');
for (const t of buildBoardwalk()) world.addTri(W(t.a), W(t.b), W(t.c), t.surface);
const frame = p => {
  const l = L(p);
  return [l[0], l[2], l[1]];
};
function run(x, z, dx, dz, seconds, throttle = 1, drift = false, collision = world) {
  const s = createSession(
    {
      world: collision,
      checkpoints: [
        [-668, 3421, 'a'],
        [-667, 3421, 'b']
      ],
      secrets: [],
      start: {pos: W([0, 0, 0]), yaw: 0}
    },
    {mode: 'kid'}
  );
  s.roam = true;
  const p = W([x, 10, z]);
  p[1] = collision.raycast(p, [0, -1, 0], 15).point[1] + rideHeight() + 0.01;
  placeCar(s.car, p, Math.atan2(dx, -dz));
  const sk = createSkate(PARK);
  sk.left = seconds;
  const events = [],
    landings = [],
    path = [];
  let peak = 0;
  for (let f = 0; f < (seconds + 4) * 120 && !sk.over; f++) {
    const input = {throttle, steer: 0, drift};
    stepSession(s, input, 1 / 120);
    const air = sk.air;
    events.push(...stepSkate(sk, s, input, 1 / 120, frame));
    if (air && !sk.air && air.time > 0.3)
      landings.push({kind: air.kind, time: air.time, from: air.from, to: frame(s.car.pos)});
    if (f % 24 === 0) path.push(frame(s.car.pos));
    peak = Math.max(peak, L(s.car.pos)[1]);
  }
  return {s, sk, events, landings, peak, path, gaps: events.filter(e => e.type === 'gap').map(e => e.name)};
}
const clean = r => {
  assert.equal(r.s.hits, 0, 'no wall hits');
  assert.equal(r.s.recoveries, 0, 'no rescue');
  assert.ok(!r.events.some(e => e.type === 'bail'), 'no bail');
};
const ground = (x, z) => world.raycast(W([x, 10, z]), [0, -1, 0], 15);
const lineCases = [
  {line: [...PARK.start.at, ...PARK.start.toward, 2.8], gaps: ['OVER THE SAND'], letters: ['S']},
  {line: [21, -12, 1, 0, 8], gaps: ['BEACH VERT'], letters: ['A']},
  {line: [-28, -11.5, 1, 0, 10], gaps: ['PIT DROP', 'SNAKE HOP', 'PIT AIR'], letters: ['K']},
  {line: [-5, 2, 0, 1, 2.5], gaps: ['BEACH STEPS'], letters: ['T']},
  {line: [8, -1, 0, -1, 2.3], gaps: ['HUT ROOF'], letters: ['E'], tape: true},
  {line: [10, -15, -1, 0, 2], gaps: ['ROOF TO WALK']},
  {line: [-21.5, 3, 1, 0, 1.6], gaps: ['BENCH HOP']},
  {line: [-15, 1, 0, 1, 2.5], gaps: ['DECK TO BEACH']}
];

test('Boardwalk riding surfaces face upward at their authored heights', () => {
  const checks = [
    [-30, -1, 0.84],
    [30, -1, 0.84],
    [-20, 0, 1.64],
    [0, 16, 0.04],
    [-5, 5.4, 1.32],
    [-5, 6.2, 1],
    [-5, 7, 0.68],
    [-5, 7.8, 0.36],
    [-5, 8.6, 0.04],
    [3, 9, 0.84],
    [21, 2.5, 2.19],
    [21, 11.5, 0.74],
    [21, 16, 0.39],
    [8, -14, 3.24],
    [8, -7, 2.44],
    [15, -12, 4.04],
    [27, -12, 4.04],
    [26.5, -3.5, 2.84],
    [-18, 3, 2.09]
  ];
  for (const [x, z, want] of checks) {
    const hit = ground(x, z);
    assert.ok(hit && Math.abs(hit.point[1] - want) < 0.0025, `${x},${z}: ${hit?.point[1]} want ${want}`);
    assert.ok(hit.normal[1] > 0);
  }
  for (const [x, z] of [
    [-26, -11.5],
    [-24, -14],
    [-22, -13],
    [-19, -15],
    [-14, -11.5],
    [-10, -8],
    [-4, -10],
    [-2, -11]
  ]) {
    assert.ok(Math.abs(ground(x, z).point[1] - boardwalkHeight(x, z)) < 0.05, `pit ${x},${z}`);
  }
  for (const x of [16.5, 17.4, 18, 24, 24.6, 25.5]) {
    const hit = ground(x, -12);
    assert.equal(hit.surface, 'vert');
    assert.ok(Math.abs(hit.point[1] - boardwalkRampHeight(x, -12)) < 0.025);
  }
  const start = W([PARK.start.at[0], PARK.start.height, PARK.start.at[1]]);
  assert.ok(
    Math.abs(world.raycast([start[0], start[1] + 3, start[2]], [0, -1, 0], 6).point[1] - PARK.start.height) <
      0.01
  );
  assert.equal(ground(0, 16).surface, 'dirt', 'sand uses the existing slower, lower-grip surface');
  for (const [x, z, want] of [
    [-20, 18.5, 0.045],
    [0, 19.25, 0.045],
    [-20, 20.25, 0.045],
    [20, 20.75, 0.045],
    [0, 25, 0.055]
  ]) {
    const hit = ground(x, z);
    assert.equal(hit.surface, 'dirt', 'shoreline stays safely drivable');
    assert.ok(Math.abs(hit.point[1] - want) < 0.002, `${x},${z}: ${hit.point[1]} want ${want}`);
  }
  for (let i = 1; i < BOARDWALK_SHORE.length; i++) {
    const [x, z] = BOARDWALK_SHORE[i - 1],
      [u, v] = BOARDWALK_SHORE[i],
      near = (z + v) / 2,
      far = (BOARDWALK_FAR_SHORE[i - 1] + BOARDWALK_FAR_SHORE[i]) / 2;
    for (const at of [near + 0.15, (near + far) / 2, far - 0.15])
      assert.ok(
        Math.abs(ground((x + u) / 2, at).point[1] - 0.055) < 0.002,
        'water has a continuous upward-facing floor'
      );
    assert.ok(
      Math.abs(ground((x + u) / 2, far + 0.25).point[1] - 0.0325) < 0.002,
      'far wet sand eases back to terrain'
    );
  }
});

test('all sixty named rails have real tops within five centimetres throughout their polylines', () => {
  assert.ok(PARK.rails.length >= 50);
  assert.equal(new Set(PARK.rails.map(r => r.id)).size, PARK.rails.length);
  for (const r of PARK.rails) {
    assert.ok(['rail', 'ledge', 'coping', 'edge'].includes(r.kind));
    assert.ok(r.pts.length >= 2);
    for (let i = 1; i < r.pts.length; i++)
      for (const t of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
        const a = r.pts[i - 1],
          b = r.pts[i],
          p = a.map((v, k) => v + (b[k] - v) * t),
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          n = Math.hypot(dx, dz);
        assert.ok(n > 0.001);
        const heights = [0, 0.015, -0.015].map(
          d => ground(p[0] - (dz / n) * d, p[1] + (dx / n) * d)?.point[1]
        );
        assert.ok(
          heights.some(h => Math.abs(h - p[2]) < 0.05),
          `${r.id} at ${t}: ${heights} want ${p[2]}`
        );
      }
  }
});

for (const c of lineCases)
  test(`held throttle drives ${c.gaps.join(' / ')}`, () => {
    const r = run(...c.line);
    clean(r);
    for (const gap of c.gaps) assert.ok(r.gaps.includes(gap), `${gap}: ${r.gaps}`);
    for (const letter of c.letters ?? []) assert.ok(r.sk.letters.includes(letter), letter);
    if (c.tape) assert.ok(r.sk.tape, 'tape reached from the roof bank');
    if (c.gaps.includes('OVER THE SAND'))
      assert.ok(
        r.landings.some(a => a.from[1] < 5.5 && a.to[1] >= 12 && a.to[2] > 0.5),
        'lands on the far beach bank'
      );
    if (c.gaps.includes('BEACH VERT')) assert.ok(r.peak > 6, 'air well above the 4 m coping');
    if (c.gaps.includes('BENCH HOP'))
      assert.ok(
        r.events.some(e => e.type === 'trick' && /Grind|50-50/.test(e.name)),
        'the real bench edge locks a grind'
      );
  });

test('the driven matrix covers every gap, letter and the tape', () => {
  assert.equal(new Set(PARK.gaps.map(g => g.name)).size, 10);
  assert.deepEqual(new Set(lineCases.flatMap(c => c.gaps)), new Set(PARK.gaps.map(g => g.name)));
  assert.deepEqual(
    new Set(lineCases.flatMap(c => c.letters ?? [])),
    new Set(PARK.letters.map(l => l.letter))
  );
  assert.ok(lineCases.some(c => c.tape));
});

function verifyShore(collision = world) {
  for (const [x, z, dx, dz, seconds] of [
    [0, 17, 0, 1, 2.6],
    [0, 34, 0, -1, 2.4],
    [-30, 24, 1, 0, 6.4],
    [30, 24, -1, 0, 6.4]
  ]) {
    const r = run(x, z, dx, dz, seconds, 1, false, collision);
    clean(r);
    assert.ok(
      r.path.some(([u, v]) => Math.abs(u) < 24 && v > 22 && v < 28),
      'crosses the actual water'
    );
    if (dz > 0) assert.ok(r.path.at(-1)[1] > 31, 'exits the far shore onto terrain');
    if (dz < 0) assert.ok(r.path.at(-1)[1] < 19, 'returns to the sand');
    if (dx) assert.ok(Math.abs(r.path.at(-1)[0]) > 32, 'exits a tapered end');
  }
}
test('held throttle crosses and exits the lagoon in both directions', () => verifyShore());

test('two-minute vert and winding-pit runs stay clean, with attainable score and combo goals', t => {
  const vert = run(21, -12, 1, 0, 120),
    pit = run(-9, -10.3, 0, 1, 120),
    grab = run(21, -12, 1, 0, 120, 1, true);
  for (const r of [vert, pit, grab]) {
    clean(r);
    assert.ok(r.sk.over);
    assert.ok(r.sk.goals.has('high') && r.sk.goals.has('pro'));
  }
  assert.ok(!vert.sk.goals.has('sick'));
  assert.ok(grab.sk.goals.has('sick') && grab.sk.goals.has('combo'));
  for (const throttle of [0.6, 1]) {
    const r = run(21, -12, 1, 0, 12, throttle);
    clean(r);
    assert.ok(r.events.filter(e => e.type === 'trick' && e.name === 'Backside Air').length >= 3);
  }
  t.diagnostic(
    `vert ${vert.sk.score}; pit ${pit.sk.score}; grab ${grab.sk.score}; best combo ${grab.sk.best}`
  );
});

test('the real batched park, props and streamed terrain preserve all driven lines', async () => {
  const read = name => JSON.parse(fs.readFileSync(new URL(`../assets/world/${name}`, import.meta.url)));
  const stream = createStream({
    manifest: read('manifest.json'),
    elevation: read('playable-terrain.json'),
    fetchTile: key => read(`tile-${key.replace(',', '-')}.json`)
  });
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 1,
      height: 1,
      getContext: () => new Proxy({}, {get: () => () => {}, set: () => true})
    })
  };
  const scene = new T.Scene();
  let park;
  try {
    await stream.update(P.center);
    assert.ok(stream.ready(P.center));
    park = createBoardwalk(scene, stream.world);
    let meshes = 0;
    park.root.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      for (const attribute of Object.values(o.geometry.attributes))
        for (const v of attribute.array) assert.ok(Number.isFinite(v));
    });
    assert.equal(meshes, 1);
    verifyShore(stream.world);
    for (const c of lineCases) {
      const r = run(...c.line, 1, false, stream.world);
      clean(r);
      for (const g of c.gaps) assert.ok(r.gaps.includes(g), g);
      for (const l of c.letters ?? []) assert.ok(r.sk.letters.includes(l), l);
      if (c.tape) assert.ok(r.sk.tape);
    }
  } finally {
    park?.dispose();
    stream.dispose();
    globalThis.document = previous;
  }
  assert.equal(scene.children.length, 0);
});
