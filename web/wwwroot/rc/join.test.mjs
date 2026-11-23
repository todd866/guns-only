import test from 'node:test';
import assert from 'node:assert/strict';
import {joinPadIndex, joinCardVisible, menuPlayersButton, joinHideUntilAfterLeave, JOIN_HIDE_MS} from './join.mjs';

const pad = (index, connected = true) => ({connected, index, id: `pad${index}`});

test('joinPadIndex is the connected pad that is not player 1', () => {
  assert.equal(joinPadIndex([pad(0), pad(1)], 0), 1);
  assert.equal(joinPadIndex([pad(0), pad(1)], 1), 0);
  assert.equal(joinPadIndex([pad(0)], 0), null);
  assert.equal(joinPadIndex([pad(0), pad(1)], null), 1);
});

test('join card hides when split, paused, panel open, or in post-leave cooldown', () => {
  const base = {
    split: null,
    started: true,
    paused: false,
    panelOpen: false,
    now: 100_000,
    joinHideUntil: 0,
    playersUrl2: false,
    hasRival: true,
    live: [pad(0), pad(1)],
    p1Pad: 0
  };
  assert.equal(joinCardVisible(base), true);
  assert.equal(joinCardVisible({...base, split: {pad: 1}}), false);
  assert.equal(joinCardVisible({...base, started: false}), false);
  assert.equal(joinCardVisible({...base, paused: true}), false);
  assert.equal(joinCardVisible({...base, panelOpen: true}), false);
  assert.equal(joinCardVisible({...base, hasRival: false}), false);
  assert.equal(joinCardVisible({...base, live: [pad(0)]}), false);
  assert.equal(joinCardVisible({...base, now: 50_000, joinHideUntil: 80_000}), false);
  assert.equal(joinCardVisible({...base, now: 50_000, joinHideUntil: 80_000, playersUrl2: true}), true);
});

test('menu player button label and visibility', () => {
  const live = [pad(0), pad(1)];
  assert.deepEqual(menuPlayersButton({split: null, live, p1Pad: 0}), {hidden: false, label: '👥 2 players'});
  assert.deepEqual(menuPlayersButton({split: {pad: 1}, live, p1Pad: 0}), {hidden: false, label: '👤 1 player'});
  assert.deepEqual(menuPlayersButton({split: null, live: [pad(0)], p1Pad: 0}), {hidden: true, label: ''});
});

test('leave split starts a 60 s card cooldown', () => {
  assert.equal(joinHideUntilAfterLeave(1000), 1000 + JOIN_HIDE_MS);
});
