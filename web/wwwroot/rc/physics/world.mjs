// Triangle collision world: uniform XZ grid, segment raycast and sphere contacts.
// Triangles are one-sided by winding (counter-clockwise seen from outside = outward normal).
import {sub, cross, dot, norm, scale, add, len} from './math.mjs';

// Surface response multipliers. grip scales tyre friction; roll is rolling drag per newton of load.
export const SURFACES = {
  // Fictional shallow splash-pad response; safe at RC scale, no buoyancy or drowning.
  // Authored quarter pipes use the normal concrete tyre response plus a play assist.
  // Rolling drag is zero: a held throttle was stalling halfway up the bowl once
  // spring load climbed. Pump, not friction, changes speed on these surfaces.
  // Rolling drag is zero: a held throttle was stalling halfway up the bowl once
  // spring load climbed. Pump, not friction, changes speed on these surfaces.
  quarter: {grip: 1.0, roll: 0},
  bowl: {grip: 1.0, roll: 0},
  vert: {grip: 1.0, roll: 0},
  hip: {grip: 1.0, roll: 0},
  snow: {grip: 0.68, roll: 0.08},
  ice: {grip: 0.38, roll: 0.015},
  water: {grip: 0.65, roll: 0.18},
  // The Sewers (open-world/sewer.mjs): brick walls, and the slime in the channels you get washed out of.
  brick: {grip: 0.95, roll: 0.03},
  sewage: {grip: 0.5, roll: 0.2},
  asphalt: {grip: 1.0, roll: 0.02},
  concrete: {grip: 1.0, roll: 0.02},
  wood: {grip: 0.95, roll: 0.025},
  metal: {grip: 0.8, roll: 0.02},
  tile: {grip: 0.72, roll: 0.02},
  gymfloor: {grip: 0.55, roll: 0.015},
  gravel: {grip: 0.78, roll: 0.07},
  carpet: {grip: 0.9, roll: 0.07},
  rubber: {grip: 1.0, roll: 0.03, bounce: 2.2},
  grass: {grip: 0.72, roll: 0.09},
  turf: {grip: 0.85, roll: 0.05}, // mown fairway and green (country club)
  dirt: {grip: 0.8, roll: 0.06},
  rock: {grip: 0.85, roll: 0.04}, // Spirit Mountain's steep faces
  // Rolled kerbs soften initial damping but retain enough bump damping for the
  // narrow chassis to land without a yawing hull strike.
  kerb: {grip: 1.0, roll: 0.02, damper: 0.55, bumpDamper: 0.65},
  // Playground: rubber softfall is grippy and a little soft, sand drags, slide plastic is slick.
  softfall: {grip: 1.0, roll: 0.035, damper: 1.15},
  sand: {grip: 0.7, roll: 0.16},
  slide: {grip: 0.8, roll: 0.008}
};

// Riding these is intentional even near vertical: not a wall strike (car.mjs), and
// quarter-return.mjs gives each an arcade response.
export const TRANSITION_SURFACES = new Set(['quarter', 'bowl', 'vert', 'hip']);

const SEAM_BLEND = 0.18;
function distToSeg(p, a, b) {
  const ab = sub(b, a),
    denom = dot(ab, ab) || 1e-12,
    t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / denom));
  return len(sub(p, add(a, scale(ab, t))));
}
// At a shared edge, both faces report the same averaged normal, so a flat deck
// meeting a transition does not kick. A few centimetres away the face normal returns.
function contactNormal(t, point) {
  if (!t.seams?.length) return t.n;
  let n = t.n;
  for (const s of t.seams) {
    const w = 1 - distToSeg(point, s.a, s.b) / SEAM_BLEND;
    if (w <= 0) continue;
    n = norm(add(scale(n, 1 - w), scale(s.avg, w)));
  }
  return len(n) > 0.5 ? n : t.n;
}
// Average collision normals across edges where a transition meets another face.
// Safe to call again after more triangles are inserted; only the transition
// neighbourhood is walked, so a streamed world can reseal as districts arrive.
export function sealTransitionNormals(world) {
  const tris = world?.tris;
  if (!tris?.length) return;
  for (const t of tris) t.seams = null;
  const key = v => `${Math.round(v[0] * 512)},${Math.round(v[1] * 512)},${Math.round(v[2] * 512)}`;
  const hot = new Set(),
    verts = new Set();
  tris.forEach((t, i) => {
    if (!TRANSITION_SURFACES.has(t.surface)) return;
    hot.add(i);
    verts.add(key(t.a));
    verts.add(key(t.b));
    verts.add(key(t.c));
  });
  if (!hot.size) return;
  tris.forEach((t, i) => {
    if (!hot.has(i) && (verts.has(key(t.a)) || verts.has(key(t.b)) || verts.has(key(t.c)))) hot.add(i);
  });
  const edges = new Map();
  const addEdge = (a, b, i) => {
    const ka = key(a),
      kb = key(b),
      k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    let e = edges.get(k);
    if (!e) edges.set(k, (e = {a, b, ids: []}));
    e.ids.push(i);
  };
  for (const i of hot) {
    const t = tris[i];
    addEdge(t.a, t.b, i);
    addEdge(t.b, t.c, i);
    addEdge(t.c, t.a, i);
  }
  for (const e of edges.values()) {
    const ids = [...new Set(e.ids)];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const A = tris[ids[i]],
          B = tris[ids[j]];
        if (!TRANSITION_SURFACES.has(A.surface) && !TRANSITION_SURFACES.has(B.surface)) continue;
        if (dot(A.n, B.n) > 0.992) continue;
        const avg = norm(add(A.n, B.n));
        if (len(avg) < 0.5) continue;
        (A.seams ??= []).push({a: e.a, b: e.b, avg});
        (B.seams ??= []).push({a: e.a, b: e.b, avg});
      }
  }
}

export function createWorld(cell = 4) {
  const tris = [],
    grid = new Map();
  let stamp = 0;
  const key = (ix, iz) => (ix * 73856093) ^ (iz * 19349663);
  function cellsOf(minX, minZ, maxX, maxZ, fn) {
    for (let ix = Math.floor(minX / cell); ix <= Math.floor(maxX / cell); ix++)
      for (let iz = Math.floor(minZ / cell); iz <= Math.floor(maxZ / cell); iz++) fn(key(ix, iz));
  }
  // Vertices are immutable after insertion: both the grid and bounds cache depend on them.
  // `gate` names a door: its triangles stop colliding once openGate(gate) is called.
  const openGates = new Set();
  function addTri(a, b, c, surface = 'concrete', gate = null) {
    const e1 = sub(b, a),
      e2 = sub(c, a),
      n = norm(cross(e1, e2));
    if (len(n) === 0) return;
    const minX = Math.min(a[0], b[0], c[0]),
      minZ = Math.min(a[2], b[2], c[2]),
      maxX = Math.max(a[0], b[0], c[0]),
      maxZ = Math.max(a[2], b[2], c[2]);
    const t = {a, b, c, e1, e2, n, surface, minX, minZ, maxX, maxZ, seen: 0, gate};
    tris.push(t);
    cellsOf(minX, minZ, maxX, maxZ, k => {
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(t);
    });
  }
  // Quad a,b,c,d in counter-clockwise order seen from the outward side.
  const addQuad = (a, b, c, d, s) => {
    addTri(a, b, c, s);
    addTri(a, c, d, s);
  };
  function query(minX, minZ, maxX, maxZ, fn) {
    stamp++;
    cellsOf(minX, minZ, maxX, maxZ, k => {
      const list = grid.get(k);
      if (!list) return;
      for (const t of list)
        if (t.seen !== stamp) {
          t.seen = stamp;
          // A 16 m world cell can contain thousands of small authored faces.
          // Reject disjoint XZ bounds before allocating narrow-phase vectors.
          // Keep candidate order and inclusive edges; the exact solver is unchanged.
          if (t.maxX + 1e-9 < minX || t.minX - 1e-9 > maxX || t.maxZ + 1e-9 < minZ || t.minZ - 1e-9 > maxZ)
            continue;
          fn(t);
        }
    });
  }
  // Nearest hit along origin + dir*t, t in [0,maxDist]. Only faces whose outward side faces the ray hit.
  function raycast(origin, dir, maxDist) {
    const end = add(origin, scale(dir, maxDist));
    let best = null;
    query(
      Math.min(origin[0], end[0]),
      Math.min(origin[2], end[2]),
      Math.max(origin[0], end[0]),
      Math.max(origin[2], end[2]),
      t => {
        if (dot(t.n, dir) >= 0 || (t.gate && openGates.has(t.gate))) return;
        const p = cross(dir, t.e2),
          det = dot(t.e1, p);
        if (Math.abs(det) < 1e-12) return;
        const inv = 1 / det,
          s = sub(origin, t.a),
          u = dot(s, p) * inv;
        if (u < 0 || u > 1) return;
        const q = cross(s, t.e1),
          v = dot(dir, q) * inv;
        if (v < 0 || u + v > 1) return;
        const dist = dot(t.e2, q) * inv;
        if (dist < 0 || dist > maxDist || (best && dist >= best.dist)) return;
        const point = add(origin, scale(dir, dist));
        best = {dist, point, normal: contactNormal(t, point), face: t.n, surface: t.surface};
      }
    );
    return best;
  }
  // Contacts of a sphere against the world. A centre slightly behind a face (within r) still
  // pushes out along that face's normal, so fast thin-wall hits resolve to the side they came from.
  function sphereContacts(c, r, out = []) {
    query(c[0] - r, c[2] - r, c[0] + r, c[2] + r, t => {
      if (t.gate && openGates.has(t.gate)) return;
      const planeDist = dot(sub(c, t.a), t.n);
      if (planeDist < -r || planeDist > r) return;
      const cp = closestOnTri(c, t),
        d = sub(c, cp),
        dl = len(d);
      if (planeDist < 0) {
        // Behind the face: only count it if the projection lands inside the triangle.
        const proj = sub(c, scale(t.n, planeDist));
        if (len(sub(closestOnTri(proj, t), proj)) > 1e-6) return;
        out.push({point: cp, normal: t.n, depth: r - planeDist, surface: t.surface});
      } else if (dl < r) {
        const geom = dl > 1e-9 ? scale(d, 1 / dl) : t.n;
        // The seam blend is a raycast shade so the two faces agree at the edge.
        // Using it as a hull normal turns a flat triangle into a phantom wall and
        // launches the car. Push out along the face the sphere actually touches.
        out.push({point: cp, normal: geom, depth: r - dl, surface: t.surface});
      }
    });
    return out;
  }
  return {
    tris,
    addTri,
    addQuad,
    raycast,
    sphereContacts,
    openGate: id => openGates.add(id),
    closeGate: id => openGates.delete(id)
  };
}

// Ericson, Real-Time Collision Detection 5.1.5.
function closestOnTri(p, t) {
  const {a, b, c} = t,
    ab = t.e1,
    ac = t.e2,
    ap = sub(p, a);
  const d1 = dot(ab, ap),
    d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b),
    d3 = dot(ab, bp),
    d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
  const cpv = sub(p, c),
    d5 = dot(ab, cpv),
    d6 = dot(ac, cpv);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return add(b, scale(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}

// Axis-aligned closed box, outward faces. Bottom face is included when it is off the ground.
export function addBox(world, cx, cz, w, d, minY, maxY, surface = 'concrete') {
  const x0 = cx - w / 2,
    x1 = cx + w / 2,
    z0 = cz - d / 2,
    z1 = cz + d / 2;
  const P = (x, y, z) => [x, y, z];
  world.addQuad(P(x0, maxY, z0), P(x0, maxY, z1), P(x1, maxY, z1), P(x1, maxY, z0), surface); // top
  world.addQuad(P(x0, minY, z1), P(x1, minY, z1), P(x1, maxY, z1), P(x0, maxY, z1), surface); // +z
  world.addQuad(P(x1, minY, z0), P(x0, minY, z0), P(x0, maxY, z0), P(x1, maxY, z0), surface); // −z
  world.addQuad(P(x1, minY, z1), P(x1, minY, z0), P(x1, maxY, z0), P(x1, maxY, z1), surface); // +x
  world.addQuad(P(x0, minY, z0), P(x0, minY, z1), P(x0, maxY, z1), P(x0, maxY, z0), surface); // −x
  if (minY > 0.001)
    world.addQuad(P(x0, minY, z0), P(x1, minY, z0), P(x1, minY, z1), P(x0, minY, z1), surface); // bottom
}
