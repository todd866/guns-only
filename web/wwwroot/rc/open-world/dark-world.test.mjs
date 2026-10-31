import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIME_GATES,
  GATE_RADIUS,
  timeGateStep,
  createTimeGates,
  crossTimeGate,
  gateAwake,
  pastHolds
} from './dark-world.mjs';
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

test('a gate whose destination fails to load changes nothing and returns no trip', async () => {
  const gates = createTimeGates();
  const g = TIME_GATES.find(x => x.id === 'summit');
  let asked = 0;
  const trip = await crossTimeGate(gates, [g.at[0], 0, g.at[1]], {
    now: 0,
    prepare: async () => (asked++, false)
  });
  assert.equal(trip, null);
  assert.equal(asked, 1);
  assert.equal(gates.era(), 'present', 'still in the light world');
  // Standing in the gate it cools down rather than retrying every frame, then tries again.
  assert.equal(
    await crossTimeGate(gates, [g.at[0], 0, g.at[1]], {now: 0.5, prepare: async () => true}),
    null
  );
  const later = await crossTimeGate(gates, [g.at[0], 0, g.at[1]], {now: 5, prepare: async () => true});
  assert.equal(later?.to, 'past');
  assert.equal(gates.era(), 'past');
});

test('the era switches only after the destination is ready, and the trip carries where to arrive', async () => {
  const gates = createTimeGates();
  const g = TIME_GATES.find(x => x.id === 'summit');
  let eraWhilePreparing = null;
  const trip = await crossTimeGate(gates, [g.at[0], 230, g.at[1]], {
    now: 0,
    groundAt: () => 230,
    prepare: async () => {
      eraWhilePreparing = gates.era();
      return true;
    }
  });
  assert.equal(eraWhilePreparing, 'present');
  assert.equal(gates.era(), 'past');
  assert.deepEqual(trip.position, [g.to.at[0], 230, g.to.at[1]]);
});

test('fading home from the edge of the past needs no loading', async () => {
  const gates = createTimeGates({era: 'past'});
  let asked = false;
  const trip = await crossTimeGate(gates, [0, 0, 0], {now: 1, prepare: async () => ((asked = true), false)});
  assert.equal(trip.gate, 'fade');
  assert.equal(asked, false);
  assert.equal(gates.era(), 'present');
});
