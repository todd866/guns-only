// Ukraine's world presentation uses one atmospheric extinction contract across terrain and
// ordinary scene-fog materials. Keep these values in one dependency-free module so the custom
// terrain shader and Three's built-in material path cannot silently drift apart again.

// Clear enough to retain the painted regional surface from Rapier altitude, but dense enough for
// the ground to recede through a blue-grey aerial layer instead of ending as a tan render slab.
// World-edge bury (terrain shader) still closes the streamed disc independently.
export const UKRAINE_SOFT_WORLD_FOG_DENSITY_SCALE = 0.32;
export const UKRAINE_SOFT_WORLD_HAZE_MIX = 0.72;
export const UKRAINE_SOFT_WORLD_HAZE_RGB = Object.freeze([0.48, 0.59, 0.68]);
// Single source for the soft-world fog hex; fallback paths in scenery/mission features must
// use this, never a literal — two hardcoded fallbacks forked the palette once already.
export const UKRAINE_SOFT_WORLD_FOG_HEX = 0xa69d89;
export const UKRAINE_SOFT_WORLD_EDGE_HIDE_START = 0.36;
export const UKRAINE_SOFT_WORLD_EDGE_HIDE_END = 0.72;

// The three uniforms that resolve the far-field wash colour. The sky dome must paint its
// below-horizon hemisphere with the exact colour the terrain buries to — beyond the streamed disc
// the sky IS the ground, hazed. Sharing the uniform objects by reference (not copied values) keeps
// them identical as fog colour moves with altitude and weather every frame.
export const UKRAINE_SOFT_WORLD_GROUND_HAZE_UNIFORM_NAMES = Object.freeze([
  "uFogColor",
  "uAtmosphereHazeColor",
  "uAtmosphereHazeMix",
]);

/// Point a sky material's ground-haze uniforms at the terrain's own atmosphere uniforms. Returns
/// false when either side is missing a name, so a caller can fail loudly instead of silently
/// rendering a forked horizon.
export function attachSoftWorldGroundHaze(skyUniforms, atmosphereUniforms) {
  if (!skyUniforms || !atmosphereUniforms) return false;
  for (const name of UKRAINE_SOFT_WORLD_GROUND_HAZE_UNIFORM_NAMES) {
    if (!skyUniforms[name] || !atmosphereUniforms[name]) return false;
  }
  for (const name of UKRAINE_SOFT_WORLD_GROUND_HAZE_UNIFORM_NAMES) {
    skyUniforms[name] = atmosphereUniforms[name];
  }
  return true;
}

export const UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES = Object.freeze([
  "uFogColor",
  "uFogDensity",
  "uAtmosphereDensityScale",
  "uAtmosphereHazeColor",
  "uAtmosphereHazeMix",
  "uWorldEdgeM",
  "uHazeBands",
  "uHazeBandBlend",
]);

/// Replaces Three's scene-owned FogExp2 path with the exact uniforms and extinction curve used by
/// the Ukraine terrain shader. This works in Environment Lab (which intentionally has no
/// scene.fog), avoids double fog in production, and keeps stream-edge burial aligned.
export function addUkraineSoftWorldFog(material, atmosphereUniforms) {
  if (!material || material.userData?.ukraineSoftWorldFog === true) return material;
  const priorCompile = material.onBeforeCompile;
  const priorCacheKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    priorCompile?.call(material, shader, renderer);
    for (const name of UKRAINE_SOFT_WORLD_ATMOSPHERE_UNIFORM_NAMES) {
      shader.uniforms[name] = atmosphereUniforms[name];
    }
    if (typeof shader.vertexShader === "string") {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <fog_pars_vertex>",
          `#include <fog_pars_vertex>
          varying float vSoftWorldFogDistance;`,
        )
        .replace(
          "#include <fog_vertex>",
          `#include <fog_vertex>
          vSoftWorldFogDistance = length(mvPosition.xyz);`,
        );
    }
    if (typeof shader.fragmentShader === "string") {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <fog_pars_fragment>",
          `#include <fog_pars_fragment>
          uniform vec3 uFogColor;
          uniform float uFogDensity;
          uniform float uAtmosphereDensityScale;
          uniform vec3 uAtmosphereHazeColor;
          uniform float uAtmosphereHazeMix;
          uniform float uWorldEdgeM;
          uniform float uHazeBands;
          uniform float uHazeBandBlend;
          varying float vSoftWorldFogDistance;`,
        )
        .replace(
          "#include <opaque_fragment>",
          `float softWorldFogDensity = uFogDensity * uAtmosphereDensityScale;
          float softWorldAerial = 1.0 - exp(
            -softWorldFogDensity * softWorldFogDensity
              * vSoftWorldFogDistance * vSoftWorldFogDistance
          );
          if (uWorldEdgeM > 1.0) {
            float softWorldEdgeHide = smoothstep(
              uWorldEdgeM * 0.36,
              uWorldEdgeM * 0.72,
              vSoftWorldFogDistance
            );
            softWorldAerial = max(softWorldAerial, softWorldEdgeHide);
          }
          if (uHazeBands > 0.5) {
            float softWorldBanded = floor(softWorldAerial * uHazeBands) / uHazeBands;
            softWorldAerial = mix(softWorldAerial, softWorldBanded, uHazeBandBlend);
          }
          vec3 softWorldHazeColor = mix(
            uFogColor,
            uAtmosphereHazeColor,
            uAtmosphereHazeMix
          );
          outgoingLight = mix(
            outgoingLight,
            softWorldHazeColor,
            clamp(softWorldAerial, 0.0, 1.0)
          );
          #include <opaque_fragment>`,
        );
    }
  };
  material.customProgramCacheKey = () =>
    `${priorCacheKey?.() ?? material.type}|ukraine-soft-world-fog-v1`;
  material.userData.ukraineSoftWorldFog = true;
  material.fog = false;
  material.needsUpdate = true;
  return material;
}
