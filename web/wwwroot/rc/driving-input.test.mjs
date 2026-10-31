import test from 'node:test';
import assert from 'node:assert/strict';
import {drivingInput, flightInput} from './driving-input.mjs';
test('reference controls retain transmitter aliases and drift is opt-in', () => {
  assert.deepEqual(drivingInput(new Set(['KeyX', 'ArrowRight'])), {
    throttle: 1,
    steer: 1,
    brake: false,
    drift: false
  });
  assert.equal(drivingInput(new Set(['KeyZ'])).brake, true);
  assert.equal(drivingInput(new Set(['ShiftLeft'])).drift, true);
  assert.deepEqual(drivingInput(new Set(['KeyW', 'KeyA'])), drivingInput(new Set(['KeyX', 'ArrowLeft'])));
  assert.equal(drivingInput(new Set(), {drift: true}).drift, true);
});
test('Space is not the brake, and flight keys follow the guns-only jet (F boost is a toggle in main.js)', () => {
  assert.equal(drivingInput(new Set(['Space'])).brake, false);
  const f = flightInput(new Set(['ArrowDown', 'ArrowRight', 'KeyA', 'KeyW', 'Space']));
  assert.deepEqual(f, {pitch: 1, roll: 1, yaw: -1, power: 1, burner: false});
  assert.equal(flightInput(new Set(['ArrowUp'])).pitch, -1);
});
