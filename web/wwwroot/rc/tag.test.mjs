import test from 'node:test';
import assert from 'node:assert/strict';
import {createTag, setTagOn, stepTag, winner, TAG, fmtTag, hudLine, resultHead} from './tag.mjs';

test('tag transfer and grace', () => {
  const t = createTag();
  setTagOn(t, true, () => 0);
  assert.equal(t.it, 1);
  stepTag(t, 1, TAG.dist - 0.1, false);
  assert.equal(t.it, 2);
  assert.equal(t.grace, 1);
  assert.ok(t.graceLeft > 0);
  const d = t.it;
  stepTag(t, 0.5, TAG.dist - 0.1, false);
  assert.equal(t.it, d, 'no tag-back during grace');
  stepTag(t, TAG.grace, TAG.dist - 0.1, false);
  assert.equal(t.it, 1, 'tag back once grace ends');
});

test('IT time and round end', () => {
  const t = createTag();
  setTagOn(t, true, () => 1);
  assert.equal(t.it, 2);
  stepTag(t, 10, 99, false);
  assert.ok(t.p2It >= 9.9 && t.p2It <= 10.1);
  stepTag(t, TAG.round - 10, 99, false);
  assert.ok(t.resultLeft > 0, 'result card');
  assert.equal(winner(t), 1, 'P1 had no IT time');
  assert.equal(resultHead(t), 'P1 wins!');
});

test('hud line', () => {
  const t = createTag();
  setTagOn(t, true, () => 0);
  assert.match(hudLine(t, 1), /^🏷️ IT 0:00 · round 1:30$/);
  stepTag(t, 12.4, 99, false);
  assert.match(hudLine(t, 1), /IT 0:13 · round 1:1[78]/);
});

test('fmtTag', () => assert.equal(fmtTag(65.2), '1:06'));
