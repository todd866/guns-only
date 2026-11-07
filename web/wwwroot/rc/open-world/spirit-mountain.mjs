// Spirit Mountain (docs/design/adventure): the climbable mountain west of the neighbourhood, Forza
// Horizon-style. One height function serves the rendered ground and wheel collision alike
// (elevation.mjs adds it to the playable terrain). Three parts:
//   natural(x,z): a broad bell (230 m) with ridges and two valleys cut deep enough to fly through;
//   the road: switchbacks generated up the face toward the houses (local +z) at a steady grade,
//     with hairpins wide enough for a kid's car;
//   the carve: the ground is the road's height on a shelf either side of it, blended back to the
//     natural slope, so the road is the terrain itself (no separate collision ribbon).
//
// Placed 7 Nov so the trailhead is about 1.2 km of road from the neighbourhood skatepark (the drive
// had been several minutes). Local +z is the face you arrive on. Yaw −π/2 turns that face east, so
// the mass sits in the empty desert west of the houses and clear of the canyon. Ridges stay
// phase-locked to the original centre (2300, −3250) in local metres: the climb is the same road, moved.
import {NATURAL_WATER} from '../physics/water.mjs';
const YAW = -Math.PI / 2,
  RADIUS = 1250,
  FOOT_LX = Math.sin(0.15) * (RADIUS - 40),
  FOOT_LZ = Math.cos(0.15) * (RADIUS - 40),
  TRAIL_AHEAD = 350,
  // Westernmost node still on the skatepark's road component (navigation quantises at 0.2 m).
  JOIN = [-3497.5, -869.65],
  SPAN = 280,
  TRAIL_X = JOIN[0] - SPAN,
  TRAIL_Z = JOIN[1],
  CENTRE_X = TRAIL_X - (FOOT_LZ + TRAIL_AHEAD),
  CENTRE_Z = TRAIL_Z + FOOT_LX;
export const MOUNTAIN = Object.freeze({
  centre: [CENTRE_X, CENTRE_Z],
  yaw: YAW,
  radius: RADIUS,
  peak: 230,
  grade: 0.08,
  hairpinGrade: 0.05,
  hairpinRadius: 15,
  legSpan: 0.72, // radians either side of due south
  roadHalf: 2.75,
  shelf: 6.5,
  falloff: 21,
  summit: 80,
  plateau: 28,
  step: 4, // summit: where the road stops climbing; plateau: the flat top around its end
  valleys: [
    {angle: 1.25, from: 140, depth: 75, width: 170},
    {angle: -1.95, from: 200, depth: 60, width: 150}
  ],
  // The dam (owner, 30 Oct): across the east valley's canyon, holding a reservoir you can dive in;
  // the drowned town sits on a flattened floor under it. (In the upside-down there is no dam.)
  // Distances are along / across the east valley's axis from the mountain's centre.
  lake: {
    valley: 0,
    dam: 650,
    damThick: 9,
    crest: 62,
    level: 60,
    floor: 8,
    town: [525, 632],
    townHalf: 58,
    back: 430
  }
});
const M = MOUNTAIN,
  [CX, CZ] = M.centre;
export const MOUNTAIN_BOUNDS = Object.freeze([CX - M.radius, CZ - M.radius, CX + M.radius, CZ + M.radius]);
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const [COS, SIN] = [Math.cos(M.yaw), Math.sin(M.yaw)];
/** Local metres (yaw 0 was world +x east, +z south) to world [x, y, z]. */
export const toWorld = (lx, lz, y = 0) => [CX + lx * COS - lz * SIN, y, CZ + lx * SIN + lz * COS];
/** World x, z to local metres in the mountain's frame. */
export const toLocal = (x, z) => {
  const dx = x - CX,
    dz = z - CZ;
  return [dx * COS + dz * SIN, -dx * SIN + dz * COS];
};
/** World [x, z] of a point `dx` east and `dz` south of `at`, in the mountain's own frame. */
export const mountainOffset = (at, dx, dz) => {
  const [lx, lz] = toLocal(at[0], at[1]);
  const [x, , z] = toWorld(lx + dx, lz + dz);
  return [x, z];
};

/** The mountain before the road: 0 outside its footprint. */
export function naturalHeight(x, z) {
  const [dx, dz] = toLocal(x, z),
    r = Math.hypot(dx, dz);
  if (r >= M.radius) return 0;
  const phi = Math.atan2(dx, dz),
    t = r / M.radius;
  let h = M.peak * ((1 + Math.cos(Math.PI * t)) / 2) ** 1.3;
  h +=
    14 * Math.sin(4 * phi + 1) * Math.sin(Math.PI * t) +
    5 * Math.sin((dx + 2300) / 37) * Math.sin((dz - 3250) / 53) * Math.sin(Math.PI * t);
  // Valleys: V-shaped, deepening outward from near the summit, fading at the foot.
  for (const v of M.valleys) {
    const ax = Math.sin(v.angle),
      az = Math.cos(v.angle),
      along = dx * ax + dz * az,
      across = dx * az - dz * ax;
    if (along < v.from) continue;
    // A U-shaped trough (cosine across), wide enough to fly a toy plane down; it fades in from
    // high on the flank and out at the foot, so it never ends in a wall.
    const depth = v.depth * smooth((along - v.from) / 320) * smooth((M.radius - along) / 300);
    if (Math.abs(across) < v.width) h -= (depth * (1 + Math.cos((Math.PI * across) / v.width))) / 2;
  }
  // The drowned town's floor: a flat valley bottom upstream of the dam (only ever lowers the ground).
  const L = M.lake,
    f = valleyFrame(x, z);
  if (f.along > L.town[0] - 60 && f.along < L.dam + 20 && Math.abs(f.across) < L.townHalf + 50) {
    const w =
      smooth((f.along - (L.town[0] - 60)) / 60) *
      smooth((L.dam + 20 - f.along) / 20) *
      smooth((L.townHalf + 50 - Math.abs(f.across)) / 50);
    h = Math.min(h, h * (1 - w) + L.floor * w);
  }
  return Math.max(0, h * smooth((M.radius - r) / 60));
}
/** Position in the lake valley's frame: along its axis from the centre, and across it. */
export function valleyFrame(x, z) {
  const v = M.valleys[M.lake.valley],
    [dx, dz] = toLocal(x, z),
    ax = Math.sin(v.angle),
    az = Math.cos(v.angle);
  return {along: dx * ax + dz * az, across: dx * az - dz * ax};
}
export const valleyPoint = (along, across, y = 0) => {
  const v = M.valleys[M.lake.valley],
    ax = Math.sin(v.angle),
    az = Math.cos(v.angle);
  return toWorld(ax * along + az * across, az * along - ax * across, y);
};
const gradLocal = (lx, lz, e = 1) => {
  const h = (a, b) => {
    const [x, , z] = toWorld(a, b);
    return naturalHeight(x, z);
  };
  return [(h(lx + e, lz) - h(lx - e, lz)) / (2 * e), (h(lx, lz + e) - h(lx, lz - e)) / (2 * e)];
};

/** The switchback road, bottom to top: [{ x, z, y, piece }] every ~4 m. piece numbers each leg.
 *  Generated in the mountain's frame (local +x is "east") and stored in world metres, so a yaw
 *  moves the climb without retracing it. */
export const ROAD = (() => {
  const pts = [],
    S = M.step;
  let lx = Math.sin(0.15) * (M.radius - 40),
    lz = Math.cos(0.15) * (M.radius - 40);
  let [x, , z] = toWorld(lx, lz),
    y = naturalHeight(x, z),
    dir = 1,
    piece = 0;
  pts.push({x, z, y, piece});
  for (let guard = 0; guard < 4000; guard++) {
    const r = Math.hypot(lx, lz);
    if (r < M.summit) break;
    const [gx, gz] = gradLocal(lx, lz),
      g = Math.hypot(gx, gz),
      ux = gx / g,
      uz = gz / g;
    // Along the contour, in this leg's direction (local east is dir 1), turned uphill just enough
    // to climb at the grade and to track the ground (error feedback keeps the cut shallow).
    let tx = -uz,
      tz = ux;
    if (tx * dir < 0) {
      tx = -tx;
      tz = -tz;
    }
    const [hx, , hz] = toWorld(lx, lz),
      want = (M.grade + (0.15 * (y - naturalHeight(hx, hz))) / S) / Math.max(g, 1e-6),
      s = Math.max(-0.6, Math.min(0.97, want)),
      c = Math.sqrt(1 - s * s);
    const prevLx = lx,
      prevLz = lz;
    lx += (tx * c + ux * s) * S;
    lz += (tz * c + uz * s) * S;
    [x, , z] = toWorld(lx, lz);
    y += g > M.grade ? M.grade * S : Math.max(-M.grade * S, Math.min(M.grade * S, naturalHeight(x, z) - y));
    pts.push({x, z, y, piece});
    const phi = Math.atan2(lx, lz);
    if (phi * dir > M.legSpan * Math.min(1, r / 500 + 0.35)) {
      // Hairpin: a half circle turning uphill, climbing gently. The arc is in the local frame.
      const mx = lx - prevLx,
        mz = lz - prevLz,
        clx = lx + ux * M.hairpinRadius,
        clz = lz + uz * M.hairpinRadius,
        a0 = Math.atan2(lx - clx, lz - clz),
        n = Math.ceil((Math.PI * M.hairpinRadius) / S);
      // Turn the way the car is already going: the arc's starting tangent must point forward.
      const turn = Math.cos(a0) * mx - Math.sin(a0) * mz >= 0 ? 1 : -1;
      for (let i = 1; i <= n; i++) {
        const a = a0 + (turn * Math.PI * i) / n;
        lx = clx + Math.sin(a) * M.hairpinRadius;
        lz = clz + Math.cos(a) * M.hairpinRadius;
        [x, , z] = toWorld(lx, lz);
        y += (M.hairpinGrade * Math.PI * M.hairpinRadius) / n;
        pts.push({x, z, y, piece: i < n / 2 ? piece : piece + 1});
      }
      piece++;
      dir = -dir;
    }
  }
  return Object.freeze(pts);
})();
export const SUMMIT = Object.freeze({at: [ROAD.at(-1).x, ROAD.at(-1).z], y: ROAD.at(-1).y});

/** The place marker: flat desert, 350 m short of the climb's foot. */
export const TRAILHEAD = Object.freeze([TRAIL_X, TRAIL_Z]);
/** Desert road from the neighbourhood's west edge to the foot. Not part of ROAD: the climb's
 *  length and grade cover the switchbacks only. kind is a drivable road, not a path. */
export const APPROACH = (() => {
  const foot = [ROAD[0].x, ROAD[0].z],
    span = Math.hypot(foot[0] - JOIN[0], foot[1] - JOIN[1]),
    n = Math.max(1, Math.ceil(span / 8)),
    points = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    points.push(
      Object.freeze(i === n ? foot : [JOIN[0] + (foot[0] - JOIN[0]) * t, JOIN[1] + (foot[1] - JOIN[1]) * t])
    );
  }
  return Object.freeze({kind: 'service', points: Object.freeze(points)});
})();

// Segments hashed into 32 m cells for nearest-road queries.
const CELL = 32,
  cells = new Map();
for (let i = 0; i < ROAD.length - 1; i++) {
  const a = ROAD[i],
    b = ROAD[i + 1];
  for (
    let cx = Math.floor(Math.min(a.x, b.x) / CELL) - 1;
    cx <= Math.floor(Math.max(a.x, b.x) / CELL) + 1;
    cx++
  )
    for (
      let cz = Math.floor(Math.min(a.z, b.z) / CELL) - 1;
      cz <= Math.floor(Math.max(a.z, b.z) / CELL) + 1;
      cz++
    ) {
      const k = cx + ',' + cz;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(i);
    }
}
/** The nearest road point per leg within the falloff: [{ d, y, piece }]. */
export function roadNear(x, z) {
  const best = new Map(),
    list = cells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (!list) return [];
  for (const i of list) {
    const a = ROAD[i],
      b = ROAD[i + 1],
      ex = b.x - a.x,
      ez = b.z - a.z,
      L = ex * ex + ez * ez,
      t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / L));
    const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t);
    if (d > M.falloff) continue;
    const p = a.piece,
      cur = best.get(p);
    if (!cur || d < cur.d) best.set(p, {d, y: a.y + (b.y - a.y) * t, piece: p});
  }
  return [...best.values()];
}

/** The final mountain height: the natural slope carved to the road and the summit plateau. */
export function mountainHeight(x, z) {
  if (x < MOUNTAIN_BOUNDS[0] || x > MOUNTAIN_BOUNDS[2] || z < MOUNTAIN_BOUNDS[1] || z > MOUNTAIN_BOUNDS[3])
    return 0;
  let h = naturalHeight(x, z);
  const rs = Math.hypot(x - SUMMIT.at[0], z - SUMMIT.at[1]);
  if (rs < M.plateau + 30) {
    const w = smooth((M.plateau + 30 - rs) / 30);
    h = h * (1 - w) + SUMMIT.y * w;
  }
  const near = roadNear(x, z);
  if (!near.length) return h;
  const shelf = near.reduce((b, n) => (n.d <= M.shelf && (!b || n.d < b.d) ? n : b), null);
  if (shelf) return shelf.y;
  let wn = 1,
    sum = 0,
    ws = 0;
  for (const n of near) {
    const w = smooth((M.falloff - n.d) / (M.falloff - M.shelf));
    wn *= 1 - w;
    sum += w * n.y;
    ws += w;
  }
  return (wn * h + sum) / (wn + ws);
}
/** Surface for wheels and paint: the road, its gravel shoulders, then rock or grass by slope. */
export function mountainSurface(x, z) {
  const near = roadNear(x, z),
    d = near.length ? Math.min(...near.map(n => n.d)) : Infinity;
  if (d <= M.roadHalf) return 'asphalt';
  if (d <= M.shelf) return 'dirt';
  const e = 2,
    sx = (mountainHeight(x + e, z) - mountainHeight(x - e, z)) / (2 * e),
    sz = (mountainHeight(x, z + e) - mountainHeight(x, z - e)) / (2 * e);
  return Math.hypot(sx, sz) > 0.55 ? 'rock' : 'grass';
}
export const inMountain = (x, z) =>
  x >= MOUNTAIN_BOUNDS[0] && x <= MOUNTAIN_BOUNDS[2] && z >= MOUNTAIN_BOUNDS[1] && z <= MOUNTAIN_BOUNDS[3];

// The reservoir: water wherever the ground is below its level, upstream of the dam's face.
// A lake's surface: a low, slow swell (the wave pool's would be far too busy on open water).
export const LAKE = {
  id: 'reservoir',
  level: M.lake.level,
  swell: [
    [0.7, 0.7, 0.06, 23],
    [-0.4, 0.9, 0.03, 11]
  ],
  flow: null,
  active: true,
  contains(x, z) {
    const f = valleyFrame(x, z);
    return (
      f.along > M.lake.back &&
      f.along < M.lake.dam - M.lake.damThick / 2 &&
      Math.abs(f.across) < 220 &&
      mountainHeight(x, z) < M.lake.level
    );
  }
};
NATURAL_WATER.push(LAKE);
/** The dam wall across the canyon: from wall to wall at the crest, foot to crest. */
export function damSpan() {
  const L = M.lake,
    side = s => {
      let a = 0;
      while (a < 300 && mountainHeight(...[valleyPoint(L.dam, s * a)].map(p => [p[0], p[2]])[0]) < L.crest)
        a += 2;
      return s * (a + 6);
    };
  return {from: side(-1), to: side(1), along: L.dam, thick: L.damThick, crest: L.crest};
}
/** The dam wall as world collision triangles: an oriented box from the canyon floor to the crest, its
 *  top a drivable crest road. Faces point outward (the world's collision is one-sided). */
export function damTris() {
  const d = damSpan(),
    h = d.thick / 2,
    out = [];
  const P = (al, ac, y) => valleyPoint(d.along + al, ac, y),
    y0 = M.lake.floor - 6,
    y1 = d.crest;
  const quad = (a, b, c, e) => {
    out.push([a, b, c], [a, c, e]);
  };
  // top (+y), downstream (+along), upstream (-along), the two ends
  quad(P(-h, d.from, y1), P(-h, d.to, y1), P(h, d.to, y1), P(h, d.from, y1));
  quad(P(h, d.from, y0), P(h, d.from, y1), P(h, d.to, y1), P(h, d.to, y0));
  quad(P(-h, d.to, y0), P(-h, d.to, y1), P(-h, d.from, y1), P(-h, d.from, y0));
  quad(P(-h, d.from, y0), P(-h, d.from, y1), P(h, d.from, y1), P(h, d.from, y0));
  quad(P(h, d.to, y0), P(h, d.to, y1), P(-h, d.to, y1), P(-h, d.to, y0));
  // Fix each face's winding to point away from the dam's centre line.
  const mid = valleyPoint(d.along, (d.from + d.to) / 2, (y0 + y1) / 2);
  const wall = out.map(([a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
      n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ctr = [
      (a[0] + b[0] + c[0]) / 3 - mid[0],
      (a[1] + b[1] + c[1]) / 3 - mid[1],
      (a[2] + b[2] + c[2]) / 3 - mid[2]
    ];
    return n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2] >= 0 ? [a, b, c] : [a, c, b];
  });
  // Parapets along both crest edges, so a car on the crest road can't drive off the top.
  const par = DAM_PARAPET;
  return [
    ...wall,
    ...[-1, 1].flatMap(s =>
      frameBox(
        [d.along + s * (h - par.w / 2) - par.w / 2, d.along + s * (h - par.w / 2) + par.w / 2, d.from, d.to],
        y1,
        y1 + par.h
      )
    )
  ];
}
export const DAM_PARAPET = Object.freeze({w: 0.5, h: 0.4}); // low: a toy car's camera sees the lake over it, and still can't drive off
/** A box in the valley frame [along0, along1, across0, across1] from y0 to y1, faces outward. */
function frameBox([a0, a1, c0, c1], y0, y1) {
  const P = (al, ac, y) => valleyPoint(al, ac, y),
    out = [],
    mid = valleyPoint((a0 + a1) / 2, (c0 + c1) / 2, (y0 + y1) / 2);
  const q = (a, b, c, e) => out.push([a, b, c], [a, c, e]);
  q(P(a0, c0, y1), P(a0, c1, y1), P(a1, c1, y1), P(a1, c0, y1));
  q(P(a0, c0, y0), P(a0, c0, y1), P(a1, c0, y1), P(a1, c0, y0));
  q(P(a0, c1, y0), P(a0, c1, y1), P(a1, c1, y1), P(a1, c1, y0));
  q(P(a0, c0, y0), P(a0, c0, y1), P(a0, c1, y1), P(a0, c1, y0));
  q(P(a1, c0, y0), P(a1, c0, y1), P(a1, c1, y1), P(a1, c1, y0));
  return out.map(([a, b, c]) => {
    const u = a.map((v, i) => b[i] - v),
      v = a.map((w, i) => c[i] - w),
      n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ctr = [0, 1, 2].map(i => (a[i] + b[i] + c[i]) / 3 - mid[i]);
    return n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2] >= 0 ? [a, b, c] : [a, c, b];
  });
}

// The drowned town (Lake Mead really drowned St. Thomas, Nevada): a main street of ruined adobe
// houses, a general store and a church with a steeple on the reservoir floor. Boxes in the valley
// frame [along0, along1, across0, across1, height]; walkable and climbable by the robot.
export const TOWN = Object.freeze([
  ...[0, 1, 2, 3].flatMap(i => [
    [540 + i * 20, 552 + i * 20, -22, -12, 3.2 - (i % 2) * 0.8],
    [538 + i * 20, 551 + i * 20, 12, 22, 2.6 + (i % 2) * 0.9]
  ]),
  [600, 618, -30, -14, 4.5], // the general store
  [602, 616, 14, 28, 5], // the church
  [607, 611, 19, 23, 13] // its steeple
]);
function orientedBox([a0, a1, c0, c1, h], y0 = M.lake.floor - 0.5) {
  const P = (al, ac, y) => valleyPoint(al, ac, y),
    y1 = M.lake.floor + h,
    out = [],
    mid = valleyPoint((a0 + a1) / 2, (c0 + c1) / 2, (y0 + y1) / 2);
  const q = (a, b, c, e) => out.push([a, b, c], [a, c, e]);
  q(P(a0, c0, y1), P(a0, c1, y1), P(a1, c1, y1), P(a1, c0, y1));
  q(P(a0, c0, y0), P(a0, c0, y1), P(a1, c0, y1), P(a1, c0, y0));
  q(P(a0, c1, y0), P(a0, c1, y1), P(a1, c1, y1), P(a1, c1, y0));
  q(P(a0, c0, y0), P(a0, c0, y1), P(a0, c1, y1), P(a0, c1, y0));
  q(P(a1, c0, y0), P(a1, c0, y1), P(a1, c1, y1), P(a1, c1, y0));
  return out.map(([a, b, c]) => {
    const u = a.map((v, i) => b[i] - v),
      v = a.map((w, i) => c[i] - w),
      n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ctr = [0, 1, 2].map(i => (a[i] + b[i] + c[i]) / 3 - mid[i]);
    return n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2] >= 0 ? [a, b, c] : [a, c, b];
  });
}
export const townTris = () => TOWN.flatMap(b => orientedBox(b));

// The spring and its waterfall: a stream rises from a cave mouth high in the east valley, tumbles
// down the valley floor and drops over the cliff above the reservoir. Visual (spirit-mountain.js);
// points { along, across, y, width } in the valley frame, the last two being the fall's lip and foot.
export const SPRING = Object.freeze({along: 318, lip: 466, foot: 474});
export const STREAM = (() => {
  const pts = [];
  for (let a = SPRING.along; a <= SPRING.lip; a += 4) {
    const c = Math.sin(a / 23) * 5 + Math.sin(a / 9) * 1.5,
      p = valleyPoint(a, c);
    pts.push({
      along: a,
      across: c,
      y: mountainHeight(p[0], p[2]) + 0.08,
      width: 3 + ((a - SPRING.along) / (SPRING.lip - SPRING.along)) * 3
    });
  }
  const last = pts.at(-1);
  pts.push({along: SPRING.foot, across: last.across, y: M.lake.level, width: last.width + 1.5});
  return Object.freeze(pts);
})();
