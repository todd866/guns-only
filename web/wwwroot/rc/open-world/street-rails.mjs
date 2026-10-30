// Grindable edges for free skate on the board (owner, 2026-10-30: "grinding is like half the
// game"). Every road edge is a curb you can ollie onto, and every skate park's rails, ledges and
// copings stay grindable outside a timed run. Built around the player from the streamed tiles.
// Rails come out in the STREET frame of physics/skate.mjs: [x, z, height].
import { roadWidth } from './geometry.mjs';
import { STREET_WIDTHS } from './residential-streets.mjs';

export const STREET_RAILS = Object.freeze({
  radius: 80,        // m around the player
  rebuild: 30,       // m moved before the set is rebuilt
  piece: 4,          // m: curbs follow the ground in pieces this long
  lift: .03,         // m: the curb line sits just above the road edge
  minLength: 1.5,    // m: shorter curb runs are corners, not grinds
  edge: .1,          // m: residential curbs sit this far onto the kerb from the asphalt edge
});
// Roads with a curb worth grinding: paved streets, not tracks, footpaths or runways.
const CURBED = new Set(['residential', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'living_street', 'trunk']);

/**
 * features: the streamed tiles' GeoJSON features. ground(x, z) -> height or null.
 * Returns rails { id, kind: 'ledge', pts: [[x, z, h], ...] } within `radius` of `near`.
 */
export function curbRails(features, near, ground, { radius = STREET_RAILS.radius, skip = null } = {}) {
  const lines = [], seen = new Set();
  for (const f of features) {
    const p = f.properties ?? {}, g = f.geometry;
    if (g?.type !== 'LineString' || !CURBED.has(p.highway)) continue;
    const id = p.osm ?? f.id; if (seen.has(id)) continue; seen.add(id);   // a road appears in every tile it crosses
    lines.push({ id, half: roadWidth(p) / 2, coords: g.coordinates });
  }
  return edgeRails(lines, near, ground, radius, skip);
}

/**
 * The residential district draws its own streets with rolled kerbs (residential-streets.mjs).
 * The roll is smooth, so the edge you can see, and grind, is where the asphalt meets the kerb.
 */
export function residentialCurbRails(roads, near, ground, { radius = STREET_RAILS.radius } = {}) {
  const lines = roads.filter(r => !/foot|path|walk|cycle/i.test(r.kind ?? '')).map((r, i) => ({ id: `res${i}`, half: (STREET_WIDTHS[r.kind] ?? 5.8) / 2 + STREET_RAILS.edge, coords: r.points }));
  return edgeRails(lines, near, ground, radius, null);
}

const inside = (b, x, z) => b && x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];
function edgeRails(lines, near, ground, radius, skip) {
  const out = [], r2 = radius * radius;
  for (const { id, half, coords: c } of lines) {
    for (let i = 1; i < c.length; i++) {
      const [ax, az] = c[i - 1], [bx, bz] = c[i], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < STREET_RAILS.minLength) continue;
      // Skip segments with no point near the player.
      const t = Math.max(0, Math.min(1, ((near[0] - ax) * dx + (near[1] - az) * dz) / (len * len)));
      if ((ax + dx * t - near[0]) ** 2 + (az + dz * t - near[1]) ** 2 > r2) continue;
      if (inside(skip, ax, az) || inside(skip, bx, bz)) continue;   // drawn by the district instead
      const nx = -dz / len, nz = dx / len, n = Math.max(1, Math.ceil(len / STREET_RAILS.piece));
      for (const side of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= n; k++) {
          const x = ax + dx * k / n + nx * half * side, z = az + dz * k / n + nz * half * side, h = ground(x, z);
          if (h == null) { pts.length = 0; break; }
          pts.push([x, z, h + STREET_RAILS.lift]);
        }
        if (pts.length > 1) out.push({ id: `curb:${id}:${i}:${side}`, kind: 'ledge', pts });
      }
    }
  }
  return out;
}

/** A park's rails in the STREET frame. toWorld: park [u, v, h] -> world [x, y, z]. */
export function parkRails(parkId, park, toWorld, near, { radius = STREET_RAILS.radius } = {}) {
  const out = [];
  for (const r of park.rails ?? []) {
    const pts = r.pts.map(p => { const w = toWorld(p); return [w[0], w[2], w[1]]; });
    if (!pts.some(([x, z]) => Math.hypot(x - near[0], z - near[1]) < radius)) continue;
    out.push({ ...r, id: `${parkId}:${r.id}`, key: `${parkId}:${r.id}`, pts });
  }
  return out;
}
