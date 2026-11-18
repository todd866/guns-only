import test from 'node:test';
import assert from 'node:assert/strict';
import {rumble, createRumbler, RUMBLE} from './rumble.mjs';

test('the Mac app gets the rumble through its message handler', () => {
  const sent = [];
  const env = {webkit: {messageHandlers: {rcRumble: {postMessage: m => sent.push(m)}}}};
  assert.equal(rumble('bail', {env}), 'native');
  assert.deepEqual(sent[0], {pad: null, ...RUMBLE.bail});
});

test('a browser plays dual-rumble on pads that have motors and skips the rest', () => {
  const played = [];
  const motor = {playEffect: (type, p) => (played.push([type, p]), Promise.resolve('complete'))};
  const pads = [
    {connected: true, index: 0, vibrationActuator: motor},
    {connected: true, index: 1},
    null,
    {connected: false, index: 2, vibrationActuator: motor}
  ];
  assert.equal(rumble('land', {env: {}, pads}), 'web');
  assert.equal(played.length, 1);
  assert.equal(played[0][0], 'dual-rumble');
  assert.equal(played[0][1].duration, RUMBLE.land.ms);
  assert.equal(rumble('land', {env: {}, pads: [{connected: true, index: 1}]}), null);
});

test('rumble never throws into the game loop', () => {
  const bad = {playEffect: () => {
    throw Error('no motors');
  }};
  assert.equal(rumble('wall', {env: {}, pads: [{connected: true, index: 0, vibrationActuator: bad}]}), null);
  const env = {webkit: {messageHandlers: {rcRumble: {postMessage: () => {
    throw Error('gone');
  }}}}};
  assert.equal(rumble('wall', {env}), null);
  assert.equal(rumble('nope', {env: {}}), null);
});

test('one buzz per kind per gap, so a scrape is not sixty buzzes', () => {
  let t = 0;
  const calls = [];
  const r = createRumbler({gap: 350, now: () => t, play: k => (calls.push(k), 'web')});
  r('wall');
  t = 100;
  r('wall');
  r('land');
  t = 400;
  r('wall');
  assert.deepEqual(calls, ['wall', 'land', 'wall']);
});
