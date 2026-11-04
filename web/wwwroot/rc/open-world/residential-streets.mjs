import {rolledKerbProfile} from './residential-kerbs.mjs';

// Continuous road strips share their kerb shape with collision. Junction cuts
// use actual road footprints, including T joins inside a long source segment.
export const STREET_WIDTHS = Object.freeze({
  primary: 8,
  secondary: 8,
  tertiary: 8,
  service: 5,
  path: 2.2,
  footway: 2.2,
  cycleway: 2.2
});
const pathKind = kind => /foot|path|walk|cycle/i.test(kind || '');
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clean = points =>
  points
    .filter(p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite))
    .reduce((out, p) => {
      if (!out.length || distance(out.at(-1), p) > 1e-6) out.push(p.slice(0, 2));
      return out;
    }, []);
const direction = (a, b) => {
  const d = distance(a, b);
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
};
const normal = t => [-t[1], t[0]];
const signed = (a, b, p) => (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);
const area = poly =>
  poly.reduce((sum, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return sum + p[0] * q[2] - q[0] * p[2];
  }, 0) / 2;
const upward = q => (area(q) > 0 ? q.slice().reverse() : q);
export const streetSurfaceBounds = q =>
  q.reduce(
    (b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[2]), Math.max(b[2], p[0]), Math.max(b[3], p[2])],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

function joins(points) {
  return points.map((p, i) => {
    if (!i) return normal(direction(p, points[1]));
    if (i === points.length - 1) return normal(direction(points[i - 1], p));
    const a = normal(direction(points[i - 1], p)),
      b = normal(direction(p, points[i + 1]));
    const length = Math.hypot(a[0] + b[0], a[1] + b[1]);
    if (length < 1e-6) return b;
    const n = [(a[0] + b[0]) / length, (a[1] + b[1]) / length];
    const scale = Math.min(1.75, 1 / Math.max(0.001, n[0] * b[0] + n[1] * b[1]));
    return n.map(v => v * scale);
  });
}
function strip(road, left, right, leftY = 0, rightY = 0) {
  const station = (i, offset, y) => [
    road.points[i][0] + road.joins[i][0] * offset,
    y,
    road.points[i][1] + road.joins[i][1] * offset
  ];
  return road.points
    .slice(1)
    .map((_, j) =>
      upward([
        station(j, left, leftY),
        station(j + 1, left, leftY),
        station(j + 1, right, rightY),
        station(j, right, rightY)
      ])
    );
}
function halfPlane(poly, a, b, sign, inside) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length],
      dp = signed(a, b, p) * sign,
      dq = signed(a, b, q) * sign;
    const pin = inside ? dp >= -1e-8 : dp <= 1e-8,
      qin = inside ? dq >= -1e-8 : dq <= 1e-8;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = dp / (dp - dq);
      out.push(p.map((v, k) => v + (q[k] - v) * t));
    }
  }
  return out;
}
// Disjoint convex pieces outside a road polygon; interpolate the Y offsets at
// every cut so rendering and wheel contact keep the same rolled cross-section.
function subtract(poly, clip) {
  let remaining = poly;
  const out = [],
    sign = Math.sign(area(clip));
  for (let i = 0; i < clip.length && remaining.length >= 3; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length],
      piece = halfPlane(remaining, a, b, sign, false);
    if (piece.length >= 3 && Math.abs(area(piece)) > 1e-7) out.push(piece);
    remaining = halfPlane(remaining, a, b, sign, true);
  }
  return out;
}
const cells = b => {
  const out = [];
  for (let x = Math.floor(b[0] / 32); x <= Math.floor(b[2] / 32); x++)
    for (let z = Math.floor(b[1] / 32); z <= Math.floor(b[3] / 32); z++) out.push(`${x},${z}`);
  return out;
};

export function buildResidentialStreetSurfaces(input = [], options = {}) {
  const roads = input
    .map((r, index) => ({points: clean(r.points || []), kind: r.kind, index}))
    .filter(r => r.points.length > 1);
  const surfaces = [],
    junctions = [],
    index = new Map();
  for (const road of roads) {
    road.path = pathKind(road.kind);
    road.width = STREET_WIDTHS[road.kind] ?? (road.path ? 2.2 : (options.defaultRoadWidth ?? 5.8));
    road.joins = joins(road.points);
    const material = road.path ? 'path' : 'asphalt',
      y = road.path ? 0.018 : 0.025;
    for (const quad of strip(road, road.width / 2, -road.width / 2, y, y))
      surfaces.push({quad, material, collision: material, roadIndex: road.index});
    if (road.path) continue;
    for (const quad of strip(road, road.width / 2 + 0.15, -road.width / 2 - 0.15)) {
      const entry = {quad, roadIndex: road.index, bounds: streetSurfaceBounds(quad)};
      for (const cell of cells(entry.bounds)) {
        if (!index.has(cell)) index.set(cell, []);
        index.get(cell).push(entry);
      }
    }
  }
  // Mapped pedestrian links often cross a road. Their paving ends at the
  // asphalt edge; overlapping millimetre-separated ribbons flicker from RC height.
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surface = surfaces[i];
    if (surface.material !== 'path') continue;
    const bounds = streetSurfaceBounds(surface.quad),
      candidates = [...new Set(cells(bounds).flatMap(c => index.get(c) || []))].filter(e =>
        overlaps(e.bounds, bounds)
      );
    if (!candidates.length) continue;
    let pieces = [
      [surface.quad[0], surface.quad[1], surface.quad[2]],
      [surface.quad[0], surface.quad[2], surface.quad[3]]
    ];
    for (const other of candidates) pieces = pieces.flatMap(p => subtract(p, other.quad));
    const replacement = [];
    for (const poly of pieces)
      for (let n = 1; n < poly.length - 1; n++)
        if (Math.abs(area([poly[0], poly[n], poly[n + 1]])) > 1e-7)
          replacement.push({...surface, quad: upward([poly[0], poly[n], poly[n + 1], poly[n + 1]])});
    surfaces.splice(i, 1, ...replacement);
  }
  if (options.kerbs !== false)
    for (const road of roads) {
      if (road.path) continue;
      const profile = rolledKerbProfile({
        roadWidth: road.width,
        ...Object.fromEntries(
          ['rise', 'slope', 'sidewalk'].filter(k => options[k] != null).map(k => [k, options[k]])
        )
      });
      for (const side of [-1, 1])
        for (let i = 1; i < profile.length; i++) {
          const a = profile[i - 1],
            b = profile[i];
          for (const quad of strip(road, a.offset * side, b.offset * side, a.y, b.y)) {
            const bounds = streetSurfaceBounds(quad),
              candidates = [...new Set(cells(bounds).flatMap(c => index.get(c) || []))].filter(
                e => e.roadIndex !== road.index && overlaps(e.bounds, bounds)
              );
            let pieces = candidates.length
              ? [
                  [quad[0], quad[1], quad[2]],
                  [quad[0], quad[2], quad[3]]
                ]
              : [quad];
            for (const other of candidates) pieces = pieces.flatMap(p => subtract(p, other.quad));
            if (candidates.length)
              junctions.push({
                point: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
                degree: candidates.length,
                roadIndex: road.index
              });
            for (const poly of pieces) {
              const emit = q =>
                surfaces.push({
                  quad: upward(q),
                  material: 'sidewalk',
                  collision: 'kerb',
                  roadIndex: road.index
                });
              if (poly.length === 4) emit(poly);
              else
                for (let n = 1; n < poly.length - 1; n++)
                  if (Math.abs(area([poly[0], poly[n], poly[n + 1]])) > 1e-7)
                    emit([poly[0], poly[n], poly[n + 1], poly[n + 1]]);
            }
          }
        }
    }
  if (options.yAt)
    for (const surface of surfaces)
      surface.quad = surface.quad.map(p => [p[0], p[1] + options.yAt(p[0], p[2]), p[2]]);
  return {surfaces, junctions};
}
