// Shared sun / hemisphere colours and texel snapping. Pure: imports nothing.
// snapLightToTexels is a copy of the light-space maths in ../shadow_stabilizer.js
// (computeTexelStabilizedShadowFrame); snapToGrid is RC's world-axis snap from rc/visuals.js followSun.

const lerp = (a, b, t) => a + (b - a) * t;
const hex = c => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];
const unhex = ([r, g, b]) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
const mix = (a, b, t) => unhex(hex(a).map((v, i) => lerp(v, hex(b)[i], t)));

/**
 * Sun and hemisphere state for a day fraction (0 = midnight, 0.5 = noon).
 * profile: { sunNoon: [colour, intensity], sunHorizon: [colour, intensity], hemi: [sky, ground, intensity],
 *            hemiNight?: [sky, ground, intensity] }
 * Returns { elevation (-1..1), sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity }.
 */
export function sunStateAt(dayFraction, profile) {
  const f = ((dayFraction % 1) + 1) % 1;
  const elevation = Math.sin((f - 0.25) * 2 * Math.PI);
  const up = Math.max(0, elevation), t = Math.sqrt(up);          // low sun reddens quickly
  const [nc, ni] = profile.sunNoon, [hc, hi] = profile.sunHorizon;
  const [sky, ground, hemiI] = profile.hemi, night = profile.hemiNight ?? [sky, ground, hemiI * 0.15];
  const day = Math.min(1, Math.max(0, (elevation + 0.1) / 0.3));  // twilight blend
  return {
    elevation,
    sunColor: mix(hc, nc, t), sunIntensity: elevation <= 0 ? 0 : lerp(hi, ni, t),
    hemiSky: mix(night[0], sky, day), hemiGround: mix(night[1], ground, day), hemiIntensity: lerp(night[2], hemiI, day),
  };
}

/** Snap a scalar to a grid of `texel` size. */
export const snapToGrid = (v, texel) => Math.round(v / texel) * texel;

/** RC's world-axis snap: returns the snapped x/z for a shadow box `width` wide on a `mapSize` map. */
export function snapFocusAxisAligned(at, width, mapSize) {
  const texel = width / mapSize;
  return { x: snapToGrid(at.x, texel), y: at.y, z: snapToGrid(at.z, texel), texel };
}

const norm = v => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-8 ? v.map(c => c / l) : null; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Move a directional light and its target so the shadow frustum, centred on `camera.position`,
 * sits on whole shadow-map texels in light space. `light` needs position{x,y,z} and target.position{x,y,z}
 * (plain objects or three objects; no methods are called). The light keeps its offset from its target.
 * worldRadius is the half extent of the shadow box. Returns { focus:[x,y,z], worldUnitsPerTexel }.
 */
export function snapLightToTexels(light, camera, shadowMapSize, worldRadius) {
  const f = camera.position, focus = [f.x, f.y, f.z];
  const t = light.target.position, p = light.position;
  const offset = [p.x - t.x, p.y - t.y, p.z - t.z];
  const dir = norm([-offset[0], -offset[1], -offset[2]]) ?? [0, -1, 0];
  let right = norm(cross(dir, [0, 1, 0])) ?? [1, 0, 0];
  if (Math.abs(dot(right, dir)) > 0.001) right = [1, 0, 0];
  const up = norm(cross(right, dir)) ?? [0, 0, 1];
  const size = Math.max(1, Math.round(Number(shadowMapSize) || 1024));
  const unit = (Math.max(1, Number(worldRadius) || 1000) * 2) / size;
  const lx = dot(focus, right), ly = dot(focus, up);
  const dx = snapToGrid(lx, unit) - lx, dy = snapToGrid(ly, unit) - ly;
  const snapped = focus.map((c, i) => c + right[i] * dx + up[i] * dy);
  t.x = snapped[0]; t.y = snapped[1]; t.z = snapped[2];
  p.x = snapped[0] + offset[0]; p.y = snapped[1] + offset[1]; p.z = snapped[2] + offset[2];
  return { focus: snapped, worldUnitsPerTexel: unit };
}
