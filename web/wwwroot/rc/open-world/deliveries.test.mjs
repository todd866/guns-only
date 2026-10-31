import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELIVERY,
  createDeliveries,
  deliveryStops,
  pickDropoff,
  startDeliveries,
  stepDeliveries
} from './deliveries.mjs';
import {loadProgress, saveProgress} from './catalog.mjs';
const origin = DELIVERY.pickup;
const at = (x, z = 0) => [origin[0] + x, 0, origin[2] + z];
const stops = deliveryStops(
  [
    {index: 12, x: at(120)[0], z: at(120)[2]},
    {index: 34, x: at(240)[0], z: at(240)[2]}
  ],
  [
    {id: 'school', short: 'School', pos: at(360)},
    {id: 'hangars', pos: at(480)},
    {id: 'chapel', pos: at(600)},
    {id: 'flying-school', pos: at(720)},
    {id: 'pond', pos: at(840)}
  ]
);
const driver = (pos = origin, extra = {}) => ({
  pos,
  body: 'golf',
  driving: true,
  impact: 0,
  placement: 0,
  ...extra
});
const newRun = options => {
  const state = createDeliveries(stops, {random: () => 0, ...options});
  assert.ok(startDeliveries(state, driver()));
  return state;
};
const deliver = (state, seconds = 0.1) =>
  stepDeliveries(state, driver([...state.destination.pos]), seconds).find(e => e.delivered);

test('drop-offs use porch positions and only school, hangars and chapel; overlapping rings are avoided', () => {
  assert.deepEqual(
    stops.map(s => s.id),
    ['porch-12', 'porch-34', 'school', 'hangars', 'chapel']
  );
  assert.deepEqual(stops[0].pos, at(120));
  assert.equal(stops[2].name, 'School');
  assert.equal(stops[0].short, 'House');
  assert.equal(stops[2].short, 'School');
  const choices = [
    {id: 'a', pos: at(0)},
    {id: 'b', pos: at(7)},
    {id: 'c', pos: at(100)}
  ];
  assert.equal(pickDropoff(choices, 'a', () => 0).id, 'c');
  assert.equal(pickDropoff(choices, 'a', () => 0.99).id, 'c');
  assert.equal(pickDropoff([], null), null);
});

test('only a driven golf cart at the dock starts; an active run cannot be reset', () => {
  const state = createDeliveries(stops);
  for (const body of ['jet', 'buggy', 'pickup', 'monster', 'rally', 'pumpkin'])
    assert.equal(startDeliveries(state, driver(origin, {body})), false);
  assert.equal(startDeliveries(state, driver(origin, {driving: false})), false);
  assert.equal(startDeliveries(state, driver(at(DELIVERY.startRadius + 0.01))), false);
  assert.equal(startDeliveries(createDeliveries([]), driver()), false);
  assert.ok(startDeliveries(state, driver(at(DELIVERY.startRadius))));
  state.elapsed = 10;
  assert.equal(startDeliveries(state, driver()), false);
  assert.equal(state.elapsed, 10);
});

test('the four metre ring includes its edge but not a point just outside', () => {
  const state = newRun(),
    target = [...state.destination.pos];
  assert.deepEqual(stepDeliveries(state, driver([target[0] + 4.01, 0, target[2]]), 0.1), []);
  const event = stepDeliveries(state, driver([target[0] + 4, 0, target[2]]), 0.1).at(-1);
  assert.equal(event.delivered, true);
  assert.equal(state.delivered, 1);
  assert.equal(state.elapsed, 0);
  assert.notEqual(state.destination.id, event.destination.id);
});

test('par uses road distance at 6m/s and each leg starts at the car; routes are copied', () => {
  const calls = [],
    source = [
      [origin[0], origin[2]],
      [origin[0], origin[2] + 90],
      [origin[0] + 120, origin[2] + 90],
      [origin[0] + 120, origin[2]]
    ];
  const state = newRun({
    routeTo: (pos, destination) => {
      calls.push({pos: [...pos], destination});
      return calls.length === 1
        ? source
        : [
            [pos[0], pos[2]],
            [destination.pos[0], destination.pos[2]]
          ];
    }
  });
  assert.equal(state.par, 50);
  source[1][1] += 5000;
  assert.equal(state.route[1][1], origin[2] + 90);
  const first = [...state.destination.pos];
  deliver(state);
  assert.deepEqual(calls[0].pos, origin);
  assert.deepEqual(calls[1].pos, first);
  assert.deepEqual(state.route[0], [first[0], first[2]]);
  assert.equal(state.par, 20);
});

test('missing or short routes still reach the drop-off', () => {
  for (const routeTo of [() => [], pos => [[pos[0], pos[2]]]]) {
    const state = newRun({routeTo});
    assert.deepEqual(state.route.at(-1), [state.destination.pos[0], state.destination.pos[2]]);
    assert.equal(state.par, 20);
  }
});

test('a star needs a time under par; even very late parcels are delivered', () => {
  for (const [elapsed, expected] of [
    [19.99, true],
    [20, false],
    [2000, false]
  ]) {
    const state = newRun();
    assert.equal(deliver(state, elapsed).star, expected);
    assert.equal(state.delivered, 1);
    assert.equal(state.stars, Number(expected));
    assert.equal(state.active, true);
  }
});

test('three distinct hard bumps squash but never lose a parcel or award its star', () => {
  const state = newRun(),
    target = state.destination;
  assert.deepEqual(stepDeliveries(state, driver(origin, {impact: DELIVERY.bumpThreshold}), 0.01), []);
  for (let i = 1; i <= 3; i++) {
    assert.equal(stepDeliveries(state, driver(origin, {impact: 6}), 0.01)[0].careful, true);
    assert.equal(state.bumps, i);
    assert.ok(state.wobble > 0);
    stepDeliveries(state, driver(origin, {impact: 6}), 0.1);
    stepDeliveries(state, driver(), 0.01);
    stepDeliveries(state, driver(origin, {impact: 6}), 0.1);
    assert.equal(state.bumps, i);
    stepDeliveries(state, driver(), 0.8);
  }
  assert.equal(state.squashed, true);
  assert.equal(state.destination, target);
  assert.equal(state.active, true);
  assert.ok(state.elapsed < state.par);
  assert.equal(deliver(state).star, false);
  assert.equal(state.delivered, 1);
  assert.equal(state.bumps, 0);
  assert.equal(state.squashed, false);
  assert.equal(deliver(state).star, true);
});

test('leaving the cart freezes time and damage then resumes the same parcel', () => {
  const state = newRun(),
    target = state.destination;
  stepDeliveries(state, driver(), 2);
  for (const extra of [{driving: false}, {body: 'buggy'}]) {
    assert.deepEqual(stepDeliveries(state, driver(target.pos, {...extra, impact: 10}), 1000), []);
    assert.equal(state.paused, true);
    assert.equal(state.elapsed, 2);
    assert.equal(state.bumps, 0);
    assert.equal(state.destination, target);
  }
  stepDeliveries(state, driver(), 1);
  assert.equal(state.paused, false);
  assert.equal(state.elapsed, 3);
  assert.equal(deliver(state).star, true);
});

test('off-route pause uses fixed segments and resumes within 600 metres', () => {
  const state = newRun();
  stepDeliveries(state, driver(at(60, 600)), 1);
  assert.equal(state.paused, false);
  stepDeliveries(state, driver(at(60, 600.01), {impact: 10}), 1000);
  assert.equal(state.paused, true);
  assert.equal(state.elapsed, 1);
  assert.equal(state.bumps, 0);
  stepDeliveries(state, driver(at(60, 599)), 1);
  assert.equal(state.paused, false);
  assert.equal(state.elapsed, 2);
});

test('a map jump into the ring needs a driven exit and return', () => {
  const state = newRun(),
    target = [...state.destination.pos];
  assert.deepEqual(stepDeliveries(state, driver(target, {placement: 1, impact: 10}), 0.1), []);
  assert.deepEqual(stepDeliveries(state, driver(target, {placement: 1}), 0.1), []);
  assert.equal(state.bumps, 0);
  stepDeliveries(state, driver([target[0] + 5, 0, target[2]], {placement: 1}), 0.1);
  assert.equal(stepDeliveries(state, driver(target, {placement: 1}), 0.1).at(-1).delivered, true);
});

test('overlapping fallback stops cannot auto-deliver while standing still', () => {
  const state = createDeliveries(
    [
      {id: 'a', pos: at(120)},
      {id: 'b', pos: at(121)}
    ],
    {random: () => 0}
  );
  startDeliveries(state, driver());
  deliver(state);
  assert.deepEqual(stepDeliveries(state, driver(at(120)), 10), []);
  assert.equal(state.delivered, 1);
});

test('five parcels finish once and a new run is available at the dock', () => {
  const state = newRun();
  for (let i = 0; i < 5; i++) {
    const event = deliver(state);
    assert.equal(event.delivered, true);
    assert.equal(!!event.done, i === 4);
  }
  assert.equal(state.active, false);
  assert.equal(state.delivered, 5);
  assert.equal(state.stars, 5);
  assert.equal(state.destination, null);
  assert.deepEqual(state.route, []);
  assert.deepEqual(stepDeliveries(state, driver(), 100), []);
  assert.ok(startDeliveries(state, driver()));
  assert.equal(state.delivered, 0);
  assert.equal(state.stars, 0);
});

test('total parcels survive save/load and old saves start at zero', () => {
  let saved;
  const storage = {
    getItem: () => saved,
    setItem: (_, value) => {
      saved = value;
    }
  };
  const progress = loadProgress(storage);
  assert.equal(progress.parcelsDelivered, 0);
  progress.parcelsDelivered = 17;
  saveProgress(storage, progress);
  assert.equal(loadProgress(storage).parcelsDelivered, 17);
  for (const value of [-1, 1.5, '3', null]) {
    saved = JSON.stringify({parcelsDelivered: value});
    assert.equal(loadProgress(storage).parcelsDelivered, 0);
  }
});
