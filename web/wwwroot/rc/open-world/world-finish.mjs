import {roadVerges} from './road-verges.mjs';
import {buildingInfo, inside, roadWidth} from './geometry.mjs';
import {FRONTAGES} from './building-frontages.mjs';
// Geometry-only silhouettes on solid source buildings. Authored venues and the
// four purpose-built frontage anchors retain their existing architecture.
export function roofProfile(feature, bounds) {
  if (FRONTAGES[feature.id] || feature.properties.building === 'roof') return [];
  const info = feature.properties.building && feature.geometry.type === 'Polygon' && buildingInfo(feature);
  if (!info) return [];
  const {ring, cx, cz, h, area} = info;
  if (area < 90 || cx < bounds[0] || cx >= bounds[2] || cz < bounds[1] || cz >= bounds[3]) return [];
  let edge = null;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      b = ring[i],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!edge || len > edge.len) edge = {a, b, len};
  }
  if (!edge || edge.len < 6) return [];
  const ux = (edge.b[0] - edge.a[0]) / edge.len,
    uz = (edge.b[1] - edge.a[1]) / edge.len,
    vx = -uz,
    vz = ux;
  const projected = ring.map(p => [(p[0] - cx) * ux + (p[1] - cz) * uz, (p[0] - cx) * vx + (p[1] - cz) * vz]);
  let w = Math.min(
      38,
      (Math.max(...projected.map(p => p[0])) - Math.min(...projected.map(p => p[0]))) * 0.82
    ),
    d = Math.min(24, (Math.max(...projected.map(p => p[1])) - Math.min(...projected.map(p => p[1]))) * 0.72);
  const P = (x, y, z) => [cx + ux * x + vx * z, y, cz + uz * x + vz * z];
  // A safe inset rectangle has its centre inside and no source boundary
  // crossing its interior. This excludes even narrow concave roof notches.
  const cutsRectangle = (a, b) => {
    let lo = 0,
      hi = 1;
    for (let axis = 0; axis < 2; axis++) {
      const half = (axis ? d : w) / 2,
        delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-9) {
        if (a[axis] < -half || a[axis] > half) return false;
      } else {
        let t0 = (-half - a[axis]) / delta,
          t1 = (half - a[axis]) / delta;
        if (t0 > t1) [t0, t1] = [t1, t0];
        lo = Math.max(lo, t0);
        hi = Math.min(hi, t1);
        if (lo > hi) return false;
      }
    }
    return true;
  };
  const fits = () =>
    inside(cx, cz, ring) && !projected.some((a, i) => i > 0 && cutsRectangle(projected[i - 1], a));
  for (let i = 0; i < 5 && !fits(); i++) {
    w *= 0.65;
    d *= 0.65;
  }
  if (w < 4 || d < 3 || !fits()) return [];
  const faces = [],
    tri = (kind, a, b, c, shade = 1) => faces.push({kind, points: [P(...a), P(...b), P(...c)], shade});
  const quad = (kind, a, b, c, d, shade) => {
    tri(kind, a, b, c, shade);
    tri(kind, a, c, d, shade);
  };
  const box = (x, z, bw, bd, height, kind = 'roof', shade = 1, base = h) => {
    const a = x - bw / 2,
      b = x + bw / 2,
      c = z - bd / 2,
      e = z + bd / 2,
      y = base + height;
    quad(kind, [a, base, c], [a, y, c], [b, y, c], [b, base, c], shade);
    quad(kind, [b, base, e], [b, y, e], [a, y, e], [a, base, e], shade);
    quad(kind, [a, base, e], [a, y, e], [a, y, c], [a, base, c], shade);
    quad(kind, [b, base, c], [b, y, c], [b, y, e], [b, base, e], shade);
    quad(kind, [a, y, c], [a, y, e], [b, y, e], [b, y, c], shade);
  };
  const hash = Number(feature.id.replace(/\D/g, '')) || 0,
    style = feature.properties.building === 'hangar' ? 1 : hash % 3;
  if (style === 0) {
    const rise = Math.min(1.6, d * 0.16),
      y = h + 0.08;
    quad('roof', [-w / 2, y, -d / 2], [-w / 2, y + rise, 0], [w / 2, y + rise, 0], [w / 2, y, -d / 2], 0.86);
    quad('roof', [w / 2, y, d / 2], [w / 2, y + rise, 0], [-w / 2, y + rise, 0], [-w / 2, y, d / 2], 1.02);
    tri('trim', [-w / 2, y, d / 2], [-w / 2, y + rise, 0], [-w / 2, y, -d / 2], 0.9);
    tri('trim', [w / 2, y, -d / 2], [w / 2, y + rise, 0], [w / 2, y, d / 2], 0.9);
  } else if (style === 1) {
    // Raised service/clerestory ridge, distinct from the low pitched roofs.
    box(0, 0, w * 0.68, d * 0.35, 1.1, 'glass', 0.85);
    box(0, 0, w * 0.72, d * 0.39, 0.18, 'trim', 0.92, h + 1.1);
  } else {
    // Stepped plant housings read as a service roof, not another habitable floor.
    box(-w * 0.22, 0, w * 0.28, d * 0.4, 0.65, 'glass', 0.82);
    box(w * 0.2, 0, w * 0.25, d * 0.4, 1.15, 'roof', 0.85);
    box(w * 0.2, 0, w * 0.27, d * 0.42, 0.1, 'trim', 0.9, h + 1.15);
  }
  return faces;
}
// Use the same all-segment clearance checks as reflectors, but prioritise
// wider roads so the bounded lights serve through routes instead of back lots.
export function roadLamps(tile, bounds, residentialBounds = null) {
  const features = [...tile.features].sort(
    (a, b) =>
      (b.properties.highway ? roadWidth(b.properties) : 0) -
      (a.properties.highway ? roadWidth(a.properties) : 0)
  );
  const markers = roadVerges({...tile, features}, bounds, residentialBounds, false).markers,
    lamps = [];
  for (const p of markers) {
    if (lamps.every(q => Math.hypot(q.x - p.x, q.z - p.z) > 60)) lamps.push(p);
    if (lamps.length === 4) break;
  }
  return lamps;
}
export function litWindow(id, bay, floor) {
  return ((Number(String(id).replace(/\D/g, '')) || 0) + bay * 3 + floor * 2) % 5 === 0;
}
