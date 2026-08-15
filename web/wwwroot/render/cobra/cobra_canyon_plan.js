/**
 * Pure content validation and deterministic planning for the fictional Cobra Canyon world.
 *
 * This module intentionally has no DOM or Three.js dependency. The render runtime, a worker, and
 * standalone labs can all consume the same frozen plan. Collision-sized hazards are copied from
 * authored authority records; this planner never invents physical scenery procedurally.
 */

export const COBRA_CANYON_WORLD_URL =
  "/content/packs/cobra-vietnam/environment/cobra-canyon.world.json";

export const COBRA_CANYON_WORLD_SCHEMA = "cobra.canyon.world.v1";
export const COBRA_CANYON_PLAN_SCHEMA = "cobra.canyon.render-plan.v1";
export const COBRA_CANYON_PRESENTATION_KIT_SCHEMA =
  "cobra.canyon.presentation-kit.v1";

const EXPECTED_WORLD_ID = "world.cobra-canyon.v1";
const EXPECTED_ROUTE_IDS = Object.freeze([
  "route.cobra-canyon.river-gorge.v1",
  "route.cobra-canyon.ridge-shadow.v1",
  "route.cobra-canyon.road-plantation.v1",
]);
const QUALITY_TIERS = Object.freeze(["mobile", "balanced", "desktop"]);
const AMBIENT_RENDER_ROLES = Object.freeze([
  "jungle",
  "plantation",
  "village",
  "paddy",
  "rock",
  "mist",
  "water-accent",
]);
const ANCHOR_MODES = Object.freeze(["base", "centre", "top"]);
// Authority-mirrored medium helicopter FOB bench. The level area holds the FATO, revetted ramp,
// POL/ammo separation and maintenance apron; the wider blend feathers cut-and-fill into the
// surveyed upland site without inventing a collision shelf in presentation only.
export const COBRA_CANYON_CAMP_EMBER_APRON = Object.freeze({
  eastM: -3_800,
  northM: -4_600,
  elevationM: 214,
  levelRadiusM: 190,
  blendRadiusM: 300,
  finalHeadingDeg: 300,
  protectedLengthM: 2_400,
  protectedHalfWidthM: 120,
  obstacleSurfaceRisePerM: 1 / 8,
});
const IMPORTANT_COLLECTIONS = Object.freeze([
  ["terrain.ribbons", "terrain-authority"],
  ["routeLanes", "navigation-authority"],
  ["heroCells", "world-cell-authority"],
  ["landmarks", "navigation-authority"],
  ["hazards", "collision-authority"],
  ["visualBands", "streaming-policy-authority"],
]);
const BUDGET_FIELDS = Object.freeze([
  "maxTerrainRibbons",
  "maxCells",
  "maxLandmarks",
  "maxHazards",
  "maxAmbientArchetypes",
  "maxLandmarkArchetypes",
  "maxSetPieceCells",
  "maxAmbientBatches",
  "maxAmbientInstances",
  "maxDrawCalls",
  "maxShadowCasters",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(label, message) {
  throw new TypeError(`${label} ${message}`);
}

function requireRecord(value, label) {
  if (!isRecord(value)) fail(label, "must be an object.");
  return value;
}

function requireArray(value, label, minimumLength = 0) {
  if (!Array.isArray(value)) fail(label, "must be an array.");
  if (value.length < minimumLength) {
    fail(label, `must contain at least ${minimumLength} entries.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(label, "must be a non-empty string.");
  }
  return value;
}

function requireFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(label, "must be finite.");
  return number;
}

function requirePositive(value, label) {
  const number = requireFinite(value, label);
  if (number <= 0) fail(label, "must be greater than zero.");
  return number;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(label, "must be a non-negative integer.");
  }
  return value;
}

function requireBoolean(value, expected, label) {
  if (value !== expected) fail(label, `must be ${expected}.`);
}

function requireTriple(value, label) {
  requireArray(value, label);
  if (value.length !== 3) fail(label, "must contain exactly east/up/north values.");
  return value.map((item, index) => requireFinite(item, `${label}[${index}]`));
}

function cloneJson(value, label = "world", seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(label, "contains a non-finite number.");
    return value;
  }
  if (typeof value !== "object") fail(label, "must contain JSON-compatible values only.");
  if (seen.has(value)) fail(label, "must not contain cycles.");
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((item, index) => cloneJson(item, `${label}[${index}]`, seen));
  } else {
    result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = cloneJson(child, `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
  return result;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function assertUniqueIds(collections) {
  const ids = new Set();
  for (const [label, collection] of collections) {
    collection.forEach((item, index) => {
      const id = requireString(item?.id, `${label}[${index}].id`);
      if (ids.has(id)) fail(`${label}[${index}].id`, `duplicates stable id ${id}.`);
      ids.add(id);
    });
  }
  return ids;
}

function assertAuthority(item, expectedRole, authoritySourceId, label, presentationOnly) {
  const authority = requireRecord(item.authority, `${label}.authority`);
  if (authority.role !== expectedRole) {
    fail(`${label}.authority.role`, `must be ${expectedRole}.`);
  }
  if (authority.sourceId !== authoritySourceId) {
    fail(`${label}.authority.sourceId`, `must be ${authoritySourceId}.`);
  }
  requireBoolean(item.presentationOnly, presentationOnly, `${label}.presentationOnly`);
  requireBoolean(item.targetable, false, `${label}.targetable`);
}

function boundsFromWorld(world) {
  const raw = requireRecord(world.boundsLocalM, "boundsLocalM");
  const bounds = {
    minimumEastM: requireFinite(raw.minimumEastM, "boundsLocalM.minimumEastM"),
    minimumNorthM: requireFinite(raw.minimumNorthM, "boundsLocalM.minimumNorthM"),
    maximumEastM: requireFinite(raw.maximumEastM, "boundsLocalM.maximumEastM"),
    maximumNorthM: requireFinite(raw.maximumNorthM, "boundsLocalM.maximumNorthM"),
  };
  if (bounds.maximumEastM - bounds.minimumEastM !== 16_000
    || bounds.maximumNorthM - bounds.minimumNorthM !== 16_000) {
    fail("boundsLocalM", "must describe an exact 16,000 m by 16,000 m world.");
  }
  return bounds;
}

function assertPointInside(point, bounds, label) {
  const [eastM, , northM] = requireTriple(point, label);
  if (eastM < bounds.minimumEastM || eastM > bounds.maximumEastM
    || northM < bounds.minimumNorthM || northM > bounds.maximumNorthM) {
    fail(label, "must remain inside the world bounds.");
  }
}

function assertPath(path, bounds, label) {
  requireArray(path, label, 2);
  path.forEach((point, index) => assertPointInside(point, bounds, `${label}[${index}]`));
  let lengthM = 0;
  for (let index = 1; index < path.length; index++) {
    const east = path[index][0] - path[index - 1][0];
    const north = path[index][2] - path[index - 1][2];
    lengthM += Math.hypot(east, north);
  }
  if (lengthM < 12_000) fail(label, "must provide at least 12 km of low-level routing.");
  return lengthM;
}

function assertLocalBounds(value, worldBounds, label) {
  requireArray(value, label);
  if (value.length !== 4) fail(label, "must contain minEast/minNorth/maxEast/maxNorth.");
  const [minEast, minNorth, maxEast, maxNorth] = value.map((item, index) =>
    requireFinite(item, `${label}[${index}]`));
  if (minEast >= maxEast || minNorth >= maxNorth) fail(label, "must have positive area.");
  if (minEast < worldBounds.minimumEastM || maxEast > worldBounds.maximumEastM
    || minNorth < worldBounds.minimumNorthM || maxNorth > worldBounds.maximumNorthM) {
    fail(label, "must remain inside the world bounds.");
  }
}

function assertPointInsideLocalBounds(point, localBounds, label) {
  const [eastM, , northM] = requireTriple(point, label);
  if (eastM < localBounds[0] || eastM > localBounds[2]
    || northM < localBounds[1] || northM > localBounds[3]) {
    fail(label, "must remain inside its set-piece bounds.");
  }
}

function assertPalette(value, label) {
  requireArray(value, label, 1);
  const colors = new Set();
  value.forEach((color, index) => {
    if (typeof color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      fail(`${label}[${index}]`, "must be a six-digit #RRGGBB color.");
    }
    if (colors.has(color.toUpperCase())) fail(`${label}[${index}]`, "must be unique.");
    colors.add(color.toUpperCase());
  });
}

function assertScale(value, label) {
  const scale = requireRecord(value, label);
  for (const axis of ["width", "height", "depth"]) {
    requirePositive(scale[axis], `${label}.${axis}`);
  }
}

function assertReferences(values, knownIds, label, minimumLength = 1) {
  requireArray(values, label, minimumLength);
  const localIds = new Set();
  values.forEach((value, index) => {
    const id = requireString(value, `${label}[${index}]`);
    if (!knownIds.has(id)) fail(`${label}[${index}]`, `references unknown id ${id}.`);
    if (localIds.has(id)) fail(`${label}[${index}]`, `duplicates reference ${id}.`);
    localIds.add(id);
  });
}

function assertCollision(collision, bounds, label) {
  requireRecord(collision, label);
  if (collision.shape === "capsuleSegment") {
    assertPointInside(collision.fromLocalM, bounds, `${label}.fromLocalM`);
    assertPointInside(collision.toLocalM, bounds, `${label}.toLocalM`);
    requirePositive(collision.radiusM, `${label}.radiusM`);
    return;
  }
  if (collision.shape === "aabb") {
    const minimum = requireTriple(collision.minimumLocalM, `${label}.minimumLocalM`);
    const maximum = requireTriple(collision.maximumLocalM, `${label}.maximumLocalM`);
    assertPointInside(minimum, bounds, `${label}.minimumLocalM`);
    assertPointInside(maximum, bounds, `${label}.maximumLocalM`);
    for (let axis = 0; axis < 3; axis++) {
      if (minimum[axis] >= maximum[axis]) {
        fail(label, "AABB minimum values must be below maximum values.");
      }
    }
    return;
  }
  fail(`${label}.shape`, "must be capsuleSegment or aabb.");
}

function sortedAmbientBatches(world, qualityTier) {
  const maximum = world.qualityBudgets[qualityTier].maxAmbientBatches;
  return [...world.ambientBatches]
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .slice(0, maximum)
    .filter((batch) => batch.instancesByQuality[qualityTier] > 0);
}

function assertBudgetContract(world) {
  let previous = null;
  for (const tier of QUALITY_TIERS) {
    const budget = requireRecord(world.qualityBudgets[tier], `qualityBudgets.${tier}`);
    for (const field of BUDGET_FIELDS) {
      requireNonNegativeInteger(budget[field], `qualityBudgets.${tier}.${field}`);
      if (previous && budget[field] < previous[field]) {
        fail(`qualityBudgets.${tier}.${field}`, "must not decrease at a higher quality tier.");
      }
    }
    if (budget.maxTerrainRibbons < world.terrain.ribbons.length
      || budget.maxCells < world.heroCells.length
      || budget.maxLandmarks < world.landmarks.length
      || budget.maxHazards < world.hazards.length) {
      fail(`qualityBudgets.${tier}`, "must retain every gameplay-important world item.");
    }
    if (budget.maxAmbientArchetypes < world.presentationKit.ambientArchetypes.length
      || budget.maxLandmarkArchetypes < world.presentationKit.landmarkArchetypes.length
      || budget.maxSetPieceCells < world.setPieceCells.length) {
      fail(`qualityBudgets.${tier}`,
        "must retain every authored presentation archetype and set-piece cell.");
    }
    const ambientInstances = sortedAmbientBatches(world, tier)
      .reduce((total, batch) => total + batch.instancesByQuality[tier], 0);
    if (ambientInstances > budget.maxAmbientInstances) {
      fail(`qualityBudgets.${tier}.maxAmbientInstances`,
        `is below the selected ambient population (${ambientInstances}).`);
    }
    previous = budget;
  }
}

/**
 * Validates, clones, and deeply freezes a Cobra Canyon content object.
 * Returns the frozen clone so caller-owned mutable input can never alter a live plan.
 */
export function validateCobraCanyonWorld(value) {
  const input = requireRecord(value, "Cobra Canyon world");
  if (input.schema !== COBRA_CANYON_WORLD_SCHEMA) {
    fail("schema", `must be ${COBRA_CANYON_WORLD_SCHEMA}.`);
  }
  if (input.worldId !== EXPECTED_WORLD_ID) fail("worldId", `must be ${EXPECTED_WORLD_ID}.`);
  requireString(input.contentVersion, "contentVersion");
  const authoritySourceId = requireString(input.authoritySourceId, "authoritySourceId");
  if (input.epistemic !== "fiction") fail("epistemic", "must be fiction.");
  const period = requireRecord(input.period, "period");
  requireBoolean(period.fictional, true, "period.fictional");
  requireString(period.label, "period.label");
  const coordinateFrame = requireRecord(input.coordinateFrame, "coordinateFrame");
  requireString(coordinateFrame.id, "coordinateFrame.id");
  if (JSON.stringify(coordinateFrame.axes) !== JSON.stringify(["eastM", "upM", "northM"])) {
    fail("coordinateFrame.axes", "must be eastM/upM/northM.");
  }
  const bounds = boundsFromWorld(input);

  const terrain = requireRecord(input.terrain, "terrain");
  const terrainModel = requireRecord(terrain.model, "terrain.model");
  requireFinite(terrainModel.baseElevationM, "terrain.model.baseElevationM");
  requirePositive(terrainModel.basinRadiusM, "terrain.model.basinRadiusM");
  requirePositive(terrainModel.rimRiseM, "terrain.model.rimRiseM");
  requireFinite(terrainModel.macroUndulationM, "terrain.model.macroUndulationM");
  requireFinite(terrainModel.mesoUndulationM, "terrain.model.mesoUndulationM");
  requireFinite(terrainModel.ridgeReliefM, "terrain.model.ridgeReliefM");
  requirePositive(terrainModel.ridgeWavelengthM, "terrain.model.ridgeWavelengthM");
  requireFinite(terrainModel.ridgeBearingRad, "terrain.model.ridgeBearingRad");
  requireFinite(terrainModel.crossRidgeReliefM, "terrain.model.crossRidgeReliefM");
  requirePositive(terrainModel.crossRidgeWavelengthM, "terrain.model.crossRidgeWavelengthM");
  requireFinite(terrainModel.crossRidgeBearingRad, "terrain.model.crossRidgeBearingRad");
  const gorgeRim = requireRecord(terrainModel.gorgeRim, "terrain.model.gorgeRim");
  requirePositive(gorgeRim.innerM, "terrain.model.gorgeRim.innerM");
  requirePositive(gorgeRim.crestM, "terrain.model.gorgeRim.crestM");
  requirePositive(gorgeRim.falloffM, "terrain.model.gorgeRim.falloffM");
  requireFinite(gorgeRim.falloffRetain, "terrain.model.gorgeRim.falloffRetain");
  requireFinite(gorgeRim.leftRiseM, "terrain.model.gorgeRim.leftRiseM");
  requireFinite(gorgeRim.rightRiseM, "terrain.model.gorgeRim.rightRiseM");
  requirePositive(gorgeRim.sideBlendM, "terrain.model.gorgeRim.sideBlendM");
  if (gorgeRim.crestM <= gorgeRim.innerM || gorgeRim.falloffM <= gorgeRim.crestM) {
    fail("terrain.model.gorgeRim", "must declare increasing inner/crest/falloff distances.");
  }
  const terrainRibbons = requireArray(terrain.ribbons, "terrain.ribbons");
  const routeLanes = requireArray(input.routeLanes, "routeLanes");
  const heroCells = requireArray(input.heroCells, "heroCells");
  const landmarks = requireArray(input.landmarks, "landmarks", 8);
  const hazards = requireArray(input.hazards, "hazards", 1);
  const visualBands = requireArray(input.visualBands, "visualBands");
  const ambientBatches = requireArray(input.ambientBatches, "ambientBatches", 1);
  const presentationKit = requireRecord(input.presentationKit, "presentationKit");
  if (presentationKit.schema !== COBRA_CANYON_PRESENTATION_KIT_SCHEMA) {
    fail("presentationKit.schema", `must be ${COBRA_CANYON_PRESENTATION_KIT_SCHEMA}.`);
  }
  const ambientArchetypes = requireArray(
    presentationKit.ambientArchetypes,
    "presentationKit.ambientArchetypes",
    AMBIENT_RENDER_ROLES.length,
  );
  const landmarkArchetypes = requireArray(
    presentationKit.landmarkArchetypes,
    "presentationKit.landmarkArchetypes",
    landmarks.length,
  );
  const setPieceCells = requireArray(input.setPieceCells, "setPieceCells", routeLanes.length);
  requireRecord(input.qualityBudgets, "qualityBudgets");

  if (terrainRibbons.length !== 3) fail("terrain.ribbons", "must contain exactly three lanes.");
  if (routeLanes.length !== 3) fail("routeLanes", "must contain exactly three routes.");
  if (heroCells.length !== 3) fail("heroCells", "must contain exactly three hero cells.");
  if (visualBands.length !== 3) fail("visualBands", "must contain critical, structural, and ambient bands.");

  assertUniqueIds([
    ["terrain.ribbons", terrainRibbons],
    ["routeLanes", routeLanes],
    ["heroCells", heroCells],
    ["landmarks", landmarks],
    ["hazards", hazards],
    ["visualBands", visualBands],
    ["ambientBatches", ambientBatches],
    ["presentationKit.ambientArchetypes", ambientArchetypes],
    ["presentationKit.landmarkArchetypes", landmarkArchetypes],
    ["setPieceCells", setPieceCells],
  ]);

  for (const [path, role] of IMPORTANT_COLLECTIONS) {
    const collection = path === "terrain.ribbons" ? terrainRibbons : input[path];
    collection.forEach((item, index) =>
      assertAuthority(item, role, authoritySourceId, `${path}[${index}]`, false));
  }

  const routeIds = new Set(routeLanes.map((lane) => lane.id));
  if (JSON.stringify([...routeIds].sort()) !== JSON.stringify([...EXPECTED_ROUTE_IDS].sort())) {
    fail("routeLanes", "must declare the public river-gorge, ridge-shadow, and road-plantation ids.");
  }
  const ribbonLaneIds = new Set();
  terrainRibbons.forEach((ribbon, index) => {
    const label = `terrain.ribbons[${index}]`;
    if (!routeIds.has(ribbon.laneId)) fail(`${label}.laneId`, "must reference a route lane.");
    if (ribbonLaneIds.has(ribbon.laneId)) fail(`${label}.laneId`, "must be unique.");
    ribbonLaneIds.add(ribbon.laneId);
    requirePositive(ribbon.halfWidthM, `${label}.halfWidthM`);
    requirePositive(ribbon.blendWidthM, `${label}.blendWidthM`);
    requireFinite(ribbon.bankRiseM, `${label}.bankRiseM`);
    // Fraction of the half-width that stays dead flat before the bank starts to climb. A gorge
    // has a FLOOR; without one the cross-section is a parabola from the centreline out and the
    // river reads as a drainage ditch in a bowl. It is also what lets the rendered water meander
    // inside its own valley without climbing the bank.
    const floorFraction = requireFinite(ribbon.floorFraction, `${label}.floorFraction`);
    if (floorFraction < 0 || floorFraction >= 1) {
      fail(`${label}.floorFraction`, "must lie in [0, 1).");
    }
    assertPath(ribbon.pointsLocalM, bounds, `${label}.pointsLocalM`);
  });

  const cellIds = new Set(heroCells.map((cell) => cell.id));
  const landmarkIds = new Set(landmarks.map((landmark) => landmark.id));
  const hazardIds = new Set(hazards.map((hazard) => hazard.id));
  const visualBandIds = new Set(visualBands.map((band) => band.id));
  const routeLengths = new Map();
  routeLanes.forEach((lane, index) => {
    const label = `routeLanes[${index}]`;
    routeLengths.set(lane.id, assertPath(lane.pathLocalM, bounds, `${label}.pathLocalM`));
    requireArray(lane.recommendedAglBandM, `${label}.recommendedAglBandM`);
    if (lane.recommendedAglBandM.length !== 2
      || requirePositive(lane.recommendedAglBandM[0], `${label}.recommendedAglBandM[0]`)
        >= requirePositive(lane.recommendedAglBandM[1], `${label}.recommendedAglBandM[1]`)) {
      fail(`${label}.recommendedAglBandM`, "must be an increasing positive pair.");
    }
    assertReferences(lane.heroCellIds, cellIds, `${label}.heroCellIds`);
    assertReferences(lane.landmarkIds, landmarkIds, `${label}.landmarkIds`, 3);
    assertReferences(lane.hazardIds, hazardIds, `${label}.hazardIds`, 2);
  });

  heroCells.forEach((cell, index) => {
    const label = `heroCells[${index}]`;
    assertLocalBounds(cell.boundsLocalM, bounds, `${label}.boundsLocalM`);
    const patch = requireRecord(cell.terrainPatch, `${label}.terrainPatch`);
    assertPointInside(patch.centerLocalM, bounds, `${label}.terrainPatch.centerLocalM`);
    requirePositive(patch.radiusM, `${label}.terrainPatch.radiusM`);
    requirePositive(patch.blendWidthM, `${label}.terrainPatch.blendWidthM`);
    requireFinite(patch.undulationM, `${label}.terrainPatch.undulationM`);
  });

  landmarks.forEach((landmark, index) => {
    const label = `landmarks[${index}]`;
    assertPointInside(landmark.positionLocalM, bounds, `${label}.positionLocalM`);
    requireString(landmark.silhouette, `${label}.silhouette`);
    if (!visualBandIds.has(landmark.visualBandId)) {
      fail(`${label}.visualBandId`, "must reference a visual band.");
    }
  });

  hazards.forEach((hazard, index) => {
    const label = `hazards[${index}]`;
    if (!visualBandIds.has(hazard.visualBandId)) {
      fail(`${label}.visualBandId`, "must reference a visual band.");
    }
    assertCollision(hazard.collision, bounds, `${label}.collision`);
  });

  const visualKinds = new Set();
  visualBands.forEach((band, index) => {
    const label = `visualBands[${index}]`;
    if (!["critical", "structural", "ambient"].includes(band.kind)) {
      fail(`${label}.kind`, "must be critical, structural, or ambient.");
    }
    visualKinds.add(band.kind);
    requirePositive(band.loadRangeM, `${label}.loadRangeM`);
    requireNonNegativeInteger(band.shedRank, `${label}.shedRank`);
  });
  if (visualKinds.size !== 3) fail("visualBands", "must declare each required band once.");

  ambientBatches.forEach((batch, index) => {
    const label = `ambientBatches[${index}]`;
    assertAuthority(batch, "presentation-only", authoritySourceId, label, true);
    assertLocalBounds(batch.boundsLocalM, bounds, `${label}.boundsLocalM`);
    if (!visualBandIds.has(batch.visualBandId)) {
      fail(`${label}.visualBandId`, "must reference a visual band.");
    }
    requireNonNegativeInteger(batch.priority, `${label}.priority`);
    requireString(batch.archetype, `${label}.archetype`);
    const counts = requireRecord(batch.instancesByQuality, `${label}.instancesByQuality`);
    let previous = -1;
    for (const tier of QUALITY_TIERS) {
      const count = requireNonNegativeInteger(counts[tier], `${label}.instancesByQuality.${tier}`);
      if (count < previous) fail(`${label}.instancesByQuality.${tier}`, "must not decrease by tier.");
      previous = count;
    }
  });

  const ambientRoles = new Set();
  ambientArchetypes.forEach((archetype, index) => {
    const label = `presentationKit.ambientArchetypes[${index}]`;
    assertAuthority(archetype, "presentation-only", authoritySourceId, label, true);
    requireString(archetype.sourceKind, `${label}.sourceKind`);
    if (!AMBIENT_RENDER_ROLES.includes(archetype.renderRole)) {
      fail(`${label}.renderRole`, `must be one of ${AMBIENT_RENDER_ROLES.join(", ")}.`);
    }
    ambientRoles.add(archetype.renderRole);
    assertPalette(archetype.paletteHex, `${label}.paletteHex`);
    assertScale(archetype.scaleM, `${label}.scaleM`);
    if (archetype.routeAffinity !== undefined) {
      assertReferences(archetype.routeAffinity, routeIds, `${label}.routeAffinity`);
    }
  });
  if (ambientRoles.size !== AMBIENT_RENDER_ROLES.length) {
    fail("presentationKit.ambientArchetypes",
      "must cover jungle, plantation, village, paddy, rock, mist, and water-accent roles.");
  }

  const authoredLandmarkKinds = new Set(landmarks.map((landmark) => landmark.kind));
  const describedLandmarkKinds = new Set();
  landmarkArchetypes.forEach((archetype, index) => {
    const label = `presentationKit.landmarkArchetypes[${index}]`;
    assertAuthority(archetype, "presentation-only", authoritySourceId, label, true);
    requireString(archetype.sourceKind, `${label}.sourceKind`);
    requireString(archetype.renderRole, `${label}.renderRole`);
    const authoredKind = requireString(archetype.authoredKind, `${label}.authoredKind`);
    if (!authoredLandmarkKinds.has(authoredKind)) {
      fail(`${label}.authoredKind`, `does not match an authored landmark kind: ${authoredKind}.`);
    }
    if (describedLandmarkKinds.has(authoredKind)) {
      fail(`${label}.authoredKind`, `duplicates landmark mapping ${authoredKind}.`);
    }
    describedLandmarkKinds.add(authoredKind);
    assertPalette(archetype.paletteHex, `${label}.paletteHex`);
    assertScale(archetype.scaleM, `${label}.scaleM`);
    if (!ANCHOR_MODES.includes(archetype.anchorMode)) {
      fail(`${label}.anchorMode`, `must be one of ${ANCHOR_MODES.join(", ")}.`);
    }
  });
  if (describedLandmarkKinds.size !== authoredLandmarkKinds.size) {
    fail("presentationKit.landmarkArchetypes", "must map every authored landmark kind once.");
  }

  const archetypeIds = new Set([
    ...ambientArchetypes.map((archetype) => archetype.id),
    ...landmarkArchetypes.map((archetype) => archetype.id),
  ]);
  const lastSetPieceDistanceByRoute = new Map();
  const setPieceCountByRoute = new Map();
  setPieceCells.forEach((cell, index) => {
    const label = `setPieceCells[${index}]`;
    assertAuthority(cell, "presentation-only", authoritySourceId, label, true);
    requireString(cell.kind, `${label}.kind`);
    requireString(cell.displayName, `${label}.displayName`);
    if (!routeIds.has(cell.routeId)) fail(`${label}.routeId`, "must reference a route lane.");
    const distanceAlongRouteM = requireFinite(
      cell.distanceAlongRouteM,
      `${label}.distanceAlongRouteM`,
    );
    if (distanceAlongRouteM < 0 || distanceAlongRouteM > routeLengths.get(cell.routeId)) {
      fail(`${label}.distanceAlongRouteM`, "must fall within its authored route length.");
    }
    const previousDistance = lastSetPieceDistanceByRoute.get(cell.routeId) ?? -1;
    if (distanceAlongRouteM <= previousDistance) {
      fail(`${label}.distanceAlongRouteM`, "must increase within each route.");
    }
    lastSetPieceDistanceByRoute.set(cell.routeId, distanceAlongRouteM);
    setPieceCountByRoute.set(cell.routeId, (setPieceCountByRoute.get(cell.routeId) ?? 0) + 1);
    assertPointInside(cell.approachLocalM, bounds, `${label}.approachLocalM`);
    assertLocalBounds(cell.boundsLocalM, bounds, `${label}.boundsLocalM`);
    if (cell.anchorLocalM !== undefined) {
      assertPointInside(cell.anchorLocalM, bounds, `${label}.anchorLocalM`);
      assertPointInsideLocalBounds(cell.anchorLocalM, cell.boundsLocalM, `${label}.anchorLocalM`);
    }
    assertReferences(cell.archetypeIds, archetypeIds, `${label}.archetypeIds`);
    assertReferences(cell.landmarkIds, landmarkIds, `${label}.landmarkIds`);
    assertReferences(cell.hazardIds, hazardIds, `${label}.hazardIds`, 0);
  });
  for (const routeId of routeIds) {
    if ((setPieceCountByRoute.get(routeId) ?? 0) < 2) {
      fail("setPieceCells", `must provide at least two reveals for ${routeId}.`);
    }
  }

  assertBudgetContract(input);
  return deepFreeze(cloneJson(input));
}

function shadowCasterCount(batch, qualityTier, instanceCount) {
  if (qualityTier === "mobile") return 0;
  if (qualityTier === "balanced") {
    return batch.priority <= 2 ? Math.ceil(instanceCount * 0.08) : 0;
  }
  return Math.ceil(instanceCount * (batch.priority <= 2 ? 0.12 : 0.04));
}

/**
 * Resolves a tier-bounded, immutable render/authority plan. Important terrain, cells, landmarks,
 * and hazards never vary by tier; only non-targetable ambient presentation is shed.
 */
export function planCobraCanyonWorld(value, options = {}) {
  const world = validateCobraCanyonWorld(value);
  const qualityTier = options.qualityTier ?? "balanced";
  if (!QUALITY_TIERS.includes(qualityTier)) {
    fail("qualityTier", `must be one of ${QUALITY_TIERS.join(", ")}.`);
  }
  const budget = world.qualityBudgets[qualityTier];
  const terrainRibbons = world.terrain.ribbons.map((ribbon) => ({
    ...ribbon,
    segmentCount: ribbon.pointsLocalM.length - 1,
  }));
  const cells = world.heroCells.map((cell) => ({ ...cell }));
  const landmarks = world.landmarks.map((landmark) => ({ ...landmark }));
  const hazards = world.hazards.map((hazard) => ({ ...hazard }));
  const routeOrder = new Map(world.routeLanes.map((route, index) => [route.id, index]));
  const presentationKit = {
    schema: world.presentationKit.schema,
    ambientArchetypes: [...world.presentationKit.ambientArchetypes],
    landmarkArchetypes: [...world.presentationKit.landmarkArchetypes],
  };
  const setPieceCells = [...world.setPieceCells].sort((left, right) =>
    routeOrder.get(left.routeId) - routeOrder.get(right.routeId)
      || left.distanceAlongRouteM - right.distanceAlongRouteM
      || left.id.localeCompare(right.id));
  const ambientBatches = sortedAmbientBatches(world, qualityTier).map((batch) => {
    const instanceCount = batch.instancesByQuality[qualityTier];
    return {
      ...batch,
      instanceCount,
      shadowCasterCount: shadowCasterCount(batch, qualityTier, instanceCount),
    };
  });
  const ambientInstances = ambientBatches.reduce(
    (total, batch) => total + batch.instanceCount,
    0,
  );
  const shadowCasters = ambientBatches.reduce(
    (total, batch) => total + batch.shadowCasterCount,
    0,
  );
  // Structural layers are expected to batch by category; this conservative estimate still leaves
  // headroom for the aircraft, effects, and UI inside each authored world budget.
  const estimatedDrawCalls = terrainRibbons.length
    + cells.length
    + Math.min(3, landmarks.length)
    + Math.min(4, new Set(hazards.map((hazard) => hazard.kind)).size)
    + ambientBatches.length;
  if (estimatedDrawCalls > budget.maxDrawCalls) {
    throw new RangeError(
      `${qualityTier} Cobra Canyon plan needs ${estimatedDrawCalls} world draw calls; budget is ${budget.maxDrawCalls}.`,
    );
  }
  if (shadowCasters > budget.maxShadowCasters) {
    throw new RangeError(
      `${qualityTier} Cobra Canyon plan needs ${shadowCasters} ambient shadow casters; budget is ${budget.maxShadowCasters}.`,
    );
  }

  return deepFreeze({
    schema: COBRA_CANYON_PLAN_SCHEMA,
    worldId: world.worldId,
    contentVersion: world.contentVersion,
    authoritySourceId: world.authoritySourceId,
    epistemic: world.epistemic,
    qualityTier,
    coordinateFrame: world.coordinateFrame,
    boundsLocalM: world.boundsLocalM,
    terrainModel: world.terrain.model,
    routeLanes: [...world.routeLanes],
    terrainRibbons,
    cells,
    landmarks,
    hazards,
    visualBands: [...world.visualBands],
    presentationKit,
    setPieceCells,
    ambientBatches,
    budget: { ...budget },
    counts: {
      routeLanes: world.routeLanes.length,
      terrainRibbons: terrainRibbons.length,
      cells: cells.length,
      landmarks: landmarks.length,
      hazards: hazards.length,
      ambientArchetypes: presentationKit.ambientArchetypes.length,
      landmarkArchetypes: presentationKit.landmarkArchetypes.length,
      setPieceCells: setPieceCells.length,
      ambientBatches: ambientBatches.length,
      ambientInstances,
      estimatedDrawCalls,
      shadowCasters,
    },
  });
}

function resolveLoadArguments(fetchImpl, url) {
  if (isRecord(fetchImpl)) {
    return {
      fetchImpl: fetchImpl.fetch ?? globalThis.fetch,
      url: fetchImpl.url ?? COBRA_CANYON_WORLD_URL,
    };
  }
  if (typeof fetchImpl === "string" || fetchImpl instanceof URL) {
    return {
      fetchImpl: typeof url === "function" ? url : globalThis.fetch,
      url: String(fetchImpl),
    };
  }
  return {
    fetchImpl: fetchImpl ?? globalThis.fetch,
    url: url ?? COBRA_CANYON_WORLD_URL,
  };
}

/** Loads and validates the standalone world JSON. Accepts (fetchImpl, url), a URL, or options. */
export async function loadCobraCanyonWorld(
  fetchImpl = globalThis.fetch,
  url = COBRA_CANYON_WORLD_URL,
) {
  const resolved = resolveLoadArguments(fetchImpl, url);
  if (typeof resolved.fetchImpl !== "function") {
    fail("fetchImpl", "must be a function.");
  }
  // Browser-native fetch is a Web IDL method and some engines reject a detached invocation.
  // Supplying globalThis as the receiver also leaves injected arrow functions and test doubles
  // unaffected while preserving the overload-friendly loader seam.
  const response = await Reflect.apply(resolved.fetchImpl, globalThis, [
    resolved.url,
    { credentials: "same-origin" },
  ]);
  if (!response || response.ok === false) {
    const status = response?.status ?? "unknown";
    throw new Error(`Failed to load Cobra Canyon world ${resolved.url}: HTTP ${status}.`);
  }
  if (typeof response.json !== "function") {
    fail("Cobra Canyon response", "must provide json().");
  }
  return validateCobraCanyonWorld(await response.json());
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

// Exported so the presentation's Camp Ember recess feathers on the EXACT ramp the apron
// flattens on. Two copies of this curve would drift and leave a step at the blend edge.
export function smoothstep(minimum, maximum, value) {
  if (maximum <= minimum) return value >= maximum ? 1 : 0;
  const unit = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return unit * unit * (3 - 2 * unit);
}

/**
 * Ridged relief. `1 - |sin|` has a cusp where the sine crosses zero and a smooth minimum a
 * quarter-period away, which is a crest line over a rounded hollow — the shape a drainage-carved
 * upland actually has. A product of two sines (the macro/meso terms) can only make a smooth
 * egg-carton, and an egg-carton at 78 m amplitude over a 1.4 km wavelength is exactly the
 * "rolling English farmland" read. Wavelengths stay well above 2x the 100 m render grid so the
 * crests survive sampling instead of aliasing into noise.
 */
function ridgeFold(eastM, northM, bearingRad, wavelengthM) {
  const along = (eastM * Math.cos(bearingRad) + northM * Math.sin(bearingRad)) / wavelengthM;
  return 1 - Math.abs(Math.sin(along * Math.PI));
}

/**
 * Nearest point on a ribbon centreline, with the signed lateral offset. Positive is the left bank
 * looking downstream (the polyline runs south-west to north-east, so left is north-west): the
 * gorge is deliberately asymmetric, because a real river undercuts one bank and terraces the
 * other, and because this world wants a masking ridge on one side and an exposed plantation
 * basin on the other.
 */
function nearestRibbonSample(ribbon, east, north) {
  let closestDistanceM = Infinity;
  let closestElevationM = 0;
  let signedOffsetM = 0;
  for (let index = 1; index < ribbon.pointsLocalM.length; index++) {
    const from = ribbon.pointsLocalM[index - 1];
    const to = ribbon.pointsLocalM[index];
    const segmentEast = to[0] - from[0];
    const segmentNorth = to[2] - from[2];
    const lengthSquared = segmentEast * segmentEast + segmentNorth * segmentNorth;
    const segmentBlend = lengthSquared > 0
      ? clamp(((east - from[0]) * segmentEast + (north - from[2]) * segmentNorth)
        / lengthSquared, 0, 1)
      : 0;
    const closestEast = from[0] + segmentEast * segmentBlend;
    const closestNorth = from[2] + segmentNorth * segmentBlend;
    const distanceM = Math.hypot(east - closestEast, north - closestNorth);
    if (distanceM >= closestDistanceM) continue;
    closestDistanceM = distanceM;
    closestElevationM = from[1] + (to[1] - from[1]) * segmentBlend;
    const lengthM = Math.max(1e-9, Math.sqrt(lengthSquared));
    signedOffsetM = ((east - closestEast) * -segmentNorth
      + (north - closestNorth) * segmentEast) / lengthM;
  }
  return { closestDistanceM, closestElevationM, signedOffsetM };
}

/**
 * The gorge rim: a raised lip flanking the river, peaking at `crestM` from the centreline and
 * decaying back toward the plain beyond `falloffM`. It is a LIP, not a plateau step, on purpose —
 * a step would lift the whole far half of the world and drown the road and ridge routes, whose
 * authored altitudes are gameplay authority. The lip only reshapes the near field the helicopter
 * is masked by, and leaves terrain two kilometres out within ~a quarter of its height.
 */
function gorgeRimRise(model, closestDistanceM, signedOffsetM) {
  const rim = model.gorgeRim;
  const side = clamp(signedOffsetM / rim.sideBlendM, -1, 1);
  const riseM = rim.rightRiseM + (rim.leftRiseM - rim.rightRiseM) * (side * 0.5 + 0.5);
  const lip = smoothstep(rim.innerM, rim.crestM, closestDistanceM)
    * (1 - smoothstep(rim.crestM * 1.4, rim.falloffM, closestDistanceM)
      * (1 - rim.falloffRetain));
  return riseM * lip;
}

function riverRibbonOf(plan) {
  return plan.terrainRibbons.find((ribbon) => String(ribbon.laneId ?? "").includes("river"))
    ?? plan.terrainRibbons[0];
}

/**
 * Samples the analytical field immediately before the final Camp Ember apron operation.
 * Presentation terrain uses this seam to apply its conservative half-cell bias first; sampling
 * the already-flattened apron would let a coarse neighbourhood minimum drag the 214 m pad down
 * into the gorge. All ordinary callers must use `sampleCobraCanyonTerrain` below.
 */
export function sampleCobraCanyonTerrainBeforeCampEmberApron(plan, eastM, northM) {
  requireRecord(plan, "Cobra Canyon plan");
  const bounds = requireRecord(plan.boundsLocalM, "plan.boundsLocalM");
  const model = requireRecord(plan.terrainModel, "plan.terrainModel");
  requireArray(plan.terrainRibbons, "plan.terrainRibbons", 1);
  requireArray(plan.cells, "plan.cells");
  const east = clamp(
    requireFinite(eastM, "eastM"),
    requireFinite(bounds.minimumEastM, "plan.boundsLocalM.minimumEastM"),
    requireFinite(bounds.maximumEastM, "plan.boundsLocalM.maximumEastM"),
  );
  const north = clamp(
    requireFinite(northM, "northM"),
    requireFinite(bounds.minimumNorthM, "plan.boundsLocalM.minimumNorthM"),
    requireFinite(bounds.maximumNorthM, "plan.boundsLocalM.maximumNorthM"),
  );
  const radius = Math.hypot(east, north);
  const rim = smoothstep(model.basinRadiusM, 10_600, radius);
  const river = nearestRibbonSample(riverRibbonOf(plan), east, north);
  let heightM = model.baseElevationM
    + model.rimRiseM * rim * rim
    + model.macroUndulationM
      * Math.sin((east + north * 0.37) / 1_430)
      * Math.cos((north - east * 0.21) / 1_170)
    + model.mesoUndulationM
      * Math.sin((east - north) / 510)
      * Math.cos((east + north) / 690)
    + model.ridgeReliefM
      * (ridgeFold(east, north, model.ridgeBearingRad, model.ridgeWavelengthM) - 0.5)
    + model.crossRidgeReliefM
      * (ridgeFold(east, north, model.crossRidgeBearingRad, model.crossRidgeWavelengthM) - 0.5)
    + gorgeRimRise(model, river.closestDistanceM, river.signedOffsetM);

  function carveCorridor(ribbon) {
    const { closestDistanceM, closestElevationM } = nearestRibbonSample(ribbon, east, north);
    // Flat floor first, then the bank. `normalizedCrossing` measures the climb from the OUTER
    // edge of the floor, not from the centreline, so the inner `floorFraction` of the corridor
    // is level ground the aircraft and the meandering water sheet both sit on.
    const floorEdgeM = ribbon.halfWidthM * ribbon.floorFraction;
    const normalizedCrossing = ribbon.halfWidthM > floorEdgeM
      ? clamp((closestDistanceM - floorEdgeM) / (ribbon.halfWidthM - floorEdgeM), 0, 1)
      : 1;
    const targetElevationM = closestElevationM
      + ribbon.bankRiseM * normalizedCrossing * normalizedCrossing;
    const ribbonBlend = 1 - smoothstep(
      ribbon.halfWidthM,
      ribbon.halfWidthM + ribbon.blendWidthM,
      closestDistanceM,
    );
    heightM += (targetElevationM - heightM) * ribbonBlend;
  }

  // CARVE ORDER: land corridors, then hero-cell shaping, then the river LAST. Water is a
  // landscape's base level — nothing crosses a river without a bridge — so no road bench and
  // no hero patch may lift the channel. Authored order used to decide it, and where the ridge
  // bench converges on the river near the objective the bench won: the rendered water sheet,
  // which drapes on this field, climbed 178 m uphill over the last two kilometres.
  const riverRibbon = riverRibbonOf(plan);
  for (const ribbon of plan.terrainRibbons) {
    if (ribbon !== riverRibbon) carveCorridor(ribbon);
  }

  for (const cell of plan.cells) {
    const patch = cell.terrainPatch;
    const [centreEast, centreElevation, centreNorth] = patch.centerLocalM;
    const distanceM = Math.hypot(east - centreEast, north - centreNorth);
    const blend = 1 - smoothstep(
      patch.radiusM * 0.72,
      patch.radiusM + patch.blendWidthM,
      distanceM,
    );
    if (blend <= 0) continue;
    const localRelief = patch.undulationM
      * 0.5
      * (Math.sin((east - centreEast) / 185) + Math.cos((north - centreNorth) / 225));
    heightM += (centreElevation + localRelief - heightM) * blend;
  }



  carveCorridor(riverRibbon);

  if (!Number.isFinite(heightM)) {
    throw new RangeError("Cobra Canyon pre-apron terrain sample was not finite.");
  }
  return heightM;
}

/**
 * Applies the final Camp Ember apron to an arbitrary pre-apron terrain height.
 *
 * Keeping this operation separate is intentional: the render mesh feeds its neighbourhood-
 * minimum height through here, while simulation/browser point samples feed the centre height
 * through it. In both cases the flat 190 m contact apron and 190–300 m blend are the LAST terrain
 * operation, so a coarse render sample cannot carve a pit through the launch surface.
 */
export function applyCobraCanyonCampEmberApron(plan, eastM, northM, heightM) {
  requireRecord(plan, "Cobra Canyon plan");
  const bounds = requireRecord(plan.boundsLocalM, "plan.boundsLocalM");
  const east = clamp(
    requireFinite(eastM, "eastM"),
    requireFinite(bounds.minimumEastM, "plan.boundsLocalM.minimumEastM"),
    requireFinite(bounds.maximumEastM, "plan.boundsLocalM.maximumEastM"),
  );
  const north = clamp(
    requireFinite(northM, "northM"),
    requireFinite(bounds.minimumNorthM, "plan.boundsLocalM.minimumNorthM"),
    requireFinite(bounds.maximumNorthM, "plan.boundsLocalM.maximumNorthM"),
  );
  let adjustedHeightM = requireFinite(heightM, "heightM");
  // Grid-aligned construction bench: the visible firebase remains irregular, while the contact
  // surface under every pad and service area stays exactly planar across render tiers.
  const campDistanceM = Math.max(
    Math.abs(east - COBRA_CANYON_CAMP_EMBER_APRON.eastM),
    Math.abs(north - COBRA_CANYON_CAMP_EMBER_APRON.northM),
  );
  const campBlend = 1 - smoothstep(
    COBRA_CANYON_CAMP_EMBER_APRON.levelRadiusM,
    COBRA_CANYON_CAMP_EMBER_APRON.blendRadiusM,
    campDistanceM,
  );
  if (campBlend > 0) {
    const campElevationM = Number(COBRA_CANYON_CAMP_EMBER_APRON.elevationM);
    if (!Number.isFinite(campElevationM)) {
      throw new RangeError("Cobra Canyon Camp Ember elevation was not finite.");
    }
    adjustedHeightM += (campElevationM - adjustedHeightM) * campBlend;
  }

  if (!Number.isFinite(adjustedHeightM)) {
    throw new RangeError("Cobra Canyon terrain sample was not finite.");
  }
  return adjustedHeightM;
}

/**
 * Samples the deterministic analytical terrain used by the standalone lab camera and floor.
 * It is a presentation floor, not a replacement for simulation-owned collision truth.
 *
 * KERNEL MIRROR. `CobraCanyonTerrainSurface.HeightM` in sim/Cobra/CobraCanyonDefinition.cs is
 * the simulation's copy of this function and must stay numerically identical — the ground war,
 * the FOB, the turret line-of-sight checks and the helicopter's own ground clearance all read
 * that one, and `CobraCanyonDefinitionTests.TerrainHeightMatchesBrowserPlannerGoldenSamples`
 * pins the two together at ten sample points.
 */
export function sampleCobraCanyonTerrain(plan, eastM, northM) {
  return applyCobraCanyonCampEmberApron(
    plan,
    eastM,
    northM,
    sampleCobraCanyonTerrainBeforeCampEmberApron(plan, eastM, northM),
  );
}
