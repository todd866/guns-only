import {
  createKoreaSceneryRuntime,
  disposeKoreaSceneryTile,
} from "./korea_scenery.js";
import {
  buildTerrainMeshArrays,
  reconstructWaterHeights,
  TERRAIN_CONCAVITY_RADIUS_M,
  TERRAIN_CONCAVITY_RELIEF_M,
} from "./terrain_mesh_builder.js";

const DEFAULT_MANIFEST_URL = new URL(
  "../../content/packs/korea-1950s/environment/terrain/central-front.manifest.json",
  import.meta.url,
).href;

const TIER_DISTANCE_METRES = Object.freeze({
  mobile: Object.freeze([10_000, 25_000, 58_000]),
  balanced: Object.freeze([16_000, 42_000, 88_000]),
  // Valley walls remain a primary flight reference well beyond one tile. Keeping the 64 m source
  // grid resident through the first two tile rings prevents the authored 40–60 degree walls from
  // collapsing into visible 128 m contour shelves in low-altitude desktop views.
  desktop: Object.freeze([40_000, 76_000, 128_000]),
});

const TIER_STREAMING = Object.freeze({
  mobile: Object.freeze({ lookAheadSeconds: 12, pageLoads: 1 }),
  balanced: Object.freeze({ lookAheadSeconds: 20, pageLoads: 2 }),
  desktop: Object.freeze({ lookAheadSeconds: 28, pageLoads: 3 }),
});
const MAX_STREAM_LOOK_AHEAD_METRES = 24_000;

export const TERRAIN_CURVATURE_START_M = 12_000;
export const TERRAIN_EARTH_RADIUS_M = 6_371_000;

// Baked terrain occlusion. The sampling radius is expressed in METRES and converted to samples
// per LOD, so a valley reads with the same enclosure at 64 m and at 256 m spacing and does not
// pop across an LOD change. 300 m is about the floor width of a Korean central-highland valley.
// Relief that saturates the attribute clamps at TERRAIN_CONCAVITY_RELIEF_M, so a 1,500 m ridge
// wall does not crush every lesser fold to black. Both live in terrain_mesh_builder.js — the
// meshing maths had to leave this module so a Worker could run it — and are re-exported here
// because they are part of this module's published surface.
export { TERRAIN_CONCAVITY_RADIUS_M, TERRAIN_CONCAVITY_RELIEF_M, reconstructWaterHeights };

export function terrainCurvatureDropM(radialDistanceM) {
  const curvedRadialM = Math.max(finite(radialDistanceM) - TERRAIN_CURVATURE_START_M, 0);
  return curvedRadialM * curvedRadialM / (2 * TERRAIN_EARTH_RADIUS_M);
}

const TERRAIN_VERTEX = /* glsl */ `
uniform float uEarthRadiusM;
uniform float uCurvatureStartM;
attribute float terrainWater;
varying vec3 vTerrainNormal;
varying vec3 vTerrainWorldPosition;
varying float vTerrainHeight;
varying float vTerrainWater;
attribute float concavity;
varying float vConcavity;
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // The shared collision format retains a water sentinel rather than a second surface height.
  // Renderer-side water vertices are reconstructed at their bank elevation below; this small lift
  // keeps the analytic water treatment cleanly above its supporting surface without a slot trench.
  world.y += terrainWater * 0.35;
  float radial = distance(world.xz, cameraPosition.xz);
  float curvedRadial = max(radial - uCurvatureStartM, 0.0);
  world.y -= curvedRadial * curvedRadial / (2.0 * uEarthRadiusM);
  vTerrainNormal = normalize(mat3(modelMatrix) * normal);
  vTerrainWorldPosition = world.xyz;
  vTerrainHeight = position.y;
  vTerrainWater = terrainWater;
  vConcavity = concavity;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const TERRAIN_FRAGMENT = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uModernScenery;
uniform float uParcelTint;
uniform float uShadowFloor;
uniform vec2 uOcclusionRange;
uniform float uHazeBands;
uniform float uHazeBandBlend;
varying float vConcavity;
varying vec3 vTerrainNormal;
varying vec3 vTerrainWorldPosition;
varying float vTerrainHeight;
varying float vTerrainWater;
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  vec3 normal = normalize(vTerrainNormal);
  float elevation = smoothstep(70.0, 1250.0, vTerrainHeight);
  float highRidge = smoothstep(680.0, 1500.0, vTerrainHeight);
  float steepness = 1.0 - clamp(normal.y, 0.0, 1.0);
  float valleyFloor = (1.0 - smoothstep(240.0, 560.0, vTerrainHeight))
    * (1.0 - smoothstep(0.035, 0.11, steepness));
  float upperSlope = smoothstep(320.0, 980.0, vTerrainHeight);
  // normal.y hides useful angle separation near vertical: 20 degrees is only 0.06 steepness.
  // These thresholds deliberately open the slope palette before a wall becomes cliff-like.
  float slopeFace = smoothstep(0.035, 0.19, steepness);
  float exposedFace = smoothstep(0.10, 0.30, steepness)
    * (0.24 + 0.76 * smoothstep(420.0, 1050.0, vTerrainHeight));

  #ifndef MODERN_SCENERY
  // This is an authored 1950s readability treatment, not a claim of per-pixel historical land
  // cover. Geometry and water are sourced; vegetation/cultivation become dated data layers later.
  vec3 valley = vec3(0.22, 0.27, 0.075);
  vec3 upland = vec3(0.075, 0.13, 0.035);
  vec3 drySlope = vec3(0.27, 0.17, 0.075);
  vec3 ridge = vec3(0.32, 0.31, 0.26);
  vec3 albedo = mix(valley, upland, smoothstep(210.0, 880.0, vTerrainHeight));
  albedo = mix(albedo, drySlope, slopeFace * (0.24 + upperSlope * 0.54));
  albedo = mix(albedo, ridge, max(highRidge * 0.64, exposedFace * 0.72));
  // Parcel/cultivation tint is the shader's most expensive fragment work (four sin() plus two
  // nested sin()). It is a fine-grain readability treatment only visible up close, so a tier
  // uniform gates it off entirely on the mobile/balanced visual tiers where fill-rate is scarce,
  // and in the modern era where the final era mix discards this complete period-lighting path.
  // uParcelTint is a compile-time-constant-per-material uniform, so the branch is fully coherent.
  if (uParcelTint > 0.5) {
    float lowland = (1.0 - smoothstep(180.0, 720.0, vTerrainHeight))
      * (1.0 - smoothstep(0.08, 0.42, steepness));
    float parcelA = 0.5 + 0.5 * sin(vTerrainWorldPosition.x * 0.0061
      + sin(vTerrainWorldPosition.z * 0.0017) * 1.8);
    float parcelB = 0.5 + 0.5 * sin(vTerrainWorldPosition.z * 0.0083
      + sin(vTerrainWorldPosition.x * 0.0013) * 2.1);
    float parcels = smoothstep(0.31, 0.69, parcelA * 0.56 + parcelB * 0.44);
    vec3 periodCultivation = mix(vec3(0.19, 0.24, 0.055), vec3(0.36, 0.31, 0.09), parcels);
    vec3 modernCultivation = mix(vec3(0.12, 0.24, 0.050), vec3(0.31, 0.29, 0.075), parcels);
    albedo = mix(albedo, mix(periodCultivation, modernCultivation, uModernScenery),
      lowland * (0.22 + parcels * 0.24));
  }

  float diffuse = uShadowFloor
    + (1.0 - uShadowFloor) * max(dot(normal, normalize(uSunDirection)), 0.0);
  vec3 lit = albedo * diffuse;

  #else
  // 2030s illustrative treatment (docs/art-direction.md): Team Fortress 2-lineage shading —
  // half-Lambert so shadowed valley walls never crush to black, a soft-edged two-step tone
  // ramp for the painterly value structure, a saturated banded palette so elevation reads as
  // contour bands at combat speed, and a cool sky rim on upward-facing slopes. The 1950s era
  // keeps the sourced-realism lean above; the doctrine contrast is deliberate.
  float bandStep = smoothstep(0.12, 0.22, elevation) * 0.34
    + smoothstep(0.42, 0.55, elevation) * 0.33
    + smoothstep(0.75, 0.88, elevation) * 0.33;
  // Sage/olive lowlands, umber slopes and cool-grey ridges form the authored modern-era bands.
  // Values stay deliberately below the old pale-bone range so ACES preserves colour separation.
  vec3 sValley = vec3(0.15, 0.24, 0.055);
  vec3 sFoothill = vec3(0.070, 0.13, 0.032);
  vec3 sUpland = vec3(0.040, 0.075, 0.030);
  vec3 sRock = vec3(0.25, 0.15, 0.060);
  vec3 sRidge = vec3(0.31, 0.29, 0.23);
  vec3 sAlbedo = mix(sValley, sFoothill, bandStep);
  sAlbedo = mix(sAlbedo, sUpland, upperSlope * 0.76);
  float patchwork = 0.5 + 0.5 * sin(vTerrainWorldPosition.x * 0.00023
    + sin(vTerrainWorldPosition.z * 0.00017) * 2.3);
  vec3 cultivation = mix(vec3(0.17, 0.25, 0.050), vec3(0.32, 0.29, 0.075),
    smoothstep(0.32, 0.68, patchwork));
  sAlbedo = mix(sAlbedo, cultivation, valleyFloor * (0.34 + patchwork * 0.30));
  sAlbedo = mix(sAlbedo, sRock, slopeFace * (0.24 + upperSlope * 0.56));
  sAlbedo = mix(sAlbedo, sRidge, max(highRidge * 0.68, exposedFace * 0.78));
  float halfLambert = dot(normal, normalize(uSunDirection)) * 0.5 + 0.5;
  halfLambert *= halfLambert;
  float toneRamp = uShadowFloor
    + (1.0 - uShadowFloor) * (0.42 * smoothstep(0.26, 0.40, halfLambert)
      + 0.58 * smoothstep(0.58, 0.76, halfLambert));
  vec3 viewDirection = normalize(cameraPosition - vTerrainWorldPosition);
  float rim = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
  vec3 stylizedLit = sAlbedo * toneRamp
    + rim * vec3(0.055, 0.075, 0.11) * (0.4 + 0.6 * clamp(normal.y, 0.0, 1.0));

  vec3 lit = stylizedLit;
  #endif

  // Baked enclosure darkens valley floors and lets ridge crests catch light. This is the term the
  // renderer was missing relative to the source hillshade in central-front-preview.png. Applied to
  // the terrain BEFORE water is composited, so open water keeps its own analytic shading.
  lit *= mix(uOcclusionRange.x, uOcclusionRange.y, clamp(vConcavity, 0.0, 1.0));

  // Inland source-water samples share the same analytic language as the shipped ocean: cool
  // blue-green body colour, grazing-angle sky reflection, restrained sun glint and metre-scale
  // directional breakup. The bank-height reconstruction in createTerrainGeometry keeps this
  // surface on the valley floor instead of stretching sentinel vertices down to sea level.
  // Era-independent: the rivers exist in both Koreas, so the water term sits outside the
  // compiled era specialization with its own view vector.
  vec3 waterView = normalize(cameraPosition - vTerrainWorldPosition);
  float waterFacing = clamp(dot(normal, waterView), 0.0, 1.0);
  float waterFresnel = pow(1.0 - waterFacing, 3.0);
  float waterRipple = sin(vTerrainWorldPosition.x * 0.012
      + vTerrainWorldPosition.z * 0.006)
    + 0.55 * sin(vTerrainWorldPosition.x * -0.005
      + vTerrainWorldPosition.z * 0.017 + 1.7);
  vec3 waterLit = mix(vec3(0.025, 0.13, 0.17), vec3(0.10, 0.30, 0.34),
    0.24 + waterFresnel * 0.58);
  waterLit *= 0.94 + waterRipple * 0.035;
  vec3 waterHalf = normalize(waterView + normalize(uSunDirection));
  waterLit += vec3(0.88, 0.82, 0.66)
    * pow(max(dot(normal, waterHalf), 0.0), 96.0) * 0.42;
  float waterMask = smoothstep(0.18, 0.82, vTerrainWater);
  lit = mix(lit, waterLit, waterMask);

  // Illustrative atmosphere: the period haze whites the world out from altitude, which is
  // period-honest but buries the 2030s palette entirely. The modern era thins the density and
  // hazes toward a saturated sky blue instead of white — distance stays readable as COLOR.
  #ifdef MODERN_SCENERY
  float fogDensity = uFogDensity * 0.45;
  vec3 hazeColor = vec3(0.36, 0.52, 0.68);
  #else
  float fogDensity = uFogDensity;
  vec3 hazeColor = uFogColor;
  #endif
  float distanceToCamera = length(cameraPosition - vTerrainWorldPosition);
  float aerial = 1.0 - exp(-fogDensity * fogDensity
    * distanceToCamera * distanceToCamera);
  if (uHazeBands > 0.5) {
    float banded = floor(aerial * uHazeBands) / uHazeBands;
    aerial = mix(aerial, banded, uHazeBandBlend);
  }
  vec3 color = mix(lit, hazeColor, clamp(aerial, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
  #include <logdepthbuf_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function validateTerrainManifest(value) {
  if (!value || value.schemaVersion !== "1.0.0"
    || typeof value.terrainId !== "string"
    || !Array.isArray(value.boundsLocalM) || value.boundsLocalM.length !== 4
    || !value.boundsLocalM.every(Number.isFinite)
    || !value.bundle || typeof value.bundle.uri !== "string"
    || !/^[0-9a-f]{64}$/.test(value.bundle.sha256)
    || !Number.isSafeInteger(value.bundle.byteLength) || value.bundle.byteLength <= 0
    || !Array.isArray(value.chunks) || value.chunks.length === 0) {
    throw new TypeError("Invalid Korea terrain manifest.");
  }
  const quantization = value.quantization;
  if (!quantization || quantization.storage !== "little-endian-signed-int16"
    || !Number.isFinite(quantization.metresPerUnit)
    || quantization.metresPerUnit <= 0
    || !Number.isInteger(quantization.waterSentinel)) {
    throw new TypeError("Invalid Korea terrain quantization contract.");
  }
  for (const chunk of value.chunks) {
    if (typeof chunk?.id !== "string"
      || !Array.isArray(chunk.boundsLocalM) || chunk.boundsLocalM.length !== 4
      || !chunk.boundsLocalM.every(Number.isFinite)
      || !Array.isArray(chunk.lods) || chunk.lods.length === 0) {
      throw new TypeError("Invalid Korea terrain chunk contract.");
    }
    for (const [level, lod] of chunk.lods.entries()) {
      if (lod.level !== level || !Number.isInteger(lod.sampleCount) || lod.sampleCount < 2
        || !Number.isSafeInteger(lod.byteOffset) || lod.byteOffset < 0
        || !Number.isSafeInteger(lod.byteLength) || lod.byteLength !== lod.sampleCount ** 2 * 2
        || lod.byteOffset + lod.byteLength > value.bundle.byteLength) {
        throw new TypeError(`Invalid Korea terrain LOD record for ${chunk.id}.`);
      }
    }
  }
  return value;
}

export function validateTerrainAtlasManifest(value) {
  if (!value || value.schemaVersion !== "2.0.0"
    || typeof value.terrainId !== "string"
    || !Array.isArray(value.boundsLocalM) || value.boundsLocalM.length !== 4
    || !value.boundsLocalM.every(Number.isFinite)
    || !Number.isFinite(value.tileSpanM) || value.tileSpanM <= 0
    || !Number.isFinite(value.pageSpanM) || value.pageSpanM < value.tileSpanM
    || !Array.isArray(value.pages) || value.pages.length === 0) {
    throw new TypeError("Invalid Korea terrain atlas manifest.");
  }
  const ids = new Set();
  for (const page of value.pages) {
    if (typeof page?.id !== "string" || ids.has(page.id)
      || !Array.isArray(page.boundsLocalM) || page.boundsLocalM.length !== 4
      || !page.boundsLocalM.every(Number.isFinite)
      || typeof page.manifest?.uri !== "string"
      || !/^[0-9a-f]{64}$/.test(page.manifest.sha256)
      || !Number.isSafeInteger(page.manifest.byteLength)
      || page.manifest.byteLength <= 0) {
      throw new TypeError(`Invalid Korea terrain atlas page: ${page?.id ?? "unknown"}.`);
    }
    ids.add(page.id);
  }
  return value;
}

function distanceToBounds(eastM, northM, bounds) {
  const deltaEast = eastM < bounds[0] ? bounds[0] - eastM
    : eastM > bounds[2] ? eastM - bounds[2] : 0;
  const deltaNorth = northM < bounds[1] ? bounds[1] - northM
    : northM > bounds[3] ? northM - bounds[3] : 0;
  return Math.hypot(deltaEast, deltaNorth);
}

export function selectTerrainLod(distanceM, tier = "balanced", lodCount = 4,
  currentLevel = null, hysteresis = 0.12) {
  const thresholds = TIER_DISTANCE_METRES[tier] ?? TIER_DISTANCE_METRES.balanced;
  const distance = Math.max(0, finite(distanceM));
  const maximumLevel = Math.max(0, lodCount - 1);
  // Floor the near-ground LOD on the weak tiers: mobile/balanced never draw the 257^2 LOD0 surface
  // (nor its LOD0-only near-chunk tree/building scenery) even at the surface, capping fill-rate and
  // overdraw where it hurts most. Desktop retains full LOD0 detail. Clamped to the chunk's coarsest
  // available level so a single-LOD chunk is unaffected.
  const minimumLevel = tier === "desktop" ? 0 : Math.min(1, maximumLevel);
  let selected = thresholds.findIndex((threshold) => distance < threshold);
  if (selected < 0) selected = thresholds.length;
  selected = Math.min(maximumLevel, Math.max(minimumLevel, selected));
  if (!Number.isInteger(currentLevel) || currentLevel < 0 || currentLevel > maximumLevel) {
    return selected;
  }
  const margin = Math.min(0.45, Math.max(0, finite(hysteresis, 0.12)));
  let level = Math.max(minimumLevel, currentLevel);
  while (level > minimumLevel && distance < thresholds[level - 1] * (1 - margin)) level--;
  while (level < maximumLevel && distance >= thresholds[level] * (1 + margin)) level++;
  return level;
}

export function decodeTerrainRecord(buffer, record, quantization) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== record.byteLength) {
    throw new RangeError("Terrain record byte length does not match its manifest.");
  }
  const view = new DataView(buffer);
  const count = record.sampleCount ** 2;
  const heights = new Float32Array(count);
  const water = new Uint8Array(count);
  const scale = quantization.metresPerUnit;
  const sentinel = quantization.waterSentinel;
  for (let index = 0; index < count; index++) {
    const value = view.getInt16(index * 2, true);
    const isWater = value === sentinel;
    water[index] = isWater ? 1 : 0;
    heights[index] = isWater ? 0 : value * scale;
  }
  return { heights, water, sampleCount: record.sampleCount };
}

/// Wrap a finished mesh from terrain_mesh_builder.js in renderer objects. Everything here is O(1)
/// in the size of the chunk — BufferAttribute construction only takes ownership of an array it is
/// handed — which is exactly why the arithmetic was moved out: this part is safe on a render
/// frame, and the loops that produce those arrays were not.
export function assembleTerrainGeometry(THREE, built) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(built.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(built.normals, 3));
  geometry.setAttribute("terrainWater", new THREE.BufferAttribute(built.waterValues, 1));
  geometry.setAttribute("concavity", new THREE.BufferAttribute(built.concavity, 1));
  geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
  geometry.addGroup(0, built.surfaceIndexCount, 0);
  if (built.indices.length > built.surfaceIndexCount) {
    geometry.addGroup(built.surfaceIndexCount,
      built.indices.length - built.surfaceIndexCount, 1);
  }
  const sphere = built.boundingSphere;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(sphere.centre[0], sphere.centre[1], sphere.centre[2]), sphere.radius);
  return {
    geometry,
    centreEast: built.centreEast,
    centreNorth: built.centreNorth,
    triangleCount: built.triangleCount,
    surfaceTriangleCount: built.surfaceTriangleCount,
    skirtDepthM: built.skirtDepthM,
    normalBoundary: Object.freeze({
      indices: built.boundaryIndices,
      normals: built.boundaryNormals,
    }),
  };
}

/// Build a chunk mesh synchronously. This is the fallback path (and the one the tests drive); the
/// streaming runtime prefers the worker pool, which runs the identical builder off-thread.
export function createTerrainGeometry(THREE, chunk, decoded) {
  return assembleTerrainGeometry(THREE, buildTerrainMeshArrays(chunk.boundsLocalM, decoded));
}


export class TerrainBundleReader {
  constructor(bundleUrl, byteLength, fetchImpl = fetch, maximumCachedRanges = 96) {
    this.bundleUrl = bundleUrl;
    this.byteLength = byteLength;
    // Native window.fetch rejects an arbitrary receiver. Wrapping it keeps the eventual request a
    // bare call instead of `reader.fetch(...)`, which otherwise binds `this` to this reader and
    // leaves every terrain chunk stuck in its retry loop with an "Illegal invocation" error.
    this.fetch = (...args) => fetchImpl(...args);
    this.completeBuffer = null;
    this.rangeCache = new Map();
    this.pendingRanges = new Map();
    this.rangeCapability = null;
    this.capabilityProbe = null;
    this.networkRequests = 0;
    this.networkBytes = 0;
    this.rangeCacheHits = 0;
    this.maximumCachedRanges = Math.max(1, Math.round(finite(maximumCachedRanges, 96)));
  }

  async read(record) {
    if (this.completeBuffer) {
      this.rangeCacheHits++;
      return this.completeBuffer.slice(record.byteOffset, record.byteOffset + record.byteLength);
    }
    const key = `${record.byteOffset}:${record.byteLength}`;
    const cached = this.rangeCache.get(key);
    if (cached) {
      this.rangeCacheHits++;
      this.rangeCache.delete(key);
      this.rangeCache.set(key, cached);
      return cached;
    }
    const pending = this.pendingRanges.get(key);
    if (pending) {
      this.rangeCacheHits++;
      return pending;
    }
    if (this.rangeCapability === null && this.capabilityProbe) {
      await this.capabilityProbe;
      return this.read(record);
    }
    const request = this.readRange(record, key);
    this.pendingRanges.set(key, request);
    const isCapabilityProbe = this.rangeCapability === null;
    if (isCapabilityProbe) this.capabilityProbe = request;
    try {
      return await request;
    } finally {
      if (this.pendingRanges.get(key) === request) this.pendingRanges.delete(key);
      if (isCapabilityProbe && this.capabilityProbe === request
        && this.rangeCapability === null) this.capabilityProbe = null;
    }
  }

  async readRange(record, key) {
    const end = record.byteOffset + record.byteLength - 1;
    this.networkRequests++;
    const response = await this.fetch(this.bundleUrl, {
      headers: { Range: `bytes=${record.byteOffset}-${end}` },
    });
    if (!response.ok) {
      throw new Error(`Terrain bundle request failed: ${response.status} ${this.bundleUrl}`);
    }
    const buffer = await response.arrayBuffer();
    this.networkBytes += buffer.byteLength;
    if (response.status === 200) {
      if (buffer.byteLength !== this.byteLength) {
        throw new RangeError("Terrain server ignored Range and returned an incomplete bundle.");
      }
      this.completeBuffer = buffer;
      this.rangeCapability = false;
      this.rangeCache.clear();
      return buffer.slice(record.byteOffset, record.byteOffset + record.byteLength);
    }
    if (response.status !== 206 || buffer.byteLength !== record.byteLength) {
      throw new RangeError("Terrain range response does not match its manifest record.");
    }
    this.rangeCapability = true;
    this.rangeCache.set(key, buffer);
    while (this.rangeCache.size > this.maximumCachedRanges) {
      this.rangeCache.delete(this.rangeCache.keys().next().value);
    }
    return buffer;
  }

  diagnostics() {
    return Object.freeze({
      networkRequests: this.networkRequests,
      networkBytes: this.networkBytes,
      cachedRanges: this.rangeCache.size,
      pendingRanges: this.pendingRanges.size,
      rangeCacheHits: this.rangeCacheHits,
      completeBundleFallback: this.completeBuffer !== null,
      rangeSupported: this.rangeCapability,
    });
  }
}

export function createTerrainMaterial(THREE, options = {}) {
  return new THREE.ShaderMaterial({
    name: "MAT_KOREA_CENTRAL_FRONT_TERRAIN",
    vertexShader: TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    // The winding leaves the sourced top surface front-facing with +Y normals (see the geometry
    // comment above), so single-siding it halves the dominant terrain fragment cost. The seam
    // skirts keep their own double-sided material via a geometry group.
    side: THREE.FrontSide,
    defines: options.sceneryEra === "modern" ? { MODERN_SCENERY: 1 } : {},
    uniforms: {
      uEarthRadiusM: { value: TERRAIN_EARTH_RADIUS_M },
      uCurvatureStartM: { value: TERRAIN_CURVATURE_START_M },
      uSunDirection: {
        value: (options.sunDirection ?? new THREE.Vector3(0.32, 0.78, -0.53)).clone().normalize(),
      },
      uFogColor: { value: new THREE.Color(options.fogColor ?? 0x6f8790) },
      uFogDensity: { value: finite(options.fogDensity, 0.000055) },
      uModernScenery: { value: options.sceneryEra === "modern" ? 1 : 0 },
      // Full-detail parcel/cultivation tint only affects the period desktop treatment. Modern
      // shading discards periodLit, so skip its four otherwise invisible sin() calls there too.
      uParcelTint: {
        value: options.qualityTier === "desktop" && options.sceneryEra !== "modern" ? 1 : 0,
      },
      // Darkest-slope lighting. The old 0.43 / 0.40 floors put every slope in the world inside the
      // top 60% of the value range, which is why densely dissected Korean terrain rendered as a
      // flat wash. Legibility now comes from value, and hue separation keeps dark slopes readable.
      uShadowFloor: { value: finite(options.shadowFloor, 0.12) },
      // Baked-occlusion multiplier at fully concave (x) and fully convex (y).
      uOcclusionRange: {
        value: new THREE.Vector2(
          finite(options.occlusionMin, 0.55),
          finite(options.occlusionMax, 1.12),
        ),
      },
      // Discrete aerial-perspective planes. Stacked ridges each land on their own value step,
      // which is what makes receding terrain read as depth rather than as fade.
      uHazeBands: { value: finite(options.hazeBands, 6) },
      uHazeBandBlend: { value: finite(options.hazeBandBlend, 0.65) },
    },
  });
}

// Companion material for the perimeter skirts only. It shares the surface material's uniforms
// object by reference, so every uniform update (fog, sun, era) reaches both with no extra work; it
// differs solely in rendering both faces so a seam skirt is never culled from the viewing side.
function createTerrainSkirtMaterial(THREE, surfaceMaterial) {
  return new THREE.ShaderMaterial({
    name: "MAT_KOREA_CENTRAL_FRONT_TERRAIN_SKIRT",
    vertexShader: TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    side: THREE.DoubleSide,
    defines: { ...surfaceMaterial.defines },
    uniforms: surfaceMaterial.uniforms,
  });
}

function setTerrainMaterialEra(material, era) {
  const modern = era === "modern";
  const wasModern = material.defines?.MODERN_SCENERY === 1;
  material.uniforms.uModernScenery.value = modern ? 1 : 0;
  if (modern === wasModern) return;
  material.defines = modern ? { ...material.defines, MODERN_SCENERY: 1 } : {};
  material.needsUpdate = true;
}

function disposeMeshScenery(mesh) {
  if (!mesh) return;
  for (const child of [...mesh.children]) {
    if (child.userData?.scenery) disposeKoreaSceneryTile(child);
  }
  delete mesh.userData.scenery;
}

class TerrainChunkBuildScheduler {
  constructor(options = {}) {
    this.requestFrame = options.requestTerrainBuildFrame
      ?? globalThis.requestAnimationFrame?.bind(globalThis)
      ?? ((callback) => setTimeout(callback, 0));
    this.cancelFrame = options.cancelTerrainBuildFrame
      ?? globalThis.cancelAnimationFrame?.bind(globalThis)
      ?? clearTimeout;
    this.queue = [];
    this.nextSequence = 0;
    this.frameHandle = null;
    this.disposed = false;
  }

  enqueue(owner, priority, build, discard) {
    const work = {
      owner,
      priority,
      build,
      discard,
      sequence: this.nextSequence++,
    };
    if (this.disposed) {
      discard();
      return null;
    }
    this.queue.push(work);
    this.scheduleFrame();
    return work;
  }

  scheduleFrame() {
    if (this.disposed || this.frameHandle !== null || !this.queue.length) return;
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null;
      try {
        this.buildNext();
      } finally {
        this.scheduleFrame();
      }
    });
  }

  buildNext() {
    if (this.disposed || !this.queue.length) return;
    this.queue.sort((left, right) => {
      const leftPriority = finite(left.priority(), Number.POSITIVE_INFINITY);
      const rightPriority = finite(right.priority(), Number.POSITIVE_INFINITY);
      return leftPriority - rightPriority || left.sequence - right.sequence;
    });
    this.queue.shift().build();
  }

  cancel(work) {
    if (!work) return false;
    const index = this.queue.indexOf(work);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    work.discard();
    this.cancelFrameIfIdle();
    return true;
  }

  cancelOwner(owner) {
    const cancelled = this.queue.filter((work) => work.owner === owner);
    this.queue = this.queue.filter((work) => work.owner !== owner);
    for (const work of cancelled) work.discard();
    this.cancelFrameIfIdle();
  }

  cancelFrameIfIdle() {
    if (this.queue.length || this.frameHandle === null) return;
    this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameHandle !== null) this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    for (const work of this.queue.splice(0)) work.discard();
  }
}

/// A small pool of Workers that mesh terrain chunks off the render thread.
///
/// This is the fix for the dominant frame stall. One LOD0 chunk takes ~9.5 ms of pure array
/// arithmetic — 57% of a 60 fps frame — and the build scheduler above could only ever spread that
/// cost one chunk per animation frame, which turns a burst of streaming into a run of 33-50 ms
/// frames. Telemetry from a Build 112 sortie showed `geometries` going 88 -> 126 inside one five
/// second window with frame_ms_max at 217-400 ms, while triangles and draw calls barely moved:
/// the work was never on the GPU, so no amount of shedding pixels could reach it.
///
/// The pool is strictly an optimisation. Every failure mode — no Worker constructor (Node, older
/// embedders), a module that will not load, a runtime error mid-build — resolves to `null` and the
/// caller meshes synchronously exactly as before. Never let a worker failure fail a chunk.
class TerrainMeshWorkerPool {
  constructor(options = {}) {
    this.disposed = false;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.workers = [];
    const createWorker = options.createTerrainMeshWorker ?? defaultTerrainMeshWorkerFactory();
    if (!createWorker) return;
    // Leave the render thread and the WASM sim their own cores. Terrain meshing is bursty, so two
    // or three workers drain a streaming burst quickly without starving the fight.
    const requested = Math.max(1, Math.min(3,
      Math.floor(finite(options.terrainMeshWorkerCount,
        (globalThis.navigator?.hardwareConcurrency ?? 4) - 2))));
    for (let index = 0; index < requested; index++) {
      try {
        const worker = createWorker();
        worker.onmessage = (event) => this.receive(worker, event.data);
        worker.onerror = () => this.retire(worker);
        worker.onmessageerror = () => this.retire(worker);
        this.workers.push({ worker, inFlight: 0 });
      } catch {
        break;
      }
    }
  }

  get available() {
    return !this.disposed && this.workers.length > 0;
  }

  get inFlight() {
    let total = 0;
    for (const slot of this.workers) total += slot.inFlight;
    return total;
  }

  /// Mesh one chunk off-thread. Resolves with the built arrays, or with `null` if the pool cannot
  /// service the request — in which case the caller must build it synchronously.
  build(boundsLocalM, decoded) {
    if (!this.available) return Promise.resolve(null);
    let chosen = this.workers[0];
    for (const slot of this.workers) if (slot.inFlight < chosen.inFlight) chosen = slot;
    const id = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, slot: chosen });
      chosen.inFlight++;
      try {
        // heights/water go as clones, not transfers: the caller keeps using them for scenery, and
        // a detached array would leave the fallback path with nothing to rebuild from.
        chosen.worker.postMessage({
          type: "build",
          id,
          boundsLocalM,
          heights: decoded.heights,
          water: decoded.water,
          sampleCount: decoded.sampleCount,
        });
      } catch {
        this.settle(id, null);
        this.retire(chosen.worker);
      }
    });
  }

  receive(worker, message) {
    if (message?.type === "ready") return;
    if (!message || typeof message.id !== "number") return;
    this.settle(message.id, message.type === "built" ? message.built : null);
    if (message.type === "failed") this.retire(worker);
  }

  settle(id, built) {
    const request = this.pending.get(id);
    if (!request) return;
    this.pending.delete(id);
    request.slot.inFlight = Math.max(0, request.slot.inFlight - 1);
    request.resolve(built);
  }

  /// Drop a worker that has proved unusable and release everything queued on it to the synchronous
  /// path. A pool that shrinks to zero simply reports itself unavailable from then on.
  retire(worker) {
    const index = this.workers.findIndex((slot) => slot.worker === worker);
    if (index < 0) return;
    const [slot] = this.workers.splice(index, 1);
    for (const [id, request] of [...this.pending]) {
      if (request.slot !== slot) continue;
      this.pending.delete(id);
      request.resolve(null);
    }
    try {
      slot.worker.terminate();
    } catch {
      // A worker that cannot be terminated is already gone.
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const [, request] of this.pending) request.resolve(null);
    this.pending.clear();
    for (const slot of this.workers.splice(0)) {
      try {
        slot.worker.terminate();
      } catch {
        // Already gone.
      }
    }
  }
}

/// Module Workers exist in browsers and not in the Node test harness, and a bundler-less static
/// deploy needs the URL resolved against this module. Returning null puts every build back on the
/// synchronous path, which is correct rather than fatal.
function defaultTerrainMeshWorkerFactory() {
  if (typeof Worker !== "function") return null;
  let url;
  try {
    url = new URL("./terrain_mesh_worker.js", import.meta.url);
  } catch {
    return null;
  }
  return () => new Worker(url, { type: "module" });
}

class KoreaTerrainPresentation {
  constructor(THREE, manifest, reader, options) {
    this.THREE = THREE;
    this.manifest = manifest;
    this.reader = reader;
    this.qualityTier = options.qualityTier ?? "balanced";
    this.group = new THREE.Group();
    this.group.name = options.groupName ?? "KOREA_CENTRAL_FRONT_TERRAIN";
    this.material = options.material ?? createTerrainMaterial(THREE, options);
    this.ownsMaterial = !options.material;
    this.skirtMaterial = options.skirtMaterial
      ?? createTerrainSkirtMaterial(THREE, this.material);
    this.ownsSkirtMaterial = !options.skirtMaterial;
    this.sceneryRuntime = options.sceneryRuntime
      ?? (options.sceneryEra ? createKoreaSceneryRuntime(THREE, {
        era: options.sceneryEra,
        qualityTier: this.qualityTier,
      }) : null);
    this.ownsSceneryRuntime = !options.sceneryRuntime && this.sceneryRuntime !== null;
    this.entries = new Map(manifest.chunks.map((chunk) => [chunk.id, {
      chunk,
      mesh: null,
      level: null,
      requestedLevel: null,
      requestToken: 0,
      error: null,
      normalBoundary: null,
      buildWork: null,
      priorityDistance: Number.POSITIVE_INFINITY,
    }]));
    this.queue = [];
    this.activeLoads = 0;
    this.pendingBuilds = 0;
    this.maximumLoads = Math.max(1, Math.round(finite(options.maximumConcurrentLoads, 6)));
    this.buildScheduler = options.chunkBuildScheduler
      ?? new TerrainChunkBuildScheduler(options);
    this.ownsBuildScheduler = !options.chunkBuildScheduler;
    this.meshWorkers = options.terrainMeshWorkers
      ?? new TerrainMeshWorkerPool(options);
    this.ownsMeshWorkers = !options.terrainMeshWorkers;
    this.chunkLoadRadiusM = Number.isFinite(options.chunkLoadRadiusM)
      ? Math.max(0, options.chunkLoadRadiusM) : Number.POSITIVE_INFINITY;
    // Same contract as the atlas: the renderer clamps visibility to the world edge, and a
    // presentation that could not answer would silently opt out of that and show the boundary.
    this.chunkEvictRadiusM = Number.isFinite(options.chunkEvictRadiusM)
      ? Math.max(this.chunkLoadRadiusM, options.chunkEvictRadiusM)
      : Number.POSITIVE_INFINITY;
    this.disposed = false;
    this.worldEastM = 0;
    this.worldNorthM = 0;
    this.loadedBytes = 0;
    this.idleWaiters = [];
    this.ready = options.lazyChunks === true
      ? Promise.resolve([])
      : Promise.all(manifest.chunks.map((chunk) =>
        this.requestLevel(this.entries.get(chunk.id), chunk.lods.length - 1)));
  }

  requestLevel(entry, level) {
    if (this.disposed || entry.level === level && entry.mesh || entry.requestedLevel === level) {
      return Promise.resolve(entry.mesh);
    }
    if (entry.buildWork) this.buildScheduler.cancel(entry.buildWork);
    entry.requestedLevel = level;
    const token = ++entry.requestToken;
    return new Promise((resolve) => {
      this.queue.push({ entry, level, token, resolve });
      this.pump();
    });
  }

  pump() {
    while (!this.disposed && this.activeLoads < this.maximumLoads && this.queue.length) {
      const work = this.queue.shift();
      if (work.token !== work.entry.requestToken) {
        work.resolve(work.entry.mesh);
        continue;
      }
      this.activeLoads++;
      void this.load(work).finally(() => {
        this.activeLoads--;
        this.pump();
        this.resolveIdleWaiters();
      });
    }
    this.resolveIdleWaiters();
  }

  resolveIdleWaiters() {
    if (this.activeLoads || this.queue.length || this.pendingBuilds) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }

  whenIdle() {
    if (!this.activeLoads && !this.queue.length && !this.pendingBuilds) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  replaceSceneryRuntime(runtime, ownsRuntime = false) {
    if (this.disposed || runtime === this.sceneryRuntime) return Promise.resolve([]);
    const previousRuntime = this.sceneryRuntime;
    const disposePrevious = this.ownsSceneryRuntime;
    this.sceneryRuntime = runtime;
    this.ownsSceneryRuntime = ownsRuntime;
    const replacements = [];
    for (const entry of this.entries.values()) {
      const mesh = entry.mesh;
      const level = entry.level;
      if (!mesh || !Number.isInteger(level)) continue;
      disposeMeshScenery(mesh);
      if (!runtime || level !== 0) continue;
      const record = entry.chunk.lods[level];
      replacements.push(this.reader.read(record).then((buffer) => {
        if (this.disposed || this.sceneryRuntime !== runtime
          || entry.mesh !== mesh || entry.level !== level) return null;
        const decoded = decodeTerrainRecord(buffer, record, this.manifest.quantization);
        const scenery = runtime.createTile(entry.chunk, decoded, level);
        if (!scenery) return null;
        mesh.add(scenery);
        mesh.userData.scenery = scenery.userData.scenery;
        return scenery;
      }).catch((error) => {
        if (!this.disposed && entry.mesh === mesh) {
          entry.error = String(error?.message ?? error);
        }
        return null;
      }));
    }
    if (disposePrevious) previousRuntime?.dispose();
    return Promise.all(replacements);
  }

  get streamingRadiusM() {
    return this.chunkLoadRadiusM;
  }

  setSceneryEra(era) {
    if (this.disposed || era === this.sceneryRuntime?.era) return Promise.resolve([]);
    const runtime = era ? createKoreaSceneryRuntime(this.THREE, {
      era,
      qualityTier: this.qualityTier,
    }) : null;
    setTerrainMaterialEra(this.material, era);
    setTerrainMaterialEra(this.skirtMaterial, era);
    this.material.uniforms.uParcelTint.value =
      this.qualityTier === "desktop" && era !== "modern" ? 1 : 0;
    return this.replaceSceneryRuntime(runtime, runtime !== null);
  }

  async load(work) {
    const { entry, level, token, resolve } = work;
    const record = entry.chunk.lods[level];
    try {
      const buffer = await this.reader.read(record);
      if (this.disposed || token !== entry.requestToken) {
        resolve(entry.mesh);
        return;
      }
      const decoded = decodeTerrainRecord(buffer, record, this.manifest.quantization);
      work.buildPending = true;
      this.pendingBuilds++;
      // Mesh off-thread when a worker pool is up. `meshed` is null whenever that is not possible,
      // and the scheduled job below then does the identical arithmetic inline — the pool changes
      // WHERE the ~9.5 ms is spent, never WHETHER the chunk appears.
      const meshed = await this.meshWorkers.build(entry.chunk.boundsLocalM, decoded);
      if (this.disposed || token !== entry.requestToken) {
        this.finishBuild(work);
        return;
      }
      let scheduled = null;
      scheduled = this.buildScheduler.enqueue(
        this,
        () => entry.priorityDistance,
        () => {
          if (entry.buildWork === scheduled) entry.buildWork = null;
          this.build(work, decoded, meshed);
        },
        () => {
          if (entry.buildWork === scheduled) entry.buildWork = null;
          this.finishBuild(work);
        },
      );
      entry.buildWork = scheduled;
    } catch (error) {
      if (token === entry.requestToken) {
        entry.requestedLevel = null;
        entry.error = String(error?.message ?? error);
      }
      resolve(entry.mesh);
    }
  }

  build(work, decoded, meshed = null) {
    const { entry, level, token } = work;
    const record = entry.chunk.lods[level];
    try {
      if (this.disposed || token !== entry.requestToken
        || entry.mesh && entry.level === level) return;
      const built = meshed
        ? assembleTerrainGeometry(this.THREE, meshed)
        : createTerrainGeometry(this.THREE, entry.chunk, decoded);
      const mesh = new this.THREE.Mesh(built.geometry,
        [this.material, this.skirtMaterial]);
      mesh.name = `TERRAIN_${entry.chunk.id.toUpperCase()}_LOD${level}`;
      mesh.position.set(built.centreEast, 0, -built.centreNorth);
      mesh.userData.terrain = Object.freeze({
        chunkId: entry.chunk.id,
        level,
        triangles: built.triangleCount,
        spacingM: record.spacingM,
      });
      const scenery = this.sceneryRuntime?.createTile(entry.chunk, decoded, level);
      if (scenery) {
        mesh.add(scenery);
        mesh.userData.scenery = scenery.userData.scenery;
      }
      mesh.frustumCulled = true;
      const previous = entry.mesh;
      entry.mesh = mesh;
      entry.level = level;
      entry.requestedLevel = null;
      entry.error = null;
      entry.normalBoundary = built.normalBoundary;
      this.loadedBytes += record.byteLength;
      this.group.add(mesh);
      if (previous) {
        disposeMeshScenery(previous);
        previous.removeFromParent();
        previous.geometry.dispose();
      }
      this.reconcileLoadedBoundaryNormals();
    } catch (error) {
      if (token === entry.requestToken) {
        entry.requestedLevel = null;
        entry.error = String(error?.message ?? error);
      }
    } finally {
      this.finishBuild(work);
    }
  }

  finishBuild(work) {
    if (!work.buildPending) return;
    work.buildPending = false;
    this.pendingBuilds--;
    work.resolve(work.entry.mesh);
    this.resolveIdleWaiters();
  }

  reconcileLoadedBoundaryNormals() {
    const verticesByPosition = new Map();
    const touchedAttributes = new Set();
    for (const entry of this.entries.values()) {
      const mesh = entry.mesh;
      const boundary = entry.normalBoundary;
      if (!mesh || !boundary || !Number.isInteger(entry.level)) continue;
      const positions = mesh.geometry.getAttribute("position");
      const normals = mesh.geometry.getAttribute("normal");
      touchedAttributes.add(normals);
      for (let boundaryIndex = 0; boundaryIndex < boundary.indices.length; boundaryIndex++) {
        const vertexIndex = boundary.indices[boundaryIndex];
        const offset = boundaryIndex * 3;
        const nx = boundary.normals[offset];
        const ny = boundary.normals[offset + 1];
        const nz = boundary.normals[offset + 2];
        normals.setXYZ(vertexIndex, nx, ny, nz);
        const eastM = mesh.position.x + positions.getX(vertexIndex);
        const renderNorthM = mesh.position.z + positions.getZ(vertexIndex);
        const key = `${entry.level}:${eastM}:${renderNorthM}`;
        const shared = verticesByPosition.get(key) ?? [];
        shared.push({ normals, vertexIndex, nx, ny, nz });
        verticesByPosition.set(key, shared);
      }
    }
    for (const shared of verticesByPosition.values()) {
      if (shared.length < 2) continue;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const vertex of shared) {
        nx += vertex.nx;
        ny += vertex.ny;
        nz += vertex.nz;
      }
      const length = Math.hypot(nx, ny, nz);
      if (length <= Number.EPSILON) continue;
      nx /= length;
      ny /= length;
      nz /= length;
      for (const vertex of shared) {
        vertex.normals.setXYZ(vertex.vertexIndex, nx, ny, nz);
      }
    }
    for (const attribute of touchedAttributes) attribute.needsUpdate = true;
  }

  evictEntry(entry) {
    if (!entry.mesh && entry.requestedLevel === null) return;
    if (entry.buildWork) this.buildScheduler.cancel(entry.buildWork);
    entry.requestToken++;
    entry.requestedLevel = null;
    disposeMeshScenery(entry.mesh);
    entry.mesh?.geometry.dispose();
    entry.mesh?.removeFromParent();
    entry.mesh = null;
    entry.level = null;
    entry.normalBoundary = null;
  }

  setPlacement(eastM = 0, northM = 0) {
    this.worldEastM = finite(eastM);
    this.worldNorthM = finite(northM);
    this.group.position.set(this.worldEastM, 0, -this.worldNorthM);
  }

  update({ cameraPosition, streamPosition, fogColor, fogDensity, sunDirection, placementEastM,
    placementNorthM } = {}) {
    if (this.disposed) return;
    if (placementEastM !== undefined || placementNorthM !== undefined) {
      this.setPlacement(placementEastM ?? this.worldEastM, placementNorthM ?? this.worldNorthM);
    }
    if (fogColor) this.material.uniforms.uFogColor.value.copy(fogColor);
    if (Number.isFinite(fogDensity)) this.material.uniforms.uFogDensity.value = fogDensity;
    if (sunDirection) this.material.uniforms.uSunDirection.value.copy(sunDirection).normalize();
    if (!cameraPosition) return;

    const requests = [];
    const priorityPosition = streamPosition ?? cameraPosition;
    for (const entry of this.entries.values()) {
      const bounds = entry.chunk.boundsLocalM;
      const centreEast = this.worldEastM + (bounds[0] + bounds[2]) * 0.5;
      const centreRenderNorth = -(this.worldNorthM + (bounds[1] + bounds[3]) * 0.5);
      const cameraDistance = Math.hypot(cameraPosition.x - centreEast,
        cameraPosition.z - centreRenderNorth);
      const streamDistance = Math.hypot(priorityPosition.x - centreEast,
        priorityPosition.z - centreRenderNorth);
      const distance = Math.min(cameraDistance, streamDistance);
      entry.priorityDistance = distance;
      if (distance > this.chunkEvictRadiusM) {
        this.evictEntry(entry);
        continue;
      }
      if (distance > this.chunkLoadRadiusM) continue;
      const level = selectTerrainLod(distance, this.qualityTier,
        entry.chunk.lods.length, entry.level);
      if (level !== entry.level && level !== entry.requestedLevel) {
        requests.push({ entry, level, distance });
      }
    }
    requests.sort((left, right) => left.distance - right.distance);
    for (const request of requests) this.requestLevel(request.entry, request.level);
  }

  diagnostics() {
    const levels = {};
    let errors = 0;
    let residentChunks = 0;
    for (const entry of this.entries.values()) {
      const key = entry.level === null ? "pending" : `lod${entry.level}`;
      levels[key] = (levels[key] ?? 0) + 1;
      if (entry.mesh) residentChunks++;
      if (entry.error) errors++;
    }
    return Object.freeze({
      terrainId: this.manifest.terrainId,
      qualityTier: this.qualityTier,
      sceneryEra: this.sceneryRuntime?.era ?? null,
      chunks: this.entries.size,
      residentChunks,
      levels: Object.freeze(levels),
      activeLoads: this.activeLoads,
      queuedLoads: this.queue.length,
      queuedBuilds: this.pendingBuilds,
      loadedBytes: this.loadedBytes,
      transfer: this.reader.diagnostics(),
      errors,
      disposed: this.disposed,
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const work of this.queue.splice(0)) work.resolve(work.entry.mesh);
    this.buildScheduler.cancelOwner(this);
    for (const entry of this.entries.values()) {
      entry.requestToken++;
      disposeMeshScenery(entry.mesh);
      entry.mesh?.geometry.dispose();
      entry.mesh?.removeFromParent();
      entry.mesh = null;
      entry.normalBoundary = null;
    }
    this.resolveIdleWaiters();
    if (this.ownsSceneryRuntime) this.sceneryRuntime?.dispose();
    if (this.ownsMaterial) this.material.dispose();
    if (this.ownsSkirtMaterial) this.skirtMaterial.dispose();
    if (this.ownsBuildScheduler) this.buildScheduler.dispose();
    if (this.ownsMeshWorkers) this.meshWorkers.dispose();
    this.group.removeFromParent();
  }
}

function versionedAssetUrl(uri, baseUrl, sha256) {
  const result = new URL(uri, baseUrl);
  if (result.origin === new URL(baseUrl).origin && /^[0-9a-f]{64}$/.test(sha256)) {
    result.searchParams.set("sha256", sha256);
  }
  return result.href;
}

class KoreaTerrainAtlasPresentation {
  constructor(THREE, manifest, manifestUrl, options) {
    this.THREE = THREE;
    this.manifest = manifest;
    this.manifestUrl = manifestUrl;
    this.fetch = options.fetch ?? fetch;
    this.qualityTier = options.qualityTier ?? "balanced";
    const tierStreaming = TIER_STREAMING[this.qualityTier] ?? TIER_STREAMING.balanced;
    const thresholds = TIER_DISTANCE_METRES[this.qualityTier] ?? TIER_DISTANCE_METRES.balanced;
    const defaultLoadRadiusM = thresholds.at(-1) + manifest.tileSpanM * Math.SQRT2;
    this.chunkLoadRadiusM = Math.max(0,
      finite(options.chunkLoadRadiusM, manifest.streaming?.chunkLoadRadiusM ?? defaultLoadRadiusM));
    this.chunkEvictRadiusM = Math.max(this.chunkLoadRadiusM,
      finite(options.chunkEvictRadiusM,
        manifest.streaming?.chunkEvictRadiusM ?? this.chunkLoadRadiusM + 24_000));
    this.pageLoadRadiusM = Math.max(this.chunkLoadRadiusM,
      finite(options.pageLoadRadiusM,
        manifest.streaming?.pageLoadRadiusM ?? this.chunkLoadRadiusM));
    this.pageEvictRadiusM = Math.max(this.pageLoadRadiusM,
      finite(options.pageEvictRadiusM,
        manifest.streaming?.pageEvictRadiusM ?? this.chunkEvictRadiusM + 32_000));
    this.lookAheadSeconds = Math.max(0,
      finite(options.lookAheadSeconds,
        manifest.streaming?.lookAheadSeconds ?? tierStreaming.lookAheadSeconds));
    this.maximumPageLoads = Math.max(1, Math.round(finite(options.maximumPageLoads,
      tierStreaming.pageLoads)));
    this.maximumChunkLoads = Math.max(1,
      Math.round(finite(options.maximumConcurrentLoads, 6)));
    this.maximumCachedRanges = Math.max(1,
      Math.round(finite(options.maximumCachedRanges, 8)));
    this.buildScheduler = new TerrainChunkBuildScheduler(options);
    // One pool for the whole atlas. Workers are expensive to spin up and the pages share a
    // single render thread to protect, so pooling them here matches the build scheduler.
    this.meshWorkers = new TerrainMeshWorkerPool(options);
    this.sceneryEra = options.sceneryEra ?? manifest.scenery?.defaultProfile ?? null;
    this.group = new THREE.Group();
    this.group.name = "KOREA_PENINSULA_TERRAIN_ATLAS";
    this.material = createTerrainMaterial(THREE, { ...options, sceneryEra: this.sceneryEra });
    this.skirtMaterial = createTerrainSkirtMaterial(THREE, this.material);
    this.sceneryRuntime = this.sceneryEra
      ? createKoreaSceneryRuntime(THREE, {
        era: this.sceneryEra,
        qualityTier: this.qualityTier,
      })
      : null;
    this.pages = new Map(manifest.pages.map((page) => [page.id, {
      descriptor: page,
      presentation: null,
      pending: null,
      queued: false,
      generation: 0,
      error: null,
    }]));
    this.pageQueue = [];
    this.activePageLoads = 0;
    this.idleWaiters = [];
    this.disposed = false;
    this.worldEastM = 0;
    this.worldNorthM = 0;
    this.previousCameraLocal = null;
    this.lastUpdate = null;
    this.loadedPageManifests = 0;
    this.ready = Promise.resolve([]);
  }

  setPlacement(eastM = 0, northM = 0) {
    this.worldEastM = finite(eastM);
    this.worldNorthM = finite(northM);
    this.group.position.set(this.worldEastM, 0, -this.worldNorthM);
  }

  /// Shrink or restore the streaming radius at runtime.
  ///
  /// Terrain chunk builds are the dominant frame cost in a real sortie: the scheduler already
  /// limits itself to ONE chunk per animation frame, but a single LOD0 chunk costs roughly 9.5 ms
  /// to build synchronously — 57% of a 60 fps budget — so a burst of streaming turns into a run of
  /// 33-50 ms frames no matter how few triangles are on screen. Measured in production: a window
  /// where live geometries jumped 88 -> 126 is exactly where the long frames began, while draw
  /// calls and triangle counts were indistinguishable between a 60 fps window and an 11 fps one.
  ///
  /// Fewer chunks in flight is therefore the lever that actually works, and shedding view distance
  /// before pixels is the right order: blur and haze are survivable, stutter is not.
  /// How far the world actually extends right now. The renderer needs this to keep FOG honest:
  /// visibility and streamed radius are ONE knob, not two. Shedding the radius without closing the
  /// haze leaves the terrain ending at a dead-straight chunk boundary in clear air — the pilot
  /// filed it as "still getting some z buffer issues I think", and it is not a depth artefact at
  /// all, it is the edge of the loaded world with nothing drawn over it.
  get streamingRadiusM() {
    return this.chunkLoadRadiusM;
  }

  setStreamingRadiusM(loadRadiusM) {
    if (this.disposed || !Number.isFinite(loadRadiusM) || loadRadiusM <= 0) return false;
    const previous = this.chunkLoadRadiusM;
    this.chunkLoadRadiusM = Math.max(0, loadRadiusM);
    // Keep eviction outside loading or chunks would be dropped the instant they arrive and
    // rebuilt immediately — the worst possible outcome for the cost this exists to avoid.
    this.chunkEvictRadiusM = Math.max(
      this.chunkLoadRadiusM + 8_000, this.chunkLoadRadiusM * 1.25);
    this.pageLoadRadiusM = Math.max(this.pageLoadRadiusM, this.chunkLoadRadiusM);
    this.pageEvictRadiusM = Math.max(this.pageEvictRadiusM, this.chunkEvictRadiusM + 8_000);
    return this.chunkLoadRadiusM !== previous;
  }
  setSceneryEra(era) {
    if (this.disposed || era === this.sceneryEra) return Promise.resolve([]);
    const runtime = era ? createKoreaSceneryRuntime(this.THREE, {
      era,
      qualityTier: this.qualityTier,
    }) : null;
    const previousRuntime = this.sceneryRuntime;
    this.sceneryEra = era;
    this.sceneryRuntime = runtime;
    setTerrainMaterialEra(this.material, era);
    setTerrainMaterialEra(this.skirtMaterial, era);
    this.material.uniforms.uParcelTint.value =
      this.qualityTier === "desktop" && era !== "modern" ? 1 : 0;
    const replacements = [];
    for (const state of this.pages.values()) {
      if (state.presentation) {
        replacements.push(state.presentation.replaceSceneryRuntime(runtime, false));
      }
    }
    previousRuntime?.dispose();
    return Promise.all(replacements);
  }

  requestPage(state, distance) {
    if (this.disposed || state.presentation || state.pending || state.queued) return;
    state.queued = true;
    this.pageQueue.push({ state, distance, generation: state.generation });
    this.pageQueue.sort((left, right) => left.distance - right.distance);
    this.pumpPages();
  }

  pumpPages() {
    while (!this.disposed && this.activePageLoads < this.maximumPageLoads
      && this.pageQueue.length) {
      const work = this.pageQueue.shift();
      work.state.queued = false;
      if (work.generation !== work.state.generation || work.state.presentation) continue;
      this.activePageLoads++;
      const pending = this.loadPage(work);
      work.state.pending = pending;
      void pending.finally(() => {
        if (work.state.pending === pending) work.state.pending = null;
        this.activePageLoads--;
        this.pumpPages();
        this.resolveIdleWaiters();
      });
    }
    this.resolveIdleWaiters();
  }

  async loadPage({ state, generation }) {
    const descriptor = state.descriptor;
    const pageManifestUrl = versionedAssetUrl(descriptor.manifest.uri,
      this.manifestUrl, descriptor.manifest.sha256);
    try {
      const response = await this.fetch(pageManifestUrl);
      if (!response.ok) {
        throw new Error(`Terrain page manifest request failed: ${response.status} ${pageManifestUrl}`);
      }
      const pageManifest = validateTerrainManifest(await response.json());
      const bundleUrl = versionedAssetUrl(pageManifest.bundle.uri,
        pageManifestUrl, pageManifest.bundle.sha256);
      const reader = new TerrainBundleReader(bundleUrl, pageManifest.bundle.byteLength,
        this.fetch, this.maximumCachedRanges);
      const presentation = new KoreaTerrainPresentation(this.THREE, pageManifest, reader, {
        qualityTier: this.qualityTier,
        maximumConcurrentLoads: this.maximumChunkLoads,
        chunkLoadRadiusM: this.chunkLoadRadiusM,
        chunkEvictRadiusM: this.chunkEvictRadiusM,
        lazyChunks: true,
        material: this.material,
        skirtMaterial: this.skirtMaterial,
        sceneryRuntime: this.sceneryRuntime,
        chunkBuildScheduler: this.buildScheduler,
        terrainMeshWorkers: this.meshWorkers,
        groupName: `KOREA_TERRAIN_PAGE_${descriptor.id.toUpperCase()}`,
      });
      if (this.disposed || generation !== state.generation) {
        presentation.dispose();
        return;
      }
      state.presentation = presentation;
      state.error = null;
      this.loadedPageManifests++;
      this.group.add(presentation.group);
      if (this.lastUpdate) presentation.update(this.lastUpdate);
    } catch (error) {
      if (!this.disposed && generation === state.generation) {
        state.error = String(error?.message ?? error);
      }
    }
  }

  evictPage(state) {
    if (!state.presentation && !state.pending && !state.queued) return;
    state.generation++;
    state.queued = false;
    state.presentation?.dispose();
    state.presentation = null;
    state.error = null;
  }

  resolveIdleWaiters() {
    if (this.activePageLoads || this.pageQueue.length) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }

  async whenIdle() {
    if (this.activePageLoads || this.pageQueue.length) {
      await new Promise((resolve) => this.idleWaiters.push(resolve));
    }
    await Promise.all([...this.pages.values()]
      .map((state) => state.presentation?.whenIdle()).filter(Boolean));
  }

  update({ cameraPosition, streamPosition, deltaSeconds, fogColor, fogDensity, sunDirection,
    placementEastM, placementNorthM } = {}) {
    if (this.disposed) return;
    if (placementEastM !== undefined || placementNorthM !== undefined) {
      this.setPlacement(placementEastM ?? this.worldEastM, placementNorthM ?? this.worldNorthM);
    }
    if (fogColor) this.material.uniforms.uFogColor.value.copy(fogColor);
    if (Number.isFinite(fogDensity)) this.material.uniforms.uFogDensity.value = fogDensity;
    if (sunDirection) this.material.uniforms.uSunDirection.value.copy(sunDirection).normalize();
    if (!cameraPosition) return;

    const cameraLocal = new this.THREE.Vector3(
      cameraPosition.x - this.worldEastM,
      cameraPosition.y,
      cameraPosition.z + this.worldNorthM,
    );
    const streamLocal = streamPosition
      ? new this.THREE.Vector3(
        streamPosition.x - this.worldEastM,
        streamPosition.y,
        streamPosition.z + this.worldNorthM,
      )
      : cameraLocal.clone();
    if (!streamPosition && this.previousCameraLocal && Number.isFinite(deltaSeconds)
      && deltaSeconds > 0) {
      const lookAhead = cameraLocal.clone().sub(this.previousCameraLocal)
        .multiplyScalar(this.lookAheadSeconds / deltaSeconds);
      const length = lookAhead.length();
      if (length > MAX_STREAM_LOOK_AHEAD_METRES) {
        lookAhead.multiplyScalar(MAX_STREAM_LOOK_AHEAD_METRES / length);
      }
      streamLocal.add(lookAhead);
    }
    if (!this.previousCameraLocal) this.previousCameraLocal = cameraLocal.clone();
    else this.previousCameraLocal.copy(cameraLocal);

    this.lastUpdate = {
      cameraPosition: cameraLocal,
      streamPosition: streamLocal,
      fogColor,
      fogDensity,
      sunDirection,
      placementEastM: 0,
      placementNorthM: 0,
    };
    const cameraEastM = cameraLocal.x;
    const cameraNorthM = -cameraLocal.z;
    const streamEastM = streamLocal.x;
    const streamNorthM = -streamLocal.z;
    const requested = [];
    for (const state of this.pages.values()) {
      const bounds = state.descriptor.boundsLocalM;
      const distance = Math.min(
        distanceToBounds(cameraEastM, cameraNorthM, bounds),
        distanceToBounds(streamEastM, streamNorthM, bounds),
      );
      if (distance > this.pageEvictRadiusM) {
        this.evictPage(state);
        continue;
      }
      state.presentation?.update(this.lastUpdate);
      if (distance <= this.pageLoadRadiusM && !state.presentation
        && !state.pending && !state.queued) requested.push({ state, distance });
    }
    requested.sort((left, right) => left.distance - right.distance);
    for (const request of requested) this.requestPage(request.state, request.distance);
  }

  diagnostics() {
    let residentPages = 0;
    let residentChunks = 0;
    let errors = 0;
    let networkRequests = 0;
    let networkBytes = 0;
    for (const state of this.pages.values()) {
      if (state.presentation) {
        residentPages++;
        const page = state.presentation.diagnostics();
        residentChunks += page.residentChunks;
        networkRequests += page.transfer.networkRequests;
        networkBytes += page.transfer.networkBytes;
      }
      if (state.error) errors++;
    }
    return Object.freeze({
      terrainId: this.manifest.terrainId,
      qualityTier: this.qualityTier,
      sceneryEra: this.sceneryEra,
      pages: this.pages.size,
      residentPages,
      residentChunks,
      activePageLoads: this.activePageLoads,
      queuedPageLoads: this.pageQueue.length,
      loadedPageManifests: this.loadedPageManifests,
      networkRequests,
      networkBytes,
      errors,
      disposed: this.disposed,
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pageQueue.length = 0;
    for (const state of this.pages.values()) {
      state.generation++;
      state.presentation?.dispose();
      state.presentation = null;
    }
    for (const resolve of this.idleWaiters.splice(0)) resolve();
    this.sceneryRuntime?.dispose();
    this.material.dispose();
    this.skirtMaterial.dispose();
    this.buildScheduler.dispose();
    this.meshWorkers.dispose();
    this.group.removeFromParent();
  }
}

export async function loadKoreaTerrain(THREE, options = {}) {
  const manifestUrl = new URL(options.manifestUrl ?? DEFAULT_MANIFEST_URL,
    options.baseUrl ?? import.meta.url).href;
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(manifestUrl);
  if (!response.ok) {
    throw new Error(`Terrain manifest request failed: ${response.status} ${manifestUrl}`);
  }
  const value = await response.json();
  if (value?.schemaVersion === "2.0.0") {
    const atlas = validateTerrainAtlasManifest(value);
    return new KoreaTerrainAtlasPresentation(THREE, atlas, manifestUrl, options);
  }
  const manifest = validateTerrainManifest(value);
  const bundleUrl = versionedAssetUrl(manifest.bundle.uri,
    manifestUrl, manifest.bundle.sha256);
  const reader = new TerrainBundleReader(bundleUrl,
    manifest.bundle.byteLength, fetchImpl, options.maximumCachedRanges);
  return new KoreaTerrainPresentation(THREE, manifest, reader, options);
}
