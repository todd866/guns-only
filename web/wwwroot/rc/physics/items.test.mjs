import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventory, giveItem, hasItem, takeCell, saveInventory, CELLS_PER_BATTERY } from './items.mjs';

test('each item is given once, and survives a save', () => {
  const inv = createInventory();
  assert.equal(giveItem(inv, 'claw').name, 'Excavator Claw');
  assert.equal(giveItem(inv, 'claw'), null);
  assert.equal(giveItem(inv, 'nope'), null);
  assert.ok(hasItem(createInventory(JSON.parse(JSON.stringify(saveInventory(inv)))), 'claw'));
});

test('four battery cells make one more battery; the same cell never counts twice', () => {
  const inv = createInventory(), got = [];
  for (const id of ['a', 'b', 'a', 'c', 'd']) got.push(takeCell(inv, id));
  assert.equal(got[2], null);
  assert.equal(inv.extraBatteries, 1); assert.ok(got[4].battery); assert.equal(got[4].cell, CELLS_PER_BATTERY);
  assert.equal(createInventory(saveInventory(inv)).extraBatteries, 1);
});
