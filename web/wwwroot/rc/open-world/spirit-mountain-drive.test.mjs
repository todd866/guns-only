import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../physics/world.mjs';
import {createCar, stepCar} from '../physics/car.mjs';
import {legendCarParams} from '../physics/vehicles.mjs';
import {groundTriangles, terrainStep} from './elevation.mjs';
import {ROAD, SUMMIT, MOUNTAIN, mountainSurface} from './spirit-mountain.mjs';

// The real wheel collision for the road's corridor: the same 4 m ground triangles the stream loads.
function corridor() {
  const w = createWorld(16),
    data = {step: 16, origin: [-1e6, -1e6], width: 2, height: 2, values: [0, 0, 0, 0]},
    done = new Set();
  for (const p of ROAD) {
    const tx = Math.floor(p.x / 64),
      tz = Math.floor(p.z / 64);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const k = `${tx + a},${tz + b}`;
        if (done.has(k)) continue;
        done.add(k);
        const bounds = [(tx + a) * 64, (tz + b) * 64, (tx + a + 1) * 64, (tz + b + 1) * 64];
        for (const [p1, p2, p3] of groundTriangles(data, bounds, terrainStep(bounds)))
          w.addTri(p1, p2, p3, mountainSurface((p1[0] + p2[0] + p3[0]) / 3, (p1[2] + p2[2] + p3[2]) / 3));
      }
  }
  return w;
}
// A kid-steady driver: pure pursuit on the road, easing off for the hairpins.
function drive(tier, seconds = 900) {
  const w = corridor(),
    p = legendCarParams(tier),
    s = ROAD[1],
    c = createCar(
      p,
      [ROAD[0].x, ROAD[0].y + 0.3, ROAD[0].z],
      Math.atan2(s.x - ROAD[0].x, -(s.z - ROAD[0].z))
    );
  let i = 0,
    offRoad = 0,
    flipped = false,
    t = 0;
  for (; t < seconds && i < ROAD.length - 3; t += 1 / 120) {
    while (i < ROAD.length - 3 && Math.hypot(ROAD[i].x - c.pos[0], ROAD[i].z - c.pos[2]) < 6) i++;
    const look = ROAD[Math.min(ROAD.length - 1, i + 1)],
      want = Math.atan2(look.x - c.pos[0], -(look.z - c.pos[2]));
    const fwd = [
        2 * (c.q[0] * c.q[2] + c.q[3] * c.q[1]) * -1,
        0,
        -(1 - 2 * (c.q[0] * c.q[0] + c.q[1] * c.q[1]))
      ],
      yaw = Math.atan2(-fwd[0], fwd[2]) + Math.PI;
    const err = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)),
      speed = Math.hypot(c.vel[0], c.vel[2]);
    const ahead = ROAD[Math.min(ROAD.length - 1, i + 6)],
      bend = Math.abs(Math.atan2(ahead.x - look.x, -(ahead.z - look.z)) - want);
    stepCar(
      c,
      {
        throttle: speed < (bend > 0.6 ? 4 : p.topSpeed) ? 1 : 0,
        brake: bend > 0.6 && speed > 5,
        steer: Math.max(-1, Math.min(1, err * 2.2))
      },
      w,
      1 / 120
    );
    if (mountainSurface(c.pos[0], c.pos[2]) !== 'asphalt' && mountainSurface(c.pos[0], c.pos[2]) !== 'dirt')
      offRoad += 1 / 120;
    if (1 - 2 * (c.q[0] * c.q[0] + c.q[2] * c.q[2]) < 0.2) {
      flipped = true;
      break;
    }
  }
  return {reached: i >= ROAD.length - 3, t, offRoad, flipped, y: c.pos[1]};
}

test('the Little Buggy drives the whole switchback road to the summit', () => {
  const r = drive('starter');
  console.log(
    'starter climb',
    JSON.stringify({t: +r.t.toFixed(0), offRoad: +r.offRoad.toFixed(1), y: +r.y.toFixed(1)})
  );
  assert.ok(!r.flipped, 'never rolls');
  assert.ok(
    r.reached,
    `reached the summit (stopped at y ${r.y.toFixed(1)} of ${SUMMIT.y.toFixed(1)} after ${r.t.toFixed(0)} s)`
  );
  assert.ok(r.t > 150 && r.t < 600, `a real climb but not a slog: ${r.t.toFixed(0)} s`);
  assert.ok(r.offRoad < 10, `stays on the road: ${r.offRoad.toFixed(1)} s off`);
});
