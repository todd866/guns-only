// Shared anonymous height authority for the residential district. The public
// grid is a small local metre-space raster; no geographic labels or source
// metadata are part of the runtime contract.

const finite = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = t => t * t * (3 - 2 * t);

export function validateResidentialTerrain(grid) {
  if (!grid || !Array.isArray(grid.origin) || grid.origin.length !== 2 || !grid.origin.every(finite)) throw new TypeError('terrain origin must be [x,z]');
  if (!finite(grid.step) || grid.step <= 0) throw new RangeError('terrain step must be positive');
  if (!Number.isInteger(grid.cols) || grid.cols < 2 || !Number.isInteger(grid.rows) || grid.rows < 2) throw new RangeError('terrain grid must have at least 2×2 samples');
  if (!Array.isArray(grid.heights) || grid.heights.length !== grid.cols * grid.rows || !grid.heights.every(finite)) throw new RangeError('terrain heights must be row-major and complete');
  return grid;
}

const rectDistance = (x, z, bounds) => {
  const [minX, minZ, maxX, maxZ] = bounds;
  return Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));
};

export function boundsOfPoints(points) {
  const valid = (points || []).filter(p => Array.isArray(p) && finite(p[0]) && finite(p[1]));
  if (!valid.length) return null;
  return [Math.min(...valid.map(p => p[0])), Math.min(...valid.map(p => p[1])), Math.max(...valid.map(p => p[0])), Math.max(...valid.map(p => p[1]))];
}

export function createResidentialTerrain(grid, options = {}) {
  validateResidentialTerrain(grid);
  const [ox, oz] = grid.origin, step = grid.step;
  const sourceBounds = [ox, oz, ox + step * (grid.cols - 1), oz + step * (grid.rows - 1)];
  const bounds = options.bounds?.length === 4 ? [...options.bounds] : sourceBounds;
  const edgeFeather = Math.max(0, Number(options.edgeFeather ?? 128));
  const pads = (options.pads || []).filter(p => Array.isArray(p?.bounds) && p.bounds.length === 4)
    .map(p => ({ bounds: [...p.bounds], datum: finite(p.datum) ? p.datum : 0, feather: Math.max(0, Number(p.feather ?? 25)) }));
  const raw = (x, z) => {
    const gx = clamp((x - ox) / step, 0, grid.cols - 1), gz = clamp((z - oz) / step, 0, grid.rows - 1);
    const x0 = Math.min(grid.cols - 2, Math.floor(gx)), z0 = Math.min(grid.rows - 2, Math.floor(gz));
    const tx = gx - x0, tz = gz - z0, at = (cx, rz) => grid.heights[rz * grid.cols + cx];
    return (at(x0, z0) * (1 - tx) + at(x0 + 1, z0) * tx) * (1 - tz) + (at(x0, z0 + 1) * (1 - tx) + at(x0 + 1, z0 + 1) * tx) * tz;
  };
  const edgeWeight = (x, z) => {
    if (!edgeFeather) return x >= bounds[0] && x <= bounds[2] && z >= bounds[1] && z <= bounds[3] ? 1 : 0;
    const distance = Math.min(x - bounds[0], bounds[2] - x, z - bounds[1], bounds[3] - z);
    return smoothstep(clamp(distance / edgeFeather, 0, 1));
  };
  const graded = (x, z) => {
    if (!finite(x) || !finite(z)) return 0;
    let y = raw(x, z) * edgeWeight(x, z);
    for (const pad of pads) {
      const d = rectDistance(x, z, pad.bounds), weight = d <= 0 ? 1 : 1 - smoothstep(clamp(d / (pad.feather || 1), 0, 1));
      y = y * (1 - weight) + pad.datum * weight;
    }
    return y;
  };
  // The query and rendered/collision mesh use exactly the same diagonals.
  // Sampling a separate bilinear surface lets wheels sink between mesh vertices.
  const meshStep = Math.max(1, Math.min(step, Number(options.meshStep ?? 8)));
  const cols = Math.ceil((bounds[2] - bounds[0]) / meshStep), rows = Math.ceil((bounds[3] - bounds[1]) / meshStep);
  const sx = (bounds[2] - bounds[0]) / cols, sz = (bounds[3] - bounds[1]) / rows;
  const vertices = Array.from({length: (cols + 1) * (rows + 1)}, (_, i) => {
    const x = bounds[0] + i % (cols + 1) * sx, z = bounds[1] + Math.floor(i / (cols + 1)) * sz;
    return [x, graded(x, z), z];
  });
  const at = (x, z) => vertices[z * (cols + 1) + x];
  // Holes: whole mesh cells left open for an authored sunken surface (the schoolyard pool)
  // that fills them itself. Rectangles snap outward to cell edges.
  const holeCells = new Set(), holes = [];
  for (const [x0, z0, x1, z1] of options.holes || []) {
    const c0 = Math.max(0, Math.floor((x0 - bounds[0]) / sx)), c1 = Math.min(cols - 1, Math.ceil((x1 - bounds[0]) / sx) - 1);
    const r0 = Math.max(0, Math.floor((z0 - bounds[1]) / sz)), r1 = Math.min(rows - 1, Math.ceil((z1 - bounds[1]) / sz) - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) holeCells.add(r * cols + c);
    holes.push([bounds[0] + c0 * sx, bounds[1] + r0 * sz, bounds[0] + (c1 + 1) * sx, bounds[1] + (r1 + 1) * sz]);
  }
  const holed = (col, row) => holeCells.has(row * cols + col);
  const heightAt = (x, z) => {
    if (!finite(x) || !finite(z) || x < bounds[0] || x > bounds[2] || z < bounds[1] || z > bounds[3]) return 0;
    const gx = (x - bounds[0]) / sx, gz = (z - bounds[1]) / sz;
    const ix = Math.min(cols - 1, Math.floor(gx)), iz = Math.min(rows - 1, Math.floor(gz)), tx = gx - ix, tz = gz - iz;
    const a = at(ix, iz)[1], b = at(ix + 1, iz)[1], c = at(ix + 1, iz + 1)[1], d = at(ix, iz + 1)[1];
    return tx >= tz ? a + (b - a) * tx + (c - b) * tz : a + (c - d) * tx + (d - a) * tz;
  };
  // Intersect an authored triangle with the exact terrain triangles beneath it.
  // The returned vertices retain the authored Y offset through barycentric
  // interpolation, while their base follows the same diagonal surface used by
  // heightAt and the collision mesh. This prevents narrow roads and lawns from
  // crossing through the terrain between their source vertices.
  const conformTriangle = (a, b, c) => {
    if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(c)) return [];
    const input = [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]];
    // Authored links can cross the district edge. Keep that whole source face
    // intact there; edge feathering makes its sampled heights meet the datum.
    if (!input.every(p => p[0] >= bounds[0] && p[0] <= bounds[2] && p[1] >= bounds[1] && p[1] <= bounds[3])) {
      return [[[a[0], a[1] + heightAt(a[0], a[2]), a[2]], [b[0], b[1] + heightAt(b[0], b[2]), b[2]], [c[0], c[1] + heightAt(c[0], c[2]), c[2]]]];
    }
    const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const sign = orient(input[0], input[1], input[2]) >= 0 ? 1 : -1;
    const inside = (p, q, r) => sign * orient(p, q, r) >= -1e-8;
    const clipHalfPlane = (polygon, p, q) => {
      const out = [];
      for (let i = 0; i < polygon.length; i++) {
        const u = polygon[i], v = polygon[(i + 1) % polygon.length], iu = inside(u, p, q), iv = inside(v, p, q);
        if (iu) out.push(u);
        if (iu !== iv) {
          const du = orient(p, q, u), dv = orient(p, q, v), t = du / (du - dv);
          out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]);
        }
      }
      return out;
    };
    const minX = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - bounds[0]) / sx));
    const maxX = Math.min(cols - 1, Math.floor((Math.max(a[0], b[0], c[0]) - bounds[0]) / sx));
    const minZ = Math.max(0, Math.floor((Math.min(a[2], b[2], c[2]) - bounds[1]) / sz));
    const maxZ = Math.min(rows - 1, Math.floor((Math.max(a[2], b[2], c[2]) - bounds[1]) / sz));
    const out = [], yAt = p => {
      const area = orient(input[0], input[1], input[2]);
      if (Math.abs(area) < 1e-9) return (a[1] + b[1] + c[1]) / 3 + heightAt(p[0], p[1]);
      const wa = orient(input[1], input[2], p) / area, wb = orient(input[2], input[0], p) / area, wc = 1 - wa - wb;
      return wa * a[1] + wb * b[1] + wc * c[1] + heightAt(p[0], p[1]);
    };
    const add = polygon => {
      for (let i = 1; i < polygon.length - 1; i++) {
        const p = polygon[0], q = polygon[i], r = polygon[i + 1], tri = [[p[0], yAt(p), p[1]], [q[0], yAt(q), q[1]], [r[0], yAt(r), r[1]]];
        const area = orient([tri[0][0], tri[0][2]], [tri[1][0], tri[1][2]], [tri[2][0], tri[2][2]]);
        if (Math.abs(area) < 1e-9) continue;
        // Physics uses the X/Z winding that produces a positive Y normal.
        if (area > 0) [tri[1], tri[2]] = [tri[2], tri[1]];
        out.push(tri);
      }
    };
    let skipped = false;
    for (let row = minZ; row <= maxZ; row++) for (let col = minX; col <= maxX; col++) {
      if (holed(col, row)) { skipped = true; continue; }
      const x = bounds[0] + col * sx, z = bounds[1] + row * sz;
      for (const cell of [[[x, z], [x + sx, z], [x + sx, z + sz]], [[x, z], [x + sx, z + sz], [x, z + sz]]]) {
        let polygon = cell;
        for (let i = 0; i < 3 && polygon.length; i++) polygon = clipHalfPlane(polygon, input[i], input[(i + 1) % 3]);
        if (polygon.length >= 3) add(polygon);
      }
    }
    if (!out.length && skipped) return [];
    return out.length ? out : [[[a[0], a[1] + heightAt(a[0], a[2]), a[2]], [b[0], b[1] + heightAt(b[0], b[2]), b[2]], [c[0], c[1] + heightAt(c[0], c[2]), c[2]]]];
  };
  const triangles = () => {
    const out = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      if (holed(col, row)) continue;
      const a = at(col, row), b = at(col + 1, row), c = at(col + 1, row + 1), d = at(col, row + 1);
      out.push([a, c, b], [a, d, c]);
    }
    return out;
  };
  return Object.freeze({ sourceBounds, bounds, pads, holes, heightAt, rawHeightAt: raw, triangles, conformTriangle });
}
