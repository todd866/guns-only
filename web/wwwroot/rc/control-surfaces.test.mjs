import test from 'node:test';
import assert from 'node:assert/strict';
import {protectGameControls, GAME_CONTROL} from './control-surfaces.mjs';
test('delegated prevention covers nested dynamic controls without blocking editable or reading content', () => {
  const handlers = new Map(),
    root = {addEventListener: (k, v) => handlers.set(k, v), removeEventListener: k => handlers.delete(k)};
  const cleanup = protectGameControls(root);
  for (const type of ['selectstart', 'contextmenu', 'dragstart']) {
    for (const [control, editable, expected] of [
      [true, false, true],
      [false, false, false],
      [true, true, false]
    ]) {
      let prevented = false;
      handlers.get(type)({
        target: {closest: q => (q === GAME_CONTROL ? control : editable)},
        preventDefault: () => {
          prevented = true;
        }
      });
      assert.equal(prevented, expected, type);
    }
  }
  cleanup();
  assert.equal(handlers.size, 0);
});
