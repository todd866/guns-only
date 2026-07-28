const RATE_KEYS = Object.freeze({
  rain: "precipitation_rain_mm_water_equivalent_hr",
  snow: "precipitation_snow_mm_water_equivalent_hr",
  freezingDrizzle: "precipitation_freezing_drizzle_mm_water_equivalent_hr",
  freezingRain: "precipitation_freezing_rain_mm_water_equivalent_hr",
  icePellets: "precipitation_ice_pellets_mm_water_equivalent_hr",
  graupel: "precipitation_graupel_mm_water_equivalent_hr",
  hail: "precipitation_hail_mm_water_equivalent_hr",
});

export const WINTER_PRECIPITATION_SNAPSHOT_RATE_KEYS = RATE_KEYS;

export const WINTER_PRECIPITATION_TIER_CAPACITIES = Object.freeze({
  mobile: 768,
  balanced: 1_536,
  desktop: 3_072,
});

const MINIMUM_REQUESTED_CAPACITY = 64;
const MAXIMUM_RATE_MM_WATER_EQUIVALENT_PER_HOUR = 1_000;

const PHASE_NUMBER_WEIGHTS = Object.freeze({
  snow: 2.2,
  graupel: 1.35,
  icePellets: 0.8,
  liquid: 0.65,
  freezingDrizzle: 2.5,
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegativeRate(snapshot, key) {
  const value = snapshot?.[key];
  return Number.isFinite(value)
    ? clamp(value, 0, MAXIMUM_RATE_MM_WATER_EQUIVALENT_PER_HOUR)
    : 0;
}

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function tierId(qualityTier) {
  const requested = typeof qualityTier === "string" ? qualityTier : qualityTier?.id;
  return Object.hasOwn(WINTER_PRECIPITATION_TIER_CAPACITIES, requested)
    ? requested
    : "balanced";
}

/**
 * Resolves a fixed particle allocation for a visual tier. A caller may request fewer particles,
 * but never more than the tier ceiling.
 */
export function winterPrecipitationCapacityForTier(
  qualityTier = "balanced",
  requestedCapacity = undefined,
) {
  const ceiling = WINTER_PRECIPITATION_TIER_CAPACITIES[tierId(qualityTier)];
  if (requestedCapacity === undefined || requestedCapacity === null) return ceiling;
  const requested = Math.floor(Number(requestedCapacity));
  if (!Number.isFinite(requested)) return ceiling;
  return clamp(requested, MINIMUM_REQUESTED_CAPACITY, ceiling);
}

function phaseCutoffs(phaseRates) {
  const snowWeight = phaseRates.snow * PHASE_NUMBER_WEIGHTS.snow;
  const graupelWeight = phaseRates.graupel * PHASE_NUMBER_WEIGHTS.graupel;
  const icePelletWeight = phaseRates.icePellets * PHASE_NUMBER_WEIGHTS.icePellets;
  const liquidWeight = phaseRates.liquid * PHASE_NUMBER_WEIGHTS.liquid;
  const freezingDrizzleWeight =
    phaseRates.freezingDrizzle * PHASE_NUMBER_WEIGHTS.freezingDrizzle;
  const totalWeight = snowWeight
    + graupelWeight
    + icePelletWeight
    + liquidWeight
    + freezingDrizzleWeight;

  if (totalWeight <= 0) {
    return Object.freeze({
      snow: 0,
      graupel: 0,
      icePellets: 0,
      liquid: 0,
    });
  }

  const snow = snowWeight / totalWeight;
  const graupel = snow + graupelWeight / totalWeight;
  const icePellets = graupel + icePelletWeight / totalWeight;
  const liquid = icePellets + liquidWeight / totalWeight;
  return Object.freeze({
    snow: clamp(snow, 0, 1),
    graupel: clamp(graupel, 0, 1),
    icePellets: clamp(icePellets, 0, 1),
    liquid: clamp(liquid, 0, 1),
  });
}

function dominantPhase(phaseRates) {
  const ordered = [
    ["snow", phaseRates.snow],
    ["graupel", phaseRates.graupel],
    ["icePellets", phaseRates.icePellets],
    ["liquid", phaseRates.liquid],
    ["freezingDrizzle", phaseRates.freezingDrizzle],
  ];
  let dominant = null;
  let maximum = 0;
  for (const [phase, rate] of ordered) {
    if (rate <= maximum) continue;
    dominant = phase;
    maximum = rate;
  }
  return dominant;
}

/**
 * Converts the explicit precipitation snapshot contract into an immutable render configuration.
 * The deprecated aggregate `precipitation_mm_hr` key is intentionally ignored: it cannot tell
 * snow from rain and therefore cannot select safe fall speed, point size, or shape.
 */
export function winterPrecipitationConfigurationFromSnapshot(snapshot = {}) {
  const rates = Object.freeze({
    rainMmWaterEquivalentPerHour: nonNegativeRate(snapshot, RATE_KEYS.rain),
    snowMmWaterEquivalentPerHour: nonNegativeRate(snapshot, RATE_KEYS.snow),
    freezingDrizzleMmWaterEquivalentPerHour:
      nonNegativeRate(snapshot, RATE_KEYS.freezingDrizzle),
    freezingRainMmWaterEquivalentPerHour:
      nonNegativeRate(snapshot, RATE_KEYS.freezingRain),
    icePelletsMmWaterEquivalentPerHour:
      nonNegativeRate(snapshot, RATE_KEYS.icePellets),
    graupelMmWaterEquivalentPerHour: nonNegativeRate(snapshot, RATE_KEYS.graupel),
    hailMmWaterEquivalentPerHour: nonNegativeRate(snapshot, RATE_KEYS.hail),
  });

  const phaseRates = Object.freeze({
    snow: rates.snowMmWaterEquivalentPerHour,
    graupel: rates.graupelMmWaterEquivalentPerHour,
    icePellets:
      rates.icePelletsMmWaterEquivalentPerHour + rates.hailMmWaterEquivalentPerHour,
    liquid:
      rates.rainMmWaterEquivalentPerHour + rates.freezingRainMmWaterEquivalentPerHour,
    freezingDrizzle: rates.freezingDrizzleMmWaterEquivalentPerHour,
  });
  const totalRateMmWaterEquivalentPerHour =
    rates.rainMmWaterEquivalentPerHour
    + rates.snowMmWaterEquivalentPerHour
    + rates.freezingDrizzleMmWaterEquivalentPerHour
    + rates.freezingRainMmWaterEquivalentPerHour
    + rates.icePelletsMmWaterEquivalentPerHour
    + rates.graupelMmWaterEquivalentPerHour
    + rates.hailMmWaterEquivalentPerHour;
  const weightedNumberRate =
    phaseRates.snow * PHASE_NUMBER_WEIGHTS.snow
    + phaseRates.graupel * PHASE_NUMBER_WEIGHTS.graupel
    + phaseRates.icePellets * PHASE_NUMBER_WEIGHTS.icePellets
    + phaseRates.liquid * PHASE_NUMBER_WEIGHTS.liquid
    + phaseRates.freezingDrizzle * PHASE_NUMBER_WEIGHTS.freezingDrizzle;
  const active = totalRateMmWaterEquivalentPerHour > 0;
  const density01 = active
    ? clamp(0.06 + 0.94 * (1 - Math.exp(-weightedNumberRate / 3.2)), 0, 1)
    : 0;
  const opacity01 = active
    ? clamp(0.28 + 0.62 * (1 - Math.exp(-totalRateMmWaterEquivalentPerHour / 5)), 0, 0.9)
    : 0;

  return Object.freeze({
    active,
    rates,
    phaseRates,
    phaseCutoffs: phaseCutoffs(phaseRates),
    dominantPhase: dominantPhase(phaseRates),
    totalRateMmWaterEquivalentPerHour,
    density01,
    opacity01,
    windVelocityMps: Object.freeze({
      x: finiteOr(snapshot?.wind_x_mps, 0),
      y: finiteOr(snapshot?.wind_y_mps, 0),
      // Simulation +Z is north; three.js mirrors north onto -Z. This is the single bridge flip,
      // matching tactical_clouds.js and the terrain/scenery wind path.
      z: -finiteOr(snapshot?.wind_z_mps, 0),
    }),
    visibilityM: positiveOr(
      snapshot?.precipitation_visibility_m,
      positiveOr(snapshot?.visibility_m, 1_000),
    ),
  });
}

function seededUnit(index, channel) {
  let value = Math.imul((index + 1) | 0, 0x45d9f3b)
    ^ Math.imul((channel + 17) | 0, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

const VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute float aSelector;
  attribute float aSeed;

  uniform float uSimulationTime;
  uniform float uPixelRatio;
  uniform float uViewportHeight;
  uniform vec3 uCameraPosition;
  uniform vec3 uVolumeHalfExtentsM;
  uniform vec3 uWindVelocityMps;
  uniform vec4 uPhaseCutoffs;
  uniform vec4 uFallSpeedsMps;
  uniform float uFreezingDrizzleFallSpeedMps;
  uniform vec4 uPointSizesM;
  uniform float uFreezingDrizzlePointSizeM;
  uniform vec3 uSnowColor;
  uniform vec3 uGraupelColor;
  uniform vec3 uIcePelletColor;
  uniform vec3 uLiquidColor;
  uniform vec3 uFreezingDrizzleColor;

  varying float vPhase;
  varying float vSeed;
  varying float vViewDistanceM;
  varying vec3 vColor;

  #include <common>
  #include <logdepthbuf_pars_vertex>

  void main() {
    float phase = 4.0;
    float fallSpeedMps = uFreezingDrizzleFallSpeedMps;
    float pointSizeM = uFreezingDrizzlePointSizeM;
    vec3 color = uFreezingDrizzleColor;
    float flutter = 0.10;

    if (aSelector < uPhaseCutoffs.x) {
      phase = 0.0;
      fallSpeedMps = uFallSpeedsMps.x;
      pointSizeM = uPointSizesM.x;
      color = uSnowColor;
      flutter = 1.0;
    } else if (aSelector < uPhaseCutoffs.y) {
      phase = 1.0;
      fallSpeedMps = uFallSpeedsMps.y;
      pointSizeM = uPointSizesM.y;
      color = uGraupelColor;
      flutter = 0.34;
    } else if (aSelector < uPhaseCutoffs.z) {
      phase = 2.0;
      fallSpeedMps = uFallSpeedsMps.z;
      pointSizeM = uPointSizesM.z;
      color = uIcePelletColor;
      flutter = 0.08;
    } else if (aSelector < uPhaseCutoffs.w) {
      phase = 3.0;
      fallSpeedMps = uFallSpeedsMps.w;
      pointSizeM = uPointSizesM.w;
      color = uLiquidColor;
      flutter = 0.02;
    }

    fallSpeedMps *= mix(0.82, 1.18, aSeed);
    pointSizeM *= mix(0.72, 1.28, fract(aSeed * 7.31));

    vec3 volumeSizeM = uVolumeHalfExtentsM * 2.0;
    vec3 rawPosition = position * volumeSizeM;
    rawPosition += uWindVelocityMps * uSimulationTime;
    rawPosition.y -= fallSpeedMps * uSimulationTime;
    rawPosition.x += sin(uSimulationTime * 1.17 + aSeed * 31.0)
      * flutter * mix(0.18, 0.72, aSeed);
    rawPosition.z += cos(uSimulationTime * 0.91 + aSeed * 23.0)
      * flutter * mix(0.16, 0.64, fract(aSeed * 3.7));

    // The seed lattice remains world-anchored while mod() wraps it into a camera-local volume.
    // Camera motion therefore exposes new particles without any JavaScript position rewrite.
    vec3 localPosition = mod(
      rawPosition - uCameraPosition + uVolumeHalfExtentsM,
      volumeSizeM
    ) - uVolumeHalfExtentsM;
    vec3 worldPosition = uCameraPosition + localPosition;
    vec4 viewPosition = viewMatrix * vec4(worldPosition, 1.0);

    vPhase = phase;
    vSeed = aSeed;
    vViewDistanceM = length(viewPosition.xyz);
    vColor = color * mix(0.88, 1.08, fract(aSeed * 11.9));

    gl_Position = projectionMatrix * viewPosition;
    float projectedPixels = pointSizeM
      * projectionMatrix[1][1]
      * 0.5
      * uViewportHeight
      * uPixelRatio
      / max(0.75, -viewPosition.z);
    float maximumPixels = phase == 3.0 ? 20.0 : 15.0;
    gl_PointSize = clamp(projectedPixels, 1.0, maximumPixels);
    #include <logdepthbuf_vertex>
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uOpacity;
  uniform float uVisibilityM;

  varying float vPhase;
  varying float vSeed;
  varying float vViewDistanceM;
  varying vec3 vColor;

  #include <logdepthbuf_pars_fragment>

  float snowflake(vec2 point) {
    float radius = length(point);
    vec2 diagonal = vec2(
      (point.x + point.y) * 0.70710678,
      (point.x - point.y) * 0.70710678
    );
    float straightArms = max(
      1.0 - smoothstep(0.07, 0.19, abs(point.x)),
      1.0 - smoothstep(0.07, 0.19, abs(point.y))
    );
    float diagonalArms = max(
      1.0 - smoothstep(0.075, 0.20, abs(diagonal.x)),
      1.0 - smoothstep(0.075, 0.20, abs(diagonal.y))
    );
    float core = 1.0 - smoothstep(0.08, 0.28, radius);
    return max(core, max(straightArms, diagonalArms)
      * (1.0 - smoothstep(0.62, 0.98, radius)));
  }

  float graupel(vec2 point) {
    float angle = atan(point.y, point.x);
    float irregularRadius = length(point)
      * (1.0 + 0.08 * sin(angle * 7.0 + vSeed * 19.0));
    return 1.0 - smoothstep(0.68, 0.98, irregularRadius);
  }

  float icePellet(vec2 point) {
    float diamond = abs(point.x) + abs(point.y);
    float body = 1.0 - smoothstep(0.72, 1.02, diamond);
    float highlight = 1.0 - smoothstep(0.02, 0.22,
      length(point - vec2(-0.24, 0.26)));
    return clamp(body + highlight * 0.24, 0.0, 1.0);
  }

  float liquidStreak(vec2 point) {
    float width = 1.0 - smoothstep(0.07, 0.22, abs(point.x));
    float lengthFade = 1.0 - smoothstep(0.72, 1.0, abs(point.y));
    float head = 1.0 - smoothstep(0.08, 0.30,
      length(point - vec2(0.0, -0.62)));
    return clamp(width * lengthFade * 0.82 + head * 0.44, 0.0, 1.0);
  }

  float freezingDrizzle(vec2 point) {
    vec2 stretched = vec2(point.x * 1.18, point.y * 0.84);
    return 1.0 - smoothstep(0.52, 0.96, length(stretched));
  }

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float shape = freezingDrizzle(point);
    float phaseOpacity = 0.56;
    if (vPhase < 0.5) {
      shape = snowflake(point);
      phaseOpacity = 0.82;
    } else if (vPhase < 1.5) {
      shape = graupel(point);
      phaseOpacity = 0.76;
    } else if (vPhase < 2.5) {
      shape = icePellet(point);
      phaseOpacity = 0.86;
    } else if (vPhase < 3.5) {
      shape = liquidStreak(point);
      phaseOpacity = 0.62;
    }

    float nearFade = smoothstep(1.2, 3.4, vViewDistanceM);
    float farFade = 1.0 - smoothstep(
      max(8.0, uVisibilityM * 0.62),
      max(12.0, uVisibilityM),
      vViewDistanceM
    );
    float alpha = shape * phaseOpacity * uOpacity * nearFade * farFade;
    if (alpha < 0.012) discard;

    gl_FragColor = vec4(vColor, alpha);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function validVectorLike(value) {
  return Number.isFinite(value?.x)
    && Number.isFinite(value?.y)
    && Number.isFinite(value?.z);
}

function phaseIndex(selector, cutoffs) {
  if (selector < cutoffs.snow) return 0;
  if (selector < cutoffs.graupel) return 1;
  if (selector < cutoffs.icePellets) return 2;
  if (selector < cutoffs.liquid) return 3;
  return 4;
}

/**
 * Creates one fixed-capacity THREE.Points batch. Static seed attributes are uploaded once; frame
 * updates touch uniforms only, while the vertex shader performs fall motion and camera wrapping.
 */
export function createWinterPrecipitation(THREE, options = {}) {
  if (!THREE?.BufferGeometry || !THREE?.ShaderMaterial || !THREE?.Points) {
    throw new TypeError("A compatible THREE namespace is required.");
  }

  const qualityTier = tierId(options.qualityTier);
  const capacity = winterPrecipitationCapacityForTier(
    qualityTier,
    options.capacity,
  );
  const positions = new Float32Array(capacity * 3);
  const selectors = new Float32Array(capacity);
  const seeds = new Float32Array(capacity);
  for (let index = 0; index < capacity; index += 1) {
    const offset = index * 3;
    positions[offset] = seededUnit(index, 0) - 0.5;
    positions[offset + 1] = seededUnit(index, 1) - 0.5;
    positions[offset + 2] = seededUnit(index, 2) - 0.5;
    selectors[index] = seededUnit(index, 3);
    seeds[index] = seededUnit(index, 4);
  }

  const geometry = new THREE.BufferGeometry();
  const staticUsage = THREE.StaticDrawUsage ?? 35044;
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(staticUsage),
  );
  geometry.setAttribute(
    "aSelector",
    new THREE.BufferAttribute(selectors, 1).setUsage(staticUsage),
  );
  geometry.setAttribute(
    "aSeed",
    new THREE.BufferAttribute(seeds, 1).setUsage(staticUsage),
  );
  geometry.setDrawRange(0, 0);

  const defaultHalfExtentHorizontalM = qualityTier === "mobile"
    ? 32
    : qualityTier === "desktop"
      ? 48
      : 40;
  const defaultHalfExtentVerticalM = qualityTier === "mobile"
    ? 22
    : qualityTier === "desktop"
      ? 34
      : 28;
  const requestedHalfExtents = options.volumeHalfExtentsM;
  const halfExtentX = positiveOr(
    requestedHalfExtents?.x,
    defaultHalfExtentHorizontalM,
  );
  const halfExtentY = positiveOr(
    requestedHalfExtents?.y,
    defaultHalfExtentVerticalM,
  );
  const halfExtentZ = positiveOr(
    requestedHalfExtents?.z,
    defaultHalfExtentHorizontalM,
  );

  const uniforms = {
    uSimulationTime: { value: 0 },
    uPixelRatio: { value: clamp(positiveOr(options.pixelRatio, 1), 0.5, 2) },
    uViewportHeight: {
      value: clamp(positiveOr(options.viewportHeight, 720), 240, 2_160),
    },
    uCameraPosition: { value: new THREE.Vector3() },
    uVolumeHalfExtentsM: {
      value: new THREE.Vector3(halfExtentX, halfExtentY, halfExtentZ),
    },
    uWindVelocityMps: { value: new THREE.Vector3() },
    uPhaseCutoffs: { value: new THREE.Vector4() },
    uFallSpeedsMps: { value: new THREE.Vector4(1.15, 3.8, 7.2, 13.5) },
    uFreezingDrizzleFallSpeedMps: { value: 2.2 },
    uPointSizesM: { value: new THREE.Vector4(0.17, 0.09, 0.055, 0.28) },
    uFreezingDrizzlePointSizeM: { value: 0.045 },
    uSnowColor: { value: new THREE.Color(options.snowColor ?? 0xf3f5ed) },
    uGraupelColor: { value: new THREE.Color(options.graupelColor ?? 0xdde9ef) },
    uIcePelletColor: {
      value: new THREE.Color(options.icePelletColor ?? 0xb9d6e6),
    },
    uLiquidColor: { value: new THREE.Color(options.liquidColor ?? 0x9fbcca) },
    uFreezingDrizzleColor: {
      value: new THREE.Color(options.freezingDrizzleColor ?? 0xc3e7ee),
    },
    uOpacity: { value: 0 },
    uVisibilityM: { value: 1_000 },
  };
  const material = new THREE.ShaderMaterial({
    name: "MAT_WINTER_PRECIPITATION",
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = options.name ?? "WINTER_PRECIPITATION";
  points.visible = false;
  points.frustumCulled = false;
  points.renderOrder = Number.isFinite(options.renderOrder) ? options.renderOrder : 9;
  points.castShadow = false;
  points.receiveShadow = false;
  points.userData.noShadow = true;
  options.parent?.add?.(points);

  let disposed = false;
  let configuration = winterPrecipitationConfigurationFromSnapshot();
  let drawCount = 0;
  let updateCount = 0;
  let configurationCount = 0;
  let snowCount = 0;
  let graupelCount = 0;
  let icePelletCount = 0;
  let liquidCount = 0;
  let freezingDrizzleCount = 0;

  function applyConfiguration(nextConfiguration) {
    if (disposed) return false;
    configuration = nextConfiguration;
    drawCount = configuration.active
      ? clamp(Math.round(capacity * configuration.density01), 1, capacity)
      : 0;
    geometry.setDrawRange(0, drawCount);
    points.visible = drawCount > 0;
    uniforms.uOpacity.value = configuration.opacity01;
    uniforms.uVisibilityM.value = configuration.visibilityM;
    uniforms.uWindVelocityMps.value.set(
      configuration.windVelocityMps.x,
      configuration.windVelocityMps.y,
      configuration.windVelocityMps.z,
    );
    uniforms.uPhaseCutoffs.value.set(
      configuration.phaseCutoffs.snow,
      configuration.phaseCutoffs.graupel,
      configuration.phaseCutoffs.icePellets,
      configuration.phaseCutoffs.liquid,
    );

    snowCount = 0;
    graupelCount = 0;
    icePelletCount = 0;
    liquidCount = 0;
    freezingDrizzleCount = 0;
    for (let index = 0; index < drawCount; index += 1) {
      switch (phaseIndex(selectors[index], configuration.phaseCutoffs)) {
        case 0: snowCount += 1; break;
        case 1: graupelCount += 1; break;
        case 2: icePelletCount += 1; break;
        case 3: liquidCount += 1; break;
        default: freezingDrizzleCount += 1; break;
      }
    }
    configurationCount += 1;
    return configuration;
  }

  function configureFromSnapshot(snapshot) {
    return applyConfiguration(
      winterPrecipitationConfigurationFromSnapshot(snapshot),
    );
  }

  function update(frame) {
    if (disposed) return false;
    const simulationTimeSeconds = frame?.simulationTimeSeconds;
    if (!Number.isFinite(simulationTimeSeconds)) {
      throw new TypeError("simulationTimeSeconds must be finite.");
    }
    const cameraPosition = frame?.cameraPosition ?? frame?.camera?.position;
    if (!validVectorLike(cameraPosition)) {
      throw new TypeError("cameraPosition must contain finite x, y, and z values.");
    }

    uniforms.uSimulationTime.value = simulationTimeSeconds;
    uniforms.uCameraPosition.value.set(
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z,
    );
    if (validVectorLike(frame?.windVelocityMps)) {
      uniforms.uWindVelocityMps.value.set(
        frame.windVelocityMps.x,
        frame.windVelocityMps.y,
        frame.windVelocityMps.z,
      );
    }
    if (Number.isFinite(frame?.visibilityM) && frame.visibilityM > 0) {
      uniforms.uVisibilityM.value = frame.visibilityM;
    }
    if (Number.isFinite(frame?.pixelRatio) && frame.pixelRatio > 0) {
      uniforms.uPixelRatio.value = clamp(frame.pixelRatio, 0.5, 2);
    }
    if (Number.isFinite(frame?.viewportHeight) && frame.viewportHeight > 0) {
      uniforms.uViewportHeight.value = clamp(frame.viewportHeight, 240, 2_160);
    }
    updateCount += 1;
    return points.visible;
  }

  function diagnostics() {
    return Object.freeze({
      disposed,
      active: !disposed && points.visible,
      qualityTier,
      capacity,
      drawCount: disposed ? 0 : drawCount,
      drawCalls: !disposed && points.visible ? 1 : 0,
      totalRateMmWaterEquivalentPerHour:
        configuration.totalRateMmWaterEquivalentPerHour,
      dominantPhase: configuration.dominantPhase,
      phaseCounts: Object.freeze({
        snow: disposed ? 0 : snowCount,
        graupel: disposed ? 0 : graupelCount,
        icePellets: disposed ? 0 : icePelletCount,
        liquid: disposed ? 0 : liquidCount,
        freezingDrizzle: disposed ? 0 : freezingDrizzleCount,
      }),
      positionAttributeVersion: geometry.attributes.position.version,
      selectorAttributeVersion: geometry.attributes.aSelector.version,
      seedAttributeVersion: geometry.attributes.aSeed.version,
      updateCount,
      configurationCount,
      simulationTimeSeconds: uniforms.uSimulationTime.value,
    });
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    points.visible = false;
    drawCount = 0;
    geometry.setDrawRange(0, 0);
    points.removeFromParent();
    geometry.dispose();
    material.dispose();
    return true;
  }

  if (options.snapshot) configureFromSnapshot(options.snapshot);

  return Object.freeze({
    points,
    geometry,
    material,
    uniforms,
    capacity,
    positions,
    selectors,
    seeds,
    configureFromSnapshot,
    update,
    diagnostics,
    dispose,
  });
}
