import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHerd, befriend, called, wildLeft, wildNear, WILD, HERD_MAX, NEST} from './herd.mjs';
import {mountainHeight, ROAD} from './spirit-mountain.mjs';
import {valleyFrame} from './spirit-mountain.mjs';

test('the first dinosaur named before the herd existed carries over', () => {
  const s = loadHerd({dinoName: 'Rexy'});
  assert.deepEqual(s.herd, [{kind: 'rex', name: 'Rexy', colour: 0}]);
  assert.equal(s.mount, 0);
});

test('bad saves are cleaned, never fatal', () => {
  const s = loadHerd({
    herd: [
      null,
      {kind: 'unicorn', name: 'x'},
      {kind: 'rex', name: ''},
      {kind: 'rex', name: 'Spike', colour: 99}
    ],
    mount: 7,
    wildFriends: ['nope', 'wild-2']
  });
  assert.deepEqual(
    s.herd.map(d => d.name),
    ['Spike']
  );
  assert.ok(s.herd[0].colour >= 0 && s.herd[0].colour < 6);
  assert.equal(s.mount, 0);
  assert.deepEqual(s.friends, ['wild-2']);
});

test('befriending adds to the herd, marks the wild one as a friend, and keeps names distinct', () => {
  const s = loadHerd({dinoName: 'Rexy'});
  befriend(s, {name: 'Spike', wild: 'wild-1', colour: 1});
  const twin = befriend(s, {name: 'Spike'});
  assert.equal(twin.name, 'Spike 2');
  assert.deepEqual(s.friends, ['wild-1']);
  assert.equal(wildLeft(s).length, WILD.length - 1);
  for (let i = 0; i < 20; i++) befriend(s, {name: `D${i}`});
  assert.equal(s.herd.length, HERD_MAX);
});

test('calling: a name picks that dinosaur (spelling-tolerant), a general call picks the last ridden', () => {
  const s = loadHerd({
    herd: [
      {kind: 'rex', name: 'Rexy'},
      {kind: 'rex', name: 'Spike'},
      {kind: 'rex', name: 'Blue'}
    ],
    mount: 2
  });
  assert.equal(called(s, 'SPIKE').index, 1);
  assert.equal(called(s, 'spik').index, 1);
  assert.equal(called(s, 'rexxy').index, 0);
  assert.equal(called(s, 'here').index, 2);
  assert.equal(called(s, 'banana'), null);
  assert.equal(called(loadHerd({}), 'here'), null);
});

test('wild dinosaurs live on the flat lake floor, clear of the town and the farm', () => {
  for (const w of WILD.filter(w => !w.far)) {
    const f = valleyFrame(w.home[0], w.home[2]);
    assert.ok(
      f.along > 520 && f.along < 620 && f.across > 40 && f.across < 100,
      `${w.id} ${f.along} ${f.across}`
    );
  }
  const s = loadHerd({});
  assert.equal(wildNear(s, WILD[0].home).id, 'wild-1');
  assert.equal(wildNear(s, [0, 0, 0]), null);
});

test('the quetzalcoatlus nests high on the mountain road, on flat ground you can ride up to', () => {
  assert.ok(WILD.some(w => w.kind === 'quetzal' && w.far));
  const h = mountainHeight(NEST[0], NEST[2]);
  assert.ok(h > 150, `nest height ${h}`);
  for (const [dx, dz] of [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2]
  ])
    assert.ok(Math.abs(mountainHeight(NEST[0] + dx, NEST[2] + dz) - h) < 0.5, 'flat around the nest');
  const road = Math.min(...ROAD.map(p => Math.hypot(p.x - NEST[0], p.z - NEST[2])));
  assert.ok(road < 12, `${road} m from the road`);
});
