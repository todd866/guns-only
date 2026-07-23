import {
  createKoreaSceneryRuntime,
  disposeKoreaSceneryTile,
} from "./korea_scenery.js";

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
varying vec3 vTerrainNormal;
varying vec3 vTerrainWorldPosition;
varying float vTerrainHeight;
varying float vTerrainWater;
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  vec3 normal = normalize(vTerrainNormal);
  float elevation = smoothstep(70.0, 1250.0, vTerrainHeight);
  float highRidge = smoothstep(850.0, 1900.0, vTerrainHeight);
  float steepness = 1.0 - clamp(normal.y, 0.0, 1.0);

  #ifndef MODERN_SCENERY
  // This is an authored 1950s readability treatment, not a claim of per-pixel historical land
  // cover. Geometry and water are sourced; vegetation/cultivation become dated data layers later.
  vec3 valley = vec3(0.31, 0.34, 0.16);
  vec3 upland = vec3(0.18, 0.25, 0.13);
  vec3 drySlope = vec3(0.35, 0.31, 0.20);
  vec3 ridge = vec3(0.43, 0.43, 0.38);
  vec3 albedo = mix(valley, upland, elevation);
  albedo = mix(albedo, drySlope, smoothstep(0.16, 0.62, steepness) * 0.68);
  albedo = mix(albedo, ridge, highRidge * (0.42 + steepness * 0.58));
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
    vec3 periodCultivation = mix(vec3(0.29, 0.31, 0.12), vec3(0.43, 0.39, 0.17), parcels);
    vec3 modernCultivation = mix(vec3(0.20, 0.31, 0.14), vec3(0.39, 0.37, 0.18), parcels);
    albedo = mix(albedo, mix(periodCultivation, modernCultivation, uModernScenery),
      lowland * (0.16 + parcels * 0.20));
  }

  float diffuse = 0.43 + 0.57 * max(dot(normal, normalize(uSunDirection)), 0.0);
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
  vec3 sValley = vec3(0.14, 0.21, 0.08);
  vec3 sUpland = vec3(0.09, 0.15, 0.055);
  vec3 sRock = vec3(0.22, 0.17, 0.09);
  vec3 sRidge = vec3(0.30, 0.28, 0.20);
  vec3 sAlbedo = mix(sValley, sUpland, bandStep);
  float patchwork = 0.5 + 0.5 * sin(vTerrainWorldPosition.x * 0.00023
    + sin(vTerrainWorldPosition.z * 0.00017) * 2.3);
  sAlbedo = mix(sAlbedo, vec3(0.20, 0.22, 0.09),
    patchwork * (1.0 - smoothstep(0.15, 0.45, steepness)) * 0.34);
  sAlbedo = mix(sAlbedo, sRock, smoothstep(0.22, 0.60, steepness) * 0.72);
  sAlbedo = mix(sAlbedo, sRidge, highRidge * (0.35 + steepness * 0.45));
  float halfLambert = dot(normal, normalize(uSunDirection)) * 0.5 + 0.5;
  halfLambert *= halfLambert;
  float toneRamp = 0.40 + 0.30 * smoothstep(0.24, 0.50, halfLambert)
    + 0.20 * smoothstep(0.52, 0.82, halfLambert);
  vec3 viewDirection = normalize(cameraPosition - vTerrainWorldPosition);
  float rim = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
  vec3 stylizedLit = sAlbedo * toneRamp
    + rim * vec3(0.09, 0.12, 0.16) * (0.4 + 0.6 * clamp(normal.y, 0.0, 1.0));

  vec3 lit = stylizedLit;
  #endif

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

export function reconstructWaterHeights(decoded, maximumBankDistanceSamples = 8) {
  const { heights, water, sampleCount } = decoded;
  const reconstructed = heights.slice();
  const resolved = new Uint8Array(water.length);
  for (let index = 0; index < water.length; index++) resolved[index] = water[index] ? 0 : 1;
  const maximumPasses = Math.max(0, Math.round(finite(maximumBankDistanceSamples, 8)));
  for (let pass = 0; pass < maximumPasses; pass++) {
    const updates = [];
    for (let north = 0; north < sampleCount; north++) {
      for (let east = 0; east < sampleCount; east++) {
        const index = north * sampleCount + east;
        if (!water[index] || resolved[index]) continue;
        let bankHeight = Number.POSITIVE_INFINITY;
        for (let northOffset = -1; northOffset <= 1; northOffset++) {
          const adjacentNorth = north + northOffset;
          if (adjacentNorth < 0 || adjacentNorth >= sampleCount) continue;
          for (let eastOffset = -1; eastOffset <= 1; eastOffset++) {
            if (eastOffset === 0 && northOffset === 0) continue;
            const adjacentEast = east + eastOffset;
            if (adjacentEast < 0 || adjacentEast >= sampleCount) continue;
            const adjacent = adjacentNorth * sampleCount + adjacentEast;
            if (resolved[adjacent]) {
              bankHeight = Math.min(bankHeight, reconstructed[adjacent]);
            }
          }
        }
        if (Number.isFinite(bankHeight)) updates.push({ index, bankHeight });
      }
    }
    if (!updates.length) break;
    for (const update of updates) {
      reconstructed[update.index] = update.bankHeight;
      resolved[update.index] = 1;
    }
  }
  return reconstructed;
}

function smoothSurfaceNormals(geometry, heights, water, sampleCount, spacingEast, spacingNorth) {
  const smoothed = new Float32Array(heights.length);
  for (let north = 0; north < sampleCount; north++) {
    for (let east = 0; east < sampleCount; east++) {
      let weightedHeight = 0;
      let totalWeight = 0;
      for (let northOffset = -2; northOffset <= 2; northOffset++) {
        const adjacentNorth = Math.min(sampleCount - 1, Math.max(0, north + northOffset));
        for (let eastOffset = -2; eastOffset <= 2; eastOffset++) {
          const adjacentEast = Math.min(sampleCount - 1, Math.max(0, east + eastOffset));
          const weight = 1 / (1 + Math.abs(eastOffset) + Math.abs(northOffset));
          weightedHeight += heights[adjacentNorth * sampleCount + adjacentEast] * weight;
          totalWeight += weight;
        }
      }
      smoothed[north * sampleCount + east] = weightedHeight / totalWeight;
    }
  }
  const normals = geometry.getAttribute("normal");
  for (let north = 0; north < sampleCount; north++) {
    const south = Math.max(0, north - 1);
    const northNeighbour = Math.min(sampleCount - 1, north + 1);
    for (let east = 0; east < sampleCount; east++) {
      const index = north * sampleCount + east;
      if (water[index]) {
        normals.setXYZ(index, 0, 1, 0);
        continue;
      }
      const west = Math.max(0, east - 1);
      const eastNeighbour = Math.min(sampleCount - 1, east + 1);
      const eastSlope = (
        smoothed[north * sampleCount + eastNeighbour]
        - smoothed[north * sampleCount + west]
      ) / Math.max(spacingEast, (eastNeighbour - west) * spacingEast);
      const northSlope = (
        smoothed[northNeighbour * sampleCount + east]
        - smoothed[south * sampleCount + east]
      ) / Math.max(spacingNorth, (northNeighbour - south) * spacingNorth);
      const length = Math.hypot(eastSlope, 1, northSlope);
      normals.setXYZ(index, -eastSlope / length, 1 / length, northSlope / length);
    }
  }
  normals.needsUpdate = true;
}

function triangle(indices, a, b, c) {
  indices.push(a, b, c);
}

export function createTerrainGeometry(THREE, chunk, decoded) {
  const { water, sampleCount } = decoded;
  const surfaceHeights = reconstructWaterHeights(decoded);
  const [minimumEast, minimumNorth, maximumEast, maximumNorth] = chunk.boundsLocalM;
  const centreEast = (minimumEast + maximumEast) * 0.5;
  const centreNorth = (minimumNorth + maximumNorth) * 0.5;
  const spacingEast = (maximumEast - minimumEast) / (sampleCount - 1);
  const spacingNorth = (maximumNorth - minimumNorth) / (sampleCount - 1);
  const baseVertexCount = sampleCount * sampleCount;
  const perimeter = [];
  for (let east = 0; east < sampleCount; east++) perimeter.push(east);
  for (let north = 1; north < sampleCount; north++) {
    perimeter.push(north * sampleCount + sampleCount - 1);
  }
  for (let east = sampleCount - 2; east >= 0; east--) {
    perimeter.push((sampleCount - 1) * sampleCount + east);
  }
  for (let north = sampleCount - 2; north > 0; north--) {
    perimeter.push(north * sampleCount);
  }
  const skirtDepthM = Math.max(200,
    Math.min(650, Math.max(spacingEast, spacingNorth) * 1.5));
  // Duplicate both the top and bottom skirt vertices so side-wall normals cannot darken the
  // sourced top surface. Skirts overlap mismatched neighbour edges without changing truth.
  const skirtVertexCount = perimeter.length * 2;
  const positions = new Float32Array((baseVertexCount + skirtVertexCount) * 3);
  const waterValues = new Float32Array(baseVertexCount + skirtVertexCount);
  for (let north = 0; north < sampleCount; north++) {
    for (let east = 0; east < sampleCount; east++) {
      const index = north * sampleCount + east;
      positions[index * 3] = minimumEast + east * spacingEast - centreEast;
      positions[index * 3 + 1] = surfaceHeights[index];
      positions[index * 3 + 2] = -(minimumNorth + north * spacingNorth - centreNorth);
      waterValues[index] = water[index];
    }
  }
  const indices = [];
  for (let north = 0; north < sampleCount - 1; north++) {
    for (let east = 0; east < sampleCount - 1; east++) {
      const southwest = north * sampleCount + east;
      const southeast = southwest + 1;
      const northwest = southwest + sampleCount;
      const northeast = northwest + 1;
      // Renderer space flips north into -Z, so this winding keeps the sourced surface front-facing
      // with +Y normals. Reversing these triples makes the entire peninsula back-face culled.
      triangle(indices, southwest, southeast, northwest);
      triangle(indices, southeast, northeast, northwest);
    }
  }
  const surfaceTriangleCount = indices.length / 3;
  const skirtStart = baseVertexCount;
  for (let perimeterIndex = 0; perimeterIndex < perimeter.length; perimeterIndex++) {
    const sourceIndex = perimeter[perimeterIndex];
    const topIndex = skirtStart + perimeterIndex * 2;
    const bottomIndex = topIndex + 1;
    positions[topIndex * 3] = positions[sourceIndex * 3];
    positions[topIndex * 3 + 1] = positions[sourceIndex * 3 + 1];
    positions[topIndex * 3 + 2] = positions[sourceIndex * 3 + 2];
    positions[bottomIndex * 3] = positions[sourceIndex * 3];
    positions[bottomIndex * 3 + 1] = positions[sourceIndex * 3 + 1] - skirtDepthM;
    positions[bottomIndex * 3 + 2] = positions[sourceIndex * 3 + 2];
    waterValues[topIndex] = water[sourceIndex];
    waterValues[bottomIndex] = water[sourceIndex];
  }
  for (let perimeterIndex = 0; perimeterIndex < perimeter.length; perimeterIndex++) {
    const next = (perimeterIndex + 1) % perimeter.length;
    if (water[perimeter[perimeterIndex]] && water[perimeter[next]]) continue;
    const top = skirtStart + perimeterIndex * 2;
    const bottom = top + 1;
    const nextTop = skirtStart + next * 2;
    const nextBottom = nextTop + 1;
    indices.push(top, bottom, nextTop, nextTop, bottom, nextBottom);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("terrainWater", new THREE.BufferAttribute(waterValues, 1));
  geometry.setIndex(indices);
  // Two material groups so the flat top surface can render single-sided (THREE.FrontSide halves
  // its fragment work — this is where the "face-full of ground" fill cost lives) while the thin
  // perimeter skirts stay double-sided. A seam skirt is viewed from either side depending on which
  // neighbour is lower, so single-siding it could open the very crack it exists to hide; the skirt
  // area is negligible, so keeping only it double-sided costs almost nothing.
  const surfaceIndexCount = surfaceTriangleCount * 3;
  geometry.addGroup(0, surfaceIndexCount, 0);
  if (indices.length > surfaceIndexCount) {
    geometry.addGroup(surfaceIndexCount, indices.length - surfaceIndexCount, 1);
  }
  geometry.computeVertexNormals();
  // Lighting normals use a five-sample neighbourhood while vertex positions retain the exact
  // sourced/carved grid. This removes coarse tone-ramp shelves on steep walls without changing
  // the approved flyable floor, ridge gap, collision truth, or renderer LOD elevations.
  smoothSurfaceNormals(
    geometry, surfaceHeights, water, sampleCount, spacingEast, spacingNorth,
  );
  geometry.computeBoundingSphere();
  const normalAttribute = geometry.getAttribute("normal");
  const boundaryNormals = new Float32Array(perimeter.length * 3);
  for (let boundaryIndex = 0; boundaryIndex < perimeter.length; boundaryIndex++) {
    const vertexIndex = perimeter[boundaryIndex];
    boundaryNormals[boundaryIndex * 3] = normalAttribute.getX(vertexIndex);
    boundaryNormals[boundaryIndex * 3 + 1] = normalAttribute.getY(vertexIndex);
    boundaryNormals[boundaryIndex * 3 + 2] = normalAttribute.getZ(vertexIndex);
  }
  return {
    geometry,
    centreEast,
    centreNorth,
    triangleCount: indices.length / 3,
    surfaceTriangleCount,
    skirtDepthM,
    normalBoundary: Object.freeze({
      indices: Uint32Array.from(perimeter),
      normals: boundaryNormals,
    }),
  };
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

function createTerrainMaterial(THREE, options = {}) {
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
    }]));
    this.queue = [];
    this.activeLoads = 0;
    this.maximumLoads = Math.max(1, Math.round(finite(options.maximumConcurrentLoads, 6)));
    this.chunkLoadRadiusM = Number.isFinite(options.chunkLoadRadiusM)
      ? Math.max(0, options.chunkLoadRadiusM) : Number.POSITIVE_INFINITY;
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
    if (this.activeLoads || this.queue.length) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }

  whenIdle() {
    if (!this.activeLoads && !this.queue.length) return Promise.resolve();
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
      const built = createTerrainGeometry(this.THREE, entry.chunk, decoded);
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
      resolve(mesh);
    } catch (error) {
      if (token === entry.requestToken) {
        entry.requestedLevel = null;
        entry.error = String(error?.message ?? error);
      }
      resolve(entry.mesh);
    }
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
