export const MATERIAL_SIZE = 128;
export const SURFACE_NAMES = Object.freeze(['gravel', 'sand', 'asphalt', 'concrete', 'stucco', 'roof']);
const TAU = Math.PI * 2,
  clamp = x => Math.max(0, Math.min(1, x));
const periodic = n => n % (MATERIAL_SIZE - 1);
// Wrapped integer grain avoids the diagonal sine-wave bands that looked like painted roads.
const noise = (x, y, s = 0) => {
  let n =
    Math.imul(periodic(x) + 1, 374761393) ^
    Math.imul(periodic(y) + 1, 668265263) ^
    Math.imul(s + 1, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const detail = (x, y, s = 0) => noise(x, y, s + 31);
function heightAt(kind, x, y) {
  const u = periodic(x) / (MATERIAL_SIZE - 1),
    v = periodic(y) / (MATERIAL_SIZE - 1);
  switch (kind) {
    case 'gravel':
      return 0.5 + 0.09 * noise(x, y, 12) + 0.06 * noise(Math.floor(x / 3) * 3, Math.floor(y / 3) * 3, 14);
    case 'sand':
      return 0.5 + 0.045 * noise(x, y) + 0.018 * detail(x, y);
    case 'asphalt':
      return 0.5 + 0.06 * noise(x, y) + 0.025 * Math.sin(TAU * u * 31) * Math.sin(TAU * v * 29);
    case 'concrete':
      return 0.5 + 0.018 * noise(x, y) - 0.025 * (x < 1 || y < 1 ? 1 : 0);
    case 'stucco':
      return 0.5 + 0.07 * noise(x, y) + 0.018 * Math.sin(TAU * u * 47) * Math.sin(TAU * v * 43);
    case 'roof':
      return 0.5 + 0.13 * Math.sin(TAU * u * 8) + 0.02 * noise(x, y);
    default:
      throw new RangeError(`unknown surface: ${kind}`);
  }
}
function base(kind, x, y) {
  const h = heightAt(kind, x, y),
    n = noise(x, y, 9),
    d = detail(x, y, kind.length),
    u = periodic(x) / 127,
    v = periodic(y) / 127;
  // Deliberately saturated, toy-scale colours: each base material must remain legible
  // at a distance, while the small variation keeps large tiles from reading as flat fills.
  const palette = {
    gravel: [0.48, 0.43, 0.34],
    sand: [0.65, 0.53, 0.38],
    asphalt: [0.16, 0.18, 0.19],
    concrete: [0.56, 0.58, 0.56],
    stucco: [0.72, 0.63, 0.49],
    roof: [0.37, 0.22, 0.16]
  }[kind];
  let variation = (n - 0.5) * 0.1 + (d - 0.5) * 0.055 + (h - 0.5) * 0.05;
  if (kind === 'gravel')
    variation =
      (n - 0.5) * 0.08 +
      (d - 0.5) * 0.06 +
      (noise(Math.floor(x / 3) * 3, Math.floor(y / 3) * 3, 14) - 0.5) * 0.1;
  if (kind === 'asphalt') {
    variation = (n - 0.5) * 0.018 + (d - 0.5) * 0.012;
    const aggregate = d > 0.96 ? 0.022 : 0;
    variation += aggregate;
    // Sparse hairline seams are darker than the road; keep them distinct from paint.
    if (Math.abs(Math.sin(TAU * (u + 0.025 * Math.sin(TAU * v * 3)))) < 0.018) return [0.11, 0.12, 0.13];
  }
  if (kind === 'concrete') {
    // One expansion joint per 6.25 m tile; broad, quiet mottling plus fine aggregate.
    // Avoid repeated sine bands: they alias strongly at the RC camera's grazing angle.
    variation = (n - 0.5) * 0.025 + (d - 0.5) * 0.016 + 0.025 * Math.sin(TAU * u) * Math.sin(TAU * v);
    if (x < 1 || y < 1) variation -= 0.11;
    else if (x < 3 || y < 3) variation -= 0.018;
  }
  if (kind === 'sand') variation = (n - 0.5) * 0.075 + (d - 0.5) * 0.035;
  if (kind === 'roof') variation += Math.sin(TAU * u * 8) > 0.25 ? 0.035 : -0.035;
  return palette.map(channel => clamp(channel + variation));
}
export function generateSurface(kind, size = MATERIAL_SIZE) {
  if (size !== 128) throw new RangeError('procedural surfaces require 128x128');
  const albedo = new Uint8Array(size * size * 4),
    roughness = new Uint8Array(albedo.length),
    normal = new Uint8Array(albedo.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        cx = x === size - 1 ? 0 : x,
        cy = y === size - 1 ? 0 : y,
        h = heightAt(kind, cx, cy),
        left = heightAt(kind, (cx - 1 + size - 1) % (size - 1), cy),
        right = heightAt(kind, (cx + 1) % (size - 1), cy),
        up = heightAt(kind, cx, (cy - 1 + size - 1) % (size - 1)),
        down = heightAt(kind, cx, (cy + 1) % (size - 1)),
        tx = (right - left) * 1.8,
        ty = (down - up) * 1.8,
        l = Math.hypot(tx, ty, 1),
        nx = -tx / l,
        ny = -ty / l,
        nz = 1 / l;
      const [r, g, b] = base(kind, cx, cy);
      albedo[i] = r * 255;
      albedo[i + 1] = g * 255;
      albedo[i + 2] = b * 255;
      albedo[i + 3] = 255;
      const rough = clamp(
        (kind === 'asphalt'
          ? 0.82
          : kind === 'roof'
            ? 0.58
            : kind === 'sand'
              ? 0.9
              : kind === 'stucco'
                ? 0.76
                : 0.72) +
          0.12 * noise(cx, cy, 4)
      );
      roughness[i] = rough * 255;
      roughness[i + 1] = rough * 255;
      roughness[i + 2] = rough * 255;
      roughness[i + 3] = 255;
      normal[i] = (nx * 0.5 + 0.5) * 255;
      normal[i + 1] = (ny * 0.5 + 0.5) * 255;
      normal[i + 2] = (nz * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  return {kind, size, albedo, roughness, normal};
}
export const surfacePattern = generateSurface;
