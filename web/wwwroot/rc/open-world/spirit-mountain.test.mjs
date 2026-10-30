import test from 'node:test';
import assert from 'node:assert/strict';
import { MOUNTAIN, ROAD, SUMMIT, mountainHeight, naturalHeight, mountainSurface, roadNear } from './spirit-mountain.mjs';

const seg = i => Math.hypot(ROAD[i].x - ROAD[i - 1].x, ROAD[i].z - ROAD[i - 1].z);

test('a real switchback climb: foot to a 200 m+ summit, ~3 km, never steeper than 9%', () => {
  let L = 0, worst = 0; for (let i = 1; i < ROAD.length; i++) { L += seg(i); worst = Math.max(worst, Math.abs(ROAD[i].y - ROAD[i - 1].y) / seg(i)); }
  assert.ok(ROAD[0].y < 5 && SUMMIT.y > 200, `foot ${ROAD[0].y.toFixed(1)} summit ${SUMMIT.y.toFixed(1)}`);
  assert.ok(L > 2000 && L < 4500, `length ${L.toFixed(0)}`);
  assert.ok(worst <= .09, `steepest ${worst.toFixed(3)}`);
  assert.ok(ROAD.at(-1).piece >= 3, `${ROAD.at(-1).piece + 1} legs`);
});

test('the road is the ground: flat across its width, and the ground follows it', () => {
  for (let i = 5; i < ROAD.length - 5; i += 7) {
    const a = ROAD[i], b = ROAD[i + 1], len = seg(i + 1), nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    for (const o of [-MOUNTAIN.roadHalf, 0, MOUNTAIN.roadHalf]) {
      const y = mountainHeight(a.x + nx * o, a.z + nz * o);
      assert.ok(Math.abs(y - a.y) < .35, `road point ${i} offset ${o}: ground ${y.toFixed(2)} vs road ${a.y.toFixed(2)}`);
    }
    assert.equal(mountainSurface(a.x, a.z), 'asphalt');
  }
});

test('legs stay apart: no point of the road is near a different leg except through a hairpin', () => {
  for (let i = 0; i < ROAD.length; i += 3) {
    const others = roadNear(ROAD[i].x, ROAD[i].z).filter(n => Math.abs(n.piece - ROAD[i].piece) > 1);
    assert.equal(others.length, 0, `point ${i} sees leg ${others[0]?.piece} at ${others[0]?.d.toFixed(1)} m`);
  }
});

test('the ground is continuous (no cliffs from the carve) along a line across the switchbacks', () => {
  let prev = mountainHeight(MOUNTAIN.centre[0], MOUNTAIN.centre[1] + 1200), worst = 0;
  for (let z = MOUNTAIN.centre[1] + 1200; z > MOUNTAIN.centre[1]; z -= 1) { const h = mountainHeight(MOUNTAIN.centre[0] + 40, z); worst = Math.max(worst, Math.abs(h - prev)); prev = h; }
  assert.ok(worst < 1.6, `largest 1 m step ${worst.toFixed(2)}`);
});

test('valleys deep enough to fly through, and nothing outside the footprint', () => {
  const v = MOUNTAIN.valleys[0], at = r => [MOUNTAIN.centre[0] + Math.sin(v.angle) * r, MOUNTAIN.centre[1] + Math.cos(v.angle) * r];
  const [x, z] = at(700), side = [x + Math.cos(v.angle) * v.width, z - Math.sin(v.angle) * v.width];
  assert.ok(naturalHeight(...side) - naturalHeight(x, z) > 40, 'the valley floor is 40 m+ below its sides');
  assert.equal(mountainHeight(MOUNTAIN.centre[0] + MOUNTAIN.radius + 5, MOUNTAIN.centre[1]), 0);
});
