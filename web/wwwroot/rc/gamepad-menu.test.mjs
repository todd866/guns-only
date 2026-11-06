import test from 'node:test';
import assert from 'node:assert/strict';
import {nearest, MENU_CONFIRM, MENU_BACK, createMenuPad} from './gamepad-menu.mjs';
import {mapPad} from './gamepad.mjs';
test('menu highlight moves to the nearest button in the pressed direction', () => {
  const grid = [{x: 0, y: 0}, {x: 100, y: 0}, {x: 200, y: 0}, {x: 0, y: 60}, {x: 100, y: 60}];
  assert.equal(nearest(grid, grid[0], [1, 0]), grid[1], 'right goes to the next button, not the far one');
  assert.equal(nearest(grid, grid[1], [0, 1]), grid[4], 'down goes straight below');
  assert.equal(nearest(grid, grid[0], [-1, 0]), null, 'nothing to the left stays put');
  assert.equal(nearest(grid, grid[4], [0, -1]), grid[1]);
});

function button(x, y) {
  const classes = new Set();
  return {
    tagName: 'BUTTON',
    offsetParent: {},
    disabled: false,
    hidden: false,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    },
    focus() {},
    click() {
      this.clicked = true;
    },
    getBoundingClientRect: () => ({left: x - 10, width: 20, top: y - 10, height: 20})
  };
}

test('the highlight starts on the requested control, not always the first', () => {
  const first = button(0, 0);
  const last = button(100, 0);
  const root = {querySelectorAll: () => [first, last]};
  const poll = createMenuPad({root: () => root, back() {}, initial: () => last});
  poll([], 0);
  assert.equal(first.classList.contains('pad-focus'), false);
  assert.equal(last.classList.contains('pad-focus'), true);
});

test('menu A confirms and B goes back, the same indices the game uses for jump and morph', () => {
  assert.equal(MENU_CONFIRM, 0);
  assert.equal(MENU_BACK, 1);
  const held = mapPad('car', {axes: [0, 0, 0, 0], buttons: [{value: 1}, {value: 1}]});
  assert.equal(held.jumpHeld, true, 'A is jump while playing');
  assert.equal(held.morphHeld, true, 'B is morph while playing');
});
