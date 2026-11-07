import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RESIDENTIAL_START} from './residential-frame.mjs';
import {BOUNDS, LOCATIONS} from './catalog.mjs';
import {APPROACH, MOUNTAIN_BOUNDS, ROAD, TRAILHEAD, inMountain} from './spirit-mountain.mjs';
import {CANYON} from './canyon.mjs';
import {SCENERY_BOUNDS} from './district-zones.mjs';
import {residentialRoads, residentialNavigationRoads} from './residential-roads.mjs';
import {WORLD_LINKS, buildRoadGraph, roadRoute} from './navigation.mjs';
import {fenceSegments} from './fences.mjs';
import {createWorld} from '../physics/world.mjs';
import {createCar, stepCar} from '../physics/car.mjs';
import {legendCarParams} from '../physics/vehicles.mjs';
import {groundTriangles, terrainStep} from './elevation.mjs';

const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const length = pts => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

function roads() {
  const base = JSON.parse(fs.readFileSync(new URL('../assets/world/overview.json', import.meta.url)));
  const data = JSON.parse(fs.readFileSync(new URL('../assets/world/residential.json', import.meta.url)));
  return residentialNavigationRoads([...residentialRoads(base.roads, data), ...WORLD_LINKS, APPROACH]);
}

test('a continuous road drives from the skatepark to Spirit Mountain in 1 to 1.5 km', () => {
  const hub = [RESIDENTIAL_START.pos[0], RESIDENTIAL_START.pos[2]];
  const trail = LOCATIONS.find(p => p.id === 'mountain').pos;
  const goal = [trail[0], trail[2]];
  const route = roadRoute(buildRoadGraph(roads()), hub, goal);
  const drive = length(route);
  const miss = Math.hypot(route.at(-1)[0] - goal[0], route.at(-1)[1] - goal[1]);
  assert.ok(miss < 25, `road ends ${miss.toFixed(0)} m from the trailhead after ${drive.toFixed(0)} m`);
  assert.ok(drive >= 1000 && drive <= 1500, `drive ${drive.toFixed(0)} m`);
});

test('Spirit Mountain stays off the neighbourhood, the canyon and the other districts', () => {
  for (const box of [...SCENERY_BOUNDS, CANYON.bounds])
    assert.ok(!overlaps(MOUNTAIN_BOUNDS, box), `mountain box overlaps ${box}`);
  const hub = RESIDENTIAL_START.pos;
  const trail = LOCATIONS.find(p => p.id === 'mountain').pos;
  assert.equal(inMountain(hub[0], hub[2]), false);
  assert.equal(inMountain(trail[0], trail[2]), false, 'the trailhead is on the flat ground before the climb');
  assert.ok(
    MOUNTAIN_BOUNDS[0] >= BOUNDS[0] &&
      MOUNTAIN_BOUNDS[2] <= BOUNDS[2] &&
      MOUNTAIN_BOUNDS[1] >= BOUNDS[1] &&
      MOUNTAIN_BOUNDS[3] <= BOUNDS[3],
    'the mountain is inside the playable world'
  );
  const foot = [ROAD[0].x, ROAD[0].z];
  assert.ok(Math.hypot(foot[0] - trail[0], foot[1] - trail[2]) < 400, 'trailhead sits just short of the road foot');
  assert.deepEqual(APPROACH.points[0], [-3497.5, -869.65]);
  assert.deepEqual(APPROACH.points.at(-1), [ROAD[0].x, ROAD[0].z]);
  for (let i = 1; i < APPROACH.points.length; i++) {
    const gap = Math.hypot(
      APPROACH.points[i][0] - APPROACH.points[i - 1][0],
      APPROACH.points[i][1] - APPROACH.points[i - 1][1]
    );
    assert.ok(gap > 0 && gap <= 8, `approach gap ${gap.toFixed(1)} m`);
  }
  assert.deepEqual([trail[0], trail[2]], [...TRAILHEAD]);
});

test('no fence crosses the desert road to the mountain', () => {
  const segs = fenceSegments({roads: roads()});
  const pointSeg = (p, u, v) => {
    const dx = v[0] - u[0],
      dz = v[1] - u[1],
      L = dx * dx + dz * dz || 1,
      t = Math.max(0, Math.min(1, ((p[0] - u[0]) * dx + (p[1] - u[1]) * dz) / L));
    return Math.hypot(p[0] - u[0] - dx * t, p[1] - u[1] - dz * t);
  };
  const segDist = (a, b, c, d) => {
    const rx = b[0] - a[0],
      rz = b[1] - a[1],
      sx = d[0] - c[0],
      sz = d[1] - c[1],
      denom = rx * sz - rz * sx;
    if (Math.abs(denom) > 1e-9) {
      const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / denom,
        u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / denom;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
    }
    return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
  };
  for (let i = 1; i < APPROACH.points.length; i++) {
    const a = APPROACH.points[i - 1],
      b = APPROACH.points[i];
    for (const s of segs) {
      const d = segDist(a, b, s.a, s.b);
      assert.ok(d > 1.5, `fence ${s.way} comes within ${d.toFixed(1)} m of the approach`);
    }
  }
});

test('a car drives the desert road from the neighbourhood edge to the trailhead', () => {
  const w = createWorld(16),
    data = {step: 16, origin: [-1e6, -1e6], width: 2, height: 2, values: [0, 0, 0, 0]},
    done = new Set();
  for (const p of APPROACH.points) {
    const tx = Math.floor(p[0] / 64),
      tz = Math.floor(p[1] / 64);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const k = `${tx + a},${tz + b}`;
        if (done.has(k)) continue;
        done.add(k);
        const bounds = [(tx + a) * 64, (tz + b) * 64, (tx + a + 1) * 64, (tz + b + 1) * 64];
        for (const [p1, p2, p3] of groundTriangles(data, bounds, terrainStep(bounds))) w.addTri(p1, p2, p3, 'asphalt');
      }
  }
  const start = APPROACH.points[2],
    next = APPROACH.points[3],
    car = createCar(
      legendCarParams('starter'),
      [start[0], 0.3, start[1]],
      Math.atan2(next[0] - start[0], -(next[1] - start[1]))
    );
  let i = 2;
  for (let t = 0; t < 80 && Math.hypot(car.pos[0] - TRAILHEAD[0], car.pos[2] - TRAILHEAD[1]) > 8; t += 1 / 120) {
    while (i < APPROACH.points.length - 1 && Math.hypot(APPROACH.points[i][0] - car.pos[0], APPROACH.points[i][1] - car.pos[2]) < 8)
      i++;
    const look = APPROACH.points[Math.min(APPROACH.points.length - 1, i + 2)],
      want = Math.atan2(look[0] - car.pos[0], -(look[1] - car.pos[2])),
      fwd = [2 * (car.q[0] * car.q[2] + car.q[3] * car.q[1]) * -1, 0, -(1 - 2 * (car.q[0] * car.q[0] + car.q[1] * car.q[1]))],
      yaw = Math.atan2(-fwd[0], fwd[2]) + Math.PI,
      err = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
    stepCar(car, {throttle: 1, brake: false, steer: Math.max(-1, Math.min(1, err * 2.2))}, w, 1 / 120);
  }
  const miss = Math.hypot(car.pos[0] - TRAILHEAD[0], car.pos[2] - TRAILHEAD[1]);
  assert.ok(miss < 12, `car stopped ${miss.toFixed(0)} m from the trailhead at y ${car.pos[1].toFixed(2)}`);
});
