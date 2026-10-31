import test from 'node:test';
import assert from 'node:assert/strict';
import {LIVERIES, liveryUnlocked, pumpkinRewards} from './livery-data.mjs';
import {loadProgress} from './open-world/catalog.mjs';

test('pumpkin liveries unlock at 20 and at 67 (six seven), and only once', () => {
  const six = LIVERIES.find(l => l.id === 'sixseven');
  assert.equal(liveryUnlocked(six, {pumpkins: 66}), false);
  assert.equal(liveryUnlocked(six, {pumpkins: 67}), true);
  assert.ok(liveryUnlocked(LIVERIES[0], {}), 'the ordinary ones are always open');
  assert.deepEqual(
    pumpkinRewards(18, 21).map(l => l.id),
    ['pumpkin'],
    'the pumpkin car at 20'
  );
  assert.deepEqual(
    pumpkinRewards(66, 67).map(l => l.id),
    ['sixseven']
  );
  assert.deepEqual(pumpkinRewards(67, 70), []);
});

test('the all-time pumpkin count survives a save and reload', () => {
  const store = new Map(),
    storage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)};
  storage.setItem(
    'guns-only.rc.world.v1',
    JSON.stringify({pumpkins: 42, pattern: 'sixseven', body: 'pumpkin'})
  );
  const p = loadProgress(storage);
  assert.equal(p.pumpkins, 42);
  assert.equal(p.body, 'pumpkin');
  storage.setItem('guns-only.rc.world.v1', JSON.stringify({pumpkins: 5, body: 'pumpkin'}));
  assert.equal(loadProgress(storage).body, 'jet', 'not earned yet');
  storage.setItem('guns-only.rc.world.v1', JSON.stringify({pumpkins: -3}));
  assert.equal(loadProgress(storage).pumpkins, 0);
});

test('the pumpkin record starts at 113 and keeps a better one', async () => {
  const {PUMPKIN_RECORD} = await import('./open-world/catalog.mjs');
  const store = new Map(),
    storage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)};
  assert.equal(PUMPKIN_RECORD, 113);
  assert.equal(loadProgress(storage).pumpkinBest, 113);
  storage.setItem('guns-only.rc.world.v1', JSON.stringify({pumpkinBest: 140}));
  assert.equal(loadProgress(storage).pumpkinBest, 140);
  storage.setItem('guns-only.rc.world.v1', JSON.stringify({pumpkinBest: 12}));
  assert.equal(loadProgress(storage).pumpkinBest, 113);
});

test('the sheriff star is earned by freeing the Lake Town, not by pumpkins', () => {
  const l = LIVERIES.find(v => v.id === 'sheriff');
  assert.ok(l);
  assert.equal(liveryUnlocked(l, {pumpkins: 999}), false);
  assert.equal(liveryUnlocked(l, {lakeTownFreed: true}), true);
});
