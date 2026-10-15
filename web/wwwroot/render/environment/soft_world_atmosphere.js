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
// Preserve the existing cool aerial tint through most of the disc, then bury its edge fully.
// These fractions shape the wash; uFogDensity still follows the live streamed radius/weather.
export const UKRAINE_SOFT_WORLD_EDGE_HIDE_START = 0.55;
export const UKRAINE_SOFT_WORLD_EDGE_HIDE_END = 0.90;
// Fraction of the cool haze colour kept while aerial is still open. Multiplied by
// (1 - aerial), so a fully opaque rim is exactly the horizon sample.
export const DECISION_SUPPORT_MIDAIR_HAZE_WEIGHT = 0.22;

// The sky dome's elevation-0 colour, shared with every fog path that buries a streamed edge.
// Altitude and softWorld select the cool (Korea / Cobra) or warm (Ukraine) horizon; the sun
// term is the dome's own glow evaluated on that azimuth at y = 0.
export const DECISION_SUPPORT_HORIZON_SKY_GLSL = /* glsl */ `
vec3 decisionSupportHorizonBase(float altitude, float softWorld) {
  float altitudeMix = smoothstep(2500.0, 18000.0, max(altitude, 0.0));
  vec3 horizonCool = mix(vec3(0.34, 0.47, 0.52), vec3(0.18, 0.33, 0.50), altitudeMix);
  vec3 horizonWarm = mix(vec3(0.42, 0.34, 0.26), vec3(0.30, 0.28, 0.24), altitudeMix);
  return mix(horizonCool, horizonWarm, softWorld);
}
vec3 decisionSupportZenith(float altitude, float softWorld) {
  float altitudeMix = smoothstep(2500.0, 18000.0, max(altitude, 0.0));
  vec3 zenithCool = mix(vec3(0.035, 0.16, 0.34), vec3(0.006, 0.025, 0.105), altitudeMix);
  vec3 zenithWarm = mix(vec3(0.080, 0.170, 0.460), vec3(0.033, 0.072, 0.199), altitudeMix);
  return mix(zenithCool, zenithWarm, softWorld);
}
vec3 decisionSupportSunGlow(vec3 direction, vec3 sunDir, float altitude, float softWorld) {
  vec3 ray = normalize(direction);
  float altitudeMix = smoothstep(2500.0, 18000.0, max(altitude, 0.0));
  vec3 sun = normalize(sunDir);
  float sunDot = max(dot(ray, sun), 0.0);
  float sunCore = pow(sunDot, 1800.0);
  float sunBloom = pow(sunDot, 42.0);
  float sunHalo = pow(sunDot, 8.0);
  float above = smoothstep(-0.02, 0.08, ray.y);
  vec3 sunColor = mix(vec3(1.0, 0.82, 0.55), vec3(1.0, 0.94, 0.82), sunCore);
  return sunColor * (sunCore * 1.35 + sunBloom * 0.55 + sunHalo * 0.12) * above
    * (1.0 - altitudeMix * 0.35) * step(0.5, softWorld);
}
vec3 decisionSupportHorizonSky(vec3 viewDir, vec3 sunDir, float altitude, float softWorld) {
  vec3 azimuth = viewDir;
  azimuth.y = 0.0;
  if (dot(azimuth, azimuth) < 1.0e-8) azimuth = vec3(0.0, 0.0, 1.0);
  else azimuth = normalize(azimuth);
  return decisionSupportHorizonBase(altitude, softWorld)
    + decisionSupportSunGlow(azimuth, sunDir, altitude, softWorld);
}
// Full dome colour along a view ray. Below the limb the curve mirrors, so a ray a few
// degrees down (the streamed edge at altitude) is the same blue-to-warm mix as the sky
// just above the horizon, not a single horizon swatch painted as a slab.
vec3 decisionSupportSkyColor(vec3 viewDir, vec3 sunDir, float altitude, float softWorld) {
  vec3 ray = viewDir;
  if (dot(ray, ray) < 1.0e-8) ray = vec3(0.0, 0.0, 1.0);
  else ray = normalize(ray);
  float altitudeMix = smoothstep(2500.0, 18000.0, max(altitude, 0.0));
  vec3 horizon = decisionSupportHorizonBase(altitude, softWorld);
  vec3 zenith = decisionSupportZenith(altitude, softWorld);
  float aboveHorizon = abs(ray.y);
  float skyCurve = pow(aboveHorizon, mix(
    mix(0.42, 0.28, altitudeMix),
    mix(0.18, 0.13, altitudeMix),
    softWorld));
  vec3 color = mix(horizon, zenith, skyCurve);
  float horizonShoulder = exp(-abs(ray.y) * 96.0);
  color = mix(color, horizon, horizonShoulder * 0.22);
  vec3 glowRay = vec3(ray.x, max(ray.y, 0.0), ray.z);
  color += decisionSupportSunGlow(glowRay, sunDir, altitude, softWorld);
  return color;
}
`;

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
  "uSunDirection",
  "uSoftWorld",
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
          varying float vSoftWorldFogDistance;
          varying vec3 vSoftWorldViewDir;`,
        )
        .replace(
          "#include <fog_vertex>",
          `#include <fog_vertex>
          vSoftWorldFogDistance = length(mvPosition.xyz);
          mat3 softWorldView = mat3(viewMatrix);
          vSoftWorldViewDir = mat3(
            vec3(softWorldView[0][0], softWorldView[1][0], softWorldView[2][0]),
            vec3(softWorldView[0][1], softWorldView[1][1], softWorldView[2][1]),
            vec3(softWorldView[0][2], softWorldView[1][2], softWorldView[2][2])
          ) * mvPosition.xyz;`,
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
          uniform vec3 uSunDirection;
          uniform float uSoftWorld;
          varying float vSoftWorldFogDistance;
          varying vec3 vSoftWorldViewDir;
          ${DECISION_SUPPORT_HORIZON_SKY_GLSL}`,
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
              uWorldEdgeM * ${UKRAINE_SOFT_WORLD_EDGE_HIDE_START.toFixed(2)},
              uWorldEdgeM * ${UKRAINE_SOFT_WORLD_EDGE_HIDE_END.toFixed(2)},
              vSoftWorldFogDistance
            );
            softWorldAerial = max(softWorldAerial, softWorldEdgeHide);
          }
          if (uHazeBands > 0.5) {
            float softWorldBanded = floor(softWorldAerial * uHazeBands) / uHazeBands;
            softWorldAerial = mix(softWorldAerial, softWorldBanded, uHazeBandBlend);
          }
          vec3 softWorldHorizon = decisionSupportSkyColor(
            vSoftWorldViewDir,
            uSunDirection,
            cameraPosition.y,
            uSoftWorld
          );
          vec3 softWorldHazeColor = mix(
            softWorldHorizon,
            uAtmosphereHazeColor,
            (1.0 - clamp(softWorldAerial, 0.0, 1.0))
              * ${DECISION_SUPPORT_MIDAIR_HAZE_WEIGHT.toFixed(2)}
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
    `${priorCacheKey?.() ?? material.type}|ukraine-soft-world-fog-v3`;
  material.userData.ukraineSoftWorldFog = true;
  material.fog = false;
  material.needsUpdate = true;
  return material;
}
