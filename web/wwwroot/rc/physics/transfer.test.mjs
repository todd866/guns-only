import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from './world.mjs';
import {createCar, stepCar, carUp} from './car.mjs';
import {assistInput, createAssist} from './assists.mjs';

function floorWorld() {
  const world = createWorld();
  world.addQuad([-20, 0, -20], [-20, 0, 20], [20, 0, 20], [20, 0, -20], 'concrete');
  return world;
}

test('air transfer torque rotates attitude but never injects horizontal speed', () => {
  const world = floorWorld();
  const a = createCar(undefined, [0, 0.75, 0], 0);
  const b = createCar(undefined, [0, 0.75, 0], 0);
  a.vel = b.vel = [1.5, 3.2, -6];
  const assist = createAssist('bigKid');
  let maxTorque = 0;
  let maxHorizontalDelta = 0;
  let minUp = 1;
  for (let i = 0; i < 30; i++) {
    const input = assistInput(assist, a, {throttle: 1, steer: 1}, 1 / 120);
    maxTorque = Math.max(maxTorque, Math.hypot(...input.torque));
    const before = Math.hypot(a.vel[0], a.vel[2]);
    stepCar(a, input, world);
    stepCar(b, {throttle: 0, steer: 0}, world);
    if (!a.contacts) minUp = Math.min(minUp, carUp(a)[1]);
    maxHorizontalDelta = Math.max(maxHorizontalDelta, Math.abs(Math.hypot(a.vel[0], a.vel[2]) - before));
  }
  assert.ok(maxTorque < 0.3, `bounded air torque ${maxTorque}`);
  assert.ok(maxHorizontalDelta < 0.12, `transfer did not inject horizontal speed ${maxHorizontalDelta}`);
  assert.ok(minUp < 0.9999, `steer input visibly shapes airborne attitude (${minUp})`);
});
