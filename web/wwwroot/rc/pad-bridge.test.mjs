import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPads} from './pad-bridge.mjs';

const web = id => ({id, connected: true, buttons: [], axes: []});
const native = id => ({id, connected: true, mapping: 'standard', buttons: [], axes: []});

test('a focused page keeps the browser gamepads', () => {
  const chosen = selectPads({web: [web('browser')], native: [native('app')], focused: true});
  assert.equal(chosen[0].id, 'browser');
});

test('an unfocused page uses the native bridge when WebKit has stopped updating pads', () => {
  const stale = web('stale');
  const chosen = selectPads({web: [stale], native: [native('app')], focused: false});
  assert.equal(chosen[0].id, 'app');
});

test('a focused page with no browser pads still reads the native bridge', () => {
  const chosen = selectPads({web: [null], native: [native('app')], focused: true});
  assert.equal(chosen[0].id, 'app');
});

test('no pads from either source is an empty list', () => {
  assert.deepEqual(selectPads({web: [], native: [], focused: false}), []);
});
