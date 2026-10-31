// Shared fog / haze / sky parameters. Pure: imports nothing; the caller passes three as `T`.
// Profile: { mode?: 'linear'|'exponential'|'none', fogColor, near, far, density?,
//            heightFalloff?, skyColor?, horizonColor? }
// RC today: linear Fog; sky colour is also the background. Flight: linear, kilometres.

/** Validated numbers only; throws on a profile that could not make a sane fog. */
export function atmosphereParams(profile) {
  const mode = profile.mode ?? 'linear';
  if (!['linear', 'exponential', 'none'].includes(mode)) throw new TypeError(`unknown fog mode '${mode}'`);
  const near = Number(profile.near ?? 0), far = Number(profile.far);
  if (mode === 'linear' && !(Number.isFinite(far) && far > near && near >= 0)) throw new RangeError('fog needs 0 <= near < far');
  return {
    mode, fogColor: profile.fogColor, near, far,
    density: Number(profile.density ?? 0), heightFalloff: Number(profile.heightFalloff ?? 0),
    skyColor: profile.skyColor ?? profile.fogColor, horizonColor: profile.horizonColor ?? profile.fogColor,
  };
}

/** A three Fog / FogExp2, or null for mode 'none'. */
export function createFog(profile, T) {
  const p = atmosphereParams(profile);
  if (p.mode === 'none') return null;
  return p.mode === 'exponential' ? new T.FogExp2(p.fogColor, p.density) : new T.Fog(p.fogColor, p.near, p.far);
}

/** Effective fog amount (0..1) at a distance and optional height; heightFalloff thins fog with altitude. */
export function fogAmount(profile, distance, height = 0) {
  const p = atmosphereParams(profile);
  if (p.mode === 'none') return 0;
  const h = p.heightFalloff > 0 ? Math.exp(-p.heightFalloff * Math.max(0, height)) : 1;
  const base = p.mode === 'exponential' ? 1 - Math.exp(-((p.density * distance) ** 2))
    : Math.min(1, Math.max(0, (distance - p.near) / (p.far - p.near)));
  return base * h;
}

/** Apply to a scene: fog plus background (sky) colour. Returns the scene. */
export function applyAtmosphere(scene, profile, T) {
  const p = atmosphereParams(profile);
  scene.fog = createFog(profile, T);
  scene.background = new T.Color(p.skyColor);
  return scene;
}
