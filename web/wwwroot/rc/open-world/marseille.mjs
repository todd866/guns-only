import { MARSEILLE, marseilleWorld } from './marseille-site.mjs';
export { MARSEILLE, marseilleWorld, marseilleLocal } from './marseille-site.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothMin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };
export const kidneyDistance = (x, z) => smoothMin(Math.hypot(x + 23, z + 7) - 9, Math.hypot(x + 13, z + 5) - 7.5, 1.5);
const depth = (d, r) => d <= 0 ? 0 : d >= r ? r : Math.sqrt(r * r - (r - d) ** 2);
const snakeZ = x => 10 + 2 * Math.cos(x / 12 * Math.PI / 2);
const snakeDistance = (x, z) => {
  let d = Infinity;
  for (let i = 0; i < 32; i++) {
    const a = -19 + i, b = a + 1, az = snakeZ(a), bz = snakeZ(b), dx = b - a, dz = bz - az;
    const t = clamp(((x - a) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    d = Math.min(d, Math.hypot(x - a - t * dx, z - az - t * dz));
  }
  return d - 3.6;
};

// A single cut surface prevents overlapping bowl floors at the links and hips.
export function marseilleHeight(x, z) {
  const deep = 2.4 + .8 * clamp((-x - 13) / 8, 0, 1);
  let y = -Math.max(depth(-kidneyDistance(x, z), deep), depth(7.2 - Math.hypot(x - 7, z + 6), 2.2), depth(-snakeDistance(x, z), 1.5));
  // Rounded channels connect the snake's ends to both bowls.
  for (const [cx, cz, r] of [[-19, 3, 4.5], [11, 3, 4.3]]) y = Math.min(y, -depth(r - Math.hypot(x - cx, z - cz), 1.5));
  if (x > -11 && x < 5 && Math.abs(z + 6) < 3) {
    const hip = x < -4.5 ? -2.4 + (x + 11) / 6.5 * 2.05 : -.35 - (x + 4.5) / 9.5 * 1.85;
    const w = clamp((3 - Math.abs(z + 6)) / 1.2, 0, 1);
    y = y * (1 - w) + hip * w;
  }
  // The snake's broad roller launches along the channel, without a vertical face.
  if (Math.abs(x) < 4) {
    const w = clamp((3.3 - Math.abs(z - snakeZ(x))) / 1.3, 0, 1);
    if (w > 0) y = Math.max(y, -1.5 + (1 - Math.abs(x) / 4) * 1.1 * w);
  }
  // A drainage channel across the plaza is jumped from either bank.
  if (x > 19 && x < 27 && z > 17 && z < 20) y = -1;
  return y;
}

export function buildMarseille() {
  const tris = [], tri = (a, b, c, surface, mat) => tris.push({ a: marseilleWorld(a), b: marseilleWorld(b), c: marseilleWorld(c), surface, mat });
  const quad = (a, b, c, d, surface, mat) => { tri(a, b, c, surface, mat); tri(a, c, d, surface, mat); };
  const box = (x0, z0, x1, z1, h, mat = 'ledge') => {
    quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], 'concrete', mat);
    quad([x0, 0, z0], [x0, h, z0], [x1, h, z0], [x1, 0, z0], 'concrete', mat);
    quad([x1, 0, z1], [x1, h, z1], [x0, h, z1], [x0, 0, z1], 'concrete', mat);
    quad([x0, 0, z1], [x0, h, z1], [x0, h, z0], [x0, 0, z0], 'concrete', mat);
    quad([x1, 0, z0], [x1, h, z0], [x1, h, z1], [x1, 0, z1], 'concrete', mat);
  };
  const wedge = (x0, x1, z0, z1, h, dir = 1) => {
    const ya = dir > 0 ? 0 : h, yb = h - ya;
    quad([x0, ya, z0], [x0, yb, z1], [x1, yb, z1], [x1, ya, z0], 'concrete', 'bank');
    tri([x0, 0, z0], [x0, yb, z1], [x0, ya, z0], 'concrete', 'skirt');
    tri([x1, 0, z0], [x1, ya, z0], [x1, yb, z1], 'concrete', 'skirt');
  };
  const [x0, z0, x1, z1] = [-34, -17, 18, 16], step = .3, nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const v = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]].map(([a, b]) => { const x = x0 + (x1 - x0) * a / nx, z = z0 + (z1 - z0) * b / nz; return [x, marseilleHeight(x, z), z]; });
    const cut = v.some(p => p[1] < -.01), hip = v.every(p => p[0] > -11 && p[0] < 5 && Math.abs(p[2] + 6) < 3);
    const floor = v.every(p => p[1] < -1.4), mat = cut ? floor ? 'floor' : 'wall' : 'deck';
    quad(...v, hip ? 'hip' : cut ? 'bowl' : 'concrete', mat);
  }
  const flat = (x0, z0, x1, z1, y = 0, mat = 'deck') => quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], 'concrete', mat);
  // Only the curved cut needs a fine grid; broad deck slabs keep collision cheap.
  for (const r of [[-40,-24,-34,16],[-34,-24,18,-17],[18,-24,32,16],[-40,16,19,32],[27,16,32,32],[19,16,27,17],[19,20,27,32]]) flat(...r);
  flat(19,17,27,20,-1,'floor');
  quad([19,0,17],[19,-1,17],[27,-1,17],[27,0,17],'concrete','wall');
  quad([27,0,20],[27,-1,20],[19,-1,20],[19,0,20],'concrete','wall');
  quad([19,0,20],[19,-1,20],[19,-1,17],[19,0,17],'concrete','wall');
  quad([27,0,17],[27,-1,17],[27,-1,20],[27,0,20],'concrete','wall');
  // Four bank funbox on the dry plaza.
  const lo = [[-10, 0, 20], [-10, 0, 28], [-2, 0, 28], [-2, 0, 20]], hi = [[-7, 1.1, 23], [-7, 1.1, 25], [-5, 1.1, 25], [-5, 1.1, 23]];
  quad(...hi, 'concrete', 'top');
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(lo[i], lo[j], hi[j], hi[i], 'concrete', 'bank'); }
  wedge(19, 27, 12.5, 17, .9); wedge(19, 27, 20, 25, .9, -1);
  // Low steps with a broad bank up the back: every descent has a run-up.
  box(-34, 21, -23, 26, 1.0, 'top'); wedge(-34, -23, 16, 21, 1.0);
  for (let i = 0; i < 3; i++) box(-32, 26 + i * .65, -25, 26 + (i + 1) * .65, .75 - i * .25, 'steps');
  box(2, 24, 12, 25, .45); wedge(3, 11, 21, 24, .45);
  box(-36, -17, -35, -8, .4); box(19, -14, 20, -4, .4);
  return tris;
}

const installed = new WeakSet();
export function addMarseilleCollision(world) {
  if (!world?.addTri || installed.has(world)) return;
  for (const t of buildMarseille()) world.addTri(t.a, t.b, t.c, t.surface);
  installed.add(world);
}

// The coping sits on the flat outside edge, so its grind height is the deck datum.
const kidneyCoping = [];
for (let i = 0; i <= 100; i++) {
  const a = i / 100 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let lo = 0, hi = 25;
  for (let k = 0; k < 22; k++) { const r = (lo + hi) / 2; if (kidneyDistance(-19 + r * dx, -6 + r * dz) < .4) lo = r; else hi = r; }
  const x = -19 + hi * dx, z = -6 + hi * dz;
  kidneyCoping.push([x, z, 0]);
}
const circleCoping = Array.from({ length: 73 }, (_, i) => { const a = i / 72 * Math.PI * 2; return [7 + 7.6 * Math.cos(a), -6 + 7.6 * Math.sin(a), 0]; });
const splitCoping = (id, pts) => {
  const rails = []; let line = [];
  for (const p of pts) { if (marseilleHeight(p[0], p[1]) > -.005) line.push(p); else { if (line.length > 1) rails.push({ id: `${id}-${rails.length}`, kind: 'coping', pts: line }); line = []; } }
  if (line.length > 1) rails.push({ id: `${id}-${rails.length}`, kind: 'coping', pts: line });
  return rails;
};
export const MARSEILLE_PARK = Object.freeze({
  id: 'marseille', name: 'THE BOWLS', start: { at: [-34, -6], toward: [1, 0] },
  gaps: [
    { name: 'DEEP END AIR', points: 500, from: [-33, -26, -14, 0], to: [-33, -24, -15, 1], minAir: .65, fromBelow: -.25 },
    { name: 'ROUND BOWL AIR', points: 250, from: [3, 11, -14, -12], to: [3, 11, -12, -9], minAir: 1, fromBelow: .1, toBelow: -1 },
    { name: 'BOWL TO BOWL', points: 600, from: [-8, -2, -9, -3], to: [-1, 10, -10, -2], fromBelow: -.1, toBelow: -.2 },
    { name: 'SNAKE RUN', points: 350, from: [-5, 1, 8, 16], to: [1, 11, 7, 16], minAir: .5 },
    { name: 'OVER THE CHANNEL', points: 400, from: [18, 28, 12, 17.5], to: [18, 28, 20, 29] },
    { name: 'FUNBOX', points: 250, from: [-11, -1, 19, 23.5], to: [-12, 0, 25, 32] },
    { name: 'SPILLWAY STEPS', points: 300, from: [-34, -23, 21, 26.3], fromAbove: .8, to: [-34, -23, 28, 32], toBelow: .3 },
    { name: 'LONG LEDGE', points: 200, from: [2, 12, 23, 25.3], fromAbove: .3, to: [1, 13, 26, 32], toBelow: .3 },
  ],
  letters: [{ letter: 'S', at: [-30.8, -7, 1.1] }, { letter: 'K', at: [7, -12.6, 1.0] }, { letter: 'A', at: [0, 12, .25] }, { letter: 'T', at: [-6, 24, 1.8] }, { letter: 'E', at: [23, 19, 1.5] }],
  tape: [-31, -9.1, 1.4],
  rails: [...splitCoping('kidney', kidneyCoping), ...splitCoping('round', circleCoping),
    { id: 'plaza-ledge', kind: 'ledge', pts: [[2.2, 24.5, .45], [11.8, 24.5, .45]] },
    { id: 'west-bench', kind: 'ledge', pts: [[-35.5, -16.8, .4], [-35.5, -8.2, .4]] },
    { id: 'east-bench', kind: 'ledge', pts: [[19.5, -13.8, .4], [19.5, -4.2, .4]] },
    { id: 'step-edge', kind: 'edge', pts: [[-33.8, 25.8, 1], [-23.2, 25.8, 1]] },
    { id: 'funbox', kind: 'edge', pts: [[-6.9, 23.1, 1.1], [-6.9, 24.9, 1.1]] },
  ],
  goals: [{ id: 'high', label: 'High Score', score: 3000 }, { id: 'pro', label: 'Pro Score', score: 12000 }, { id: 'sick', label: 'Sick Score', score: 100000 },
    { id: 'skate', label: 'Collect S-K-A-T-E' }, { id: 'bowls', label: 'Bowl to Bowl', gap: 'BOWL TO BOWL' }, { id: 'deep', label: 'Deep End Air', gap: 'DEEP END AIR' }, { id: 'combo', label: '3-trick combo', combo: 3 }, { id: 'tape', label: 'Secret Tape' }],
});
