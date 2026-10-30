// The Sewers under the base: the second dungeon of the adventure (docs/design/adventure, "Dungeon 2:
// the Sewers, where skating is the key"). Zelda's rule: the dungeon's item (the skateboard) is found
// halfway, and the back half needs it. Pipes across sewage are grind rails; a trick shrine opens on
// a combo. Toy scale, like the mine. Local frame: +x east (the way on), +z south, walkway floor at
// y = 0; sewage channels sit below it. Reached by a manhole in the street by the skatepark.
//
// Plan (north is -z):
//   S0 shaft -- S1 junction (channel, footbridge, key K1 south) --A-- S2 board room
//   S2 -- S3 pipe channel (10 m of sewage, two pipes) -- S4 trick shrine --C(combo)-- S5 bowl
import { createDungeon } from '../physics/dungeon.mjs';
import { boxTris } from './mine.mjs';

// Under the residential street beside the skatepark; the manhole is in the street above.
export const SEWER = Object.freeze({ anchor: [-3214, -7, -980], ceiling: 1.8, sewage: -.45, pit: -.75 });
export const MANHOLE = Object.freeze({ at: [-3198.2, 5.0, -977.8], reach: 1.4 });
export const sewerWorld = ([x, y, z]) => [SEWER.anchor[0] + x, SEWER.anchor[1] + y, SEWER.anchor[2] + z];
export const sewerLocal = ([x, y, z]) => [x - SEWER.anchor[0], y - SEWER.anchor[1], z - SEWER.anchor[2]];

const R = (id, x0, x1, z0, z1, extra = {}) => ({ id, x: [x0, x1], z: [z0, z1], ...extra });
export const ROOMS = Object.freeze([
  R('S0', -2, 1.5, -3, -.8, { name: 'Manhole shaft', ceiling: 3.2 }),
  R('S1', 1.5, 15, -3, 3, { name: 'Junction' }),
  R('S2', 15, 20, -3, 1, { name: 'Board room' }),
  R('S3', 20, 36, -6, 1, { name: 'Pipe channel' }),
  R('S4', 36, 47, -6, 1, { name: 'Trick shrine' }),
  R('S5', 47, 58, -8, 3, { name: 'Drained bowl', ceiling: 2.6 }),
]);
// Sewage channels: [x0, x1, z0, z1] cut out of a room's walkway floor (pit floor at SEWER.pit).
export const CHANNELS = Object.freeze([
  { room: 'S1', box: [1.5, 15, -.8, .8] },
  { room: 'S3', box: [23, 33, -6, 1] },
]);
export const OPENINGS = Object.freeze([
  { a: 'S0', b: 'S1', wall: 'x', at: 1.5, span: [-3, -.8] },
  { a: 'S1', b: 'S2', wall: 'x', at: 15, span: [-3, -.8], door: 'A' },
  { a: 'S2', b: 'S3', wall: 'x', at: 20, span: [-3, 1] },
  { a: 'S3', b: 'S4', wall: 'x', at: 36, span: [-6, 1] },
  { a: 'S4', b: 'S5', wall: 'x', at: 47, span: [-4, -1], door: 'C' },
]);
// Solid features: [x0, x1, z0, z1, y0, y1], surface. The footbridge lets the car and robot over S1.
export const FEATURES = Object.freeze([
  { name: 'footbridge', box: [3.6, 4.6, -.8, .8, -.06, 0], surface: 'wood' },
  { name: 'shrine ledge', box: [39, 43, -4.6, -4.2, 0, .2], surface: 'concrete' },
]);
// Wedges: a kicker in the shrine, rising toward +x: [x0, x1, z0, z1, height].
export const KICKERS = Object.freeze([{ name: 'shrine kicker', box: [38.2, 39, -2.2, -.8, .18] }]);
// The drained bowl in S5: a pool with a shallow end by the door and a deep end, rounded
// transitions and coping all round. The Rat King runs round the bottom (physics/rat-king.mjs).
export const BOWL = Object.freeze({ room: 'S5', box: [48.5, 56.5, -6.5, 1.5], wall: 1.2, shallow: .35, deep: 1, slope: [50.5, 53.5], cell: .25, coping: .04 });
const bowlDepth = x => { const [a, b] = BOWL.slope, t = Math.max(0, Math.min(1, (x - a) / (b - a))); return BOWL.shallow + (BOWL.deep - BOWL.shallow) * t * t * (3 - 2 * t); };
/** The bowl's floor height at (x, z), local; 0 (the deck) outside it. */
export function bowlFloor(x, z) {
  const [x0, x1, z0, z1] = BOWL.box;
  if (x <= x0 || x >= x1 || z <= z0 || z >= z1) return 0;
  const a = Math.min(x - x0, x1 - x) / BOWL.wall, b = Math.min(z - z0, z1 - z) / BOWL.wall;
  const e = Math.min(1, (a ** -4 + b ** -4) ** -.25);   // rounded corners
  return -bowlDepth(x) * (1 - (1 - e) ** 2);
}
export const inBowl = ([x, , z]) => x > BOWL.box[0] && x < BOWL.box[1] && z > BOWL.box[2] && z < BOWL.box[3];
// Coping on each side, stopping short of the rounded corners.
function copingRails() {
  const [x0, x1, z0, z1] = BOWL.box, h = BOWL.coping, i = .5;
  return [
    { id: 'coping-north', kind: 'rail', pts: [[x0 + i, z0, h], [x1 - i, z0, h]] },
    { id: 'coping-south', kind: 'rail', pts: [[x0 + i, z1, h], [x1 - i, z1, h]] },
    { id: 'coping-deep', kind: 'rail', pts: [[x1, z0 + i, h], [x1, z1 - i, h]] },
    { id: 'coping-shallow', kind: 'rail', pts: [[x0, z0 + i, h], [x0, z1 - i, h]] },
  ];
}
// Grindable lines, a skate park's rails in [x, z, h] (physics/skate.mjs park frame).
export const PIPE_Y = .34;
export const SEWER_PARK = Object.freeze({
  id: 'sewer', name: 'THE SEWERS',
  rails: [
    { id: 'pipe-north', kind: 'rail', pts: [[22.4, -4, PIPE_Y], [33.6, -4, PIPE_Y]] },
    { id: 'pipe-south', kind: 'rail', pts: [[22.4, -1, PIPE_Y], [33.6, -1, PIPE_Y]] },
    { id: 'shrine-ledge', kind: 'ledge', pts: [[39, -4.2, .2], [43, -4.2, .2]] },
    ...copingRails(),
  ],
  gaps: [], letters: [], goals: [], tape: null,
});
export const CHESTS = Object.freeze({
  K1: { room: 'S1', at: [12, 0, 2.2], holds: 'small' },
  BOARD: { room: 'S2', at: [18.6, 0, -1], holds: 'board' },
});
// The bowl's battery cell sits in a little cage on the deck; it opens when the Rat King is freed.
export const CELLS = Object.freeze({ 'sewer-bowl': { room: 'S5', at: [57.2, .08, -7.3], boss: true } });
// The way in and out: arrive at the foot of the ladder; the exit ladder in the bowl climbs back up.
export const ARRIVE = Object.freeze({ at: [-.8, 0, -1.9], yaw: Math.PI / 2 });
export const LADDERS = Object.freeze({ in: [-1.85, 0, -1.9], out: [57.6, 0, 2.2] });
export const RAT_KING = Object.freeze({ at: [53.4, -1, -2.5], cage: [56.85, 57.55, -7.65, -6.95] });
// Where a fall into the sewage washes you back to: the near ledge of each channel.
export const WASH_BACK = Object.freeze({ S1: [8, 0, -1.9], S3: [21.4, 0, -2.5], S5: [47.8, 0, -2.5] });
// Combo needed at the trick shrine, by difficulty.
export const SHRINE = Object.freeze({ room: 'S4', kid: 2, bigKid: 4 });
export const SEWER_BOUNDS = Object.freeze([SEWER.anchor[0] - 2.5, SEWER.anchor[2] - 8.5, SEWER.anchor[0] + 58.5, SEWER.anchor[2] + 3.5]);

export function roomAt([x, , z]) { return ROOMS.find(r => x >= r.x[0] && x <= r.x[1] && z >= r.z[0] && z <= r.z[1])?.id ?? null; }
export const DOORS = Object.freeze({ A: { kind: 'small' }, C: { kind: 'combo' } });
export const SEWER_DUNGEON = Object.freeze({
  start: 'S0', boss: 'S5',
  rooms: ROOMS.map(r => ({ id: r.id, links: OPENINGS.filter(o => o.a === r.id || o.b === r.id).map(o => ({ to: o.a === r.id ? o.b : o.a, door: o.door })) })),
  doors: DOORS, chests: Object.fromEntries(Object.entries(CHESTS).map(([k, c]) => [k, { room: c.room, holds: c.holds }])), plates: {},
});
export const createSewerState = () => createDungeon(SEWER_DUNGEON);

const inBox = (x, z, [x0, x1, z0, z1]) => x > x0 + 1e-6 && x < x1 - 1e-6 && z > z0 + 1e-6 && z < z1 - 1e-6;
export const inChannel = ([x, , z]) => CHANNELS.some(c => inBox(x, z, c.box));

/** Collision and shell triangles, local frame: { a, b, c, surface }. */
export function buildSewer() {
  const out = [];
  const quad = (p, q, r, s, surface) => { out.push({ a: p, b: q, c: r, surface }, { a: p, b: r, c: s, surface }); };
  const both = (p, q, r, s, surface) => { quad(p, q, r, s, surface); quad(q, p, s, r, surface); };
  // Floor of a rect at height y, facing up, minus any channel inside it (split into strips).
  const floor = (x0, x1, z0, z1, y, surface) => quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], surface);
  for (const r of ROOMS) {
    const [x0, x1] = r.x, [z0, z1] = r.z, H = r.ceiling ?? SEWER.ceiling;
    // Walkway floor, cut around channels: rows of x-intervals x z-intervals not inside a channel.
    const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
    const cuts = [...CHANNELS.filter(c => c.room === r.id).map(c => c.box), ...(r.id === BOWL.room ? [BOWL.box] : [])];
    for (const c of cuts) { xs.add(c[0]); xs.add(c[1]); zs.add(c[2]); zs.add(c[3]); }
    const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
    for (let i = 1; i < X.length; i++) for (let j = 1; j < Z.length; j++) {
      const cx = (X[i - 1] + X[i]) / 2, cz = (Z[j - 1] + Z[j]) / 2;
      if (!cuts.some(c => inBox(cx, cz, c))) floor(X[i - 1], X[i], Z[j - 1], Z[j], 0, 'concrete');
    }
    quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], 'concrete');   // ceiling, facing down
    const gapsOn = (axis, at) => OPENINGS.filter(o => (o.a === r.id || o.b === r.id) && o.wall === axis && Math.abs(o.at - at) < 1e-6).map(o => o.span);
    const wall = (ax, az, bx, bz, gaps) => {
      const along = ax === bx ? 'z' : 'x', lo = along === 'z' ? Math.min(az, bz) : Math.min(ax, bx), hi = along === 'z' ? Math.max(az, bz) : Math.max(ax, bx);
      const cuts = gaps.filter(g => g[1] > lo && g[0] < hi).sort((a, b) => a[0] - b[0]); let at = lo; const pieces = [];
      for (const [g0, g1] of cuts) { if (g0 > at) pieces.push([at, g0]); at = Math.max(at, g1); }
      if (at < hi) pieces.push([at, hi]);
      // Walls run from the pit floor up, so a channel's ends are walled too.
      for (const [p, q] of pieces) { const P = (t, y) => along === 'z' ? [ax, y, t] : [t, y, az]; both(P(p, SEWER.pit), P(q, SEWER.pit), P(q, H), P(p, H), 'brick'); }
    };
    wall(x0, z0, x0, z1, gapsOn('x', x0)); wall(x1, z0, x1, z1, gapsOn('x', x1));
    wall(x0, z0, x1, z0, gapsOn('z', z0)); wall(x0, z1, x1, z1, gapsOn('z', z1));
    // A doorway into a lower room is bricked up above that room's ceiling (no hole to the sky).
    for (const o of OPENINGS.filter(o => o.a === r.id || o.b === r.id)) {
      const other = ROOMS.find(q => q.id === (o.a === r.id ? o.b : o.a)), low = Math.min(H, other.ceiling ?? SEWER.ceiling);
      if (low >= H) continue;
      const [p, q] = o.span, P = (t, y) => o.wall === 'x' ? [o.at, y, t] : [t, y, o.at];
      both(P(p, low), P(q, low), P(q, H), P(p, H), 'brick');
    }
  }
  // Channels: a pit floor (the sewage sits above it) and side walls up to the walkway.
  for (const c of CHANNELS) {
    const [x0, x1, z0, z1] = c.box, y = SEWER.pit;
    quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], 'sewage');
    both([x0, y, z0], [x1, y, z0], [x1, 0, z0], [x0, 0, z0], 'brick'); both([x0, y, z1], [x1, y, z1], [x1, 0, z1], [x0, 0, z1], 'brick');
    both([x0, y, z0], [x0, y, z1], [x0, 0, z1], [x0, 0, z0], 'brick'); both([x1, y, z0], [x1, y, z1], [x1, 0, z1], [x1, 0, z0], 'brick');
  }
  // The bowl: a heightfield in cells, facing up like the floors.
  { const [x0, x1, z0, z1] = BOWL.box, nx = Math.round((x1 - x0) / BOWL.cell), nz = Math.round((z1 - z0) / BOWL.cell);
    const P = (i, j) => { const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz; return [x, bowlFloor(x, z), z]; };
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), 'concrete'); }
  for (const f of FEATURES) out.push(...boxTris(f.box, f.surface));
  for (const k of KICKERS) { const [x0, x1, z0, z1, h] = k.box; quad([x0, 0, z0], [x0, 0, z1], [x1, h, z1], [x1, h, z0], 'concrete'); both([x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0], 'concrete'); }
  return out;
}

/** Each shut door as a solid panel, gated `sewer:<id>` (open with world.openGate). */
export function sewerDoorTris(open = new Set()) {
  const out = [];
  for (const o of OPENINGS) if (o.door && !open.has(o.door)) {
    const [s0, s1] = o.span, H = SEWER.ceiling, b = o.wall === 'x' ? [o.at - .06, o.at + .06, s0, s1, 0, H] : [s0, s1, o.at - .06, o.at + .06, 0, H];
    out.push(...boxTris(b, 'metal').map(t => ({ ...t, gate: `sewer:${o.door}` })));
  }
  return out;
}

export function sewerWorldTris() {
  return [...buildSewer(), ...sewerDoorTris()].map(t => ({ a: sewerWorld(t.a), b: sewerWorld(t.b), c: sewerWorld(t.c), surface: t.surface, gate: t.gate ?? null }));
}
