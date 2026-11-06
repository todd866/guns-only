import test from 'node:test';
import assert from 'node:assert/strict';
import {nearest, MENU_CONFIRM, MENU_BACK} from './gamepad-menu.mjs';
import {mapPad} from './gamepad.mjs';
test('menu highlight moves to the nearest button in the pressed direction', () => {
  const grid = [{x: 0, y: 0}, {x: 100, y: 0}, {x: 200, y: 0}, {x: 0, y: 60}, {x: 100, y: 60}];
  assert.equal(nearest(grid, grid[0], [1, 0]), grid[1], 'right goes to the next button, not the far one');
  assert.equal(nearest(grid, grid[1], [0, 1]), grid[4], 'down goes straight below');
  assert.equal(nearest(grid, grid[0], [-1, 0]), null, 'nothing to the left stays put');
  assert.equal(nearest(grid, grid[4], [0, -1]), grid[1]);
});

test('menu A confirms and B goes back, the same indices the game uses for jump and morph', () => {
  assert.equal(MENU_CONFIRM, 0);
  assert.equal(MENU_BACK, 1);
  const held = mapPad('car', {axes: [0, 0, 0, 0], buttons: [{value: 1}, {value: 1}]});
  assert.equal(held.jumpHeld, true, 'A is jump while playing');
  assert.equal(held.morphHeld, true, 'B is morph while playing');
});
