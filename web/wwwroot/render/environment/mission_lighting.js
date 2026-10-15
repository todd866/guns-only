// Mission-owned sun elevation uses the shared sky, terrain and directional light.
// First Light is civil dawn at ground level, with the sun above the depressed FL650 horizon.
export function missionLighting(state) {
  const elevation = state?.pathfinder?.sun_elevation_deg;
  if (!Number.isFinite(elevation)) return null;
  const radians = elevation * Math.PI / 180;
  return {
    sunX: -Math.cos(radians), sunY: Math.sin(radians), sunZ: 0,
    dawn: 1,
    fogLow: 0x182838, fogHigh: 0x263b53,
    ambientSky: 0x809bc0, ambientGround: 0x101923, ambientIntensity: 0.24,
    sunColor: 0xffd4a0, sunIntensity: 2.9,
    haze: [0.032, 0.055, 0.09],
  };
}

export function applyMissionLighting(view, state, sunDirection) {
  const lighting = missionLighting(state);
  view.sky.uniforms.uDawn.value = lighting?.dawn ?? 0;
  if (!lighting) {
    const saved = view.missionLightingBaseline;
    if (saved) {
      sunDirection.copy(saved.sunDirection);
      view.sky.uniforms.uSunDirection.value.copy(sunDirection);
      view.sky.uniforms.uSoftWorld.value = saved.softWorld;
      for (const name of ["fogLow", "fogHigh", "cloudFogColor"]) view[name].copy(saved[name]);
      view.ambient.color.copy(saved.ambientSky);
      view.ambient.groundColor.copy(saved.ambientGround);
      view.ambient.intensity = saved.ambientIntensity;
      view.sun.color.copy(saved.sunColor);
      view.sun.intensity = saved.sunIntensity;
      view.renderer.toneMappingExposure = saved.exposure;
      view.missionLightingBaseline = null;
    }
    return false;
  }
  if (!view.missionLightingBaseline) view.missionLightingBaseline = {
    sunDirection: sunDirection.clone(), softWorld: view.sky.uniforms.uSoftWorld.value,
    fogLow: view.fogLow.clone(), fogHigh: view.fogHigh.clone(), cloudFogColor: view.cloudFogColor.clone(),
    ambientSky: view.ambient.color.clone(), ambientGround: view.ambient.groundColor.clone(),
    ambientIntensity: view.ambient.intensity, sunColor: view.sun.color.clone(),
    sunIntensity: view.sun.intensity, exposure: view.renderer.toneMappingExposure,
  };
  sunDirection.set(lighting.sunX, lighting.sunY, lighting.sunZ);
  view.sky.uniforms.uSunDirection.value.copy(sunDirection);
  view.sky.uniforms.uSoftWorld.value = 1;
  view.fogLow.set(lighting.fogLow);
  view.fogHigh.set(lighting.fogHigh);
  view.cloudFogColor.set(lighting.fogLow);
  view.ambient.color.set(lighting.ambientSky);
  view.ambient.groundColor.set(lighting.ambientGround);
  view.ambient.intensity = lighting.ambientIntensity;
  view.sun.color.set(lighting.sunColor);
  view.sun.intensity = lighting.sunIntensity;
  view.renderer.toneMappingExposure = 1.02;
  return true;
}

export function applyMissionTerrainLighting(uniforms, state) {
  if (!uniforms) return;
  const lighting = missionLighting(state);
  if (uniforms.uMissionDawn) uniforms.uMissionDawn.value = lighting?.dawn ?? 0;
  // Sky and all ground fog consumers share this uniform by reference.
  uniforms.uAtmosphereHazeColor?.value.setRGB(...(lighting?.haze ?? [0.48, 0.59, 0.68]));
}
