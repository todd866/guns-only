import test from 'node:test';
import assert from 'node:assert/strict';
import {createHunt, setHuntOn, stepHunt, collect, HUNT, fmtHunt, hudLine, resultHead, resultStats, huntTelemetry} from './hunt.mjs';

test('either player adds to one team count, and 10 ends the round', () => {
  const h = createHunt();
  setHuntOn(h, true);
  assert.equal(collect(h, 1, 4).goal, false);
  collect(h, 2, 5);
  assert.equal(h.team, 9);
  assert.equal(h.p1, 4);
  assert.equal(h.p2, 5);
  const hit = collect(h, 2, 1);
  assert.equal(hit.goal, true);
  assert.equal(h.team, 10);
  assert.equal(h.p2, 6);
  assert.ok(h.resultLeft > 0);
  assert.equal(resultHead(h), '🎃 Team got 10!');
  assert.equal(resultStats(h).join(' · '), 'P1 4 · P2 6');
});

test('hud chip is the shared total and the time left', () => {
  const h = createHunt();
  setHuntOn(h, true);
  assert.equal(HUNT.round, 180);
  assert.equal(HUNT.goal, 10);
  assert.equal(hudLine(h), '🎃 0/10 · 3:00');
  collect(h, 1, 4);
  stepHunt(h, 47, false);
  assert.equal(hudLine(h), '🎃 4/10 · 2:13');
});

test('three minutes ends the round with whatever the team got', () => {
  const h = createHunt();
  setHuntOn(h, true);
  collect(h, 1, 3);
  collect(h, 2, 2);
  const ev = stepHunt(h, HUNT.round, false);
  assert.equal(ev.roundEnd, true);
  assert.ok(h.resultLeft > 0);
  assert.equal(resultHead(h), '🎃 Team got 5!');
  assert.deepEqual(resultStats(h), ['P1 3', 'P2 2']);
});

test('pause holds the clock, and a smash during the card does not score', () => {
  const h = createHunt();
  setHuntOn(h, true);
  stepHunt(h, 10, true);
  assert.equal(h.roundLeft, HUNT.round);
  collect(h, 1, 10);
  assert.equal(collect(h, 2, 4).added, 0);
  assert.equal(h.team, 10);
  assert.equal(h.p2, 0);
  assert.equal(hudLine(h), '');
});

test('the next round starts clean after the result card', () => {
  const h = createHunt();
  setHuntOn(h, true);
  collect(h, 1, 10);
  stepHunt(h, HUNT.result, false);
  assert.equal(h.resultLeft, 0);
  assert.equal(h.roundN, 2);
  assert.equal(h.team, 0);
  assert.equal(h.p1, 0);
  assert.equal(hudLine(h), '🎃 0/10 · 3:00');
});

test('hunt off scores nothing and logs nothing', () => {
  const h = createHunt();
  assert.equal(huntTelemetry(h), null);
  assert.equal(collect(h, 1, 5).added, 0);
  assert.equal(h.team, 0);
  setHuntOn(h, true);
  collect(h, 2, 2);
  stepHunt(h, 10, false);
  assert.deepEqual(huntTelemetry(h), {team: 2, p1: 0, p2: 2, left: 170, round: 1});
  setHuntOn(h, false);
  assert.equal(h.on, false);
  assert.equal(h.team, 0);
  assert.equal(hudLine(h), '');
  assert.equal(huntTelemetry(h), null);
});

test('fmtHunt', () => assert.equal(fmtHunt(65.2), '1:06'));
