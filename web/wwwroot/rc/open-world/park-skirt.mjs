// Skirts under an authored park slab (owner, 31 Oct: the car ended up under the terrain at the
// neighbourhood skatepark). The park's concrete is a baked slab at its own level on rolling ground
// (which is the point: rolling ground reads real), so in places the grass dips under its edge and a
// car can roll off a low edge into the gap beneath the slab. Every outer edge of the park's riding
// surface gets a solid wall from the edge down `depth`, facing out, so you can drop off an edge but
// never get under. An edge counts as outer when there is no park surface just beyond it (inner
// edges, like a bowl's lip, have park below them and are left alone).
export const SKIRT = Object.freeze({up: 0.3, depth: 1.5, probe: 0.08});

const key = p => p.map(v => Math.round(v * 1000)).join(',');

/** parkWorld: the park's own collision (createWorld). Returns quads [a, b, c, d] facing outward. */
export function perimeterSkirts(parkWorld, {up = SKIRT.up, depth = SKIRT.depth, probe = SKIRT.probe} = {}) {
  const edges = new Map();
  for (const t of parkWorld.tris) {
    if (t.n[1] < up) continue;
    const v = [t.a, t.b, t.c],
      centre = [(t.a[0] + t.b[0] + t.c[0]) / 3, (t.a[2] + t.b[2] + t.c[2]) / 3];
    for (let i = 0; i < 3; i++) {
      const a = v[i],
        b = v[(i + 1) % 3],
        k = [key(a), key(b)].sort().join('|');
      const e = edges.get(k);
      if (e) e.count++;
      else edges.set(k, {a, b, centre, count: 1});
    }
  }
  const quads = [];
  for (const {a, b, centre, count} of edges.values()) {
    if (count > 1) continue;
    const dx = b[0] - a[0],
      dz = b[2] - a[2],
      len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    let nx = -dz / len,
      nz = dx / len;
    const mx = (a[0] + b[0]) / 2,
      mz = (a[2] + b[2]) / 2;
    if ((mx - centre[0]) * nx + (mz - centre[1]) * nz < 0) {
      nx = -nx;
      nz = -nz;
    } // point away from the surface
    const top = Math.max(a[1], b[1]) + 1,
      beyond = parkWorld.raycast(
        [mx + nx * probe, top, mz + nz * probe],
        [0, -1, 0],
        top - Math.min(a[1], b[1]) + depth
      );
    if (beyond) continue; // park surface just past this edge: an inner edge
    const lowA = [a[0], a[1] - depth, a[2]],
      lowB = [b[0], b[1] - depth, b[2]];
    // Counter-clockwise seen from outside: the face normal must point along (nx, nz).
    const quad = [a, lowA, lowB, b],
      e1 = [lowA[0] - a[0], lowA[1] - a[1], lowA[2] - a[2]],
      e2 = [lowB[0] - a[0], lowB[1] - a[1], lowB[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    quads.push(n[0] * nx + n[2] * nz >= 0 ? quad : [a, b, lowB, lowA]);
  }
  return quads;
}
