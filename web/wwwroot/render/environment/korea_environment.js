const DEFAULT_PROFILE_URL = "../../content/packs/korea-1950s/visual-profile.json";
const DEFAULT_OCEAN_URL = "../../content/packs/korea-1950s/environment/ocean.material.json";
const DEFAULT_ATMOSPHERE_URL = "../../content/packs/korea-1950s/environment/atmosphere.material.json";

const OCEAN_VERTEX = `
uniform float uTime;
uniform vec4 uWaveA;
uniform vec4 uWaveB;
uniform vec4 uWaveC;
uniform vec3 uWaveSpeed;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void applyWave(vec4 wave, float speed, vec2 point, inout float height, inout vec2 slope) {
  vec2 direction = normalize(wave.xy);
  float waveNumber = 6.28318530718 / max(wave.w, 0.001);
  float phase = dot(direction, point) * waveNumber + uTime * speed * waveNumber;
  height += sin(phase) * wave.z;
  slope += cos(phase) * wave.z * waveNumber * direction;
}

void main() {
  vec3 transformed = position;
  float height = 0.0;
  vec2 slope = vec2(0.0);
  applyWave(uWaveA, uWaveSpeed.x, transformed.xz, height, slope);
  applyWave(uWaveB, uWaveSpeed.y, transformed.xz, height, slope);
  applyWave(uWaveC, uWaveSpeed.z, transformed.xz, height, slope);
  transformed.y += height;
  vec3 localNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vUv = uv;
  vWorldPosition = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const OCEAN_FRAGMENT = `
uniform float uTime;
uniform sampler2D uNormalMap;
uniform sampler2D uFoamMap;
uniform vec3 uDeepColor;
uniform vec3 uMidColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform float uNormalStrength;
uniform float uFresnelPower;
uniform float uFoamThreshold;
uniform float uFoamSoftness;
uniform float uSunGlintPower;
uniform float uSunGlintStrength;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec2 detailUv = vWorldPosition.xz * 0.0015 + vec2(uTime * 0.008, -uTime * 0.005);
  vec3 detailA = texture2D(uNormalMap, detailUv).xyz * 2.0 - 1.0;
  vec3 detailB = texture2D(uNormalMap, detailUv * 0.43 + vec2(-uTime * 0.003, uTime * 0.006)).xyz * 2.0 - 1.0;
  vec3 detail = normalize(detailA + detailB * 0.62);
  vec3 normal = normalize(vWorldNormal + vec3(detail.x, detail.z * 0.32, detail.y) * uNormalStrength);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, uFresnelPower);
  float skyMix = clamp(normal.y * 0.55 + 0.45, 0.0, 1.0);
  vec3 water = mix(uDeepColor, uMidColor, skyMix);
  water = mix(water, uShallowColor, fresnel * 0.32);
  vec3 halfVector = normalize(viewDirection + normalize(uSunDirection));
  float glint = pow(max(dot(normal, halfVector), 0.0), uSunGlintPower) * uSunGlintStrength;
  float foamNoise = texture2D(uFoamMap, vWorldPosition.xz * 0.0007 + vec2(uTime * 0.006, uTime * 0.002)).r;
  float crest = smoothstep(uFoamThreshold, uFoamThreshold + uFoamSoftness, 1.0 - normal.y + foamNoise * 0.48);
  vec3 color = mix(water, uFoamColor, crest * 0.72) + uSunColor * glint;
  float distanceToCamera = length(cameraPosition - vWorldPosition);
  float fog = smoothstep(uFogRange.x, uFogRange.y, distanceToCamera);
  color = mix(color, uFogColor, fog);
  gl_FragColor = vec4(color, 1.0);
}
`;

const SKY_VERTEX = `
varying vec3 vWorldDirection;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(world.xyz - cameraPosition);
  vec4 clip = projectionMatrix * viewMatrix * world;
  gl_Position = clip.xyww;
}
`;

const SKY_FRAGMENT = `
uniform vec3 uZenithColor;
uniform vec3 uUpperColor;
uniform vec3 uHorizonColor;
uniform vec3 uHazeColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uSunRadius;
uniform float uSunGlow;
uniform float uSunIntensity;
uniform float uHorizonHaze;
varying vec3 vWorldDirection;

void main() {
  vec3 direction = normalize(vWorldDirection);
  float altitude = clamp(direction.y, -0.08, 1.0);
  float upperMix = smoothstep(0.08, 0.72, altitude);
  vec3 sky = mix(uHorizonColor, uUpperColor, smoothstep(-0.02, 0.36, altitude));
  sky = mix(sky, uZenithColor, upperMix);
  float horizon = exp(-abs(altitude) * 15.0) * uHorizonHaze;
  sky = mix(sky, uHazeColor, horizon);
  float sunDot = clamp(dot(direction, normalize(uSunDirection)), 0.0, 1.0);
  float disc = smoothstep(cos(uSunRadius), 1.0, sunDot);
  float glow = pow(sunDot, uSunGlow) * 0.42;
  sky += uSunColor * (disc * uSunIntensity + glow);
  gl_FragColor = vec4(sky, 1.0);
}
`;

const CLOUD_VERTEX = `
varying vec2 vCloudUv;
varying vec3 vWorldDirection;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vCloudUv = uv;
  vWorldDirection = normalize(world.xyz - cameraPosition);
  vec4 clip = projectionMatrix * viewMatrix * world;
  gl_Position = clip.xyww;
}
`;

const CLOUD_FRAGMENT = `
uniform sampler2D uCloudShape;
uniform float uTime;
uniform float uCoverage;
uniform float uDensity;
uniform float uScale;
uniform vec2 uWind;
uniform vec3 uLightColor;
uniform vec3 uShadowColor;
uniform vec3 uSunDirection;
varying vec2 vCloudUv;
varying vec3 vWorldDirection;

void main() {
  vec2 motion = uWind * uTime * uScale;
  vec2 uvA = vCloudUv * vec2(1.8, 0.9) + motion;
  vec2 uvB = vCloudUv.yx * vec2(4.3, 2.1) - motion * 1.7;
  vec4 shape = texture2D(uCloudShape, uvA);
  float detail = texture2D(uCloudShape, uvB).g;
  float cloud = smoothstep(uCoverage, uCoverage + 0.18, shape.r * 0.82 + detail * 0.18);
  float horizonFade = smoothstep(-0.015, 0.16, normalize(vWorldDirection).y);
  float illumination = clamp(dot(normalize(vWorldDirection + vec3(0.0, 0.35, 0.0)), normalize(uSunDirection)) * 0.34 + 0.66, 0.0, 1.0);
  vec3 color = mix(uShadowColor, uLightColor, illumination + shape.b * 0.22);
  float alpha = cloud * uDensity * (0.66 + shape.g * 0.34) * horizonFade;
  if (alpha < 0.012) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

function color(THREE, value) {
  return new THREE.Color(value);
}

function createGridGeometry(THREE, size, segments) {
  const side = segments + 1;
  const positions = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  const indices = new Uint32Array(segments * segments * 6);
  let vertexOffset = 0;
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const v = z / segments;
      positions[vertexOffset * 3] = (u - 0.5) * size;
      positions[vertexOffset * 3 + 1] = 0;
      positions[vertexOffset * 3 + 2] = (v - 0.5) * size;
      uvs[vertexOffset * 2] = u;
      uvs[vertexOffset * 2 + 1] = v;
      vertexOffset++;
    }
  }
  let indexOffset = 0;
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const a = z * side + x;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[indexOffset++] = a; indices[indexOffset++] = c; indices[indexOffset++] = b;
      indices[indexOffset++] = b; indices[indexOffset++] = c; indices[indexOffset++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Environment asset request failed: ${response.status} ${url}`);
  return response.json();
}

async function loadTexture(THREE, loader, descriptor, documentUrl) {
  const texture = await loader.loadAsync(new URL(descriptor.uri, documentUrl).href);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function tierSettings(config, tier) {
  return config.geometry?.tiers?.[tier] ?? config.geometry?.tiers?.balanced ?? {};
}

export async function loadKoreaEnvironment(THREE, options = {}) {
  const baseUrl = options.baseUrl ?? import.meta.url;
  const fetchImpl = options.fetch ?? fetch;
  const oceanUrl = new URL(options.oceanUrl ?? DEFAULT_OCEAN_URL, baseUrl).href;
  const atmosphereUrl = new URL(options.atmosphereUrl ?? DEFAULT_ATMOSPHERE_URL, baseUrl).href;
  const [oceanConfig, atmosphereConfig] = await Promise.all([
    fetchJson(oceanUrl, fetchImpl),
    fetchJson(atmosphereUrl, fetchImpl),
  ]);
  const loader = options.textureLoader ?? new THREE.TextureLoader(options.manager);
  const [normalMap, foamMap, cloudShape] = await Promise.all([
    loadTexture(THREE, loader, oceanConfig.textures.normal, oceanUrl),
    loadTexture(THREE, loader, oceanConfig.textures.foam, oceanUrl),
    loadTexture(THREE, loader, atmosphereConfig.textures.cloudShape, atmosphereUrl),
  ]);
  return createKoreaEnvironment(THREE, { ...options, oceanConfig, atmosphereConfig, normalMap, foamMap, cloudShape });
}

export function createKoreaEnvironment(THREE, options) {
  const tier = options.qualityTier ?? "balanced";
  const ocean = options.oceanConfig;
  const atmosphere = options.atmosphereConfig;
  const group = new THREE.Group();
  group.name = "KOREA_ENVIRONMENT_ROOT";

  const sunDirection = new THREE.Vector3(0.32, 0.74, -0.59).normalize();
  const oceanTier = tierSettings(ocean, tier);
  const wave = (index) => {
    const item = ocean.waves[index];
    return new THREE.Vector4(item.direction[0], item.direction[1], item.amplitude, item.wavelength);
  };
  const oceanMaterial = new THREE.ShaderMaterial({
    name: "MAT_OCEAN_KOREA",
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uWaveA: { value: wave(0) },
      uWaveB: { value: wave(1) },
      uWaveC: { value: wave(2) },
      uWaveSpeed: { value: new THREE.Vector3(...ocean.waves.slice(0, 3).map((item) => item.speed)) },
      uNormalMap: { value: options.normalMap },
      uFoamMap: { value: options.foamMap },
      uDeepColor: { value: color(THREE, ocean.colors.deep) },
      uMidColor: { value: color(THREE, ocean.colors.mid) },
      uShallowColor: { value: color(THREE, ocean.colors.shallow) },
      uFoamColor: { value: color(THREE, ocean.colors.foam) },
      uSunColor: { value: color(THREE, ocean.colors.sunGlint) },
      uSunDirection: { value: sunDirection.clone() },
      uFogColor: { value: color(THREE, options.fogColor ?? "#A8C1CC") },
      uFogRange: { value: new THREE.Vector2(options.fogNear ?? 9000, options.fogFar ?? 56000) },
      uNormalStrength: { value: ocean.optics.normalStrength },
      uFresnelPower: { value: ocean.optics.fresnelPower },
      uFoamThreshold: { value: ocean.optics.foamThreshold },
      uFoamSoftness: { value: ocean.optics.foamSoftness },
      uSunGlintPower: { value: ocean.optics.sunGlintPower },
      uSunGlintStrength: { value: ocean.optics.sunGlintStrength },
    },
  });
  const oceanMesh = new THREE.Mesh(
    createGridGeometry(THREE, ocean.geometry.diameter, oceanTier.segments ?? 160),
    oceanMaterial,
  );
  oceanMesh.name = "OCEAN_SURFACE";
  oceanMesh.frustumCulled = false;
  group.add(oceanMesh);

  const sky = atmosphere.sky;
  const skyMaterial = new THREE.ShaderMaterial({
    name: "MAT_SKY_KOREA",
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenithColor: { value: color(THREE, sky.zenithColor) },
      uUpperColor: { value: color(THREE, sky.upperColor) },
      uHorizonColor: { value: color(THREE, sky.horizonColor) },
      uHazeColor: { value: color(THREE, sky.groundHazeColor) },
      uSunColor: { value: color(THREE, sky.sunColor) },
      uSunDirection: { value: sunDirection.clone() },
      uSunRadius: { value: THREE.MathUtils.degToRad(sky.sunAngularRadiusDegrees) },
      uSunGlow: { value: Math.max(18, 720 / sky.sunGlowDegrees) },
      uSunIntensity: { value: sky.sunIntensity },
      uHorizonHaze: { value: sky.horizonHaze },
    },
  });
  const skyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(atmosphere.geometry.skyRadius, 64, 32),
    skyMaterial,
  );
  skyMesh.name = "SKY_DOME";
  skyMesh.renderOrder = -1000;
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  const atmosphereTier = tierSettings(atmosphere, tier);
  const cloudMeshes = [];
  const layerLimit = atmosphereTier.cloudLayers ?? atmosphere.cloudLayers.length;
  for (const [index, layer] of atmosphere.cloudLayers.slice(0, layerLimit).entries()) {
    const material = new THREE.ShaderMaterial({
      name: `MAT_CLOUD_${layer.id.toUpperCase().replaceAll("-", "_")}`,
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uCloudShape: { value: options.cloudShape },
        uTime: { value: 0 },
        uCoverage: { value: 0.42 + (1 - layer.coverage) * 0.26 },
        uDensity: { value: layer.density },
        uScale: { value: layer.scale },
        uWind: { value: new THREE.Vector2(...layer.wind) },
        uLightColor: { value: color(THREE, layer.lightColor) },
        uShadowColor: { value: color(THREE, layer.shadowColor) },
        uSunDirection: { value: sunDirection.clone() },
      },
    });
    const radius = atmosphere.geometry.cloudRadius + index * 900;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, atmosphereTier.radialSegments ?? 96, 48),
      material,
    );
    mesh.name = `CLOUD_LAYER_${layer.id.toUpperCase().replaceAll("-", "_")}`;
    mesh.renderOrder = -900 + index;
    mesh.frustumCulled = false;
    cloudMeshes.push(mesh);
    group.add(mesh);
  }

  let disposed = false;
  return {
    group,
    ocean: oceanMesh,
    sky: skyMesh,
    clouds: cloudMeshes,
    sunDirection,
    update({ timeSeconds = 0, cameraPosition, sunDirection: nextSun } = {}) {
      if (disposed) return;
      oceanMaterial.uniforms.uTime.value = timeSeconds;
      for (const mesh of cloudMeshes) mesh.material.uniforms.uTime.value = timeSeconds;
      if (cameraPosition) {
        group.position.x = cameraPosition.x;
        group.position.z = cameraPosition.z;
        group.position.y = 0;
      }
      if (nextSun) {
        sunDirection.copy(nextSun).normalize();
        oceanMaterial.uniforms.uSunDirection.value.copy(sunDirection);
        skyMaterial.uniforms.uSunDirection.value.copy(sunDirection);
        for (const mesh of cloudMeshes) mesh.material.uniforms.uSunDirection.value.copy(sunDirection);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      oceanMesh.geometry.dispose();
      oceanMaterial.dispose();
      skyMesh.geometry.dispose();
      skyMaterial.dispose();
      for (const mesh of cloudMeshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
      options.normalMap?.dispose();
      options.foamMap?.dispose();
      options.cloudShape?.dispose();
      group.removeFromParent();
    },
  };
}
