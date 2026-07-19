function seededUnit(index, channel) {
  let value = Math.imul((index + 1) | 0, 0x45d9f3b)
    ^ Math.imul((channel + 11) | 0, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  return ((value ^ (value >>> 13)) >>> 0) / 0xffffffff;
}
export function nextDamageSmokeIndex(current, capacity) {
  const size = Math.max(1, Number(capacity) | 0);
  return ((Number(current) | 0) + 1 + size) % size;
}

export function shouldEmitDamageSmoke(lastEmitSeconds, nowSeconds, intervalSeconds = 0.09) {
  return Number.isFinite(nowSeconds)
    && (!Number.isFinite(lastEmitSeconds) || nowSeconds - lastEmitSeconds >= intervalSeconds);
}

const VERTEX_SHADER = /* glsl */ `
  precision highp float;
  attribute float aBirth;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAge;
  varying float vSeed;
  varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    float age = max(0.0, uTime - aBirth);
    vec3 animated = position;
    animated.y += age * (2.2 + aSeed * 2.4);
    animated.x += sin(age * 1.7 + aSeed * 17.0) * age * 0.32;
    animated.z += cos(age * 1.3 + aSeed * 11.0) * age * 0.28;
    vec4 world = modelMatrix * vec4(animated, 1.0);
    vec4 view = viewMatrix * world;
    vAge = age;
    vSeed = aSeed;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * view;
    float worldSize = mix(0.75, 5.8, clamp(age / 4.8, 0.0, 1.0));
    gl_PointSize = clamp(worldSize * uPixelRatio * 310.0 / max(1.0, -view.z), 1.0, 34.0);
    #include <logdepthbuf_vertex>
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying float vAge;
  varying float vSeed;
  varying vec3 vWorld;
  #include <logdepthbuf_pars_fragment>
  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float radius = length(point);
    float edge = 1.0 - smoothstep(0.42, 1.0, radius);
    float breakup = 0.72 + 0.28 * sin(point.x * 8.0 + point.y * 11.0 + vSeed * 19.0);
    float life = smoothstep(0.0, 0.22, vAge) * (1.0 - smoothstep(3.2, 6.3, vAge));
    float fog = 1.0 - exp(-uFogDensity * uFogDensity
      * dot(vWorld - cameraPosition, vWorld - cameraPosition));
    vec3 color = mix(uColor * (0.76 + vSeed * 0.22), uFogColor, fog);
    float alpha = edge * breakup * life * 0.58 * (1.0 - fog * 0.74);
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color, alpha);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createDamageSmokeTrail(THREE, options = {}) {
  const capacity = Math.max(8, Number(options.capacity) | 0 || 56);
  const positions = new Float32Array(capacity * 3);
  const births = new Float32Array(capacity);
  const seeds = new Float32Array(capacity);
  births.fill(-1000);
  for (let index = 0; index < capacity; index++) seeds[index] = seededUnit(index, 0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aBirth",
    new THREE.BufferAttribute(births, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(2, Number(options.pixelRatio) || 1) },
    uColor: { value: new THREE.Color(options.color ?? 0x252a2c) },
    uFogColor: { value: new THREE.Color(options.fogColor ?? 0x7898a0) },
    uFogDensity: { value: Number(options.fogDensity) || 0.000055 },
  };
  const material = new THREE.ShaderMaterial({
    name: "MAT_DAMAGE_SMOKE_TRAIL",
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = options.name ?? "DAMAGE_SMOKE_TRAIL";
  points.frustumCulled = false;
  points.renderOrder = 10;
  points.userData.noShadow = true;

  let cursor = capacity - 1;
  let lastEmitSeconds = Number.NEGATIVE_INFINITY;

  function emit(position, nowSeconds) {
    if (!shouldEmitDamageSmoke(lastEmitSeconds, nowSeconds, options.intervalSeconds ?? 0.09)) {
      return false;
    }
    cursor = nextDamageSmokeIndex(cursor, capacity);
    const offset = cursor * 3;
    const seed = seeds[cursor];
    positions[offset] = Number(position?.x) + (seed - 0.5) * 0.34;
    positions[offset + 1] = Number(position?.y) + (seededUnit(cursor, 1) - 0.5) * 0.26;
    positions[offset + 2] = Number(position?.z) + (seededUnit(cursor, 2) - 0.5) * 0.34;
    births[cursor] = nowSeconds;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aBirth.needsUpdate = true;
    lastEmitSeconds = nowSeconds;
    return true;
  }

  function update(nowSeconds, fogColor, fogDensity, pixelRatio) {
    uniforms.uTime.value = Number(nowSeconds) || 0;
    if (fogColor?.isColor) uniforms.uFogColor.value.copy(fogColor);
    if (Number.isFinite(fogDensity)) uniforms.uFogDensity.value = fogDensity;
    if (Number.isFinite(pixelRatio)) uniforms.uPixelRatio.value = Math.min(2, pixelRatio);
  }

  function clear() {
    births.fill(-1000);
    geometry.attributes.aBirth.needsUpdate = true;
    lastEmitSeconds = Number.NEGATIVE_INFINITY;
  }

  function dispose() {
    points.removeFromParent();
    geometry.dispose();
    material.dispose();
  }

  return Object.freeze({ points, uniforms, emit, update, clear, dispose, positions, births });
}
