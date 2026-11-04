import test from 'node:test';
import assert from 'node:assert/strict';
import {readSlots, createSlot, useSlot, eraseSlot, activeSave, slotKey, cleanName} from './save-slots.mjs';

const mem = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    m
  };
};

test('three empty slots; a new file is named, active, and kept separate', () => {
  const s = mem();
  assert.deepEqual(readSlots(s).slots, [null, null, null]);
  createSlot(s, 0, 'Dad');
  createSlot(s, 1, 'Kiddo');
  assert.equal(activeSave(s).slot, 1);
  s.setItem(slotKey(1), JSON.stringify({items: ['claw']}));
  useSlot(s, 0);
  assert.deepEqual(activeSave(s).data, {});
  useSlot(s, 1);
  assert.deepEqual(activeSave(s).data.items, ['claw']);
  assert.equal(useSlot(s, 2), null, 'an empty slot cannot be played');
  eraseSlot(s, 1);
  assert.equal(readSlots(s).slots[1], null);
  assert.equal(s.getItem(slotKey(1)), null);
});

test('a save from before slots becomes slot 1, so nobody loses progress', () => {
  const s = mem();
  s.setItem('rc-adventure-v1', JSON.stringify({items: ['claw'], legend: true}));
  assert.equal(readSlots(s).slots[0].name, 'Player 1');
  assert.deepEqual(activeSave(s).data.items, ['claw']);
});

test('names are short and plain', () => {
  assert.equal(cleanName('  <b>Ace</b>!!  '), 'bAceb');
  assert.equal(cleanName('A very long name indeed'), 'A very long');
  assert.equal(createSlot(mem(), 0, '   '), null);
});
