import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './world.mjs';
import { createSession, stepSession } from './session.mjs';
import { carForward, carYaw } from './car.mjs';
import { toggleFlight, FLIGHT } from './flight.mjs';

function field() {
  const world = createWorld();
  world.addQuad([-400, 0, -400], [-400, 0, 400], [400, 0, 400], [400, 0, -400], 'asphalt');
  return world;
}
const roam = world => { const s = createSession({ world, start: { pos: [0, .2, 0], yaw: 0 }, checkpoints: [[0, -500, 'finish']], secrets: [] }, { mode: 'kid' }); s.roam = true; return s; };
const run = (s, seconds, raw) => { for (let i = 0; i < seconds * 120; i++) stepSession(s, typeof raw === 'function' ? raw(i / 120) : raw, 1 / 120); };

test('Enter lifts the car off and it flies where its nose points, climbing on a pull', () => {
  const s = roam(field());
  run(s, 1, { throttle: 1 });
  assert.equal(toggleFlight(s.flight, s.car), 'fly');
  run(s, 1.5, { flight: {} });
  assert.ok(s.car.pos[1] > 1.5, `off the ground ${s.car.pos[1]}`);
  const y = s.car.pos[1];
  run(s, 1.5, { flight: { pitch: 1 } });
  assert.ok(s.car.pos[1] > y + 3, `pull climbs ${s.car.pos[1]}`);
  assert.equal(s.flight.mode, 'fly');
});

test('rolling into a bank turns the car, and the afterburner is faster than full power', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 1, { flight: { pitch: .5 } });
  const yaw = carYaw(s.car);
  run(s, .5, { flight: { roll: 1 } });
  run(s, 1.5, { flight: {} });
  const turned = Math.atan2(Math.sin(carYaw(s.car) - yaw), Math.cos(carYaw(s.car) - yaw));
  assert.ok(Math.abs(turned) > .4, `turned ${turned}`);
  run(s, 3, { flight: { power: 1 } });
  const full = s.flight.speed;
  run(s, 3, { flight: { burner: true } });
  assert.ok(s.flight.speed > full + 3, `${full} -> ${s.flight.speed}`);
});

test('Enter again opens the parachute and the car floats down onto its wheels and drives off', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 3, { flight: { pitch: .6 } });
  const high = s.car.pos[1];
  assert.ok(high > 4);
  assert.equal(toggleFlight(s.flight, s.car), 'chute');
  let peakSink = 0;
  for (let i = 0; i < 30 * 120 && s.flight.mode; i++) { stepSession(s, {}, 1 / 120); peakSink = Math.min(peakSink, s.car.vel[1]); }
  assert.equal(s.flight.mode, null, 'landed');
  assert.ok(peakSink > -FLIGHT.chuteSink - .3, `gentle ${peakSink}`);
  run(s, 1, {});
  assert.ok(s.car.pos[1] < .3 && s.car.grounded, `${s.car.pos} grounded=${s.car.grounded}`);
  const x = s.car.pos[0], z = s.car.pos[2];
  run(s, 1.5, { throttle: 1 });
  assert.ok(Math.hypot(s.car.pos[0] - x, s.car.pos[2] - z) > 2, 'drives away');
});

test('flying into a wall pops the chute instead of passing through', () => {
  const world = field();
  world.addQuad([-20, 0, -12], [20, 0, -12], [20, 30, -12], [-20, 30, -12], 'concrete');
  const s = roam(world);
  toggleFlight(s.flight, s.car);
  run(s, 3, { flight: {} });
  assert.ok(s.car.pos[2] > -12, `stayed in front: ${s.car.pos}`);
  assert.notEqual(s.flight.mode, 'fly');
});

test('races never fly', () => {
  const s = roam(field()); s.roam = false;
  assert.equal(toggleFlight(s.flight, s.car, { roam: false }), null);
  s.flight.mode = 'fly';
  run(s, .2, {});
  assert.equal(s.flight.mode, null);
  assert.ok(carForward(s.car));
});
