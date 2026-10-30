// Spirit Mountain (docs/design/adventure): the climbable mountain north of Dreamland, Forza
// Horizon-style. One height function serves the rendered ground and wheel collision alike
// (elevation.mjs adds it to the playable terrain). Three parts:
//   natural(x,z): a broad bell (230 m) with ridges and two valleys cut deep enough to fly through;
//   the road: switchbacks generated up the south face by following the slope at a steady grade,
//     with hairpins wide enough for a kid's car;
//   the carve: the ground is the road's height on a shelf either side of it, blended back to the
//     natural slope, so the road is the terrain itself (no separate collision ribbon).
export const MOUNTAIN = Object.freeze({
  centre: [2300, -3250], radius: 1250, peak: 230,
  grade: .08, hairpinGrade: .05, hairpinRadius: 15, legSpan: .72,   // radians either side of due south
  roadHalf: 2.75, shelf: 6.5, falloff: 21, summit: 80, plateau: 28, step: 4,   // summit: where the road stops climbing; plateau: the flat top around its end
  valleys: [{ angle: 1.25, from: 140, depth: 75, width: 170 }, { angle: -1.95, from: 200, depth: 60, width: 150 }],
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
  return Math.max(0, h * smooth((M.radius - r) / 60));
}
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
