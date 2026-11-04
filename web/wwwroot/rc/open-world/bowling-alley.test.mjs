import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {createWorld, SURFACES} from '../physics/world.mjs';
import {buildBowlingAlley} from './bowling-alley.js';
import {
  ALLEY_FLOOR_Y,
  BOWLING_ALLEY,
  COLLISION_WALLS,
  DOORS,
  FRONT_DOOR_POS,
  LANES,
  insideAlley
} from './bowling-alley.mjs';
import {createBowling, recordDelivery, rollBowling, stepBowling, approachLane, pinRack} from './bowling.mjs';
import {LOCATIONS} from './catalog.mjs';
import {createBowlingVisual} from './bowling.js';

test('six playable toy-scale lanes and racks fit inside the alley', () => {
  assert.equal(LANES.length, 6);
  for (const lane of LANES) {
    assert.equal(lane.width, 1.05);
    assert.equal(lane.startZ - lane.headZ, 18);
    assert.equal(approachLane([lane.x, ALLEY_FLOOR_Y, lane.approachZ]), lane);
    for (const pin of pinRack(lane.id)) assert.ok(Math.abs(pin.pos[0] - lane.x) + 0.09 < lane.width / 2);
    assert.ok(insideAlley([lane.x, ALLEY_FLOOR_Y, lane.approachZ]));
    assert.ok(insideAlley([lane.x, ALLEY_FLOOR_Y, lane.endZ]));
  }
  assert.equal(approachLane([FRONT_DOOR_POS[0], 0, FRONT_DOOR_POS[2] + 20]), undefined);
});

test('the authored alley outline is the exact mapped recreation building polygon', () => {
  const tile = JSON.parse(fs.readFileSync(new URL('../assets/world/tile--4-4.json', import.meta.url)));
  const feature = tile.features.find(f => f.id === BOWLING_ALLEY.featureId);
  assert.equal(feature?.properties?.building, 'yes');
  const ring = feature.geometry.coordinates[0].slice(0, -1);
  assert.deepEqual(BOWLING_ALLEY.outline, ring);
  assert.deepEqual(LOCATIONS.find(p => p.id === 'rec').pos, FRONT_DOOR_POS);
});

test('both wide door gaps are present in actual collision walls in both directions', () => {
  const world = createWorld(),
    scene = new T.Scene(),
    alley = buildBowlingAlley(scene, world);
  try {
    assert.equal(DOORS.length, 2);
    assert.ok(COLLISION_WALLS.length >= BOWLING_ALLEY.outline.length);
    for (const door of DOORS) {
      assert.ok(door.width >= 3.2);
      const alongX = door.axis === 'x';
      for (const across of [-1.4, 0, 1.4])
        for (const dir of [-1, 1]) {
          const origin = [door.center[0], 0.35, door.center[1]],
            direction = alongX ? [0, 0, dir] : [dir, 0, 0];
          origin[alongX ? 0 : 2] += across;
          origin[alongX ? 2 : 0] -= dir * 0.4;
          assert.equal(world.raycast(origin, direction, 2), null, `${door.id} opening ${across}, ${dir}`);
          for (let t = 0; t <= 2; t += 0.2) {
            const p = origin.map((v, i) => v + direction[i] * t);
            assert.equal(world.sphereContacts(p, 0.22).length, 0, `${door.id} car clearance`);
          }
        }
    }
    const front = DOORS.find(d => d.id === 'front') ?? DOORS[0];
    const adjacent = [
      front.center[0] + (front.axis === 'x' ? 4 : 0),
      0.35,
      front.center[1] + (front.axis === 'x' ? 0 : 4)
    ];
    const normal = front.axis === 'x' ? [0, 0, -1] : [-1, 0, 0];
    assert.ok(world.raycast(adjacent, normal, 2), 'wall beside door is solid');
    const lintel = [front.center[0], BOWLING_ALLEY.doorTop + 0.2, front.center[1]];
    assert.ok(world.raycast(lintel, normal, 2), 'door lintel above car clearance');
    const floor = world.raycast([LANES[0].x, 0.5, LANES[0].approachZ], [0, -1, 0], 1);
    assert.equal(floor.surface, 'gymfloor');
    assert.ok(Math.abs(floor.point[1] - ALLEY_FLOOR_Y) < 1e-8);
    assert.ok(SURFACES.gymfloor.grip < SURFACES.asphalt.grip);
    const lane = world.raycast([LANES[0].x, 0.5, LANES[0].headZ], [0, -1, 0], 1);
    assert.equal(lane.surface, 'gymfloor');
    assert.ok(lane.point[1] > ALLEY_FLOOR_Y);
    assert.equal(
      world.raycast(
        [FRONT_DOOR_POS[0], 0.35, DOORS[1].center[1]],
        [1, 0, 0],
        DOORS[1].center[0] - FRONT_DOOR_POS[0] + 2
      ),
      null,
      'open cross aisle to the side door'
    );
    alley.update(null, [LANES[0].x, 0, LANES[0].approachZ]);
    assert.equal(alley.root.userData.roof.visible, false);
    alley.update(null, [FRONT_DOOR_POS[0], 0, FRONT_DOOR_POS[2] + 10]);
    assert.equal(alley.root.userData.roof.visible, true);
    const roof = alley.root.getObjectByName('Roof');
    assert.ok(roof?.geometry?.attributes?.position?.count > 0);
    assert.equal(roof.position.y, 0, 'mapped roof geometry is already in world coordinates');
    for (let i = 0; i < roof.geometry.attributes.position.count; i++)
      assert.ok(Math.abs(roof.geometry.attributes.position.getY(i) - BOWLING_ALLEY.height) < 1e-5);
    for (const pos of [
      [FRONT_DOOR_POS[0], 0, FRONT_DOOR_POS[2] + 0.2],
      [-995, 0, 1196], // inside the bounding box but outside the stepped outline
      [LANES[0].x, BOWLING_ALLEY.height + 1, LANES[0].approachZ]
    ]) {
      alley.update(null, pos);
      assert.equal(alley.root.userData.roof.visible, true, `roof stays on outside at ${pos}`);
    }
    assert.equal(scene.getObjectsByProperty('isLight', true).length, 0);
  } finally {
    alley.dispose();
  }
  assert.equal(scene.children.length, 0);
});

test('interior furniture fits the mapped shell and wall lining stays warm', () => {
  const scene = new T.Scene(),
    alley = buildBowlingAlley(scene, createWorld());
  try {
    scene.updateMatrixWorld(true);
    let checked = 0,
      walls = 0;
    alley.root.traverse(o => {
      if (o.name.startsWith('InsideWall-')) {
        assert.ok(o.material.color.r > 0.7 && o.material.color.g > 0.6);
        assert.ok(o.material.emissiveIntensity >= 0.4);
        walls++;
      }
      if (
        !/^(Lane|Gutter|Pinsetter|BallReturn|ScoreScreen|Snack|Shoe|Bumper\d|CeilingStrip)/.test(o.name) ||
        !o.isMesh
      )
        return;
      const a = o.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const p = new T.Vector3().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
        assert.ok(insideAlley(p.toArray()), `${o.name} outside at ${p.toArray()}`);
      }
      checked++;
    });
    assert.ok(checked > 30 && walls >= COLLISION_WALLS.length);
    assert.ok(alley.root.getObjectByName('EntranceLightTop').material.emissiveIntensity > 1);
  } finally {
    alley.dispose();
  }
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
    alley.update(g, [LANES[2].x, 0, LANES[2].approachZ]);
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
    stepBowling(g, {pos: [LANES[5].x, ALLEY_FLOOR_Y, LANES[5].approachZ]}, 1 / 60);
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
