import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../physics/world.mjs';
import {createSession, stepSession} from '../physics/session.mjs';
import {carForward} from '../physics/car.mjs';
import {createSkate, stepSkate} from '../physics/skate.mjs';
import {
  PLAYGROUND,
  PLAYGROUND_PARK,
  PLAYGROUND_BOUNDS,
  buildPlayground,
  playgroundWorld,
  DECK,
  FLOOR,
  FORT,
  WAVE,
  SPIRAL,
  SANDPIT,
  LOOKOUT,
  waveY
} from './playground.mjs';

// Local-frame world: the playground sits on bare desert at its local origin.
function yard() {
  const world = createWorld();
  world.addQuad([-60, 0, -60], [-60, 0, 60], [60, 0, 60], [60, 0, -60], 'dirt');
  for (const t of buildPlayground()) world.addTri(t.a, t.b, t.c, t.surface);
  return world;
}
const drop = (world, x, z) => world.raycast([x, 8, z], [0, -1, 0], 20);
function ride(world, pos, yaw, steer, seconds, mode = 'kid') {
  const s = createSession(
    {world, start: {pos, yaw}, checkpoints: [[0, -500, 'finish']], secrets: []},
    {mode}
  );
  let air = 0,
    maxY = 0;
  for (let i = 0; i < seconds * 120; i++) {
    const c = s.car,
      input = steer(c);
    stepSession(s, input, 1 / 120);
    if (!c.contacts) air += 1 / 120;
    maxY = Math.max(maxY, c.pos[1]);
    if (input.stop?.(c)) break;
  }
  return {s, air, maxY};
}
const heading = c => {
  const f = carForward(c);
  return Math.atan2(f[0], f[2]);
};
const toward = (c, want) => {
  const d = want - heading(c);
  return -Math.atan2(Math.sin(d), Math.cos(d)) * 2;
};

test('the playground is finite, in its footprint and faces the car from the right side', () => {
  const tris = buildPlayground();
  assert.ok(tris.length > 4000);
  for (const t of tris)
    for (const p of [t.a, t.b, t.c]) {
      assert.ok(p.every(Number.isFinite));
      const [x, , z] = playgroundWorld(p);
      assert.ok(
        x >= PLAYGROUND_BOUNDS[0] &&
          x <= PLAYGROUND_BOUNDS[2] &&
          z >= PLAYGROUND_BOUNDS[1] &&
          z <= PLAYGROUND_BOUNDS[3],
        `${p}`
      );
    }
  const world = yard();
  assert.equal(drop(world, 0, -2).point[1].toFixed(2), DECK.toFixed(2));
  assert.equal(drop(world, -17, -2).point[1].toFixed(2), DECK.toFixed(2));
  assert.equal(drop(world, 20, 20).surface, 'softfall');
  assert.equal(drop(world, -32, -1).surface, 'sand');
  for (const z of [-8, -12, -16, -20])
    assert.ok(Math.abs(drop(world, -4.2, z).point[1] - waveY(z)) < 0.02, `wave at ${z}`);
});

test('a kid drives in the gate, up the ramp and onto the fort deck', () => {
  const world = yard(),
    {s} = ride(
      world,
      [0, 0.2, 27],
      0,
      c => ({throttle: 1, steer: toward(c, Math.PI), stop: c => c.pos[2] < -1}),
      12
    );
  assert.ok(s.car.pos[2] < 1.5 && s.car.pos[1] > DECK - 0.1, `${s.car.pos}`);
});

test('the wave slide throws the car into the air and runs out on the softfall', () => {
  const world = yard(),
    x = (WAVE.x[0] + WAVE.x[1]) / 2;
  const {s, air} = ride(
    world,
    [x, DECK + 0.2, -4.5],
    0,
    c => ({throttle: 1, steer: toward(c, Math.PI), stop: c => c.pos[2] < WAVE.runout}),
    10
  );
  assert.ok(s.car.pos[2] < WAVE.runout + 0.5 && s.car.pos[1] < FLOOR + 0.2, `${s.car.pos}`);
  assert.ok(air > 0.15, `air ${air}`);
  assert.equal(s.recoveries, 0);
});

test('the drop slide kicker sends a car over the sandpit and the bridge carries it to the lookout', () => {
  const world = yard();
  const send = ride(
    world,
    [-17.5, DECK + 0.1, -2],
    -Math.PI / 2,
    c => ({
      throttle: 1,
      steer: toward(c, -Math.PI / 2),
      stop: c => c.contacts === 4 && c.pos[0] < -28 && c.pos[1] < 0.2
    }),
    8
  );
  const [x, , z] = send.s.car.pos;
  assert.ok(
    x > SANDPIT.x[0] && x < SANDPIT.x[1] && z > SANDPIT.z[0] && z < SANDPIT.z[1],
    `landed ${send.s.car.pos}`
  );
  assert.ok(send.air > 0.5, `air ${send.air}`);
  const cross = ride(
    world,
    [FORT.x[0] + 1, DECK + 0.1, -2],
    -Math.PI / 2,
    c => ({throttle: 0.6, steer: toward(c, -Math.PI / 2), stop: c => c.pos[0] < LOOKOUT.x[1] - 1}),
    8
  );
  assert.ok(cross.s.car.pos[0] < LOOKOUT.x[1] - 0.5 && cross.s.car.pos[1] > DECK - 0.1, `${cross.s.car.pos}`);
});

test('the spiral slide carries a car that holds the middle all the way down', () => {
  const world = yard(),
    [cx, cz] = SPIRAL.center;
  for (const throttle of [0.4, 1]) {
    const {s} = ride(
      world,
      [SPIRAL.from + 0.6, DECK + 0.1, SPIRAL.start[1]],
      -Math.PI / 2 + Math.PI,
      c => {
        const [x, , z] = c.pos,
          r = Math.hypot(x - cx, z - cz),
          a = Math.atan2(z - cz, x - cx);
        if (x < SPIRAL.start[0] - 0.3 && z < cz - SPIRAL.r + 1)
          return {throttle, steer: toward(c, Math.PI / 2)};
        // Tangent heading for the increasing-angle helix, eased back toward the centreline.
        const tangent =
          Math.atan2(-Math.sin(a), Math.cos(a)) + Math.max(-0.6, Math.min(0.6, (SPIRAL.r - r) * 0.8));
        return {
          throttle,
          steer: toward(c, c.pos[1] < FLOOR + 0.2 && z > cz ? 0 : tangent),
          stop: c => c.pos[1] < FLOOR + 0.2 && c.pos[2] > cz + 2
        };
      },
      20
    );
    assert.ok(s.car.pos[1] < FLOOR + 0.2 && s.car.pos[2] > cz + 2, `throttle ${throttle}: ${s.car.pos}`);
    assert.equal(s.recoveries, 0);
  }
});

test('every gap, letter and the tape sit inside the playground', () => {
  const [hx, hz] = PLAYGROUND.half;
  for (const l of PLAYGROUND_PARK.letters) assert.ok(Math.abs(l.at[0]) < hx && Math.abs(l.at[1]) < hz);
  for (const g of PLAYGROUND_PARK.gaps)
    for (const r of [g.from, g.to])
      assert.ok(r[0] < r[1] && r[2] < r[3] && r[0] >= -hx && r[1] <= hx && r[2] >= -hz && r[3] <= hz, g.name);
  assert.ok(PLAYGROUND_PARK.goals.some(g => g.gap === 'SANDPIT SEND'));
});

test('skating the drop slide scores the sandpit send and collects the E', () => {
  const world = yard(),
    sk = createSkate(PLAYGROUND_PARK, []),
    events = [];
  const s = createSession(
    {
      world,
      start: {pos: [-17.5, DECK + 0.15, -2], yaw: -Math.PI / 2},
      checkpoints: [[0, -500, 'finish']],
      secrets: []
    },
    {mode: 'kid'}
  );
  for (let i = 0; i < 360; i++) {
    stepSession(s, {throttle: 1}, 1 / 120);
    events.push(...stepSkate(sk, s, {throttle: 1}, 1 / 120, p => [p[0], p[2], p[1]]));
  }
  assert.ok(events.some(e => e.type === 'gap' && e.name === 'SANDPIT SEND'));
  assert.ok(events.some(e => e.type === 'letter' && e.letter === 'E'));
  assert.ok(sk.score > 0);
});
