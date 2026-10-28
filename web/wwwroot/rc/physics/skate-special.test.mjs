import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './world.mjs';
import { createSession, stepSession } from './session.mjs';
import { placeCar, rideHeight } from './car.mjs';
import { createSkate, stepSkate } from './skate.mjs';
import { setSkateRails } from './grind.mjs';
import { HANGAR_PARK, buildHangar, hangarLocal, hangarWorld } from '../open-world/skate-hangar.mjs';
const dt = 1 / 120;
const frame = p => { const l = hangarLocal(p); return [l[0], l[2], l[1]]; };
function hangarRun() {
  const world = createWorld(4); for (const t of buildHangar()) world.addTri(hangarWorld(t.a), hangarWorld(t.b), hangarWorld(t.c), t.surface);
  const p = hangarWorld([-17.5, 0, 0]), q = hangarWorld([-18.5, 0, 0]);
  const yaw = Math.atan2(q[0] - p[0], -(q[2] - p[2]));
  const s = createSession({ world, checkpoints: [[0, 0], [1, 0]], secrets: [], start: { pos: p, yaw } }); s.roam = true;
  placeCar(s.car, [p[0], rideHeight() + .02, p[2]], yaw); setSkateRails(s, HANGAR_PARK, ([u, v, h]) => hangarWorld([u, h, v]));
  const sk = createSkate(HANGAR_PARK), events = [];
  const step = input => { stepSession(s, input); events.push(...stepSkate(sk, s, input, dt, frame)); };
  return { s, sk, events, step };
}
test('held throttle and grab charge SPECIAL from real airs and fire Christ Air', () => {
  const r = hangarRun(); let filled = false;
  for (let i = 0; i < 35 * 120; i++) { r.step({ throttle: 1, drift: true }); filled ||= r.sk.specialActive; }
  assert.ok(filled, `meter ${r.sk.special}, score ${r.sk.score}`);
  assert.ok(r.events.some(e => e.type === 'trick' && e.name === 'Christ Air'), JSON.stringify(r.events));
  assert.equal(r.s.recoveries, 0); assert.ok(!r.events.some(e => e.type === 'bail'));
});
const park = { rails: [], gaps: [], letters: [], goals: [] };
function fakeAir(spin, special, grab = 0) {
  const wheel = () => ({ contact: true, contactNormal: [0, 1, 0] });
  const s = { car: { pos: [0, 2, 0], q: [0, 0, 0, 1], ang: [0, spin * Math.PI / 180, 0], contacts: 0, speed: 3, wheels: [wheel(), wheel(), wheel(), wheel()] }, recoveries: 0 };
  const sk = createSkate(park); sk.special = special ? 1 : 0; sk.specialActive = special; const events = [], f = p => [p[0], p[2], p[1]];
  for (let i = 0; i < 120; i++) events.push(...stepSkate(sk, s, { drift: !!grab }, dt, f));
  s.car.contacts = 4; for (let i = 0; i < 10; i++) events.push(...stepSkate(sk, s, {}, dt, f));
  return { s, sk, events, f };
}
test('spin specials require the meter and actual rotation, not a rounded-up 900', () => {
  assert.ok(fakeAir(905, true).events.some(e => e.name === 'The 900'));
  assert.ok(!fakeAir(880, true).events.some(e => e.name === 'The 900'));
  assert.ok(fakeAir(550, true).events.some(e => e.name === 'Orbital 540'));
  assert.ok(!fakeAir(905, false).events.some(e => e.name === 'The 900'));
});
test('SPECIAL drains, empties on a crash and stays empty after recovery', () => {
  const r = fakeAir(0, true), before = r.sk.special;
  stepSkate(r.sk, r.s, {}, 1, r.f); assert.ok(r.sk.special < before);
  r.s.recoveries++; stepSkate(r.sk, r.s, {}, dt, r.f);
  assert.equal(r.sk.special, 0); assert.equal(r.sk.specialActive, false);
});
test('a long charged grind fires its special once', () => {
  const r = hangarRun(); const p = hangarWorld([-23.8, 3.6 + rideHeight() + .01, -4]), q = hangarWorld([-23.8, 0, -3]);
  placeCar(r.s.car, p, Math.atan2(q[0] - p[0], -(q[2] - p[2])));
  r.sk.special = 1; r.sk.specialActive = true;
  for (let i = 0; i < 3.5 * 120; i++) r.step({ throttle: 1 });
  assert.equal(r.events.filter(e => e.name === 'Meteor Grind').length, 1);
});
