// Fictional Grand-Canyon-style geography, shared by both eras. Metres below the local desert;
// elevation.mjs applies the same carve to the drawn ground and collision. No renderer dependencies.
export const CANYON = Object.freeze({
  bounds: Object.freeze([-3700, -4550, -1600, -2600]),
  step: 8,
  endFade: 150,
  depth: 160,
  floorHalf: 22,
  platformStart: 45,
  platformEnd: 120,
  platformDepth: 115,
  benchStart: 150,
  benchEnd: 200,
  benchDepth: 60,
  rim: 240,
  // The entire 240 m envelope, including the mouths, fits inside bounds without clipping.
  controls: Object.freeze(
    [
      [-3440, -2860],
      [-3290, -3460],
      [-2800, -3300],
      [-2660, -4020],
      [-2140, -3870],
      [-1860, -4290]
    ].map(Object.freeze)
  )
});
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix = (a, b, t) => a + (b - a) * t;
const catmull = (a, b, c, d, t) =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

/** Arc-length samples of a smooth six-control-point meander, about 8 m apart. */
export const CENTRELINE = (() => {
  const controls = CANYON.controls,
    dense = [];
  let along = 0;
  for (let i = 0; i < controls.length - 1; i++) {
    const a = controls[Math.max(0, i - 1)],
      b = controls[i],
      c = controls[i + 1],
      d = controls[Math.min(controls.length - 1, i + 2)],
      count = Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]));
    for (let j = i === 0 ? 0 : 1; j <= count; j++) {
      const x = catmull(a[0], b[0], c[0], d[0], j / count),
        z = catmull(a[1], b[1], c[1], d[1], j / count),
        prev = dense.at(-1);
      if (prev) along += Math.hypot(x - prev.x, z - prev.z);
      dense.push({x, z, along});
    }
  }
  const out = [];
  let i = 1;
  for (let s = 0; s < along; s += CANYON.step) {
    while (dense[i].along < s) i++;
    const a = dense[i - 1],
      b = dense[i],
      t = (s - a.along) / (b.along - a.along);
    out.push(Object.freeze({x: mix(a.x, b.x, t), z: mix(a.z, b.z, t), along: s}));
  }
  out.push(Object.freeze(dense.at(-1)));
  return Object.freeze(out);
})();
export const CANYON_LENGTH = CENTRELINE.at(-1).along;

// Segment envelopes in 128 m cells: an exact projection within the rim only scans local segments.
const CELL = 128,
  cells = new Map();
for (let i = 0; i < CENTRELINE.length - 1; i++) {
  const a = CENTRELINE[i],
    b = CENTRELINE[i + 1];
  for (
    let x = Math.floor((Math.min(a.x, b.x) - CANYON.rim) / CELL);
    x <= Math.floor((Math.max(a.x, b.x) + CANYON.rim) / CELL);
    x++
  ) {
    for (
      let z = Math.floor((Math.min(a.z, b.z) - CANYON.rim) / CELL);
      z <= Math.floor((Math.max(a.z, b.z) + CANYON.rim) / CELL);
      z++
    ) {
      const key = `${x},${z}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    }
  }
}
/** Nearest centreline projection; along and signed side are metres. Exact even beyond the rim. */
export function centreNear(x, z) {
  let best = {d: Infinity, along: 0, side: 0};
  const visit = i => {
    const a = CENTRELINE[i],
      b = CENTRELINE[i + 1],
      dx = b.x - a.x,
      dz = b.z - a.z,
      length = Math.hypot(dx, dz),
      t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (length * length))),
      ex = x - a.x - dx * t,
      ez = z - a.z - dz * t,
      d = Math.hypot(ex, ez);
    if (d < best.d) best = {d, along: mix(a.along, b.along, t), side: (dx * ez - dz * ex) / length};
  };
  for (const i of cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) visit(i);
  // Only off-canyon callers need the full search; the hash covers every possible carved point.
  if (best.d > CANYON.rim) for (let i = 0; i < CENTRELINE.length - 1; i++) visit(i);
  return best;
}
/** Point and normal in the sampled centreline frame; used by the ribbon, arrivals and tests. */
export function canyonPoint(along, side = 0) {
  const s = Math.max(0, Math.min(CANYON_LENGTH, along)),
    i = Math.min(CENTRELINE.length - 2, Math.floor(s / CANYON.step)),
    a = CENTRELINE[i],
    b = CENTRELINE[i + 1],
    t = (s - a.along) / (b.along - a.along),
    length = Math.hypot(b.x - a.x, b.z - a.z),
    nx = -(b.z - a.z) / length,
    nz = (b.x - a.x) / length;
  return {x: mix(a.x, b.x, t) + nx * side, z: mix(a.z, b.z, t) + nz * side, nx, nz, along: s};
}
// Short, smooth 6–10 m rises within each cliff give steep layered faces without vertical walls.
function cliff(d, from, to) {
  if (d <= from) return 0;
  if (d >= to) return 1;
  const steps = Math.ceil((to - from) / 10),
    t = ((d - from) / (to - from)) * steps,
    i = Math.floor(t);
  return (i + smooth(t - i)) / steps;
}
export function canyonProfile(d, along) {
  const platformShift = 7.5 * Math.sin(along / 420),
    benchShift = 5 * Math.sin(along / 370 + 0.8),
    depth =
      CANYON.depth -
      (CANYON.depth - CANYON.platformDepth) * cliff(d, CANYON.floorHalf, CANYON.platformStart) -
      (CANYON.platformDepth - CANYON.benchDepth) *
        cliff(d, CANYON.platformEnd + platformShift, CANYON.benchStart + platformShift) -
      CANYON.benchDepth * cliff(d, CANYON.benchEnd + platformShift + benchShift, CANYON.rim);
  return (
    Math.max(0, depth) * smooth(along / CANYON.endFade) * smooth((CANYON_LENGTH - along) / CANYON.endFade)
  );
}
export const inCanyon = (x, z) =>
  x >= CANYON.bounds[0] && x <= CANYON.bounds[2] && z >= CANYON.bounds[1] && z <= CANYON.bounds[3];
export function canyonDepth(x, z) {
  if (!inCanyon(x, z)) return 0;
  const {d, along} = centreNear(x, z);
  return canyonProfile(d, along);
}
export const canyonHeight = (x, z) => -canyonDepth(x, z);
export function canyonSurface(x, z) {
  const e = 1,
    sx = (canyonHeight(x + e, z) - canyonHeight(x - e, z)) / (2 * e),
    sz = (canyonHeight(x, z + e) - canyonHeight(x, z - e)) / (2 * e);
  return Math.hypot(sx, sz) > 0.55 ? 'rock' : 'sand';
}
/** Horizontal strata in world height, alternating lighter and darker rock every 14 m. */
export const canyonStrata = y => 0.9 + 0.2 * Math.sin((Math.PI * y) / 14);

// Visual only: physics/water.mjs reads a flat `level`, with no levelAt support. Do not register
// this sloping river in NATURAL_WATER. canyon.js stores floorY from the live ground per sample.
export const RIVER = Object.freeze({
  id: 'canyon-river',
  level: -CANYON.depth + 1.2,
  height: 1.2,
  halfWidth: 18,
  swell: Object.freeze([]),
  flow: null,
  active: true,
  contains(x, z) {
    if (!inCanyon(x, z)) return false;
    const n = centreNear(x, z);
    return n.d < 18 && n.along > CANYON.endFade && n.along < CANYON_LENGTH - CANYON.endFade;
  }
});
