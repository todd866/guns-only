// Jets you can drive on (owner, 31 Oct: "jumps that get you onto the wings of a big jet... I don't
// want it to just be scenery"). A jet's upward-facing skin becomes solid ground, and a wooden ramp
// runs up to a wing's edge: ride up, cross the wing, fly off the far edge. Drawn by jet-decks.js.
//
// Ramp Rat: a B-52 parked in the infield, its wings over both straights. On the eastbound straight
// the south half of the lane ramps up onto the wing (the north half stays flat), so it's a choice.
// The petting zoo: ramps onto the Su-27's and MiG-29's wings from behind (their noses face the
// visitors). Positions are world [x, z]; each ramp's edge is found by raycast against the deck.

export const DECK = Object.freeze({up: 0.55, minY: 1, slope: 0.25, lip: 0.4, surface: 'metal'});

export const JET_DECKS = Object.freeze([
  {
    id: 'ramp-rat-b52',
    type: 'B-52',
    at: [620, -2],
    yaw: Math.PI / 2,
    ramps: [{along: 'x', dir: 1, line: -21.2, width: 4.2, search: [560, 680]}]
  }
]);
// Zoo ramps run south (+z) from behind the jets onto a wing's trailing edge. Not the MiG-23: its
// wings swing, and a deck can't move under you.
export const ZOO_RAMPS = Object.freeze([
  {type: 'Su-27', along: 'z', dir: 1, line: -1323 + 2.5, width: 2.6},
  {type: 'MiG-29', along: 'z', dir: 1, line: -1349 + 2.0, width: 2.2}
]);

/** Upward-facing triangles above minY from a list of world [a, b, c]: the drivable skin. */
export function deckTris(tris, {up = DECK.up, minY = DECK.minY} = {}) {
  const out = [];
  for (const [a, b, c] of tris) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]],
      l = Math.hypot(...n);
    if (!l || n[1] / l < up || (a[1] + b[1] + c[1]) / 3 < minY) continue;
    out.push([a, b, c]);
  }
  return out;
}

/**
 * A ramp up to an edge. edge = the first point along the line where the deck starts ([x, z]),
 * top = its height there; dir = +1/-1 along the axis. Returns the top quad (counter-clockwise
 * from above) and its length: slope DECK.slope, ending `lip` m inside the edge.
 */
export function rampQuad({along, dir, width}, edge, top, ground = 0) {
  const length = (top - ground) / DECK.slope,
    half = width / 2;
  const P = (s, c, y) => (along === 'x' ? [edge[0] + s, y, edge[1] + c] : [edge[0] + c, y, edge[1] + s]);
  const s0 = -dir * length,
    s1 = dir * DECK.lip;
  const quad = [P(s0, -half, ground), P(s0, half, ground), P(s1, half, top), P(s1, -half, top)];
  // Counter-clockwise from above, whichever way the ramp points.
  const [a, b, c] = quad,
    ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  return {quad: ny > 0 ? quad : [quad[0], quad[3], quad[2], quad[1]], length};
}
