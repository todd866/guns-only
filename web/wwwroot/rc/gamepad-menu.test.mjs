import test from 'node:test';
import assert from 'node:assert/strict';
import {nearest} from './gamepad-menu.mjs';
test('menu highlight moves to the nearest button in the pressed direction', () => {
  const grid = [{x: 0, y: 0}, {x: 100, y: 0}, {x: 200, y: 0}, {x: 0, y: 60}, {x: 100, y: 60}];
  assert.equal(nearest(grid, grid[0], [1, 0]), grid[1], 'right goes to the next button, not the far one');
  assert.equal(nearest(grid, grid[1], [0, 1]), grid[4], 'down goes straight below');
  assert.equal(nearest(grid, grid[0], [-1, 0]), null, 'nothing to the left stays put');
  assert.equal(nearest(grid, grid[4], [0, -1]), grid[1]);
});
