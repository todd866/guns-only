import test from 'node:test';
import assert from 'node:assert/strict';
import {clean, sounds, nameFrom, say, distance} from './typed.mjs';

test('case, spaces and punctuation never matter', () => {
  assert.equal(clean('  ReX!! '), 'rex');
  assert.ok(sounds('REX', 'rex'));
  assert.ok(sounds('here boy', 'here'));
});

test('a small spelling slip still matches, a different word does not', () => {
  assert.equal(distance('dinsaur', 'dinosaur'), 1);
  assert.ok(sounds('dinsaur', 'dinosaur'));
  assert.ok(sounds('rexx', 'rex'));
  assert.ok(sounds('wistle', 'whistle'));
  assert.ok(!sounds('cat', 'rex'));
});

test('names: trimmed, capitalised, short; empty keeps the old one', () => {
  assert.equal(nameFrom('  rex the rocket dinosaur ', 'Dino'), 'Rex the rock');
  assert.equal(nameFrom('', 'Dino'), 'Dino');
  assert.equal(nameFrom('<b>', 'Dino'), 'B');
});

test("saying the dinosaur's name in the past calls it, on foot", () => {
  assert.equal(say('rexx', {era: 'past', mount: 'Rex', onFoot: true}).call, 'mount');
  assert.equal(say('here', {era: 'past', mount: 'Rex', onFoot: true}).call, 'mount');
  assert.equal(say('rex', {era: 'past', mount: 'Rex', onFoot: false}).call, null, 'already riding');
  assert.equal(say('rex', {era: 'present', mount: 'Rex', onFoot: true}).call, null, 'it lives long ago');
});

test('anything at all gets a friendly reply, and nothing typed is an error', () => {
  for (const t of ['hello', 'yeehaw', '67', 'asdfgh', 'poop', '🙂'])
    assert.ok(say(t, {era: 'past'}).reply, t);
  assert.equal(say('', {}).reply, null);
});
