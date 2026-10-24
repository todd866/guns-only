import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './world.mjs';
import { createCar, rideHeight } from './car.mjs';
import { createDrift, stepDrift, DRIFT } from './drift.mjs';
import { createSession, stepSession } from './session.mjs';
import { carYaw, carForward } from './car.mjs';
import { dot } from './math.mjs';

function flatCar() {
  const world = createWorld();
  world.addQuad([-20, 0, -20], [-20, 0, 20], [20, 0, 20], [20, 0, -20], 'asphalt');
  const car = createCar(undefined, [0, rideHeight(), 0]);
  car.grounded = true; car.contacts = 4; car.forwardSpeed = 6; car.speed = 6;
  return { world, car };
}

test('drift starts only on a press edge at speed and is bounded', () => {
  const { car } = flatCar(), d = createDrift();
  assert.equal(stepDrift(d, car, { drift: true, steer: 1 }).active, true);
  assert.equal(stepDrift(d, car, { drift: true, steer: 1 }).hop, 0);
  for (let i = 0; i < 120; i++) stepDrift(d, car, { drift: true, steer: 1 });
  assert.equal(d.active, false);
  assert.ok(d.cooldown >= 0 && d.cooldown <= DRIFT.cooldown);
});

test('drift never starts while stopped or airborne and release cancels it', () => {
  const { car } = flatCar(), d = createDrift();
  car.forwardSpeed = 0; car.speed = 0;
  assert.equal(stepDrift(d, car, { drift: true }).active, false);
  car.forwardSpeed = 6; car.speed = 6; car.grounded = false; car.contacts = 0;
  assert.equal(stepDrift(d, car, { drift: false }).active, false);
  car.grounded = true; car.contacts = 4;
  assert.equal(stepDrift(d, car, { drift: true }).active, true);
  assert.equal(stepDrift(d, car, { drift: false }).active, false);
});

test('drift hop has measurable but bounded airtime and straight hops do not steer', () => {
  const world = createWorld();
  world.addQuad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50], 'asphalt');
  const course = { world, start: { pos: [0, 0, 20], yaw: 0 }, checkpoints: [[0, -40, 'finish']], secrets: [] };
  const run = drift => {
    const s = createSession(course, { mode: 'bigKid' });
    for (let i = 0; i < 180; i++) stepSession(s, { throttle: 1 });
    const yaw = carYaw(s.car), y0 = s.car.pos[1]; let maxY = y0, air = 0;
    for (let i = 0; i < 90; i++) { stepSession(s, { throttle: 1, drift }, 1 / 120); maxY = Math.max(maxY, s.car.pos[1]); air += s.car.contacts === 0; }
    return { yaw: carYaw(s.car) - yaw, maxY: maxY - y0, air };
  };
  const straight = run(false), hop = run(true);
  assert.ok(hop.maxY > 0.01, `hop ${hop.maxY}`);
  assert.ok(hop.air > 0 && hop.air <= Math.ceil(DRIFT.maxAirTime * 120), `air ${hop.air}`);
  assert.ok(Math.abs(hop.yaw - straight.yaw) < 0.05, `straight yaw ${hop.yaw} vs ${straight.yaw}`);
});

test('left and right drifts are symmetric and remain finite', () => {
  const world = createWorld();
  world.addQuad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50], 'asphalt');
  const course = { world, start: { pos: [0, 0, 20], yaw: 0 }, checkpoints: [[0, -40, 'finish']], secrets: [] };
  const run = steer => {
    const s = createSession(course, { mode: 'bigKid' });
    for (let i = 0; i < 180; i++) stepSession(s, { throttle: 1 });
    for (let i = 0; i < 90; i++) stepSession(s, { throttle: 1, steer, drift: true });
    return { x: s.car.pos[0], yaw: carYaw(s.car), speed: s.car.speed };
  };
  const left = run(-1), right = run(1);
  assert.ok(left.x < -0.5 && right.x > 0.5, `x ${left.x}, ${right.x}`);
  assert.ok(Math.abs(left.x + right.x) < 0.05, `x symmetry ${left.x}, ${right.x}`);
  assert.ok(Math.abs(left.yaw + right.yaw) < 0.05, `yaw symmetry ${left.yaw}, ${right.yaw}`);
  assert.ok(left.speed < 16 && right.speed < 16);
});

test('drift actually relaxes lateral tyre correction', () => {
  const world = createWorld();
  world.addQuad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50], 'asphalt');
  const course = { world, start: { pos: [0, 0, 20], yaw: 0 }, checkpoints: [[0, -40, 'finish']], secrets: [] };
  const run = drift => {
    const s = createSession(course, { mode: 'bigKid' });
    for (let i = 0; i < 180; i++) stepSession(s, { throttle: 1 });
    let lateralVelocity = 0, slippedWheels = 0;
    for (let i = 0; i < 90; i++) {
      stepSession(s, { throttle: 1, steer: 1, drift }, 1 / 120);
      const f = carForward(s.car);
      lateralVelocity += Math.abs(dot(s.car.vel, [f[2], 0, -f[0]]));
      slippedWheels += s.car.wheels.filter(w => w.slip).length;
    }
    return { lateralVelocity, slippedWheels };
  };
  const normal = run(false), sliding = run(true);
  assert.ok(sliding.lateralVelocity > normal.lateralVelocity * 1.2, `${normal.lateralVelocity} -> ${sliding.lateralVelocity}`);
  assert.ok(sliding.slippedWheels > normal.slippedWheels, `${normal.slippedWheels} -> ${sliding.slippedWheels}`);
});

test('a straight hop acquires its first turn and ignores held countersteer', () => {
  const { car } = flatCar(), d = createDrift();
  car.forwardSpeed = 6; car.speed = 6;
  assert.equal(stepDrift(d, car, { drift: true, steer: 0 }).active, true);
  assert.equal(d.direction, 0);
  stepDrift(d, car, { drift: true, steer: 1 });
  assert.equal(d.direction, 1);
  stepDrift(d, car, { drift: true, steer: -1 });
  assert.equal(d.direction, 1);
  assert.equal(stepDrift(d, car, { drift: false, steer: -1 }).active, false);
});

test('the same drift input tape is deterministic and hop height stays bounded', () => {
  const world = createWorld();
  world.addQuad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50], 'asphalt');
  const course = { world, start: { pos: [0, 0, 20], yaw: 0 }, checkpoints: [[0, -40, 'finish']], secrets: [] };
  const run = () => {
    const s = createSession(course, { mode: 'bigKid' });
    for (let i = 0; i < 180; i++) stepSession(s, { throttle: 1 });
    const y0 = s.car.pos[1]; let maxY = y0;
    for (let i = 0; i < 120; i++) {
      const input = i < 2 ? { throttle: 1, drift: true, steer: 0 } : { throttle: 1, drift: i < 90, steer: i < 45 ? 1 : -1 };
      stepSession(s, input, 1 / 120); maxY = Math.max(maxY, s.car.pos[1]);
    }
    return { pos: [...s.car.pos], q: [...s.car.q], maxRise: maxY - y0 };
  };
  const a = run(), b = run();
  assert.deepEqual(a.pos, b.pos);
  assert.deepEqual(a.q, b.q);
  assert.ok(a.maxRise > 0.01 && a.maxRise < 0.08, `rise ${a.maxRise}`);
});

test('big kid stays forgiving on a steering tape without requiring drift', () => {
  const world = createWorld();
  world.addQuad([-40, 0, -40], [-40, 0, 40], [40, 0, 40], [40, 0, -40], 'asphalt');
  const s = createSession({ world, start: { pos: [0, 0, 20], yaw: 0 }, checkpoints: [[0, -20, 'finish']], secrets: [] }, { mode: 'bigKid' });
  for (let i = 0; i < 600; i++) stepSession(s, { throttle: 1, steer: Math.sin(i / 42) * 0.65 });
  assert.ok(s.car.pos.every(Number.isFinite));
  assert.ok(s.car.speed < 16, `speed ${s.car.speed}`);
  assert.ok(Math.abs(s.car.ang[1]) < 8, `yaw rate ${s.car.ang[1]}`);
});

test('recovery clears a slide and holding drift cannot hop again at the spawn', async () => {
 const {placeCar}=await import('./car.mjs');const {createAssist,assistInput}=await import('./assists.mjs');
 const {car}=flatCar(),a=createAssist('bigKid');assistInput(a,car,{},1/120);assistInput(a,car,{drift:true,steer:1},1/120);assert.equal(a.drift.active,true);
 placeCar(car,[0,rideHeight(),0],0);car.forwardSpeed=6;assistInput(a,car,{drift:true,steer:1},1/120);assert.equal(a.drift.active,false);assert.equal(car.vel[1],0);
});
