import test from 'node:test';
import assert from 'node:assert/strict';
import {resultPanel, ordinal, placeTitle} from './result-panel.mjs';
const order = ['BANDIT', 'FROSTY', 'SANDY', 'SPLINTER', 'VIPER', 'GHOST', 'FLANKER', 'YOU'];
test('result keeps every place in the markup and shows the podium plus the player', () => {
  const html = resultPanel({
    badge: '8',
    title: placeTitle(8),
    order,
    you: 8,
    stats: [['Time', '2:21.83']],
    again: 'Again'
  });
  for (const [i, name] of order.entries())
    assert.match(html, new RegExp(`<b>${i + 1}</b> ${name}`), 'complete order stays recoverable');
  assert.equal((html.match(/class="mid"/g) || []).length, 4, 'places 4-7 fold behind the toggle');
  assert.match(html, /class="you"><b>8<\/b> YOU/);
  assert.match(html, /aria-label="Show full finishing order"/);
  assert.match(html, /id="again" class="primary"/);
  assert.match(html, /id="explore"/);
  assert.match(html, /id="to-menu"/);
});
test('a podium finisher sees the top four without a toggle gap before them', () => {
  const html = resultPanel({
    title: placeTitle(2),
    order: ['A', 'YOU', 'C', 'D', 'E'],
    you: 2,
    stats: [],
    again: 'Again'
  });
  assert.equal((html.match(/class="mid"/g) || []).length, 1, 'only fifth folds');
  assert.ok(html.indexOf('class="gap"') > html.indexOf('<b>4</b>'), 'toggle sits after the visible top four');
  assert.equal(placeTitle(2), 'Good hustle, Airman!');
  assert.equal(placeTitle(7), 'Next sortie!');
});
test('ordinals', () =>
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal), [
    '1st',
    '2nd',
    '3rd',
    '4th',
    '11th',
    '12th',
    '13th',
    '21st',
    '22nd',
    '23rd'
  ]));
test('names are escaped', () =>
  assert.ok(
    !resultPanel({title: '<x>', order: ['<i>'], you: 1, stats: [['a', '<b>']], again: ''}).includes('<i>')
  ));
