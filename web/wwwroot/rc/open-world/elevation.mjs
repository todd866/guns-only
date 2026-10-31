// Same diagonal and interpolation for the rendered floor and wheel collision.
import {mountainHeight, MOUNTAIN_BOUNDS} from './spirit-mountain.mjs';
const smoothstep = t => t * t * (3 - 2 * t);
// Spirit Mountain is added on top of the playable terrain, inside the grid or beyond it.
export function elevationAt(data, x, z, site = null) {
  if (!data) return 0;
  return gridAt(data, x, z, site) + mountainHeight(x, z);
}
// Mountain tiles are sampled every 4 m so the road's shelf and hairpins are crisp; 16 m elsewhere.
// The finer grid lies exactly on the coarse one's triangles, so the seams between them never crack.
export const terrainStep = b =>
  b[0] < MOUNTAIN_BOUNDS[2] &&
  b[2] > MOUNTAIN_BOUNDS[0] &&
  b[1] < MOUNTAIN_BOUNDS[3] &&
  b[3] > MOUNTAIN_BOUNDS[1]
    ? 4
    : 16;
function gridAt(data, x, z, site) {
  const {step, origin, width, height, values} = data,
    u = (x - origin[0]) / step,
    v = (z - origin[1]) / step,
    i = Math.floor(u),
    j = Math.floor(v);
  if (i < 0 || j < 0 || i >= width - 1 || j >= height - 1) return 0;
  const a = u - i,
    b = v - j,
    k = j * width + i,
    h = values[k],
    east = values[k + 1],
    south = values[k + width],
    se = values[k + width + 1];
  let y =
    a + b <= 1 ? h + (east - h) * a + (south - h) * b : se + (south - se) * (1 - a) + (east - se) * (1 - b);
  const pad = site?.pad;
  if (pad) {
    const d = Math.min(x - pad.bounds[0], pad.bounds[2] - x, z - pad.bounds[1], pad.bounds[3] - z);
    const w = d >= 0 ? 1 : smoothstep(Math.max(0, Math.min(1, 1 + d / (pad.feather || 1))));
    y = y * (1 - w) + pad.datum * w;
  }
  return y;
}
export function groundTriangles(data, bounds, step = 16, site = null) {
  const out = [];
  for (let z = bounds[1]; z < bounds[3]; z += step)
    for (let x = bounds[0]; x < bounds[2]; x += step) {
      const P = (a, b) => [a, elevationAt(data, a, b, site), b],
        a = P(x, z),
        b = P(x + step, z),
        c = P(x, z + step),
        d = P(x + step, z + step);
      out.push([a, c, b], [b, c, d]);
    }
  return out;
}
