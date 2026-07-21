const QUALITY = Object.freeze({
  mobile: Object.freeze({
    treeLimit: 180,
    buildingLimit: 18,
    fieldLimit: 18,
    fieldRowLimit: 96,
    roadSegmentLimit: 32,
    railSegmentLimit: 12,
    powerPoleLimit: 10,
    runwaySegmentLimit: 6,
    density: 0.34,
  }),
  balanced: Object.freeze({
    treeLimit: 480,
    buildingLimit: 48,
    fieldLimit: 46,
    fieldRowLimit: 240,
    roadSegmentLimit: 72,
    railSegmentLimit: 28,
    powerPoleLimit: 28,
    runwaySegmentLimit: 10,
    density: 0.68,
  }),
  desktop: Object.freeze({
    treeLimit: 900,
    buildingLimit: 90,
    fieldLimit: 90,
    fieldRowLimit: 480,
    roadSegmentLimit: 128,
    railSegmentLimit: 48,
    powerPoleLimit: 52,
    runwaySegmentLimit: 16,
    density: 1,
  }),
});

export const KOREA_SCENERY_PROFILES = Object.freeze({
  "1950s": Object.freeze({
    id: "1950s",
    period: "1950s",
    seedSalt: 0x1950_0001,
    treeDensityPerKm2: 34,
    buildingDensityPerKm2: 2.2,
    fieldDensityPerKm2: 7.5,
    treeLimitScale: 0.55,
    buildingLimitScale: 0.35,
    fieldLimitScale: 1,
    settlementClusters: 3,
    maximumTreeSlope: 0.78,
    maximumBuildingSlope: 0.16,
    maximumFieldSlope: 0.085,
    maximumRoadSlope: 0.24,
    maximumRoadGrade: 0.16,
    maximumRailSlope: 0.16,
    maximumRailGrade: 0.08,
    maximumSettlementHeightM: 760,
    maximumFieldHeightM: 560,
    treeHeightM: [5.5, 13],
    buildingWidthM: [4.5, 10],
    buildingDepthM: [4, 8],
    buildingHeightM: [2.7, 5.8],
    fieldWidthM: [38, 105],
    fieldDepthM: [52, 155],
    fieldRowSpacingM: 6.5,
    fieldRowWidthM: 1.4,
    roadWidthM: [3.4, 5.2],
    roadSegmentM: 125,
    roadRowChance: 0.21,
    roadColumnChance: 0.15,
    railSegmentM: 165,
    railRowChance: 0.10,
    railColumnChance: 0.07,
    powerRowChance: 0.10,
    powerColumnChance: 0.08,
    powerPoleSpacingM: 110,
    powerPoleHeightM: [9, 13],
    airfieldChance: 0.004,
    runwayLengthM: [820, 1_450],
    runwayWidthM: [24, 34],
    highRiseChance: 0,
    crownColor: 0x334a25,
    trunkColor: 0x463722,
    buildingColor: 0x8a806b,
    roofColor: 0x4b4033,
    fieldColor: 0x62683c,
    fieldRowColor: 0x3f482a,
    roadColor: 0x625b4c,
    roadMarkingColor: null,
    railBedColor: 0x514c42,
    railColor: 0x3a3936,
    runwayColor: 0x6b6555,
    powerPoleColor: 0x55432f,
    powerWireColor: 0x353432,
  }),
  modern: Object.freeze({
    id: "modern",
    period: "2030s",
    seedSalt: 0x2030_0001,
    treeDensityPerKm2: 58,
    buildingDensityPerKm2: 7.5,
    fieldDensityPerKm2: 4.2,
    treeLimitScale: 1,
    buildingLimitScale: 1,
    fieldLimitScale: 0.82,
    settlementClusters: 6,
    maximumTreeSlope: 0.92,
    maximumBuildingSlope: 0.12,
    maximumFieldSlope: 0.075,
    maximumRoadSlope: 0.28,
    maximumRoadGrade: 0.20,
    maximumRailSlope: 0.15,
    maximumRailGrade: 0.065,
    maximumSettlementHeightM: 620,
    maximumFieldHeightM: 480,
    treeHeightM: [6, 16],
    buildingWidthM: [6, 18],
    buildingDepthM: [5, 14],
    buildingHeightM: [3.2, 12],
    fieldWidthM: [72, 190],
    fieldDepthM: [95, 280],
    fieldRowSpacingM: 10,
    fieldRowWidthM: 2.2,
    roadWidthM: [5.8, 11],
    roadSegmentM: 115,
    roadRowChance: 0.38,
    roadColumnChance: 0.30,
    railSegmentM: 150,
    railRowChance: 0.16,
    railColumnChance: 0.12,
    powerRowChance: 0.34,
    powerColumnChance: 0.28,
    powerPoleSpacingM: 210,
    powerPoleHeightM: [18, 31],
    airfieldChance: 0.007,
    runwayLengthM: [1_450, 2_900],
    runwayWidthM: [38, 56],
    highRiseChance: 0.075,
    crownColor: 0x2d512b,
    trunkColor: 0x403527,
    buildingColor: 0xa9aaa3,
    roofColor: 0x515962,
    fieldColor: 0x536b3d,
    fieldRowColor: 0x364a2c,
    roadColor: 0x373a3c,
    roadMarkingColor: 0xd2cfad,
    railBedColor: 0x494b4b,
    railColor: 0x777b7d,
    runwayColor: 0x303337,
    powerPoleColor: 0x686d70,
    powerWireColor: 0x333638,
  }),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hashUnit(value) {
  return hashString(value) / 4294967296;
}

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function between(random, range) {
  return range[0] + (range[1] - range[0]) * random();
}

function surfaceSample(decoded, east01, north01, spanEastM, spanNorthM) {
  const sampleCount = decoded.sampleCount;
  const east = clamp(Math.round(east01 * (sampleCount - 1)), 0, sampleCount - 1);
  const north = clamp(Math.round(north01 * (sampleCount - 1)), 0, sampleCount - 1);
  const index = north * sampleCount + east;
  if (decoded.water[index]) return null;
  const west = Math.max(0, east - 1);
  const eastNeighbour = Math.min(sampleCount - 1, east + 1);
  const south = Math.max(0, north - 1);
  const northNeighbour = Math.min(sampleCount - 1, north + 1);
  const spacingEastM = spanEastM / (sampleCount - 1);
  const spacingNorthM = spanNorthM / (sampleCount - 1);
  const slopeEast = Math.abs(
    decoded.heights[north * sampleCount + eastNeighbour]
      - decoded.heights[north * sampleCount + west],
  ) / Math.max(spacingEastM, (eastNeighbour - west) * spacingEastM);
  const slopeNorth = Math.abs(
    decoded.heights[northNeighbour * sampleCount + east]
      - decoded.heights[south * sampleCount + east],
  ) / Math.max(spacingNorthM, (northNeighbour - south) * spacingNorthM);
  return {
    x: (east01 - 0.5) * spanEastM,
    y: decoded.heights[index],
    z: -(north01 - 0.5) * spanNorthM,
    slope: Math.hypot(slopeEast, slopeNorth),
  };
}

function candidateCount(densityPerKm2, areaKm2, landFraction, limit, qualityDensity) {
  return Math.min(limit,
    Math.max(0, Math.round(densityPerKm2 * areaKm2 * landFraction * qualityDensity)));
}

function chunkGridPosition(chunk) {
  const match = /^e(\d+)-n(\d+)$/.exec(chunk.id);
  return {
    eastIndex: Math.trunc(finite(chunk.eastIndex, match ? Number(match[1]) : 0)),
    northIndex: Math.trunc(finite(chunk.northIndex, match ? Number(match[2]) : 0)),
  };
}

function rectangleSurface(decoded, east01, north01, widthM, depthM, yaw,
  spanEastM, spanNorthM, maximumSlope) {
  const sine = Math.sin(yaw);
  const cosine = Math.cos(yaw);
  const samples = [];
  for (const localEast of [-widthM * 0.5, widthM * 0.5]) {
    for (const localDepth of [-depthM * 0.5, depthM * 0.5]) {
      const worldEast = cosine * localEast + sine * localDepth;
      const worldNorth = sine * localEast - cosine * localDepth;
      const sampleEast01 = east01 + worldEast / spanEastM;
      const sampleNorth01 = north01 + worldNorth / spanNorthM;
      if (sampleEast01 < 0 || sampleEast01 > 1 || sampleNorth01 < 0 || sampleNorth01 > 1) {
        return null;
      }
      const sample = surfaceSample(
        decoded,
        sampleEast01,
        sampleNorth01,
        spanEastM,
        spanNorthM,
      );
      if (!sample || sample.slope > maximumSlope) return null;
      samples.push(sample);
    }
  }
  const centre = surfaceSample(decoded, east01, north01, spanEastM, spanNorthM);
  if (!centre || centre.slope > maximumSlope) return null;
  const heights = [...samples.map((sample) => sample.y), centre.y];
  if (Math.max(...heights) - Math.min(...heights)
    > Math.max(widthM, depthM) * maximumSlope) return null;
  return { ...centre, y: heights.reduce((sum, value) => sum + value, 0) / heights.length };
}

function routePoint(east01, north01) {
  return Object.freeze({ east01, north01 });
}

function routeOffset(profile, feature, axis, index) {
  return 0.13 + hashUnit(`${profile.id}:${feature}:${axis}:offset:${index}`) * 0.74;
}

function axisRoutes(chunk, profile, feature, rowChance, columnChance) {
  const { eastIndex, northIndex } = chunkGridPosition(chunk);
  const routes = [];
  if (hashUnit(`${profile.id}:${feature}:row:${northIndex}`) < rowChance) {
    const north01 = routeOffset(profile, feature, "row", northIndex);
    routes.push(Object.freeze({
      key: `${profile.id}:${feature}:row:${northIndex}`,
      start: routePoint(0.005, north01),
      end: routePoint(0.995, north01),
    }));
  }
  if (hashUnit(`${profile.id}:${feature}:column:${eastIndex}`) < columnChance) {
    const east01 = routeOffset(profile, feature, "column", eastIndex);
    routes.push(Object.freeze({
      key: `${profile.id}:${feature}:column:${eastIndex}`,
      start: routePoint(east01, 0.005),
      end: routePoint(east01, 0.995),
    }));
  }
  return routes;
}

function traceRoute(decoded, route, spanEastM, spanNorthM, options) {
  const deltaEastM = (route.end.east01 - route.start.east01) * spanEastM;
  const deltaNorthM = (route.end.north01 - route.start.north01) * spanNorthM;
  const horizontalLengthM = Math.hypot(deltaEastM, deltaNorthM);
  const stepCount = Math.max(1, Math.min(
    options.maximumSegments,
    Math.ceil(horizontalLengthM / options.preferredSegmentM),
  ));
  const points = [];
  for (let index = 0; index <= stepCount; index++) {
    const fraction = index / stepCount;
    const surface = surfaceSample(
      decoded,
      route.start.east01 + (route.end.east01 - route.start.east01) * fraction,
      route.start.north01 + (route.end.north01 - route.start.north01) * fraction,
      spanEastM,
      spanNorthM,
    );
    points.push(surface && surface.slope <= options.maximumSlope ? surface : null);
  }
  const segments = [];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) continue;
    const runM = Math.hypot(end.x - start.x, end.z - start.z);
    if (!runM || Math.abs(end.y - start.y) / runM > options.maximumGrade) continue;
    segments.push(Object.freeze({
      fromX: start.x,
      fromY: start.y,
      fromZ: start.z,
      toX: end.x,
      toY: end.y,
      toZ: end.z,
      widthM: options.widthM,
    }));
  }
  return Object.freeze({ points: Object.freeze(points), segments: Object.freeze(segments) });
}

function appendRoutes(target, routes, limit, decoded, spanEastM, spanNorthM, options) {
  for (let routeIndex = 0; routeIndex < routes.length && target.length < limit; routeIndex++) {
    const remainingRoutes = routes.length - routeIndex;
    const maximumSegments = Math.max(1, Math.floor((limit - target.length) / remainingRoutes));
    const widthM = typeof options.widthM === "function"
      ? options.widthM(routes[routeIndex], routeIndex)
      : options.widthM;
    const traced = traceRoute(decoded, routes[routeIndex], spanEastM, spanNorthM, {
      ...options,
      maximumSegments,
      widthM,
    });
    target.push(...traced.segments.slice(0, limit - target.length));
  }
}

function fieldRowSegments(fields, profile, limit) {
  const rows = [];
  for (let fieldIndex = 0; fieldIndex < fields.length && rows.length < limit; fieldIndex++) {
    const field = fields[fieldIndex];
    const desired = Math.max(1, Math.floor(field.widthM / profile.fieldRowSpacingM) - 1);
    const remainingFields = fields.length - fieldIndex;
    const count = Math.min(desired, Math.max(1, Math.floor((limit - rows.length) / remainingFields)));
    const sine = Math.sin(field.yaw);
    const cosine = Math.cos(field.yaw);
    for (let index = 0; index < count && rows.length < limit; index++) {
      const localEast = -field.widthM * 0.5 + field.widthM * (index + 1) / (count + 1);
      const startDepth = -field.depthM * 0.48;
      const endDepth = field.depthM * 0.48;
      rows.push(Object.freeze({
        fromX: field.x + cosine * localEast + sine * startDepth,
        fromY: field.y,
        fromZ: field.z - sine * localEast + cosine * startDepth,
        toX: field.x + cosine * localEast + sine * endDepth,
        toY: field.y,
        toZ: field.z - sine * localEast + cosine * endDepth,
        widthM: profile.fieldRowWidthM,
      }));
    }
  }
  return rows;
}

export function planKoreaScenery(chunk, decoded, options = {}) {
  const profile = KOREA_SCENERY_PROFILES[options.era ?? "1950s"];
  if (!profile) throw new TypeError(`Unknown Korea scenery era: ${options.era}.`);
  const quality = QUALITY[options.qualityTier] ?? QUALITY.balanced;
  const [minimumEast, minimumNorth, maximumEast, maximumNorth] = chunk.boundsLocalM;
  const spanEastM = maximumEast - minimumEast;
  const spanNorthM = maximumNorth - minimumNorth;
  const areaKm2 = spanEastM * spanNorthM / 1_000_000;
  const declaredLandFraction = finite(chunk.generation?.landFraction, NaN);
  const landFraction = Number.isFinite(declaredLandFraction)
    ? clamp(declaredLandFraction, 0, 1)
    : 1 - decoded.water.reduce((sum, value) => sum + value, 0) / decoded.water.length;
  const seed = (Number(chunk.generation?.seed) || hashString(chunk.id)) ^ profile.seedSalt;
  const random = randomGenerator(seed);
  const trees = [];
  const buildings = [];
  const fields = [];
  const roads = [];
  const railSegments = [];
  const runways = [];
  const powerPoles = [];
  const powerLines = [];
  const treeTarget = candidateCount(profile.treeDensityPerKm2, areaKm2, landFraction,
    Math.round(quality.treeLimit * profile.treeLimitScale), quality.density);
  const buildingTarget = candidateCount(profile.buildingDensityPerKm2, areaKm2, landFraction,
    Math.round(quality.buildingLimit * profile.buildingLimitScale), quality.density);
  const fieldTarget = candidateCount(profile.fieldDensityPerKm2, areaKm2, landFraction,
    Math.round(quality.fieldLimit * profile.fieldLimitScale), quality.density);

  let attempts = 0;
  while (trees.length < treeTarget && attempts++ < treeTarget * 8 + 32) {
    const east01 = random();
    const north01 = random();
    const surface = surfaceSample(decoded, east01, north01, spanEastM, spanNorthM);
    if (!surface || surface.slope > profile.maximumTreeSlope) continue;
    trees.push(Object.freeze({
      ...surface,
      yaw: random() * Math.PI * 2,
      heightM: between(random, profile.treeHeightM),
      widthScale: 0.72 + random() * 0.62,
    }));
  }

  const centres = [];
  attempts = 0;
  while (centres.length < profile.settlementClusters && attempts++ < 80) {
    const east01 = 0.08 + random() * 0.84;
    const north01 = 0.08 + random() * 0.84;
    const surface = surfaceSample(decoded, east01, north01, spanEastM, spanNorthM);
    if (!surface || surface.slope > profile.maximumBuildingSlope
      || surface.y > profile.maximumSettlementHeightM) continue;
    centres.push({ east01, north01 });
  }
  attempts = 0;
  while (buildings.length < buildingTarget && centres.length
    && attempts++ < buildingTarget * 14 + 64) {
    const centre = centres[Math.floor(random() * centres.length)];
    const spread = profile.id === "modern" ? 0.065 : 0.038;
    const east01 = clamp(centre.east01 + (random() + random() - 1) * spread, 0.01, 0.99);
    const north01 = clamp(centre.north01 + (random() + random() - 1) * spread, 0.01, 0.99);
    const surface = surfaceSample(decoded, east01, north01, spanEastM, spanNorthM);
    if (!surface || surface.slope > profile.maximumBuildingSlope
      || surface.y > profile.maximumSettlementHeightM) continue;
    const highRise = random() < profile.highRiseChance;
    buildings.push(Object.freeze({
      ...surface,
      yaw: random() * Math.PI * 2,
      widthM: between(random, profile.buildingWidthM) * (highRise ? 1.25 : 1),
      depthM: between(random, profile.buildingDepthM) * (highRise ? 1.25 : 1),
      heightM: highRise ? 24 + random() * 68 : between(random, profile.buildingHeightM),
      highRise,
    }));
  }

  attempts = 0;
  while (fields.length < fieldTarget && attempts++ < fieldTarget * 14 + 48) {
    const east01 = 0.025 + random() * 0.95;
    const north01 = 0.025 + random() * 0.95;
    const yaw = random() * Math.PI;
    const widthM = between(random, profile.fieldWidthM);
    const depthM = between(random, profile.fieldDepthM);
    const surface = rectangleSurface(
      decoded, east01, north01, widthM, depthM, yaw,
      spanEastM, spanNorthM, profile.maximumFieldSlope,
    );
    if (!surface || surface.y > profile.maximumFieldHeightM) continue;
    fields.push(Object.freeze({ ...surface, yaw, widthM, depthM }));
  }

  const roadRoutes = axisRoutes(
    chunk, profile, "road", profile.roadRowChance, profile.roadColumnChance,
  );
  for (let index = 1; index < centres.length; index++) {
    roadRoutes.push(Object.freeze({
      start: routePoint(centres[index - 1].east01, centres[index - 1].north01),
      end: routePoint(centres[index].east01, centres[index].north01),
    }));
  }
  appendRoutes(
    roads, roadRoutes, quality.roadSegmentLimit, decoded, spanEastM, spanNorthM,
    {
      preferredSegmentM: profile.roadSegmentM,
      maximumSlope: profile.maximumRoadSlope,
      maximumGrade: profile.maximumRoadGrade,
      widthM: (route) => route.key
        ? profile.roadWidthM[0] + (profile.roadWidthM[1] - profile.roadWidthM[0])
          * hashUnit(`${route.key}:width`)
        : between(random, profile.roadWidthM),
    },
  );

  const railRoutes = axisRoutes(
    chunk, profile, "rail", profile.railRowChance, profile.railColumnChance,
  );
  appendRoutes(
    railSegments, railRoutes, quality.railSegmentLimit, decoded, spanEastM, spanNorthM,
    {
      preferredSegmentM: profile.railSegmentM,
      maximumSlope: profile.maximumRailSlope,
      maximumGrade: profile.maximumRailGrade,
      widthM: 3.8,
    },
  );

  let airfieldCount = 0;
  if (hashUnit(`${profile.id}:airfield:${chunk.id}`) < profile.airfieldChance) {
    attempts = 0;
    while (!airfieldCount && attempts++ < 18) {
      const east01 = 0.18 + random() * 0.64;
      const north01 = 0.18 + random() * 0.64;
      const yaw = random() * Math.PI;
      const lengthM = between(random, profile.runwayLengthM);
      const widthM = between(random, profile.runwayWidthM);
      const surface = rectangleSurface(
        decoded, east01, north01, widthM, lengthM, yaw,
        spanEastM, spanNorthM, 0.035,
      );
      if (!surface || surface.y > 420) continue;
      const sine = Math.sin(yaw);
      const cosine = Math.cos(yaw);
      const halfLengthM = lengthM * 0.5;
      const route = Object.freeze({
        start: routePoint(
          east01 - sine * halfLengthM / spanEastM,
          north01 + cosine * halfLengthM / spanNorthM,
        ),
        end: routePoint(
          east01 + sine * halfLengthM / spanEastM,
          north01 - cosine * halfLengthM / spanNorthM,
        ),
      });
      const traced = traceRoute(decoded, route, spanEastM, spanNorthM, {
        maximumSegments: quality.runwaySegmentLimit,
        preferredSegmentM: 240,
        maximumSlope: 0.05,
        maximumGrade: 0.025,
        widthM,
      });
      if (!traced.segments.length) continue;
      runways.push(...traced.segments);
      airfieldCount = 1;
    }
  }

  const powerRoutes = axisRoutes(
    chunk, profile, "power", profile.powerRowChance, profile.powerColumnChance,
  );
  for (let routeIndex = 0; routeIndex < powerRoutes.length
    && powerPoles.length < quality.powerPoleLimit; routeIndex++) {
    const remainingRoutes = powerRoutes.length - routeIndex;
    const maximumPoles = Math.max(
      2,
      Math.floor((quality.powerPoleLimit - powerPoles.length) / remainingRoutes),
    );
    const route = powerRoutes[routeIndex];
    const poleHeightM = route.key
      ? profile.powerPoleHeightM[0]
        + (profile.powerPoleHeightM[1] - profile.powerPoleHeightM[0])
          * hashUnit(`${route.key}:height`)
      : between(random, profile.powerPoleHeightM);
    const traced = traceRoute(decoded, route, spanEastM, spanNorthM, {
      maximumSegments: maximumPoles - 1,
      preferredSegmentM: profile.powerPoleSpacingM,
      maximumSlope: 0.85,
      maximumGrade: 0.55,
      widthM: 0.12,
    });
    let prior = null;
    for (const point of traced.points) {
      if (!point) {
        prior = null;
        continue;
      }
      if (powerPoles.length >= quality.powerPoleLimit) break;
      powerPoles.push(Object.freeze({ ...point, heightM: poleHeightM }));
      if (prior) {
        powerLines.push(Object.freeze({
          fromX: prior.x,
          fromY: prior.y + poleHeightM * 0.92,
          fromZ: prior.z,
          toX: point.x,
          toY: point.y + poleHeightM * 0.92,
          toZ: point.z,
          widthM: profile.id === "modern" ? 0.12 : 0.085,
        }));
      }
      prior = point;
    }
  }

  const fieldRows = fieldRowSegments(fields, profile, quality.fieldRowLimit);

  return Object.freeze({
    era: profile.id,
    period: profile.period,
    seed: seed >>> 0,
    trees: Object.freeze(trees),
    buildings: Object.freeze(buildings),
    fields: Object.freeze(fields),
    fieldRows: Object.freeze(fieldRows),
    roads: Object.freeze(roads),
    railSegments: Object.freeze(railSegments),
    runways: Object.freeze(runways),
    airfieldCount,
    powerPoles: Object.freeze(powerPoles),
    powerLines: Object.freeze(powerLines),
  });
}

function setMatrix(THREE, mesh, index, position, quaternion, scale, matrix) {
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
}

function setSegmentMatrix(mesh, index, segment, widthM, heightM, yOffsetM, work) {
  work.start.set(segment.fromX, segment.fromY, segment.fromZ);
  work.end.set(segment.toX, segment.toY, segment.toZ);
  work.direction.subVectors(work.end, work.start);
  const lengthM = work.direction.length();
  if (!lengthM) return;
  work.position.addVectors(work.start, work.end).multiplyScalar(0.5);
  work.position.y += yOffsetM;
  work.quaternion.setFromUnitVectors(work.segmentAxis, work.direction.normalize());
  work.scale.set(widthM, heightM, lengthM);
  work.matrix.compose(work.position, work.quaternion, work.scale);
  mesh.setMatrixAt(index, work.matrix);
}

function addSegmentMesh(THREE, group, geometry, material, name, segments, options, work) {
  if (!segments.length) return null;
  const multiplier = options.multiplier ?? 1;
  const mesh = new THREE.InstancedMesh(geometry, material, segments.length * multiplier);
  mesh.name = name;
  let outputIndex = 0;
  for (const segment of segments) {
    if (options.pairedOffsetM) {
      const deltaX = segment.toX - segment.fromX;
      const deltaZ = segment.toZ - segment.fromZ;
      const horizontalLengthM = Math.max(0.001, Math.hypot(deltaX, deltaZ));
      const offsetX = -deltaZ / horizontalLengthM * options.pairedOffsetM;
      const offsetZ = deltaX / horizontalLengthM * options.pairedOffsetM;
      for (const side of [-1, 1]) {
        setSegmentMatrix(mesh, outputIndex++, {
          ...segment,
          fromX: segment.fromX + offsetX * side,
          fromZ: segment.fromZ + offsetZ * side,
          toX: segment.toX + offsetX * side,
          toZ: segment.toZ + offsetZ * side,
        }, options.widthM ?? segment.widthM, options.heightM, options.yOffsetM, work);
      }
    } else {
      setSegmentMatrix(
        mesh, outputIndex++, segment, options.widthM ?? segment.widthM,
        options.heightM, options.yOffsetM, work,
      );
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return mesh;
}

export function disposeKoreaSceneryTile(group) {
  if (!group) return;
  group.traverse((child) => {
    if (child.isInstancedMesh) child.dispose();
  });
  group.removeFromParent();
}

export function createKoreaSceneryRuntime(THREE, options = {}) {
  const era = options.era ?? "1950s";
  const profile = KOREA_SCENERY_PROFILES[era];
  if (!profile) throw new TypeError(`Unknown Korea scenery era: ${era}.`);
  const qualityTier = options.qualityTier ?? "balanced";
  const crownGeometry = new THREE.ConeGeometry(1, 1, 7, 1);
  crownGeometry.translate(0, 0.5, 0);
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.18, 1, 5, 1);
  trunkGeometry.translate(0, 0.5, 0);
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  buildingGeometry.translate(0, 0.5, 0);
  const surfaceGeometry = new THREE.BoxGeometry(1, 1, 1);
  const segmentGeometry = new THREE.BoxGeometry(1, 1, 1);
  const poleGeometry = new THREE.CylinderGeometry(0.08, 0.13, 1, 6, 1);
  poleGeometry.translate(0, 0.5, 0);
  const crownMaterial = new THREE.MeshLambertMaterial({ color: profile.crownColor });
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: profile.trunkColor });
  const buildingMaterial = new THREE.MeshLambertMaterial({ color: profile.buildingColor });
  const fieldMaterial = new THREE.MeshLambertMaterial({ color: profile.fieldColor });
  const fieldRowMaterial = new THREE.MeshLambertMaterial({ color: profile.fieldRowColor });
  const roadMaterial = new THREE.MeshLambertMaterial({ color: profile.roadColor });
  const roadMarkingMaterial = profile.roadMarkingColor === null ? null
    : new THREE.MeshBasicMaterial({ color: profile.roadMarkingColor });
  const railBedMaterial = new THREE.MeshLambertMaterial({ color: profile.railBedColor });
  const railMaterial = new THREE.MeshLambertMaterial({ color: profile.railColor });
  const runwayMaterial = new THREE.MeshLambertMaterial({ color: profile.runwayColor });
  const powerPoleMaterial = new THREE.MeshLambertMaterial({ color: profile.powerPoleColor });
  const powerWireMaterial = new THREE.MeshBasicMaterial({ color: profile.powerWireColor });
  const geometries = [
    crownGeometry, trunkGeometry, buildingGeometry, surfaceGeometry, segmentGeometry, poleGeometry,
  ];
  const materials = [
    crownMaterial, trunkMaterial, buildingMaterial, fieldMaterial, fieldRowMaterial, roadMaterial,
    roadMarkingMaterial, railBedMaterial, railMaterial, runwayMaterial, powerPoleMaterial,
    powerWireMaterial,
  ].filter(Boolean);
  let disposed = false;

  return Object.freeze({
    era,
    disposeTile: disposeKoreaSceneryTile,
    createTile(chunk, decoded, level = 0) {
      if (disposed || level !== 0) return null;
      const plan = planKoreaScenery(chunk, decoded, { era, qualityTier });
      if (!plan.trees.length && !plan.buildings.length && !plan.fields.length
        && !plan.roads.length && !plan.railSegments.length && !plan.runways.length
        && !plan.powerPoles.length) return null;
      const group = new THREE.Group();
      group.name = `SCENERY_${era.toUpperCase()}_${chunk.id.toUpperCase()}`;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const segmentWork = {
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        position,
        quaternion,
        scale,
        matrix,
        segmentAxis: new THREE.Vector3(0, 0, 1),
      };
      if (plan.trees.length) {
        const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, plan.trees.length);
        const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, plan.trees.length);
        crowns.name = "PROCEDURAL_TREE_CROWNS";
        trunks.name = "PROCEDURAL_TREE_TRUNKS";
        for (let index = 0; index < plan.trees.length; index++) {
          const tree = plan.trees[index];
          quaternion.setFromAxisAngle(yAxis, tree.yaw);
          position.set(tree.x, tree.y, tree.z);
          scale.set(tree.heightM * 0.32 * tree.widthScale, tree.heightM, tree.heightM * 0.32);
          setMatrix(THREE, crowns, index, position, quaternion, scale, matrix);
          scale.set(tree.heightM * 0.055, tree.heightM * 0.48, tree.heightM * 0.055);
          setMatrix(THREE, trunks, index, position, quaternion, scale, matrix);
        }
        crowns.instanceMatrix.needsUpdate = true;
        trunks.instanceMatrix.needsUpdate = true;
        group.add(crowns, trunks);
      }
      if (plan.buildings.length) {
        const buildings = new THREE.InstancedMesh(
          buildingGeometry, buildingMaterial, plan.buildings.length,
        );
        buildings.name = `PROCEDURAL_${era.toUpperCase()}_BUILDINGS`;
        for (let index = 0; index < plan.buildings.length; index++) {
          const building = plan.buildings[index];
          quaternion.setFromAxisAngle(yAxis, building.yaw);
          position.set(building.x, building.y, building.z);
          scale.set(building.widthM, building.heightM, building.depthM);
          setMatrix(THREE, buildings, index, position, quaternion, scale, matrix);
        }
        buildings.instanceMatrix.needsUpdate = true;
        group.add(buildings);
      }
      if (plan.fields.length) {
        const fields = new THREE.InstancedMesh(surfaceGeometry, fieldMaterial, plan.fields.length);
        fields.name = `PROCEDURAL_${era.toUpperCase()}_LAND_USE`;
        for (let index = 0; index < plan.fields.length; index++) {
          const field = plan.fields[index];
          quaternion.setFromAxisAngle(yAxis, field.yaw);
          position.set(field.x, field.y + 0.035, field.z);
          scale.set(field.widthM, 0.07, field.depthM);
          setMatrix(THREE, fields, index, position, quaternion, scale, matrix);
        }
        fields.instanceMatrix.needsUpdate = true;
        group.add(fields);
      }
      addSegmentMesh(
        THREE, group, segmentGeometry, fieldRowMaterial, "PROCEDURAL_FIELD_ROWS",
        plan.fieldRows, { heightM: 0.025, yOffsetM: 0.09 }, segmentWork,
      );
      addSegmentMesh(
        THREE, group, segmentGeometry, roadMaterial, `PROCEDURAL_${era.toUpperCase()}_ROADS`,
        plan.roads, { heightM: 0.12, yOffsetM: 0.085 }, segmentWork,
      );
      if (roadMarkingMaterial) {
        addSegmentMesh(
          THREE, group, segmentGeometry, roadMarkingMaterial, "PROCEDURAL_ROAD_MARKINGS",
          plan.roads, { widthM: 0.16, heightM: 0.025, yOffsetM: 0.165 }, segmentWork,
        );
      }
      addSegmentMesh(
        THREE, group, segmentGeometry, railBedMaterial, "PROCEDURAL_RAIL_BEDS",
        plan.railSegments, { widthM: 4.2, heightM: 0.18, yOffsetM: 0.1 }, segmentWork,
      );
      addSegmentMesh(
        THREE, group, segmentGeometry, railMaterial, "PROCEDURAL_RAILS",
        plan.railSegments,
        {
          multiplier: 2,
          pairedOffsetM: 0.72,
          widthM: 0.11,
          heightM: 0.13,
          yOffsetM: 0.245,
        },
        segmentWork,
      );
      addSegmentMesh(
        THREE, group, segmentGeometry, runwayMaterial, `PROCEDURAL_${era.toUpperCase()}_RUNWAYS`,
        plan.runways, { heightM: 0.11, yOffsetM: 0.08 }, segmentWork,
      );
      if (plan.powerPoles.length) {
        const poles = new THREE.InstancedMesh(
          poleGeometry, powerPoleMaterial, plan.powerPoles.length,
        );
        poles.name = `PROCEDURAL_${era.toUpperCase()}_POWER_POLES`;
        for (let index = 0; index < plan.powerPoles.length; index++) {
          const pole = plan.powerPoles[index];
          quaternion.identity();
          position.set(pole.x, pole.y, pole.z);
          const baseWidthM = era === "modern" ? 0.34 : 0.24;
          scale.set(baseWidthM, pole.heightM, baseWidthM);
          setMatrix(THREE, poles, index, position, quaternion, scale, matrix);
        }
        poles.instanceMatrix.needsUpdate = true;
        group.add(poles);
      }
      addSegmentMesh(
        THREE, group, segmentGeometry, powerWireMaterial, "PROCEDURAL_POWER_LINES",
        plan.powerLines, { heightM: 0.08, yOffsetM: 0 }, segmentWork,
      );
      group.userData.scenery = Object.freeze({
        era,
        period: profile.period,
        seed: plan.seed,
        trees: plan.trees.length,
        buildings: plan.buildings.length,
        fields: plan.fields.length,
        fieldRows: plan.fieldRows.length,
        roadSegments: plan.roads.length,
        railSegments: plan.railSegments.length,
        airfields: plan.airfieldCount,
        runwaySegments: plan.runways.length,
        powerPoles: plan.powerPoles.length,
        powerLines: plan.powerLines.length,
      });
      return group;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  });
}
