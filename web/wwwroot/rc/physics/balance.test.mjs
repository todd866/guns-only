import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from './world.mjs';
import {createSession, stepSession} from './session.mjs';
import {carForward} from './car.mjs';
import {BALANCE} from './assists.mjs';
import {rotate} from './math.mjs';

const flat = () => {
  const w = createWorld();
  w.addQuad([-300, 0, -300], [-300, 0, 300], [300, 0, 300], [300, 0, -300], 'asphalt');
  return w;
};
const session = () =>
  createSession(
    {world: flat(), start: {pos: [0, 0.2, 0], yaw: 0}, checkpoints: [[0, -500, 'finish']], secrets: []},
    {mode: 'kid'}
  );
const pitch = s => Math.asin(carForward(s.car)[1]);

for (const mode of ['kid', 'bigKid'])
  test(`${mode}: up + S holds a wheelie on the rear wheels and lands it when let go`, () => {
    const s = createSession(
      {world: flat(), start: {pos: [0, 0.2, 0], yaw: 0}, checkpoints: [[0, -500, 'finish']], secrets: []},
      {mode}
    );
    for (let i = 0; i < 120; i++) stepSession(s, {throttle: 1}, 1 / 120);
    let held = 0,
      maxPitch = 0,
      rearOnly = 0;
    for (let i = 0; i < 360; i++) {
      stepSession(s, {throttle: 0, wheelie: true}, 1 / 120);
      maxPitch = Math.max(maxPitch, pitch(s));
      if (pitch(s) > BALANCE.angle * 0.6) held++;
      const w = s.car.wheels;
      if (i > 30 && (w[0].contact || w[1].contact)) rearOnly++;
    }
    assert.ok(held > 240, `held ${held / 120}s, max ${maxPitch}`);
    assert.ok(maxPitch < 1.1, `did not loop over: ${maxPitch}`);
    assert.ok(rearOnly < 12, `front wheels stayed up (touched ${rearOnly} frames)`);
    assert.ok(s.car.forwardSpeed > 4, `still rolling ${s.car.forwardSpeed}`);
    for (let i = 0; i < 240; i++) stepSession(s, {throttle: 0}, 1 / 120);
    assert.ok(Math.abs(pitch(s)) < 0.1 && s.car.contacts >= 3, `back on four: ${pitch(s)}`);
  });

test('down + W at speed pops a stoppie onto the front wheels', () => {
  const s = session();
  for (let i = 0; i < 240; i++) stepSession(s, {throttle: 1}, 1 / 120);
  let held = 0,
    minPitch = 0;
  for (let i = 0; i < 180; i++) {
    stepSession(s, {throttle: 0, stoppie: true}, 1 / 120);
    minPitch = Math.min(minPitch, pitch(s));
    if (pitch(s) < -BALANCE.angle * 0.6) held++;
  }
  assert.ok(held > 60, `held ${held / 120}s, min ${minPitch}`);
  assert.ok(minPitch > -1.1, `did not flip: ${minPitch}`);
  for (let i = 0; i < 240; i++) stepSession(s, {}, 1 / 120);
  assert.ok(s.car.contacts >= 3 && carForward(s.car)[1] > -0.1, 'back down');
});

test('a wheelie on a bumpy side slope stays on its wheels', () => {
  const w = createWorld();
  // A 12° cross-slope with a lip every 12 m.
  for (let z = -300; z < 300; z += 4) {
    const lip = z % 12 === 0 ? 0.05 : 0;
    w.addQuad([-30, -6.4, z], [-30, -6.4, z + 4], [30, 6.4 + lip, z + 4], [30, 6.4 + lip, z], 'grass');
  }
  const s = createSession(
    {world: w, start: {pos: [0, 0.3, 0], yaw: 0}, checkpoints: [[0, -500, 'finish']], secrets: []},
    {mode: 'kid'}
  );
  for (let i = 0; i < 120; i++) stepSession(s, {throttle: 1}, 1 / 120);
  let worst = 0;
  for (let i = 0; i < 360; i++) {
    stepSession(s, {wheelie: true}, 1 / 120);
    worst = Math.max(worst, Math.abs(rotate(s.car.q, [1, 0, 0])[1]));
  }
  assert.ok(worst < 0.5, `never on its side: worst right.y ${worst}`);
  assert.ok(rotate(s.car.q, [0, 1, 0])[1] > 0.8, 'upright at the end');
});
