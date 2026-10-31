import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as T from '../../vendor/three.module.js';
import {createArrows, loose, stepArrows} from './arrows.mjs';
import {createArrowView} from './arrows.js';
import {createGang, stepGang, stunOutlaw, OUTLAWS} from './outlaws.mjs';
import {createRoundup, stepRoundup, stunSteer} from './meadow.mjs';
import {loadDex, addLoot} from './dex.mjs';
import {loadProgress, saveProgress} from './catalog.mjs';
import {BUGGY, createCar, rideHeight} from '../physics/car.mjs';

const target = (id, pos, alive = true) => ({id, pos, alive});
const shoot = (targets = [], heading = 0) => {
  const state = createArrows();
  loose(state, {from: [0, 2, 0], heading, targets});
  return state;
};

test('homes gently onto the nearest live target in the forward cone', () => {
  const targets = [
      target('far', [0, 1, -22]),
      target('near', [5, 1, -12]),
      target('dead', [0, 1, -2], false)
    ],
    state = shoot(targets),
    arrow = state.arrows[0];
  assert.equal(arrow.target, 'near');
  stepArrows(state, 1 / 60, targets);
  assert.ok(arrow.pos[0] > 0);
  assert.ok(arrow.pos[0] / -arrow.pos[2] < 0.1, 'starts forward before bending toward the target');
  const events = [];
  for (let i = 0; i < 120; i++) events.push(...stepArrows(state, 1 / 60, targets));
  assert.deepEqual(events, [{hit: 'near', at: [5, 1, -12]}]);
});

test('ignores targets behind, beyond 25 m or outside the 35 degree cone', () => {
  for (const pos of [
    [0, 2, 2],
    [0, 2, -25.01],
    [8, 2, -10]
  ])
    assert.equal(shoot([target('no', pos)]).arrows[0].target, null);
  const angle = (35 * Math.PI) / 180;
  assert.equal(
    shoot([target('edge', [25 * Math.sin(angle), 2, -25 * Math.cos(angle)])]).arrows[0].target,
    'edge'
  );
  assert.equal(shoot([target('east', [12, 2, 0])], Math.PI / 2).arrows[0].target, 'east');
});

test('without a target it flies straight about 30 m, drops, and expires once', () => {
  const state = shoot([], Math.PI / 2),
    arrow = state.arrows[0];
  assert.deepEqual(stepArrows(state, 1.25), []);
  assert.ok(Math.abs(arrow.pos[0] - 30) < 1e-9);
  assert.ok(Math.abs(arrow.pos[2]) < 1e-9);
  assert.equal(arrow.pos[1], 2);
  stepArrows(state, 0.3);
  assert.ok(arrow.pos[1] < 2);
  assert.ok(arrow.pos[0] < 33);
  assert.deepEqual(stepArrows(state, 0.31), [{miss: true}]);
  assert.equal(state.arrows.length, 0);
  assert.deepEqual(stepArrows(state, 10), []);
});

test('a moving locked target is hit once, even with a large last frame', () => {
  const moving = target('steer', [8, 1.1, -20]),
    state = shoot([moving]);
  for (let i = 0; i < 30; i++) {
    moving.pos[0] += 4.2 / 60;
    stepArrows(state, 1 / 60, [moving]);
  }
  assert.deepEqual(stepArrows(state, 2, [moving]), [{hit: 'steer', at: moving.pos}]);
  assert.deepEqual(stepArrows(state, 2, [moving]), []);
  assert.equal(moving.alive, true, 'arrow events do not damage targets');
});

test('cooldown is 0.6 s, separate arrows hit once each, and lost targets expire', () => {
  const targets = [target('toy', [0, 1, -23])],
    state = shoot(targets),
    args = {from: [0, 2, 0], heading: 0, targets};
  assert.equal(loose(state, args), null);
  stepArrows(state, 0.59, targets);
  assert.equal(loose(state, args), null);
  stepArrows(state, 0.01, targets);
  assert.ok(loose(state, args));
  assert.equal(stepArrows(state, 2, targets).filter(e => e.hit === 'toy').length, 2);
  loose(state, args);
  targets[0].alive = false;
  assert.deepEqual(stepArrows(state, 0.1, targets), [{miss: true}]);
  assert.deepEqual(stepArrows(state, 1, targets), []);
});

test('arrow and spark scene objects disappear and owned resources are disposed', () => {
  const scene = new T.Scene(),
    view = createArrowView(scene),
    toy = target('toy', [0, 1, -12]),
    state = shoot([toy]);
  assert.equal(scene.children.length, 1);
  view.update(state, [toy], 0.1);
  assert.equal(view.root.children.length, 2);
  const resources = new Set();
  view.root.traverse(o => {
    if (o.geometry && !o.isSprite) resources.add(o.geometry);
    if (o.material) resources.add(o.material);
    if (o.material?.map) resources.add(o.material.map);
  });
  const disposed = new Set();
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.add(resource));
  stepArrows(state, 2, [toy]);
  view.update(state, [], 0.1);
  assert.equal(view.root.children.length, 0);
  view.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposed.size, resources.size);
});

// Execute the actual main.js bow functions with real rules/save modules and a scene, without
// booting the DOM, network, renderer or a browser. Input/audio are the only platform stubs.
function runtime() {
  const source = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8'),
    gang = createGang(),
    enemy = gang.enemies[0],
    round = createRoundup(),
    dex = loadDex(),
    calls = [],
    saved = new Map(),
    storage = {getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v)},
    rider = new T.Group(),
    car = createCar(BUGGY, [enemy.pos[0], rideHeight(BUGGY), enemy.pos[2] + 12], 0);
  gang.enemies = [enemy];
  round.steers = [];
  rider.position.set(car.pos[0], 2, car.pos[2]);
  const context = vm.createContext({
    T,
    createArrows,
    createArrowView,
    loose,
    stepArrows,
    stunOutlaw,
    stunSteer,
    OUTLAWS,
    addLoot,
    rideHeight,
    scene: new T.Scene(),
    paused: false,
    era: 'past',
    race: {roam: true},
    s: {car},
    toyDino: {visible: true, userData: {rider}},
    riggedDino: null,
    readout: () => ({yaw: 0}),
    dexState: () => dex,
    herd: () => ({herd: [{kind: 'rex'}], mount: 0}),
    beep: (...args) => calls.push(['beep', ...args]),
    audio: {zap: () => calls.push(['zap']), creature: (...args) => calls.push(['creature', ...args])},
    form: 'car',
    boardTricks: {air: 0},
    fireQueued: false,
    punchQueued: false,
    e: {code: 'KeyQ'},
    openWorld: {
      era: () => context.era,
      gang: () => gang,
      meadow: () => ({round}),
      groundAt: () => 0,
      progress: {},
      save: () => saveProgress(storage, context.openWorld.progress)
    }
  });
  const start = source.indexOf('const bowState = createArrows()'),
    end = source.indexOf("// The Lake Town's outlaws", start),
    save = source.match(/function saveDex\(\) \{[\s\S]*?\n\}/)[0],
    key = source.match(/  if \(e\.code === 'KeyQ' && !paused\) \{[\s\S]*?\n  \}/)[0];
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end) + '\n' + save, context);
  return {
    context,
    gang,
    enemy,
    round,
    dex,
    calls,
    storage,
    state: vm.runInContext('bowState', context),
    key: () => vm.runInContext(key, context),
    step: dt => context.bowStep(dt)
  };
}

test('Q shoots only while riding in the past, respects pause/cooldown, and preserves normal Q', () => {
  const r = runtime();
  r.key();
  assert.equal(r.state.arrows.length, 1);
  assert.equal(r.state.arrows[0].pos[1], 2.35, 'origin follows the saddle rider');
  assert.equal(r.context.fireQueued, false);
  assert.equal(r.context.punchQueued, false);
  r.key();
  assert.equal(r.state.arrows.length, 1);
  r.context.paused = true;
  r.step(2);
  r.key();
  assert.equal(r.state.arrows.length, 1);
  r.context.paused = false;
  r.context.era = 'present';
  r.step(0.6);
  r.key();
  assert.equal(r.state.arrows.length, 0);
  assert.equal(r.context.fireQueued, true);
  assert.equal(r.context.punchQueued, true);
  r.context.era = 'past';
  r.context.toyDino.visible = false;
  r.key();
  assert.equal(r.state.arrows.length, 0);
  r.context.riggedDino = {root: {visible: true}, rider: r.context.toyDino.userData.rider};
  r.key();
  assert.equal(r.state.arrows.length, 1);
});

test('main stuns without damage and saves one loot grab; a stunned toy is not stomped', () => {
  const r = runtime(),
    hp = r.enemy.hp;
  r.key();
  r.step(1);
  assert.equal(r.enemy.stunned, 4);
  assert.equal(r.enemy.hp, hp);
  assert.equal(r.enemy.alive, true);
  assert.equal(r.calls.filter(c => c[0] === 'zap').length, 2, 'loose and hit both zap');
  r.context.s.car.pos = [r.enemy.pos[0] + 1.65, rideHeight(BUGGY), r.enemy.pos[2]];
  r.step(1 / 60);
  assert.equal(r.dex.batteries, 1);
  assert.ok(r.dex.parts >= 1 && r.dex.parts <= 2);
  const parts = r.dex.parts;
  r.step(1 / 60);
  assert.equal(r.dex.batteries, 1);
  assert.equal(r.dex.parts, parts);
  assert.equal(loadDex(loadProgress(r.storage)).parts, parts);
  assert.equal(loadDex(loadProgress(r.storage)).batteries, 1);
  assert.ok(r.calls.some(c => c[0] === 'creature' && c[1] === 'rex' && c[2] === 'call'));
  const ev = stepGang(r.gang, {era: 'past', pos: r.context.s.car.pos, riding: true, speed: 6, dt: 1 / 60});
  assert.ok(!ev.some(e => e.stomp === r.enemy.id), 'looted, not stomped');
  assert.equal(r.enemy.alive, true);
});

test('steer loot needs a nearby mounted rider, and only a recovered then stunned steer pays again', () => {
  const r = runtime(),
    steer = createRoundup().steers[0];
  steer.pos = [r.context.s.car.pos[0], r.context.s.car.pos[2] - 1];
  r.round.steers = [steer];
  stunSteer(steer);
  r.context.s.car.pos[1] = 20;
  r.step(0.1);
  assert.equal(r.dex.batteries, 0, 'flying overhead cannot collect');
  r.context.s.car.pos[1] = rideHeight(BUGGY);
  r.context.toyDino.visible = false;
  r.step(0.1);
  assert.equal(r.dex.batteries, 0, 'on foot cannot collect');
  r.context.toyDino.visible = true;
  r.context.era = 'present';
  r.step(0.1);
  assert.equal(r.dex.batteries, 0, 'present cannot collect');
  r.context.era = 'past';
  r.step(0.1);
  assert.equal(r.dex.batteries, 1);
  stunSteer(steer);
  r.step(0.1);
  assert.equal(r.dex.batteries, 1, 'refreshing an active stun cannot farm more loot');
  r.round.done = true;
  stepRoundup(r.round, null, 4);
  assert.equal(steer.stunned, 0, 'a penned steer also recovers');
  stunSteer(steer);
  r.step(0.1);
  assert.equal(r.dex.batteries, 2);
});
