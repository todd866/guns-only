import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HOLES,
  CLUB,
  lieAt,
  holeLine,
  holeLength,
  pickClub,
  strike,
  stepBall,
  createRound,
  holed
} from './country-club.mjs';

// The real course outline, from the streamed map tiles.
const tiles = fs.readdirSync(new URL('../assets/world/', import.meta.url)).filter(f => /^tile-/.test(f));
let ring = null;
for (const f of tiles) {
  const j = JSON.parse(fs.readFileSync(new URL('../assets/world/' + f, import.meta.url)));
  const c = (j.features ?? []).find(x => x.properties?.leisure === 'golf_course');
  if (c) {
    ring = c.geometry.coordinates[0];
    break;
  }
}
const inside = ([x, z]) => {
  let i = false;
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
    const p = ring[a],
      q = ring[b];
    if (p[1] > z !== q[1] > z && x < ((q[0] - p[0]) * (z - p[1])) / (q[1] - p[1]) + p[0]) i = !i;
  }
  return i;
};
const VENUES = [
  [-545, 3388, 100],
  [-694, 3421, 70],
  [-640, 3060, 80]
]; // waterpark, Venice, tropical
const segDist = (p, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
};

test('18 holes, par 70, toy-scaled lengths, all on the real course land and clear of the other venues', () => {
  assert.equal(HOLES.length, 18);
  assert.equal(
    HOLES.reduce((a, h) => a + h.par, 0),
    70
  );
  for (const h of HOLES) {
    const L = holeLength(h),
      [lo, hi] = {3: [70, 120], 4: [120, 175], 5: [230, 320]}[h.par];
    assert.ok(L >= lo && L <= hi, `hole ${h.n} par ${h.par}: ${L.toFixed(0)} m`);
    const line = holeLine(h);
    for (let i = 1; i < line.length; i++)
      for (let k = 0; k <= 10; k++) {
        const p = [
          line[i - 1][0] + ((line[i][0] - line[i - 1][0]) * k) / 10,
          line[i - 1][1] + ((line[i][1] - line[i - 1][1]) * k) / 10
        ];
        assert.ok(inside(p), `hole ${h.n} leaves the course at ${p.map(Math.round)}`);
        for (const [x, z, r] of VENUES)
          assert.ok(
            Math.hypot(p[0] - x, p[1] - z) > r,
            `hole ${h.n} runs into a venue at ${p.map(Math.round)}`
          );
      }
  }
});

test('no hole crosses another (fairways at least 15 m apart, away from shared tee and green ends)', () => {
  for (const a of HOLES)
    for (const b of HOLES) {
      if (a.n >= b.n) continue;
      const la = holeLine(a),
        lb = holeLine(b);
      for (let i = 1; i < la.length; i++)
        for (let k = 1; k < 10; k++) {
          const p = [
            la[i - 1][0] + ((la[i][0] - la[i - 1][0]) * k) / 10,
            la[i - 1][1] + ((la[i][1] - la[i - 1][1]) * k) / 10
          ];
          for (let j = 1; j < lb.length; j++)
            assert.ok(
              segDist(p, lb[j - 1], lb[j]) > 15,
              `holes ${a.n} and ${b.n} cross near ${p.map(Math.round)}`
            );
        }
    }
});

test('the clubhouse, minigolf and tennis sit on the land, clear of every fairway', () => {
  const boxes = [
    [
      CLUB.clubhouse.at[0] - 13,
      CLUB.clubhouse.at[1] - 7,
      CLUB.clubhouse.at[0] + 13,
      CLUB.clubhouse.at[1] + 7
    ],
    CLUB.minigolf.box,
    CLUB.tennis.box
  ];
  for (const [x0, z0, x1, z1] of boxes)
    for (const p of [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1]
    ]) {
      assert.ok(inside(p), `facility corner ${p} off the course`);
      for (const h of HOLES) {
        const l = holeLine(h);
        for (let i = 1; i < l.length; i++)
          assert.ok(segDist(p, l[i - 1], l[i]) > CLUB.fairway + 2, `facility corner ${p} on hole ${h.n}`);
      }
    }
});

test('lies, clubs, and a full driver goes 100-140 m down a fairway', () => {
  const h = HOLES[0];
  assert.equal(lieAt(h, h.green), 'green');
  assert.equal(lieAt(h, h.bunkers[0]), 'sand');
  assert.equal(lieAt(h, h.tee), 'tee');
  assert.equal(pickClub('green', 3), 'putter');
  assert.equal(pickClub('tee', 150), 'driver');
  assert.equal(pickClub('rough', 30), 'wedge');
  assert.equal(pickClub('sand', 150), 'iron');
  const b = strike([0, 0, 0], 0, 'driver', 1);
  for (let i = 0; i < 120 * 20 && !b.rest; i++)
    stepBall(
      b,
      () => 0,
      () => 'fairway',
      1 / 120
    );
  const d = Math.hypot(b.pos[0], b.pos[2]);
  assert.ok(d > 100 && d < 140, `driver ${d.toFixed(0)} m`);
  const w = strike([0, 0, 0], 0, 'wedge', 1);
  let landed = null;
  for (let i = 0; i < 120 * 20 && !w.rest; i++) {
    const e = stepBall(
      w,
      () => 0,
      () => 'green',
      1 / 120
    );
    if (e?.landed) landed = Math.hypot(w.pos[0], w.pos[2]);
  }
  assert.ok(
    landed > 25 && Math.hypot(w.pos[0], w.pos[2]) - landed < 12,
    'a wedge flies and stops on a green'
  );
});

test('a robot can play hole 1 with the picked club, straight at the pin, and hole out', () => {
  const r = createRound(),
    h = HOLES[0];
  let at = [h.tee[0], 0, h.tee[1]],
    done = false;
  for (let s = 0; s < 12 && !done; s++) {
    const lie = lieAt(h, [at[0], at[2]]),
      dist = Math.hypot(h.green[0] - at[0], h.green[1] - at[2]),
      club = pickClub(lie, dist),
      yaw = Math.atan2(h.green[0] - at[0], -(h.green[1] - at[2]));
    const roll = {green: 1.6, fairway: 5.5, tee: 5.5, rough: 10, sand: 18}[lie] ?? 5.5,
      power =
        club === 'putter'
          ? Math.min(1, Math.sqrt(2 * roll * (dist + 0.3)) / 9)
          : club === 'driver'
            ? Math.min(1, dist / 115)
            : Math.min(1, dist / (club === 'iron' ? 90 : 42));
    const b = strike(at, yaw, club, power);
    r.strokes++;
    for (let i = 0; i < 120 * 30 && !b.rest; i++) {
      stepBall(
        b,
        () => 0,
        (x, z) => lieAt(h, [x, z]),
        1 / 120
      );
      if (holed(h, b)) {
        done = true;
        break;
      }
    }
    at = b.pos;
  }
  assert.ok(done, 'holed out');
  assert.ok(r.strokes <= 7, `strokes ${r.strokes}`);
});
