import test from 'node:test';
import assert from 'node:assert/strict';
import {DIG, PORTAL_DEPTH, createDig, stepDig, digFloor, layerAt} from './dig.mjs';

// Holds E for `seconds`, stopping once through (in the game the era flips to the present there).
const hold = (s, seconds, extra = {}) => {
  const ev = [];
  for (let t = 0; t < seconds + DIG.startHold && !ev.some(e => e.through); t += 1 / 60)
    ev.push(...stepDig(s, {era: 'past', pos: [10, 0, 20], ground: 0, holding: true, dt: 1 / 60, ...extra}));
  return ev;
};

test("digs in either world, and a tap of E (an item's use) never starts one", () => {
  for (const era of ['past', 'present']) {
    const s = createDig();
    assert.deepEqual(stepDig(s, {era, pos: [0, 0, 0], ground: 0, holding: true, dt: 0.1}), [], 'a tap');
    stepDig(s, {era, pos: [0, 0, 0], ground: 0, holding: false, dt: 0.1});
    assert.equal(s.active, false);
    const ev = [];
    for (let i = 0; i < 10; i++)
      ev.push(...stepDig(s, {era, pos: [0, 0, 0], ground: 0, holding: true, dt: 0.05}));
    assert.ok(
      ev.some(e => e.start),
      era
    );
  }
});

test('the portal layer lets you out into the other world', () => {
  for (const [era, to] of [
    ['past', 'present'],
    ['present', 'past']
  ]) {
    const s = createDig(),
      ev = [];
    for (let t = 0; t < 10 && !ev.some(e => e.through); t += 1 / 60)
      ev.push(...stepDig(s, {era, pos: [1, 0, 2], ground: 0, holding: true, dt: 1 / 60}));
    assert.equal(ev.find(e => e.through).to, to);
  }
});

test('holding E digs block by block through the layers, down to the portal and through to the light world', () => {
  const s = createDig(),
    ev = hold(s, DIG.seconds * (PORTAL_DEPTH + 1) + 0.2);
  assert.ok(ev[0].start);
  assert.deepEqual(
    ev.filter(e => e.block).map(e => e.block),
    DIG.layers
  );
  const through = ev.find(e => e.through);
  assert.deepEqual(through.through, [10, 20], 'comes out at the same x, z');
  assert.equal(s.active, false);
  assert.ok(PORTAL_DEPTH * DIG.block >= 3, 'a proper dig, not a single tap');
});

test('the digger stands on the shaft floor, a block lower each time', () => {
  const s = createDig();
  hold(s, DIG.seconds * 3 + 0.05);
  assert.equal(s.depth, 3);
  assert.deepEqual(digFloor(s), [10, -3 * DIG.block, 20]);
  assert.equal(layerAt(s.depth), DIG.layers[3]);
});

test('letting go pauses, Space climbs out, walking off an untouched hole calls it off', () => {
  const s = createDig();
  hold(s, DIG.seconds + 0.05);
  const d = s.depth;
  for (let i = 0; i < 120; i++)
    stepDig(s, {era: 'past', pos: [10, 0, 20], ground: 0, holding: false, dt: 1 / 60});
  assert.equal(s.depth, d);
  assert.ok(
    stepDig(s, {era: 'past', pos: [10, 0, 20], ground: 0, holding: false, climb: true}).some(e => e.out)
  );
  assert.equal(s.active, false);
  const t = createDig();
  stepDig(t, {era: 'past', pos: [10, 0, 20], ground: 0, holding: true, dt: DIG.startHold + 0.01});
  assert.ok(stepDig(t, {era: 'past', pos: [11, 0, 20], ground: 0, holding: true, dt: 0.01}).some(e => e.out));
});
