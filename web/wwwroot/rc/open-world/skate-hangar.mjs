// Skate Hangar: the base's homage to the THPS2 Hangar, at RC scale. A big vert halfpipe
// with a drop-in deck at the west end, a pyramid funbox mid-floor, quarter pipes along both
// long walls, and an open door to the flight line. Pure geometry: every riding surface is
// one triangle list shared by the renderer and the collision world.
// Local frame: x along the hangar (door at +x), z across, y up; metres.

export const HANGAR = Object.freeze({
  center: [560, 0, 900],
  // Parallel to the flight line and its taxiway.
  yaw: Math.atan2(-400, 390),
  length: 64,
  width: 40,
  roof: 15,
  vert: {radius: 3.6, bottom: [-20, -15], deck: 2.9, half: 7},
  back: {run: 7.5},
  pyramid: {at: [12, 0], base: 9, top: 3, height: 1.2},
  quarter: {radius: 2.4, x: [-6, 29]}
});

export function hangarWorld([x, y, z], h = HANGAR) {
  const c = Math.cos(h.yaw),
    s = Math.sin(h.yaw);
  return [h.center[0] + x * c - z * s, h.center[1] + y, h.center[2] + x * s + z * c];
}
export function hangarLocal([x, y, z], h = HANGAR) {
  const c = Math.cos(h.yaw),
    s = Math.sin(h.yaw),
    dx = x - h.center[0],
    dz = z - h.center[2];
  return [dx * c + dz * s, y - h.center[1], -dx * s + dz * c];
}

const arc = (t, r) => r * (1 - Math.sqrt(Math.max(0, 1 - t * t)));

// Collects triangles in local space; `up` faces are wound to face +y (or the riding side).
function builder() {
  const tris = [];
  const tri = (a, b, c, surface, mat) => tris.push({a, b, c, surface, mat});
  // Quad a,b,c,d counter-clockwise seen from the side the normal points to.
  const quad = (a, b, c, d, surface, mat) => {
    tri(a, b, c, surface, mat);
    tri(a, c, d, surface, mat);
  };
  // Closed box from footprint corners (counter-clockwise from above) and two heights.
  const prism = (pts, y0, y1, surface, mat, sides = true) => {
    const top = pts.map(([x, z]) => [x, y1, z]),
      bot = pts.map(([x, z]) => [x, y0, z]);
    for (let i = 1; i < pts.length - 1; i++) tri(top[0], top[i + 1], top[i], surface, mat);
    if (sides)
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        quad(bot[i], bot[j], top[j], top[i], surface, mat);
      }
  };
  return {tris, tri, quad, prism};
}

// A transition strip: height rises along `dir` (+1 toward +x, -1 toward -x) from x0 over
// `radius`, spanning z0..z1. Faces wind toward the riding side.
function transitionX(b, x0, dir, radius, z0, z1, surface, mat, n = 18) {
  for (let i = 0; i < n; i++) {
    const t0 = i / n,
      t1 = (i + 1) / n;
    const xa = x0 + dir * radius * t0,
      xb = x0 + dir * radius * t1,
      ya = arc(t0, radius),
      yb = arc(t1, radius);
    const a = [xa, ya, z0],
      bb = [xb, yb, z0],
      c = [xb, yb, z1],
      d = [xa, ya, z1];
    dir > 0 ? b.quad(a, d, c, bb, surface, mat) : b.quad(a, bb, c, d, surface, mat);
  }
}
function transitionZ(b, z0, dir, radius, x0, x1, surface, mat, n = 14) {
  for (let i = 0; i < n; i++) {
    const t0 = i / n,
      t1 = (i + 1) / n;
    const za = z0 + dir * radius * t0,
      zb = z0 + dir * radius * t1,
      ya = arc(t0, radius),
      yb = arc(t1, radius);
    const a = [x0, ya, za],
      bb = [x0, yb, zb],
      c = [x1, yb, zb],
      d = [x1, ya, za];
    dir > 0 ? b.quad(a, bb, c, d, surface, mat) : b.quad(a, d, c, bb, surface, mat);
  }
}

export function buildHangar(h = HANGAR) {
  const b = builder(),
    L = h.length / 2,
    W = h.width / 2;
  // Polished hangar floor.
  b.quad([-L, 0.01, -W], [-L, 0.01, W], [L, 0.01, W], [L, 0.01, -W], 'concrete', 'floor');
  // Vert halfpipe. Its walls always return (surface 'vert'), with the biggest air on base.
  const v = h.vert,
    R = v.radius,
    [x0, x1] = v.bottom,
    Z = v.half;
  transitionX(b, x0, -1, R, -Z, Z, 'vert', 'ramp');
  transitionX(b, x1, 1, R, -Z, Z, 'vert', 'ramp');
  const westTop = x0 - R,
    eastTop = x1 + R;
  b.prism(
    [
      [westTop - v.deck, -Z],
      [westTop, -Z],
      [westTop, Z],
      [westTop - v.deck, Z]
    ],
    0,
    R,
    'concrete',
    'deck'
  );
  b.prism(
    [
      [eastTop, -Z],
      [eastTop + v.deck, -Z],
      [eastTop + v.deck, Z],
      [eastTop, Z]
    ],
    0,
    R,
    'concrete',
    'deck'
  );
  // Side skirts close the transitions' open ends.
  for (const [xa, dir] of [
    [x0, -1],
    [x1, 1]
  ])
    for (const z of [-Z, Z]) {
      for (let i = 0; i < 12; i++) {
        const t0 = i / 12,
          t1 = (i + 1) / 12,
          a = [xa + dir * R * t0, 0, z],
          bb = [xa + dir * R * t1, 0, z];
        const c = [xa + dir * R * t1, arc(t1, R), z],
          d = [xa + dir * R * t0, arc(t0, R), z];
        z < 0 === dir > 0
          ? b.quad(a, bb, c, d, 'concrete', 'skirt')
          : b.quad(a, d, c, bb, 'concrete', 'skirt');
      }
    }
  // Back bank from the east deck down to the floor: drive up, drop in.
  const backTop = eastTop + v.deck,
    run = h.back.run;
  b.quad(
    [backTop, R, -Z],
    [backTop, R, Z],
    [backTop + run, 0, Z],
    [backTop + run, 0, -Z],
    'concrete',
    'bank'
  );
  for (const z of [-Z, Z])
    z < 0
      ? b.tri([backTop, 0, z], [backTop + run, 0, z], [backTop, R, z], 'concrete', 'skirt')
      : b.tri([backTop, 0, z], [backTop, R, z], [backTop + run, 0, z], 'concrete', 'skirt');
  // Pyramid funbox: four banks to a flat top.
  const p = h.pyramid,
    [px, pz] = p.at,
    B = p.base / 2,
    Tt = p.top / 2,
    ph = p.height;
  const lo = [
    [px - B, 0, pz - B],
    [px + B, 0, pz - B],
    [px + B, 0, pz + B],
    [px - B, 0, pz + B]
  ];
  const hi = [
    [px - Tt, ph, pz - Tt],
    [px + Tt, ph, pz - Tt],
    [px + Tt, ph, pz + Tt],
    [px - Tt, ph, pz + Tt]
  ];
  b.quad(hi[0], hi[3], hi[2], hi[1], 'concrete', 'pyramid-top');
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    b.quad(lo[i], hi[i], hi[j], lo[j], 'concrete', 'pyramid');
  }
  // Wall quarters along both long walls; they return like a bowl.
  const q = h.quarter,
    [qa, qb] = q.x;
  transitionZ(b, -W + q.radius, -1, q.radius, qa, qb, 'bowl', 'ramp');
  transitionZ(b, W - q.radius, 1, q.radius, qa, qb, 'bowl', 'ramp');
  for (const [z0, z1] of [
    [-W, -W + q.radius],
    [W - q.radius, W]
  ]) {
    for (const x of [qa, qb]) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const t0 = i / n,
          t1 = (i + 1) / n,
          inner = z0 < 0 ? z1 : z0,
          dir = z0 < 0 ? -1 : 1;
        const za = inner + dir * q.radius * t0,
          zb = inner + dir * q.radius * t1;
        const a = [x, 0, za],
          bb = [x, 0, zb],
          c = [x, arc(t1, q.radius), zb],
          d = [x, arc(t0, q.radius), za];
        (x === qa) === dir > 0
          ? b.quad(a, d, c, bb, 'concrete', 'skirt')
          : b.quad(a, bb, c, d, 'concrete', 'skirt');
      }
    }
  }
  // Hangar shell: closed west end and long walls, open door at +x. Walls are collision.
  const wall = (pts, y1) => b.prism(pts, 0, y1, 'metal', 'wall');
  wall(
    [
      [-L - 0.4, -W - 0.4],
      [-L, -W - 0.4],
      [-L, W + 0.4],
      [-L - 0.4, W + 0.4]
    ],
    9
  );
  wall(
    [
      [-L, -W - 0.4],
      [L, -W - 0.4],
      [L, -W],
      [-L, -W]
    ],
    9
  );
  wall(
    [
      [-L, W],
      [L, W],
      [L, W + 0.4],
      [-L, W + 0.4]
    ],
    9
  );
  return b.tris;
}

// Skate run definition, in the hangar's local [x, z, h].
export const HANGAR_PARK = Object.freeze({
  id: 'hangar',
  name: 'SKATE HANGAR',
  start: {at: [24, 0], toward: [-1, 0]},
  rails: [
    {
      id: 'vert-coping-west',
      kind: 'coping',
      pts: [
        [-23.6, -7, 3.67],
        [-23.6, 7, 3.67]
      ]
    },
    {
      id: 'vert-coping-east',
      kind: 'coping',
      pts: [
        [-11.4, -7, 3.67],
        [-11.4, 7, 3.67]
      ]
    },
    {
      id: 'drop-deck-guard-west',
      kind: 'rail',
      pts: [
        [-26.4, -7, 4.535],
        [-26.4, 7, 4.535]
      ]
    },
    {
      id: 'quarter-coping-south',
      kind: 'coping',
      pts: [
        [-6, -19.98, 2.45],
        [29, -19.98, 2.45]
      ]
    },
    {
      id: 'quarter-coping-north',
      kind: 'coping',
      pts: [
        [-6, 19.98, 2.45],
        [29, 19.98, 2.45]
      ]
    },
    {
      id: 'pyramid-edge-south',
      kind: 'edge',
      pts: [
        [10.5, -1.5, 1.2],
        [13.5, -1.5, 1.2]
      ]
    },
    {
      id: 'pyramid-edge-east',
      kind: 'edge',
      pts: [
        [13.5, -1.5, 1.2],
        [13.5, 1.5, 1.2]
      ]
    },
    {
      id: 'pyramid-edge-north',
      kind: 'edge',
      pts: [
        [13.5, 1.5, 1.2],
        [10.5, 1.5, 1.2]
      ]
    },
    {
      id: 'pyramid-edge-west',
      kind: 'edge',
      pts: [
        [10.5, 1.5, 1.2],
        [10.5, -1.5, 1.2]
      ]
    }
  ],
  gaps: [
    {
      name: 'DROP IN',
      points: 250,
      from: [-11.6, -1.2, -7, 7],
      fromAbove: 3.3,
      to: [-23.6, -11.4, -7, 7],
      toBelow: 3.3
    },
    {
      name: 'DECK LANDING',
      points: 400,
      from: [-23.6, -11.4, -7, 7],
      fromBelow: 3.4,
      to: [-26.6, -23.4, -7, 7],
      toAbove: 3.4
    },
    {
      name: 'DECK LANDING',
      points: 400,
      from: [-23.6, -11.4, -7, 7],
      fromBelow: 3.4,
      to: [-11.6, -8.5, -7, 7],
      toAbove: 3.4
    },
    {name: 'HANGTIME', points: 400, from: [-23.6, -11.4, -7, 7], to: [-23.6, -11.4, -7, 7], minAir: 1.9},
    // Take off from one face of the pyramid, land beyond its far side.
    {name: 'PYRAMID HOP', points: 300, from: [7, 10.5, -4.5, 4.5], to: [13.5, 22, -4.5, 4.5]},
    {name: 'PYRAMID HOP', points: 300, from: [13.5, 17, -4.5, 4.5], to: [2, 10.5, -4.5, 4.5]},
    {name: 'PYRAMID HOP', points: 300, from: [7.5, 16.5, -4.5, -1], to: [7.5, 16.5, 1.5, 10]},
    {name: 'PYRAMID HOP', points: 300, from: [7.5, 16.5, 1, 4.5], to: [7.5, 16.5, -10, -1.5]}
  ],
  letters: [
    {letter: 'S', at: [12, 0, 1.9]},
    {letter: 'K', at: [-22.9, 0, 5.4]},
    {letter: 'A', at: [-10, 5, 3.9]},
    {letter: 'T', at: [10, -19.4, 3.4]},
    {letter: 'E', at: [20, 19.4, 3.4]}
  ],
  tape: [-12.1, -4, 6.6],
  goals: [
    {id: 'high', label: 'High Score', score: 5000},
    {id: 'pro', label: 'Pro Score', score: 20000},
    {id: 'sick', label: 'Sick Score', score: 75000},
    {id: 'skate', label: 'Collect S-K-A-T-E'},
    {id: 'drop', label: 'Drop In', gap: 'DROP IN'},
    {id: 'hang', label: 'Hangtime', gap: 'HANGTIME'},
    {id: 'combo', label: '6-trick combo', combo: 6},
    {id: 'tape', label: 'Secret Tape'}
  ]
});
