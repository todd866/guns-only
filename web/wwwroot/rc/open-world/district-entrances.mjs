// Local-space doorway cuts for the authored district shells.  The source GLBs stay
// standalone; callers apply this to collision and visual triangles while composing
// them into the open world.

export const DISTRICT_ENTRANCES = Object.freeze(
  [
    {
      id: 'housing',
      bounds: [-108, -80, 108, 80],
      entrance: [3, 80],
      corridor: [0, 6, 43, 82],
      doorbox: [0, -0.5, 43, 6, 3, 82]
    },
    {
      id: 'bx',
      bounds: [-52.3, -33.3, 52.3, 43.3],
      entrance: [3, 43.3],
      corridor: [0, 6, 38, 45],
      doorbox: [0, -0.5, 38, 6, 3, 45]
    },
    {
      id: 'school',
      bounds: [-54.06, -74.3, 30.06, 46.06],
      entrance: [10.9, 46.06],
      corridor: [7.9, 13.9, -9, 48],
      doorbox: [7.9, -0.5, -9, 13.9, 3, 48]
    }
  ].map(Object.freeze)
);

export const DISTRICTS = DISTRICT_ENTRANCES;

const EPS = 1e-9;
const lerpVertex = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Clip a polygon against one axis-aligned half-plane. Vertices are complete
// attribute arrays beginning with XYZ, so generated boundaries retain attributes.
function halfPlane(poly, axis, limit, keepGreater) {
  if (!poly.length) return [];
  const inside = v => (keepGreater ? v[axis] >= limit - EPS : v[axis] <= limit + EPS);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      ia = inside(a),
      ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      out.push(lerpVertex(a, b, t));
    }
  }
  return out;
}
function clipBox(poly, box) {
  let p = poly;
  p = halfPlane(p, 0, box[0], true);
  p = halfPlane(p, 0, box[2], false);
  p = halfPlane(p, 2, box[1], true);
  p = halfPlane(p, 2, box[3], false);
  return p;
}
function outsideDoor(poly, box) {
  // A convex polygon minus a rectangle is the disjoint union of these four
  // strips. The side strips span the full Z range; top/bottom are restricted to
  // the door's X span, avoiding overlap between returned polygons.
  const pieces = [
    [halfPlane(poly, 0, box[0], false)],
    [halfPlane(poly, 0, box[2], true)],
    [halfPlane(halfPlane(halfPlane(poly, 0, box[0], true), 0, box[2], false), 2, box[1], false)],
    [halfPlane(halfPlane(halfPlane(poly, 0, box[0], true), 0, box[2], false), 2, box[3], true)]
  ];
  return pieces.map(([p]) => p).filter(p => p.length >= 3);
}
function triangulate(poly, out) {
  for (let i = 1; i + 1 < poly.length; i++) {
    const t = [poly[0], poly[i], poly[i + 1]];
    const ux = t[1][0] - t[0][0],
      uy = t[1][1] - t[0][1],
      uz = t[1][2] - t[0][2];
    const vx = t[2][0] - t[0][0],
      vy = t[2][1] - t[0][1],
      vz = t[2][2] - t[0][2];
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area2 > EPS) out.push(t);
  }
}

/** Subtract an axis-aligned XYZ box from one triangle. */
export function subtractBox(vertices, box) {
  if (
    !Array.isArray(vertices) ||
    vertices.length < 3 ||
    vertices.some(v => !Array.isArray(v) || v.length < 3)
  )
    return [];
  if (!Array.isArray(box) || box.length !== 6)
    throw new TypeError('box must be [minX,minY,minZ,maxX,maxY,maxZ]');
  const [xmin, ymin, zmin, xmax, ymax, zmax] = box;
  let base = vertices.slice();
  // Disjoint slabs: after the X slabs, Y slabs are restricted to X inside the
  // box; Z slabs are restricted to X and Y inside it. This avoids duplicates.
  const pieces = [halfPlane(base, 0, xmin, false), halfPlane(base, 0, xmax, true)];
  base = halfPlane(halfPlane(base, 0, xmin, true), 0, xmax, false);
  pieces.push(halfPlane(base, 1, ymin, false), halfPlane(base, 1, ymax, true));
  base = halfPlane(halfPlane(base, 1, ymin, true), 1, ymax, false);
  pieces.push(halfPlane(base, 2, zmin, false), halfPlane(base, 2, zmax, true));
  const out = [];
  pieces.filter(p => p.length >= 3).forEach(p => triangulate(p, out));
  return out;
}

/** Clip one XYZ(+numeric attributes) triangle to a district shell.
 * `district` may be an id or the metadata object. Returned triangles preserve
 * the input winding and interpolate all vertex components at new boundaries.
 */
export function clipDistrictTriangle(id, vertices) {
  if (
    !Array.isArray(vertices) ||
    vertices.length !== 3 ||
    vertices.some(v => !Array.isArray(v) || v.length < 3)
  )
    return [];
  const district = typeof id === 'string' ? DISTRICT_ENTRANCES.find(d => d.id === id) : id;
  if (!district) throw new RangeError(`unknown district: ${id}`);
  const [xmin, zmin, xmax, zmax] = district.bounds;
  let poly = vertices.slice();
  poly = halfPlane(poly, 0, xmin, true);
  poly = halfPlane(poly, 0, xmax, false);
  poly = halfPlane(poly, 2, zmin, true);
  poly = halfPlane(poly, 2, zmax, false);
  if (poly.length < 3) return [];
  // Ground sheets remain continuous through the entrance. This criterion is
  // deliberately conservative: every vertex must be near floor level.
  const ux = vertices[1][0] - vertices[0][0],
    uy = vertices[1][1] - vertices[0][1],
    uz = vertices[1][2] - vertices[0][2];
  const vx = vertices[2][0] - vertices[0][0],
    vy = vertices[2][1] - vertices[0][1],
    vz = vertices[2][2] - vertices[0][2];
  const ny = uz * vx - ux * vz;
  const nx = uy * vz - uz * vy,
    nz = ux * vy - uy * vx;
  const ground = vertices.every(v => v[1] <= 0.2 + EPS) && Math.abs(ny) >= 0.7 * Math.hypot(nx, ny, nz);
  const pieces = ground ? [poly] : subtractBox(poly, district.doorbox);
  const out = [];
  pieces.forEach(p => triangulate(p, out));
  return out;
}

export default DISTRICT_ENTRANCES;
