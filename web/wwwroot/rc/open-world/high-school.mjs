// The high school by the neighbourhood skatepark (owner, 31 Oct: based on his old high school; "I
// wanna be able to drive in and out of it. Don't label it"). The outline is the real mapped one
// (residential.json, kind 'school' with a courtyard); this file opens doors in it and lays out the
// inside: a long locker hall along the front, the open courtyard, a gym, a cafeteria, a library in
// the west block and the pool in the turned north-east wing. Unnamed everywhere in the game.
//
// Plan frame (u, v) in metres from the building's centroid: +u along the front street toward the
// east end, +v away from it (north). The mapped outline sits on this frame to 7 cm.
export const HS = Object.freeze({ origin: [-3223.01, -723.16], turn: -.5 * Math.PI / 180, ceiling: 3.4, door: 3.2, doorTop: 2.7 });
const C = Math.cos(HS.turn), S = Math.sin(HS.turn);
/** Plan [u, v] -> game [x, z]. */
export const toGame = ([u, v]) => [HS.origin[0] + u * C - v * S, HS.origin[1] - (u * S + v * C)];
export const toPlan = ([x, z]) => { const dx = x - HS.origin[0], dz = -(z - HS.origin[1]); return [dx * C + dz * S, -dx * S + dz * C]; };

// Doors: where you drive in and out, by plan centre; each opens the outline edge nearest it.
export const DOORS = Object.freeze([
  { id: 'front', at: [-8.3, -54.1], ring: 0 },        // the long front on the street
  { id: 'east', at: [49, 33], ring: 0, whole: true },  // the blue double doors at the east jog
  { id: 'pool', at: [62.5, 62.3], ring: 0 },           // the pool's own door, used by public swimmers
  { id: 'north', at: [-42, 29.8], ring: 0 },           // to the north parking lot
  { id: 'court-n', at: [-30.9, -5], ring: 1 },         // into the open courtyard from the gym side
  { id: 'court-s', at: [-39.2, -22.8], ring: 1 },      // and from the locker hall
]);

/**
 * Which stretch of which outline edge each door opens: { [ring]: { [edge]: [[t0, t1], ...] } } with
 * t the fraction along the edge from its first point. rings are game [x, z] rings (outline, holes).
 */
export function doorSpans(rings) {
  const out = {};
  for (const d of DOORS) {
    const ring = rings[d.ring]; if (!ring) continue;
    const [px, pz] = toGame(d.at); let best = null;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (len * len))), dist = Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz);
      if (!best || dist < best.dist) best = { i, t, len, dist };
    }
    if (!best) continue;
    const w = d.whole ? best.len - .2 : Math.min(HS.door, best.len - .6), half = w / 2 / best.len, t = d.whole ? .5 : Math.max(half + .1 / best.len, Math.min(1 - half - .1 / best.len, best.t));
    ((out[d.ring] ??= {})[best.i] ??= []).push([t - half, t + half]);
  }
  return out;
}
/** The solid pieces of an edge [0, 1] once its door spans are cut out. */
export function solidPieces(spans = []) {
  const pieces = []; let at = 0;
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) { if (a > at) pieces.push([at, a]); at = Math.max(at, b); }
  if (at < 1) pieces.push([at, 1]);
  return pieces;
}

// Inside, in plan metres. Rooms are open areas, not a maze: free-standing furniture makes the lanes.
export const ROOMS = Object.freeze({
  gym: { box: [-40, 0, 4, 28], floor: 'maple' },                 // u0, u1, v0, v1
  cafeteria: { box: [2, 30, -24, 0], floor: 'tile' },
  library: { box: [-62, -50, 10.5, 19.5], floor: 'carpet' },
});
// Partition walls with their gaps (plan segments [[u0, v0], [u1, v1]], gaps as [from, to] metres along).
export const WALLS = Object.freeze([
  { a: [-40, 4], b: [0, 4], gaps: [[6, 14]] },           // gym south wall, open toward the courtyard door
  { a: [0, 4], b: [0, 28], gaps: [[6, 13]] },            // gym east wall, open toward the pool hall
  { a: [-40, 4], b: [-40, 28], gaps: [[8, 14]] },        // gym west wall, open toward the library
]);
// Banks of lockers, back to back, in the front hall: [u0, u1, v], 1.8 m tall.
export const LOCKERS = Object.freeze([[-86, -66, -45], [-60, -40, -45], [-34, -14, -45], [-4, 16, -45], [-86, -60, -36], [-30, -12, -36], [6, 24, -36]]);
// Cafeteria tables (long folding tables you drive under): [u, v, length along u].
export const TABLES = Object.freeze([[8, -20, 6], [8, -14, 6], [8, -8, 6], [20, -20, 6], [20, -14, 6], [20, -8, 6]]);
// Library shelves: [u, v0, v1], 1.6 m tall.
export const SHELVES = Object.freeze([[-60, 11.5, 18.5], [-56.5, 11.5, 18.5], [-53, 11.5, 18.5]]);
// The pool hall is on the turned wing: the basin is centred here and turned with the wing.
export const POOL = Object.freeze({ at: [40, 50], yaw: -61 * Math.PI / 180, length: 25, width: 12, depth: 1.2 });
