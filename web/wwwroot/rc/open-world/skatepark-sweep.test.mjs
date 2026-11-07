import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld} from '../physics/world.mjs';
import {rideHeight, placeCar} from '../physics/car.mjs';
import {createSession, stepSession, readout} from '../physics/session.mjs';
import {courseFromGlb} from '../physics/district.mjs';
import {placeDistrictCourse} from './district-placement.mjs';
import {perimeterSkirts} from './park-skirt.mjs';
import {RESIDENTIAL_PARK, parkPoint} from './residential-frame.mjs';
import {createResidentialTerrain, boundsOfPoints} from './residential-terrain.mjs';

// Cells the pursuit controller cannot roll out of. Bowl/quarter return is another
// worker's vert-lock; those stays are listed, not treated as a missing exit.
const KNOWN = new Map([
  // filled in only when a cell is moving on a transition and the return keeps it there
]);

function worldAtPark() {
  const bytes = fs.readFileSync(new URL('../assets/districts/skatepark.glb', import.meta.url));
  const placed = placeDistrictCourse(courseFromGlb(bytes), RESIDENTIAL_PARK);
  const world = createWorld(4);
  for (const t of placed.world.tris) world.addTri(t.a, t.b, t.c, t.surface);
  for (const q of perimeterSkirts(placed.world)) world.addQuad(...q, 'concrete');
  const terrainData = JSON.parse(
    fs.readFileSync(new URL('../assets/world/residential-terrain.json', import.meta.url))
  );
  const residential = JSON.parse(fs.readFileSync(new URL('../assets/world/residential.json', import.meta.url)));
  const parkPad = boundsOfPoints(
    [parkPoint([-28, 0, -28]), parkPoint([-28, 0, 28]), parkPoint([28, 0, 28]), parkPoint([28, 0, -28])].map(
      p => [p[0], p[2]]
    )
  );
  const raw = createResidentialTerrain(terrainData, {bounds: residential.bounds, edgeFeather: 128});
  const pads = residential.buildings
    .filter(b => b.kind === 'school' || b.kind === 'civic')
    .map(b => {
      const bounds = boundsOfPoints(b.points);
      if (!bounds) return null;
      const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
      return {bounds, datum: raw.rawHeightAt(...center), feather: 25};
    })
    .filter(Boolean);
  const terrain = createResidentialTerrain(terrainData, {
    bounds: residential.bounds,
    edgeFeather: 128,
    pads: terrainData.pads ?? [...(parkPad ? [{bounds: parkPad, datum: 0, feather: 50}] : []), ...pads]
  });
  for (const tri of terrain.triangles()) {
    const xs = tri.map(p => p[0]),
      zs = tri.map(p => p[2]);
    if (Math.max(...xs) < -3160 || Math.min(...xs) > -2880 || Math.max(...zs) < -1000 || Math.min(...zs) > -620)
      continue;
    world.addTri(...tri, 'grass');
  }
  return world;
}

const yawP = RESIDENTIAL_PARK.yaw;
const toLocal = p => {
  const c = Math.cos(yawP),
    s = Math.sin(yawP),
    dx = p[0] - RESIDENTIAL_PARK.anchor[0],
    dz = p[2] - RESIDENTIAL_PARK.anchor[2];
  return [dx * c - dz * s, dx * s + dz * c];
};

test('skatepark grid can drive toward the centre', () => {
  const world = worldAtPark();
  const centre = parkPoint([0, 0.2, 0]);
  const stuck = [];
  const known = [];
  for (let lx = -24; lx <= 24; lx += 4)
    for (let lz = -24; lz <= 16; lz += 4) {
      const at = parkPoint([lx, 4, lz]);
      const hit = world.raycast([at[0], 5, at[2]], [0, -1, 0], 8);
      if (!hit || hit.normal[1] < 0.3) continue;
      if (!['concrete', 'bowl', 'quarter', 'hip', 'grass'].includes(hit.surface)) continue;
      const x = at[0],
        z = at[2];
      if (Math.hypot(x - centre[0], z - centre[2]) < 3) continue;
      const y = hit.point[1] + rideHeight();
      const yaw = Math.atan2(centre[0] - x, -(centre[2] - z));
      const s = createSession(
        {
          world,
          checkpoints: [
            [centre[0], centre[2], 'centre'],
            [centre[0], centre[2] - 1, 'on']
          ],
          secrets: [],
          start: {pos: [x, y, z], yaw}
        },
        {mode: 'kid'}
      );
      s.roam = true;
      placeCar(s.car, [x, y, z], yaw);
      const start = [s.car.pos[0], s.car.pos[2]];
      let minY = s.car.pos[1],
        travel = 0;
      const prev = [...start];
      for (let i = 0; i < 120 * 10; i++) {
        const r = readout(s);
        const e = Math.atan2(centre[0] - r.x, -(centre[2] - r.z)) - r.yaw;
        const err = Math.atan2(Math.sin(e), Math.cos(e));
        stepSession(s, {throttle: 1, steer: Math.max(-1, Math.min(1, err * 2))});
        travel += Math.hypot(s.car.pos[0] - prev[0], s.car.pos[2] - prev[2]);
        prev[0] = s.car.pos[0];
        prev[1] = s.car.pos[2];
        minY = Math.min(minY, s.car.pos[1]);
      }
      const moved = Math.hypot(s.car.pos[0] - start[0], s.car.pos[2] - start[2]);
      const fell = minY < hit.point[1] - 0.8;
      if (moved >= 2 && !fell && s.recoveries === 0) continue;
      const local = toLocal(s.car.pos);
      const row = {
        cell: [lx, lz],
        surface: hit.surface,
        moved: +moved.toFixed(2),
        travel: +travel.toFixed(2),
        fell,
        y: +minY.toFixed(2),
        end: local.map(v => +v.toFixed(1)),
        recoveries: s.recoveries
      };
      const key = `${lx},${lz}`;
      if (KNOWN.has(key)) known.push({...row, why: KNOWN.get(key)});
      else stuck.push(row);
    }
  assert.deepEqual(
    stuck,
    [],
    `cells that cannot leave:\n${stuck.map(c => JSON.stringify(c)).join('\n')}\nknown:\n${known.map(c => JSON.stringify(c)).join('\n')}`
  );
});
