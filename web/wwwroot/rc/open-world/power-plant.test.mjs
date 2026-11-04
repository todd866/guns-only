import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {createWorld} from '../physics/world.mjs';
import {createCar, stepCar} from '../physics/car.mjs';
import {vehicleParams} from '../physics/vehicles.mjs';
import {
  POWER_PLANT,
  POWER_PLANT_BOUNDS,
  DRAW_CALL_BUDGET,
  towerRadiusAt,
  buildPowerPlant
} from './power-plant.js';
import {EVENTS, LOCATIONS} from './catalog.mjs';
import {inside, roadWidth, segmentDistance} from './geometry.mjs';
import {insideBase} from './boundary.mjs';
import {SCENERY_BOUNDS} from './district-zones.mjs';
import {MOUNTAIN_BOUNDS} from './spirit-mountain.mjs';
import {CANYON} from './canyon.mjs';
import {PLAZA_BOUNDS} from './town-plaza.mjs';
import {PLAYGROUND_BOUNDS} from './playground.mjs';
import {SKATESTREET_BOUNDS} from './skatestreet.mjs';
import {BOARDWALK_BOUNDS} from './boardwalk.mjs';
import {NY_BOUNDS} from './under-bridge.mjs';
import {MARSEILLE_PAD, MARSEILLE_TERRAIN} from './marseille-site.mjs';
import {YARD_PAD} from './schoolyard.mjs';
import {HANGAR, hangarWorld} from './skate-hangar.mjs';
import {OLD_DISPLAY_CUT} from './petting-zoo.mjs';
import {MINE_BOUNDS} from './mine.mjs';
import {SEWER_BOUNDS} from './sewer.mjs';
import {HOLES, CLUB, holeLine} from './country-club.mjs';
import {MEADOW} from './meadow.mjs';
import {LZ} from './booster.mjs';
import {HOT_WHEELS} from './hot-wheels.mjs';
import {STUNT_JUMPS} from './stunt-jumps.mjs';
import {SKY_JUMPS} from './sky-dive.mjs';
import {fenceSegments} from './fences.mjs';
import {roadsideDetail, desertScatter} from './roadside-detail.mjs';
import {elevationAt} from './elevation.mjs';

const root = new URL('../assets/world/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root)));
const [x0, z0, x1, z1] = POWER_PLANT_BOUNDS;
const ring = [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
  [x0, z0]
];
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
const intersects = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
const clearance = (a, b) => {
  a = a.slice(0, 2);
  b = b.slice(0, 2);
  if (inside(...a, ring) || inside(...b, ring)) return 0;
  let distance = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const c = ring[i - 1],
      d = ring[i];
    if (intersects(a, b, c, d)) return 0;
    distance = Math.min(
      distance,
      segmentDistance(...a, c, d),
      segmentDistance(...b, c, d),
      segmentDistance(...c, a, b),
      segmentDistance(...d, a, b)
    );
  }
  return distance;
};
const hangarBounds = (() => {
  const c = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ].map(([x, z]) => hangarWorld([x * (HANGAR.length / 2 + 3), 0, z * (HANGAR.width / 2 + 3)]));
  return [
    Math.min(...c.map(p => p[0])),
    Math.min(...c.map(p => p[2])),
    Math.max(...c.map(p => p[0])),
    Math.max(...c.map(p => p[2]))
  ];
})();

test('Power plant 250 m site is flat, inside the base, and clear of all authored landmarks', () => {
  assert.deepEqual(POWER_PLANT.center, [-500, 0, 2150]);
  assert.deepEqual(POWER_PLANT_BOUNDS, [-625, 2025, -375, 2275]);
  assert.equal(x1 - x0, 250);
  assert.equal(z1 - z0, 250);
  const terrain = read('playable-terrain.json');
  for (let x = x0; x <= x1; x += 5)
    for (let z = z0; z <= z1; z += 5) {
      assert.equal(elevationAt(terrain, x, z, MARSEILLE_TERRAIN), 0, `flat datum at ${x},${z}`);
      assert.ok(insideBase(x, z), `inside base at ${x},${z}`);
    }
  const landmarkBoxes = [
    ...SCENERY_BOUNDS,
    MOUNTAIN_BOUNDS,
    CANYON.bounds,
    PLAZA_BOUNDS,
    PLAYGROUND_BOUNDS,
    SKATESTREET_BOUNDS,
    BOARDWALK_BOUNDS,
    NY_BOUNDS,
    MARSEILLE_PAD.bounds,
    YARD_PAD.bounds,
    hangarBounds,
    OLD_DISPLAY_CUT.slice(0, 4),
    MINE_BOUNDS,
    SEWER_BOUNDS,
    CLUB.minigolf.box,
    CLUB.tennis.box
  ];
  for (const b of landmarkBoxes) assert.ok(!overlaps(POWER_PLANT_BOUNDS, b), `overlaps landmark box ${b}`);
  for (const h of HOLES) {
    const l = holeLine(h);
    for (let i = 1; i < l.length; i++)
      assert.ok(clearance(l[i - 1], l[i]) > CLUB.fairway + 20, `hole ${h.n} too close`);
  }
  for (const [gx, gz, gr] of MEADOW.green)
    assert.ok(Math.hypot(gx - POWER_PLANT.center[0], gz - POWER_PLANT.center[2]) > gr + 200, 'meadow clear');
  assert.ok(Math.hypot(LZ.at[0] - POWER_PLANT.center[0], LZ.at[1] - POWER_PLANT.center[2]) > 500, 'LZ-1 clear');
  assert.ok(
    Math.hypot(HOT_WHEELS.at[0] - POWER_PLANT.center[0], HOT_WHEELS.at[2] - POWER_PLANT.center[2]) > 500,
    'Hot Wheels clear'
  );
  for (const j of STUNT_JUMPS)
    assert.ok(Math.hypot(j.x - POWER_PLANT.center[0], j.z - POWER_PLANT.center[2]) > 250, `stunt jump ${j.id}`);
  for (const j of SKY_JUMPS)
    assert.ok(
      Math.hypot(j.pad[0] - POWER_PLANT.center[0], j.pad[1] - POWER_PLANT.center[2]) > 250,
      `sky jump ${j.id}`
    );
  for (const p of LOCATIONS.filter(p => p.id !== 'power-plant'))
    assert.ok(
      Math.hypot(p.pos[0] - POWER_PLANT.center[0], p.pos[2] - POWER_PLANT.center[2]) > 400,
      `${p.id} too close`
    );
});

test('Power plant site clears every road, rail, building, apron, fence, race, and generated scatter', () => {
  const overview = read('overview.json');
  for (const s of fenceSegments({roads: overview.roads}))
    assert.ok(clearance(s.a, s.b) > 20, 'clears public fence segment');
  for (let tx = Math.floor(x0 / 256) - 1; tx <= Math.floor(x1 / 256) + 1; tx++)
    for (let tz = Math.floor(z0 / 256) - 1; tz <= Math.floor(z1 / 256) + 1; tz++) {
      const file = new URL(`tile-${tx}-${tz}.json`, root),
        tile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {tile: [tx, tz], features: []};
      for (const f of tile.features) {
        const g = f.geometry,
          p = f.properties;
        if (g.type === 'LineString' && (p.highway || p.aeroway || p.railway))
          for (let i = 1; i < g.coordinates.length; i++)
            assert.ok(
              clearance(g.coordinates[i - 1], g.coordinates[i]) > roadWidth(p) / 2 + 10,
              `route ${f.id}`
            );
        if (
          g.type === 'Polygon' &&
          (p.building || p.aeroway || p.amenity === 'parking' || p.leisure === 'golf_course')
        ) {
          const r = g.coordinates[0];
          assert.ok(
            !r.some(pt => inside(...pt, ring)) && !ring.some(pt => inside(...pt, r)),
            `polygon ${f.id}`
          );
          for (let i = 1; i < r.length; i++)
            assert.ok(clearance(r[i - 1], r[i]) > 10, `polygon edge ${f.id}`);
        }
      }
      const bounds = [tx * 256, tz * 256, (tx + 1) * 256, (tz + 1) * 256];
      for (const p of [...roadsideDetail(tile, bounds), ...desertScatter(tile, bounds, null, 460)])
        assert.ok(!inside(p.x, p.z, ring), `runtime scatter inside power plant at ${p.x},${p.z}`);
    }
  for (const e of EVENTS)
    if (Array.isArray(e.points))
      for (let i = 1; i < e.points.length; i++)
        assert.ok(
          clearance(e.points[i - 1], e.points[i]) > (e.half ?? 6) + 20,
          `${e.id} crosses Power plant`
        );
});

test('catalog entry uses short six-year-old wording and never uses "Enter" or danger terms', () => {
  const entry = LOCATIONS.find(p => p.id === 'power-plant');
  assert.ok(entry, 'power-plant is registered in LOCATIONS');
  assert.equal(entry.kind, 'discovery');
  assert.equal(entry.short, 'Power plant');
  assert.deepEqual(entry.pos, POWER_PLANT.gate);
  assert.equal(new Set(LOCATIONS.map(p => p.id)).size, LOCATIONS.length);
  for (const text of [entry.name, entry.short, POWER_PLANT.signText]) {
    assert.ok(typeof text === 'string' && text.trim().length > 0);
    assert.ok(!/\benter\b/i.test(text), `forbidden word "Enter" in "${text}"`);
    assert.ok(
      !/radiation|danger|warning|hazard|meltdown|toxic|atomic|nuclear/i.test(text),
      `keep player-facing text friendly and simple: "${text}"`
    );
    const words = text.trim().split(/\s+/);
    assert.ok(words.length <= 3, `short phrase: "${text}"`);
    assert.ok(words.every(w => w.length <= 7), `six-year-old word length in "${text}"`);
  }
});

test('hyperbolic cooling towers, steam plumes, colliders, and draw-call budget', () => {
  // Hyperbolic profile narrows to the throat and flares at the top lip.
  const rBase = towerRadiusAt(0),
    rThroat = towerRadiusAt(POWER_PLANT.tower.throatY),
    rTop = towerRadiusAt(POWER_PLANT.tower.height);
  assert.ok(rBase > rThroat + 6, `base ${rBase} wider than throat ${rThroat}`);
  assert.ok(rTop > rThroat + 1.2, `top lip ${rTop} flares past throat ${rThroat}`);
  assert.ok(rBase > rTop, `base ${rBase} wider than top ${rTop}`);

  const scene = new T.Scene(),
    world = createWorld();
  const plant = buildPowerPlant(scene, world);
  assert.equal(plant.root.name, 'PowerPlant');

  let drawCalls = 0;
  plant.root.traverse(o => {
    if (!o.isMesh) return;
    drawCalls++;
    const pos = o.geometry.attributes.position;
    assert.ok(pos && pos.count > 0, `${o.name} has vertices`);
    for (const v of pos.array) assert.ok(Number.isFinite(v));
  });
  assert.equal(drawCalls, plant.drawCalls);
  assert.ok(drawCalls <= DRAW_CALL_BUDGET && drawCalls < 12, `draw calls ${drawCalls} under budget`);

  // Cooling tower mesh has non-uniform vertical staining in vertex colors plus a procedural texture.
  const towersMesh = plant.root.getObjectByName('PowerPlant_towers');
  assert.ok(towersMesh, 'merged cooling towers mesh exists');
  assert.ok(towersMesh.material.vertexColors, 'towers material uses vertexColors');
  assert.ok(towersMesh.material.map, 'towers material has procedural staining texture');
  const col = towersMesh.geometry.attributes.color;
  assert.ok(col, 'towers geometry has color attribute');
  let minR = Infinity,
    maxR = -Infinity;
  for (let i = 0; i < col.count; i++) {
    minR = Math.min(minR, col.getX(i));
    maxR = Math.max(maxR, col.getX(i));
  }
  assert.ok(maxR - minR > 0.08, 'vertical staining varies vertex colours');

  // Steam plume rises, widens, and fades over time, and respects reducedMotion.
  const steam = plant.root.getObjectByName('PowerPlant_steam');
  assert.ok(steam && steam.isInstancedMesh, 'instanced steam plume exists');
  const m0 = new T.Matrix4(),
    m1 = new T.Matrix4(),
    p0 = new T.Vector3(),
    p1 = new T.Vector3(),
    s0 = new T.Vector3(),
    s1 = new T.Vector3(),
    q = new T.Quaternion();
  steam.getMatrixAt(0, m0);
  m0.decompose(p0, q, s0);
  plant.update(1.5, POWER_PLANT.gate);
  steam.getMatrixAt(0, m1);
  m1.decompose(p1, q, s1);
  assert.notEqual(p0.y, p1.y, 'steam puff rises with time');
  plant.update(1.5, POWER_PLANT.gate, {reducedMotion: true});
  const m2 = new T.Matrix4(),
    p2 = new T.Vector3();
  steam.getMatrixAt(0, m2);
  m2.decompose(p2, q, s1);
  assert.equal(p2.y, p1.y, 'reducedMotion holds steam plume steady');

  // Colliders block driving through towers, dome, and turbine hall, while gates and roads stay clear.
  for (const [tx, tz] of POWER_PLANT.towers) {
    const wallHit = world.raycast([tx, 2, tz + rBase + 3], [0, 0, -1], 6);
    assert.ok(wallHit, `cooling tower at ${tx},${tz} is solid`);
  }
  const [dx, dz] = POWER_PLANT.dome.at;
  assert.ok(
    world.raycast([dx, 2, dz + POWER_PLANT.dome.radius + 3], [0, 0, -1], 6),
    'reactor dome is solid'
  );
  const [hx, hz] = POWER_PLANT.turbineHall.at;
  assert.ok(
    world.raycast([hx, 2, hz + POWER_PLANT.turbineHall.size[2] / 2 + 3], [0, 0, -1], 6),
    'turbine hall is solid'
  );
  for (const [px, pz] of [
    [POWER_PLANT.gate[0], POWER_PLANT.gate[2]],
    [POWER_PLANT.gate[0], POWER_PLANT.gate[2] + 6],
    [POWER_PLANT.center[0], POWER_PLANT.center[2] + 55],
    [POWER_PLANT.center[0], POWER_PLANT.center[2] - 5]
  ]) {
    assert.equal(world.sphereContacts([px, 0.4, pz], 0.35).length, 0, `drive lane clear at ${px},${pz}`);
    const gHit = world.raycast([px, 2, pz], [0, -1, 0], 3);
    assert.ok(gHit, `ground contact at ${px},${pz}`);
  }
  const [wx, wz] = POWER_PLANT.pond.at;
  const pondHit = world.raycast([wx, 2, wz], [0, -1, 0], 3);
  assert.equal(pondHit?.surface, 'water', 'intake pond has water collision surface');

  plant.dispose();
  assert.equal(scene.children.length, 0, 'dispose removes root from scene');
});

test('rigid-body RC car drives through the gate into the yard and cannot pass through a cooling tower', () => {
  const scene = new T.Scene(),
    world = createWorld();
  const plant = buildPowerPlant(scene, world);
  const params = vehicleParams('buggy');

  // 1. Drive north (yaw 0, -z) from the spawn point 6 m south of the main gate into the compound.
  const car = createCar(params, [POWER_PLANT.gate[0], 0.16, POWER_PLANT.gate[2] + 6], 0);
  // A standing start: four seconds carries it ~25 m, well past the gate (two left it still accelerating).
  for (let i = 0; i < 480; i++) stepCar(car, {throttle: 1}, world, 1 / 120);
  assert.ok(car.pos[2] < POWER_PLANT.gate[2] - 8, `car drove through the gate into the yard: z=${car.pos[2]}`);
  assert.ok(car.contacts > 0, 'car stays in wheel contact on the compound pad');

  // 2. Drive straight toward the west cooling tower wall and verify the collider stops penetration.
  const [tx, tz] = POWER_PLANT.towers[0];
  const rWall = POWER_PLANT.tower.baseRadius + 1.5;
  const crashCar = createCar(params, [tx, 0.16, tz + rWall + 6], 0);
  for (let i = 0; i < 240; i++) stepCar(crashCar, {throttle: 1}, world, 1 / 120);
  const distToTowerCenter = Math.hypot(crashCar.pos[0] - tx, crashCar.pos[2] - tz);
  assert.ok(
    distToTowerCenter >= POWER_PLANT.tower.baseRadius,
    `car blocked outside cooling tower shell (dist ${distToTowerCenter.toFixed(2)} m)`
  );

  plant.dispose();
});


test('in the past the plant leaves no invisible walls: its collision rides the era-plant gate', () => {
  const world = createWorld();
  // Open desert under the site (ungated), so the car has ground to drive on in both eras.
  world.addQuad([-800, 0, 1800], [-800, 0, 2500], [-200, 0, 2500], [-200, 0, 1800], 'dirt');
  const gated = {
    addTri: (a, b, c, s) => world.addTri(a, b, c, s, 'era-plant'),
    addQuad: (a, b, c, d, s) => {
      world.addTri(a, b, c, s, 'era-plant');
      world.addTri(a, c, d, s, 'era-plant');
    },
    raycast: world.raycast
  };
  const plant = buildPowerPlant(new T.Scene(), gated);
  const [tx, tz] = POWER_PLANT.towers[0];
  const drive = () => {
    const car = createCar(vehicleParams('buggy'), [tx, 0.16, tz + POWER_PLANT.tower.baseRadius + 8], 0);
    for (let i = 0; i < 720; i++) stepCar(car, {throttle: 1}, world, 1 / 120);
    return car.pos[2];
  };
  assert.ok(drive() > tz, 'present: the tower stops the car');
  world.openGate('era-plant');
  assert.ok(drive() < tz - POWER_PLANT.tower.baseRadius, 'past: the car drives straight through where the tower stands');
  plant.dispose();
});
