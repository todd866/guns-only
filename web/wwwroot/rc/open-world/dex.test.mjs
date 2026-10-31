import test from 'node:test';
import assert from 'node:assert/strict';
import {DEX, loadDex, see, pages, earn, spend, GOLD} from './dex.mjs';

test('the book has a page for every kind of dinosaur in the herd roster', () => {
  assert.deepEqual(
    DEX.map(d => d.kind),
    ['rex', 'raptor', 'longneck', 'triceratops', 'quetzal']
  );
});

test('a page is a silhouette until seen; seeing counts once; befriending counts as seen', () => {
  const dex = loadDex({});
  assert.ok(pages(dex).every(p => !p.seen));
  assert.equal(see(dex, 'raptor'), true);
  assert.equal(see(dex, 'raptor'), false);
  assert.equal(see(dex, 'unicorn'), false);
  const p = pages(dex, [
    {kind: 'rex', name: 'Rexy'},
    {kind: 'rex', name: 'Spike'}
  ]);
  assert.equal(p.find(x => x.kind === 'raptor').seen, true);
  assert.deepEqual(
    p.find(x => x.kind === 'rex'),
    {...p.find(x => x.kind === 'rex'), seen: true, friends: 2}
  );
  assert.equal(p.find(x => x.kind === 'quetzal').seen, false);
});

test('gold: earned in whole coins, never negative, never spent beyond the purse', () => {
  const dex = loadDex({gold: 5, dexSeen: ['rex', 'nope', 'rex']});
  assert.deepEqual(dex.seen, ['rex']);
  assert.equal(earn(dex, GOLD.seam), 3);
  assert.equal(dex.gold, 8);
  assert.equal(spend(dex, 9), false);
  assert.equal(spend(dex, 8), true);
  assert.equal(dex.gold, 0);
  assert.equal(loadDex({gold: -4}).gold, 0);
  assert.equal(loadDex({gold: 1e9}).gold, GOLD.max);
});
