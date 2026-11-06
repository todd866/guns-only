// The owner's rule (6 Nov 2026): flight controls "should work the same across
// guns-only, helicopter and rc". One synthetic 8BitDo pad is read by each
// surface's mapper — the toy/plane reader (pad_flight.mjs, also the co-op
// chopper pilot's), the RC mapper (gamepad.mjs) and the Cobra's
// (cobra_pilot_input.js) — and the same buttons must mean the same thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FLIGHT_PAD, faceIndex, leverAxis, pedalAxis} from './flight_layout.mjs';
import {mapPad} from './gamepad.mjs';
import {readFlightPad} from '../render/split/pad_flight.mjs';
import {cobraGamepadControlAxes, cobraGamepadCombatState} from '../render/cobra/cobra_pilot_input.js';

const buttons = (analog = {}) =>
  Array.from({length: 17}, (_, i) => ({value: analog[i] ?? 0, pressed: (analog[i] ?? 0) > 0.5}));
const pad = (axes = [0, 0, 0, 0], analog = {}, id = '8BitDo Ultimate 2') => ({
  connected: true,
  id,
  index: 0,
  mapping: 'standard',
  axes,
  buttons: buttons(analog),
});

test('the layout names the standard-mapping rows every mapper uses', () => {
  assert.deepEqual(
    {...FLIGHT_PAD},
    {LS_X: 0, LS_Y: 1, RS_X: 2, RS_Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9}
  );
  assert.equal(pedalAxis(true, false), -1, 'left pedal');
  assert.equal(pedalAxis(false, true), 1, 'right pedal');
  assert.equal(leverAxis(1, 0), 1, 'RT raises the lever');
  assert.equal(leverAxis(0, 1), -1, 'LT lowers it');
});

test('RT raises the throttle/collective lever on every surface', () => {
  const p = pad([0, 0, 0, 0], {7: 1});
  assert.equal(readFlightPad(p).throttleRate, 1, 'toy planes and the co-op chopper');
  assert.equal(mapPad('fly', p).power, 1, 'RC planes');
  const rc = mapPad('chopper', p);
  assert.equal(rc.power, 1, 'RC chopper collective');
  assert.equal(rc.climb, 1, 'and the collective is the vertical');
  assert.equal(cobraGamepadControlAxes(p, 0).collectiveRate, 1, 'cobra collective');
});

test('LB is the left pedal / rudder on every surface', () => {
  const p = pad([0, 0, 0, 0], {4: 1});
  assert.equal(readFlightPad(p).rudder, -1, 'toy planes and the co-op chopper');
  assert.equal(mapPad('fly', p).yaw, -1, 'RC planes');
  assert.equal(mapPad('chopper', p).yaw, -1, 'RC chopper pedals');
  assert.equal(cobraGamepadControlAxes(p, 0).yaw, -1, 'cobra pedals');
});

test('pulling the left stick back raises the nose on every surface', () => {
  const p = pad([0, 1, 0, 0]); // browser Y is positive when pulled
  assert.equal(readFlightPad(p).pitch, 1, 'toy planes and the co-op chopper: pull = nose up');
  assert.equal(mapPad('chopper', p).pitch, 1, 'RC chopper cyclic: pull = nose up = slow');
  assert.equal(
    cobraGamepadControlAxes(p, 0).forwardCyclic,
    -1,
    'cobra: pull is aft cyclic (forward-positive frame)'
  );
});

test('the right stick never flies: it is the look stick on every surface', () => {
  const p = pad([0, 0, -1, 1], {7: 0.5});
  const toy = readFlightPad(p);
  assert.equal(toy.pitch, 0);
  assert.equal(toy.roll, 0);
  const rc = mapPad('chopper', p);
  assert.equal(rc.pitch, 0);
  assert.equal(rc.roll, 0);
  assert.ok(Math.abs(rc.lookX) > 0.5, 'RC right stick looks');
  const cobra = cobraGamepadControlAxes(p, 0);
  assert.equal(cobra.forwardCyclic, 0);
  assert.equal(cobra.rightCyclic, 0);
  assert.equal(cobra.yaw, 0, 'cobra pedals are the bumpers, not the right stick');
});

test('printed A is guns and printed B the second weapon job, on both printed layouts', () => {
  for (const id of ['8BitDo Ultimate 2', '8Bitdo SN30 Pro']) {
    const a = faceIndex(id, 'A');
    const b = faceIndex(id, 'B');
    const firing = pad([0, 0, 0, 0], {[a]: 1}, id);
    assert.equal(readFlightPad(firing).dartDown, true, `${id}: printed A is darts/guns`);
    assert.equal(cobraGamepadCombatState(firing).fire, true, `${id}: printed A is gunner consent`);
    const second = pad([0, 0, 0, 0], {[b]: 1}, id);
    assert.equal(readFlightPad(second).balloonDown, true, `${id}: printed B is balloons/missiles`);
    assert.equal(
      cobraGamepadCombatState(second).cycleTarget,
      true,
      `${id}: printed B is the target job (guns-only's B padlock)`
    );
  }
});
