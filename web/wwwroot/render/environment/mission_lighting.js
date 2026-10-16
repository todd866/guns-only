// Mission-owned sun elevation uses the shared sky, terrain and directional light.
// First Light is civil dawn at ground level, with the sun above the depressed FL650 horizon.
export function missionLighting(state) {
  const elevation = state?.pathfinder?.sun_elevation_deg;
  if (!Number.isFinite(elevation)) return null;
  const radians = elevation * Math.PI / 180;
  // Provisional First Light art direction: the hunt runs west (-X). Put sunrise
  // 140 degrees off that heading (050 deg in world coordinates), behind/right.
  // Three uses -world Z, so the sun's north component is negative render Z.
  const azimuth = 50 * Math.PI / 180;
  return {
    sunX: Math.sin(azimuth) * Math.cos(radians), sunY: Math.sin(radians),
    sunZ: -Math.cos(azimuth) * Math.cos(radians),
    dawn: 1,
    // Cool blue shadow under a warm limb. The previous near-black fog and ground
    // ambient survived ACES as night, with no readable terrain form.
    fogLow: 0x1a3d66, fogHigh: 0x245080,
    ambientSky: 0x9aa6dc, ambientGround: 0x2a4c78, ambientIntensity: 0.52,
    sunColor: 0xffc898, sunIntensity: 3.4,
    haze: [0.055, 0.085, 0.16],
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
  view.renderer.toneMappingExposure = 1.06;
  return true;
}

export function applyMissionTerrainLighting(uniforms, state) {
  if (!uniforms) return;
  const lighting = missionLighting(state);
  if (uniforms.uMissionDawn) uniforms.uMissionDawn.value = lighting?.dawn ?? 0;
  // Sky and all ground fog consumers share this uniform by reference.
  uniforms.uAtmosphereHazeColor?.value.setRGB(...(lighting?.haze ?? [0.48, 0.59, 0.68]));
}
