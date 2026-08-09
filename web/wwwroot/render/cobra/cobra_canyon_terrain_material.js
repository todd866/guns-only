// Cobra Canyon terrain and river materials.
//
// Broad landcover and light carry the image. Fine detail is deliberately bounded and fades with
// distance, so the renderer cannot manufacture "scenery" by filling every pixel with noise.

import { cobraAuthorityDirectionToThree } from "./cobra_canyon_visual_profile.js";

const BASIN_VERTEX_SHADER = /* glsl */ `
attribute float concavity;
varying vec3 vWorldPosition;
varying vec3 vTerrainNormal;
varying float vConcavity;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vTerrainNormal = normalize(mat3(modelMatrix) * normal);
  vConcavity = concavity;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const NOISE_CHUNK = /* glsl */ `
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
  return cobraNoise(p) * 0.58
    + cobraNoise(p * 2.07 + vec2(17.7, -9.2)) * 0.28
    + cobraNoise(p * 4.19 + vec2(-4.1, 23.6)) * 0.14;
}
`;

const HAZE_CHUNK = /* glsl */ `
vec3 cobraAerial(vec3 lit, vec3 worldPosition, vec3 fogColor, float fogDensity) {
  float distanceToCamera = length(cameraPosition - worldPosition);
  float aerial = 1.0 - exp(-fogDensity * fogDensity * distanceToCamera * distanceToCamera);
  return mix(lit, fogColor, smoothstep(0.0, 1.0, clamp(aerial, 0.0, 1.0)));
}
`;

const BASIN_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uShadowFloor;
uniform vec2 uOcclusionRange;
uniform vec2 uSlopeFaceWindow;
uniform vec2 uToneGateLow;
uniform vec2 uToneGateHigh;
uniform vec2 uToneGateWeights;
uniform float uReliefGain;
uniform float uCloudShadowStrength;
uniform float uMicroNormalStrength;
uniform sampler2D uGroundMacro;
uniform float uHasGroundMacro;
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
${NOISE_CHUNK}
${HAZE_CHUNK}

void main() {
  vec2 groundUv = vWorldPosition.xz;
  float viewDistanceM = length(cameraPosition - vWorldPosition);
  float nearDetail = 1.0 - smoothstep(240.0, 1700.0, viewDistanceM);

  vec3 geometryNormal = normalize(vTerrainNormal);
  vec3 normal = geometryNormal;
  // Put near-field energy into surface response instead of camouflage-coloured albedo. Three
  // cheap value-noise samples give the ground tooth under the skids and fade before aliasing.
  vec2 bumpUv = groundUv * 0.038;
  float bump = cobraNoise(bumpUv);
  float bumpEast = cobraNoise(bumpUv + vec2(0.52, 0.0));
  float bumpNorth = cobraNoise(bumpUv + vec2(0.0, 0.52));
  normal = normalize(normal + vec3(
    bump - bumpEast,
    0.0,
    bump - bumpNorth
  ) * uMicroNormalStrength * nearDetail);

  vec3 sunDirection = normalize(uSunDirection);
  float elevationM = vWorldPosition.y;
  float steepness = 1.0 - clamp(geometryNormal.y, 0.0, 1.0);
  float slopeFace = smoothstep(uSlopeFaceWindow.x, uSlopeFaceWindow.y, steepness);
  float flatGround = 1.0 - smoothstep(uSlopeFaceWindow.x * 0.55, uSlopeFaceWindow.x * 2.4, steepness);
  float lowland = 1.0 - smoothstep(uElevationBands.x, uElevationBands.y, elevationM);
  float upland = smoothstep(uElevationBands.y, uElevationBands.z, elevationM);
  float rimBand = smoothstep(uElevationBands.z, uElevationBands.w, elevationM);

  // Large, readable landcover masses. These frequencies remain visible from the opposite side of
  // the gorge and give the foliage instances somewhere visually credible to belong.
  float macro = cobraFbm(groundUv * 0.00078);
  float meso = cobraFbm(groundUv * 0.0034 + vec2(8.3, -4.7));
  float canopyMass = smoothstep(0.48, 0.72, macro * 0.76 + meso * 0.24);

  // Lowland fields are clustered, route-scale shapes with soft bunds. No hard pixel steps: a
  // field should read as land use, not as a debug checkerboard.
  vec2 parcelUv = mat2(0.94, 0.34, -0.34, 0.94) * groundUv;
  vec2 parcelGrid = parcelUv / uParcelPitchM;
  vec2 parcelCell = floor(parcelGrid);
  vec2 parcelLocal = fract(parcelGrid);
  float parcelSeed = cobraHash(parcelCell);
  float parcelShade = cobraHash(parcelCell + vec2(37.1, 11.7));
  float distanceToBund = min(
    min(parcelLocal.x, 1.0 - parcelLocal.x),
    min(parcelLocal.y, 1.0 - parcelLocal.y));
  float fieldInterior = smoothstep(0.025, 0.085, distanceToBund);
  float fieldCluster = smoothstep(0.43, 0.62, macro * 0.64 + meso * 0.36);
  float cultivation = lowland * flatGround * fieldCluster * smoothstep(0.42, 0.62, parcelSeed);

  vec3 albedo = mix(uValleyFloor, uRidgeSage, upland);
  albedo = mix(albedo, uJungleMid, canopyMass * (1.0 - cultivation * 0.78) * 0.68);
  vec3 fieldColor = mix(uCultivationGold * 0.84, uCultivationGold * 1.12, parcelShade);
  albedo = mix(albedo, fieldColor, cultivation * fieldInterior * 0.44);
  // Damp field bunds and concave drainage without drawing black outlines around every parcel.
  albedo = mix(albedo, uJungleMid * 0.82, cultivation * (1.0 - fieldInterior) * 0.12);
  float drainage = 1.0 - smoothstep(0.30, 0.52, vConcavity);
  albedo = mix(albedo, uJungleMid * 0.88, drainage * 0.22);
  albedo = mix(albedo, uLateriteSlope, slopeFace * (0.30 + 0.38 * upland));
  albedo = mix(albedo, uRimRock, rimBand * 0.70);

  // Portable authored macro-albedo at two deliberately separated scales. The broad sample makes
  // kilometre-scale canopy/clearing masses; a rotated near sample supplies leaf/litter breakup
  // under the skids and fades before it can alias. Mirrored wrapping keeps both joins continuous.
  vec2 authoredMacroUv = groundUv / 6200.0 + vec2(0.17, -0.11);
  mat2 authoredRotation = mat2(0.866, 0.500, -0.500, 0.866);
  vec2 authoredNearUv = authoredRotation * groundUv / 850.0 + vec2(0.31, 0.23);
  vec3 authoredMacro = texture2D(uGroundMacro, authoredMacroUv).rgb;
  // Slope-aware near sampling avoids dragging a top-down texel hundreds of metres down a gorge
  // wall. Macro identity stays plan-view; only the local material detail is triplanar.
  vec3 triplanarWeight = pow(abs(geometryNormal), vec3(4.0));
  triplanarWeight /= max(0.001, triplanarWeight.x + triplanarWeight.y + triplanarWeight.z);
  vec3 authoredNearXZ = texture2D(uGroundMacro, authoredNearUv).rgb;
  vec3 authoredNearZY = texture2D(
    uGroundMacro,
    authoredRotation * vWorldPosition.zy / 850.0 + vec2(0.61, -0.17)
  ).rgb;
  vec3 authoredNearXY = texture2D(
    uGroundMacro,
    authoredRotation * vWorldPosition.xy / 850.0 + vec2(-0.23, 0.47)
  ).rgb;
  vec3 authoredNear = authoredNearZY * triplanarWeight.x
    + authoredNearXZ * triplanarWeight.y
    + authoredNearXY * triplanarWeight.z;
  vec3 authoredGround = mix(authoredMacro, authoredNear, nearDetail * 0.22);
  vec3 authoredTint = authoredGround * vec3(0.98, 1.035, 0.91);
  float authoredWeight = uHasGroundMacro * (0.50 - cultivation * 0.14);
  albedo = mix(albedo, authoredTint, authoredWeight);
  float authoredMacroLuma = dot(authoredMacro, vec3(0.2126, 0.7152, 0.0722));
  float authoredNearLuma = dot(authoredNear, vec3(0.2126, 0.7152, 0.0722));
  float authoredDetail = clamp(
    (authoredNearLuma + 0.035) / (authoredMacroLuma + 0.035),
    0.84,
    1.16);
  albedo *= mix(1.0, authoredDetail, uHasGroundMacro * nearDetail * 0.38);

  // Bounded tonal variation only. Fine noise never changes biome and disappears with distance.
  float fine = cobraNoise(groundUv * 0.047 + vec2(11.0, -3.0));
  float valueVariation = 0.94 + (macro - 0.5) * 0.14 + (meso - 0.5) * 0.08
    + (fine - 0.5) * 0.08 * nearDetail;
  albedo *= clamp(valueVariation, 0.84, 1.10);

  float halfLambert = dot(normal, sunDirection) * 0.5 + 0.5;
  halfLambert *= halfLambert;
  float toneRamp = uShadowFloor + (1.0 - uShadowFloor) * (
    uToneGateWeights.x * smoothstep(uToneGateLow.x, uToneGateLow.y, halfLambert)
    + uToneGateWeights.y * smoothstep(uToneGateHigh.x, uToneGateHigh.y, halfLambert));
  // Humid ambient fill carries the lee side. The previous double tone-ramp multiplication made
  // any normal facing away from the key collapse into a near-black wall, even at noon.
  vec3 lit = albedo * mix(uSkyFill, uSunKey, toneRamp) * (0.72 + toneRamp * 0.28);

  vec2 sunPlanform = normalize(sunDirection.xz + vec2(0.0001));
  lit *= clamp(0.98 + dot(geometryNormal.xz, sunPlanform) * uReliefGain, 0.90, 1.08);
  lit *= mix(uOcclusionRange.x, uOcclusionRange.y, clamp(vConcavity, 0.0, 1.0));

  float cloudNoise = cobraNoise(groundUv * 0.00036) * 0.68
    + cobraNoise(groundUv * 0.00108 + vec2(13.7, 41.3)) * 0.32;
  lit *= 1.0 - uCloudShadowStrength * smoothstep(0.52, 0.80, cloudNoise);

  vec3 color = cobraAerial(lit, vWorldPosition, uFogColor, uFogDensity);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const RIVER_VERTEX_SHADER = /* glsl */ `
attribute vec4 riverFrame;
varying vec3 vWorldPosition;
varying vec4 vRiverFrame;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vRiverFrame = riverFrame;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const RIVER_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uDeepWater;
uniform vec3 uShallowWater;
uniform vec3 uBankGravel;
uniform vec3 uBankLight;
uniform vec2 uShoreWindow;
uniform sampler2D uGroundMacro;
uniform float uHasGroundMacro;
varying vec3 vWorldPosition;
varying vec4 vRiverFrame;
${NOISE_CHUNK}
${HAZE_CHUNK}

void main() {
  float lateral = abs((vWorldPosition.x - vRiverFrame.x) * vRiverFrame.z
    + (-vWorldPosition.z - vRiverFrame.y) * vRiverFrame.w);
  // A real waterline is ragged. Small, low-frequency movement in the threshold breaks the two
  // ruler-straight bands that made the gorge read as a concrete drainage canal.
  float bankBreakup = (cobraNoise(vWorldPosition.xz * 0.018) - 0.5) * 0.13;
  float shore = smoothstep(
    uShoreWindow.x + bankBreakup,
    uShoreWindow.y + bankBreakup,
    lateral);
  float depth = 1.0 - clamp(lateral, 0.0, 1.0);

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float phaseA = vWorldPosition.x * 0.032 + vWorldPosition.z * 0.019;
  float phaseB = vWorldPosition.x * -0.014 + vWorldPosition.z * 0.047 + 1.7;
  float rippleA = sin(phaseA);
  float rippleB = sin(phaseB);
  vec3 normal = normalize(vec3(
    -(0.032 * cos(phaseA) - 0.0077 * cos(phaseB)) * 1.8,
    1.0,
    -(0.019 * cos(phaseA) + 0.026 * cos(phaseB)) * 1.8));

  vec3 water = mix(uShallowWater, uDeepWater, smoothstep(0.12, 0.82, depth));
  float flowVariation = cobraNoise(vWorldPosition.xz * 0.012);
  water *= 0.95 + (flowVariation - 0.5) * 0.08 + (rippleA + rippleB * 0.45) * 0.018;
  float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
  water = mix(water, uFogColor * 0.58, fresnel * 0.16);
  vec3 halfVector = normalize(viewDirection + normalize(uSunDirection));
  water += vec3(0.72, 0.70, 0.58)
    * pow(max(dot(normal, halfVector), 0.0), 96.0) * 0.032;

  float gravelGrain = cobraNoise(vWorldPosition.xz * 0.045) * 0.65
    + cobraNoise(vWorldPosition.xz * 0.16) * 0.35;
  vec2 bankMacroUv = vWorldPosition.xz / 6200.0 + vec2(0.17, -0.11);
  vec3 bankGround = texture2D(uGroundMacro, bankMacroUv).rgb * vec3(0.88, 0.96, 0.80);
  vec3 gravel = mix(
    uBankGravel * uBankLight,
    bankGround,
    uHasGroundMacro * 0.56
  ) * (0.88 + 0.22 * gravelGrain);
  vec3 lit = mix(water, gravel, shore);
  vec3 color = cobraAerial(lit, vWorldPosition, uFogColor, uFogDensity);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function smoothstep01(edge0, edge1, value) {
  const unit = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return unit * unit * (3 - 2 * unit);
}

export function flatGroundLight(profile) {
  const paint = profile.terrainPaint;
  const halfLambert = (profile.sunDirectionAuthority[1] * 0.5 + 0.5) ** 2;
  const ramp = paint.toneRampGates.reduce(
    (total, gate) => total + gate.weight * smoothstep01(gate.start, gate.end, halfLambert),
    0,
  );
  const tone = paint.shadowFloor + (1 - paint.shadowFloor) * ramp;
  const ambientCarry = 0.72 + tone * 0.28;
  return paint.skyFill.map((fill, channel) =>
    (fill + (paint.sunKey[channel] - fill) * tone) * ambientCarry);
}

function vector3(THREE, triple) {
  return new THREE.Vector3(triple[0], triple[1], triple[2]);
}

function vector2(THREE, pair) {
  return new THREE.Vector2(pair[0], pair[1]);
}

export function createCobraCanyonBasinMaterial(THREE, profile, options = {}) {
  const paint = profile.terrainPaint;
  const sunDirectionThree = cobraAuthorityDirectionToThree(profile.sunDirectionAuthority);
  return new THREE.ShaderMaterial({
    name: "COBRA_CANYON_BASIN_MATERIAL",
    vertexShader: BASIN_VERTEX_SHADER,
    fragmentShader: BASIN_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uSunDirection: { value: vector3(THREE, sunDirectionThree) },
      uFogColor: { value: new THREE.Color(profile.fog.color) },
      uFogDensity: { value: profile.fog.density },
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
      uMicroNormalStrength: { value: paint.microNormalStrength },
      uGroundMacro: { value: options.groundTexture ?? null },
      uHasGroundMacro: { value: options.groundTexture ? 1 : 0 },
      uParcelPitchM: { value: vector2(THREE, paint.parcelPitchM) },
      uSkyFill: { value: vector3(THREE, paint.skyFill) },
      uSunKey: { value: vector3(THREE, paint.sunKey) },
      uValleyFloor: { value: vector3(THREE, paint.bands.valleyFloor) },
      uCultivationGold: { value: vector3(THREE, paint.bands.cultivationGold) },
      uJungleMid: { value: vector3(THREE, paint.bands.jungleMid) },
      uLateriteSlope: { value: vector3(THREE, paint.bands.lateriteSlope) },
      uRidgeSage: { value: vector3(THREE, paint.bands.ridgeSage) },
      uRimRock: { value: vector3(THREE, paint.bands.rimRock) },
      uElevationBands: { value: new THREE.Vector4(...paint.elevationBandsM) },
    },
  });
}

export function createCobraCanyonRiverMaterial(THREE, profile, options = {}) {
  const water = profile.water;
  const sunDirectionThree = cobraAuthorityDirectionToThree(profile.sunDirectionAuthority);
  const material = new THREE.ShaderMaterial({
    name: "COBRA_CANYON_RIVER_MATERIAL",
    vertexShader: RIVER_VERTEX_SHADER,
    fragmentShader: RIVER_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uSunDirection: { value: vector3(THREE, sunDirectionThree) },
      uFogColor: { value: new THREE.Color(profile.fog.color) },
      uFogDensity: { value: profile.fog.density },
      uDeepWater: { value: vector3(THREE, water.deepColor) },
      uShallowWater: { value: vector3(THREE, water.shallowColor) },
      uBankGravel: { value: vector3(THREE, water.bankColor) },
      uBankLight: { value: vector3(THREE, flatGroundLight(profile)) },
      uShoreWindow: { value: vector2(THREE, water.shoreWindow) },
      uGroundMacro: { value: options.groundTexture ?? null },
      uHasGroundMacro: { value: options.groundTexture ? 1 : 0 },
    },
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -2;
  return material;
}
