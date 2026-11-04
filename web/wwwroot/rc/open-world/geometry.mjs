import {overlapsDistrict} from './district-zones.mjs';
import {inEventArea, LOCATIONS} from './catalog.mjs';
export function inside(x, z, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
export function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
// Runway width fallbacks: docs/research/area51-nellis-osm-layout.md; the extract omits width.
export function roadWidth(p) {
  return (
    Number(p.width) ||
    (p.aeroway === 'runway' ? (p.ref === '03L/21R' ? 61 : 46) : p.aeroway === 'taxiway' ? 17 : 0) ||
    {
      footway: 2,
      path: 2,
      track: 4,
      service: 6,
      residential: 9,
      unclassified: 11,
      secondary: 14,
      tertiary: 12
    }[p.highway] ||
    8
  );
}
export function buildingInfo(feature) {
  if (feature.properties.building === 'no' || overlapsDistrict(feature.bbox)) return null;
  const ring = feature.geometry.coordinates[0],
    b = feature.bbox,
    cx = (b[0] + b[2]) / 2,
    cz = (b[1] + b[3]) / 2;
  if (
    inEventArea(cx, cz, 18) ||
    LOCATIONS.some(
      p => b[2] > p.pos[0] - 32 && b[0] < p.pos[0] + 32 && b[3] > p.pos[2] - 25 && b[1] < p.pos[2] + 12
    )
  )
    return null;
  const p = feature.properties,
    area =
      Math.abs(
        ring.reduce((s, a, i) => {
          const b = ring[(i + 1) % ring.length];
          return s + a[0] * b[1] - b[0] * a[1];
        }, 0)
      ) / 2;
  const h =
    Number(p.height) ||
    Number(p['building:levels']) * 3.2 ||
    (p.building === 'hangar' ? 11 : area > 1800 ? 8 : area > 500 ? 5.5 : 3.3);
  return {ring, h, cx, cz, area};
}
export function surfaceAt(x, z, features) {
  let surface = 'dirt';
  for (const f of features) {
    const b = f.bbox,
      p = f.properties,
      g = f.geometry,
      w = roadWidth(p);
    if (x < b[0] - w || x > b[2] + w || z < b[1] - w || z > b[3] + w) continue;
    if (g.type === 'LineString' && (p.highway || p.aeroway === 'runway' || p.aeroway === 'taxiway')) {
      for (let i = 1; i < g.coordinates.length; i++)
        if (segmentDistance(x, z, g.coordinates[i - 1], g.coordinates[i]) <= w / 2)
          return p.aeroway ? 'concrete' : p.highway === 'path' || p.highway === 'track' ? 'dirt' : 'asphalt';
    }
    if (g.type === 'Polygon' && inside(x, z, g.coordinates[0])) {
      if (p.aeroway === 'apron') return 'concrete';
      if (p.leisure || p.landuse === 'grass') surface = 'grass';
    }
  }
  return surface;
}
// Clockwise XZ wall winding, with optional reverse face for roof-only OSM structures.
export function addBuildingCollision(world, info, open = false) {
  const {ring, h} = info,
    area = ring.reduce((s, a, i) => {
      const b = ring[(i + 1) % ring.length];
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0);
  const pts = area < 0 ? ring : [...ring].reverse();
  if (open) return;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i];
    world.addQuad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], h, b[1]], [a[0], h, a[1]]);
  }
}
