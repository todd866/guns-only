// Saucer Springs Adventure Playground, next to the petting zoo. A full-size playground is a
// mountain range to a 1:10 car: a timber fort two metres up, reached by the accessible ramp,
// with a wave slide, a spiral slide, a sagging rope bridge to a lookout and a drop slide that
// kicks out over the sandpit. Seesaw, merry-go-round, a grassy mound, swings and monkey bars
// fill the softfall. Local x east, z south, y up; one triangle list drives the renderer and
// the collision world, and every face is oriented by an explicit outward hint.

export const PLAYGROUND = Object.freeze({center: [-1450, 0, 2000], half: [38, 32]});
export const playgroundWorld = ([x, y, z]) => [
  PLAYGROUND.center[0] + x,
  PLAYGROUND.center[1] + y,
  PLAYGROUND.center[2] + z
];
export const playgroundLocal = ([x, y, z]) => [
  x - PLAYGROUND.center[0],
  y - PLAYGROUND.center[1],
  z - PLAYGROUND.center[2]
];
export const PLAYGROUND_BOUNDS = [
  PLAYGROUND.center[0] - 40,
  PLAYGROUND.center[2] - 34,
  PLAYGROUND.center[0] + 40,
  PLAYGROUND.center[2] + 34
];

// Heights. The softfall sits just proud of the desert so wheels roll onto it.
export const FLOOR = 0.03,
  DECK = 2.0,
  SLAB = 0.14;
// Roofs ride high enough that the chase camera on a deck looks under them, not into them.
export const ROOF = 2.4;
export const FORT = {x: [-6, 6], z: [-6, 2]};
export const RAMP = {x: [-1.6, 1.6], z: [2, 18]};
export const WAVE = {x: [-5.2, -3.2], z: [-6, -24], runout: -28, humps: 0.22};
export const SPIRAL = {
  from: 6,
  start: [10.4, -2],
  center: [10.4, 1],
  r: 3,
  width: 1.8,
  turns: 1.25,
  runout: 5.2,
  bank: 0.75
};
export const BRIDGE = {x: [-15, -6], z: [-2.6, -1.4], sag: 0.35};
export const LOOKOUT = {x: [-19, -15], z: [-4, 0]};
export const DROP = {x: [-19, -26.6], z: [-2.8, -1.2], bottom: 0.35, lip: 0.62};
export const SANDPIT = {x: [-36, -28], z: [-8, 6]};
export const SEESAW = {x: [12, 17.5], z: [11.6, 12.4], high: 0.95};
export const MERRY = {at: [22, -12], r: 2, bevel: 3, h: 0.28};
export const MOUND = {at: [-22, 19], r: 5.5, h: 1.1};

const tris = [];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// A face that points along `out` (any vector on the side the car meets it from).
function face(pts, out, mat, surface = 'wood') {
  const [a, b, c] = pts,
    flip = dot(cross(sub(b, a), sub(c, a)), out) < 0;
  const p = flip ? [...pts].reverse() : pts;
  for (let i = 1; i < p.length - 1; i++) tris.push({a: p[0], b: p[i], c: p[i + 1], mat, surface});
}
const UP = [0, 1, 0];
// Axis-aligned closed box.
function box(x0, x1, z0, z1, y0, y1, mat, surface = 'wood', top = mat) {
  face(
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1]
    ],
    UP,
    top,
    surface
  );
  face(
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0]
    ],
    [0, 0, -1],
    mat,
    surface
  );
  face(
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1]
    ],
    [0, 0, 1],
    mat,
    surface
  );
  face(
    [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0]
    ],
    [-1, 0, 0],
    mat,
    surface
  );
  face(
    [
      [x1, y0, z0],
      [x1, y0, z1],
      [x1, y1, z1],
      [x1, y1, z0]
    ],
    [1, 0, 0],
    mat,
    surface
  );
}
// A thin wall from p to q (xz) standing on heights y0p..y1p and y0q..y1q, closed on both faces.
function wall(p, q, yb, yt, mat, t = 0.08, surface = 'wood', caps = true) {
  const dx = q[0] - p[0],
    dz = q[1] - p[1],
    l = Math.hypot(dx, dz),
    nx = ((-dz / l) * t) / 2,
    nz = ((dx / l) * t) / 2;
  const [b0, b1] = yb,
    [t0, t1] = yt;
  const A = [p[0] + nx, p[1] + nz],
    B = [q[0] + nx, q[1] + nz],
    C = [q[0] - nx, q[1] - nz],
    D = [p[0] - nx, p[1] - nz];
  face(
    [
      [A[0], b0, A[1]],
      [B[0], b1, B[1]],
      [B[0], t1, B[1]],
      [A[0], t0, A[1]]
    ],
    [nx, 0, nz],
    mat,
    surface
  );
  face(
    [
      [D[0], b0, D[1]],
      [C[0], b1, C[1]],
      [C[0], t1, C[1]],
      [D[0], t0, D[1]]
    ],
    [-nx, 0, -nz],
    mat,
    surface
  );
  face(
    [
      [A[0], t0, A[1]],
      [B[0], t1, B[1]],
      [C[0], t1, C[1]],
      [D[0], t0, D[1]]
    ],
    UP,
    mat,
    surface
  );
  // A run of joined walls leaves its inner end caps off: on a curve they are steps a scraping car catches on.
  if (!caps) return;
  face(
    [
      [A[0], b0, A[1]],
      [A[0], t0, A[1]],
      [D[0], t0, D[1]],
      [D[0], b0, D[1]]
    ],
    [-dx, 0, -dz],
    mat,
    surface
  );
  face(
    [
      [B[0], b1, B[1]],
      [B[0], t1, B[1]],
      [C[0], t1, C[1]],
      [C[0], b1, C[1]]
    ],
    [dx, 0, dz],
    mat,
    surface
  );
}
// A riding ribbon along a centreline of {x, z, y, w(half width), bank(outer lift)} samples.
// Top faces up, an underside faces down, and optional side walls of `walls` [left, right] height.
function ribbon(
  path,
  mat,
  surface,
  {walls = null, wallMat = 'rail-wood', under = 'skirt', skirt = false} = {}
) {
  const edges = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)],
      b = path[Math.min(path.length - 1, i + 1)];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      l = Math.hypot(dx, dz) || 1,
      lx = dz / l,
      lz = -dx / l;
    const bank = p.bank ?? 0;
    return {
      L: [p.x + lx * p.w, p.y + Math.max(0, -bank), p.z + lz * p.w],
      R: [p.x - lx * p.w, p.y + Math.max(0, bank), p.z - lz * p.w],
      y: p.y
    };
  });
  for (let i = 0; i < edges.length - 1; i++) {
    const e = edges[i],
      f = edges[i + 1];
    face([e.L, f.L, f.R, e.R], UP, mat, surface);
    face(
      [e.L, f.L, f.R, e.R].map(v => [v[0], v[1] - 0.06, v[2]]),
      [0, -1, 0],
      under,
      surface
    );
    if (skirt)
      for (const [p, q, s] of [
        [e.L, f.L, 1],
        [e.R, f.R, -1]
      ]) {
        const out = cross(sub(q, p), UP).map(v => v * s);
        face([[p[0], FLOOR, p[2]], [q[0], FLOOR, q[2]], q, p], out, under, surface);
      }
    if (walls) {
      const caps = i === 0 || i === edges.length - 2;
      if (walls[0])
        wall(
          [e.L[0], e.L[2]],
          [f.L[0], f.L[2]],
          [e.L[1] - 0.06, f.L[1] - 0.06],
          [e.L[1] + walls[0], f.L[1] + walls[0]],
          wallMat,
          0.08,
          'wood',
          caps
        );
      if (walls[1])
        wall(
          [e.R[0], e.R[2]],
          [f.R[0], f.R[2]],
          [e.R[1] - 0.06, f.R[1] - 0.06],
          [e.R[1] + walls[1], f.R[1] + walls[1]],
          wallMat,
          0.08,
          'wood',
          caps
        );
    }
  }
}
// Heightfield patch over a rectangle (grass mound, merry-go-round bevel).
function field(x0, x1, z0, z1, n, h, mat, surface) {
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const xa = x0 + ((x1 - x0) * i) / n,
        xb = x0 + ((x1 - x0) * (i + 1)) / n,
        za = z0 + ((z1 - z0) * j) / n,
        zb = z0 + ((z1 - z0) * (j + 1)) / n;
      const v = [
        [xa, za],
        [xb, za],
        [xb, zb],
        [xa, zb]
      ].map(([x, z]) => [x, h(x, z), z]);
      if (v.every(p => p[1] <= FLOOR + 1e-4)) continue;
      face([v[0], v[1], v[2]], UP, mat, surface);
      face([v[0], v[2], v[3]], UP, mat, surface);
    }
}

// --- Ground: softfall everywhere, a flush sandpit, a bevelled apron at the edge. ----------------
const [HX, HZ] = PLAYGROUND.half;
const inSand = (x, z) => x >= SANDPIT.x[0] && x < SANDPIT.x[1] && z >= SANDPIT.z[0] && z < SANDPIT.z[1];
for (let x = -HX; x < HX; x += 2)
  for (let z = -HZ; z < HZ; z += 2) {
    const sand = inSand(x + 1, z + 1),
      alt = (((x + z) / 2) & 1) === 0;
    face(
      [
        [x, FLOOR, z],
        [x + 2, FLOOR, z],
        [x + 2, FLOOR, z + 2],
        [x, FLOOR, z + 2]
      ],
      UP,
      sand ? 'sand' : alt ? 'softfall' : 'softfall-b',
      sand ? 'sand' : 'softfall'
    );
  }
for (const [a, b, c, d] of [
  [
    [-HX, FLOOR, -HZ],
    [HX, FLOOR, -HZ],
    [HX + 0.8, 0, -HZ - 0.8],
    [-HX - 0.8, 0, -HZ - 0.8]
  ],
  [
    [-HX, FLOOR, HZ],
    [HX, FLOOR, HZ],
    [HX + 0.8, 0, HZ + 0.8],
    [-HX - 0.8, 0, HZ + 0.8]
  ],
  [
    [-HX, FLOOR, -HZ],
    [-HX, FLOOR, HZ],
    [-HX - 0.8, 0, HZ + 0.8],
    [-HX - 0.8, 0, -HZ - 0.8]
  ],
  [
    [HX, FLOOR, -HZ],
    [HX, FLOOR, HZ],
    [HX + 0.8, 0, HZ + 0.8],
    [HX + 0.8, 0, -HZ - 0.8]
  ]
])
  face([a, b, c, d], UP, 'edging', 'concrete');
// Timber sand border, flush, so a car never stops dead on it.
for (const [x0, x1, z0, z1] of [
  [SANDPIT.x[0] - 0.3, SANDPIT.x[1] + 0.3, SANDPIT.z[0] - 0.3, SANDPIT.z[0]],
  [SANDPIT.x[0] - 0.3, SANDPIT.x[1] + 0.3, SANDPIT.z[1], SANDPIT.z[1] + 0.3],
  [SANDPIT.x[0] - 0.3, SANDPIT.x[0], SANDPIT.z[0], SANDPIT.z[1]],
  [SANDPIT.x[1], SANDPIT.x[1] + 0.3, SANDPIT.z[0], SANDPIT.z[1]]
])
  face(
    [
      [x0, FLOOR + 0.004, z0],
      [x1, FLOOR + 0.004, z0],
      [x1, FLOOR + 0.004, z1],
      [x0, FLOOR + 0.004, z1]
    ],
    UP,
    'timber',
    'wood'
  );

// --- The fort: a deck on posts, rails with openings, a roof the car never touches. -------------
const deck = (x0, x1, z0, z1) => {
  box(x0, x1, z0, z1, DECK - SLAB, DECK, 'deck-side', 'wood', 'deck');
  // Corner posts run on up to carry the roof; they are inset so the rails meet them.
  for (const [xa, xb] of [
    [x0, x0 + 0.18],
    [x1 - 0.18, x1]
  ])
    for (const [za, zb] of [
      [z0, z0 + 0.18],
      [z1 - 0.18, z1]
    ])
      box(xa, xb, za, zb, FLOOR, DECK + ROOF, 'post');
};
deck(...FORT.x, ...FORT.z);
// Deck rails, leaving the ramp (south), wave slide (north-west), the fort drop (north-east),
// the spiral connector (east) and the bridge (west) open.
const RAIL_H = 0.32,
  rail = (p, q) => wall(p, q, [DECK, DECK], [DECK + RAIL_H, DECK + RAIL_H], 'rail-wood');
rail([-5.8, 2], [RAMP.x[0] - 0.1, 2]);
rail([RAMP.x[1] + 0.1, 2], [5.8, 2]);
rail([-5.8, -6], [WAVE.x[0] - 0.1, -6]);
rail([WAVE.x[1] + 0.1, -6], [1.6, -6]);
rail([5.2, -6], [5.8, -6]);
rail([6, -5.8], [6, SPIRAL.start[1] - SPIRAL.width / 2 - 0.1]);
rail([6, SPIRAL.start[1] + SPIRAL.width / 2 + 0.1], [6, 1.8]);
rail([-6, -5.8], [-6, BRIDGE.z[0] - 0.1]);
rail([-6, BRIDGE.z[1] + 0.1], [-6, 1.8]);

// --- Accessible ramp up to the deck, kerbed both sides. -----------------------------------------
{
  const n = 16,
    path = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push({
      x: 0,
      z: RAMP.z[0] + (RAMP.z[1] - RAMP.z[0]) * t,
      y: DECK + (FLOOR - DECK) * t,
      w: (RAMP.x[1] - RAMP.x[0]) / 2
    });
  }
  ribbon(path, 'ramp', 'wood', {walls: [0.12, 0.12], skirt: true});
  // Mid supports under the ramp.
  for (let z = 6; z < RAMP.z[1] - 2; z += 4)
    for (const x of RAMP.x)
      box(
        x - 0.08,
        x + 0.08,
        z - 0.08,
        z + 0.08,
        FLOOR,
        DECK + ((FLOOR - DECK) * (z - RAMP.z[0])) / (RAMP.z[1] - RAMP.z[0]),
        'post'
      );
}

// --- Wave slide: two humps that throw a fast car into the air. ----------------------------------
export function waveY(z) {
  const t = Math.max(0, Math.min(1, (z - WAVE.z[0]) / (WAVE.z[1] - WAVE.z[0])));
  return (
    FLOOR +
    (DECK - FLOOR) * (1 - t) * (1 - t * 0.25) +
    WAVE.humps * Math.sin(4 * Math.PI * t) * Math.sin(Math.PI * t)
  );
}
{
  const path = [],
    cx = (WAVE.x[0] + WAVE.x[1]) / 2,
    w = (WAVE.x[1] - WAVE.x[0]) / 2;
  for (let z = WAVE.z[0]; z >= WAVE.z[1] - 1e-6; z -= 0.5) path.push({x: cx, z, y: waveY(z), w});
  for (let z = WAVE.z[1] - 0.5; z >= WAVE.runout; z -= 0.5) path.push({x: cx, z, y: FLOOR + 0.002, w});
  ribbon(path, 'slide', 'slide', {walls: [0.3, 0.3], wallMat: 'slide-wall', skirt: true});
}

// --- Spiral slide off the east side, via a short railed connector. ------------------------------
export function spiralPath(step = 0.25) {
  const S = SPIRAL,
    out = [],
    drop = DECK - FLOOR,
    len = S.r * S.turns * 2 * Math.PI;
  for (let x = S.from; x < S.start[0]; x += 0.4) out.push({x, z: S.start[1], y: DECK, w: S.width / 2});
  for (let s = 0; s <= len + 1e-6; s += step) {
    const a = -Math.PI / 2 + s / S.r,
      t = s / len;
    out.push({
      x: S.center[0] + S.r * Math.cos(a),
      z: S.center[1] + S.r * Math.sin(a),
      y: DECK - drop * t,
      w: S.width / 2,
      bank: -S.bank * Math.sin(Math.PI * Math.min(1, t * 1.2))
    });
  }
  const end = out.at(-1);
  for (let z = end.z + 0.4; z <= S.center[1] + S.runout; z += 0.4)
    out.push({x: end.x, z, y: FLOOR + 0.002, w: S.width / 2});
  return out;
}
ribbon(spiralPath(), 'slide-b', 'slide', {walls: [0.42, 0.26], wallMat: 'slide-wall'});
box(
  SPIRAL.center[0] - 0.14,
  SPIRAL.center[0] + 0.14,
  SPIRAL.center[1] - 0.14,
  SPIRAL.center[1] + 0.14,
  FLOOR,
  DECK + 1.6,
  'pole',
  'metal'
);
// The connector hangs from the deck and the pole: posts under it would stand in the lower turn.

// --- Rope bridge to the lookout, then the drop slide's kicker out over the sand. ----------------
export const bridgeY = x =>
  DECK - BRIDGE.sag * Math.sin((Math.PI * (x - BRIDGE.x[1])) / (BRIDGE.x[0] - BRIDGE.x[1]));
{
  const path = [];
  for (let x = BRIDGE.x[1]; x >= BRIDGE.x[0] - 1e-6; x -= 0.5)
    path.push({x, z: (BRIDGE.z[0] + BRIDGE.z[1]) / 2, y: bridgeY(x), w: (BRIDGE.z[1] - BRIDGE.z[0]) / 2});
  ribbon(path, 'plank', 'wood');
}
deck(...LOOKOUT.x, ...LOOKOUT.z);
wall([-18.8, -4], [-15.2, -4], [DECK, DECK], [DECK + RAIL_H, DECK + RAIL_H], 'rail-wood');
wall([-18.8, 0], [-17.9, 0], [DECK, DECK], [DECK + RAIL_H, DECK + RAIL_H], 'rail-wood');
wall([-16.1, 0], [-15.2, 0], [DECK, DECK], [DECK + RAIL_H, DECK + RAIL_H], 'rail-wood');
// Smooth drop from the lookout to the bottom, then a curved kicker lip.
export function dropY(x) {
  const foot = DROP.x[1] + 1.6;
  if (x >= foot) {
    const t = Math.max(0, Math.min(1, (DROP.x[0] - x) / (DROP.x[0] - foot)));
    return DROP.bottom + (DECK - DROP.bottom) * (1 - t * t * (3 - 2 * t));
  }
  const u = Math.min(1, (foot - x) / 1.6);
  return DROP.bottom + (DROP.lip - DROP.bottom) * u * u;
}
{
  const path = [];
  for (let x = DROP.x[0]; x >= DROP.x[1] - 1e-6; x -= 0.25)
    path.push({x, z: (DROP.z[0] + DROP.z[1]) / 2, y: dropY(x), w: (DROP.z[1] - DROP.z[0]) / 2});
  ribbon(path, 'slide-c', 'slide', {walls: [0.3, 0.3], wallMat: 'slide-wall', skirt: true});
}
// Lookout ladder (the honest way down if you chicken out of the slide): a steep ramp south.
{
  const path = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    path.push({x: -17, z: LOOKOUT.z[1] + 7 * t, y: DECK + (FLOOR - DECK) * t, w: 0.8});
  }
  ribbon(path, 'ramp', 'wood', {walls: [0.1, 0.1], skirt: true});
}

// --- Seesaw kicker, merry-go-round, mound. -------------------------------------------------------
{
  const [x0, x1] = SEESAW.x,
    [z0, z1] = SEESAW.z,
    h = SEESAW.high;
  face(
    [
      [x0, FLOOR, z0],
      [x1, h, z0],
      [x1, h, z1],
      [x0, FLOOR, z1]
    ],
    UP,
    'seesaw',
    'wood'
  );
  face(
    [
      [x1, FLOOR, z0],
      [x1, h, z0],
      [x1, h, z1],
      [x1, FLOOR, z1]
    ],
    [1, 0, 0],
    'post',
    'wood'
  );
  face(
    [
      [x0, FLOOR, z0],
      [x1, FLOOR, z0],
      [x1, h, z0]
    ],
    [0, 0, -1],
    'post',
    'wood'
  );
  face(
    [
      [x0, FLOOR, z1],
      [x1, FLOOR, z1],
      [x1, h, z1]
    ],
    [0, 0, 1],
    'post',
    'wood'
  );
}
const merryH = (x, z) => {
  const r = Math.hypot(x - MERRY.at[0], z - MERRY.at[1]);
  return r <= MERRY.r
    ? MERRY.h
    : r >= MERRY.bevel
      ? FLOOR
      : FLOOR + ((MERRY.h - FLOOR) * (MERRY.bevel - r)) / (MERRY.bevel - MERRY.r);
};
field(
  MERRY.at[0] - MERRY.bevel,
  MERRY.at[0] + MERRY.bevel,
  MERRY.at[1] - MERRY.bevel,
  MERRY.at[1] + MERRY.bevel,
  24,
  merryH,
  'merry',
  'metal'
);
box(
  MERRY.at[0] - 0.1,
  MERRY.at[0] + 0.1,
  MERRY.at[1] - 0.1,
  MERRY.at[1] + 0.1,
  MERRY.h,
  MERRY.h + 0.9,
  'pole',
  'metal'
);
export const moundH = (x, z) => {
  const r = Math.hypot(x - MOUND.at[0], z - MOUND.at[1]) / MOUND.r;
  return r >= 1 ? FLOOR : FLOOR + MOUND.h * Math.cos((r * Math.PI) / 2) ** 2;
};
field(
  MOUND.at[0] - MOUND.r,
  MOUND.at[0] + MOUND.r,
  MOUND.at[1] - MOUND.r,
  MOUND.at[1] + MOUND.r,
  22,
  moundH,
  'turf',
  'grass'
);

// --- Swings, monkey bars, spring riders, fence. Only the feet are solid at car height. -----------
for (const x of [-30, -24, -18])
  for (const s of [-1, 1])
    box(x - 0.07, x + 0.07, -24 + s * 1.2 - 0.07, -24 + s * 1.2 + 0.07, FLOOR, 0.5, 'frame', 'metal');
for (const x of [14, 26])
  for (const z of [-26, -24.8]) box(x - 0.06, x + 0.06, z - 0.06, z + 0.06, FLOOR, 2.1, 'frame', 'metal');
for (const [x, z] of [
  [6, 24],
  [9, 26],
  [-8, 24]
])
  box(x - 0.18, x + 0.18, z - 0.18, z + 0.18, FLOOR, 0.3, 'spring', 'metal');
// The fence collides as a plain wall; the renderer draws it as pickets.
export const FENCE = [
  [
    [-HX, -HZ],
    [HX, -HZ]
  ],
  [
    [-HX, HZ],
    [-4, HZ]
  ],
  [
    [4, HZ],
    [HX, HZ]
  ],
  [
    [-HX, -HZ],
    [-HX, -4]
  ],
  [
    [-HX, 4],
    [-HX, HZ]
  ],
  [
    [HX, -HZ],
    [HX, -4]
  ],
  [
    [HX, 4],
    [HX, HZ]
  ]
];
for (const [p, q] of FENCE) wall(p, q, [FLOOR, FLOOR], [0.7, 0.7], 'fence', 0.06);
for (const [x, z] of [
  [-14, 29],
  [14, 29],
  [-34, 14],
  [34, 14]
])
  box(x - 0.9, x + 0.9, z - 0.22, z + 0.22, 0.38, 0.46, 'bench', 'wood');

export const buildPlayground = () => tris;

// --- Skate rules: lines, gaps, letters. Rail points are [x, z, h]. -------------------------------
const bridgeRail = z =>
  Array.from({length: 10}, (_, i) => {
    const x = BRIDGE.x[1] + ((BRIDGE.x[0] - BRIDGE.x[1]) * i) / 9;
    return [x, z, bridgeY(x) + 0.45];
  });
const merryRim = Array.from({length: 25}, (_, i) => {
  const a = (i / 24) * 2 * Math.PI;
  return [MERRY.at[0] + MERRY.r * Math.cos(a), MERRY.at[1] + MERRY.r * Math.sin(a), MERRY.h];
});
export const PLAYGROUND_PARK = Object.freeze({
  id: 'playground',
  name: 'ADVENTURE PLAYGROUND',
  start: {at: [0, 27], toward: [0, -1]},
  rails: [
    {
      id: 'ramp-rail-west',
      kind: 'rail',
      pts: [
        [RAMP.x[0] - 0.05, RAMP.z[0], DECK + 0.55],
        [RAMP.x[0] - 0.05, RAMP.z[1], FLOOR + 0.55]
      ]
    },
    {
      id: 'ramp-rail-east',
      kind: 'rail',
      pts: [
        [RAMP.x[1] + 0.05, RAMP.z[0], DECK + 0.55],
        [RAMP.x[1] + 0.05, RAMP.z[1], FLOOR + 0.55]
      ]
    },
    {id: 'bridge-rope-north', kind: 'rail', pts: bridgeRail(BRIDGE.z[0] - 0.08)},
    {id: 'bridge-rope-south', kind: 'rail', pts: bridgeRail(BRIDGE.z[1] + 0.08)},
    {id: 'merry-rim', kind: 'edge', pts: merryRim},
    {
      id: 'seesaw-north',
      kind: 'edge',
      pts: [
        [SEESAW.x[0], SEESAW.z[0], FLOOR],
        [SEESAW.x[1], SEESAW.z[0], SEESAW.high]
      ]
    },
    {
      id: 'seesaw-south',
      kind: 'edge',
      pts: [
        [SEESAW.x[0], SEESAW.z[1], FLOOR],
        [SEESAW.x[1], SEESAW.z[1], SEESAW.high]
      ]
    },
    {
      id: 'bench-south-west',
      kind: 'ledge',
      pts: [
        [-14.9, 29, 0.46],
        [-13.1, 29, 0.46]
      ]
    },
    {
      id: 'bench-south-east',
      kind: 'ledge',
      pts: [
        [13.1, 29, 0.46],
        [14.9, 29, 0.46]
      ]
    }
  ],
  gaps: [
    {
      name: 'FORT DROP',
      points: 300,
      from: [-6, 6, -6.4, 2],
      fromAbove: 1.8,
      to: [-38, 38, -32, 32],
      toBelow: 0.4
    },
    {name: 'WAVE AIR', points: 250, from: [-5.4, -3, -24, -7], fromAbove: 0.25, to: [-5.6, -2.8, -28, -8]},
    {
      name: 'SANDPIT SEND',
      points: 500,
      from: [-27, -24.5, -3.2, -0.8],
      fromAbove: 0.4,
      to: [SANDPIT.x[0], SANDPIT.x[1], SANDPIT.z[0], SANDPIT.z[1]],
      toBelow: 0.2
    },
    {
      name: 'LOOKOUT LEAP',
      points: 400,
      from: [-19.4, -15, -4.4, 0.4],
      fromAbove: 1.8,
      to: [-38, 38, -32, 32],
      toBelow: 0.4
    },
    {
      name: 'TROLL BRIDGE',
      points: 300,
      from: [-15, -6, -3, -1],
      fromAbove: 1.4,
      to: [-38, 38, -32, 32],
      toBelow: 0.4
    },
    {name: 'SEESAW SEND', points: 300, from: [16, 17.8, 11.3, 12.7], fromAbove: 0.6, to: [17.8, 32, 6, 18]},
    {
      name: 'ALL ABOARD',
      points: 250,
      from: [MERRY.at[0] - 5, MERRY.at[0] + 5, MERRY.at[1] - 5, MERRY.at[1] + 5],
      fromBelow: 0.2,
      to: [MERRY.at[0] - MERRY.r, MERRY.at[0] + MERRY.r, MERRY.at[1] - MERRY.r, MERRY.at[1] + MERRY.r],
      toAbove: 0.2
    },
    {
      name: 'MOUND HOP',
      points: 150,
      from: [MOUND.at[0] - 2.5, MOUND.at[0] + 2.5, MOUND.at[1] - 2.5, MOUND.at[1] + 2.5],
      fromAbove: 0.6,
      to: [-38, 38, -32, 32],
      toBelow: 0.25
    }
  ],
  letters: [
    {letter: 'S', at: [-4.2, -19.4, 1.25]},
    {letter: 'K', at: [-10.5, -2, 2.2]},
    {letter: 'A', at: [19.6, 12, 1.5]},
    {letter: 'T', at: [22, -10.7, 0.75]},
    {letter: 'E', at: [-29.5, -2, 1.05]}
  ],
  // Off the open north-east corner of the fort: the jump nobody is told about.
  tape: [3.5, -8.6, 2.15],
  goals: [
    {id: 'high', label: 'High Score', score: 1500},
    {id: 'pro', label: 'Pro Score', score: 5000},
    {id: 'sick', label: 'Sick Score', score: 12000},
    {id: 'skate', label: 'Collect S-K-A-T-E'},
    {id: 'sandpit', label: 'Sandpit Send', gap: 'SANDPIT SEND'},
    {id: 'fort', label: 'Fort Drop', gap: 'FORT DROP'},
    {id: 'combo', label: '5-trick combo', combo: 5},
    {id: 'tape', label: 'Secret Tape'}
  ]
});
