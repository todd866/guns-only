import test from 'node:test';
import assert from 'node:assert/strict';
import {createGamepadInput} from './gamepad.mjs';
test('standard controller deadzones, analog controls, action edges and disconnect reset', () => {
  const poll = createGamepadInput(),
    p = {
      connected: true,
      mapping: 'standard',
      axes: [0.05, 0],
      buttons: Array.from({length: 10}, () => ({value: 0}))
    };
  assert.equal(poll([p]).steer, 0);
  p.axes[0] = 1;
  p.buttons[7].value = 0.7;
  p.buttons[0].value = 1;
  p.buttons[9].value = 1;
  assert.deepEqual(poll([p]), {
    throttle: 0.7,
    steer: 1,
    brake: false,
    drift: false,
    fire: true,
    start: true,
    boost: false
  });
  p.buttons[3].value = 1;
  assert.equal(poll([p]).boost, true, 'Y toggles boost');
  assert.equal(poll([p]).boost, false, 'once per press');
  p.buttons[3].value = 0;
  assert.equal(poll([p]).fire, false);
  assert.equal(poll([]).throttle, 0);
  assert.equal(poll([p]).fire, true);
  p.mapping = '';
  assert.equal(poll([p]).steer, 1, 'unrecognised pads (8BitDo over Bluetooth) still steer');
});
test('every connected pad drives: an idle pad listed first does not mask the active one', () => {
  const poll = createGamepadInput(),
    pad = () => ({connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({length: 17}, () => ({value: 0}))}),
    idle = pad(),
    active = pad();
  active.axes = [-1, -1];
  active.buttons[0].value = 1;
  const out = poll([idle, active]);
  assert.equal(out.steer, -1);
  assert.equal(out.throttle, 1, 'stick up drives forward');
  assert.equal(out.fire, true);
  assert.equal(poll([idle, active]).fire, false, 'fire is once per press across pads');
  assert.equal(poll([idle, {...active, connected: false}]).throttle, 0);
});
