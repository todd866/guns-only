const DEFAULT_MANIFEST_URL = new URL(
  "../../content/packs/korea-1950s/environment/terrain/central-front.manifest.json",
  import.meta.url,
).href;

const TIER_DISTANCE_METRES = Object.freeze({
  mobile: Object.freeze([10_000, 25_000, 58_000]),
  balanced: Object.freeze([16_000, 42_000, 88_000]),
  desktop: Object.freeze([24_000, 60_000, 118_000]),
});

export const TERRAIN_CURVATURE_START_M = 12_000;
export const TERRAIN_EARTH_RADIUS_M = 6_371_000;

export function terrainCurvatureDropM(radialDistanceM) {
  const curvedRadialM = Math.max(finite(radialDistanceM) - TERRAIN_CURVATURE_START_M, 0);
  return curvedRadialM * curvedRadialM / (2 * TERRAIN_EARTH_RADIUS_M);
}

const TERRAIN_VERTEX = /* glsl */ `
uniform float uEarthRadiusM;
uniform float uCurvatureStartM;
varying vec3 vTerrainNormal;
varying vec3 vTerrainWorldPosition;
varying float vTerrainHeight;
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float radial = distance(world.xz, cameraPosition.xz);
  float curvedRadial = max(radial - uCurvatureStartM, 0.0);
  world.y -= curvedRadial * curvedRadial / (2.0 * uEarthRadiusM);
  vTerrainNormal = normalize(mat3(modelMatrix) * normal);
  vTerrainWorldPosition = world.xyz;
  vTerrainHeight = position.y;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const TERRAIN_FRAGMENT = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec3 vTerrainNormal;
varying vec3 vTerrainWorldPosition;
varying float vTerrainHeight;
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  vec3 normal = normalize(vTerrainNormal);
  float elevation = smoothstep(70.0, 1250.0, vTerrainHeight);
  float highRidge = smoothstep(850.0, 1900.0, vTerrainHeight);
  float steepness = 1.0 - clamp(normal.y, 0.0, 1.0);

  // This is an authored 1950s readability treatment, not a claim of per-pixel historical land
  // cover. Geometry and water are sourced; vegetation/cultivation become dated data layers later.
  vec3 valley = vec3(0.31, 0.34, 0.16);
  vec3 upland = vec3(0.18, 0.25, 0.13);
  vec3 drySlope = vec3(0.35, 0.31, 0.20);
  vec3 ridge = vec3(0.43, 0.43, 0.38);
  vec3 albedo = mix(valley, upland, elevation);
  albedo = mix(albedo, drySlope, smoothstep(0.16, 0.62, steepness) * 0.68);
  albedo = mix(albedo, ridge, highRidge * (0.42 + steepness * 0.58));

  float diffuse = 0.43 + 0.57 * max(dot(normal, normalize(uSunDirection)), 0.0);
  float distanceToCamera = length(cameraPosition - vTerrainWorldPosition);
  float aerial = 1.0 - exp(-uFogDensity * uFogDensity
    * distanceToCamera * distanceToCamera);
  vec3 color = mix(albedo * diffuse, uFogColor, clamp(aerial, 0.0, 1.0));
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

export function selectTerrainLod(distanceM, tier = "balanced", lodCount = 4,
  currentLevel = null, hysteresis = 0.12) {
  const thresholds = TIER_DISTANCE_METRES[tier] ?? TIER_DISTANCE_METRES.balanced;
  const distance = Math.max(0, finite(distanceM));
  const maximumLevel = Math.max(0, lodCount - 1);
  let selected = thresholds.findIndex((threshold) => distance < threshold);
  if (selected < 0) selected = thresholds.length;
  selected = Math.min(maximumLevel, selected);
  if (!Number.isInteger(currentLevel) || currentLevel < 0 || currentLevel > maximumLevel) {
    return selected;
  }
  const margin = Math.min(0.45, Math.max(0, finite(hysteresis, 0.12)));
  let level = currentLevel;
  while (level > 0 && distance < thresholds[level - 1] * (1 - margin)) level--;
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

function triangle(indices, water, a, b, c) {
  if (water[a] && water[b] && water[c]) return;
  indices.push(a, b, c);
}

export function createTerrainGeometry(THREE, chunk, decoded) {
  const { heights, water, sampleCount } = decoded;
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
  for (let north = 0; north < sampleCount; north++) {
    for (let east = 0; east < sampleCount; east++) {
      const index = north * sampleCount + east;
      positions[index * 3] = minimumEast + east * spacingEast - centreEast;
      positions[index * 3 + 1] = heights[index];
      positions[index * 3 + 2] = -(minimumNorth + north * spacingNorth - centreNorth);
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
      triangle(indices, water, southwest, southeast, northwest);
      triangle(indices, water, southeast, northeast, northwest);
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
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
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
  constructor(bundleUrl, byteLength, fetchImpl = fetch) {
    this.bundleUrl = bundleUrl;
    this.byteLength = byteLength;
    this.fetch = fetchImpl;
    this.completeBuffer = null;
    this.rangeCache = new Map();
    this.pendingRanges = new Map();
    this.rangeCapability = null;
    this.capabilityProbe = null;
    this.networkRequests = 0;
    this.networkBytes = 0;
    this.rangeCacheHits = 0;
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
    side: THREE.DoubleSide,
    uniforms: {
      uEarthRadiusM: { value: TERRAIN_EARTH_RADIUS_M },
      uCurvatureStartM: { value: TERRAIN_CURVATURE_START_M },
      uSunDirection: {
        value: (options.sunDirection ?? new THREE.Vector3(0.32, 0.78, -0.53)).clone().normalize(),
      },
      uFogColor: { value: new THREE.Color(options.fogColor ?? 0x6f8790) },
      uFogDensity: { value: finite(options.fogDensity, 0.000055) },
    },
  });
}

class KoreaTerrainPresentation {
  constructor(THREE, manifest, reader, options) {
    this.THREE = THREE;
    this.manifest = manifest;
    this.reader = reader;
    this.qualityTier = options.qualityTier ?? "balanced";
    this.group = new THREE.Group();
    this.group.name = "KOREA_CENTRAL_FRONT_TERRAIN";
    this.material = createTerrainMaterial(THREE, options);
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
    this.disposed = false;
    this.worldEastM = 0;
    this.worldNorthM = 0;
    this.loadedBytes = 0;
    this.ready = Promise.all(manifest.chunks.map((chunk) =>
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
      });
    }
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
      const mesh = new this.THREE.Mesh(built.geometry, this.material);
      mesh.name = `TERRAIN_${entry.chunk.id.toUpperCase()}_LOD${level}`;
      mesh.position.set(built.centreEast, 0, -built.centreNorth);
      mesh.userData.terrain = Object.freeze({
        chunkId: entry.chunk.id,
        level,
        triangles: built.triangleCount,
        spacingM: record.spacingM,
      });
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

  setPlacement(eastM = 0, northM = 0) {
    this.worldEastM = finite(eastM);
    this.worldNorthM = finite(northM);
    this.group.position.set(this.worldEastM, 0, -this.worldNorthM);
  }

  update({ cameraPosition, fogColor, fogDensity, sunDirection, placementEastM,
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
    for (const entry of this.entries.values()) {
      const bounds = entry.chunk.boundsLocalM;
      const centreEast = this.worldEastM + (bounds[0] + bounds[2]) * 0.5;
      const centreRenderNorth = -(this.worldNorthM + (bounds[1] + bounds[3]) * 0.5);
      const distance = Math.hypot(cameraPosition.x - centreEast,
        cameraPosition.z - centreRenderNorth);
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
    for (const entry of this.entries.values()) {
      const key = entry.level === null ? "pending" : `lod${entry.level}`;
      levels[key] = (levels[key] ?? 0) + 1;
      if (entry.error) errors++;
    }
    return Object.freeze({
      terrainId: this.manifest.terrainId,
      qualityTier: this.qualityTier,
      chunks: this.entries.size,
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
      entry.mesh?.geometry.dispose();
      entry.mesh?.removeFromParent();
      entry.mesh = null;
      entry.normalBoundary = null;
    }
    this.material.dispose();
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
  const manifest = validateTerrainManifest(await response.json());
  const bundleUrl = new URL(manifest.bundle.uri, manifestUrl);
  if (bundleUrl.origin === new URL(manifestUrl).origin) {
    bundleUrl.searchParams.set("sha256", manifest.bundle.sha256);
  }
  const reader = new TerrainBundleReader(bundleUrl.href,
    manifest.bundle.byteLength, fetchImpl);
  return new KoreaTerrainPresentation(THREE, manifest, reader, options);
}
