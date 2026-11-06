import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from './world.mjs';
import {createSession, stepSession} from './session.mjs';
import {carForward, carYaw} from './car.mjs';
import {toggleFlight, takeoffFlight, landFlight, stickAttitude, FLIGHT} from './flight.mjs';
import {rotate} from './math.mjs';

function field() {
  const world = createWorld();
  world.addQuad([-400, 0, -400], [-400, 0, 400], [400, 0, 400], [400, 0, -400], 'asphalt');
  return world;
}
const roam = world => {
  const s = createSession(
    {world, start: {pos: [0, 0.2, 0], yaw: 0}, checkpoints: [[0, -500, 'finish']], secrets: []},
    {mode: 'kid'}
  );
  s.roam = true;
  return s;
};
const run = (s, seconds, raw) => {
  for (let i = 0; i < seconds * 120; i++)
    stepSession(s, typeof raw === 'function' ? raw(i / 120) : raw, 1 / 120);
};

test('Enter lifts the car off and it flies where its nose points, climbing on a pull', () => {
  const s = roam(field());
  run(s, 1, {throttle: 1});
  assert.equal(toggleFlight(s.flight, s.car), 'fly');
  run(s, 1.5, {flight: {}});
  assert.ok(s.car.pos[1] > 1.5, `off the ground ${s.car.pos[1]}`);
  const y = s.car.pos[1];
  run(s, 1.5, {flight: {pitch: 1}});
  assert.ok(s.car.pos[1] > y + 3, `pull climbs ${s.car.pos[1]}`);
  assert.equal(s.flight.mode, 'fly');
});

test('rolling into a bank turns the car, and the afterburner is faster than full power', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 1, {flight: {pitch: 0.5}});
  const yaw = carYaw(s.car);
  run(s, 0.5, {flight: {roll: 1}});
  run(s, 1.5, {flight: {}});
  const turned = Math.atan2(Math.sin(carYaw(s.car) - yaw), Math.cos(carYaw(s.car) - yaw));
  assert.ok(Math.abs(turned) > 0.4, `turned ${turned}`);
  run(s, 3, {flight: {power: 1}});
  const full = s.flight.speed;
  run(s, 3, {flight: {burner: true}});
  assert.ok(s.flight.speed > full + 3, `${full} -> ${s.flight.speed}`);
});

test('Pilot (Big Kid) flies the real aeroplane: same turn sense, held bank, a gentle stall', () => {
  // Stick right turns the same way in the pilot model as in the jet integrator.
  const j = roam(field());
  toggleFlight(j.flight, j.car);
  run(j, 1, {flight: {}});
  const jYaw = carYaw(j.car);
  run(j, 1.2, {flight: {roll: 0.7}});
  const jTurn = Math.atan2(Math.sin(carYaw(j.car) - jYaw), Math.cos(carYaw(j.car) - jYaw));

  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 1, {flight: {pilot: true, power: 1}});
  const yaw0 = carYaw(s.car);
  run(s, 0.8, {flight: {pilot: true, roll: 0.7}});
  run(s, 0.8, {flight: {pilot: true}});
  const turn = Math.atan2(Math.sin(carYaw(s.car) - yaw0), Math.cos(carYaw(s.car) - yaw0));
  assert.ok(Math.abs(turn) > 0.25, `banked turn ${turn}`);
  assert.equal(Math.sign(turn), Math.sign(jTurn), `pilot ${turn} turns like the jet ${jTurn}`);
  // Hands off, a pilot's wings stay where they were put: the bank keeps turning it.
  assert.ok(Math.abs(s.flight.bank) > 0.2, `bank holds hands-off (${s.flight.bank})`);

  // Idle the power and hold the nose up: it slows through Vs, stalls, and sinks —
  // then recovers flying speed once the nose comes down, without a crash.
  let stalled = false;
  let sank = 0;
  for (let i = 0; i < 10 * 120 && s.flight.mode === 'fly'; i++) {
    stepSession(s, {flight: {pilot: true, pitch: 0.4, power: -1}}, 1 / 120);
    stalled = stalled || s.flight.stalled === true;
    sank = Math.min(sank, s.car.vel[1]);
  }
  assert.ok(stalled, 'holding the nose up at idle stalls it');
  assert.ok(sank < -1, `the stall sinks (${sank})`);
});

test('Enter again opens the parachute and the car floats down onto its wheels and drives off', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 3, {flight: {pitch: 0.6}});
  const high = s.car.pos[1];
  assert.ok(high > 4);
  assert.equal(toggleFlight(s.flight, s.car), 'chute');
  let peakSink = 0;
  for (let i = 0; i < 30 * 120 && s.flight.mode; i++) {
    stepSession(s, {}, 1 / 120);
    peakSink = Math.min(peakSink, s.car.vel[1]);
  }
  assert.equal(s.flight.mode, null, 'landed');
  assert.ok(peakSink > -FLIGHT.chuteSink - 0.3, `gentle ${peakSink}`);
  run(s, 1, {});
  assert.ok(s.car.pos[1] < 0.3 && s.car.grounded, `${s.car.pos} grounded=${s.car.grounded}`);
  const x = s.car.pos[0],
    z = s.car.pos[2];
  run(s, 1.5, {throttle: 1});
  assert.ok(Math.hypot(s.car.pos[0] - x, s.car.pos[2] - z) > 2, 'drives away');
});

test('flying into a wall pops the chute instead of passing through', () => {
  const world = field();
  world.addQuad([-20, 0, -12], [20, 0, -12], [20, 30, -12], [-20, 30, -12], 'concrete');
  const s = roam(world);
  toggleFlight(s.flight, s.car);
  run(s, 3, {flight: {}});
  assert.ok(s.car.pos[2] > -12, `stayed in front: ${s.car.pos}`);
  assert.notEqual(s.flight.mode, 'fly');
});

test('races never fly', () => {
  const s = roam(field());
  s.roam = false;
  assert.equal(toggleFlight(s.flight, s.car, {roam: false}), null);
  s.flight.mode = 'fly';
  run(s, 0.2, {});
  assert.equal(s.flight.mode, null);
  assert.ok(carForward(s.car));
});

// The easy flyer (kid mode, owner 2026-10-30: Enter to fly was "very janky").
const easy = (o = {}) => ({flight: {easy: true, ...o}});
test('easy flyer: holding the throttle key through take-off climbs instead of diving back down', () => {
  const s = roam(field());
  run(s, 1, {throttle: 1});
  toggleFlight(s.flight, s.car);
  run(s, 3, easy({climb: 1}));
  assert.equal(s.flight.mode, 'fly');
  assert.ok(s.car.pos[1] > 8, `climbed ${s.car.pos[1]}`);
});
test('easy flyer: hands off it cruises level at a safe height, and steering turns without rolling over', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 4, easy());
  assert.equal(s.flight.mode, 'fly');
  assert.ok(s.car.pos[1] > 2.5 && s.car.pos[1] < 6, `height ${s.car.pos[1]}`);
  const yaw = carYaw(s.car);
  run(s, 3, easy({steer: 1}));
  const turned = Math.atan2(Math.sin(carYaw(s.car) - yaw), Math.cos(carYaw(s.car) - yaw));
  assert.ok(Math.abs(turned) > 1.5, `turned ${turned}`);
  assert.ok(Math.abs(s.flight.bank) <= FLIGHT.easy.bank + 1e-9, `bank ${s.flight.bank}`);
});
test('easy flyer: rising ground ahead lifts it over instead of crashing', () => {
  const world = field();
  // A 25% ramp up to a 20 m plateau, 30 m ahead.
  world.addQuad([-20, 0, -30], [20, 0, -30], [20, 20, -110], [-20, 20, -110], 'rock');
  world.addQuad([-20, 20, -110], [20, 20, -110], [20, 20, -300], [-20, 20, -300], 'rock');
  const s = roam(world);
  toggleFlight(s.flight, s.car);
  run(s, 12, easy());
  assert.equal(s.flight.mode, 'fly');
  assert.ok(s.car.pos[2] < -120 && s.car.pos[1] > 21, `${s.car.pos}`);
});
test('easy flyer: holding down lands it on its wheels', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 3, easy({climb: 1}));
  for (let i = 0; i < 20 * 120 && s.flight.mode; i++) stepSession(s, easy({climb: -1}), 1 / 120);
  assert.equal(s.flight.mode, null);
  run(s, 1, {});
  assert.ok(s.car.grounded, `${s.car.pos}`);
});

test('kid mode: Auto-GCAS pulls out of a dive at the ground, and out of an inverted dive', () => {
  for (const roll of [0, 1]) {
    const s = roam(field());
    toggleFlight(s.flight, s.car);
    run(s, 2, {flight: {pitch: 0.6, assist: true}}); // climb away
    if (roll) run(s, 0.9, {flight: {roll: 1, assist: true}}); // roll inverted-ish
    let low = Infinity;
    run(s, 8, t => {
      low = Math.min(low, s.car.pos[1]);
      return {flight: {pitch: -1, power: 1, assist: true}};
    }); // push for the ground
    assert.equal(s.flight.mode, 'fly', `still flying (roll ${roll})`);
    assert.ok(low > 1, `never touched the ground: lowest ${low.toFixed(2)} (roll ${roll})`);
  }
});

test('without the assist a dive reaches the ground, and full power is quick now', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 1, {flight: {pitch: 0.6}});
  run(s, 6, {flight: {pitch: -1}});
  assert.notEqual(s.flight.mode, 'fly');
  const t = roam(field());
  toggleFlight(t.flight, t.car);
  run(t, 1, {flight: {pitch: 0.3}});
  run(t, 4, {flight: {power: 1}});
  assert.ok(t.flight.speed > 25, `speed ${t.flight.speed}`);
});

test('the parachute comes down fast, and the retros fire at the last moment for a soft touchdown', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 3, {flight: {pitch: 0.7, power: 1}}); // up high
  toggleFlight(s.flight, s.car);
  assert.equal(s.flight.mode, 'chute');
  const y0 = s.car.pos[1];
  let fired = null,
    last = 0,
    t = 0;
  while (s.flight.mode === 'chute' && t < 30) {
    last = s.car.vel[1];
    run(s, 1 / 120, {flight: {}});
    t += 1 / 120;
    if (s.flight.retro && fired == null) fired = s.car.pos[1];
  }
  assert.equal(s.flight.mode, null, 'landed');
  assert.ok(y0 / t > 3.5, `came down fast: ${(y0 / t).toFixed(1)} m/s from ${y0.toFixed(0)} m`);
  assert.ok(fired != null && fired < 3, `retros lit low: ${fired?.toFixed(2)} m`);
  assert.ok(last > -1, `soft touchdown: ${last.toFixed(2)} m/s`);
});

test('a winged mount keeps the bank you put in, hands off (no levelling)', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 3, {flight: {power: 1, assist: true, proximity: true}});
  run(s, 0.5, {flight: {roll: 1, assist: true, proximity: true}});
  const bankOf = () => Math.asin(Math.max(-1, Math.min(1, rotate(s.car.q, [1, 0, 0])[1])));
  const before = Math.abs(bankOf());
  run(s, 1.5, {flight: {assist: true, proximity: true}});
  assert.ok(before > 0.4, `banked ${before.toFixed(2)}`);
  assert.ok(
    Math.abs(bankOf()) > before * 0.85,
    `bank held: ${before.toFixed(2)} → ${Math.abs(bankOf()).toFixed(2)}`
  );
});

test('a winged mount diving at the ground is saved late, through its bank, and never hits', () => {
  const s = roam(field());
  toggleFlight(s.flight, s.car);
  run(s, 4, {flight: {power: 1, pitch: -1, assist: true, proximity: true}}); // climb away
  let low = Infinity,
    hit = false,
    assistedAt = null;
  run(s, 8, t => {
    if (s.car.pos[1] < 0.35 && s.flight.mode === 'fly') hit = true;
    if (s.flight.gcas > 0 && assistedAt === null) assistedAt = s.car.pos[1];
    low = Math.min(low, s.car.pos[1]);
    return {flight: {pitch: 1, roll: t < 0.3 ? 1 : 0, assist: true, proximity: true}}; // dive, banked
  });
  assert.ok(!hit, 'never touched the ground');
  assert.ok(assistedAt !== null && assistedAt < 25, `the save started low: ${assistedAt?.toFixed(1)} m`);
  assert.ok(low < 8, `it let you get close: lowest ${low.toFixed(1)} m`);
});

const arcade = (o = {}) => ({flight: {arcade: true, ...o}});
const turned = (from, yaw) => Math.atan2(Math.sin(yaw - from), Math.cos(yaw - from));

test('stick up climbs, and invert flight flips pitch only', () => {
  assert.deepEqual(stickAttitude({x: 0.4, y: 1}), {pitch: 1, roll: 0.4});
  assert.deepEqual(stickAttitude({x: 0.4, y: 1}, {invert: true}), {pitch: -1, roll: 0.4});
  assert.equal(stickAttitude({y: -1}).pitch, -1, 'stick down dives');
  assert.equal(stickAttitude({y: -1}, {invert: true}).pitch, 1, 'invert: stick down climbs');
  const climb = roam(field());
  takeoffFlight(climb.flight, climb.car);
  run(climb, 2.2, arcade(stickAttitude({y: 1})));
  const dive = roam(field());
  takeoffFlight(dive.flight, dive.car);
  run(dive, 2.2, arcade(stickAttitude({y: 1}, {invert: true})));
  assert.ok(
    climb.car.pos[1] > dive.car.pos[1] + 4,
    `up climbs ${climb.car.pos[1].toFixed(1)}, invert holds ${dive.car.pos[1].toFixed(1)}`
  );
  assert.equal(climb.flight.mode, 'fly');
  assert.equal(dive.flight.mode, 'fly');
});

test('arcade stick right banks and turns, then hands off levels and holds altitude', () => {
  const s = roam(field());
  takeoffFlight(s.flight, s.car);
  run(s, 1.2, arcade({pitch: 1}));
  const yaw = carYaw(s.car);
  run(s, 1.4, arcade({roll: 1}));
  const banked = Math.abs(s.flight.bank),
    yawed = turned(yaw, carYaw(s.car));
  assert.ok(banked > 0.4 && banked <= FLIGHT.arcade.bank + 1e-6, `bank ${banked}`);
  assert.ok(yawed > 0.7, `turned right ${yawed}`);
  run(s, 2.4, arcade());
  assert.ok(Math.abs(s.flight.bank) < 0.08, `wings level ${s.flight.bank}`);
  assert.ok(Math.abs(s.flight.pitch) < 0.08, `nose level ${s.flight.pitch}`);
  const y = s.car.pos[1];
  run(s, 2.5, arcade());
  assert.ok(Math.abs(s.car.pos[1] - y) < 1.2, `altitude hold ${y.toFixed(2)} → ${s.car.pos[1].toFixed(2)}`);
  assert.equal(s.flight.mode, 'fly');
});

test('arcade fine yaw turns without banking, and a dive is caught by the floor', () => {
  const yawed = roam(field());
  takeoffFlight(yawed.flight, yawed.car);
  run(yawed, 1, arcade());
  const yaw = carYaw(yawed.car);
  run(yawed, 1.2, arcade({yaw: 1}));
  assert.ok(turned(yaw, carYaw(yawed.car)) > 0.6, 'RB yaws');
  assert.ok(Math.abs(yawed.flight.bank) < 0.08, `yaw did not bank ${yawed.flight.bank}`);
  const s = roam(field());
  takeoffFlight(s.flight, s.car);
  run(s, 2, arcade({pitch: 1}));
  let low = Infinity;
  run(s, 6, () => {
    low = Math.min(low, s.car.pos[1]);
    return arcade({pitch: -1, power: -1});
  });
  assert.equal(s.flight.mode, 'fly');
  assert.ok(low > 2.5, `floor caught the dive at ${low.toFixed(2)}`);
  assert.ok(s.flight.speed >= FLIGHT.arcade.slow - 0.05, `no stall ${s.flight.speed}`);
});

test('arcade rising ground ahead lifts the flyer over it', () => {
  const world = field();
  world.addQuad([-20, 0, -30], [20, 0, -30], [20, 20, -110], [-20, 20, -110], 'rock');
  world.addQuad([-20, 20, -110], [20, 20, -110], [20, 20, -300], [-20, 20, -300], 'rock');
  const s = roam(world);
  takeoffFlight(s.flight, s.car);
  run(s, 12, arcade());
  assert.equal(s.flight.mode, 'fly');
  assert.ok(s.car.pos[2] < -120 && s.car.pos[1] > 21, `${s.car.pos}`);
});

test('take-off and land each do one thing, and the chute keeps the stick', () => {
  const s = roam(field());
  assert.equal(landFlight(s.flight, s.car), null, 'land on the ground stays put');
  assert.equal(takeoffFlight(s.flight, s.car), 'fly');
  assert.equal(takeoffFlight(s.flight, s.car), 'fly', 'take-off again flies up, it does not chute');
  run(s, 1.5, arcade({pitch: 1, flyUp: true}));
  assert.ok(s.car.pos[1] > 6, `flew up ${s.car.pos[1]}`);
  assert.equal(landFlight(s.flight, s.car), 'chute');
  assert.equal(landFlight(s.flight, s.car), 'chute', 'land again does not cancel');
  const yaw = carYaw(s.car);
  run(s, 1, arcade({roll: 1}));
  assert.equal(s.flight.mode, 'chute', 'a stick in the chute does not resume flight');
  assert.ok(Math.abs(turned(yaw, carYaw(s.car))) > 0.3, 'the chute still steers');
  assert.equal(takeoffFlight(s.flight, s.car), 'fly', 'A flies up out of the chute');
  assert.equal(landFlight(s.flight, s.car), 'chute');
  for (let i = 0; i < 40 * 120 && s.flight.mode; i++) stepSession(s, arcade(), 1 / 120);
  assert.equal(s.flight.mode, null, 'the landing reaches the wheels');
  run(s, 0.4, {});
  assert.ok(s.car.grounded, `${s.car.pos}`);
});

test('a barrel roll and a loop finish level and above the floor', () => {
  for (const trick of ['roll', 'loop']) {
    const s = roam(field());
    takeoffFlight(s.flight, s.car);
    run(s, 1.2, arcade());
    let low = Infinity;
    run(s, 0.05, arcade({trick, roll: trick === 'roll' ? 1 : 0}));
    assert.ok(s.flight.trick, `${trick} started`);
    run(s, 2, () => {
      low = Math.min(low, s.car.pos[1]);
      return arcade();
    });
    assert.equal(s.flight.trick, null, `${trick} finished`);
    assert.equal(s.flight.mode, 'fly');
    assert.ok(Math.abs(s.flight.bank) < 0.15, `${trick} bank ${s.flight.bank}`);
    assert.ok(low > 2.5, `${trick} stayed up ${low.toFixed(2)}`);
  }
});
