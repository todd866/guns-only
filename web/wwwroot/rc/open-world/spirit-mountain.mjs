// Spirit Mountain (docs/design/adventure): the climbable mountain north of Dreamland, Forza
// Horizon-style. One height function serves the rendered ground and wheel collision alike
// (elevation.mjs adds it to the playable terrain). Three parts:
//   natural(x,z): a broad bell (230 m) with ridges and two valleys cut deep enough to fly through;
//   the road: switchbacks generated up the south face by following the slope at a steady grade,
//     with hairpins wide enough for a kid's car;
//   the carve: the ground is the road's height on a shelf either side of it, blended back to the
//     natural slope, so the road is the terrain itself (no separate collision ribbon).
import { NATURAL_WATER } from '../physics/water.mjs';
export const MOUNTAIN = Object.freeze({
  centre: [2300, -3250], radius: 1250, peak: 230,
  grade: .08, hairpinGrade: .05, hairpinRadius: 15, legSpan: .72,   // radians either side of due south
  roadHalf: 2.75, shelf: 6.5, falloff: 21, summit: 80, plateau: 28, step: 4,   // summit: where the road stops climbing; plateau: the flat top around its end
  valleys: [{ angle: 1.25, from: 140, depth: 75, width: 170 }, { angle: -1.95, from: 200, depth: 60, width: 150 }],
  // The dam (owner, 30 Oct): across the east valley's canyon, holding a reservoir you can dive in;
  // the drowned town sits on a flattened floor under it. (In the upside-down there is no dam.)
  // Distances are along / across the east valley's axis from the mountain's centre.
  lake: { valley: 0, dam: 650, damThick: 9, crest: 62, level: 60, floor: 8, town: [525, 632], townHalf: 58, back: 430 },
});
const M = MOUNTAIN, [CX, CZ] = M.centre;
export const MOUNTAIN_BOUNDS = Object.freeze([CX - M.radius, CZ - M.radius, CX + M.radius, CZ + M.radius]);
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

/** The mountain before the road: 0 outside its footprint. */
export function naturalHeight(x, z) {
  const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz);
  if (r >= M.radius) return 0;
  const phi = Math.atan2(dx, dz), t = r / M.radius;
  let h = M.peak * ((1 + Math.cos(Math.PI * t)) / 2) ** 1.3;
  h += 14 * Math.sin(4 * phi + 1) * Math.sin(Math.PI * t) + 5 * Math.sin(x / 37) * Math.sin(z / 53) * Math.sin(Math.PI * t);
  // Valleys: V-shaped, deepening outward from near the summit, fading at the foot.
  for (const v of M.valleys) {
    const ax = Math.sin(v.angle), az = Math.cos(v.angle), along = dx * ax + dz * az, across = dx * az - dz * ax;
    if (along < v.from) continue;
    // A U-shaped trough (cosine across), wide enough to fly a toy plane down; it fades in from
    // high on the flank and out at the foot, so it never ends in a wall.
    const depth = v.depth * smooth((along - v.from) / 320) * smooth((M.radius - along) / 300);
    if (Math.abs(across) < v.width) h -= depth * (1 + Math.cos(Math.PI * across / v.width)) / 2;
  }
  // The drowned town's floor: a flat valley bottom upstream of the dam (only ever lowers the ground).
  const L = M.lake, f = valleyFrame(x, z);
  if (f.along > L.town[0] - 60 && f.along < L.dam + 20 && Math.abs(f.across) < L.townHalf + 50) {
    const w = smooth((f.along - (L.town[0] - 60)) / 60) * smooth((L.dam + 20 - f.along) / 20) * smooth((L.townHalf + 50 - Math.abs(f.across)) / 50);
    h = Math.min(h, h * (1 - w) + L.floor * w);
  }
  return Math.max(0, h * smooth((M.radius - r) / 60));
}
/** Position in the lake valley's frame: along its axis from the centre, and across it. */
export function valleyFrame(x, z) {
  const v = M.valleys[M.lake.valley], dx = x - CX, dz = z - CZ, ax = Math.sin(v.angle), az = Math.cos(v.angle);
  return { along: dx * ax + dz * az, across: dx * az - dz * ax };
}
export const valleyPoint = (along, across, y = 0) => { const v = M.valleys[M.lake.valley], ax = Math.sin(v.angle), az = Math.cos(v.angle); return [CX + ax * along + az * across, y, CZ + az * along - ax * across]; };
const grad = (x, z, e = 1) => [(naturalHeight(x + e, z) - naturalHeight(x - e, z)) / (2 * e), (naturalHeight(x, z + e) - naturalHeight(x, z - e)) / (2 * e)];

/** The switchback road, bottom to top: [{ x, z, y, piece }] every ~4 m. piece numbers each leg. */
export const ROAD = (() => {
  const pts = [], S = M.step;
  let x = CX + Math.sin(.15) * (M.radius - 40), z = CZ + Math.cos(.15) * (M.radius - 40), y = naturalHeight(x, z), dir = 1, piece = 0;
  pts.push({ x, z, y, piece });
  for (let guard = 0; guard < 4000; guard++) {
    const r = Math.hypot(x - CX, z - CZ);
    if (r < M.summit) break;
    const [gx, gz] = grad(x, z), g = Math.hypot(gx, gz), ux = gx / g, uz = gz / g;
    // Along the contour, in this leg's direction (east is dir 1), turned uphill just enough to
    // climb at the grade and to track the ground (error feedback keeps the cut shallow).
    let tx = -uz, tz = ux; if (tx * dir < 0) { tx = -tx; tz = -tz; }
    const want = (M.grade + .15 * (y - naturalHeight(x, z)) / S) / Math.max(g, 1e-6), s = Math.max(-.6, Math.min(.97, want)), c = Math.sqrt(1 - s * s);
    x += (tx * c + ux * s) * S; z += (tz * c + uz * s) * S; y += g > M.grade ? M.grade * S : Math.max(-M.grade * S, Math.min(M.grade * S, naturalHeight(x, z) - y));
    pts.push({ x, z, y, piece });
    const phi = Math.atan2(x - CX, z - CZ);
    if (phi * dir > M.legSpan * Math.min(1, r / 500 + .35)) {
      // Hairpin: a half circle turning uphill, climbing gently.
      const prev = pts.at(-2), mx = x - prev.x, mz = z - prev.z;
      const cx = x + ux * M.hairpinRadius, cz = z + uz * M.hairpinRadius, a0 = Math.atan2(x - cx, z - cz), n = Math.ceil(Math.PI * M.hairpinRadius / S);
      // Turn the way the car is already going: the arc's starting tangent must point forward.
      const turn = Math.cos(a0) * mx - Math.sin(a0) * mz >= 0 ? 1 : -1;
      for (let i = 1; i <= n; i++) { const a = a0 + turn * Math.PI * i / n; x = cx + Math.sin(a) * M.hairpinRadius; z = cz + Math.cos(a) * M.hairpinRadius; y += M.hairpinGrade * Math.PI * M.hairpinRadius / n; pts.push({ x, z, y, piece: i < n / 2 ? piece : piece + 1 }); }
      piece++; dir = -dir;
    }
  }
  return Object.freeze(pts);
})();
export const SUMMIT = Object.freeze({ at: [ROAD.at(-1).x, ROAD.at(-1).z], y: ROAD.at(-1).y });

// Segments hashed into 32 m cells for nearest-road queries.
const CELL = 32, cells = new Map();
for (let i = 0; i < ROAD.length - 1; i++) {
  const a = ROAD[i], b = ROAD[i + 1];
  for (let cx = Math.floor(Math.min(a.x, b.x) / CELL) - 1; cx <= Math.floor(Math.max(a.x, b.x) / CELL) + 1; cx++)
    for (let cz = Math.floor(Math.min(a.z, b.z) / CELL) - 1; cz <= Math.floor(Math.max(a.z, b.z) / CELL) + 1; cz++) {
      const k = cx + ',' + cz; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i);
    }
}
/** The nearest road point per leg within the falloff: [{ d, y, piece }]. */
export function roadNear(x, z) {
  const best = new Map(), list = cells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return [];
  for (const i of list) {
    const a = ROAD[i], b = ROAD[i + 1], ex = b.x - a.x, ez = b.z - a.z, L = ex * ex + ez * ez, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / L));
    const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t);
    if (d > M.falloff) continue;
    const p = a.piece, cur = best.get(p); if (!cur || d < cur.d) best.set(p, { d, y: a.y + (b.y - a.y) * t, piece: p });
  }
  return [...best.values()];
}

/** The final mountain height: the natural slope carved to the road and the summit plateau. */
export function mountainHeight(x, z) {
  if (x < MOUNTAIN_BOUNDS[0] || x > MOUNTAIN_BOUNDS[2] || z < MOUNTAIN_BOUNDS[1] || z > MOUNTAIN_BOUNDS[3]) return 0;
  let h = naturalHeight(x, z);
  const rs = Math.hypot(x - SUMMIT.at[0], z - SUMMIT.at[1]);
  if (rs < M.plateau + 30) { const w = smooth((M.plateau + 30 - rs) / 30); h = h * (1 - w) + SUMMIT.y * w; }
  const near = roadNear(x, z); if (!near.length) return h;
  const shelf = near.reduce((b, n) => n.d <= M.shelf && (!b || n.d < b.d) ? n : b, null); if (shelf) return shelf.y;
  let wn = 1, sum = 0, ws = 0;
  for (const n of near) { const w = smooth((M.falloff - n.d) / (M.falloff - M.shelf)); wn *= 1 - w; sum += w * n.y; ws += w; }
  return (wn * h + sum) / (wn + ws);
}
/** Surface for wheels and paint: the road, its gravel shoulders, then rock or grass by slope. */
export function mountainSurface(x, z) {
  const near = roadNear(x, z), d = near.length ? Math.min(...near.map(n => n.d)) : Infinity;
  if (d <= M.roadHalf) return 'asphalt';
  if (d <= M.shelf) return 'dirt';
  const e = 2, sx = (mountainHeight(x + e, z) - mountainHeight(x - e, z)) / (2 * e), sz = (mountainHeight(x, z + e) - mountainHeight(x, z - e)) / (2 * e);
  return Math.hypot(sx, sz) > .55 ? 'rock' : 'grass';
}
export const inMountain = (x, z) => x >= MOUNTAIN_BOUNDS[0] && x <= MOUNTAIN_BOUNDS[2] && z >= MOUNTAIN_BOUNDS[1] && z <= MOUNTAIN_BOUNDS[3];

// The reservoir: water wherever the ground is below its level, upstream of the dam's face.
// A lake's surface: a low, slow swell (the wave pool's would be far too busy on open water).
export const LAKE = {
  id: 'reservoir', level: M.lake.level, swell: [[.7, .7, .06, 23], [-.4, .9, .03, 11]], flow: null, active: true,
  contains(x, z) { const f = valleyFrame(x, z); return f.along > M.lake.back && f.along < M.lake.dam - M.lake.damThick / 2 && Math.abs(f.across) < 220 && mountainHeight(x, z) < M.lake.level; },
};
NATURAL_WATER.push(LAKE);
/** The dam wall across the canyon: from wall to wall at the crest, foot to crest. */
export function damSpan() {
  const L = M.lake, side = s => { let a = 0; while (a < 300 && mountainHeight(...[valleyPoint(L.dam, s * a)].map(p => [p[0], p[2]])[0]) < L.crest) a += 2; return s * (a + 6); };
  return { from: side(-1), to: side(1), along: L.dam, thick: L.damThick, crest: L.crest };
}
/** The dam wall as world collision triangles: an oriented box from the canyon floor to the crest, its
 *  top a drivable crest road. Faces point outward (the world's collision is one-sided). */
export function damTris() {
  const d = damSpan(), h = d.thick / 2, out = [];
  const P = (al, ac, y) => valleyPoint(d.along + al, ac, y), y0 = M.lake.floor - 6, y1 = d.crest;
  const quad = (a, b, c, e) => { out.push([a, b, c], [a, c, e]); };
  // top (+y), downstream (+along), upstream (-along), the two ends
  quad(P(-h, d.from, y1), P(-h, d.to, y1), P(h, d.to, y1), P(h, d.from, y1));
  quad(P(h, d.from, y0), P(h, d.from, y1), P(h, d.to, y1), P(h, d.to, y0));
  quad(P(-h, d.to, y0), P(-h, d.to, y1), P(-h, d.from, y1), P(-h, d.from, y0));
  quad(P(-h, d.from, y0), P(-h, d.from, y1), P(h, d.from, y1), P(h, d.from, y0));
  quad(P(h, d.to, y0), P(h, d.to, y1), P(-h, d.to, y1), P(-h, d.to, y0));
  // Fix each face's winding to point away from the dam's centre line.
  const mid = valleyPoint(d.along, (d.from + d.to) / 2, (y0 + y1) / 2);
  const wall = out.map(([a, b, c]) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ctr = [(a[0] + b[0] + c[0]) / 3 - mid[0], (a[1] + b[1] + c[1]) / 3 - mid[1], (a[2] + b[2] + c[2]) / 3 - mid[2]];
    return n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2] >= 0 ? [a, b, c] : [a, c, b]; });
  // Parapets along both crest edges, so a car on the crest road can't drive off the top.
  const par = DAM_PARAPET;
  return [...wall, ...[-1, 1].flatMap(s => frameBox([d.along + s * (h - par.w / 2) - par.w / 2, d.along + s * (h - par.w / 2) + par.w / 2, d.from, d.to], y1, y1 + par.h))];
}
export const DAM_PARAPET = Object.freeze({ w: .5, h: .4 });   // low: a toy car's camera sees the lake over it, and still can't drive off
/** A box in the valley frame [along0, along1, across0, across1] from y0 to y1, faces outward. */
function frameBox([a0, a1, c0, c1], y0, y1) {
  const P = (al, ac, y) => valleyPoint(al, ac, y), out = [], mid = valleyPoint((a0 + a1) / 2, (c0 + c1) / 2, (y0 + y1) / 2);
  const q = (a, b, c, e) => out.push([a, b, c], [a, c, e]);
  q(P(a0, c0, y1), P(a0, c1, y1), P(a1, c1, y1), P(a1, c0, y1));
  q(P(a0, c0, y0), P(a0, c0, y1), P(a1, c0, y1), P(a1, c0, y0)); q(P(a0, c1, y0), P(a0, c1, y1), P(a1, c1, y1), P(a1, c1, y0));
  q(P(a0, c0, y0), P(a0, c0, y1), P(a0, c1, y1), P(a0, c1, y0)); q(P(a1, c0, y0), P(a1, c0, y1), P(a1, c1, y1), P(a1, c1, y0));
  return out.map(([a, b, c]) => { const u = a.map((v, i) => b[i] - v), v = a.map((w, i) => c[i] - w), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ctr = [0, 1, 2].map(i => (a[i] + b[i] + c[i]) / 3 - mid[i]); return n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2] >= 0 ? [a, b, c] : [a, c, b]; });
}

// The drowned town (Lake Mead really drowned St. Thomas, Nevada): a main street of ruined adobe
// houses, a general store and a church with a steeple on the reservoir floor. Boxes in the valley
// frame [along0, along1, across0, across1, height]; walkable and climbable by the robot.
export const TOWN = Object.freeze([
  ...[0, 1, 2, 3].flatMap(i => [[540 + i * 20, 552 + i * 20, -22, -12, 3.2 - (i % 2) * .8], [538 + i * 20, 551 + i * 20, 12, 22, 2.6 + (i % 2) * .9]]),
  [600, 618, -30, -14, 4.5],          // the general store
  [602, 616, 14, 28, 5],              // the church
  [607, 611, 19, 23, 13],             // its steeple
]);
function orientedBox([a0, a1, c0, c1, h], y0 = M.lake.floor - .5) {
  const P = (al, ac, y) => valleyPoint(al, ac, y), y1 = M.lake.floor + h, out = [], mid = valleyPoint((a0 + a1) / 2, (c0 + c1) / 2, (y0 + y1) / 2);
  const q = (a, b, c, e) => out.push([a, b, c], [a, c, e]);
  q(P(a0, c0, y1), P(a0, c1, y1), P(a1, c1, y1), P(a1, c0, y1));
  q(P(a0, c0, y0), P(a0, c0, y1), P(a1, c0, y1), P(a1, c0, y0)); q(P(a0, c1, y0), P(a0, c1, y1), P(a1, c1, y1), P(a1, c1, y0));
  q(P(a0, c0, y0), P(a0, c0, y1), P(a0, c1, y1), P(a0, c1, y0)); q(P(a1, c0, y0), P(a1, c0, y1), P(a1, c1, y1), P(a1, c1, y0));
  return out.map(([a, b, c]) => { const u = a.map((v, i) => b[i] - v), v = a.map((w, i) => c[i] - w), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ctr = [0, 1, 2].map(i => (a[i] + b[i] + c[i]) / 3 - mid[i]); return n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2] >= 0 ? [a, b, c] : [a, c, b]; });
}
export const townTris = () => TOWN.flatMap(b => orientedBox(b));

// The spring and its waterfall: a stream rises from a cave mouth high in the east valley, tumbles
// down the valley floor and drops over the cliff above the reservoir. Visual (spirit-mountain.js);
// points { along, across, y, width } in the valley frame, the last two being the fall's lip and foot.
export const SPRING = Object.freeze({ along: 318, lip: 466, foot: 474 });
export const STREAM = (() => {
  const pts = [];
  for (let a = SPRING.along; a <= SPRING.lip; a += 4) {
    const c = Math.sin(a / 23) * 5 + Math.sin(a / 9) * 1.5, p = valleyPoint(a, c);
    pts.push({ along: a, across: c, y: mountainHeight(p[0], p[2]) + .08, width: 3 + (a - SPRING.along) / (SPRING.lip - SPRING.along) * 3 });
  }
  const last = pts.at(-1);
  pts.push({ along: SPRING.foot, across: last.across, y: M.lake.level, width: last.width + 1.5 });
  return Object.freeze(pts);
})();
