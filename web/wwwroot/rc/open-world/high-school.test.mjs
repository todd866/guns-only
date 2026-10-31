import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HS,
  ROOMS,
  LOCKERS,
  TABLES,
  SHELVES,
  POOL,
  DOORS,
  toGame,
  toPlan,
  doorSpans,
  solidPieces
} from './high-school.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../assets/world/residential.json', import.meta.url)));
const b = data.buildings.find(x => x.kind === 'school' && x.holes?.length === 1);
const clean = r => (r.length > 3 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r);
const outer = clean(b.points),
  hole = clean(b.holes[0]);
const inPoly = (r, [x, z]) => {
  let i = false;
  for (let a = 0, c = r.length - 1; a < r.length; c = a++) {
    const p = r[a],
      q = r[c];
    if (p[1] > z !== q[1] > z && x < ((q[0] - p[0]) * (z - p[1])) / (q[1] - p[1]) + p[0]) i = !i;
  }
  return i;
};
const inside = uv => {
  const p = toGame(uv);
  return inPoly(outer, p) && !inPoly(hole, p);
};

test('the plan frame round-trips and sits on the mapped outline', () => {
  for (const p of [
    [0, 0],
    [40, -20],
    [-60, 30]
  ]) {
    const q = toPlan(toGame(p));
    assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9);
  }
});

test('every door opens one outline edge, and solid pieces cover the rest', () => {
  const spans = doorSpans([outer, hole]);
  const count = Object.values(spans).reduce(
    (n, r) => n + Object.values(r).reduce((m, e) => m + e.length, 0),
    0
  );
  assert.equal(count, DOORS.length);
  for (const ring of Object.values(spans))
    for (const e of Object.values(ring))
      for (const [a, c] of e) {
        assert.ok(a > 0 && c < 1 && c > a);
      }
  assert.deepEqual(solidPieces([[0.4, 0.6]]), [
    [0, 0.4],
    [0.6, 1]
  ]);
});

test('every room, locker bank, table, shelf and the pool basin is inside the building and out of the courtyard', () => {
  for (const r of Object.values(ROOMS)) {
    const [u0, u1, v0, v1] = r.box;
    for (const p of [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1]
    ])
      assert.ok(inside(p), `room corner ${p}`);
  }
  for (const [u0, u1, v] of LOCKERS)
    for (const p of [
      [u0, v],
      [u1, v]
    ])
      assert.ok(inside(p), `lockers ${p}`);
  for (const [u, v, l] of TABLES)
    for (const p of [
      [u - l / 2, v],
      [u + l / 2, v]
    ])
      assert.ok(inside(p), `table ${p}`);
  for (const [u, v0, v1] of SHELVES)
    for (const p of [
      [u, v0],
      [u, v1]
    ])
      assert.ok(inside(p), `shelf ${p}`);
  const c = Math.cos(POOL.yaw),
    s = Math.sin(POOL.yaw);
  for (const [a, w] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ]) {
    const da = a * (POOL.length / 2 + 0.6),
      dw = w * (POOL.width / 2 + 0.6),
      [x, z] = toGame(POOL.at),
      p = [x + da * c + dw * s, z - da * s + dw * c];
    assert.ok(inPoly(outer, p) && !inPoly(hole, p), `pool corner ${toPlan(p).map(v => v.toFixed(1))}`);
  }
  assert.equal(HS.ceiling, 3.4);
});
