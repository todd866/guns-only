import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './world.mjs';
import { createSession, stepSession } from './session.mjs';
import { carUp, carForward } from './car.mjs';
import { vehicleParams } from './vehicles.mjs';
import { WATER_BODIES, WATER, basinTriangles, waterHeight, bodyAt } from './water.mjs';

const pool = WATER_BODIES.find(b => b.id === 'wavepool');
function world() {
  const w = createWorld();
  const [x0, z0, x1, z1] = pool.rect, m = 30;
  // Dry ground around the basin (four strips), then the basin itself.
  w.addQuad([x0 - m, 0, z0 - m], [x0 - m, 0, z1 + m], [x0, 0, z1 + m], [x0, 0, z0 - m], 'asphalt');
  w.addQuad([x1, 0, z0 - m], [x1, 0, z1 + m], [x1 + m, 0, z1 + m], [x1 + m, 0, z0 - m], 'asphalt');
  w.addQuad([x0, 0, z0 - m], [x0, 0, z0], [x1, 0, z0], [x1, 0, z0 - m], 'asphalt');
  w.addQuad([x0, 0, z1], [x0, 0, z1 + m], [x1, 0, z1 + m], [x1, 0, z1], 'asphalt');
  for (const [a, b, c] of basinTriangles(pool)) w.addTri(a, b, c, 'water');
  return w;
}
const session = (pos, yaw, kind = 'buggy') => createSession({ world: world(), start: { pos, yaw }, checkpoints: [[0, -1e4, 'finish']], secrets: [] }, { mode: 'kid', params: vehicleParams(kind) });
const run = (s, seconds, input) => { for (let i = 0; i < seconds * 120; i++) { WATER.time += 1 / 120; stepSession(s, input, 1 / 120); } };
const mid = [(pool.rect[0] + pool.rect[2]) / 2, (pool.rect[1] + pool.rect[3]) / 2];

test('a car in deep water floats on the waves, upright, off the basin floor', () => {
  for (const kind of ['buggy', 'monster', 'golf']) {
    const s = session([mid[0], .4, mid[1]], 0, kind);
    run(s, 4, {});
    const h = waterHeight(pool, s.car.pos[0], s.car.pos[2]);
    assert.ok(Math.abs(s.car.pos[1] - h) < .12, `${kind} rides the surface: car ${s.car.pos[1].toFixed(3)} water ${h.toFixed(3)}`);
    assert.ok(carUp(s.car)[1] > .9, `${kind} upright`);
    assert.ok(s.car.floating > .25, `${kind} floating ${s.car.floating}`);
  }
});

test('drives in from the beach, crosses the pool as a boat and steers', () => {
  const s = session([pool.rect[0] - 6, .2, mid[1]], Math.PI / 2);
  let floated = 0, maxSpeed = 0;
  for (let i = 0; i < 120 * 30 && s.car.pos[0] < pool.rect[2] + 4; i++) { WATER.time += 1 / 120; stepSession(s, { throttle: 1 }, 1 / 120); if (s.car.floating > .25) floated++; maxSpeed = Math.max(maxSpeed, Math.hypot(s.car.vel[0], s.car.vel[2])); }
  assert.ok(floated > 120, `floated ${floated / 120}s`);
  assert.ok(s.car.pos[0] > pool.rect[2], `crossed and climbed out: x ${s.car.pos[0].toFixed(1)}`);
  assert.ok(maxSpeed > 4, `boat speed ${maxSpeed}`);
  const t = session([mid[0], .4, mid[1]], 0);
  run(t, 1.5, { throttle: 1 });
  const before = Math.atan2(carForward(t.car)[0], -carForward(t.car)[2]);
  run(t, 1.5, { throttle: 1, steer: 1 });
  const after = Math.atan2(carForward(t.car)[0], -carForward(t.car)[2]);
  assert.ok(Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before))) > .8, 'steering turns the boat');
});

test('a flipped car rights itself in the water', () => {
  const s = session([mid[0], .4, mid[1]], 0);
  s.car.q = [1, 0, 0, 0];   // upside down
  run(s, 5, {});
  assert.ok(carUp(s.car)[1] > .8, `up ${carUp(s.car)[1]}`);
});

test('dry land is unaffected', () => {
  assert.equal(bodyAt(0, 0), null);
});
