import test from 'node:test';
import assert from 'node:assert/strict';
import {TIME_GATES, GATE_RADIUS, timeGateStep, createTimeGates, gateAwake, pastHolds} from './dark-world.mjs';
import {MOUNTAIN, valleyFrame} from './spirit-mountain.mjs';

const gate = id => TIME_GATES.find(g => g.id === id);
const at = g => [g.at[0], 0, g.at[1]];

test('the summit gate is the first crossing and takes you back in time', () => {
  const r = timeGateStep({}, at(gate('summit')), {now: 0});
  assert.equal(r.trip.to, 'past');
  assert.equal(r.state.era, 'past');
});

test('the town gate sleeps until you have crossed once, then drops you on the old lake floor', () => {
  assert.equal(timeGateStep({}, at(gate('town')), {crossed: false}).trip, null);
  const r = timeGateStep({}, at(gate('town')), {crossed: true});
  assert.equal(r.trip.to, 'past');
  const f = valleyFrame(r.trip.at[0], r.trip.at[1]);
  // Inside the reservoir's footprint, on the drowned town's main street.
  assert.ok(f.along > MOUNTAIN.lake.town[0] && f.along < MOUNTAIN.lake.dam, `along ${f.along}`);
  assert.ok(Math.abs(f.across) < 6, `across ${f.across}`);
  assert.ok(pastHolds(...r.trip.at));
});

test('every arrival lands clear of every gate, so a trip never bounces straight back', () => {
  for (const g of TIME_GATES)
    for (const other of TIME_GATES.filter(o => o.era === g.to.era))
      assert.ok(
        Math.hypot(g.to.at[0] - other.at[0], g.to.at[1] - other.at[1]) > GATE_RADIUS * 2,
        `${g.id} lands in ${other.id}`
      );
});

test('gates only work in their own era, and a gate you stand in is latched', () => {
  const gates = createTimeGates();
  assert.equal(gates.step(at(gate('lake-town')), {crossed: true}), null); // that gate is in the past
  assert.ok(gates.step(at(gate('summit')), {now: 0}));
  assert.equal(gates.era(), 'past');
  assert.equal(gates.step(at(gate('summit-past')), {now: 0.5}), null); // cooldown and latch
  const back = gates.step(at(gate('summit-past')), {now: 5}); // backing in later: home
  assert.equal(back.to, 'present');
});

test('leaving the mountain in the past brings you home where you are', () => {
  const r = timeGateStep({era: 'past'}, [0, 0, 0], {now: 3});
  assert.equal(r.trip.gate, 'fade');
  assert.equal(r.state.era, 'present');
  assert.deepEqual(r.trip.at, [0, 0]);
});

test('gate wake rule', () => {
  assert.ok(gateAwake(gate('summit')));
  assert.ok(!gateAwake(gate('town')));
  assert.ok(gateAwake(gate('town'), true));
});

test('flying over a gate does not cross it', () => {
  const g = gate('summit'),
    groundAt = () => 230;
  assert.equal(timeGateStep({}, [g.at[0], 300, g.at[1]], {groundAt}).trip, null);
  assert.ok(timeGateStep({}, [g.at[0], 230.4, g.at[1]], {groundAt}).trip);
});
