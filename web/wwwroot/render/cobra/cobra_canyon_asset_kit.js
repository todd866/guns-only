import { sampleCobraCanyonTerrain } from "./cobra_canyon_plan.js?v=247";

export const COBRA_CANYON_ASSET_KIT_SCHEMA = "guns-only.cobra-canyon-asset-kit.v1";

export const COBRA_CANYON_ASSET_ROLES = Object.freeze([
  "jungle",
  "plantation",
  "village",
  "paddy",
  "rock",
  "mist",
  "waterAccent",
]);

export const COBRA_CANYON_AMBIENT_BUDGETS = Object.freeze({
  0: Object.freeze({
    jungle: 1,
    plantation: 1,
    village: 1,
    paddy: 1,
    rock: 1,
    mist: 1,
    waterAccent: 1,
  }),
  1: Object.freeze({
    jungle: 0.72,
    plantation: 0.78,
    village: 1,
    paddy: 0.65,
    rock: 1,
    mist: 0,
    waterAccent: 0.7,
  }),
  2: Object.freeze({
    jungle: 0.4,
    plantation: 0.5,
    village: 0.75,
    paddy: 0.35,
    rock: 0.8,
    mist: 0,
    waterAccent: 0.45,
  }),
});

const DEFAULT_ROLE_BY_KIND = Object.freeze({
  "riparian-canopy": "jungle",
  "bamboo-and-scrub": "jungle",
  "highland-canopy": "jungle",
  "road-verge-clutter": "jungle",
  "ridge-grass": "jungle",
  "plantation-rows": "plantation",
  "village-compounds": "village",
  "village-clutter": "village",
  "paddy-mirrors": "paddy",
  "quarry-scrub": "rock",
  "river-mist": "mist",
});

// The original ambient batches predate the presentation-kit schema and intentionally keep their
// stable procedural:// identifiers. This table is the explicit compatibility seam between those
// authored batches and the richer renderer descriptors; it avoids guessing from array order.
const DEFAULT_DESCRIPTOR_ID_BY_KIND = Object.freeze({
  "riparian-canopy": "archetype.cobra-canyon.jungle-canopy.v1",
  "bamboo-and-scrub": "archetype.cobra-canyon.jungle-understory.v1",
  "highland-canopy": "archetype.cobra-canyon.jungle-canopy.v1",
  "road-verge-clutter": "archetype.cobra-canyon.jungle-understory.v1",
  "ridge-grass": "archetype.cobra-canyon.jungle-understory.v1",
  "plantation-rows": "archetype.cobra-canyon.plantation-row.v1",
  "village-compounds": "archetype.cobra-canyon.village-compound.v1",
  "village-clutter": "archetype.cobra-canyon.village-hut.v1",
  "paddy-mirrors": "archetype.cobra-canyon.paddy-mirror.v1",
  "quarry-scrub": "archetype.cobra-canyon.rock-scatter.v1",
  "river-mist": "archetype.cobra-canyon.river-mist.v1",
});

const ROLE_ORDER = Object.freeze(Object.fromEntries(
  COBRA_CANYON_ASSET_ROLES.map((role, index) => [role, index]),
));

const STRUCTURAL_ROLES = new Set(["village", "rock"]);

const PRESENTATION_ONLY_TAG = Object.freeze({
  presentationOnly: true,
  authoritative: false,
  collisionSource: false,
  targetSource: false,
  targetable: false,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function token(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function hashString(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixedUint32(value) {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b);
  result ^= result >>> 16;
  return result >>> 0;
}

function seededUnit(seed, salt) {
  return mixedUint32(seed ^ salt) / 0x1_0000_0000;
}

function boundsFrom(value) {
  const bounds = value?.boundsLocalM ?? value?.bounds;
  if (Array.isArray(bounds) && bounds.length >= 4) {
    return {
      minimumEastM: finite(bounds[0]),
      minimumNorthM: finite(bounds[1]),
      maximumEastM: finite(bounds[2]),
      maximumNorthM: finite(bounds[3]),
    };
  }
  if (bounds && typeof bounds === "object") return boundsFrom(bounds);
  if (
    value?.minimumEastM !== undefined
    && value?.minimumNorthM !== undefined
    && value?.maximumEastM !== undefined
    && value?.maximumNorthM !== undefined
  ) {
    return {
      minimumEastM: finite(value.minimumEastM),
      minimumNorthM: finite(value.minimumNorthM),
      maximumEastM: finite(value.maximumEastM),
      maximumNorthM: finite(value.maximumNorthM),
    };
  }
  return null;
}

function descriptorIndex(plan) {
  const descriptors = Array.isArray(plan.presentationKit?.ambientArchetypes)
    ? plan.presentationKit.ambientArchetypes
    : [];
  const byKind = new Map();
  const byId = new Map();
  for (const descriptor of descriptors) {
    if (descriptor?.id) byId.set(descriptor.id, descriptor);
    if (descriptor?.sourceKind) byKind.set(token(descriptor.sourceKind), descriptor);
    if (descriptor?.kind) byKind.set(token(descriptor.kind), descriptor);
    if (descriptor?.archetype) byId.set(descriptor.archetype, descriptor);
  }
  return { descriptors, byKind, byId };
}

function roleForBatch(batch, descriptors) {
  const descriptor = descriptors.byId.get(batch.archetype)
    ?? descriptors.byKind.get(token(batch.kind))
    ?? descriptors.byId.get(DEFAULT_DESCRIPTOR_ID_BY_KIND[token(batch.kind)]);
  const requestedRole = token(descriptor?.renderRole).replaceAll("-", "");
  const role = COBRA_CANYON_ASSET_ROLES.find(
    (candidate) => token(candidate).replaceAll("-", "") === requestedRole,
  );
  return {
    descriptor,
    role: role ?? DEFAULT_ROLE_BY_KIND[token(batch.kind)] ?? null,
  };
}

function routeCandidates(plan, role, batch) {
  const affinities = Array.isArray(batch.descriptor?.routeAffinity)
    ? batch.descriptor.routeAffinity
    : batch.descriptor?.routeAffinity
      ? [batch.descriptor.routeAffinity]
      : [];
  let filtered = affinities.length
    ? plan.terrainRibbons.filter((ribbon) => affinities.includes(ribbon.laneId))
    : [];
  const desired = role === "mist" || token(batch.kind).includes("riparian") ? "river"
    : role === "plantation" || role === "paddy" || role === "village" ? "road"
      : role === "rock" || token(batch.kind).includes("bamboo") ? "ridge"
        : "";
  if (filtered.length && desired) {
    const refined = filtered.filter((ribbon) => token(ribbon.kind).includes(desired));
    if (refined.length) filtered = refined;
  } else if (!filtered.length) {
    filtered = desired
      ? plan.terrainRibbons.filter((ribbon) => token(ribbon.kind).includes(desired))
      : plan.terrainRibbons;
  }
  return filtered.length ? filtered : plan.terrainRibbons;
}

function routeBiasedPoint(plan, role, batch, bounds, seed) {
  const candidates = routeCandidates(plan, role, batch);
  if (!candidates.length || seededUnit(seed, 0x93d765dd) > 0.92) return null;
  const ribbon = candidates[Math.min(
    candidates.length - 1,
    Math.floor(seededUnit(seed, 0x6d2b79f5) * candidates.length),
  )];
  let segmentIndex = Math.min(
    ribbon.pointsLocalM.length - 2,
    Math.floor(seededUnit(seed, 0xb5297a4d) * (ribbon.pointsLocalM.length - 1)),
  );
  let blend = 0.05 + seededUnit(seed, 0x68e31da4) * 0.9;
  const routeSetPieces = (plan.setPieceCells ?? []).filter(
    (cell) => cell.routeId === ribbon.laneId && Array.isArray(cell.approachLocalM),
  );
  if (routeSetPieces.length && seededUnit(seed, 0xf1357aea) < 0.68) {
    const focus = routeSetPieces[Math.min(
      routeSetPieces.length - 1,
      Math.floor(seededUnit(seed, 0x94d049bb) * routeSetPieces.length),
    )].approachLocalM;
    let nearestDistanceSquared = Infinity;
    for (let index = 0; index < ribbon.pointsLocalM.length - 1; index++) {
      const candidateFrom = ribbon.pointsLocalM[index];
      const candidateTo = ribbon.pointsLocalM[index + 1];
      const candidateEastM = candidateTo[0] - candidateFrom[0];
      const candidateNorthM = candidateTo[2] - candidateFrom[2];
      const candidateLengthSquared = candidateEastM * candidateEastM
        + candidateNorthM * candidateNorthM;
      const candidateBlend = candidateLengthSquared > 0
        ? clamp(
          ((focus[0] - candidateFrom[0]) * candidateEastM
            + (focus[2] - candidateFrom[2]) * candidateNorthM) / candidateLengthSquared,
          0,
          1,
        )
        : 0;
      const closestEastM = candidateFrom[0] + candidateEastM * candidateBlend;
      const closestNorthM = candidateFrom[2] + candidateNorthM * candidateBlend;
      const distanceSquared = (focus[0] - closestEastM) ** 2
        + (focus[2] - closestNorthM) ** 2;
      if (distanceSquared >= nearestDistanceSquared) continue;
      nearestDistanceSquared = distanceSquared;
      segmentIndex = index;
      blend = clamp(
        candidateBlend + (seededUnit(seed, 0x369dea0f) - 0.5) * 0.62,
        0.03,
        0.97,
      );
    }
  }
  const from = ribbon.pointsLocalM[segmentIndex];
  const to = ribbon.pointsLocalM[segmentIndex + 1];
  const deltaEastM = to[0] - from[0];
  const deltaNorthM = to[2] - from[2];
  const lengthM = Math.max(0.001, Math.hypot(deltaEastM, deltaNorthM));
  const side = seededUnit(seed, 0x1b56c4e9) < 0.5 ? -1 : 1;
  let clearanceM = 65;
  if (role === "mist") clearanceM = 0;
  else if (role === "paddy") clearanceM = 34;
  else if (role === "plantation") clearanceM = 42;
  else if (role === "village") clearanceM = 48;
  else if (role === "rock") clearanceM = 72;
  else if (token(batch.kind).includes("riparian")) {
    clearanceM = 68;
  }
  const spreadM = role === "mist" ? 55
    : role === "paddy" ? 80
      : role === "plantation" ? 58
        : role === "village" ? 82
          : role === "rock" ? 120
            : 88;
  const lateralM = side * (clearanceM + seededUnit(seed, 0x85ebca6b) * spreadM);
  const eastM = from[0] + deltaEastM * blend - deltaNorthM / lengthM * lateralM;
  const northM = from[2] + deltaNorthM * blend + deltaEastM / lengthM * lateralM;
  if (eastM < bounds.minimumEastM || eastM > bounds.maximumEastM
      || northM < bounds.minimumNorthM || northM > bounds.maximumNorthM) {
    return null;
  }
  return {
    eastM,
    northM,
    yaw: Math.atan2(deltaEastM, deltaNorthM),
  };
}

function gridPoint(bounds, ordinal, count, seed) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const column = ordinal % columns;
  const row = Math.floor(ordinal / columns);
  const eastUnit = (column + 0.18 + seededUnit(seed, 0xa511e9b3) * 0.64) / columns;
  const northUnit = (row + 0.18 + seededUnit(seed, 0x63d83595) * 0.64) / rows;
  return {
    eastM: bounds.minimumEastM
      + (bounds.maximumEastM - bounds.minimumEastM) * clamp(eastUnit, 0.03, 0.97),
    northM: bounds.minimumNorthM
      + (bounds.maximumNorthM - bounds.minimumNorthM) * clamp(northUnit, 0.03, 0.97),
  };
}

function roleScale(role, descriptor, variation) {
  const declared = descriptor?.scaleM ?? descriptor?.dimensionsM;
  const read = (key, index, fallback) => Math.max(0.1, finite(
    declared?.[key]
      ?? declared?.[`${key}M`]
      ?? (Array.isArray(declared) ? declared[index] : undefined),
    fallback,
  ));
  if (role === "jungle") {
    return {
      widthM: read("width", 0, 13 + variation * 8),
      heightM: read("height", 1, 16 + variation * 14),
      depthM: read("depth", 2, 13 + variation * 8),
    };
  }
  if (role === "plantation") {
    return {
      widthM: read("width", 0, 16 + variation * 5),
      heightM: read("height", 1, 11 + variation * 5),
      depthM: read("depth", 2, 54 + variation * 24),
    };
  }
  if (role === "village") {
    return {
      widthM: read("width", 0, 32 + variation * 12),
      heightM: read("height", 1, 10 + variation * 5),
      depthM: read("depth", 2, 30 + variation * 12),
    };
  }
  if (role === "paddy") {
    return {
      widthM: read("width", 0, 45 + variation * 30),
      heightM: Math.max(0.8, read("height", 1, 1.2)),
      depthM: read("depth", 2, 72 + variation * 48),
    };
  }
  if (role === "rock") {
    return {
      widthM: read("width", 0, 18 + variation * 18),
      heightM: read("height", 1, 20 + variation * 42),
      depthM: read("depth", 2, 18 + variation * 18),
    };
  }
  if (role === "mist") {
    return {
      widthM: read("width", 0, 65 + variation * 55),
      heightM: read("height", 1, 10 + variation * 9),
      depthM: read("depth", 2, 32 + variation * 35),
    };
  }
  return {
    widthM: read("width", 0, 26 + variation * 18),
    heightM: read("height", 1, 0.3),
    depthM: read("depth", 2, 70 + variation * 45),
  };
}

function resolvedRole(value) {
  const requestedRole = token(value).replaceAll("-", "");
  return COBRA_CANYON_ASSET_ROLES.find(
    (candidate) => token(candidate).replaceAll("-", "") === requestedRole,
  ) ?? null;
}

function nearestRoutePoint(plan, routeId, eastM, northM) {
  const ribbon = plan.terrainRibbons.find((candidate) => candidate.laneId === routeId);
  if (!ribbon) return null;
  let nearest = null;
  let nearestDistanceSquared = Infinity;
  for (let index = 0; index < ribbon.pointsLocalM.length - 1; index++) {
    const from = ribbon.pointsLocalM[index];
    const to = ribbon.pointsLocalM[index + 1];
    const deltaEastM = to[0] - from[0];
    const deltaNorthM = to[2] - from[2];
    const lengthSquared = deltaEastM * deltaEastM + deltaNorthM * deltaNorthM;
    const blend = lengthSquared > 0
      ? clamp(
        ((eastM - from[0]) * deltaEastM + (northM - from[2]) * deltaNorthM)
          / lengthSquared,
        0,
        1,
      )
      : 0;
    const routeEastM = from[0] + deltaEastM * blend;
    const routeNorthM = from[2] + deltaNorthM * blend;
    const offsetEastM = eastM - routeEastM;
    const offsetNorthM = northM - routeNorthM;
    const distanceSquared = offsetEastM * offsetEastM + offsetNorthM * offsetNorthM;
    if (distanceSquared >= nearestDistanceSquared) continue;
    nearestDistanceSquared = distanceSquared;
    nearest = {
      eastM: routeEastM,
      northM: routeNorthM,
      tangentEastM: deltaEastM,
      tangentNorthM: deltaNorthM,
      offsetEastM,
      offsetNorthM,
      distanceM: Math.sqrt(distanceSquared),
    };
  }
  return nearest;
}

function outsideRotorCorridor(plan, cell, role, point, seed) {
  const clearanceM = role === "rock" ? 115
    : role === "village" ? 90
      : role === "jungle" ? 78
        : role === "plantation" || role === "paddy" ? 62
          : 0;
  if (!clearanceM) return point;
  const nearest = nearestRoutePoint(plan, cell.routeId, point.eastM, point.northM);
  if (!nearest || nearest.distanceM >= clearanceM) return point;
  let directionEastM = nearest.offsetEastM;
  let directionNorthM = nearest.offsetNorthM;
  let directionLengthM = nearest.distanceM;
  if (directionLengthM < 0.001) {
    const tangentLengthM = Math.max(
      0.001,
      Math.hypot(nearest.tangentEastM, nearest.tangentNorthM),
    );
    const side = seededUnit(seed, 0x9e3779b9) < 0.5 ? -1 : 1;
    directionEastM = -nearest.tangentNorthM / tangentLengthM * side;
    directionNorthM = nearest.tangentEastM / tangentLengthM * side;
    directionLengthM = 1;
  }
  return {
    eastM: nearest.eastM + directionEastM / directionLengthM * clearanceM,
    northM: nearest.northM + directionNorthM / directionLengthM * clearanceM,
  };
}

function allocateQuotas(batches, target) {
  const total = batches.reduce((sum, batch) => sum + batch.instanceCount, 0);
  if (!target || !total) return batches.map((batch) => ({ ...batch, count: 0 }));
  const quotas = batches.map((batch) => {
    const exact = batch.instanceCount * target / total;
    return { ...batch, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let assigned = quotas.reduce((sum, quota) => sum + quota.count, 0);
  const order = [...quotas].sort((left, right) =>
    right.remainder - left.remainder
      || finite(left.priority) - finite(right.priority)
      || left.id.localeCompare(right.id));
  for (let index = 0; assigned < target; index++, assigned++) {
    order[index % order.length].count += 1;
  }
  return quotas;
}

function waterAccentPlacements(plan, qualityTier, descriptors) {
  const maximum = qualityTier === "mobile" ? 12 : qualityTier === "desktop" ? 24 : 18;
  const river = plan.terrainRibbons.find((ribbon) => token(ribbon.kind).includes("river"));
  if (!river) return [];
  const descriptor = descriptors.descriptors.find(
    (candidate) => resolvedRole(candidate.renderRole) === "waterAccent",
  );
  const placements = [];
  const segmentCount = river.pointsLocalM.length - 1;
  for (let index = 0; index < maximum; index++) {
    const segmentIndex = index % segmentCount;
    const from = river.pointsLocalM[segmentIndex];
    const to = river.pointsLocalM[segmentIndex + 1];
    const cycle = Math.floor(index / segmentCount);
    const blend = (cycle + 1) / (Math.ceil(maximum / segmentCount) + 1);
    const eastM = from[0] + (to[0] - from[0]) * blend;
    const northM = from[2] + (to[2] - from[2]) * blend;
    const variation = (index % 5) / 4;
    const scale = roleScale("waterAccent", descriptor, variation);
    placements.push({
      id: `water-accent.${index}`,
      role: "waterAccent",
      x: eastM,
      y: sampleCobraCanyonTerrain(plan, eastM, northM) + 0.5,
      z: -northM,
      yaw: Math.atan2(to[0] - from[0], to[2] - from[2]),
      widthM: Math.min(scale.widthM, river.halfWidthM * 0.48),
      heightM: scale.heightM,
      depthM: scale.depthM,
      variation,
      rank: (index + 0.5) / maximum,
      batchId: river.id,
      archetypeId: descriptor?.id ?? null,
      paletteHex: descriptor?.paletteHex ?? null,
    });
  }
  return placements;
}

function setPiecePlacements(plan, descriptors) {
  const placements = [];
  for (const cell of plan.setPieceCells ?? []) {
    const archetypes = cell.archetypeIds ?? [];
    for (let index = 0; index < archetypes.length; index++) {
      const archetypeId = archetypes[index];
      const descriptor = descriptors.byId.get(archetypeId);
      const role = resolvedRole(descriptor?.renderRole);
      if (!role) continue;
      const anchor = cell.anchorLocalM ?? cell.approachLocalM;
      if (!Array.isArray(anchor)) continue;
      const seed = hashString(`${cell.id}:${archetypeId}`);
      const variation = seededUnit(seed, 0x27d4eb2f);
      const scale = roleScale(role, descriptor, variation);
      const angle = seededUnit(seed, 0x85ebca6b) * Math.PI * 2;
      const offsetM = index === 0 ? 0 : Math.min(78, 16 + index * 13);
      const candidate = outsideRotorCorridor(plan, cell, role, {
        eastM: anchor[0] + Math.cos(angle) * offsetM,
        northM: anchor[2] + Math.sin(angle) * offsetM,
      }, seed);
      const cellBounds = boundsFrom(cell);
      const eastM = cellBounds
        ? clamp(candidate.eastM, cellBounds.minimumEastM, cellBounds.maximumEastM)
        : candidate.eastM;
      const northM = cellBounds
        ? clamp(candidate.northM, cellBounds.minimumNorthM, cellBounds.maximumNorthM)
        : candidate.northM;
      const nearest = nearestRoutePoint(plan, cell.routeId, eastM, northM);
      const routeAligned = role === "plantation" || role === "paddy";
      placements.push({
        id: `${cell.id}.${archetypeId}`,
        role,
        x: eastM,
        y: sampleCobraCanyonTerrain(plan, eastM, northM),
        z: -northM,
        yaw: routeAligned && nearest
          ? Math.atan2(nearest.tangentEastM, nearest.tangentNorthM)
          : seededUnit(seed, 0xa511e9b3) * Math.PI * 2,
        variation,
        rank: 0,
        batchId: cell.id,
        setPieceId: cell.id,
        archetypeId,
        paletteHex: descriptor?.paletteHex ?? null,
        ...scale,
      });
    }
  }
  return placements;
}

function planPlacements(plan, qualityTier, maximumInstances) {
  const descriptors = descriptorIndex(plan);
  const batches = [];
  for (const batch of plan.ambientBatches ?? []) {
    const resolved = roleForBatch(batch, descriptors);
    if (!resolved.role || !batch.instanceCount) continue;
    batches.push({
      ...batch,
      descriptor: resolved.descriptor,
      role: resolved.role,
      instanceCount: Math.max(0, Math.trunc(batch.instanceCount)),
    });
  }
  batches.sort((left, right) =>
    ROLE_ORDER[left.role] - ROLE_ORDER[right.role]
      || finite(left.priority) - finite(right.priority)
      || left.id.localeCompare(right.id));

  const authoredSetPieces = setPiecePlacements(plan, descriptors);
  const generatedWaterAccents = waterAccentPlacements(plan, qualityTier, descriptors);
  const setPieces = authoredSetPieces.slice(0, maximumInstances);
  const waterAccents = generatedWaterAccents.slice(
    0,
    Math.max(0, maximumInstances - setPieces.length),
  );
  const reserved = setPieces.length + waterAccents.length;
  const ambientTarget = Math.min(
    Math.max(0, maximumInstances - reserved),
    batches.reduce((sum, batch) => sum + batch.instanceCount, 0),
  );
  const quotas = allocateQuotas(batches, ambientTarget);
  const placements = [...setPieces];
  for (const quota of quotas) {
    const bounds = boundsFrom(quota);
    if (!bounds) continue;
    const batchSeed = hashString(quota.id);
    for (let ordinal = 0; ordinal < quota.count; ordinal++) {
      const seed = mixedUint32(batchSeed ^ Math.imul(ordinal + 1, 0x9e3779b1));
      const grid = gridPoint(bounds, ordinal, quota.count, seed);
      const biased = routeBiasedPoint(plan, quota.role, quota, bounds, seed);
      const point = biased ?? grid;
      const variation = seededUnit(seed, 0xc2b2ae35);
      const scale = roleScale(quota.role, quota.descriptor, variation);
      // One jungle instance represents a small canopy stand, not one isolated tree. Expanding only
      // its horizontal footprint turns the same bounded instance count into readable valley walls
      // while retaining authored tree height and every route-clearance placement decision.
      if (quota.role === "jungle") {
        scale.widthM *= 2.35;
        scale.depthM *= 2.15;
      }
      placements.push({
        id: `${quota.id}.${ordinal}`,
        role: quota.role,
        x: point.eastM,
        y: sampleCobraCanyonTerrain(plan, point.eastM, point.northM),
        z: -point.northM,
        yaw: point.yaw ?? seededUnit(seed, 0x27d4eb2f) * Math.PI * 2,
        variation,
        rank: (ordinal + 0.5) / Math.max(1, quota.count),
        batchId: quota.id,
        archetypeId: quota.descriptor?.id ?? null,
        paletteHex: quota.descriptor?.paletteHex ?? null,
        ...scale,
      });
    }
  }
  placements.push(...waterAccents);
  placements.sort((left, right) =>
    ROLE_ORDER[left.role] - ROLE_ORDER[right.role]
      || left.rank - right.rank
      || left.id.localeCompare(right.id));
  return {
    placements,
    batches,
    descriptors,
    setPieces,
    authoredSetPieces,
    waterAccents,
    generatedWaterAccents,
  };
}

function pushTriangle(positions, colors, a, b, c, color) {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let index = 0; index < 3; index++) colors.push(color[0], color[1], color[2]);
}

function appendBox(positions, colors, minimum, maximum, color) {
  const [x0, y0, z0] = minimum;
  const [x1, y1, z1] = maximum;
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5],
    [3, 7, 6], [3, 6, 2], [0, 1, 5], [0, 5, 4],
  ];
  for (const face of faces) {
    pushTriangle(positions, colors, corners[face[0]], corners[face[1]], corners[face[2]], color);
  }
}

function appendPyramid(positions, colors, center, radiusX, radiusZ, baseY, topY, color) {
  const corners = [
    [center[0] - radiusX, baseY, center[2] - radiusZ],
    [center[0] + radiusX, baseY, center[2] - radiusZ],
    [center[0] + radiusX, baseY, center[2] + radiusZ],
    [center[0] - radiusX, baseY, center[2] + radiusZ],
  ];
  const apex = [center[0], topY, center[2]];
  for (let index = 0; index < 4; index++) {
    pushTriangle(positions, colors, corners[index], corners[(index + 1) % 4], apex, color);
  }
  pushTriangle(positions, colors, corners[0], corners[2], corners[1], color);
  pushTriangle(positions, colors, corners[0], corners[3], corners[2], color);
}

function appendCanopy(
  positions,
  colors,
  x,
  z,
  radiusX,
  radiusZ,
  bottomY,
  topY,
  color,
  sides = 6,
) {
  const ring = [];
  const middleY = bottomY + (topY - bottomY) * 0.48;
  for (let index = 0; index < sides; index++) {
    const angle = index / sides * Math.PI * 2;
    ring.push([
      x + Math.cos(angle) * radiusX,
      middleY,
      z + Math.sin(angle) * radiusZ,
    ]);
  }
  const top = [x, topY, z];
  const bottom = [x, bottomY, z];
  for (let index = 0; index < sides; index++) {
    const next = (index + 1) % sides;
    pushTriangle(positions, colors, ring[index], ring[next], top, color);
    pushTriangle(positions, colors, ring[next], ring[index], bottom, color);
  }
}

function geometryFromSoup(THREE, name, positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function geometryForRole(THREE, role) {
  const positions = [];
  const colors = [];
  if (role === "jungle") {
    appendBox(positions, colors, [-0.045, 0, -0.045], [0.045, 0.46, 0.045], [0.30, 0.20, 0.10]);
    const lobes = [
      [0, 0, 0.34, 0.28, 1], [-0.42, 0.18, 0.3, 0.22, 0.82],
      [0.4, -0.22, 0.32, 0.24, 0.9], [0.16, 0.42, 0.28, 0.2, 0.76],
      [-0.2, -0.42, 0.27, 0.18, 0.72],
    ];
    for (const [x, z, radius, bottom, top] of lobes) {
      appendCanopy(
        positions,
        colors,
        x,
        z,
        radius,
        radius,
        bottom,
        top,
        [0.54, 0.78, 0.42],
      );
    }
  } else if (role === "plantation") {
    for (let index = 0; index < 5; index++) {
      const z = -0.4 + index * 0.2;
      appendBox(
        positions,
        colors,
        [-0.055, 0, z - 0.018],
        [0.055, 0.46, z + 0.018],
        [0.38, 0.24, 0.12],
      );
      appendCanopy(
        positions,
        colors,
        0,
        z,
        0.31,
        0.052,
        0.38,
        0.94,
        [0.58, 0.78, 0.38],
        4,
      );
    }
  } else if (role === "village") {
    const huts = [[-0.26, -0.22, 0.34], [0.25, 0.12, 0.3], [-0.12, 0.31, 0.25]];
    for (const [x, z, size] of huts) {
      appendBox(
        positions,
        colors,
        [x - size * 0.5, 0, z - size * 0.42],
        [x + size * 0.5, 0.55, z + size * 0.42],
        [0.66, 0.50, 0.30],
      );
      appendPyramid(positions, colors, [x, 0, z], size * 0.68, size * 0.58, 0.55, 0.86, [0.38, 0.25, 0.18]);
    }
  } else if (role === "paddy") {
    pushTriangle(positions, colors, [-0.45, 0.04, -0.45], [0.45, 0.04, 0.45], [0.45, 0.04, -0.45], [0.38, 0.62, 0.60]);
    pushTriangle(positions, colors, [-0.45, 0.04, -0.45], [-0.45, 0.04, 0.45], [0.45, 0.04, 0.45], [0.38, 0.62, 0.60]);
    appendBox(positions, colors, [-0.5, 0, -0.5], [-0.44, 0.18, 0.5], [0.50, 0.40, 0.22]);
    appendBox(positions, colors, [0.44, 0, -0.5], [0.5, 0.18, 0.5], [0.50, 0.40, 0.22]);
    appendBox(positions, colors, [-0.44, 0, -0.5], [0.44, 0.18, -0.44], [0.50, 0.40, 0.22]);
    appendBox(positions, colors, [-0.44, 0, 0.44], [0.44, 0.18, 0.5], [0.50, 0.40, 0.22]);
  } else if (role === "rock") {
    appendPyramid(positions, colors, [-0.28, 0, 0.08], 0.28, 0.3, 0, 0.72, [0.58, 0.52, 0.38]);
    appendPyramid(positions, colors, [0.16, 0, -0.1], 0.32, 0.28, 0, 1, [0.65, 0.59, 0.43]);
    appendPyramid(positions, colors, [0.4, 0, 0.22], 0.2, 0.22, 0, 0.58, [0.50, 0.46, 0.34]);
  } else if (role === "mist") {
    pushTriangle(positions, colors, [-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [0.82, 0.90, 0.86]);
    pushTriangle(positions, colors, [-0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0], [0.82, 0.90, 0.86]);
    pushTriangle(positions, colors, [0, 0, -0.5], [0, 0, 0.5], [0, 1, 0.5], [0.82, 0.90, 0.86]);
    pushTriangle(positions, colors, [0, 0, -0.5], [0, 1, 0.5], [0, 1, -0.5], [0.82, 0.90, 0.86]);
  } else {
    pushTriangle(positions, colors, [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [0.70, 0.88, 0.84]);
    pushTriangle(positions, colors, [-0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0.70, 0.88, 0.84]);
  }
  return geometryFromSoup(THREE, `COBRA_CANYON_ASSET_${role.toUpperCase()}_GEOMETRY`, positions, colors);
}

function materialForRole(THREE, role) {
  if (role === "mist" || role === "waterAccent") {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: role === "mist" ? 0.18 : 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.name = `COBRA_CANYON_ASSET_${role.toUpperCase()}_MATERIAL`;
    return material;
  }
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: role !== "paddy",
    side: THREE.FrontSide,
  });
  material.name = `COBRA_CANYON_ASSET_${role.toUpperCase()}_MATERIAL`;
  return material;
}

function paletteTint(paletteHex, variation) {
  if (!Array.isArray(paletteHex) || !paletteHex.length) return null;
  const index = Math.min(
    paletteHex.length - 1,
    Math.floor(clamp(variation, 0, 0.999_999) * paletteHex.length),
  );
  const match = /^#?([0-9a-f]{6})$/i.exec(String(paletteHex[index]));
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  const withinBand = variation * paletteHex.length - Math.floor(variation * paletteHex.length);
  const valueJitter = 0.88 + withinBand * 0.2;
  return [
    0.16 + ((value >> 16) & 0xff) / 255 * 0.92,
    0.16 + ((value >> 8) & 0xff) / 255 * 0.92,
    0.16 + (value & 0xff) / 255 * 0.92,
  ].map((channel) => clamp(channel * valueJitter, 0, 1));
}

function instanceTint(role, placement) {
  const authored = paletteTint(placement.paletteHex, placement.variation);
  if (authored) return authored;
  const shade = (placement.variation - 0.5) * 0.14;
  const adjusted = (values) => values.map((channel) => clamp(channel, 0, 1));
  if (role === "jungle") return adjusted([0.73 + shade, 0.92 + shade * 0.5, 0.68 + shade]);
  if (role === "plantation") return adjusted([0.78 + shade, 0.94 + shade * 0.4, 0.67 + shade]);
  if (role === "village") return adjusted([0.92 + shade, 0.86 + shade, 0.72 + shade]);
  if (role === "paddy") return adjusted([0.83 + shade, 0.92 + shade, 0.86 + shade]);
  if (role === "rock") return adjusted([0.90 + shade, 0.86 + shade, 0.74 + shade]);
  return [1, 1, 1];
}

function geometryTriangles(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0) / 3);
}

function tagObject(object, role, instanceCount = 0) {
  const structuralPresentation = STRUCTURAL_ROLES.has(role);
  object.userData.cobraCanyon = Object.freeze({
    schema: COBRA_CANYON_ASSET_KIT_SCHEMA,
    role,
    assetKit: true,
    ambient: role !== "assetKit" && !structuralPresentation,
    structuralPresentation,
    instances: instanceCount,
    ...PRESENTATION_ONLY_TAG,
  });
  object.castShadow = false;
  object.receiveShadow = role !== "mist" && role !== "waterAccent";
  object.matrixAutoUpdate = false;
  object.updateMatrix();
  return object;
}

function createRoleMesh(THREE, group, role, placements, resources) {
  if (!placements.length) return null;
  const geometry = geometryForRole(THREE, role);
  const material = materialForRole(THREE, role);
  const mesh = tagObject(
    new THREE.InstancedMesh(geometry, material, placements.length),
    role,
    placements.length,
  );
  mesh.name = `COBRA_CANYON_ASSET_${role.toUpperCase()}`;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const instanceColors = new Float32Array(placements.length * 3);
  for (let index = 0; index < placements.length; index++) {
    const placement = placements[index];
    position.set(placement.x, placement.y, placement.z);
    quaternion.setFromAxisAngle(yAxis, placement.yaw);
    scale.set(placement.widthM, placement.heightM, placement.depthM);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    const tint = instanceTint(role, placement);
    instanceColors[index * 3] = tint[0];
    instanceColors[index * 3 + 1] = tint[1];
    instanceColors[index * 3 + 2] = tint[2];
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  if (typeof mesh.computeBoundingSphere === "function") mesh.computeBoundingSphere();
  mesh.userData.cobraCanyonInstances = Object.freeze(placements.map((placement, instanceId) =>
    Object.freeze({
      instanceId,
      id: placement.id,
      batchId: placement.batchId,
      setPieceId: placement.setPieceId ?? null,
      archetypeId: placement.archetypeId ?? null,
      role,
    })));
  resources.geometries.add(geometry);
  resources.materials.add(material);
  resources.meshes.push(mesh);
  group.add(mesh);
  return Object.freeze({
    role,
    mesh,
    baseCount: placements.length,
    unitTriangles: geometryTriangles(geometry),
  });
}

function disposeResources(resources) {
  for (const mesh of resources.meshes) {
    mesh.count = 0;
    if (typeof mesh.dispose === "function") mesh.dispose();
    mesh.removeFromParent();
  }
  for (const geometry of resources.geometries) geometry.dispose();
  for (const material of resources.materials) material.dispose();
}

/**
 * Builds the deterministic, presentation-only Cobra Canyon visual vocabulary. The kit owns no
 * collision or target semantics; authored authority remains in the planner/simulation layers.
 */
export function createCobraCanyonAssetKit(THREE, plan, options = {}) {
  if (!THREE?.Group || !THREE?.InstancedMesh || !THREE?.BufferGeometry) {
    throw new TypeError("A complete Three.js namespace is required.");
  }
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("A Cobra Canyon world plan is required.");
  }
  const qualityTier = options.qualityTier ?? plan.qualityTier ?? "balanced";
  const maximumInstances = Math.max(0, Math.trunc(finite(options.maxInstances, 0)));
  const planned = planPlacements(plan, qualityTier, maximumInstances);
  const group = tagObject(new THREE.Group(), "assetKit", planned.placements.length);
  group.name = "COBRA_CANYON_ASSET_KIT_PRESENTATION_ONLY";
  group.userData.cobraCanyonAssetKit = Object.freeze({
    schema: COBRA_CANYON_ASSET_KIT_SCHEMA,
    qualityTier,
    sourceSchema: plan.presentationKit?.schema ?? null,
    ...PRESENTATION_ONLY_TAG,
  });
  const resources = { geometries: new Set(), materials: new Set(), meshes: [] };
  const controllers = [];
  const rolePlacements = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, []]));
  for (const placement of planned.placements) rolePlacements[placement.role].push(placement);
  for (const role of COBRA_CANYON_ASSET_ROLES) {
    const controller = createRoleMesh(THREE, group, role, rolePlacements[role], resources);
    if (controller) controllers.push(controller);
  }

  const batchSets = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, new Set()]));
  for (const batch of planned.batches) batchSets[batch.role].add(batch.id);
  const roleCountsRecord = {
    authoredAmbientBatches: plan.ambientBatches?.length ?? 0,
    authoredSetPieceCells: plan.setPieceCells?.length ?? 0,
    authoredAmbientArchetypes: planned.descriptors.descriptors.length,
    authoredLandmarkArchetypes: plan.presentationKit?.landmarkArchetypes?.length ?? 0,
    authoredSetPieceArchetypeReferences: (plan.setPieceCells ?? []).reduce(
      (sum, cell) => sum + (cell.archetypeIds?.length ?? 0),
      0,
    ),
    authoredSetPieceAssetReferences: planned.authoredSetPieces.length,
    renderedSetPieceAssetInstances: planned.setPieces.length,
    generatedWaterAccentInstances: planned.generatedWaterAccents.length,
    renderedWaterAccentInstances: planned.waterAccents.length,
    ambientBatchInstances:
      planned.placements.length - planned.setPieces.length - planned.waterAccents.length,
    renderBatches: controllers.length,
    assetInstances: planned.placements.length,
  };
  for (const role of COBRA_CANYON_ASSET_ROLES) {
    const roleController = controllers.find((controller) => controller.role === role);
    const setPieceCount = planned.setPieces.filter((placement) => placement.role === role).length;
    roleCountsRecord[`${role}AuthoredBatches`] = batchSets[role].size;
    roleCountsRecord[`${role}Batches`] = batchSets[role].size;
    roleCountsRecord[`${role}RenderBatches`] = roleController ? 1 : 0;
    roleCountsRecord[`${role}SetPieceInstances`] = setPieceCount;
    roleCountsRecord[`${role}Instances`] = rolePlacements[role].length;
  }
  const roleCounts = Object.freeze(roleCountsRecord);
  const builtDrawCalls = controllers.length;
  const builtInstances = controllers.reduce((sum, controller) => sum + controller.baseCount, 0);
  const builtTriangles = controllers.reduce(
    (sum, controller) => sum + controller.baseCount * controller.unitTriangles,
    0,
  );
  const builtMetrics = Object.freeze({
    drawCalls: builtDrawCalls,
    instances: builtInstances,
    triangles: builtTriangles,
  });

  const snapshots = Array.from({ length: 3 }, () => [null, null]);
  for (let level = 0; level <= 2; level++) {
    for (let nearIndex = 0; nearIndex <= 1; nearIndex++) {
      const nearRingVisible = nearIndex === 1;
      let drawCalls = 0;
      let instances = 0;
      let triangles = 0;
      for (const controller of controllers) {
        const survivesRing = nearRingVisible || STRUCTURAL_ROLES.has(controller.role);
        const count = survivesRing
          ? Math.ceil(controller.baseCount * COBRA_CANYON_AMBIENT_BUDGETS[level][controller.role])
          : 0;
        if (count > 0) drawCalls += 1;
        instances += count;
        triangles += count * controller.unitTriangles;
      }
      snapshots[level][nearIndex] = Object.freeze({
        schema: COBRA_CANYON_ASSET_KIT_SCHEMA,
        qualityTier,
        ambientBudgetLevel: level,
        nearRingVisible,
        drawCalls,
        instances,
        triangles,
        builtDrawCalls,
        builtInstances,
        builtTriangles,
        roleCounts,
        presentationOnly: true,
        authoritative: false,
        disposed: false,
      });
    }
  }
  const disposedDiagnostics = Object.freeze({
    ...snapshots[0][0],
    drawCalls: 0,
    instances: 0,
    triangles: 0,
    disposed: true,
  });
  let disposed = false;
  let ambientBudgetLevel = 0;
  let nearRingVisible = true;
  let currentDiagnostics = snapshots[0][1];

  function apply() {
    for (const controller of controllers) {
      const survivesRing = nearRingVisible || STRUCTURAL_ROLES.has(controller.role);
      controller.mesh.count = survivesRing
        ? Math.ceil(
          controller.baseCount
            * COBRA_CANYON_AMBIENT_BUDGETS[ambientBudgetLevel][controller.role],
        )
        : 0;
      controller.mesh.visible = controller.mesh.count > 0;
    }
    currentDiagnostics = snapshots[ambientBudgetLevel][nearRingVisible ? 1 : 0];
  }

  return Object.freeze({
    group,
    roleCounts,
    builtMetrics,
    diagnosticsFor(level = 0, near = true) {
      if (disposed) return disposedDiagnostics;
      const resolvedLevel = clamp(Math.trunc(finite(level)), 0, 2);
      return snapshots[resolvedLevel][near ? 1 : 0];
    },
    update(frame = {}) {
      if (disposed) return;
      ambientBudgetLevel = clamp(Math.trunc(finite(
        frame.ambientBudgetLevel ?? frame.budgetLevel,
        ambientBudgetLevel,
      )), 0, 2);
      nearRingVisible = frame.nearRingVisible !== false;
      apply();
    },
    diagnostics() {
      return currentDiagnostics;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      disposeResources(resources);
      group.clear();
      group.userData.cobraCanyonAssetKitDisposed = true;
      currentDiagnostics = disposedDiagnostics;
    },
  });
}
