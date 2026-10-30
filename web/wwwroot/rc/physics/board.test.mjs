import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './world.mjs';
import { createSession, stepSession } from './session.mjs';
import { carUp, carYaw } from './car.mjs';
import { vehicleParams } from './vehicles.mjs';

const flat = () => { const w = createWorld(); w.addQuad([-200, 0, -200], [-200, 0, 200], [200, 0, 200], [200, 0, -200], 'concrete'); return w; };
const ride = (world, input, seconds) => { const s = createSession({ world, start: { pos: [0, .2, 0], yaw: 0 }, checkpoints: [[0, -1e4, 'finish']], secrets: [] }, { mode: 'kid', params: vehicleParams('board') }); s.roam = true; for (let i = 0; i < seconds * 120; i++) stepSession(s, typeof input === 'function' ? input(i / 120) : input, 1 / 120); return s; };

test('the board pushes up to speed in a straight line and stays on its wheels', () => {
  const s = ride(flat(), { throttle: 1 }, 3);
  assert.ok(s.car.speed > 7, `speed ${s.car.speed}`);
  assert.ok(carUp(s.car)[1] > .95 && Math.abs(s.car.pos[0]) < .3, `upright and straight ${s.car.pos}`);
});

test('the board carves a turn without tipping over', () => {
  let minUp = 1; const s = ride(flat(), t => ({ throttle: 1, steer: t > 1 ? 1 : 0 }), 4);
  assert.ok(Math.abs(carYaw(s.car)) > 1.5, `turned ${carYaw(s.car)}`);
  assert.ok(carUp(s.car)[1] > .8, `upright ${carUp(s.car)[1]}`);
});
