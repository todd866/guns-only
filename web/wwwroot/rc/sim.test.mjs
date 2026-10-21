import test from 'node:test'; import assert from 'node:assert/strict';
import { baseCourse, checkpoints, aircraft } from './sim.mjs';
import { createSession, stepSession, recover, readout } from './physics/session.mjs';
import { rideHeight, carUp, BUGGY } from './physics/car.mjs';
import { quatAxisAngle } from './physics/math.mjs';
import { createWorld, addBox } from './physics/world.mjs';

const course = baseCourse();
const at = (pos, yaw = 0, mode = 'bigKid', c = course) => createSession({ ...c, start: { pos, yaw } }, { mode });
const run = (s, input, n) => { for (let i = 0; i < n; i++) stepSession(s, input); return s; };
const OPEN = [-40, 0, 30];   // open asphalt in the west of the base

test('settles at ride height with natural sag and stays still', () => {
  const s = run(at(OPEN), {}, 240);
  assert.ok(Math.abs(s.car.pos[1] - rideHeight()) < 0.003, `y ${s.car.pos[1]}`);
  assert.ok(s.car.speed < 0.01); assert.equal(s.car.contacts, 4);
});

test('same input tape gives the same trajectory', () => {
  const tape = i => ({ throttle: i < 200 ? 1 : 0.4, steer: Math.sin(i / 40) });
  const a = at(OPEN), b = at(OPEN);
  for (let i = 0; i < 600; i++) { stepSession(a, tape(i)); stepSession(b, tape(i)); }
  assert.deepEqual(a.car.pos, b.car.pos); assert.deepEqual(a.car.q, b.car.q);
});

test('accelerates 0–9 m/s in about a second, tops out near 13 m/s, brakes short', () => {
  const s = at([0, 0, 40], 0); let t9 = null;
  for (let i = 0; i < 480; i++) { stepSession(s, { throttle: 1 }); if (t9 === null && s.car.forwardSpeed > 9) t9 = i / 120; }
  assert.ok(t9 > 0.6 && t9 < 1.4, `t9 ${t9}`);
  assert.ok(s.car.forwardSpeed > 11.5 && s.car.forwardSpeed < 14, `top ${s.car.forwardSpeed}`);
  const z0 = s.car.pos[2]; run(s, { brake: true }, 360);
  assert.ok(s.car.speed < 0.2 && Math.abs(s.car.pos[2] - z0) < 9, `stop ${Math.abs(s.car.pos[2] - z0)}`);
});

test('throttle back brakes then reverses, reverse is bounded', () => {
  const s = run(at(OPEN), { throttle: -1 }, 300);
  assert.ok(s.car.forwardSpeed < -3 && s.car.forwardSpeed > -5.1, `rev ${s.car.forwardSpeed}`);
});

test('positive steer turns right; full lock at speed slides the tyres', () => {
  const s = run(at(OPEN), { throttle: 1 }, 120);
  let slid = 0; for (let i = 0; i < 120; i++) { stepSession(s, { throttle: 1, steer: 1 }); slid += s.car.wheels.some(w => w.slip); }
  assert.ok(readout(s).yaw > 0.3, `yaw ${readout(s).yaw}`); assert.ok(slid > 10, `slid ${slid}`);
});

test('kid mode keeps speed through a full-lock turn and does not spin', () => {
  const s = run(at(OPEN, 0, 'kid'), { throttle: 1 }, 180);
  run(s, { throttle: 1, steer: 1 }, 240);
  assert.ok(s.car.speed > 6, `speed ${s.car.speed}`);
  assert.ok(Math.abs(s.car.ang[1]) < 3, `yaw rate ${s.car.ang[1]}`);
});

test('ramp jump flies and lands on its wheels', () => {
  for (const mode of ['kid', 'bigKid']) {
    const s = at([22, 0, -14], 0, mode); let maxY = 0, air = 0;
    for (let i = 0; i < 480; i++) { stepSession(s, { throttle: 1 }); maxY = Math.max(maxY, s.car.pos[1]); air += !s.car.contacts; }
    assert.ok(maxY > 1.1 && maxY < 2, `${mode} peak ${maxY}`); assert.ok(air / 120 > 0.4, `${mode} air ${air / 120}`);
    assert.ok(carUp(s.car)[1] > 0.9 && s.car.contacts >= 3, `${mode} landed`);
  }
});

test('upside-down: kid mode rights itself, Big Kid stays on its roof until R', () => {
  for (const [mode, rights] of [['kid', true], ['bigKid', false]]) {
    const s = at(OPEN, 0, mode); s.car.q = quatAxisAngle([0, 0, 1], Math.PI); s.car.pos[1] = 0.3;
    run(s, {}, 480);
    assert.equal(carUp(s.car)[1] > 0.9, rights, `${mode} up ${carUp(s.car)[1]}`);
    if (!rights) { recover(s); run(s, {}, 120); assert.ok(carUp(s.car)[1] > 0.9); }
  }
});

test('recovery is free in kid mode and costs 3 s in Big Kid', () => {
  for (const [mode, cost] of [['kid', 0], ['bigKid', 3]]) {
    const s = createSession(course, { mode }); s.running = true; s.gate = 3; s.time = 10;
    recover(s); assert.equal(s.time, 10 + cost);
    assert.ok(Math.hypot(s.car.pos[0] - checkpoints[2][0], s.car.pos[2] - checkpoints[2][1]) < 0.01);
  }
});

test('walls stop the car at top speed: house, bollard, thin wall', () => {
  const thin = createWorld(); thin.addQuad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50], 'asphalt');
  addBox(thin, 0, -10, 6, 0.02, 0, 0.5);
  const wallCourse = { world: thin, checkpoints: [[0, -40, 'x']], secrets: [] };
  const s = run(at([0, 0, 20], 0, 'bigKid', wallCourse), { throttle: 1 }, 600);
  assert.ok(s.car.pos[2] > -10, `tunnelled to ${s.car.pos[2]}`); assert.ok(s.hits > 0);
  const h = run(at([-15, 0, -2], 0), { throttle: 1 }, 360);
  assert.ok(h.car.pos[2] > -8.1, `house ${h.car.pos[2]}`);
  const b = run(at([-4.4, 0, -36]), { throttle: 1 }, 240);
  assert.ok(b.car.pos[2] > -40 + 0.08, `bollard ${b.car.pos[2]}`);
});

test('drives beneath a parked jet\'s wing but not through its landing gear', () => {
  const s = run(at([38, 0, -14], Math.PI), { throttle: 0.6 }, 240);
  assert.ok(s.car.pos[2] > -5, `under wing ${s.car.pos[2]}`);
  const g = run(at([aircraft[0].x - 1, 0, -11], Math.PI), { throttle: 0.6 }, 240);
  assert.ok(g.car.pos[2] < -8.3 && g.hits > 0, `gear ${g.car.pos[2]}`);
});

test('a steering controller drives the full route, in both modes, without recovery', () => {
  for (const mode of ['kid', 'bigKid']) {
    const s = createSession(course, { mode });
    for (let i = 0; i < 120 * 120 && !s.finished; i++) {
      const r = readout(s), [x, z] = checkpoints[s.gate];
      const e = Math.atan2(x - r.x, -(z - r.z)) - r.yaw, err = Math.atan2(Math.sin(e), Math.cos(e));
      stepSession(s, { throttle: r.speed > 6 ? 0.3 : 1, steer: Math.max(-1, Math.min(1, err * 2)) });
    }
    assert.ok(s.finished, `${mode} gate ${s.gate}`); assert.equal(s.recoveries, 0);
    assert.ok(s.time > 10 && s.time < 60, `${mode} time ${s.time}`);
  }
});

test('flying over a gate or specimen does not count', () => {
  const s = at([0, 0, 0]); s.car.pos = [0, 15, 0]; stepSession(s, {}); assert.equal(s.gate, 0);
  s.car.pos = [33, 15, 25]; stepSession(s, {}); assert.equal(s.found, 0);
  s.car.pos = [33, rideHeight(), 25]; s.car.vel = [0, 0, 0]; stepSession(s, {}); assert.equal(s.found, 1);
});

test('energy does not grow: a 60 s bumpy drive stays bounded', () => {
  const s = createSession(course, { mode: 'bigKid' }); let maxAng = 0;
  for (let i = 0; i < 120 * 60; i++) { stepSession(s, { throttle: 1, steer: Math.sin(i / 90) }); maxAng = Math.max(maxAng, Math.hypot(...s.car.ang)); }
  assert.ok(Number.isFinite(s.car.pos[0]) && s.car.speed < 16 && maxAng < 60, `speed ${s.car.speed} ang ${maxAng}`);
});

test('a rubber trampoline throws the car higher than concrete', () => {
  const peak = surface => { const w = createWorld(); w.addQuad([-20, 0, -20], [-20, 0, 20], [20, 0, 20], [20, 0, -20], surface);
    const s = at([0, 0, 0], 0, 'bigKid', { world: w, checkpoints: [[90, 90, 'x']], secrets: [] }); s.car.pos[1] = 0.9;
    let top = 0, falling = false; for (let i = 0; i < 360; i++) { stepSession(s, {}); if (s.car.vel[1] > 0.1) falling = true; if (falling) top = Math.max(top, s.car.pos[1]); } return top; };
  const rubber = peak('rubber'), concrete = peak('concrete');
  assert.ok(rubber > concrete + 0.1, `rubber ${rubber.toFixed(2)} concrete ${concrete.toFixed(2)}`);
});

test('kid mode unsticks a car wedged against a wall with the throttle held; Big Kid does not', () => {
  for (const [mode, unsticks] of [['kid', true], ['bigKid', false]]) {
    const w = createWorld(); w.addQuad([-20, 0, -20], [-20, 0, 20], [20, 0, 20], [20, 0, -20], 'asphalt'); addBox(w, 0, -3, 4, 0.3, 0, 1);
    const s = createSession({ world: w, checkpoints: [[0, 5, 'a'], [0, -10, 'b']], secrets: [], start: { pos: [0, 0, 5], yaw: 0 } }, { mode });
    s.gate = 1; run(s, { throttle: 1 }, 120 * 5);
    assert.equal(s.recoveries > 0, unsticks, `${mode} recoveries ${s.recoveries}`);
  }
});
