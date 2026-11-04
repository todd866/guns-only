import test from 'node:test';
import assert from 'node:assert/strict';
import {BOOSTER, boosterAt, landingTime, createBoosterClock, stepBooster} from './booster.mjs';

test('the booster coasts down, lights its landing burn, and stops exactly on the pad', () => {
  assert.equal(boosterAt(0).phase, 'coast');
  assert.equal(boosterAt(0).y, BOOSTER.top);
  const tl = landingTime(),
    burn = (BOOSTER.top - BOOSTER.burnAt) / BOOSTER.coast;
  assert.equal(boosterAt(burn + 0.1).phase, 'burn');
  const almost = boosterAt(tl - 0.01);
  assert.ok(almost.y < 0.05 && almost.v < 0.3, JSON.stringify(almost));
  assert.equal(boosterAt(tl + 1).phase, 'landed');
  assert.equal(boosterAt(tl + BOOSTER.stand + 1).phase, 'away');
  let prev = Infinity;
  for (let t = 0; t < tl; t += 0.05) {
    const y = boosterAt(t).y;
    assert.ok(y <= prev + 1e-9);
    prev = y;
  }
});

test('the clock gives a boom, a burn and a landing each flight, then the next one comes round', () => {
  const c = createBoosterClock(),
    ev = [];
  for (let t = 0; t < BOOSTER.first + BOOSTER.every * 2 + 5; t += 0.1)
    ev.push(...stepBooster(c, 0.1).map(e => Object.keys(e)[0]));
  assert.ok(ev.filter(e => e === 'boom').length >= 2, ev.join(','));
  assert.equal(ev.filter(e => e === 'landed').length, ev.filter(e => e === 'burn').length);
});
