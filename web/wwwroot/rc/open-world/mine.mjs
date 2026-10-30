// The Old Silver Mine: the first dungeon of the adventure (docs/design/adventure), modelled on the
// Nelson / Techatticup workings: timbered adits, mine-cart rails, ore chutes. Built at toy scale
// around a ~30 cm robot: rooms are caverns to it. Local frame: +x east, +z south, floor at y = 0;
// placed in the world by MINE.anchor and MINE.yaw.
//
// Plan (north is -z):            R6 cell
//                                R5 boss  (big-key door B)
//              R4 west --P-- R1 hub --A-- R3 north (small-key door A; plate P1 opens P)
//                             R1 -- R2 east (open; chest K1 on a timber stage)
//                             R0 entrance (collapsed timber: crawl under)
import { createDungeon } from '../physics/dungeon.mjs';

// Sited on flat desert east of the Boneyard (ground at -6.7 m there), its footprint cut out of the
// terrain so the mine's own floor is the ground.
export const MINE = Object.freeze({ anchor: [2700, -6.7, 1100], yaw: 0, ceiling: 1.6, wall: .12 });
export const MINE_BOUNDS = Object.freeze([2700 - 9.5, 1100 - 25.5, 2700 + 9.5, 1100 + 6]);

const R = (id, x0, x1, z0, z1, extra = {}) => ({ id, x: [x0, x1], z: [z0, z1], ...extra });
export const ROOMS = Object.freeze([
  R('R0', -1.5, 1.5, 0, 6, { name: 'Adit' }),
  R('R1', -4, 4, -8, 0, { name: 'Hub cavern' }),
  R('R2', 4, 9, -6, -2, { name: 'East gallery' }),
  R('R3', -2, 2, -14, -8, { name: 'Ore chute' }),
  R('R4', -9, -4, -6, -2, { name: 'West stope' }),
  R('R5', -3, 3, -22, -14, { name: 'Excavator hall' }),
  R('R6', -1.5, 1.5, -25, -22, { name: 'Alien cell' }),
]);
// Openings between rooms: on a shared wall, [from, to, axis, at, span, door?]
export const OPENINGS = Object.freeze([
  { a: 'R0', b: 'R1', wall: 'z', at: 0, span: [-1.5, 1.5] },
  { a: 'R1', b: 'R2', wall: 'x', at: 4, span: [-5, -3] },
  { a: 'R1', b: 'R3', wall: 'z', at: -8, span: [-1, 1], door: 'A' },
  { a: 'R1', b: 'R4', wall: 'x', at: -4, span: [-5, -3], door: 'P' },
  { a: 'R3', b: 'R5', wall: 'z', at: -14, span: [-1, 1], door: 'B' },
  { a: 'R5', b: 'R6', wall: 'z', at: -22, span: [-1.5, 1.5] },
]);
// Solid features: [x0, x1, z0, z1, y0, y1, surface]. The entrance beam leaves a 22 cm crawl gap.
export const FEATURES = Object.freeze([
  { name: 'fallen timber', box: [-1.5, 1.5, 2.8, 3.2, .22, .4], surface: 'wood' },
  { name: 'east stage', box: [6, 8.5, -5.5, -2.5, 0, .35], surface: 'wood' },
  { name: 'west step', box: [-8.5, -6.5, -5.5, -2.5, 0, .3], surface: 'wood' },
  { name: 'west top', box: [-8.5, -7.5, -5.5, -2.5, .3, .62], surface: 'wood' },
]);
export const CHESTS = Object.freeze({
  K1: { room: 'R2', at: [7.2, .35, -4], holds: 'small' },
  BK: { room: 'R4', at: [-8, .62, -4], holds: 'big' },
});
export const PLATES = Object.freeze({ P1: { room: 'R3', at: [0, 0, -12] } });
// Bad toys per room (local positions): the hub's pair teaches the fight, then one guard per room.
export const MINE_ENEMIES = Object.freeze([
  { id: 'hub1', room: 'R1', at: [-2, 0, -4.5] }, { id: 'hub2', room: 'R1', at: [2.2, 0, -5.5] },
  { id: 'east', room: 'R2', at: [5.5, 0, -3] }, { id: 'chute', room: 'R3', at: [.8, 0, -11] },
  { id: 'west1', room: 'R4', at: [-5.2, 0, -5] }, { id: 'west2', room: 'R4', at: [-5.6, 0, -2.8] },
]);
// Where a knocked-out robot comes back: each room's doorway from the way in.
export const ROOM_ENTRANCES = Object.freeze({ R0: [0, 0, 5], R1: [0, 0, -.6], R2: [4.6, 0, -4], R3: [0, 0, -8.6], R4: [-4.6, 0, -4], R5: [0, 0, -14.6], R6: [0, 0, -22.4] });
export function roomAt([x, , z]) { return ROOMS.find(r => x >= r.x[0] && x <= r.x[1] && z >= r.z[0] && z <= r.z[1])?.id ?? null; }
export const mineLocal = ([x, y, z]) => { const a = MINE.anchor, c = Math.cos(MINE.yaw), s = Math.sin(MINE.yaw), dx = x - a[0], dz = z - a[2]; return [dx * c - dz * s, y - a[1], dx * s + dz * c]; };

export const DOORS = Object.freeze({ A: { kind: 'small' }, P: { kind: 'plate', plate: 'P1' }, B: { kind: 'big' } });

export const MINE_DUNGEON = Object.freeze({
  start: 'R0', boss: 'R5',
  rooms: ROOMS.map(r => ({ id: r.id, links: OPENINGS.filter(o => o.a === r.id || o.b === r.id).map(o => ({ to: o.a === r.id ? o.b : o.a, door: o.door })) })),
  doors: DOORS, chests: Object.fromEntries(Object.entries(CHESTS).map(([k, c]) => [k, { room: c.room, holds: c.holds }])), plates: Object.fromEntries(Object.entries(PLATES).map(([k, p]) => [k, { room: p.room }])),
});
export const createMineState = () => createDungeon(MINE_DUNGEON);

export const mineWorld = ([x, y, z]) => { const c = Math.cos(MINE.yaw), s = Math.sin(MINE.yaw), a = MINE.anchor; return [a[0] + x * c + z * s, a[1] + y, a[2] - x * s + z * c]; };

// Triangles, local frame: floors, walls with openings, ceilings, features. { a, b, c, surface }.
export function buildMine() {
  const out = [], H = MINE.ceiling;
  const quad = (p, q, r, s, surface) => { out.push({ a: p, b: q, c: r, surface }, { a: p, b: r, c: s, surface }); };
  // A wall plane from (x0,z0) to (x1,z1), facing `n` (its inside), with gaps [from, to] along it.
  const wall = (x0, z0, x1, z1, gaps, surface = 'rock') => {
    const along = x0 === x1 ? 'z' : 'x', lo = along === 'z' ? Math.min(z0, z1) : Math.min(x0, x1), hi = along === 'z' ? Math.max(z0, z1) : Math.max(x0, x1);
    const cuts = gaps.filter(g => g[1] > lo && g[0] < hi).sort((a, b) => a[0] - b[0]);
    let at = lo; const pieces = [];
    for (const [g0, g1] of cuts) { if (g0 > at) pieces.push([at, g0]); at = Math.max(at, g1); }
    if (at < hi) pieces.push([at, hi]);
    for (const [p, q] of pieces) {
      // Two faces, so a wall blocks from either side (the world's raycasts are one-sided).
      const P = t => along === 'z' ? [x0, 0, t] : [t, 0, z0], up = v => [v[0], H, v[2]];
      const a = P(p), b = P(q);
      quad(a, b, up(b), up(a), surface); quad(b, a, up(a), up(b), surface);
    }
  };
  for (const r of ROOMS) {
    const [x0, x1] = r.x, [z0, z1] = r.z;
    quad([x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], 'dirt');            // floor, facing up
    quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], 'rock');            // ceiling, facing down
    const gapsOn = (axis, at) => OPENINGS.filter(o => (o.a === r.id || o.b === r.id) && o.wall === axis && Math.abs(o.at - at) < 1e-6).map(o => o.span);
    wall(x0, z0, x0, z1, gapsOn('x', x0)); wall(x1, z0, x1, z1, gapsOn('x', x1));
    // The adit's south end is the way in.
    wall(x0, z0, x1, z0, gapsOn('z', z0)); if (r.id !== 'R0') wall(x0, z1, x1, z1, gapsOn('z', z1));
  }
  for (const f of FEATURES) out.push(...boxTris(f.box, f.surface));
  return out;
}

export function boxTris([x0, x1, z0, z1, y0, y1], surface) {
  const t = [], q = (p, a, b, c, s = surface) => { t.push({ a: p, b: a, c: b, surface: s }, { a: p, b, c, surface: s }); };
  q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);                    // top
  q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);                    // +z
  q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);                    // -z
  q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);                    // +x
  q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);                    // -x
  if (y0 > .001) q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);     // underside
  return t;
}

/** Collision for each shut door, as a solid panel filling its opening; each carries its door id. */
export function doorTris(open = new Set()) {
  const out = [];
  for (const o of OPENINGS) if (o.door && !open.has(o.door)) {
    const [s0, s1] = o.span, b = o.wall === 'x' ? [o.at - .06, o.at + .06, s0, s1, 0, MINE.ceiling] : [s0, s1, o.at - .06, o.at + .06, 0, MINE.ceiling];
    out.push(...boxTris(b, 'metal').map(t => ({ ...t, gate: `mine:${o.door}` })));
  }
  return out;
}

/** World-frame triangles for the whole mine, doors gated (add once; open with world.openGate). */
export function mineWorldTris() {
  return [...buildMine(), ...doorTris()].map(t => ({ a: mineWorld(t.a), b: mineWorld(t.b), c: mineWorld(t.c), surface: t.surface, gate: t.gate ?? null }));
}
