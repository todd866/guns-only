import test from 'node:test';
import assert from 'node:assert/strict';
import {createCouchPause} from './couch-pause.mjs';

const pad = (connected = true) => ({connected});

test('keyboard-only play pauses on blur and on the page being hidden', () => {
  const couch = createCouchPause();
  assert.equal(couch.blur(), 'pause');
  assert.equal(couch.hide(), 'pause');
  assert.equal(couch.couch, false);
});

test('once a pad is connected, blur and hide keep the game running even if the browser stops listing pads', () => {
  const couch = createCouchPause();
  couch.see([pad()]);
  assert.equal(couch.couch, true);
  assert.equal(couch.blur(), 'keep');
  assert.equal(couch.hide(), 'keep');
  couch.see([]);
  assert.equal(couch.blur(), 'keep', 'an empty poll while unfocused is not a disconnect');
});

test('the game pauses when the last pad disconnects, then blur pauses again', () => {
  const couch = createCouchPause();
  couch.see([pad(), pad()]);
  assert.equal(couch.lostPad([pad()]), 'keep');
  assert.equal(couch.couch, true);
  assert.equal(couch.lostPad([]), 'pause');
  assert.equal(couch.couch, false);
  assert.equal(couch.blur(), 'pause');
});

test('a disconnect before any pad was seen does not pause', () => {
  const couch = createCouchPause();
  assert.equal(couch.lostPad([]), 'keep');
});
