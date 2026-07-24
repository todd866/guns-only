const DEFAULT_CELL_SIZE_METRES = 6200;
const UINT64_MASK = (1n << 64n) - 1n;
const HASH_GOLD = 0x9e3779b97f4a7c15n;
const HASH_K1 = 0xbf58476d1ce4e5b9n;
const HASH_K2 = 0x94d049bb133111ebn;
const LAYER_FAMILY = 0x46c89d3178a425e7n;
const DEFAULT_ENTRY_RESIDENT_PAGES = 1;
const DEFAULT_ENTRY_RESIDENT_CHUNKS = 8;
const DEFAULT_ENTRY_HOLD_TIMEOUT_SECONDS = 6;
const DEFAULT_ENTRY_CLEAR_SECONDS = 2.6;
const DEFAULT_ENTRY_EXTINCTION_PER_M = 0.024;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function u64(value) {
  return value & UINT64_MASK;
}

function parseSeed(value) {
  if (typeof value === "bigint") return u64(value);
  if (typeof value === "string" && /^[0-9a-f]+$/i.test(value.trim())) {
    return u64(BigInt(`0x${value.trim()}`));
  }
  if (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value.trim())) {
    return u64(BigInt(value.trim()));
  }
  if (Number.isSafeInteger(value)) return u64(BigInt(value));
  return 1n;
}

// This is the integer/value-noise primitive used by sim/Turbulence/Hashing.cs. Keeping its
// CPU implementation bit-identical means the visible layer holes are selected from the same
// deterministic scalar field sampled by the WASM cloud truth. The fragment shader adds only
// sub-cell texture; it does not decide where the authored weather exists.
function mix64(input) {
  let value = u64(input);
  value = u64((value ^ (value >> 30n)) * HASH_K1);
  value = u64((value ^ (value >> 27n)) * HASH_K2);
  return u64(value ^ (value >> 31n));
}

function latticeHash(ix, iy, iz, salt) {
  let hash = mix64(u64(salt + HASH_GOLD));
  hash = mix64(u64(hash + u64(HASH_GOLD * u64(ix))));
  hash = mix64(u64(hash + u64(HASH_GOLD * u64(iy))));
  hash = mix64(u64(hash + u64(HASH_GOLD * u64(iz))));
  return hash;
}

function latticeCorner(ix, iy, iz, salt) {
  const top53 = latticeHash(BigInt(ix), BigInt(iy), BigInt(iz), salt) >> 11n;
  return Number(top53) / 9007199254740992 * 2 - 1;
}

function fade(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Bit-equivalent port of the simulation's smooth 3-D value-noise primitive. */
export function simulationValueNoise(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);
  const salt = parseSeed(seed);
  const c000 = latticeCorner(ix, iy, iz, salt);
  const c100 = latticeCorner(ix + 1, iy, iz, salt);
  const c010 = latticeCorner(ix, iy + 1, iz, salt);
  const c110 = latticeCorner(ix + 1, iy + 1, iz, salt);
  const c001 = latticeCorner(ix, iy, iz + 1, salt);
  const c101 = latticeCorner(ix + 1, iy, iz + 1, salt);
  const c011 = latticeCorner(ix, iy + 1, iz + 1, salt);
  const c111 = latticeCorner(ix + 1, iy + 1, iz + 1, salt);
  const x00 = lerp(c000, c100, u);
  const x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u);
  const x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

function layerSalt(seed, layerIndex) {
  return u64(parseSeed(seed) ^ LAYER_FAMILY
    ^ u64(BigInt(layerIndex + 1) * HASH_GOLD));
}

/** Exact horizontal coverage envelope used by LayeredCloudField for one authored layer. */
export function layerCloudCoverageAt(eastMetres, northMetres, layer, layerIndex, seed,
  simulationTimeSeconds = 0) {
  const meanFraction = clamp(finite(layer?.coverage, finite(layer?.coverage_01, 0)), 0, 1);
  if (meanFraction <= 0) return 0;
  if (meanFraction >= 1) return 1;
  const scale = Math.max(1, finite(layer?.scaleMetres,
    finite(layer?.scale_m, DEFAULT_CELL_SIZE_METRES)));
  const east = eastMetres - finite(layer?.windEastMps, layer?.wind_east_mps)
    * simulationTimeSeconds;
  const north = northMetres - finite(layer?.windNorthMps, layer?.wind_north_mps)
    * simulationTimeSeconds;
  const x = east / scale;
  const z = north / scale;
  const salt = layerSalt(seed, layerIndex);
  const noise = 0.68 * simulationValueNoise(x, 0, z, salt)
    + 0.22 * simulationValueNoise(x * 2.07, 11, z * 2.07, u64(salt + 0x9e37n))
    + 0.10 * simulationValueNoise(x * 4.13, -7, z * 4.13, u64(salt + 0x51edn));
  const normalized = clamp(0.5 + 0.5 * noise, 0, 1);
  const transition = 0.14;
  const threshold = 1 - meanFraction;
  return smoothstep01((normalized - threshold + transition) / (2 * transition));
}

function hash32(value) {
  let state = Number(value) | 0;
  state = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
  state = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
  return (state ^ (state >>> 16)) >>> 0;
}

function unitHash(cellX, cellZ, channel = 0) {
  const seed = Math.imul(cellX | 0, 0x1f123bb5)
    ^ Math.imul(cellZ | 0, 0x5f356495)
    ^ Math.imul(channel | 0, 0x6c8e9cf5);
  return hash32(seed) / 0xffffffff;
}

/** Legacy/default deterministic descriptor retained as the no-weather development fallback. */
export function cloudCellDescriptor(cellX, cellZ, options = {}) {
  const cellSize = options.cellSizeMetres ?? DEFAULT_CELL_SIZE_METRES;
  const baseAltitude = options.altitudeMetres ?? 1450;
  const thickness = options.thicknessMetres ?? 620;
  const coverage = clamp(options.coverage ?? 0.38, 0, 1);
  const present = unitHash(cellX, cellZ, 0) < coverage;
  const width = 1050 + unitHash(cellX, cellZ, 3) * 1750;
  const height = 310 + unitHash(cellX, cellZ, 4) * 460;
  return Object.freeze({
    kind: "layer",
    cellX,
    cellZ,
    present,
    x: (cellX + 0.16 + unitHash(cellX, cellZ, 1) * 0.68) * cellSize,
    z: (cellZ + 0.16 + unitHash(cellX, cellZ, 2) * 0.68) * cellSize,
    y: baseAltitude + (unitHash(cellX, cellZ, 5) - 0.5) * thickness * 0.58,
    width,
    depth: width,
    height,
    opacity: 0.58 + unitHash(cellX, cellZ, 6) * 0.30,
    phase: unitHash(cellX, cellZ, 7) * 37,
  });
}

/** Approximate presentation density; exact cockpit extinction comes from the WASM CloudSample. */
export function cloudDensityAt(position, descriptors) {
  let density = 0;
  for (const cloud of descriptors ?? []) {
    if (!cloud?.present) continue;
    const radiusX = Math.max(1, cloud.radiusX ?? cloud.width * 0.43);
    const radiusY = Math.max(1, cloud.radiusY ?? cloud.height * 0.58);
    const radiusZ = Math.max(1, cloud.radiusZ ?? (cloud.depth ?? cloud.width) * 0.43);
    const nx = (finite(position?.x) - cloud.x) / radiusX;
    const ny = (finite(position?.y) - cloud.y) / radiusY;
    const nz = (finite(position?.z) - cloud.z) / radiusZ;
    const radius = Math.sqrt(nx * nx + ny * ny + nz * nz);
    density = Math.max(density, (cloud.opacity ?? 1)
      * (1 - clamp((radius - 0.34) / 0.66, 0, 1)));
  }
  return clamp(density, 0, 1);
}

function normalizeLayer(source = {}) {
  const baseM = finite(source.baseM, source.base_m ?? 1100);
  const topM = Math.max(baseM + 1, finite(source.topM, source.top_m ?? 1900));
  return {
    baseM,
    topM,
    coverage: clamp(finite(source.coverage, source.coverage_01 ?? 0.38), 0, 1),
    scaleMetres: Math.max(500, finite(source.scaleMetres, source.scale_m ?? DEFAULT_CELL_SIZE_METRES)),
    extinctionPerM: Math.max(0, finite(source.extinctionPerM, source.extinction_per_m ?? 0.014)),
    windEastMps: finite(source.windEastMps, source.wind_east_mps),
    windNorthMps: finite(source.windNorthMps, source.wind_north_mps),
  };
}

function normalizeCell(source = {}) {
  const baseM = finite(source.baseM, source.base_m);
  const topM = Math.max(baseM + 1, finite(source.topM, source.top_m ?? baseM + 2000));
  return {
    kind: "cell",
    initialX: finite(source.eastM, source.east_m),
    // Simulation Z is north; three.js uses -Z as forward/north throughout this app.
    initialZ: -finite(source.northM, source.north_m),
    y: 0.5 * (baseM + topM),
    radiusX: Math.max(1, finite(source.radiusEastM, source.radius_east_m ?? 2000)),
    radiusY: 0.5 * (topM - baseM),
    radiusZ: Math.max(1, finite(source.radiusNorthM, source.radius_north_m ?? 2000)),
    startS: Math.max(0, finite(source.startS, source.start_s)),
    lifetimeS: Math.max(0.001, finite(source.lifetimeS, source.lifetime_s ?? 900)),
    transitionS: Math.max(0, finite(source.transitionS, source.transition_s ?? 20)),
    windX: finite(source.windEastMps, source.wind_east_mps),
    windZ: -finite(source.windNorthMps, source.wind_north_mps),
    peakCoverage: clamp(finite(source.coverage, source.coverage_01 ?? 1), 0, 1),
    extinctionPerM: Math.max(0, finite(source.extinctionPerM,
      source.extinction_per_m ?? 0.02)),
    phase: finite(source.phase, 13.7),
    present: false,
    opacity: 0,
    x: 0,
    z: 0,
  };
}

/** Convert the bridge's simulation-frame descriptor contract once at the render boundary. */
export function weatherConfigurationFromState(state = {}) {
  return {
    id: String(state.weather_profile_id ?? "weather.none"),
    seed: String(state.weather_seed_hex ?? "0000000000000001"),
    layers: Array.isArray(state.weather_layers) ? state.weather_layers.map(normalizeLayer) : [],
    cells: Array.isArray(state.weather_cells) ? state.weather_cells.map(normalizeCell) : [],
  };
}

const VOLUME_VERTEX = /* glsl */ `
  precision highp float;
  attribute float instanceOpacity;
  attribute float instancePhase;
  varying vec3 vWorldCenter;
  varying vec3 vWorldSurface;
  varying vec3 vRadii;
  varying float vInstanceOpacity;
  varying float vInstancePhase;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 axisX = (modelMatrix * vec4(instanceMatrix[0].xyz, 0.0)).xyz;
    vec3 axisY = (modelMatrix * vec4(instanceMatrix[1].xyz, 0.0)).xyz;
    vec3 axisZ = (modelMatrix * vec4(instanceMatrix[2].xyz, 0.0)).xyz;
    vec4 worldSurface = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldCenter = worldCenter.xyz;
    vWorldSurface = worldSurface.xyz;
    vRadii = max(vec3(length(axisX), length(axisY), length(axisZ)), vec3(0.001));
    vInstanceOpacity = instanceOpacity;
    vInstancePhase = instancePhase;
    gl_Position = projectionMatrix * viewMatrix * worldSurface;
    #include <logdepthbuf_vertex>
  }
`;

const VOLUME_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpticalScale;
  uniform vec3 uSunDirection;
  uniform vec3 uLightColor;
  uniform vec3 uShadowColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorldCenter;
  varying vec3 vWorldSurface;
  varying vec3 vRadii;
  varying float vInstanceOpacity;
  varying float vInstancePhase;
  #include <logdepthbuf_pars_fragment>

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise31(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(cell), hash31(cell + vec3(1,0,0)), f.x),
          mix(hash31(cell + vec3(0,1,0)), hash31(cell + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(cell + vec3(0,0,1)), hash31(cell + vec3(1,0,1)), f.x),
          mix(hash31(cell + vec3(0,1,1)), hash31(cell + vec3(1,1,1)), f.x), f.y), f.z);
  }

  float cloudDensity(vec3 worldPoint) {
    vec3 q = (worldPoint - vWorldCenter) / vRadii;
    float envelope = 1.0 - smoothstep(0.55, 1.0, length(q));
    float base = smoothstep(-1.0, -0.58, q.y);
    // Texture is volume-local so an advecting cloud carries its billows with it instead of
    // swimming through a stationary world-noise field.
    vec3 texturePoint = q * vec3(2.15, 2.85, 2.15)
      + vec3(vInstancePhase, 0.0, -vInstancePhase);
    float broad = noise31(texturePoint);
    float detail = noise31(texturePoint * 2.31 + 7.4);
    float erosion = broad * 0.72 + detail * 0.28;
    return clamp(envelope * base * (0.42 + 0.95 * erosion) - 0.10, 0.0, 1.0);
  }

  void main() {
    if (vInstanceOpacity <= 0.001) discard;
    vec3 rayDirection = normalize(vWorldSurface - cameraPosition);
    vec3 rayOrigin = (cameraPosition - vWorldCenter) / vRadii;
    vec3 ray = rayDirection / vRadii;
    float a = dot(ray, ray);
    float b = dot(rayOrigin, ray);
    float c = dot(rayOrigin, rayOrigin) - 1.0;
    float discriminant = b * b - a * c;
    if (discriminant <= 0.0) discard;
    float root = sqrt(discriminant);
    float nearT = (-b - root) / a;
    float farT = (-b + root) / a;
    bool cameraInside = dot(rayOrigin, rayOrigin) < 1.0;
    if ((!cameraInside && !gl_FrontFacing) || (cameraInside && gl_FrontFacing)) discard;
    nearT = max(0.0, nearT);
    farT = min(farT, 24000.0);
    if (farT <= nearT) discard;

    float stepLength = (farT - nearT) / float(CLOUD_STEPS);
    float transmittance = 1.0;
    vec3 scattered = vec3(0.0);
    float jitter = hash31(gl_FragCoord.xyx + vInstancePhase);
    float firstT = nearT + jitter * stepLength;
    for (int index = 0; index < CLOUD_STEPS; index++) {
      float distanceAlongRay = firstT + float(index) * stepLength;
      vec3 samplePoint = cameraPosition + rayDirection * distanceAlongRay;
      float density = cloudDensity(samplePoint) * vInstanceOpacity;
      if (density > 0.002) {
        // One mid-distance probe retains the self-shadowing cue without tripling the already
        // expensive density work at every ray step. The old near/far pair was the largest
        // avoidable fragment cost once several cloud lobes overlapped the same screen pixels.
        float sunOcclusion = 1.42
          * cloudDensity(samplePoint + uSunDirection * 290.0);
        float lightTransmission = exp(-1.15 * sunOcclusion);
        float forward = pow(max(0.0, dot(rayDirection, uSunDirection)), 5.0);
        vec3 lighting = mix(uShadowColor, uLightColor,
          clamp(0.24 + 0.76 * lightTransmission + 0.18 * forward, 0.0, 1.0));
        float alpha = 1.0 - exp(-density * uOpticalScale * stepLength);
        scattered += transmittance * alpha * lighting;
        transmittance *= 1.0 - alpha;
        if (transmittance < 0.018) break;
      }
    }
    float alpha = 1.0 - transmittance;
    if (alpha < 0.008) discard;
    vec3 color = scattered / max(alpha, 0.001);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * nearT * nearT);
    color = mix(color, uFogColor, fog);
    gl_FragColor = vec4(color, alpha * (1.0 - fog * 0.45));
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const IMPOSTOR_VERTEX = /* glsl */ `
  precision highp float;
  attribute float instanceOpacity;
  attribute float instancePhase;
  varying vec2 vCloudUv;
  varying vec3 vWorldCenter;
  varying float vWorldRadius;
  varying float vInstanceOpacity;
  varying float vInstancePhase;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 axisX = (modelMatrix * vec4(instanceMatrix[0].xyz, 0.0)).xyz;
    vec3 axisY = (modelMatrix * vec4(instanceMatrix[1].xyz, 0.0)).xyz;
    vec4 viewCenter = viewMatrix * worldCenter;
    viewCenter.xy += position.xy * vec2(length(axisX), length(axisY));
    vCloudUv = uv;
    vWorldCenter = worldCenter.xyz;
    vWorldRadius = max(length(axisX), length(axisY));
    vInstanceOpacity = instanceOpacity;
    vInstancePhase = instancePhase;
    gl_Position = projectionMatrix * viewCenter;
    #include <logdepthbuf_vertex>
  }
`;

const IMPOSTOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uLightColor;
  uniform vec3 uShadowColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec2 vCloudUv;
  varying vec3 vWorldCenter;
  varying float vWorldRadius;
  varying float vInstanceOpacity;
  varying float vInstancePhase;
  #include <logdepthbuf_pars_fragment>
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise21(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(cell), hash21(cell + vec2(1,0)), f.x),
      mix(hash21(cell + vec2(0,1)), hash21(cell + vec2(1)), f.x), f.y);
  }
  void main() {
    vec2 centred = vCloudUv * 2.0 - 1.0;
    float broad = noise21(vCloudUv * 3.1 + vInstancePhase + uTime * 0.004);
    float detail = noise21(vCloudUv * 8.9 - vInstancePhase * 0.3);
    float envelope = 1.0 - smoothstep(0.44, 1.0, length(centred * vec2(0.83, 1.22)));
    float body = smoothstep(0.39, 0.61, broad * 0.72 + detail * 0.28 + envelope * 0.38);
    float lowerShade = smoothstep(0.95, 0.08, vCloudUv.y);
    vec3 color = mix(uLightColor, uShadowColor, lowerShade * (0.30 + broad * 0.30));
    float distanceToCamera = distance(cameraPosition, vWorldCenter);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity
      * distanceToCamera * distanceToCamera);
    color = mix(color, uFogColor, fog);
    // A camera-intersecting billboard otherwise becomes a flat screen-sized slab. Local cloud
    // visibility already comes from the authoritative fog sample, so fade the proxy near its
    // centre and let it represent only the surrounding cloud body.
    float nearFade = smoothstep(vWorldRadius * 0.28, vWorldRadius * 0.82, distanceToCamera);
    float alpha = body * envelope * vInstanceOpacity * nearFade * (1.0 - fog * 0.72);
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color, alpha);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SHADOW_VERTEX = /* glsl */ `
  precision highp float;
  varying vec2 vShadowUv;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  #include <fog_pars_vertex>
  void main() {
    vShadowUv = uv;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const SHADOW_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uShadowColor;
  uniform float uShadowOpacity;
  varying vec2 vShadowUv;
  #include <logdepthbuf_pars_fragment>
  #include <fog_pars_fragment>
  void main() {
    vec2 centred = vShadowUv * 2.0 - 1.0;
    float shadowEnvelope = 1.0 - smoothstep(0.18, 1.0,
      length(centred * vec2(0.84, 1.08)));
    float alpha = uShadowOpacity * shadowEnvelope * shadowEnvelope;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uShadowColor, alpha);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const ENTRY_WISP_VERTEX = /* glsl */ `
  precision highp float;
  attribute float instancePhase;
  varying vec2 vWispUv;
  varying float vWispPhase;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vWispUv = uv;
    vWispPhase = instancePhase;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;

const ENTRY_WISP_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform vec3 uLightColor;
  uniform vec3 uShadowColor;
  varying vec2 vWispUv;
  varying float vWispPhase;
  #include <logdepthbuf_pars_fragment>
  void main() {
    vec2 point = vWispUv * 2.0 - 1.0;
    float scallop = sin(point.x * 8.0 + vWispPhase) * 0.055
      + sin(point.x * 15.0 - vWispPhase * 1.7) * 0.025;
    float body = 1.0 - smoothstep(0.42 + scallop, 1.0,
      length(point * vec2(0.72, 1.46)));
    float streak = 0.72 + 0.28 * sin(
      point.x * 10.0 + point.y * 3.0 + vWispPhase
    );
    float alpha = body * (0.56 + streak * 0.28) * uOpacity;
    if (alpha < 0.012) discard;
    vec3 color = mix(uShadowColor, uLightColor,
      clamp(0.42 + point.y * 0.20 + streak * 0.18, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ENTRY_INSIDE_VERTEX = /* glsl */ `
  precision highp float;
  varying vec3 vCloudDirection;
  varying float vCloudBroad;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vCloudDirection = normalize(position);
    // Broad illustrative billows need no per-pixel noise: interpolate a few vertex samples across
    // the deliberately coarse shell so the temporary full-screen layer stays cheap on mobile.
    vCloudBroad = 0.50
      + sin(dot(vCloudDirection, vec3(7.1, 3.7, -5.3)) + 1.4) * 0.20
      + sin(dot(vCloudDirection, vec3(-13.7, 9.1, 11.3)) - 0.8) * 0.11
      + sin(dot(vCloudDirection, vec3(23.1, -17.3, 19.7)) + 2.7) * 0.055;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;

const ENTRY_INSIDE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uCoverage;
  uniform float uOpacity;
  uniform vec3 uLightColor;
  uniform vec3 uShadowColor;
  varying vec3 vCloudDirection;
  varying float vCloudBroad;
  #include <logdepthbuf_pars_fragment>
  void main() {
    vec3 direction = normalize(vCloudDirection);
    float broad = vCloudBroad;
    float threshold = 1.0 - uCoverage;
    float body = smoothstep(threshold - 0.18, threshold + 0.18, broad);
    float veil = clamp(body * 0.64 + uCoverage * 0.58, 0.0, 1.0);
    float light = clamp(0.48 + direction.y * 0.16 + broad * 0.22, 0.0, 1.0);
    vec3 color = mix(uShadowColor, uLightColor, light);
    float alpha = veil * uOpacity * 0.992;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color, alpha);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function tierGridSize(tier) {
  if (tier === "desktop") return 7;
  return 5;
}

function tierMarchSteps(tier) {
  // Full-resolution cloud volumes overlap heavily. Per-pixel jitter hides the coarse stepping,
  // so these budgets preserve the soft volume while keeping the fragment cost bounded.
  if (tier === "desktop") return 12;
  if (tier === "balanced") return 8;
  return 0;
}

function tierLobeCount(tier) {
  if (tier === "desktop") return 2;
  if (tier === "balanced") return 1;
  return 1;
}

function tierEntryWispCount(tier) {
  if (tier === "desktop") return 18;
  if (tier === "balanced") return 14;
  return 10;
}

function layerDescriptor(cellX, cellZ, layer, layerIndex, seed) {
  const cellSize = Math.max(2200, layer.scaleMetres * 0.92);
  const channel = layerIndex * 17;
  const originX = (cellX + 0.12 + unitHash(cellX, cellZ, channel + 1) * 0.76) * cellSize;
  const originNorth = (cellZ + 0.12 + unitHash(cellX, cellZ, channel + 2) * 0.76) * cellSize;
  const coverage = layerCloudCoverageAt(originX, originNorth, layer, layerIndex, seed, 0);
  const thickness = layer.topM - layer.baseM;
  const radiusX = cellSize * (0.34 + unitHash(cellX, cellZ, channel + 3) * 0.17);
  const radiusZ = cellSize * (0.32 + unitHash(cellX, cellZ, channel + 4) * 0.18);
  const radiusY = thickness * (0.36 + unitHash(cellX, cellZ, channel + 5) * 0.10);
  return {
    kind: "layer",
    layerIndex,
    cellX,
    cellZ,
    originX,
    originZ: -originNorth,
    x: originX,
    z: -originNorth,
    y: 0.5 * (layer.baseM + layer.topM)
      + (unitHash(cellX, cellZ, channel + 6) - 0.5) * thickness * 0.10,
    radiusX,
    radiusY,
    radiusZ,
    width: radiusX * 2,
    height: radiusY * 2,
    depth: radiusZ * 2,
    windX: layer.windEastMps,
    windZ: -layer.windNorthMps,
    present: coverage > 0.035,
    opacity: clamp(coverage * clamp(layer.extinctionPerM / 0.014, 0.55, 1.35), 0, 1),
    phase: unitHash(cellX, cellZ, channel + 7) * 31 + layerIndex * 9.7,
  };
}

function attachedLobeDescriptor(parent, lobeIndex) {
  const channel = 41 + parent.layerIndex * 19 + lobeIndex * 7;
  const angle = unitHash(parent.cellX, parent.cellZ, channel) * Math.PI * 2;
  const distance = 0.24 + unitHash(parent.cellX, parent.cellZ, channel + 1) * 0.22;
  const scale = 0.54 + unitHash(parent.cellX, parent.cellZ, channel + 2) * 0.18;
  const radiusX = parent.radiusX * scale;
  const radiusY = parent.radiusY * (0.62
    + unitHash(parent.cellX, parent.cellZ, channel + 3) * 0.18);
  const radiusZ = parent.radiusZ * (0.56
    + unitHash(parent.cellX, parent.cellZ, channel + 4) * 0.18);
  const offsetX = Math.cos(angle) * parent.radiusX * distance;
  const offsetZ = Math.sin(angle) * parent.radiusZ * distance;
  return {
    ...parent,
    originX: parent.originX + offsetX,
    originZ: parent.originZ + offsetZ,
    x: parent.x + offsetX,
    z: parent.z + offsetZ,
    y: parent.y + parent.radiusY * (0.18
      + unitHash(parent.cellX, parent.cellZ, channel + 5) * 0.25),
    radiusX,
    radiusY,
    radiusZ,
    width: radiusX * 2,
    height: radiusY * 2,
    depth: radiusZ * 2,
    opacity: parent.opacity * 0.94,
    phase: parent.phase + 4.3 * (lobeIndex + 1),
  };
}

export function createTacticalCloudField(THREE, options = {}) {
  const tier = options.qualityTier ?? "balanced";
  const volumetric = options.volumetric ?? tier !== "mobile";
  const gridSize = options.gridSize ?? tierGridSize(tier);
  const lobesPerCloud = tierLobeCount(tier);
  const maxLayers = Math.max(1, options.maxLayers ?? 3);
  const maxCells = Math.max(0, options.maxCells ?? 8);
  const capacity = gridSize * gridSize * maxLayers * lobesPerCloud + maxCells;
  const group = new THREE.Group();
  group.name = "TACTICAL_CLOUD_FIELD";

  const uniforms = {
    uTime: { value: 0 },
    uOpticalScale: { value: tier === "desktop" ? 0.0018 : 0.00155 },
    uSunDirection: { value: new THREE.Vector3(0.32, 0.78, -0.53).normalize() },
    uLightColor: { value: new THREE.Color(0xf8f3e8) },
    uShadowColor: { value: new THREE.Color(0x71838e) },
    uFogColor: { value: new THREE.Color(0x7898a0) },
    uFogDensity: { value: 0.000055 },
  };
  if (options.sunDirection?.isVector3) {
    uniforms.uSunDirection.value.copy(options.sunDirection).normalize();
  }
  const material = new THREE.ShaderMaterial({
    name: volumetric ? "MAT_AUTHORITATIVE_CLOUD_VOLUMES" : "MAT_AUTHORITATIVE_CLOUD_IMPOSTORS",
    uniforms,
    defines: volumetric ? { CLOUD_STEPS: tierMarchSteps(tier) } : {},
    vertexShader: volumetric ? VOLUME_VERTEX : IMPOSTOR_VERTEX,
    fragmentShader: volumetric ? VOLUME_FRAGMENT : IMPOSTOR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geometry = volumetric
    ? new THREE.SphereGeometry(1, tier === "desktop" ? 14 : 10, tier === "desktop" ? 9 : 7)
    : new THREE.PlaneGeometry(2, 2, 1, 1);
  const opacityAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const phaseAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute("instanceOpacity", opacityAttribute);
  geometry.setAttribute("instancePhase", phaseAttribute);
  const cloudMesh = new THREE.InstancedMesh(geometry, material, capacity);
  cloudMesh.name = volumetric ? "TACTICAL_CLOUD_VOLUMES" : "TACTICAL_CLOUD_IMPOSTORS";
  cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cloudMesh.frustumCulled = false;
  cloudMesh.renderOrder = 2;
  // No instance transforms are valid until the first update. Starting empty also avoids a frame
  // of identity-sized clouds at the origin while authoritative weather is being configured.
  cloudMesh.count = 0;
  group.add(cloudMesh);

  const shadowMaterial = new THREE.ShaderMaterial({
    name: "MAT_TACTICAL_CLOUD_SHADOWS",
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uShadowColor: { value: new THREE.Color(0x183946) },
        uShadowOpacity: { value: tier === "mobile" ? 0.032 : 0.058 },
      },
    ]),
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const shadowGeometry = new THREE.PlaneGeometry(2, 2, 1, 1);
  const shadowMesh = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, capacity);
  shadowMesh.name = "TACTICAL_CLOUD_SHADOWS";
  shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadowMesh.frustumCulled = false;
  shadowMesh.renderOrder = -4;
  shadowMesh.count = 0;
  group.add(shadowMesh);

  const dummy = new THREE.Object3D();
  const descriptors = [];
  let weather = {
    id: "weather.fallback",
    seed: "0000000000000001",
    layers: [normalizeLayer(options)],
    cells: [],
  };
  let weatherKey = `${weather.id}|${weather.seed}`;
  let gridKey = "";
  let matricesDirty = true;
  let appliedTimeSeconds = Number.NaN;
  const nextSunDirection = new THREE.Vector3();
  const entryLayer = normalizeLayer({
    baseM: 0,
    topM: 1,
    coverage: 1,
    extinctionPerM: options.entryExtinctionPerM ?? DEFAULT_ENTRY_EXTINCTION_PER_M,
  });
  const entryResidentPages = Math.max(0, Math.round(finite(
    options.entryResidentPages,
    DEFAULT_ENTRY_RESIDENT_PAGES,
  )));
  const entryResidentChunks = Math.max(0, Math.round(finite(
    options.entryResidentChunks,
    DEFAULT_ENTRY_RESIDENT_CHUNKS,
  )));
  const entryHoldTimeoutSeconds = Math.max(0.1, finite(
    options.entryHoldTimeoutSeconds,
    DEFAULT_ENTRY_HOLD_TIMEOUT_SECONDS,
  ));
  const entryClearSeconds = Math.max(0.1, finite(
    options.entryClearSeconds,
    DEFAULT_ENTRY_CLEAR_SECONDS,
  ));
  const entryWispCount = Math.max(1, Math.round(finite(
    options.entryWispCount,
    tierEntryWispCount(tier),
  )));
  const entryState = {
    phase: "idle",
    reason: null,
    begunAtSeconds: Number.NaN,
    clearAtSeconds: Number.NaN,
    coverage: 0,
    opacity: 0,
    fogDensity: 0,
  };
  let entryWispMesh = null;
  let entryWispGeometry = null;
  let entryWispMaterial = null;
  let entryWispPhaseAttribute = null;
  let entryInsideMesh = null;
  let entryInsideGeometry = null;
  let entryInsideMaterial = null;
  const entryWispDummy = new THREE.Object3D();
  const entryForward = new THREE.Vector3();
  const entryRight = new THREE.Vector3();
  const entryUp = new THREE.Vector3();

  function createEntryResources() {
    if (entryWispMesh) return;
    // The inside layer closes the sky-dome hole that scene fog cannot cover. The moving near-field
    // wisps are a separate one-draw instanced batch so speed remains readable against that layer.
    entryInsideGeometry = new THREE.SphereGeometry(64, 16, 10);
    entryInsideMaterial = new THREE.ShaderMaterial({
      name: "MAT_CLOUD_BREAK_INSIDE_LAYER",
      uniforms: {
        uCoverage: { value: 1 },
        uOpacity: { value: 1 },
        uLightColor: { value: new THREE.Color(0xd9e2df) },
        uShadowColor: { value: new THREE.Color(0x8ba0a4) },
      },
      vertexShader: ENTRY_INSIDE_VERTEX,
      fragmentShader: ENTRY_INSIDE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    });
    entryInsideMesh = new THREE.Mesh(entryInsideGeometry, entryInsideMaterial);
    entryInsideMesh.name = "CLOUD_BREAK_INSIDE_LAYER";
    entryInsideMesh.frustumCulled = false;
    entryInsideMesh.renderOrder = 3;
    group.add(entryInsideMesh);

    entryWispGeometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    entryWispPhaseAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(entryWispCount),
      1,
    );
    entryWispGeometry.setAttribute("instancePhase", entryWispPhaseAttribute);
    entryWispMaterial = new THREE.ShaderMaterial({
      name: "MAT_CLOUD_BREAK_NEAR_WISPS",
      uniforms: {
        uOpacity: { value: 1 },
        uLightColor: { value: new THREE.Color(0xdce5e3) },
        uShadowColor: { value: new THREE.Color(0x82979c) },
      },
      vertexShader: ENTRY_WISP_VERTEX,
      fragmentShader: ENTRY_WISP_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    entryWispMesh = new THREE.InstancedMesh(
      entryWispGeometry,
      entryWispMaterial,
      entryWispCount,
    );
    entryWispMesh.name = "CLOUD_BREAK_NEAR_WISPS";
    entryWispMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    entryWispMesh.frustumCulled = false;
    entryWispMesh.renderOrder = 4;
    entryWispMesh.count = entryWispCount;
    group.add(entryWispMesh);
  }

  function tearDownEntryResources() {
    // This is a real teardown, not a visibility toggle: after break-out there is no entry draw,
    // instance upload, shader uniform update, or retained GPU allocation.
    entryInsideMesh?.removeFromParent();
    entryInsideGeometry?.dispose();
    entryInsideMaterial?.dispose();
    entryWispMesh?.removeFromParent();
    entryWispMesh?.dispose();
    entryWispGeometry?.dispose();
    entryWispMaterial?.dispose();
    entryInsideMesh = null;
    entryInsideGeometry = null;
    entryInsideMaterial = null;
    entryWispMesh = null;
    entryWispGeometry = null;
    entryWispMaterial = null;
    entryWispPhaseAttribute = null;
  }

  function entrySnapshot() {
    return Object.freeze({
      active: entryState.phase === "holding" || entryState.phase === "clearing",
      phase: entryState.phase,
      reason: entryState.reason,
      coverage: entryState.coverage,
      opacity: entryState.opacity,
      fogDensity: entryState.fogDensity,
      wispInstances: entryWispMesh?.count ?? 0,
      wispResourcesAllocated: entryWispMesh !== null,
      insideLayerAllocated: entryInsideMesh !== null,
    });
  }

  function beginCloudBreak({ nowSeconds } = {}) {
    tearDownEntryResources();
    entryState.phase = "holding";
    entryState.reason = null;
    entryState.begunAtSeconds = Number.isFinite(nowSeconds) ? nowSeconds : Number.NaN;
    entryState.clearAtSeconds = Number.NaN;
    entryState.coverage = entryLayer.coverage;
    entryState.opacity = 1;
    entryState.fogDensity = entryLayer.extinctionPerM;
    createEntryResources();
    return entrySnapshot();
  }

  function updateEntryWisps(camera, elapsedSeconds, trueAirspeedKts) {
    if (!entryWispMesh || !camera?.position || !camera?.quaternion) return;
    const reportedTrueAirspeedKts = Number(trueAirspeedKts);
    const trueAirspeedMps = clamp(
      Number.isFinite(reportedTrueAirspeedKts) ? reportedTrueAirspeedKts : 400,
      0,
      720,
    ) * 0.514444;
    entryInsideMesh.position.copy(camera.position);
    entryInsideMaterial.uniforms.uCoverage.value = entryState.coverage;
    entryInsideMaterial.uniforms.uOpacity.value = entryState.opacity;
    entryForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    entryRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    entryUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    for (let index = 0; index < entryWispCount; index++) {
      const lane = unitHash(index, 0, 91);
      const vertical = unitHash(index, 0, 92);
      const phase = unitHash(index, 0, 93);
      const speedScale = 0.78 + unitHash(index, 0, 94) * 0.62;
      const travelLength = 105 + unitHash(index, 0, 95) * 75;
      const distanceAhead = 88
        - ((elapsedSeconds * trueAirspeedMps * speedScale + phase * travelLength)
          % travelLength);
      const proximity = 1 - clamp((distanceAhead + 12) / 100, 0, 1);
      const side = (lane < 0.5 ? -1 : 1)
        * (3.5 + Math.abs(lane - 0.5) * 19 + proximity * 6.5);
      const height = (vertical - 0.5) * (10 + proximity * 7);
      entryWispDummy.position.copy(camera.position)
        .addScaledVector(entryForward, distanceAhead)
        .addScaledVector(entryRight, side)
        .addScaledVector(entryUp, height);
      entryWispDummy.quaternion.copy(camera.quaternion);
      entryWispDummy.rotateZ((unitHash(index, 0, 96) - 0.5) * 0.55);
      entryWispDummy.scale.set(
        4.5 + unitHash(index, 0, 97) * 7.5 + proximity * 5,
        1.0 + unitHash(index, 0, 98) * 2.2,
        1,
      );
      entryWispDummy.updateMatrix();
      entryWispMesh.setMatrixAt(index, entryWispDummy.matrix);
      entryWispPhaseAttribute.setX(index, phase * 29 + index * 1.7);
    }
    entryWispMaterial.uniforms.uOpacity.value = entryState.opacity * 0.74;
    entryWispMesh.instanceMatrix.needsUpdate = true;
    entryWispPhaseAttribute.needsUpdate = true;
  }

  function updateCloudBreak({
    camera,
    nowSeconds,
    terrainStats,
    trueAirspeedKts,
  } = {}) {
    if (entryState.phase !== "holding" && entryState.phase !== "clearing") {
      return entrySnapshot();
    }
    const now = finite(nowSeconds);
    if (!Number.isFinite(entryState.begunAtSeconds)) entryState.begunAtSeconds = now;
    const elapsedSeconds = Math.max(0, now - entryState.begunAtSeconds);
    // Residency is the primary release. Wall time is deliberately only the escape hatch for a
    // disabled, missing, or failed terrain pack.
    const resident = finite(terrainStats?.residentPages) >= entryResidentPages
      && finite(terrainStats?.residentChunks) >= entryResidentChunks;
    const timedOut = elapsedSeconds >= entryHoldTimeoutSeconds;
    if (entryState.phase === "holding" && (resident || timedOut)) {
      entryState.phase = "clearing";
      entryState.reason = resident ? "residency" : "timeout";
      entryState.clearAtSeconds = now;
    }
    if (entryState.phase === "clearing") {
      const clearProgress = smoothstep01(
        (now - entryState.clearAtSeconds) / entryClearSeconds,
      );
      entryState.coverage = entryLayer.coverage * (1 - clearProgress);
      entryState.opacity = 1 - clearProgress;
      entryState.fogDensity = entryLayer.extinctionPerM
        * entryState.coverage * entryState.opacity;
      if (clearProgress >= 1) {
        entryState.phase = "complete";
        entryState.coverage = 0;
        entryState.opacity = 0;
        entryState.fogDensity = 0;
        tearDownEntryResources();
        return entrySnapshot();
      }
    }
    updateEntryWisps(camera, elapsedSeconds, trueAirspeedKts);
    return entrySnapshot();
  }

  function cancelCloudBreak() {
    entryState.phase = "idle";
    entryState.reason = "cancelled";
    entryState.coverage = 0;
    entryState.opacity = 0;
    entryState.fogDensity = 0;
    tearDownEntryResources();
    return entrySnapshot();
  }


  function rebuild(cameraPosition, timeSeconds) {
    descriptors.length = 0;
    const half = Math.floor(gridSize / 2);
    weather.layers.slice(0, maxLayers).forEach((layer, layerIndex) => {
      const cellSize = Math.max(2200, layer.scaleMetres * 0.92);
      const canonicalX = cameraPosition.x - layer.windEastMps * timeSeconds;
      const canonicalNorth = -cameraPosition.z - layer.windNorthMps * timeSeconds;
      const centreCellX = Math.floor(canonicalX / cellSize);
      const centreCellZ = Math.floor(canonicalNorth / cellSize);
      for (let z = -half; z <= half; z++) {
        for (let x = -half; x <= half; x++) {
          const descriptor = layerDescriptor(centreCellX + x, centreCellZ + z,
            layer, layerIndex, weather.seed);
          descriptors.push(descriptor);
          if (descriptor.present) {
            for (let lobe = 1; lobe < lobesPerCloud; lobe++) {
              descriptors.push(attachedLobeDescriptor(descriptor, lobe - 1));
            }
          }
        }
      }
    });
    for (const cell of weather.cells.slice(0, maxCells)) descriptors.push({ ...cell });
  }

  function nextGridKey(cameraPosition, timeSeconds) {
    return weather.layers.slice(0, maxLayers).map((layer) => {
      const cellSize = Math.max(2200, layer.scaleMetres * 0.92);
      const x = Math.floor((cameraPosition.x - layer.windEastMps * timeSeconds) / cellSize);
      const north = Math.floor((-cameraPosition.z - layer.windNorthMps * timeSeconds) / cellSize);
      return `${x}:${north}`;
    }).join("|");
  }

  function lifecycle(age, lifetime, transition) {
    if (age < 0 || age > lifetime) return 0;
    if (transition <= 0) return 1;
    return smoothstep01(age / transition) * smoothstep01((lifetime - age) / transition);
  }

  function applyMatrices(timeSeconds) {
    const sun = uniforms.uSunDirection.value;
    const sunY = Math.max(0.12, Math.abs(sun.y));
    let index = 0;
    for (const descriptor of descriptors) {
      if (descriptor.kind === "cell") {
        const age = timeSeconds - descriptor.startS;
        const life = lifecycle(age, descriptor.lifetimeS, descriptor.transitionS);
        descriptor.present = life > 0.001;
        descriptor.opacity = descriptor.peakCoverage * life;
        descriptor.x = descriptor.initialX + descriptor.windX * Math.max(0, age);
        descriptor.z = descriptor.initialZ + descriptor.windZ * Math.max(0, age);
      } else {
        descriptor.x = descriptor.originX + descriptor.windX * timeSeconds;
        descriptor.z = descriptor.originZ + descriptor.windZ * timeSeconds;
      }

      const shown = descriptor.present && descriptor.opacity > 0.002;
      // Hidden weather cells still participate in deterministic coverage/density queries, but
      // sending degenerate sphere instances for them wastes vertex and attribute bandwidth.
      if (!shown) continue;
      dummy.position.set(descriptor.x, descriptor.y, descriptor.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(descriptor.radiusX, descriptor.radiusY,
        volumetric ? descriptor.radiusZ : 1);
      dummy.updateMatrix();
      cloudMesh.setMatrixAt(index, dummy.matrix);
      opacityAttribute.setX(index, descriptor.opacity);
      phaseAttribute.setX(index, descriptor.phase ?? 0);

      const groundOffset = descriptor.y / sunY;
      dummy.position.set(
        descriptor.x - sun.x * groundOffset,
        1.2,
        descriptor.z - sun.z * groundOffset,
      );
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(descriptor.radiusX * 0.88, descriptor.radiusZ * 0.78, 1);
      dummy.updateMatrix();
      shadowMesh.setMatrixAt(index, dummy.matrix);
      index++;
    }
    cloudMesh.count = index;
    shadowMesh.count = index;
    cloudMesh.instanceMatrix.needsUpdate = true;
    shadowMesh.instanceMatrix.needsUpdate = true;
    opacityAttribute.needsUpdate = true;
    phaseAttribute.needsUpdate = true;
  }

  function update(cameraPosition, simulationTimeSeconds, fogColor, fogDensity, sunDirection) {
    const timeSeconds = Math.max(0, finite(simulationTimeSeconds));
    const nextKey = nextGridKey(cameraPosition, timeSeconds);
    if (nextKey !== gridKey) {
      gridKey = nextKey;
      rebuild(cameraPosition, timeSeconds);
      matricesDirty = true;
    }
    if (sunDirection?.isVector3) {
      nextSunDirection.copy(sunDirection).normalize();
      if (nextSunDirection.distanceToSquared(uniforms.uSunDirection.value) > 1e-12) {
        uniforms.uSunDirection.value.copy(nextSunDirection);
        matricesDirty = true;
      }
    }
    // The render loop can present the same simulation snapshot more than once. Do not rebuild and
    // upload both instance buffers until deterministic time, grid placement, or sun direction moves.
    if (matricesDirty || timeSeconds !== appliedTimeSeconds) {
      applyMatrices(timeSeconds);
      matricesDirty = false;
      appliedTimeSeconds = timeSeconds;
    }
    uniforms.uTime.value = timeSeconds;
    if (fogColor?.isColor) uniforms.uFogColor.value.copy(fogColor);
    if (Number.isFinite(fogDensity)) uniforms.uFogDensity.value = fogDensity;
    return cloudDensityAt(cameraPosition, descriptors);
  }

  function configure(configuration = {}) {
    const normalized = {
      id: String(configuration.id ?? "weather.custom"),
      seed: String(configuration.seed ?? "0000000000000001"),
      layers: Array.isArray(configuration.layers)
        ? configuration.layers.map(normalizeLayer).slice(0, maxLayers) : [],
      cells: Array.isArray(configuration.cells)
        ? configuration.cells.map((cell) => cell.kind === "cell" ? { ...cell } : normalizeCell(cell))
          .slice(0, maxCells) : [],
    };
    weather = normalized;
    weatherKey = `${weather.id}|${weather.seed}`;
    gridKey = "";
  }

  function configureFromState(state = {}) {
    const next = weatherConfigurationFromState(state);
    const nextKey = `${next.id}|${next.seed}`;
    if (nextKey === weatherKey) return false;
    configure(next);
    return true;
  }

  function dispose() {
    tearDownEntryResources();
    group.removeFromParent();
    geometry.dispose();
    material.dispose();
    shadowGeometry.dispose();
    shadowMaterial.dispose();
  }

  return Object.freeze({
    group,
    cloudMesh,
    shadowMesh,
    descriptors,
    uniforms,
    get settings() { return weather; },
    volumetric,
    lobesPerCloud,
    get entryWispMesh() { return entryWispMesh; },
    get entryInsideMesh() { return entryInsideMesh; },
    update,
    configure,
    configureFromState,
    beginCloudBreak,
    updateCloudBreak,
    cancelCloudBreak,
    cloudBreakDiagnostics: entrySnapshot,
    dispose,
  });
}
