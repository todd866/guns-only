import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './world.mjs';
import { createSession, stepSession } from './session.mjs';
import { placeCar, rideHeight, carUp } from './car.mjs';
import { setSkateRails, createBalance, stepBalance } from './grind.mjs';
import { createSkate, stepSkate } from './skate.mjs';
const dt = 1 / 120, frame = p => [p[0], p[2], p[1]], worldPoint = p => [p[0], p[2], p[1]];
function setup({ mode = 'kid', pts = [[0, 0, .5], [0, -12, .5]], kind = 'rail' } = {}) {
  const world = createWorld(4); world.addQuad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50], 'concrete');
  const park = { id: 'test', rails: [{ id: 'test-rail', kind, pts }], gaps: [], letters: [], goals: [] };
  const s = createSession({ world, checkpoints: [[0, 0], [0, -40]], secrets: [], start: { pos: [0, .5, -.1], yaw: 0 } }, { mode }); s.roam = true;
  setSkateRails(s, park, worldPoint); const sk = createSkate(park), events = [];
  const step = (input = { throttle: 1 }) => { stepSession(s, input, dt); events.push(...stepSkate(sk, s, input, dt, frame)); };
  const drive = (seconds, input) => { for (let i = 0; i < seconds * 120; i++) step(typeof input === 'function' ? input(i * dt) : input); };
  const launch = (pos = [.1, .8, -1], vel = [0, -1, -4], yaw = 0) => { placeCar(s.car, pos, yaw); s.car.vel = vel; s.car.speed = Math.hypot(...vel); s.car.forwardSpeed = 4; };
  return { s, sk, events, step, drive, launch };
}
test('descending aligned car captures either direction; perpendicular and climbing lines stay free', () => {
  for (const reverse of [false, true]) {
    const r = setup(); r.launch([.1, .8, -4], [0, -1, reverse ? 4 : -4], reverse ? Math.PI : 0); r.drive(.25);
    assert.ok(r.s.skateRide.active); assert.equal(r.s.skateRide.active.name, '50-50'); assert.equal(r.s.skateRide.active.direction, reverse ? -1 : 1);
    assert.equal(r.s.hits, 0); assert.ok(r.events.some(e => e.name === '50-50'));
  }
  for (const [velocity, yaw] of [[[4, -1, 0], Math.PI / 2], [[0, 3, -4], 0]]) {
    const r = setup(); r.launch([0, .8, -4], velocity, yaw); r.drive(.12); assert.equal(r.s.skateRide.active, null);
  }
});
test('polylines keep distance and slope speed, then exit with a pop', () => {
  const r = setup({ pts: [[0, 0, 1], [0, -3, 1], [1, -6, .5]] }); r.launch([0, 1.2, -1]);
  const samples = []; for (let i = 0; i < 240; i++) { r.step(); const g = r.s.skateRide.active; if (g) samples.push({ distance: g.distance, pos: [...r.s.car.pos], speed: g.speed }); }
  assert.ok(samples.some(p => p.pos[0] > .1), 'follows second segment');
  assert.ok(samples.at(-1).speed > samples[0].speed, 'gravity down slope');
  assert.ok(samples.every((p, i) => !i || p.distance > samples[i - 1].distance));
  assert.equal(r.s.skateRide.active, null); assert.equal(r.s.recoveries, 0);
});
test('hop, hard brake and balance loss release without immediate recapture or bail', () => {
  for (const action of ['hop', 'brake', 'balance']) {
    const r = setup(); r.launch(); r.drive(.2); assert.ok(r.s.skateRide.active);
    if (action === 'balance') r.s.skateRide.active.balance.value = 1.01;
    r.step(action === 'hop' ? { throttle: 1, drift: true } : action === 'brake' ? { brake: true } : { throttle: 1 });
    assert.equal(r.s.skateRide.active, null); assert.ok(r.s.car.vel[1] > 0);
    r.drive(.4, { throttle: 1 }); assert.equal(r.s.skateRide.active, null);
    assert.equal(r.s.hits, 0); assert.equal(r.s.recoveries, 0); assert.ok(!r.events.some(e => e.type === 'bail')); assert.ok(carUp(r.s.car)[1] > .8);
  }
});
test('balance is forgiving for kids, accelerates with time, and steering corrects it', () => {
  const kid = createBalance(), big = createBalance();
  for (let i = 0; i < 5 * 120; i++) { stepBalance(kid, 0, dt); stepBalance(big, 0, dt, 'bigKid'); }
  assert.ok(kid.value < .4 && big.value > 1);
  const before = kid.value; for (let i = 0; i < 30; i++) stepBalance(kid, .5, dt); assert.ok(kid.value < before);
});
test('held grab lands in a manual; release banks air, grind and manual as one multiplied combo', () => {
  const r = setup({ pts: [[0, 0, .5], [0, -4, .5]] }); r.launch([0, 2.4, -.2], [0, 0, -3]);
  r.drive(3, t => ({ throttle: 1, drift: t > .8 }));
  assert.ok(r.events.some(e => e.type === 'trick' && e.name === 'Air'), JSON.stringify(r.events));
  assert.ok(r.events.some(e => e.name === '50-50'));
  assert.ok(r.events.some(e => e.name === 'Manual'));
  assert.equal(r.events.filter(e => e.type === 'land').length, 0, 'manual carries the combo');
  r.drive(.8, { throttle: 1 });
  const banked = r.events.filter(e => e.type === 'land'); assert.equal(banked.length, 1);
  assert.ok(banked[0].tricks >= 3); assert.equal(r.sk.score, banked[0].total); assert.ok(r.sk.score > 1000);
});
test('new placement clears a grind and held manual cannot restart after balance loss', () => {
  const r = setup(); r.launch(); r.drive(.2); assert.ok(r.s.skateRide.active);
  placeCar(r.s.car, [8, rideHeight(), 0], 0); r.step(); assert.equal(r.s.skateRide.active, null); assert.ok(r.s.car.pos[0] > 7);
  r.drive(1, { throttle: 1, drift: true }); assert.ok(r.s.skateRide.manual);
  r.s.skateRide.manual.balance.value = 1.01; r.drive(.1, { throttle: 1, drift: true }); assert.equal(r.s.skateRide.manual, null);
  r.drive(.6, { throttle: 1, drift: true }); assert.equal(r.s.skateRide.manual, null);
});

test('passing below a rail on the flat does not snap up through it', () => {
  const r = setup({ pts: [[0, 0, .4], [0, -12, .4]] });
  placeCar(r.s.car, [.25, rideHeight(), -1], 0); r.drive(.8, { throttle: 1 });
  assert.equal(r.s.skateRide.active, null); assert.ok(!r.events.some(e => e.name === '50-50'));
});

test('approach and steering name boardslides, nosegrinds and 5-0s', () => {
  for (const [yaw, input, name] of [[Math.PI / 2, { drift: true }, 'Boardslide'], [0, { steer: -.5 }, 'Nosegrind'], [0, { steer: .5 }, '5-0']]) {
    const r = setup(); r.launch([0, .8, -1], [0, -1, -4], yaw); r.step({ throttle: 1, ...input });
    assert.equal(r.s.skateRide.active?.name, name); assert.ok(r.events.some(e => e.name === name));
  }
});
test('hop from coping points into the lower bowl, then lands without a crash', () => {
  const r = setup({ kind: 'coping' });
  r.s.course.world.addQuad([-5, .5, -15], [-5, .5, 2], [0, .5, 2], [0, .5, -15], 'concrete');
  r.launch(); r.drive(.2); assert.ok(r.s.skateRide.active);
  r.step({ throttle: 1, drift: true }); assert.ok(r.s.car.vel[0] > 0 && r.s.car.pos[0] > 0, 'toward the lower side');
  r.drive(1, { throttle: 1 }); assert.equal(r.s.hits, 0); assert.equal(r.s.recoveries, 0); assert.ok(!r.events.some(e => e.type === 'bail'));
});

test('a held manual yields to a solid wall instead of passing through it', () => {
  const r = setup();
  r.s.course.world.addQuad([5, 0, -4], [11, 0, -4], [11, 2, -4], [5, 2, -4], 'concrete');
  placeCar(r.s.car, [8, rideHeight(), 0], 0);
  r.drive(2, { throttle: 1, drift: true });
  assert.ok(r.s.car.pos[2] > -4, `wall crossing ${r.s.car.pos}`); assert.equal(r.s.skateRide.manual, null);
});

test('the final combo can land into a manual after the run clock expires', () => {
  const r = setup({ pts: [[0, 0, .5], [0, -4, .5]] }); r.launch([0, 2.4, -.2], [0, 0, -3]); r.sk.left = .1;
  r.drive(3, t => ({ throttle: 1, drift: t > .8 }));
  assert.ok(!r.sk.over && r.s.skateRide.manual, 'clock waits for the manual');
  r.drive(.8, { throttle: 1 }); assert.ok(r.sk.over && r.sk.score > 1000);
});
