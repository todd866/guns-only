const DEFAULT_CELL_SIZE_METRES = 6200;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
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

/** Deterministic world-anchored cloud placement shared by runtime and tests. */
export function cloudCellDescriptor(cellX, cellZ, options = {}) {
  const cellSize = options.cellSizeMetres ?? DEFAULT_CELL_SIZE_METRES;
  const baseAltitude = options.altitudeMetres ?? 1450;
  const thickness = options.thicknessMetres ?? 620;
  const coverage = clamp(options.coverage ?? 0.38, 0, 1);
  const present = unitHash(cellX, cellZ, 0) < coverage;
  const width = 1050 + unitHash(cellX, cellZ, 3) * 1750;
  const height = 310 + unitHash(cellX, cellZ, 4) * 460;
  return Object.freeze({
    cellX,
    cellZ,
    present,
    x: (cellX + 0.16 + unitHash(cellX, cellZ, 1) * 0.68) * cellSize,
    z: (cellZ + 0.16 + unitHash(cellX, cellZ, 2) * 0.68) * cellSize,
    y: baseAltitude + (unitHash(cellX, cellZ, 5) - 0.5) * thickness * 0.58,
    width,
    height,
    opacity: 0.58 + unitHash(cellX, cellZ, 6) * 0.30,
    phase: unitHash(cellX, cellZ, 7) * 37,
  });
}

/** Approximate extinction inside the ellipsoidal tactical cloud volume. */
export function cloudDensityAt(position, descriptors) {
  let density = 0;
  for (const cloud of descriptors ?? []) {
    if (!cloud?.present) continue;
    const nx = (Number(position?.x) - cloud.x) / Math.max(1, cloud.width * 0.43);
    const ny = (Number(position?.y) - cloud.y) / Math.max(1, cloud.height * 0.58);
    const nz = (Number(position?.z) - cloud.z) / Math.max(1, cloud.width * 0.43);
    const radius = Math.sqrt(nx * nx + ny * ny + nz * nz);
    density = Math.max(density, 1 - clamp((radius - 0.34) / 0.66, 0, 1));
  }
  return density;
}

const CLOUD_VERTEX = /* glsl */ `
  precision highp float;
  varying vec2 vCloudUv;
  varying vec3 vWorldCenter;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 worldAxisX = (modelMatrix * vec4(instanceMatrix[0].xyz, 0.0)).xyz;
    vec3 worldAxisY = (modelMatrix * vec4(instanceMatrix[1].xyz, 0.0)).xyz;
    vec4 viewCenter = viewMatrix * worldCenter;
    viewCenter.xy += position.xy * vec2(length(worldAxisX), length(worldAxisY));
    vCloudUv = uv;
    vWorldCenter = worldCenter.xyz;
    gl_Position = projectionMatrix * viewCenter;
    #include <logdepthbuf_vertex>
  }
`;

const CLOUD_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uDensity;
  uniform float uCoverage;
  uniform vec2 uWind;
  uniform vec3 uLightColor;
  uniform vec3 uShadowColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec2 vCloudUv;
  varying vec3 vWorldCenter;
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
    return mix(mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), f.x), f.y);
  }

  void main() {
    vec2 centred = vCloudUv * 2.0 - 1.0;
    vec2 motion = uWind * uTime * 0.000018;
    float broad = noise21(vCloudUv * 3.15 + motion + vWorldCenter.xz * 0.00017);
    float detail = noise21(vCloudUv * 8.7 - motion * 1.7 + vWorldCenter.zx * 0.00031);
    float body = broad * 0.73 + detail * 0.27;
    float envelope = 1.0 - smoothstep(0.46, 1.0,
      length(centred * vec2(0.82, 1.23)));
    float cloud = smoothstep(uCoverage, uCoverage + 0.18, body + envelope * 0.42);
    float lowerShade = smoothstep(0.94, 0.08, vCloudUv.y);
    vec3 color = mix(uLightColor, uShadowColor, lowerShade * (0.34 + broad * 0.32));
    float distanceToCamera = distance(cameraPosition, vWorldCenter);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity
      * distanceToCamera * distanceToCamera);
    color = mix(color, uFogColor, fog);
    float alpha = cloud * envelope * uDensity * (1.0 - fog * 0.72);
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color, alpha);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function tierGridSize(tier) {
  if (tier === "mobile") return 5;
  if (tier === "desktop") return 9;
  return 7;
}

export function createTacticalCloudField(THREE, options = {}) {
  const tier = options.qualityTier ?? "balanced";
  const gridSize = options.gridSize ?? tierGridSize(tier);
  const capacity = gridSize * gridSize;
  const settings = {
    cellSizeMetres: options.cellSizeMetres ?? DEFAULT_CELL_SIZE_METRES,
    altitudeMetres: options.altitudeMetres ?? 1450,
    thicknessMetres: options.thicknessMetres ?? 620,
    coverage: options.coverage ?? 0.38,
  };
  const group = new THREE.Group();
  group.name = "TACTICAL_CLOUD_FIELD";

  const uniforms = {
    uTime: { value: 0 },
    uDensity: { value: tier === "mobile" ? 0.62 : 0.78 },
    uCoverage: { value: 0.49 },
    uWind: { value: new THREE.Vector2(7.5, -1.8) },
    uLightColor: { value: new THREE.Color(0xf5f1e8) },
    uShadowColor: { value: new THREE.Color(0x758995) },
    uFogColor: { value: new THREE.Color(0x7898a0) },
    uFogDensity: { value: 0.000055 },
  };
  const material = new THREE.ShaderMaterial({
    name: "MAT_TACTICAL_CLOUDS",
    uniforms,
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
  const cloudMesh = new THREE.InstancedMesh(geometry, material, capacity);
  cloudMesh.name = "TACTICAL_CLOUD_PUFFS";
  cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cloudMesh.frustumCulled = false;
  cloudMesh.renderOrder = 2;
  cloudMesh.castShadow = false;
  cloudMesh.receiveShadow = false;
  group.add(cloudMesh);

  const shadowMaterial = new THREE.MeshBasicMaterial({
    name: "MAT_TACTICAL_CLOUD_SHADOWS",
    color: 0x183946,
    transparent: true,
    opacity: tier === "mobile" ? 0.035 : 0.065,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const shadowMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2, 2, 1, 1),
    shadowMaterial,
    capacity,
  );
  shadowMesh.name = "TACTICAL_CLOUD_SHADOWS";
  shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadowMesh.frustumCulled = false;
  shadowMesh.renderOrder = -4;
  group.add(shadowMesh);

  const dummy = new THREE.Object3D();
  const descriptors = [];
  let centreCellX = Number.NaN;
  let centreCellZ = Number.NaN;

  function rebuild(cameraPosition) {
    centreCellX = Math.floor(cameraPosition.x / settings.cellSizeMetres);
    centreCellZ = Math.floor(cameraPosition.z / settings.cellSizeMetres);
    descriptors.length = 0;
    const half = Math.floor(gridSize / 2);
    let index = 0;
    for (let z = -half; z <= half; z++) {
      for (let x = -half; x <= half; x++) {
        const descriptor = cloudCellDescriptor(centreCellX + x, centreCellZ + z, settings);
        descriptors.push(descriptor);
        if (descriptor.present) {
          dummy.position.set(descriptor.x, descriptor.y, descriptor.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(descriptor.width * 0.5, descriptor.height * 0.5, 1);
        } else {
          dummy.position.set(descriptor.x, descriptor.y, descriptor.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.0001);
        }
        dummy.updateMatrix();
        cloudMesh.setMatrixAt(index, dummy.matrix);

        if (descriptor.present) {
          dummy.position.set(descriptor.x, 0.42, descriptor.z);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.set(descriptor.width * 0.44, descriptor.width * 0.31, 1);
        } else {
          dummy.scale.setScalar(0.0001);
        }
        dummy.updateMatrix();
        shadowMesh.setMatrixAt(index, dummy.matrix);
        index++;
      }
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
    shadowMesh.instanceMatrix.needsUpdate = true;
  }

  function update(cameraPosition, timeSeconds, fogColor, fogDensity) {
    const nextCellX = Math.floor(cameraPosition.x / settings.cellSizeMetres);
    const nextCellZ = Math.floor(cameraPosition.z / settings.cellSizeMetres);
    if (nextCellX !== centreCellX || nextCellZ !== centreCellZ) rebuild(cameraPosition);
    uniforms.uTime.value = Number(timeSeconds) || 0;
    if (fogColor?.isColor) uniforms.uFogColor.value.copy(fogColor);
    if (Number.isFinite(fogDensity)) uniforms.uFogDensity.value = fogDensity;
    return cloudDensityAt(cameraPosition, descriptors);
  }

  function configure(configuration = {}) {
    if (Number.isFinite(configuration.altitudeMetres)) {
      settings.altitudeMetres = configuration.altitudeMetres;
    }
    if (Number.isFinite(configuration.thicknessMetres)) {
      settings.thicknessMetres = configuration.thicknessMetres;
    }
    if (Number.isFinite(configuration.coverage)) {
      settings.coverage = clamp(configuration.coverage, 0, 1);
    }
    if (Array.isArray(configuration.wind) && configuration.wind.length >= 2) {
      uniforms.uWind.value.set(Number(configuration.wind[0]) || 0, Number(configuration.wind[1]) || 0);
    }
    centreCellX = Number.NaN;
    centreCellZ = Number.NaN;
  }

  function dispose() {
    group.removeFromParent();
    geometry.dispose();
    material.dispose();
    shadowMesh.geometry.dispose();
    shadowMaterial.dispose();
  }

  return Object.freeze({
    group,
    cloudMesh,
    shadowMesh,
    descriptors,
    uniforms,
    settings,
    update,
    configure,
    dispose,
  });
}
