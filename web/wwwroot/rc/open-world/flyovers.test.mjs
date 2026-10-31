import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlyoverSchedule, stepFlyovers, shipPosition, planPass, FLIGHTS, FLYOVER } from './flyovers.mjs';
import { AIRCRAFT_TYPES } from './aircraft-catalog.js';

const seeded = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;

test('every flight is a catalogued aircraft', () => {
  for (const f of FLIGHTS) for (const t of f.types) assert.ok(AIRCRAFT_TYPES.includes(t), t);
});

test('a flight passes over the player within the first half-minute and roars once as it goes over', () => {
  const s = createFlyoverSchedule(seeded()), pos = [100, 0, 200];
  let started = null, roars = 0, closest = Infinity, ended = false;
  for (let t = 0; t < 120 && !ended; t += .05) {
    const e = stepFlyovers(s, pos, .05);
    if (e.started) { started = t; }
    if (e.roar) roars++;
    if (s.active) { const p = shipPosition(s.active, 0); closest = Math.min(closest, Math.hypot(p[0] - pos[0], p[2] - pos[2])); }
    ended ||= e.ended && started !== null;
  }
  assert.ok(started !== null && started <= FLYOVER.firstAfter[1] + .1, `started ${started}`);
  assert.ok(ended); assert.equal(roars, 1);
  assert.ok(closest < 230, `closest ${closest}`);
});

test('nothing new launches while the player is somewhere quiet, and passes keep coming otherwise', () => {
  const s = createFlyoverSchedule(seeded(3));
  for (let t = 0; t < 200; t += .1) assert.equal(stepFlyovers(s, [0, 0, 0], .1, { quiet: true }).started, null);
  for (let t = 0; t < 600; t += .1) stepFlyovers(s, [0, 0, 0], .1);
  assert.ok(s.count >= 4, `count ${s.count}`);
});

test('fighters fly in formation, wingmen behind the lead', () => {
  const pass = planPass(FLIGHTS[1], [0, 0, 0], seeded(11));
  pass.t = 10;
  const lead = shipPosition(pass, 0);
  for (let i = 1; i < pass.ships.length; i++) {
    const w = shipPosition(pass, i), ahead = (lead[0] - w[0]) * pass.dir[0] + (lead[2] - w[2]) * pass.dir[1];
    assert.ok(ahead > 0, `wingman ${i} behind`);
  }
});
