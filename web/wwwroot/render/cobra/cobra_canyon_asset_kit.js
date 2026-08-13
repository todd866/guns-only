import { sampleCobraCanyonTerrain } from "./cobra_canyon_plan.js?v=321";
import {
  FOLIAGE_UV_PALM,
  FOLIAGE_UV_UNDERSTORY,
  createSyntheticFoliageAtlasTexture,
} from "./cobra_canyon_foliage.js?v=321";

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
    // Keep a thinned mist band — shedding to 0 killed gorge atmosphere the moment FPS dipped.
    mist: 0.55,
    waterAccent: 0.7,
  }),
  2: Object.freeze({
    jungle: 0.4,
    plantation: 0.5,
    village: 0.75,
    paddy: 0.35,
    rock: 0.8,
    mist: 0.28,
    waterAccent: 0.45,
  }),
});

/** Keep the Camp Ember rear-seat eye clear of green mass / mist (Build 302). */
export const CAMP_EMBER_LANDMARK_ID = "landmark.cobra-canyon.camp-ember.v1";
export const CAMP_EMBER_CLEAR_RADIUS_M = 120;

function campEmberPadCentre(plan) {
  const landmark = (plan?.landmarks ?? []).find((entry) => entry?.id === CAMP_EMBER_LANDMARK_ID);
  const point = landmark?.positionLocalM;
  if (!Array.isArray(point) || point.length < 3) return null;
  const eastM = Number(point[0]);
  const northM = Number(point[2]);
  if (!Number.isFinite(eastM) || !Number.isFinite(northM)) return null;
  return { eastM, northM };
}

function insideCampEmberClearEye(plan, role, eastM, northM) {
  if (role !== "jungle" && role !== "mist") return false;
  const pad = campEmberPadCentre(plan);
  if (!pad) return false;
  const dx = eastM - pad.eastM;
  const dz = northM - pad.northM;
  return dx * dx + dz * dz < CAMP_EMBER_CLEAR_RADIUS_M * CAMP_EMBER_CLEAR_RADIUS_M;
}

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
      widthM: read("width", 0, 78 + variation * 62),
      heightM: read("height", 1, 14 + variation * 12),
      depthM: read("depth", 2, 38 + variation * 40),
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
      : role === "jungle" ? 36
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

/** Terrain gradient magnitude at a point, from the same analytic field everything else reads. */
function terrainGradient(plan, eastM, northM) {
  const stepM = 40;
  const east = sampleCobraCanyonTerrain(plan, eastM + stepM, northM)
    - sampleCobraCanyonTerrain(plan, eastM - stepM, northM);
  const north = sampleCobraCanyonTerrain(plan, eastM, northM + stepM)
    - sampleCobraCanyonTerrain(plan, eastM, northM - stepM);
  return Math.hypot(east, north) / (2 * stepM);
}

/**
 * Scores a candidate point for a role against the ground it would stand on.
 *
 * Vegetation in this world used to be placed by seeded grid jitter alone, so canopy landed on
 * paddy flats and open ground landed on gorge walls with equal probability — which is most of
 * why the basin read as scattered dark cones on a lawn rather than jungle on slopes. Vietnam's
 * legibility comes from the CORRELATION: closed canopy on the valley sides, cleared and worked
 * ground on the flats, a treeline hugging the water. The scores below are that correlation, and
 * `bestPlacement` uses them to pick between a handful of seeded candidates — a bias, never a
 * hard filter, so no authored batch bound is silently emptied.
 */
function terrainAffinity(plan, role, eastM, northM) {
  const gradient = terrainGradient(plan, eastM, northM);
  if (role === "jungle") return clamp(gradient / 0.34, 0, 1) * 0.82 + 0.18;
  if (role === "paddy") return 1 - clamp(gradient / 0.09, 0, 1) * 0.94;
  if (role === "plantation" || role === "village") {
    return 1 - clamp(gradient / 0.16, 0, 1) * 0.88;
  }
  if (role === "rock") return clamp(gradient / 0.5, 0, 1);
  return 1;
}

/**
 * How far to sink an instance below the terrain sample at its centre.
 *
 * Placement deliberately seeks steep ground for canopy, and a footprint anchored at the centre
 * sample cantilevers off a gorge wall — the stand visibly floats in mid-air on the downhill side,
 * and a flat paddy panel becomes a plate hanging in space. Sinking by the drop across the
 * instance's own half-width buries the uphill edge instead, which is what vegetation on a hillside
 * actually looks like. Flat-ground roles get the same treatment for the cases where the affinity
 * search could not find level ground inside an authored batch bound.
 */
function seatDrop(plan, role, eastM, northM, scale) {
  const footprintM = Math.max(scale.widthM, scale.depthM) * 0.5;
  const gradient = terrainGradient(plan, eastM, northM);
  const bite = role === "jungle" || role === "rock" ? 1.12
    : role === "paddy" || role === "plantation" || role === "village" ? 1
      : 0;
  return gradient * footprintM * bite;
}

function bestPlacement(plan, role, candidates) {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const score = terrainAffinity(plan, role, candidate.eastM, candidate.northM);
    if (score <= bestScore) continue;
    bestScore = score;
    best = candidate;
  }
  return best ?? candidates.find(Boolean);
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
  const maximum = qualityTier === "mobile" ? 16 : qualityTier === "desktop" ? 30 : 24;
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
    // BANK SHEENS, NOT A DASHED CENTRELINE. Accents used to sit on the ribbon midline and read
    // as highway markings down the gorge. Offset toward alternating banks and keep them short
    // so the channel stays water, not a road.
    const tangentEastM = to[0] - from[0];
    const tangentNorthM = to[2] - from[2];
    const lengthM = Math.max(0.001, Math.hypot(tangentEastM, tangentNorthM));
    const normalEastM = -tangentNorthM / lengthM;
    const normalNorthM = tangentEastM / lengthM;
    const bankSide = index % 2 === 0 ? 1 : -1;
    const lateralM = river.halfWidthM * (0.52 + variation * 0.28) * bankSide;
    const accentEastM = eastM + normalEastM * lateralM;
    const accentNorthM = northM + normalNorthM * lateralM;
    placements.push({
      id: `water-accent.${index}`,
      role: "waterAccent",
      x: accentEastM,
      y: sampleCobraCanyonTerrain(plan, accentEastM, accentNorthM) + 0.35,
      z: -accentNorthM,
      yaw: Math.atan2(tangentEastM, tangentNorthM),
      widthM: Math.min(scale.widthM * 0.72, river.halfWidthM * 0.28),
      heightM: scale.heightM * 0.55,
      depthM: Math.min(scale.depthM * 1.4, river.halfWidthM * 0.55),
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
      // Jungle set-pieces need a CLUMP, not one lonely stand — BF Vietnam near-field is a wall
      // of trunks. One authored archetype expands into several offset instances.
      const standCount = role === "jungle" ? 3 : 1;
      for (let stand = 0; stand < standCount; stand++) {
        const seed = hashString(`${cell.id}:${archetypeId}:${stand}`);
        const variation = seededUnit(seed, 0x27d4eb2f);
        const scale = roleScale(role, descriptor, variation);
        if (role === "jungle") {
          const bulk = 1.2 + seededUnit(seed, 0x8f51a67b) * 0.7;
          scale.widthM *= bulk * 0.9;
          scale.depthM *= bulk * 0.9;
          scale.heightM *= 1.6 + seededUnit(seed, 0x39aa5c11) * 0.7;
        }
        const angle = seededUnit(seed, 0x85ebca6b) * Math.PI * 2;
        const ringM = stand === 0 ? 0 : 18 + stand * 14;
        const offsetM = index === 0
          ? ringM
          : Math.min(92, 16 + index * 13 + ringM);
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
        if (insideCampEmberClearEye(plan, role, eastM, northM)) continue;
        const nearest = nearestRoutePoint(plan, cell.routeId, eastM, northM);
        const routeAligned = role === "plantation" || role === "paddy";
        placements.push({
          id: `${cell.id}.${archetypeId}.${stand}`,
          role,
          x: eastM,
          y: sampleCobraCanyonTerrain(plan, eastM, northM)
            - seatDrop(plan, role, eastM, northM, scale),
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
      // CLUSTERS, NOT A SCATTER. Every third instance is drawn tight to its predecessor's seed
      // cell instead of its own, so stands grow into each other and leave real clearings between
      // them. An even scatter at any density reads as texture; clumping is what reads as jungle.
      const clusterSeed = mixedUint32(batchSeed ^ Math.imul(Math.floor(ordinal / 3) + 1, 0x9e3779b1));
      const clustered = seededUnit(seed, 0x51633e2d) < 0.62
        ? (() => {
          const anchor = routeBiasedPoint(plan, quota.role, quota, bounds, clusterSeed)
            ?? gridPoint(bounds, Math.floor(ordinal / 3) * 3, quota.count, clusterSeed);
          const spreadM = quota.role === "jungle" ? 190 : 120;
          return {
            eastM: clamp(
              anchor.eastM + (seededUnit(seed, 0x7f4a7c15) - 0.5) * spreadM,
              bounds.minimumEastM,
              bounds.maximumEastM,
            ),
            northM: clamp(
              anchor.northM + (seededUnit(seed, 0x2545f491) - 0.5) * spreadM,
              bounds.minimumNorthM,
              bounds.maximumNorthM,
            ),
            yaw: anchor.yaw,
          };
        })()
        : null;
      const point = bestPlacement(plan, quota.role, [biased ?? grid, clustered, grid]);
      if (insideCampEmberClearEye(plan, quota.role, point.eastM, point.northM)) continue;
      const variation = seededUnit(seed, 0xc2b2ae35);
      const scale = roleScale(quota.role, quota.descriptor, variation);
      // One jungle instance represents a stand of canopy, not one isolated tree. Expanding its
      // horizontal footprint turns a bounded instance count into readable valley walls while
      // retaining authored tree height and every route-clearance placement decision. The spread
      // is now per-instance rather than a flat multiplier: a stand of uniform size at uniform
      // spacing is the tell that gave the old canopy its wallpaper look.
      if (quota.role === "jungle") {
        // Palm clumps need vertical presence more than pancake footprint.
        const bulk = 1.15 + seededUnit(seed, 0x8f51a67b) * 0.65;
        scale.widthM *= bulk * 0.85;
        scale.depthM *= bulk * 0.85;
        scale.heightM *= 1.55 + seededUnit(seed, 0x39aa5c11) * 0.65;
      }
      // BED THE STAND INTO THE SLOPE. Placement deliberately seeks steep ground, and a 50 m
      // footprint anchored at the centre sample cantilevers off a gorge wall — the stand visibly
      // floats in mid-air on the downhill side. Sinking it by the drop across its own half-width
      // buries the uphill skirt instead, which is what a canopy on a hillside actually looks like.
      const seatDropM = seatDrop(plan, quota.role, point.eastM, point.northM, scale);
      placements.push({
        id: `${quota.id}.${ordinal}`,
        role: quota.role,
        x: point.eastM,
        y: sampleCobraCanyonTerrain(plan, point.eastM, point.northM) - seatDropM,
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

function pushTriangle(positions, colors, a, b, c, color, uvs = null, ua = null, ub = null, uc = null) {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let index = 0; index < 3; index++) colors.push(color[0], color[1], color[2]);
  if (uvs && ua && ub && uc) {
    uvs.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }
}

/** One double-sided billboard quad (two tris) with atlas UVs. */
function pushTexturedQuad(positions, colors, uvs, bl, br, tr, tl, color, region) {
  const uvBl = [region.u0, region.v0];
  const uvBr = [region.u1, region.v0];
  const uvTr = [region.u1, region.v1];
  const uvTl = [region.u0, region.v1];
  pushTriangle(positions, colors, bl, br, tr, color, uvs, uvBl, uvBr, uvTr);
  pushTriangle(positions, colors, bl, tr, tl, color, uvs, uvBl, uvTr, uvTl);
}

/**
 * Two crossed cards (four tris) — the BF:V near-tree read without Lambert lobe soup.
 * yawRad rotates the pair in the XZ plane around the card centre.
 */
function appendCrossedFoliageCard(
  positions,
  colors,
  uvs,
  x,
  z,
  halfWidth,
  bottomY,
  topY,
  color,
  region,
  yawRad = 0,
) {
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  const offset = (ox, oz) => [x + ox * cos - oz * sin, z + ox * sin + oz * cos];
  const [x0, z0] = offset(-halfWidth, 0);
  const [x1, z1] = offset(halfWidth, 0);
  pushTexturedQuad(
    positions,
    colors,
    uvs,
    [x0, bottomY, z0],
    [x1, bottomY, z1],
    [x1, topY, z1],
    [x0, topY, z0],
    color,
    region,
  );
  const [x2, z2] = offset(0, -halfWidth);
  const [x3, z3] = offset(0, halfWidth);
  pushTexturedQuad(
    positions,
    colors,
    uvs,
    [x2, bottomY, z2],
    [x3, bottomY, z3],
    [x3, topY, z3],
    [x2, topY, z2],
    color,
    region,
  );
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

function geometryFromSoup(THREE, name, positions, colors, uvs = null) {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (uvs?.length) {
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function appendPalm(positions, colors, x, z, scale, trunkTint, leafTint) {
  const trunkW = 0.026 * scale;
  const trunkH = 0.62 * scale;
  appendBox(
    positions,
    colors,
    [x - trunkW, 0, z - trunkW],
    [x + trunkW, trunkH, z + trunkW],
    trunkTint,
  );
  // Fat crown mass (BF Vietnam reads volume first, frond detail second).
  appendCanopy(
    positions,
    colors,
    x,
    z,
    0.38 * scale,
    0.36 * scale,
    trunkH * 0.66,
    trunkH * 1.0,
    leafTint,
    4,
  );
  // Three drooping frond blades — silhouette spikes without the 6-tri pyramid tax.
  for (let index = 0; index < 3; index++) {
    const angle = index / 3 * Math.PI * 2 + 0.28;
    const reach = 0.50 * scale;
    const tipX = x + Math.cos(angle) * reach;
    const tipZ = z + Math.sin(angle) * reach;
    const tipY = trunkH * 0.50;
    const hingeY = trunkH * 0.86;
    const side = 0.09 * scale;
    pushTriangle(
      positions,
      colors,
      [x + Math.cos(angle + 0.4) * side, hingeY, z + Math.sin(angle + 0.4) * side],
      [x + Math.cos(angle - 0.4) * side, hingeY, z + Math.sin(angle - 0.4) * side],
      [tipX, tipY, tipZ],
      leafTint.map((c) => c * 0.9),
    );
  }
}

function geometryForRole(THREE, role) {
  const positions = [];
  const colors = [];
  const uvs = role === "jungle" ? [] : null;
  if (role === "jungle") {
    // ONE INSTANCE = two CC0 palm cards (crossed quads) + understory fern cards.
    // Textured alpha cutouts beat Lambert lobes for BF:V legibility and cost ~12 tris.
    const leafTint = [0.92, 0.98, 0.88];
    const underTint = [0.78, 0.92, 0.72];
    appendCrossedFoliageCard(
      positions, colors, uvs, 0.02, -0.02, 0.42, 0.0, 1.0, leafTint, FOLIAGE_UV_PALM, 0.12,
    );
    appendCrossedFoliageCard(
      positions, colors, uvs, -0.28, 0.18, 0.34, 0.0, 0.86, leafTint, FOLIAGE_UV_PALM, 0.71,
    );
    appendCrossedFoliageCard(
      positions, colors, uvs, 0.18, 0.22, 0.28, 0.0, 0.38, underTint, FOLIAGE_UV_UNDERSTORY, 0.35,
    );
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
    // Softer stacked mounds — the old three-pyramid cluster read as crystal shards at nap AGL.
    appendPyramid(positions, colors, [-0.22, 0, 0.06], 0.34, 0.36, 0, 0.58, [0.56, 0.50, 0.36]);
    appendPyramid(positions, colors, [0.14, 0, -0.08], 0.38, 0.34, 0, 0.78, [0.62, 0.56, 0.40]);
    appendPyramid(positions, colors, [0.32, 0, 0.18], 0.24, 0.26, 0, 0.48, [0.48, 0.44, 0.32]);
    appendPyramid(positions, colors, [-0.06, 0, -0.24], 0.22, 0.24, 0, 0.42, [0.54, 0.48, 0.34]);
  } else if (role === "mist") {
    pushTriangle(positions, colors, [-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [0.82, 0.90, 0.86]);
    pushTriangle(positions, colors, [-0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0], [0.82, 0.90, 0.86]);
    pushTriangle(positions, colors, [0, 0, -0.5], [0, 0, 0.5], [0, 1, 0.5], [0.82, 0.90, 0.86]);
    pushTriangle(positions, colors, [0, 0, -0.5], [0, 1, 0.5], [0, 1, -0.5], [0.82, 0.90, 0.86]);
  } else if (role === "waterAccent") {
    // Soft bank sheen: a low elongated diamond parallel to the current, not a bright centreline tile.
    pushTriangle(positions, colors, [-0.5, 0.02, 0], [0.5, 0.02, 0], [0, 0.02, 0.22], [0.72, 0.84, 0.80]);
    pushTriangle(positions, colors, [-0.5, 0.02, 0], [0, 0.02, -0.22], [0.5, 0.02, 0], [0.68, 0.80, 0.76]);
  } else {
    pushTriangle(positions, colors, [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [0.70, 0.88, 0.84]);
    pushTriangle(positions, colors, [-0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0.70, 0.88, 0.84]);
  }
  return geometryFromSoup(
    THREE,
    `COBRA_CANYON_ASSET_${role.toUpperCase()}_GEOMETRY`,
    positions,
    colors,
    uvs,
  );
}

function materialForRole(THREE, role, foliageAtlas = null) {
  if (role === "mist" || role === "waterAccent") {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: role === "mist" ? 0.42 : 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.name = `COBRA_CANYON_ASSET_${role.toUpperCase()}_MATERIAL`;
    return material;
  }
  if (role === "jungle") {
    // Unlit alpha cards — Lambert was crushing the CC0 atlas to black silhouettes under gorge light.
    const material = new THREE.MeshBasicMaterial({
      map: foliageAtlas,
      color: 0xffffff,
      vertexColors: true,
      alphaTest: 0.48,
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    material.name = "COBRA_CANYON_ASSET_JUNGLE_MATERIAL";
    return material;
  }
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    // Smooth normals on organic mass (plantation/rock/village) kill crystal-shard facets.
    flatShading: role !== "paddy" && role !== "plantation"
      && role !== "rock" && role !== "village",
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
  // Render-architecture stage 0: the scenery that has vertical mass casts. A tree that lays a
  // shadow on the ground is standing IN the world; the same tree with no shadow is a decal on it,
  // and that is most of what "chopper graphics are terrible" was pointing at.
  //
  // `mist` and `waterAccent` are excluded in both directions — one is a translucent volume whose
  // depth write would print a hard-edged rectangle into the shadow map, the other is a flat
  // surface decal at water level. `paddy` is a flat field for the same reason it does not receive
  // well: it has no height to cast with. Casting is per-batch, not per-instance: an InstancedMesh
  // is one shadow submission, which is why the world's `maxShadowCasters` tier budget is spent on
  // deciding WHICH batches cast rather than how many trees.
  object.castShadow = role === "jungle" || role === "plantation"
    || role === "village" || role === "rock";
  object.receiveShadow = role !== "mist" && role !== "waterAccent";
  object.matrixAutoUpdate = false;
  object.updateMatrix();
  return object;
}

/**
 * One authored palm replaces a CARD CLUMP, not a card. The clump dimensions describe several
 * notional trees, so a single mesh inheriting them stands many times too tall.
 */
const AUTHORED_MESH_CLUMP_SCALE = 0.42;

/**
 * Material for authored glTF geometry. Unlike the crossed cards this has real volume and real
 * normals, so it wants lighting — and it must NOT receive the card atlas, whose UV layout has
 * nothing to do with the mesh's own.
 */
function authoredMeshMaterial(THREE, role) {
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  material.name = `COBRA_CANYON_ASSET_${role.toUpperCase()}_AUTHORED_MATERIAL`;
  return material;
}

function createRoleMesh(
  THREE, group, role, placements, resources, foliageAtlas = null,
  authoredGeometry = null, nameSuffix = "",
) {
  if (!placements.length) return null;
  // An authored CC0 mesh wins over the procedural cards when one is supplied for this batch.
  // The cards stay as the declared fallback (asset-manifest.json), so a failed asset load
  // costs detail, never the scene.
  const geometry = authoredGeometry ?? geometryForRole(THREE, role);
  // An authored mesh carries its OWN UVs. Handing it the foliage card atlas makes it sample
  // arbitrary regions of an unrelated texture, and with alphaTest 0.48 that punches holes clean
  // through the trunk and fronds — which is why the CC0 palms rendered as black spiky scraps
  // instead of trees. Authored geometry gets a lit, vertex-coloured material and no atlas.
  const material = authoredGeometry
    ? authoredMeshMaterial(THREE, role)
    : materialForRole(THREE, role, foliageAtlas);
  const mesh = tagObject(
    new THREE.InstancedMesh(geometry, material, placements.length),
    role,
    placements.length,
  );
  mesh.name = `COBRA_CANYON_ASSET_${role.toUpperCase()}${nameSuffix}`;
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
    // Card placements size a whole CLUMP — several notional trees on crossed quads. One
    // authored palm standing at that size is a sixty-metre plant, which is what filled a third
    // of the frame in the owner's Build 321 capture. Bring a real mesh back to single-tree
    // scale; the field cards keep the clump size they were authored for.
    if (authoredGeometry) {
      scale.set(
        placement.widthM * AUTHORED_MESH_CLUMP_SCALE,
        placement.heightM * AUTHORED_MESH_CLUMP_SCALE,
        placement.depthM * AUTHORED_MESH_CLUMP_SCALE,
      );
    } else {
      scale.set(placement.widthM, placement.heightM, placement.depthM);
    }
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
  for (const texture of resources.textures ?? []) texture.dispose();
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
  const resources = { geometries: new Set(), materials: new Set(), meshes: [], textures: [] };
  // CC0 atlas when the shell preloads it; synthetic fallback keeps the alpha-card path in tests.
  let foliageAtlas = options.foliageTextures?.atlas ?? null;
  if (!foliageAtlas) {
    foliageAtlas = createSyntheticFoliageAtlasTexture(THREE);
    resources.textures.push(foliageAtlas);
  }
  const controllers = [];
  const rolePlacements = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, []]));
  for (const placement of planned.placements) rolePlacements[placement.role].push(placement);
  // An authored palm is ~470 triangles against a card's dozen, so it cannot go on every
  // placement: the whole jungle would cost millions of triangles and the tier budget throws.
  // Spend a fixed triangle allowance on real palms and keep cards for the rest. The heroes are
  // taken at a fixed stride so they scatter across the whole valley instead of clustering —
  // real geometry everywhere, at whatever density the budget affords.
  const authoredTriangleBudget = Math.max(0, Math.trunc(finite(options.authoredTriangleBudget, 0)));
  const heroSplits = new Map();
  for (const role of COBRA_CANYON_ASSET_ROLES) {
    const authored = options.roleGeometries?.[role] ?? null;
    const placements = rolePlacements[role];
    if (!authored || !placements.length || authoredTriangleBudget <= 0) continue;
    const unitTriangles = Math.max(1, Math.trunc(authored.attributes.position.count / 3));
    const affordable = Math.min(
      placements.length,
      Math.trunc(authoredTriangleBudget / unitTriangles),
    );
    if (affordable <= 0) continue;
    const stride = Math.max(1, Math.floor(placements.length / affordable));
    const hero = [];
    const field = [];
    for (let index = 0; index < placements.length; index++) {
      if (index % stride === 0 && hero.length < affordable) hero.push(placements[index]);
      else field.push(placements[index]);
    }
    heroSplits.set(role, { authored, hero, field });
  }

  for (const role of COBRA_CANYON_ASSET_ROLES) {
    const atlas = role === "jungle" ? foliageAtlas : null;
    const split = heroSplits.get(role);
    if (split) {
      const heroController = createRoleMesh(
        THREE, group, role, split.hero, resources, atlas, split.authored, "_HERO",
      );
      if (heroController) controllers.push(heroController);
      const fieldController = createRoleMesh(
        THREE, group, role, split.field, resources, atlas, null, "",
      );
      if (fieldController) controllers.push(fieldController);
      continue;
    }
    const controller = createRoleMesh(THREE, group, role, rolePlacements[role], resources, atlas);
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
    // A role with an authored mesh renders as TWO batches (hero geometry + card field), so
    // count them rather than asking whether one exists.
    const roleControllers = controllers.filter((controller) => controller.role === role);
    const setPieceCount = planned.setPieces.filter((placement) => placement.role === role).length;
    roleCountsRecord[`${role}AuthoredBatches`] = batchSets[role].size;
    roleCountsRecord[`${role}Batches`] = batchSets[role].size;
    roleCountsRecord[`${role}RenderBatches`] = roleControllers.length;
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
