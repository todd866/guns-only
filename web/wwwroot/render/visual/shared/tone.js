// Shared tone mapping / exposure / colour-space application. Pure: imports nothing. The caller
// passes the three namespace (`T`) so the module never creates a second copy of three.
// Profile: { toneMapping: 'aces_filmic'|'agx'|'neutral'|'linear'|'reinhard'|'cineon'|'none',
//            exposure: number, outputColorSpace: 'srgb'|'linear-srgb' }
// Names match render/visual/profile.js TONE_MAPPINGS; flight keeps using profile.js directly.
const TONE = Object.freeze({
  none: 'NoToneMapping', linear: 'LinearToneMapping', reinhard: 'ReinhardToneMapping',
  cineon: 'CineonToneMapping', aces_filmic: 'ACESFilmicToneMapping', agx: 'AgXToneMapping',
  neutral: 'NeutralToneMapping', custom: 'CustomToneMapping',
});
const SPACE = Object.freeze({ srgb: 'SRGBColorSpace', 'linear-srgb': 'LinearSRGBColorSpace' });

export const TONE_MAPPING_NAMES = Object.freeze(Object.keys(TONE));

export function toneMappingConstant(name, T) {
  const key = TONE[name];
  if (!key) throw new TypeError(`unknown toneMapping '${name}'`);
  if (!(key in T)) throw new TypeError(`this three build has no ${key}`);
  return T[key];
}

export function colorSpaceConstant(name, T) {
  const key = SPACE[name ?? 'srgb'];
  if (!key || !(key in T)) throw new TypeError(`unknown outputColorSpace '${name}'`);
  return T[key];
}

/** Sets renderer.toneMapping / toneMappingExposure / outputColorSpace. Returns the renderer. */
export function applyTone(renderer, profile, T) {
  renderer.outputColorSpace = colorSpaceConstant(profile.outputColorSpace, T);
  renderer.toneMapping = toneMappingConstant(profile.toneMapping ?? 'aces_filmic', T);
  const exposure = Number(profile.exposure);
  renderer.toneMappingExposure = Number.isFinite(exposure) && exposure > 0 ? exposure : 1;
  return renderer;
}
