import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.js';
import {createWorld, SURFACES} from '../physics/world.mjs';
import {buildBowlingAlley} from './bowling-alley.js';
import {ALLEY_FLOOR_Y, BOWLING_ALLEY, COLLISION_WALLS, DOORS, LANES} from './bowling-alley.mjs';
import {createBowling, recordDelivery, rollBowling, stepBowling, approachLane, pinRack} from './bowling.mjs';
import {createBowlingVisual} from './bowling.js';

test('six playable toy-scale lanes and racks fit inside the alley', () => {
  assert.equal(LANES.length, 6);
  for (const lane of LANES) {
    assert.equal(lane.width, 1.05);
    assert.equal(lane.startZ - lane.headZ, 18);
    assert.equal(approachLane([lane.x, ALLEY_FLOOR_Y, lane.approachZ]), lane);
    for (const pin of pinRack(lane.id)) assert.ok(Math.abs(pin.pos[0] - lane.x) + 0.09 < lane.width / 2);
  }
  assert.equal(approachLane([-1020, 0, 1266]), undefined);
});

test('both wide door gaps are present in actual collision walls in both directions', () => {
  const world = createWorld(),
    scene = new T.Scene(),
    alley = buildBowlingAlley(scene, world);
  try {
    assert.equal(DOORS.length, 2);
    assert.equal(COLLISION_WALLS.length, 6);
    for (const door of DOORS) {
      assert.ok(door.width >= 3);
      for (const across of [-1.2, 0, 1.2])
        for (const dir of [-1, 1]) {
          const alongX = door.axis === 'x',
            origin = [door.center[0], 0.35, door.center[1]],
            direction = alongX ? [0, 0, dir] : [dir, 0, 0];
          origin[alongX ? 0 : 2] += across;
          origin[alongX ? 2 : 0] -= dir;
          assert.equal(world.raycast(origin, direction, 2), null, `${door.id} opening ${across}, ${dir}`);
          for (let t = 0; t <= 2; t += 0.2) {
            const p = origin.map((v, i) => v + direction[i] * t);
            assert.equal(world.sphereContacts(p, 0.22).length, 0, `${door.id} car clearance`);
          }
        }
    }
    assert.ok(world.raycast([-1023, 0.35, 1266], [0, 0, -1], 2), 'front wall beside door is solid');
    assert.ok(world.raycast([-1020, 3.2, 1266], [0, 0, -1], 2), 'door lintel above car clearance');
    const floor = world.raycast([-1020, 0.5, 1257], [0, -1, 0], 1);
    assert.equal(floor.surface, 'gymfloor');
    assert.ok(Math.abs(floor.point[1] - ALLEY_FLOOR_Y) < 1e-8);
    assert.ok(SURFACES.gymfloor.grip < SURFACES.asphalt.grip);
    const lane = world.raycast([-1020, 0.5, 1245], [0, -1, 0], 1);
    assert.equal(lane.surface, 'gymfloor');
    assert.ok(lane.point[1] > ALLEY_FLOOR_Y);
    assert.equal(
      world.raycast([-1020, 0.35, 1260], [1, 0, 0], 12),
      null,
      'open cross aisle to the side door'
    );
    alley.update(null, [-1020, 0, 1257]);
    assert.equal(alley.root.userData.roof.visible, false);
    alley.update(null, [-1020, 0, 1280]);
    assert.equal(alley.root.userData.roof.visible, true);
    assert.equal(alley.root.getObjectByName('Roof').position.y, BOWLING_ALLEY.height);
    assert.equal(scene.getObjectsByProperty('isLight', true).length, 0);
  } finally {
    alley.dispose();
  }
  assert.equal(scene.children.length, 0);
});

test('score screens draw frame marks, reuse textures and show the perfect-game total', () => {
  const old = globalThis.document,
    written = [];
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillRect() {},
        fillText(text) {
          written.push(text);
        }
      })
    })
  };
  const scene = new T.Scene();
  let alley;
  try {
    alley = buildBowlingAlley(scene, createWorld());
    const g = createBowling({lane: 3, control: 'robot'});
    alley.update(g, [-1016.9, 0, 1257]);
    const screen = alley.root.getObjectByName('ScoreScreen3'),
      texture = screen.material.map;
    recordDelivery(g, 10);
    recordDelivery(g, 10);
    recordDelivery(g, 10);
    alley.update(g);
    assert.equal(screen.material.map, texture);
    assert.match(screen.userData.text, /F4.*Σ30/);
    for (let i = 0; i < 9; i++) recordDelivery(g, 10);
    alley.update(g);
    assert.equal(g.score, 300);
    assert.equal(screen.material.map, texture);
    assert.match(screen.userData.text, /F10 X X X =300.*Σ300/);
    assert.ok(written.includes('STRIKE'));
    assert.ok(alley.root.getObjectByName('Bumper1--1').position.y > ALLEY_FLOOR_Y);
    g.bumpers = false;
    alley.update(g);
    assert.ok(alley.root.getObjectByName('Bumper1--1').position.y < ALLEY_FLOOR_Y);
    let disposed = false;
    texture.addEventListener('dispose', () => {
      disposed = true;
    });
    alley.dispose();
    alley = null;
    assert.ok(disposed);
  } finally {
    alley?.dispose();
    globalThis.document = old;
  }
});

test('a full robot game runs on every lane with ball and pin-to-pin impulses', () => {
  for (const lane of LANES) {
    const g = createBowling({lane: lane.id, control: 'robot'}),
      actor = {pos: [lane.x, ALLEY_FLOOR_Y, lane.approachZ]};
    let rolls = 0;
    while (!g.done && rolls++ < 21) {
      assert.ok(rollBowling(g, {power: 0.8, aim: 0.2, mode: 'kid'}));
      let result;
      for (let i = 0; i < 120 * 10; i++) {
        const e = stepBowling(g, actor, 1 / 120);
        if (e?.rolled) {
          result = e;
          break;
        }
      }
      assert.ok(result?.rolled, 'roll settles');
    }
    assert.ok(g.done);
    assert.ok(g.score > 0 && g.score <= 300);
    assert.equal(g.frames.length, 10);
  }
});

test('pin and rolling-ball visuals update all six racks and dispose cleanly', () => {
  const scene = new T.Scene(),
    visual = createBowlingVisual(scene),
    g = createBowling({lane: 6, control: 'robot'});
  try {
    visual.update(g);
    rollBowling(g, {power: 0.5, aim: 0.1});
    stepBowling(g, {pos: [LANES[5].x, ALLEY_FLOOR_Y, 1257]}, 1 / 60);
    visual.update(g);
    const meshes = scene.getObjectsByProperty('isInstancedMesh', true);
    assert.equal(meshes.length, 2);
    assert.ok(meshes.every(m => m.count === 60));
    assert.ok(scene.getObjectsByProperty('isLine', true).every(m => !m.visible));
  } finally {
    visual.dispose();
  }
  assert.equal(scene.children.length, 0);
});
