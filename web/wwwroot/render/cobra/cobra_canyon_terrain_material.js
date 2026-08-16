// Painted-tactical surface shaders for the Cobra Canyon basin and its river.
//
// ONE ENGINE, NOT A FORK. This is the production F-22 terrain technique from
// `render/environment/korea_terrain.js` — squared half-Lambert through a two-softstep tone ramp,
// hue-separated warm sun key against cool sky fill ("painted light is coloured light, not dimmed
// light"), baked enclosure occlusion, and banded aerial perspective — re-expressed for the one
// analytic basin mesh the Cobra scene draws. Korea reaches the same recipe through a streamed
// chunk pipeline this scene does not have; the shading maths below is deliberately the same.
//
// WHY A SHADER AND NOT BAKED VERTEX COLOURS. The basin grid is 100 m per vertex at the desktop
// tier (16 km across 160 segments). Anything finer than ~250 m — field parcels, canopy edges,
// laterite on a cut bank, the shoreline of a 77 m river — cannot exist in a vertex attribute; it
// interpolates away. The Build 264 monotone and the sand-coloured river of the parked WIP are
// both that limit, not a palette mistake. Albedo and light therefore run per fragment; the only
// baked attributes are the ones a fragment genuinely cannot derive: enclosure concavity (needs
// the height neighbourhood) and river lateral offset (needs the authored centreline).
//
// Every constant lives in `cobra_canyon_visual_profile.js`, which is also what the lab scene
// reads for sun direction, sky and fog — one sun for glow, props, haze and terrain relief.
//
// CAST SHADOWS (render-architecture stage 0). The tone ramp models the light a surface FACES; it
// cannot know what stands between that surface and the sun. Ridge-into-gorge shadow and the
// helicopter's own shadow on the ground are the two cues that put an object in the world rather
// than on it, and neither is derivable from the normal. A raw ShaderMaterial gets no shadow
// machinery for free, so both surfaces below opt in through `terrain_shadow_receive.js` and fold
// the mask into the SAME tone ramp: a fully occluded pixel lands exactly on `uShadowFloor`, which
// is where a fully lee-facing pixel already lands. Cast shadow therefore inherits the painted
// key/fill hue separation and the humid-haze lift for free, and can never print blacker than the
// darkest slope in the scene.

import {
  TERRAIN_SHADOW_FRAGMENT_PARS,
  TERRAIN_SHADOW_VERTEX_BODY,
  TERRAIN_SHADOW_VERTEX_PARS,
  withTerrainShadowUniforms,
} from "../environment/terrain_shadow_receive.js?v=340";

const BASIN_VERTEX_SHADER = /* glsl */ `
#include <common>
${TERRAIN_SHADOW_VERTEX_PARS}
attribute float concavity;
varying vec3 vWorldPosition;
varying vec3 vTerrainNormal;
varying float vConcavity;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vTerrainNormal = normalize(mat3(modelMatrix) * normal);
  vConcavity = concavity;
  // View-space normal: the shadow chunk offsets the lookup along it (normalBias) to keep a
  // 105 m basin quad from shadowing itself, and rotates it back to world space itself.
  vec3 transformedNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  ${TERRAIN_SHADOW_VERTEX_BODY}
}
`;

/** Value noise shared by the basin and river shaders — no textures, no dependent fetches. */
export const COBRA_NOISE_CHUNK = /* glsl */ `
// PRECISION-SAFE HASH, NOT fract(sin(dot(p, k)) * 43758.5). korea_terrain can use the sin hash
// because its cloud UV is world metres over 2600 — always a small number. Here the same hash is
// asked for an 8 m grain over a 16 km world, so the sine argument reaches ~4e5, past float32
// mantissa resolution: the grain octaves silently collapsed to a constant and the ground rendered
// as an untextured painted panel. This variant only ever fracts, so it holds at any world scale.
float cobraHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float cobraNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(cobraHash(i), cobraHash(i + vec2(1.0, 0.0)), u.x),
    mix(cobraHash(i + vec2(0.0, 1.0)), cobraHash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float cobraFbm(vec2 p) {
  return cobraNoise(p) * 0.56 + cobraNoise(p * 2.13 + 19.7) * 0.29
    + cobraNoise(p * 4.31 - 7.3) * 0.15;
}
`;

/** Aerial perspective, banded. Shared so basin and river recede into exactly the same air. */
const HAZE_CHUNK = /* glsl */ `
vec3 cobraAerial(vec3 lit, vec3 worldPosition, vec3 fogColor, float fogDensity,
    float bands, float bandBlend) {
  float distanceToCamera = length(cameraPosition - worldPosition);
  float aerial = 1.0 - exp(-fogDensity * fogDensity * distanceToCamera * distanceToCamera);
  if (bands > 0.5) {
    float banded = floor(aerial * bands) / bands;
    aerial = mix(aerial, banded, bandBlend);
  }
  return mix(lit, fogColor, clamp(aerial, 0.0, 1.0));
}
`;

const BASIN_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uHazeBands;
uniform float uHazeBandBlend;
uniform float uShadowFloor;
uniform vec2 uOcclusionRange;
uniform vec2 uSlopeFaceWindow;
uniform vec2 uToneGateLow;
uniform vec2 uToneGateHigh;
uniform vec2 uToneGateWeights;
uniform float uReliefGain;
uniform float uCloudShadowStrength;
uniform vec2 uParcelPitchM;
uniform vec3 uSkyFill;
uniform vec3 uSunKey;
uniform vec3 uValleyFloor;
uniform vec3 uCultivationGold;
uniform vec3 uJungleMid;
uniform vec3 uLateriteSlope;
uniform vec3 uRidgeSage;
uniform vec3 uRimRock;
uniform vec4 uElevationBands;
varying vec3 vWorldPosition;
varying vec3 vTerrainNormal;
varying float vConcavity;
#include <common>
${TERRAIN_SHADOW_FRAGMENT_PARS}
${COBRA_NOISE_CHUNK}
${HAZE_CHUNK}

void main() {
  vec3 normal = normalize(vTerrainNormal);
  vec3 sunDirection = normalize(uSunDirection);
  float elevationM = vWorldPosition.y;
  float steepness = 1.0 - clamp(normal.y, 0.0, 1.0);
  float slopeFace = smoothstep(uSlopeFaceWindow.x, uSlopeFaceWindow.y, steepness);
  float flatGround = 1.0 - smoothstep(uSlopeFaceWindow.x * 0.5, uSlopeFaceWindow.x * 2.2, steepness);
  float lowland = 1.0 - smoothstep(uElevationBands.x, uElevationBands.y, elevationM);
  float upland = smoothstep(uElevationBands.y, uElevationBands.z, elevationM);
  float rimBand = smoothstep(uElevationBands.z, uElevationBands.w, elevationM);

  // Landcover grammar. Broad noise decides jungle mass versus cleared ground; the metre-scale
  // octave is the grain that stops a 100 m triangle reading as a painted panel.
  vec2 groundUv = vWorldPosition.xz;
  float macro = cobraFbm(groundUv * 0.0016);
  float meso = cobraFbm(groundUv * 0.0068);
  // Two near-field octaves, not one. The scene is flown at 30 m AGL: at that height a 32 m
  // feature is the horizon-ward texture and an 8 m feature is the ground under the skids. With
  // only the coarse octave the near field renders as an untextured painted panel.
  float micro = cobraNoise(groundUv * 0.031);
  float grain = cobraNoise(groundUv * 0.125);
  float grit = cobraNoise(groundUv * 0.42);
  float canopy = smoothstep(0.44, 0.70, macro * 0.62 + meso * 0.38);

  // Cultivation parcels: hard-edged cells on flat lowland only. Agriculture reads as rectangles,
  // and the patchwork is what kills the monotone flats a natural noise field cannot.
  //
  // CLUSTERED, not carpeted. Stamping every eligible cell tiles the whole basin with axis-aligned
  // blocks and reads as a texture bug rather than farmland, so cultivation is gated on a broad
  // noise field: fields cluster near the valley the way settlement actually does, and the ground
  // between clusters stays wild.
  vec2 parcelUv = mat2(0.94, 0.34, -0.34, 0.94) * groundUv;
  vec2 parcelCell = floor(parcelUv / uParcelPitchM);
  float parcelSeed = cobraHash(parcelCell);
  float parcelShade = cobraHash(parcelCell + vec2(37.1, 11.7));
  float farmland = smoothstep(0.28, 0.54, macro * 0.7 + meso * 0.3);
  float cultivation = lowland * flatGround * farmland * step(0.42, parcelSeed);

  vec3 albedo = mix(uValleyFloor, uRidgeSage, upland);
  albedo = mix(albedo, uJungleMid, canopy * (0.78 - 0.30 * cultivation));
  albedo = mix(albedo, uCultivationGold * (0.80 + 0.44 * parcelShade), cultivation * 0.86);
  albedo = mix(albedo, uLateriteSlope, slopeFace * (0.34 + 0.42 * upland));
  albedo = mix(albedo, uRimRock, rimBand * 0.78);
  // Drainage: the concave half of the enclosure term stays wet and dark green all year.
  albedo = mix(albedo, uJungleMid * 0.82, (1.0 - smoothstep(0.30, 0.52, vConcavity)) * 0.42);
  // Scrub clumps: the near-field octave has to change HUE, not just value. A symmetric value
  // jitter averages out to the same smooth panel at any distance; discrete darker-green clumps
  // are what the eye reads as vegetation on the ground under the skids.
  // Scrub clumps + metre grit: near-field must change hue AND value or 30 m AGL reads painted.
  albedo = mix(albedo, uJungleMid, smoothstep(0.42, 0.72, grain) * 0.62 * (1.0 - cultivation));
  albedo = mix(albedo, uLateriteSlope * 0.78, smoothstep(0.48, 0.82, grit) * 0.36 * flatGround);
  // LARGE scrub islands (8–25 m). Micro flecks average out under humid haze and fail the
  // emptiness spat/hetero floors; discrete dark/light patches are what a mid-gorge still needs.
  float scrub = cobraFbm(groundUv * 0.055);
  float scrubB = cobraNoise(groundUv * 0.11 + 4.7);
  albedo = mix(albedo, uJungleMid * 0.42, step(0.52, scrub) * 0.58 * (1.0 - cultivation));
  albedo = mix(albedo, uValleyFloor * 1.35, step(0.68, scrubB) * 0.32 * flatGround * (1.0 - cultivation));
  albedo = mix(albedo, uLateriteSlope, step(0.74, scrubB) * 0.22 * flatGround);
  // CANOPY CROWNS FROM ALTITUDE. BF Vietnam's distant hills are a dark green carpet of rounded
  // tree tops, not mottled camouflage. Paint discrete crown discs on a 22–36 m lattice — free
  // density the triangle budget cannot buy with mesh palms.
  vec2 crownUv = groundUv / 28.0;
  vec2 crownCell = floor(crownUv);
  vec2 crownLocal = fract(crownUv) - 0.5;
  float crownSeed = cobraHash(crownCell + vec2(3.1, 7.9));
  float crownSeedB = cobraHash(crownCell + vec2(11.3, 2.4));
  float crownRadius = 0.22 + crownSeed * 0.22;
  float crownMask = (1.0 - cultivation) * (0.55 + 0.45 * flatGround)
    * step(0.28, crownSeed) * (1.0 - smoothstep(crownRadius * 0.55, crownRadius, length(crownLocal)));
  albedo = mix(albedo, uJungleMid * (0.48 + 0.22 * crownSeedB), crownMask * 0.82);
  // Darker between crowns so the carpet reads as trees, not a green tarp.
  albedo = mix(albedo, uJungleMid * 0.62, (1.0 - cultivation) * canopy * 0.22 * (1.0 - crownMask));
  float fleck = cobraNoise(groundUv * 1.35);
  albedo = mix(albedo, uJungleMid * 0.55, step(0.62, fleck) * 0.28 * (1.0 - cultivation));
  albedo *= 0.46 + 0.26 * micro + 0.30 * grain + 0.24 * grit + 0.18 * scrub
    + 0.14 * scrubB + 0.12 * fleck + 0.10 * crownMask;

  // PAINTED LIGHT IS COLOURED LIGHT, NOT DIMMED LIGHT (korea_terrain). A scalar tone cannot
  // shift hue, so every shadow comes out as a darker copy of the lit colour — the clearest tell
  // of a renderer. Warm key, cool sky fill, and the hue separation carries the modelling.
  float halfLambert = dot(normal, sunDirection) * 0.5 + 0.5;
  halfLambert *= halfLambert;
  float toneRamp = uShadowFloor + (1.0 - uShadowFloor) * (
    uToneGateWeights.x * smoothstep(uToneGateLow.x, uToneGateLow.y, halfLambert)
    + uToneGateWeights.y * smoothstep(uToneGateHigh.x, uToneGateHigh.y, halfLambert));
  // Cast shadow enters the SAME ramp, so an occluded pixel bottoms out at uShadowFloor — the
  // value a lee-facing slope already reaches — and takes the cool sky fill with it. Compiles to
  // a constant 1.0 and costs nothing when the renderer's shadow map is off (mobile tier).
  toneRamp = mix(uShadowFloor, toneRamp, getShadowMask());
  // NO RIM TERM. korea_terrain adds one because it is viewed from altitude, where the grazing
  // factor only touches ridge edges. This scene is flown at 30 m AGL across a shallow bowl, so
  // 1 - dot(normal, view) saturates over the ENTIRE visible ground and the rim colour becomes a
  // flat pale-blue wash laid over everything — measured at roughly double the surface value.
  // Aerial perspective below does the same job honestly, by distance.
  vec3 lit = albedo * mix(uSkyFill, uSunKey, toneRamp) * toneRamp;

  // The Cobra basin is a broad shallow bowl, not a Korean ridge system: half its area sits under
  // 0.1 gradient, where a pure Lambert term separates almost nothing. A bounded planform cue
  // (korea's reliefGain, same clamp) makes sun-facing and lee ground read apart at low relief.
  vec2 sunPlanform = normalize(sunDirection.xz + vec2(0.0001));
  lit *= clamp(0.96 + dot(normal.xz, sunPlanform) * uReliefGain, 0.70, 1.14);

  // Baked enclosure: valley floors sink, crests catch light. This is the term the Build 264
  // scene was missing relative to a hillshade.
  lit *= mix(uOcclusionRange.x, uOcclusionRange.y, clamp(vConcavity, 0.0, 1.0));

  // Broken cumulus shadow, matched to the sky shader's shelf. Two octaves of value structure
  // this low-relief bowl cannot get from terrain shape alone.
  float cloudNoise = cobraNoise(groundUv * 0.00042) * 0.66
    + cobraNoise(groundUv * 0.00131 + vec2(13.7, 41.3)) * 0.34;
  lit *= 1.0 - uCloudShadowStrength * smoothstep(0.48, 0.78, cloudNoise);

  vec3 color = cobraAerial(lit, vWorldPosition, uFogColor, uFogDensity,
    uHazeBands, uHazeBandBlend);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const RIVER_VERTEX_SHADER = /* glsl */ `
#include <common>
${TERRAIN_SHADOW_VERTEX_PARS}
attribute vec4 riverFrame;
varying vec3 vWorldPosition;
varying vec4 vRiverFrame;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vRiverFrame = riverFrame;
  vec3 transformedNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  ${TERRAIN_SHADOW_VERTEX_BODY}
}
`;

const RIVER_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uHazeBands;
uniform float uHazeBandBlend;
uniform vec3 uDeepWater;
uniform vec3 uShallowWater;
uniform vec3 uBankGravel;
uniform vec3 uBankLight;
uniform vec3 uBankShadowLight;
uniform vec2 uShoreWindow;
varying vec3 vWorldPosition;
varying vec4 vRiverFrame;
#include <common>
${TERRAIN_SHADOW_FRAGMENT_PARS}
${COBRA_NOISE_CHUNK}
${HAZE_CHUNK}

void main() {
  // Recover lateral distance from the authored centreline, normalised so 1.0 IS the waterline.
  // Per-fragment is the whole point: the ribbon carries four vertices across its width and all
  // four sit at the outer edge, so any baked per-vertex bank term paints the entire river the
  // colour of its own gravel bar. World z is -north, hence the sign on the second term.
  float lateral = abs((vWorldPosition.x - vRiverFrame.x) * vRiverFrame.z
    + (-vWorldPosition.z - vRiverFrame.y) * vRiverFrame.w);
  float shore = smoothstep(uShoreWindow.x, uShoreWindow.y, lateral);
  float depth = 1.0 - clamp(lateral, 0.0, 1.0);

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  // A RIPPLE-PERTURBED NORMAL, not the flat plane normal. With a constant up-vector the specular
  // lobe is identical everywhere the geometry is flat, so a low sun paints one straight white
  // stripe down the middle of the river and the water reads as polished plastic. Perturbing by
  // the analytic ripple slope breaks that single lobe into glitter, which is what a metre-scale
  // wind chop actually does to a sun reflection.
  float rippleA = sin(vWorldPosition.x * 0.041 + vWorldPosition.z * 0.023);
  float rippleB = sin(vWorldPosition.x * -0.017 + vWorldPosition.z * 0.058 + 1.7);
  float ripple = rippleA + 0.55 * rippleB;
  float slopeA = cos(vWorldPosition.x * 0.041 + vWorldPosition.z * 0.023);
  float slopeB = cos(vWorldPosition.x * -0.017 + vWorldPosition.z * 0.058 + 1.7);
  vec3 normal = normalize(vec3(
    -(0.041 * slopeA - 0.0094 * slopeB) * 2.6,
    1.0,
    -(0.023 * slopeA + 0.032 * slopeB) * 2.6));
  float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
  vec3 water = mix(uShallowWater, uDeepWater, smoothstep(0.08, 0.78, depth));
  water = mix(water, uShallowWater * 1.18, fresnel * 0.35);
  water *= 0.95 + ripple * 0.045;
  // A gorge wall standing between the river and a 16-degree sun is the single most legible
  // shadow in this scene, because water is the brightest thing in the frame. Water keeps most of
  // its value in shade — the bulk of it is reflected SKY, not reflected sun — so the body dims to
  // 0.66 rather than to the ground's 0.20 floor, and only the glint goes fully dark.
  float riverShadow = getShadowMask();
  vec3 half3 = normalize(viewDirection + normalize(uSunDirection));
  water += vec3(0.78, 0.76, 0.64)
    * pow(max(dot(normal, half3), 0.0), 128.0) * 0.055 * riverShadow;
  water *= mix(0.66, 1.0, riverShadow);

  float gravelGrain = cobraNoise(vWorldPosition.xz * 0.09) * 0.5
    + cobraNoise(vWorldPosition.xz * 0.34) * 0.5;
  // The gravel bar is LAND, so it has to be lit like land. Left unlit it stayed the same bright
  // value on the shadowed bank as on the sunlit one, and a strip of constant white either side of
  // the water reads as a concrete levee. uBankLight is the basin's own flat-ground tone times its
  // key/fill tint, computed from the profile — one sun, one value, no second light model.
  // The bar is LAND, so it takes the ground's shadow, not the water's: both endpoints come from
  // the same profile expression, evaluated at the lit tone and at the shadow floor.
  vec3 gravel = uBankGravel * mix(uBankShadowLight, uBankLight, riverShadow)
    * (0.80 + 0.40 * gravelGrain);

  vec3 lit = mix(water, gravel, shore);
  vec3 color = cobraAerial(lit, vWorldPosition, uFogColor, uFogDensity,
    uHazeBands, uHazeBandBlend);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function smoothstep01(edge0, edge1, value) {
  const unit = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return unit * unit * (3 - 2 * unit);
}

/**
 * The RGB multiplier that level, unshadowed basin ground receives from the tone ramp under this
 * profile's sun — the same expression the basin fragment shader evaluates, resolved on the CPU
 * for surfaces that are flat by construction (the river's gravel bars). Keeping it derived rather
 * than hand-tuned is what stops the banks drifting out of agreement with the ground they sit in.
 */
export function flatGroundLight(profile) {
  const paint = profile.terrainPaint;
  const halfLambert = (profile.sunDirectionWorld[1] * 0.5 + 0.5) ** 2;
  const ramp = paint.toneRampGates.reduce(
    (total, gate) => total + gate.weight * smoothstep01(gate.start, gate.end, halfLambert),
    0,
  );
  const tone = paint.shadowFloor + (1 - paint.shadowFloor) * ramp;
  return paint.skyFill.map((fill, channel) => (fill + (paint.sunKey[channel] - fill) * tone) * tone);
}

/**
 * The same expression at the bottom of the ramp — what flat ground looks like when something
 * stands between it and the sun. `toneRamp` is clamped below at `shadowFloor` by construction, so
 * this is the darkest value the basin can print, and cast shadow on land interpolates to it.
 */
export function flatGroundShadowLight(profile) {
  const paint = profile.terrainPaint;
  const tone = paint.shadowFloor;
  return paint.skyFill.map((fill, channel) => (fill + (paint.sunKey[channel] - fill) * tone) * tone);
}

function vector3(THREE, triple) {
  return new THREE.Vector3(triple[0], triple[1], triple[2]);
}

function vector2(THREE, pair) {
  return new THREE.Vector2(pair[0], pair[1]);
}

/**
 * Painted basin surface. Consumes `position`, `normal` and the baked `concavity` attribute;
 * scene lights deliberately do not touch it — the light model IS the tone ramp, exactly as the
 * F-22 terrain shader does it.
 */
export function createCobraCanyonBasinMaterial(THREE, profile) {
  const paint = profile.terrainPaint;
  const material = new THREE.ShaderMaterial({
    name: "COBRA_CANYON_BASIN_MATERIAL",
    vertexShader: BASIN_VERTEX_SHADER,
    fragmentShader: BASIN_FRAGMENT_SHADER,
    // FRONT-SIDE. The basin is an opaque closed-above heightfield; DoubleSide was doubling its
    // fragment work for no stated reason (design doc §1.1) and, now that the mesh casts, would
    // have doubled the shadow-map fill too. Back faces are only visible from underground.
    side: THREE.FrontSide,
    fog: false,
    // Shadow reception only; the light model is still the tone ramp, and no scene light touches
    // this material's colour. `lights: true` is how Three is told to define NUM_DIR_LIGHT_SHADOWS
    // and upload the shadow map — see terrain_shadow_receive.js.
    lights: true,
    uniforms: withTerrainShadowUniforms(THREE, {
      uSunDirection: { value: vector3(THREE, profile.sunDirectionWorld) },
      uFogColor: { value: new THREE.Color(profile.fog.color) },
      uFogDensity: { value: profile.fog.density },
      uHazeBands: { value: profile.fog.hazeBands },
      uHazeBandBlend: { value: profile.fog.hazeBandBlend },
      uShadowFloor: { value: paint.shadowFloor },
      uOcclusionRange: { value: vector2(THREE, paint.occlusionRange) },
      uSlopeFaceWindow: { value: vector2(THREE, paint.slopeFaceWindow) },
      uToneGateLow: {
        value: new THREE.Vector2(paint.toneRampGates[0].start, paint.toneRampGates[0].end),
      },
      uToneGateHigh: {
        value: new THREE.Vector2(paint.toneRampGates[1].start, paint.toneRampGates[1].end),
      },
      uToneGateWeights: {
        value: new THREE.Vector2(paint.toneRampGates[0].weight, paint.toneRampGates[1].weight),
      },
      uReliefGain: { value: paint.reliefGain },
      uCloudShadowStrength: { value: paint.cloudShadowStrength },
      uParcelPitchM: { value: vector2(THREE, paint.parcelPitchM) },
      uSkyFill: { value: vector3(THREE, paint.skyFill) },
      uSunKey: { value: vector3(THREE, paint.sunKey) },
      uValleyFloor: { value: vector3(THREE, paint.bands.valleyFloor) },
      uCultivationGold: { value: vector3(THREE, paint.bands.cultivationGold) },
      uJungleMid: { value: vector3(THREE, paint.bands.jungleMid) },
      uLateriteSlope: { value: vector3(THREE, paint.bands.lateriteSlope) },
      uRidgeSage: { value: vector3(THREE, paint.bands.ridgeSage) },
      uRimRock: { value: vector3(THREE, paint.bands.rimRock) },
      uElevationBands: {
        value: new THREE.Vector4(...paint.elevationBandsM),
      },
    }),
  });
  return material;
}

/** Analytic river: depth gradient, grazing-angle sky, sun glint and a per-fragment gravel bank. */
export function createCobraCanyonRiverMaterial(THREE, profile) {
  const water = profile.water;
  const material = new THREE.ShaderMaterial({
    name: "COBRA_CANYON_RIVER_MATERIAL",
    vertexShader: RIVER_VERTEX_SHADER,
    fragmentShader: RIVER_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    fog: false,
    lights: true,
    uniforms: withTerrainShadowUniforms(THREE, {
      uSunDirection: { value: vector3(THREE, profile.sunDirectionWorld) },
      uFogColor: { value: new THREE.Color(profile.fog.color) },
      uFogDensity: { value: profile.fog.density },
      uHazeBands: { value: profile.fog.hazeBands },
      uHazeBandBlend: { value: profile.fog.hazeBandBlend },
      uDeepWater: { value: vector3(THREE, water.deepColor) },
      uShallowWater: { value: vector3(THREE, water.shallowColor) },
      uBankGravel: { value: vector3(THREE, water.bankColor) },
      uBankLight: { value: vector3(THREE, flatGroundLight(profile)) },
      uBankShadowLight: { value: vector3(THREE, flatGroundShadowLight(profile)) },
      uShoreWindow: { value: vector2(THREE, water.shoreWindow) },
    }),
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -2;
  return material;
}
