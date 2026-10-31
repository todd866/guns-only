import {NY_BOUNDS} from './under-bridge.mjs';
import {roadWidth, segmentDistance, inside} from './geometry.mjs';
import {inEventArea} from './catalog.mjs';
import {SCENERY_BOUNDS} from './district-zones.mjs';
import {PLAZA_BOUNDS} from './town-plaza.mjs';
import {PLAYGROUND_BOUNDS} from './playground.mjs';
import {SKATESTREET_BOUNDS} from './skatestreet.mjs';
import {HANGAR, hangarWorld} from './skate-hangar.mjs';
import {BOARDWALK_BOUNDS} from './boardwalk.mjs';
// The skate hangar's floor: no scrub grows through it. Not a terrain clip (see stream.mjs).
const HANGAR_BOUNDS = (() => {
  const c = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([x, z]) => hangarWorld([x * (HANGAR.length / 2 + 3), 0, z * (HANGAR.width / 2 + 3)]));
  return [
    Math.min(...c.map(p => p[0])),
    Math.min(...c.map(p => p[2])),
    Math.max(...c.map(p => p[0])),
    Math.max(...c.map(p => p[2]))
  ];
})();

// Sparse planting in the graded verge, never in a roadway, apron, building,
// authored district or event clearing. A fixed tile budget bounds streaming cost.
export function roadsideDetail(tile, bounds, residentialBounds = null, extraBounds = null) {
  const out = [],
    excluded = [
      ...SCENERY_BOUNDS,
      PLAZA_BOUNDS,
      PLAYGROUND_BOUNDS,
      SKATESTREET_BOUNDS,
      BOARDWALK_BOUNDS,
      NY_BOUNDS,
      ...(residentialBounds ? [residentialBounds] : []),
      ...(extraBounds ? [extraBounds] : [])
    ];
  const safe = (x, z) => {
    if (x < bounds[0] || x >= bounds[2] || z < bounds[1] || z >= bounds[3] || inEventArea(x, z, 24))
      return false;
    if (excluded.some(b => x > b[0] - 3 && x < b[2] + 3 && z > b[1] - 3 && z < b[3] + 3)) return false;
    for (const f of tile.features) {
      const p = f.properties,
        g = f.geometry;
      if (g.type === 'LineString' && (p.highway || p.aeroway))
        for (let i = 1; i < g.coordinates.length; i++)
          if (segmentDistance(x, z, g.coordinates[i - 1], g.coordinates[i]) < roadWidth(p) / 2 + 2.5)
            return false;
      if (
        g.type === 'Polygon' &&
        (p.building || p.aeroway || p.amenity === 'parking') &&
        inside(x, z, g.coordinates[0])
      )
        return false;
    }
    return true;
  };
  for (const f of tile.features) {
    if (
      !f.properties.highway ||
      ['path', 'footway', 'track'].includes(f.properties.highway) ||
      f.geometry.type !== 'LineString'
    )
      continue;
    const pts = f.geometry.coordinates,
      w = roadWidth(f.properties);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz);
      if (len < 12) continue;
      for (let d = 12; d < len; d += 32)
        for (const side of [-1, 1]) {
          const x = a[0] + (dx * d) / len - (dz / len) * (w / 2 + 4.5) * side,
            z = a[1] + (dz * d) / len + (dx / len) * (w / 2 + 4.5) * side;
          if (safe(x, z)) {
            out.push({x, z, size: 0.45 + (((Math.floor(x * 3 + z * 7) % 7) + 7) % 7) * 0.035});
            if (out.length >= 48) return out;
          }
        }
    }
  }
  return out;
}

// Open-desert scrub and stones on bare sand between features. A 4 m occupancy raster of the
// tile's roads (plus a 3 m margin) and every polygon keeps planting out of roadways, aprons,
// lots and buildings; a jittered 9 m grid with a fixed budget bounds the streaming cost.
const hash = (x, z) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export function desertScatter(tile, bounds, residentialBounds = null, limit = 460, extraBounds = null) {
  const cell = 4,
    n = Math.ceil((bounds[2] - bounds[0]) / cell),
    blocked = new Uint8Array(n * n),
    excluded = [
      ...SCENERY_BOUNDS,
      PLAZA_BOUNDS,
      PLAYGROUND_BOUNDS,
      SKATESTREET_BOUNDS,
      HANGAR_BOUNDS,
      BOARDWALK_BOUNDS,
      NY_BOUNDS,
      ...(residentialBounds ? [residentialBounds] : []),
      ...(extraBounds ? [extraBounds] : [])
    ];
  const mark = (x, z) => {
    const i = Math.floor((x - bounds[0]) / cell),
      j = Math.floor((z - bounds[1]) / cell);
    if (i >= 0 && j >= 0 && i < n && j < n) blocked[j * n + i] = 1;
  };
  for (const f of tile.features) {
    const p = f.properties,
      g = f.geometry;
    if (g.type === 'LineString' && (p.highway || p.aeroway || p.railway)) {
      const r = roadWidth(p) / 2 + 3;
      for (let k = 1; k < g.coordinates.length; k++) {
        const a = g.coordinates[k - 1],
          b = g.coordinates[k],
          len = Math.hypot(b[0] - a[0], b[1] - a[1]),
          steps = Math.ceil(len / 2);
        for (let s = 0; s <= steps; s++) {
          const x = a[0] + ((b[0] - a[0]) * s) / steps,
            z = a[1] + ((b[1] - a[1]) * s) / steps;
          for (let dx = -r; dx <= r; dx += cell / 2)
            for (let dz = -r; dz <= r; dz += cell / 2) if (dx * dx + dz * dz <= r * r) mark(x + dx, z + dz);
        }
      }
    }
    if (g.type === 'Polygon') {
      const ring = g.coordinates[0];
      let x0 = Infinity,
        z0 = Infinity,
        x1 = -Infinity,
        z1 = -Infinity;
      for (const [x, z] of ring) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x);
        z1 = Math.max(z1, z);
      }
      for (let x = Math.max(bounds[0], x0 - 4); x <= Math.min(bounds[2], x1 + 4); x += cell)
        for (let z = Math.max(bounds[1], z0 - 4); z <= Math.min(bounds[3], z1 + 4); z += cell)
          if (inside(x, z, ring) || inside(x + cell / 2, z + cell / 2, ring)) mark(x, z);
    }
  }
  const out = [],
    step = 9;
  for (let gz = bounds[1]; gz < bounds[3]; gz += step)
    for (let gx = bounds[0]; gx < bounds[2]; gx += step) {
      const r = hash(gx, gz),
        x = gx + hash(gx + 7, gz) * step,
        z = gz + hash(gx, gz + 11) * step;
      if (r > 0.48 || x >= bounds[2] || z >= bounds[3]) continue;
      const i = Math.floor((x - bounds[0]) / cell),
        j = Math.floor((z - bounds[1]) / cell);
      if (blocked[j * n + i]) continue;
      if (
        excluded.some(b => x > b[0] - 6 && x < b[2] + 6 && z > b[1] - 6 && z < b[3] + 6) ||
        inEventArea(x, z, 24)
      )
        continue;
      out.push({x, z, size: 0.45 + hash(gx + 3, gz + 5) ** 2 * 1.25, stone: r > 0.39});
      if (out.length >= limit) return out;
    }
  return out;
}
