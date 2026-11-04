import test from 'node:test';
import assert from 'node:assert/strict';
import {createCup, recordCupRace, nextCupEvent, cupStandings, saveCup, loadCup} from './grand-prix.mjs';
const make = () => createCup('home', ['a', 'b', 'c', 'd'], ['You', 'Ace', 'Bandit', 'Ghost', 'Viper']);
test('four results accumulate 9/6/3/1, retries replace points and reload resumes', () => {
  const s = make();
  recordCupRace(s, 'a', s.drivers);
  recordCupRace(s, 'a', ['Ace', 'You', 'Bandit', 'Ghost', 'Viper']);
  assert.equal(cupStandings(s).find(r => r.id === 'You').points, 6);
  let data;
  const storage = {setItem: (k, v) => (data = v), getItem: () => data};
  saveCup(s, storage);
  const restored = loadCup(storage);
  assert.equal(nextCupEvent(restored), 'b');
  for (const e of ['b', 'c', 'd']) recordCupRace(restored, e, restored.drivers);
  assert.equal(nextCupEvent(restored), null);
  assert.deepEqual(cupStandings(restored)[0], {id: 'You', points: 33, rank: 1});
});
test('invalid or skipped results cannot corrupt the cup and ties share rank', () => {
  const s = make();
  assert.throws(() => recordCupRace(s, 'c', s.drivers));
  assert.throws(() => recordCupRace(s, 'a', ['You', 'You', 'Ace', 'Bandit', 'Ghost']));
  recordCupRace(s, 'a', s.drivers);
  recordCupRace(s, 'b', ['Ace', 'You', 'Bandit', 'Ghost', 'Viper']);
  assert.equal(cupStandings(s)[0].rank, 1);
  assert.equal(cupStandings(s)[1].rank, 1);
  assert.equal(loadCup({getItem: () => '{bad'}), null);
});
