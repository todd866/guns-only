// Schoolyard: the base's homage to THPS2 School II, on the playing field west of the
// neighbourhood high school. A drained pool sunk into the field, a short bus to jump, a
// planter gap and the school-entrance steps. Pure geometry in world metres: the riding
// surfaces are one triangle list shared by the renderer and the collision world.

export const SCHOOLYARD = Object.freeze({
  center: [-3375, -760],
  // The field is levelled to this datum under a terrain pad; the pool is cut below it.
  datum: -1.5,
  pad: 40,
  pool: {at: [-14, -18], half: [8, 4.5], corner: 3, depth: 2.2},
  bus: {at: [14, -16], length: 9, width: 2.0, height: 1.5},
  busKicker: {x: [11, 17], z: [-20.6, -17.6], rise: 1.7},
  busLanding: {x: [11, 17], z: [-15, -9.5], rise: 1.5},
  planter: {x: [-15, -9], z: [11.4, 12.4], height: 0.4},
  planterKicker: {x: [-14.5, -9.5], z: [8.6, 10.6], rise: 0.7},
  platform: {x: [8, 18], z: [8, 14], height: 1, bank: 5, steps: 4, tread: 0.75}
});

const S = SCHOOLYARD;
export const yardWorld = ([x, y, z]) => [S.center[0] + x, S.datum + y, S.center[1] + z];
export const yardLocal = ([x, y, z]) => [x - S.center[0], y - S.datum, z - S.center[1]];
// Terrain hole requested for the pool (world rect); the terrain snaps it to whole cells.
export const POOL_HOLE = (() => {
  const [x, z] = S.pool.at,
    [hx, hz] = S.pool.half;
  return [
    S.center[0] + x - hx - 1,
    S.center[1] + z - hz - 1,
    S.center[0] + x + hx + 1,
    S.center[1] + z + hz + 1
  ];
})();
export const YARD_PAD = {
  bounds: [S.center[0] - S.pad, S.center[1] - S.pad, S.center[0] + S.pad, S.center[1] + S.pad],
  datum: S.datum,
  feather: 20
};

// Depth below the deck inside the pool's rounded rectangle: a quarter-circle wall into a
// flat floor, vertical at the coping. Zero outside.
export function poolDepth(x, z, p = S.pool) {
  const [cx, cz] = p.at,
    [hx, hz] = p.half,
    r = p.corner;
  const qx = Math.abs(x - cx) - (hx - r),
    qz = Math.abs(z - cz) - (hz - r);
  const sdf = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
  const d = -sdf,
    R = p.depth;
  if (d <= 0) return 0;
  if (d >= R) return R;
  return R * Math.sqrt(1 - ((R - d) / R) ** 2);
}

function builder() {
  const tris = [];
  const tri = (a, b, c, surface, mat) =>
    tris.push({a: yardWorld(a), b: yardWorld(b), c: yardWorld(c), surface, mat});
  const quad = (a, b, c, d, surface, mat) => {
    tri(a, b, c, surface, mat);
    tri(a, c, d, surface, mat);
  };
  // Closed prism: footprint ordered +z then +x (counter-clockwise about +y); faces point out.
  const prism = (pts, y0, y1, surface, mat, top = mat) => {
    const t = pts.map(([x, z]) => [x, y1, z]),
      b = pts.map(([x, z]) => [x, y0, z]);
    for (let i = 1; i < pts.length - 1; i++) tri(t[0], t[i], t[i + 1], surface, top);
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      quad(b[i], b[j], t[j], t[i], surface, mat);
    }
  };
  // Wedge rising along +z (dir 1) or -z (dir -1) from 0 to `rise`, over x0..x1, z0..z1.
  const wedge = (x0, x1, z0, z1, rise, dir, surface, mat) => {
    const lo = dir > 0 ? z0 : z1,
      hi = dir > 0 ? z1 : z0;
    const a = [x0, 0, lo],
      b = [x1, 0, lo],
      c = [x1, rise, hi],
      d = [x0, rise, hi];
    dir > 0 ? quad(a, d, c, b, surface, mat) : quad(a, b, c, d, surface, mat);
    const e = [x0, 0, hi],
      f = [x1, 0, hi];
    dir > 0 ? quad(e, f, c, d, surface, 'skirt') : quad(e, d, c, f, surface, 'skirt');
    dir > 0
      ? (tri(a, e, d, surface, 'skirt'), tri(b, c, f, surface, 'skirt'))
      : (tri(a, d, e, surface, 'skirt'), tri(b, f, c, surface, 'skirt'));
  };
  return {tris, tri, quad, prism, wedge};
}

// `hole` is the snapped world rect the terrain left open; the deck fills it exactly.
export function buildSchoolyard(hole) {
  const b = builder(),
    [hx0, hz0, hx1, hz1] = hole.map((v, i) => v - S.center[i % 2]);
  // Pool and deck: one heightfield over the hole, deck at the datum, pool cut below it.
  const step = 0.3,
    nx = Math.ceil((hx1 - hx0) / step),
    nz = Math.ceil((hz1 - hz0) / step);
  const px = i => hx0 + ((hx1 - hx0) * i) / nx,
    pz = j => hz0 + ((hz1 - hz0) * j) / nz;
  const y = (i, j) => -poolDepth(px(i), pz(j));
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const v = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1]
      ].map(([a, c]) => [px(a), y(a, c), pz(c)]);
      const inPool = v.some(p => p[1] < -0.001),
        surface = inPool ? 'bowl' : 'concrete',
        mat = inPool ? (v.every(p => p[1] < -S.pool.depth + 0.01) ? 'pool-floor' : 'pool-wall') : 'deck';
      b.quad(v[0], v[3], v[2], v[1], surface, mat);
    }
  // Short bus with kicker and landing ramp across its width.
  const bus = S.bus,
    [bx, bz] = bus.at,
    L = bus.length / 2,
    W = bus.width / 2;
  b.prism(
    [
      [bx - L, bz - W],
      [bx - L, bz + W],
      [bx + L, bz + W],
      [bx + L, bz - W]
    ],
    0.35,
    bus.height,
    'metal',
    'bus',
    'bus-roof'
  );
  const k = S.busKicker,
    l = S.busLanding;
  b.wedge(k.x[0], k.x[1], k.z[0], k.z[1], k.rise, 1, 'wood', 'kicker');
  b.wedge(l.x[0], l.x[1], l.z[0], l.z[1], l.rise, -1, 'wood', 'kicker');
  // Planter with a kicker before it.
  const pl = S.planter,
    pk = S.planterKicker;
  b.prism(
    [
      [pl.x[0], pl.z[0]],
      [pl.x[0], pl.z[1]],
      [pl.x[1], pl.z[1]],
      [pl.x[1], pl.z[0]]
    ],
    0,
    pl.height,
    'concrete',
    'planter',
    'planter-top'
  );
  b.wedge(pk.x[0], pk.x[1], pk.z[0], pk.z[1], pk.rise, 1, 'wood', 'kicker');
  // Entrance platform: a bank up its east side and a stair set down its south side.
  const pf = S.platform,
    [x0, x1] = pf.x,
    [z0, z1] = pf.z;
  b.prism(
    [
      [x0, z0],
      [x0, z1],
      [x1, z1],
      [x1, z0]
    ],
    0,
    pf.height,
    'concrete',
    'platform'
  );
  b.quad(
    [x1, pf.height, z0],
    [x1, pf.height, z1],
    [x1 + pf.bank, 0, z1],
    [x1 + pf.bank, 0, z0],
    'concrete',
    'bank'
  );
  b.tri([x1, 0, z0], [x1, pf.height, z0], [x1 + pf.bank, 0, z0], 'concrete', 'skirt');
  b.tri([x1, 0, z1], [x1 + pf.bank, 0, z1], [x1, pf.height, z1], 'concrete', 'skirt');
  for (let s = 0; s < pf.steps - 1; s++) {
    const h = (pf.height * (pf.steps - 1 - s)) / pf.steps,
      za = z1 + s * pf.tread,
      zb = za + pf.tread;
    b.prism(
      [
        [x0 + 2, za],
        [x0 + 2, zb],
        [x1 - 2, zb],
        [x1 - 2, za]
      ],
      0,
      h,
      'concrete',
      'steps'
    );
  }
  return b.tris;
}

export const SCHOOL_PARK = Object.freeze({
  id: 'school',
  name: 'SCHOOLYARD',
  start: {at: [2, -18], toward: [-1, 0]},
  rails: [
    {
      id: 'steps-handrail-west',
      kind: 'rail',
      pts: [
        [11.2, 13.8, 1.885],
        [11.2, 16.25, 1.135]
      ]
    },
    {
      id: 'steps-handrail-east',
      kind: 'rail',
      pts: [
        [14.8, 13.8, 1.885],
        [14.8, 16.25, 1.135]
      ]
    },
    {
      id: 'planter-edge-near',
      kind: 'ledge',
      pts: [
        [-15, 11.4, 0.4],
        [-9, 11.4, 0.4]
      ]
    },
    {
      id: 'planter-edge-far',
      kind: 'ledge',
      pts: [
        [-15, 12.4, 0.4],
        [-9, 12.4, 0.4]
      ]
    },
    {
      id: 'pool-coping-rim',
      kind: 'coping',
      pts: [
        [-6, -16.5, 0.09],
        [-6.1022225211, -15.7235428647, 0.09],
        [-6.4019237886, -15, 0.09],
        [-6.8786796564, -14.3786796564, 0.09],
        [-7.5, -13.9019237886, 0.09],
        [-8.2235428647, -13.6022225211, 0.09],
        [-9, -13.5, 0.09],
        [-19, -13.5, 0.09],
        [-19.7764571353, -13.6022225211, 0.09],
        [-20.5, -13.9019237886, 0.09],
        [-21.1213203436, -14.3786796564, 0.09],
        [-21.5980762114, -15, 0.09],
        [-21.8977774789, -15.7235428647, 0.09],
        [-22, -16.5, 0.09],
        [-22, -19.5, 0.09],
        [-21.8977774789, -20.2764571353, 0.09],
        [-21.5980762114, -21, 0.09],
        [-21.1213203436, -21.6213203436, 0.09],
        [-20.5, -22.0980762114, 0.09],
        [-19.7764571353, -22.3977774789, 0.09],
        [-19, -22.5, 0.09],
        [-9, -22.5, 0.09],
        [-8.2235428647, -22.3977774789, 0.09],
        [-7.5, -22.0980762114, 0.09],
        [-6.8786796564, -21.6213203436, 0.09],
        [-6.4019237886, -21, 0.09],
        [-6.1022225211, -20.2764571353, 0.09],
        [-6, -19.5, 0.09]
      ]
    },
    {
      id: 'bus-roof-near',
      kind: 'edge',
      pts: [
        [9.5, -17, 1.5],
        [18.5, -17, 1.5]
      ]
    },
    {
      id: 'bus-roof-far',
      kind: 'edge',
      pts: [
        [9.5, -15, 1.5],
        [18.5, -15, 1.5]
      ]
    }
  ],
  gaps: [
    {name: 'OVER THE BUS', points: 500, from: [10.5, 17.5, -21, -17.2], to: [10, 18, -15, -4]},
    {
      name: 'ROOF LANDING',
      points: 200,
      from: [10.5, 17.5, -21, -17.2],
      to: [9.5, 18.5, -17, -15],
      toAbove: 1.3
    },
    {name: 'PLANTER GAP', points: 250, from: [-15, -9, 8, 10.8], to: [-16, -8, 12.6, 22]},
    {
      name: 'SCHOOL STEPS',
      points: 300,
      from: [8, 18, 8, 14.2],
      fromAbove: 0.9,
      to: [7, 19, 16.6, 26],
      toBelow: 0.35
    },
    {
      name: 'POOL HOP',
      points: 400,
      from: [-22.5, -5.5, -23, -13],
      fromBelow: -0.3,
      to: [-26, -2, -26, -10],
      toAbove: -0.05
    }
  ],
  letters: [
    {letter: 'S', at: [14, -16, 2.6]},
    {letter: 'K', at: [-14, -21.9, 1.1]},
    {letter: 'A', at: [-12, 12, 1.1]},
    {letter: 'T', at: [13, 11, 1.25]},
    {letter: 'E', at: [-6.3, -18, 1.0]}
  ],
  // Over the bus's far side at the jump's apex, off the kicker's west edge: a line, not just speed.
  tape: [11.45, -16.4, 2.15],
  goals: [
    {id: 'high', label: 'High Score', score: 4000},
    {id: 'pro', label: 'Pro Score', score: 12000},
    {id: 'sick', label: 'Sick Score', score: 40000},
    {id: 'skate', label: 'Collect S-K-A-T-E'},
    {id: 'bus', label: 'Over the Bus', gap: 'OVER THE BUS'},
    {id: 'steps', label: 'School Steps', gap: 'SCHOOL STEPS'},
    {id: 'combo', label: '5-trick combo', combo: 5},
    {id: 'tape', label: 'Secret Tape'}
  ]
});
