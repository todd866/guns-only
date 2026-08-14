import { sampleCobraCanyonTerrain } from "./cobra_canyon_plan.js?v=327";
import {
  FOLIAGE_UV_PALM,
  FOLIAGE_UV_UNDERSTORY,
  createCobraSoftFalloffTexture,
  createSyntheticFoliageAtlasTexture,
} from "./cobra_canyon_foliage.js?v=327";

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

/**
 * NEAR-FIELD SCATTER — the architectural fix for "the scenery is holistically bad".
 *
 * The kit used to place its whole instance allowance ONCE, spread across the authored batch
 * bounds, which span the full 16 x 16 km theatre. On desktop that is 6,828 ambient instances over
 * 256 km²: twenty-seven props per km², one every 190 m. No amount of colour, material or prop
 * sizing can make that read as cover, because at that spacing there is nothing between the props
 * to see. Every previous pass moved numbers and not the picture for exactly this reason.
 *
 * The same budget spent inside a radius around the aircraft is a different world. Desktop's 8,885
 * ambient instances inside a 1.4 km disc is ~1,440 per km² — one prop every 26 m, against canopy
 * clumps 13-40 m across — which is continuous cover to the mid-ground. Past the radius the terrain
 * shader and the haze carry the picture, which is what every open-world renderer does.
 *
 * The scatter is a pure function of world position, never of an instance index: a tile of the
 * world always generates the same props at the same places, so flying a circuit re-enters the
 * scene it left. What the camera changes is only WHICH tiles are resident.
 */
export const COBRA_CANYON_SCATTER_TILE_M = 160;

/**
 * Nominal near-field radius per tier. Density is `maxAssetInstances / (pi * radius^2)`, so this is
 * the one knob that trades reach against thickness. Shrink it for more cover; never raise the cap.
 */
export const COBRA_CANYON_SCATTER_RADIUS_M = Object.freeze({
  mobile: 340,
  balanced: 900,
  desktop: 1_400,
});

/**
 * A role whose local mix is thinner than its capacity share keeps walking outward until it fills.
 * The cap stops a role that simply is not present nearby (river mist on a dry ridge) from paying
 * for a search across the whole theatre.
 */
const SCATTER_MAXIMUM_RADIUS_MULTIPLE = 1.6;

/** Instances inside this fraction of a role's achieved radius are at full size. */
const SCATTER_FULL_SCALE_FRACTION = 0.78;

/** Camera travel that re-collects the resident set. Well under the fade band width. */
const SCATTER_REBUILD_STEP_M = 48;

/** Uncached tiles generated per update, so a fast transit costs several small frames, not one big one. */
const SCATTER_TILE_BUILDS_PER_UPDATE = 4;

/** Generated tile placements retained; a tile is ~40 placements, so this is a few thousand props. */
const SCATTER_TILE_CACHE_LIMIT = 12_000;

/** How far outside a ribbon's own half-width a batch still counts as "on the verge". */
const ROUTE_CAPTURE_MARGIN_M = 260;

const EMPTY_LIST = Object.freeze([]);

/**
 * How far each role's capacity leans toward its PEAK local mix rather than its mean. Zero spends
 * the whole allowance the way the average square metre of valley wants it — which starves any
 * role that only exists somewhere small. One would size every role for its best square metre and
 * leave most of the allowance idle everywhere else.
 */
const SCATTER_PEAK_MIX_WEIGHT = 0.15;

/** Fraction of a tile's instances that share a clump anchor — clearings come from clumping. */
const SCATTER_CLUMP_SIZE = 5;

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

/**
 * Which ribbon kind a batch wants to hug. The old world-wide scatter reached this through
 * `routeCandidates`, which fell back to "any ribbon" for the roles with no declared affinity and
 * therefore biased highland canopy toward whichever route the seed happened to draw. The
 * near-field scatter answers the same question locally — is there a river/road/ridge close to
 * THIS tile — so a batch with no route relationship simply gets none.
 */
function batchRouteKind(role, kind) {
  const text = token(kind);
  if (role === "mist" || text.includes("riparian")) return "river";
  if (role === "plantation" || role === "paddy" || role === "village") return "road";
  if (role === "rock" || text.includes("bamboo")) return "ridge";
  if (text.includes("verge") || text.includes("road")) return "road";
  return null;
}

/** Lateral standoff from a ribbon centreline, unchanged from the world-fixed placer. */
function routeClearanceM(role, kind) {
  if (role === "mist") return 0;
  if (role === "paddy") return 34;
  if (role === "plantation") return 42;
  if (role === "village") return 48;
  if (role === "rock") return 72;
  if (token(kind).includes("riparian")) return 68;
  return 65;
}

function routeSpreadM(role) {
  if (role === "mist") return 55;
  if (role === "paddy") return 80;
  if (role === "plantation") return 58;
  if (role === "village") return 82;
  if (role === "rock") return 120;
  return 88;
}

function nearestPointOnRibbon(ribbon, eastM, northM) {
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
        ((eastM - from[0]) * deltaEastM + (northM - from[2]) * deltaNorthM) / lengthSquared,
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
      halfWidthM: finite(ribbon.halfWidthM, 0),
    };
  }
  return nearest;
}

/**
 * Pulls a candidate point onto the verge of the nearest ribbon of the wanted kind, keeping its
 * position ALONG the route where the tile put it. The world-fixed placer picked a random point on
 * a random route; here the route is whatever runs past this tile, which is what makes a verge read
 * as a verge from the cockpit instead of as a line of props somewhere else in the valley.
 */
function routeVergePoint(context, entry, eastM, northM, seed) {
  if (!entry.routeKind) return null;
  const ribbons = context.ribbonsByKind.get(entry.routeKind);
  if (!ribbons?.length) return null;
  let nearest = null;
  for (const ribbon of ribbons) {
    const candidate = nearestPointOnRibbon(ribbon, eastM, northM);
    if (!candidate) continue;
    if (!nearest || candidate.distanceM < nearest.distanceM) nearest = candidate;
  }
  if (!nearest) return null;
  const captureM = nearest.halfWidthM + ROUTE_CAPTURE_MARGIN_M;
  if (nearest.distanceM > captureM) return null;
  const tangentLengthM = Math.max(
    0.001,
    Math.hypot(nearest.tangentEastM, nearest.tangentNorthM),
  );
  const side = nearest.distanceM > 0.001
    ? Math.sign(
      nearest.offsetEastM * -nearest.tangentNorthM + nearest.offsetNorthM * nearest.tangentEastM,
    ) || 1
    : (seededUnit(seed, 0x1b56c4e9) < 0.5 ? -1 : 1);
  const lateralM = side
    * (routeClearanceM(entry.role, entry.kind)
      + seededUnit(seed, 0x85ebca6b) * routeSpreadM(entry.role));
  return {
    eastM: nearest.eastM - nearest.tangentNorthM / tangentLengthM * lateralM,
    northM: nearest.northM + nearest.tangentEastM / tangentLengthM * lateralM,
    yaw: Math.atan2(nearest.tangentEastM, nearest.tangentNorthM),
  };
}

/**
 * Understory is grass, verge clutter and low scrub — knee-to-head height, not canopy. The
 * authored descriptor id carries the distinction (`jungle-understory` vs `jungle-canopy`); this
 * is the only thing that reads it.
 */
function isVillageClutter(descriptor) {
  const id = String(descriptor?.id ?? descriptor?.descriptorId ?? "");
  return id.includes("hut") || id.includes("clutter");
}

function isJungleUnderstory(descriptor) {
  const id = String(descriptor?.id ?? descriptor?.descriptorId ?? "");
  return id.includes("understory");
}

/** Test seam for the role/descriptor size bands. Not used by the renderer. */
export function cobraCanyonAssetRoleScaleForTests(role, descriptor, variation) {
  return roleScale(role, descriptor, variation);
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
    // Canopy and understory are the SAME role but not the same plant. Five cell kinds map to
    // "jungle" — riparian canopy, highland canopy, bamboo-and-scrub, road-verge clutter and
    // ridge GRASS — and this function branched only on role, so every one of them took the
    // canopy band. Neither the world cells nor the procedural archetypes declare a scaleM, so
    // nothing downstream corrected it: ridge grass was drawn as a 16-30 m clump, roughly twenty
    // times life size, which is why the frame filled with grass blades taller than the aircraft
    // was flying. The descriptor already knew — `jungle-understory` vs `jungle-canopy` — it was
    // simply never consulted.
    if (isJungleUnderstory(descriptor)) {
      return {
        widthM: read("width", 0, 3.5 + variation * 3),
        heightM: read("height", 1, 1.1 + variation * 2.6),
        depthM: read("depth", 2, 3.5 + variation * 3),
      };
    }
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
    // Same split as jungle. `village-compounds` is a whole compound and 32 m across is right;
    // `village-clutter` is the `fence-cart-cluster` archetype — fences and carts — and was
    // taking the compound band, so a handcart was drawn 32 m wide and 10 m tall.
    if (isVillageClutter(descriptor)) {
      return {
        widthM: read("width", 0, 4.5 + variation * 4),
        heightM: read("height", 1, 2.4 + variation * 2.4),
        depthM: read("depth", 2, 4.5 + variation * 4),
      };
    }
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
    // Boulder scatter, not cliffs. The only cell kind that reaches this role is `quarry-scrub`
    // — archetype `red-earth-scrub`, i.e. low bushes on red soil — and it was being drawn
    // 18-36 m across and 20-62 m TALL. Even read as its `rock-scatter` descriptor rather than
    // as the vegetation its name and archetype both describe, a 62 m boulder is a cliff.
    // NOTE: the kind, the archetype and the descriptor disagree about whether this is rock or
    // scrub. Sizing it as scatter is the conservative fix; deciding what it IS needs the owner.
    return {
      widthM: read("width", 0, 3 + variation * 6),
      heightM: read("height", 1, 2.5 + variation * 6),
      depthM: read("depth", 2, 3 + variation * 6),
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

const GRADIENT_STEP_M = 40;

/**
 * Terrain gradient magnitude at a point, from the same analytic field everything else reads.
 *
 * Memoised on a `GRADIENT_STEP_M` lattice. The near-field scatter asks for this once per candidate
 * per instance — twelve terrain samples per prop against a 3 microsecond sampler — and neighbours
 * inside a tile land on the same lattice node repeatedly. The lattice is a property of the world,
 * not of the camera, so the memo never makes placement depend on visit order.
 */
function terrainGradient(plan, eastM, northM, memo = null) {
  const nodeEastM = Math.round(eastM / GRADIENT_STEP_M) * GRADIENT_STEP_M;
  const nodeNorthM = Math.round(northM / GRADIENT_STEP_M) * GRADIENT_STEP_M;
  const key = memo ? `${nodeEastM},${nodeNorthM}` : null;
  if (memo) {
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
  }
  const east = sampleCobraCanyonTerrain(plan, nodeEastM + GRADIENT_STEP_M, nodeNorthM)
    - sampleCobraCanyonTerrain(plan, nodeEastM - GRADIENT_STEP_M, nodeNorthM);
  const north = sampleCobraCanyonTerrain(plan, nodeEastM, nodeNorthM + GRADIENT_STEP_M)
    - sampleCobraCanyonTerrain(plan, nodeEastM, nodeNorthM - GRADIENT_STEP_M);
  const gradient = Math.hypot(east, north) / (2 * GRADIENT_STEP_M);
  if (memo) {
    if (memo.size > 32_000) memo.clear();
    memo.set(key, gradient);
  }
  return gradient;
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
function terrainAffinity(plan, role, eastM, northM, memo = null) {
  const gradient = terrainGradient(plan, eastM, northM, memo);
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
function seatDrop(plan, role, eastM, northM, scale, memo = null) {
  const footprintM = Math.max(scale.widthM, scale.depthM) * 0.5;
  const gradient = terrainGradient(plan, eastM, northM, memo);
  const bite = role === "jungle" || role === "rock" ? 1.12
    : role === "paddy" || role === "plantation" || role === "village" ? 1
      : 0;
  // Never sink an instance deeper than its own footprint drop: the gradient is read off a 40 m
  // lattice, and on a knife ridge the lattice value can exceed the slope under the prop itself.
  return Math.min(gradient * bite, 1) * footprintM;
}

function bestPlacement(plan, role, candidates, memo = null) {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const score = terrainAffinity(plan, role, candidate.eastM, candidate.northM, memo);
    if (score <= bestScore) continue;
    bestScore = score;
    best = candidate;
  }
  return best ?? candidates.find(Boolean);
}

/**
 * Largest-remainder split of `target` across weighted entries. Deterministic: ties break on id.
 */
function allocateByWeight(entries, target) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (target <= 0 || total <= 0) return entries.map((entry) => ({ entry, count: 0 }));
  const quotas = entries.map((entry) => {
    const exact = entry.weight * target / total;
    const count = Math.floor(exact);
    return { entry, count, remainder: exact - count };
  });
  let assigned = quotas.reduce((sum, quota) => sum + quota.count, 0);
  const order = [...quotas].sort((left, right) =>
    right.remainder - left.remainder
      || left.entry.id.localeCompare(right.entry.id));
  for (let index = 0; assigned < target && order.length; index++, assigned++) {
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

function insideBounds(bounds, eastM, northM) {
  return eastM >= bounds.minimumEastM && eastM <= bounds.maximumEastM
    && northM >= bounds.minimumNorthM && northM <= bounds.maximumNorthM;
}

function scatterEntries(plan, descriptors) {
  const entries = [];
  for (const batch of plan.ambientBatches ?? []) {
    const resolved = roleForBatch(batch, descriptors);
    if (!resolved.role || !batch.instanceCount) continue;
    const bounds = boundsFrom(batch);
    if (!bounds) continue;
    const areaM2 = Math.max(
      1,
      (bounds.maximumEastM - bounds.minimumEastM) * (bounds.maximumNorthM - bounds.minimumNorthM),
    );
    const instanceCount = Math.max(0, Math.trunc(batch.instanceCount));
    entries.push({
      id: String(batch.id),
      kind: batch.kind,
      role: resolved.role,
      descriptor: resolved.descriptor,
      bounds,
      instanceCount,
      // An authored batch says "N of these over this box". The number was written for a
      // world-wide one-shot scatter and is meaningless as an absolute now, but N/area still
      // carries the authored intent that survives the change: the LOCAL MIX a pilot should see
      // standing at any point in the valley. Absolute density is the budget's business.
      weight: instanceCount / areaM2,
      routeKind: batchRouteKind(resolved.role, batch.kind),
      seed: hashString(String(batch.id)),
      priority: finite(batch.priority),
    });
  }
  entries.sort((left, right) =>
    ROLE_ORDER[left.role] - ROLE_ORDER[right.role]
      || left.priority - right.priority
      || left.id.localeCompare(right.id));
  return entries;
}

/**
 * Per-role slice of the near-field allowance.
 *
 * An InstancedMesh has to be allocated once, so each role needs a fixed capacity, and the sum of
 * those capacities is what the tier budget check measures. The split is the world-mean local mix:
 * probe the valley on a coarse lattice, ask each probe which batches cover it and in what
 * proportion, and average. A role that is locally thinner than its share simply reaches further
 * out to fill; a role that is locally thicker fills up nearer. Nobody's allowance is stranded.
 */
function roleScatterCapacities(plan, entries, ambientBudget) {
  const capacities = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, 0]));
  if (ambientBudget <= 0 || !entries.length) return capacities;
  const bounds = plan.boundsLocalM;
  const probeM = 400;
  const mix = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, 0]));
  const peak = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, 0]));
  const local = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, 0]));
  let probes = 0;
  for (let eastM = bounds.minimumEastM; eastM <= bounds.maximumEastM; eastM += probeM) {
    for (let northM = bounds.minimumNorthM; northM <= bounds.maximumNorthM; northM += probeM) {
      let total = 0;
      for (const role of COBRA_CANYON_ASSET_ROLES) local[role] = 0;
      for (const entry of entries) {
        if (!insideBounds(entry.bounds, eastM, northM)) continue;
        total += entry.weight;
        local[entry.role] += entry.weight;
      }
      if (total <= 0) continue;
      for (const role of COBRA_CANYON_ASSET_ROLES) {
        const share = local[role] / total;
        mix[role] += share;
        if (share > peak[role]) peak[role] = share;
      }
      probes += 1;
    }
  }
  if (!probes) return capacities;
  // Mean mix alone starves a role that is RARE OVERALL but DOMINANT somewhere: the red-earth
  // quarry is 1% of the valley and 74% of the mix inside its own 3 km² box, so a mean-derived
  // allowance ran out after three tiles and left the quarry the thinnest ground in the world.
  // Leaning a little toward each role's peak local mix costs the canopy some reach and buys every
  // named place its own character. A floor keeps a rare-but-atmospheric role — river mist is 0.9%
  // of the mean mix — from being rounded out of existence by a role that is 90% of it.
  const shares = COBRA_CANYON_ASSET_ROLES
    .filter((role) => mix[role] > 0)
    .map((role) => ({
      id: role,
      weight: Math.max(mix[role] / probes + SCATTER_PEAK_MIX_WEIGHT * peak[role], 0.012),
    }));
  for (const quota of allocateByWeight(shares, ambientBudget)) {
    capacities[quota.entry.id] = quota.count;
  }
  return capacities;
}

/**
 * The camera-following scatter.
 *
 * `collect` walks tiles outward from the aircraft and fills each role's allowance nearest-first.
 * Tile contents are a pure function of the tile's world coordinates, so a prop occupies the same
 * place on every pass and generated tiles can be memoised; the camera decides only which tiles are
 * resident. Generation is metered per update so a fast transit costs several small frames instead
 * of one long stall.
 */
function createScatterField(plan, entries, capacities, options) {
  const tileM = COBRA_CANYON_SCATTER_TILE_M;
  const nominalRadiusM = options.radiusM;
  const maximumRadiusM = nominalRadiusM * SCATTER_MAXIMUM_RADIUS_MULTIPLE;
  const targetPerTileArea = options.ambientBudget / Math.max(1, Math.PI * nominalRadiusM ** 2);
  const perTile = Math.max(1, Math.round(targetPerTileArea * tileM * tileM));
  const worldBounds = plan.boundsLocalM;
  const ribbonsByKind = new Map();
  for (const ribbon of plan.terrainRibbons ?? []) {
    const kind = token(ribbon.kind);
    for (const wanted of ["river", "road", "ridge"]) {
      if (!kind.includes(wanted)) continue;
      if (!ribbonsByKind.has(wanted)) ribbonsByKind.set(wanted, []);
      ribbonsByKind.get(wanted).push(ribbon);
    }
  }
  const context = { ribbonsByKind };
  const gradientMemo = new Map();
  const quotaCache = new Map();
  const tileCache = new Map();

  const EMPTY_QUOTA = new Int32Array(entries.length);

  /**
   * How many instances of each authored batch this tile owes, as a count per `entries` index.
   * Cheap and cached: it reads bounds and weights only, never the terrain.
   */
  function quotaFor(tileX, tileZ) {
    const key = `${tileX}:${tileZ}`;
    const cached = quotaCache.get(key);
    if (cached) return cached;
    const eastM = (tileX + 0.5) * tileM;
    const northM = (tileZ + 0.5) * tileM;
    const covering = [];
    for (const entry of entries) {
      if (insideBounds(entry.bounds, eastM, northM)) covering.push(entry);
    }
    let quota = EMPTY_QUOTA;
    if (covering.length) {
      quota = new Int32Array(entries.length);
      for (const allocated of allocateByWeight(covering, perTile)) {
        if (allocated.count > 0) quota[entries.indexOf(allocated.entry)] = allocated.count;
      }
    }
    if (quotaCache.size > SCATTER_TILE_CACHE_LIMIT * 2) quotaCache.clear();
    quotaCache.set(key, quota);
    return quota;
  }

  function generate(entry, tileX, tileZ, count) {
    const placements = [];
    const originEastM = tileX * tileM;
    const originNorthM = tileZ * tileM;
    const tileSeed = mixedUint32(hashString(`${tileX}:${tileZ}`) ^ entry.seed);
    const clumpSpreadM = entry.role === "jungle" ? 78 : 54;
    const minimumEastM = Math.max(worldBounds.minimumEastM, entry.bounds.minimumEastM);
    const maximumEastM = Math.min(worldBounds.maximumEastM, entry.bounds.maximumEastM);
    const minimumNorthM = Math.max(worldBounds.minimumNorthM, entry.bounds.minimumNorthM);
    const maximumNorthM = Math.min(worldBounds.maximumNorthM, entry.bounds.maximumNorthM);
    if (minimumEastM > maximumEastM || minimumNorthM > maximumNorthM) return placements;
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const seed = mixedUint32(tileSeed ^ Math.imul(ordinal + 1, 0x9e3779b1));
      // CLUMPS, NOT A SCATTER. Instances share a clump anchor in groups, so stands grow into each
      // other and leave real clearings between them. An even scatter at any density reads as
      // texture; clumping is what reads as jungle.
      const clumpSeed = mixedUint32(tileSeed ^ Math.imul(
        Math.floor(ordinal / SCATTER_CLUMP_SIZE) + 1,
        0x85ebca6b,
      ));
      const anchorEastM = originEastM + seededUnit(clumpSeed, 0xa511e9b3) * tileM;
      const anchorNorthM = originNorthM + seededUnit(clumpSeed, 0x63d83595) * tileM;
      const clumped = {
        eastM: anchorEastM + (seededUnit(seed, 0x7f4a7c15) - 0.5) * clumpSpreadM,
        northM: anchorNorthM + (seededUnit(seed, 0x2545f491) - 0.5) * clumpSpreadM,
      };
      const loose = {
        eastM: originEastM + seededUnit(seed, 0x27d4eb2f) * tileM,
        northM: originNorthM + seededUnit(seed, 0x165667b1) * tileM,
      };
      const verge = seededUnit(seed, 0x93d765dd) < 0.86
        ? routeVergePoint(context, entry, clumped.eastM, clumped.northM, seed)
        : null;
      // River mist is a feature OF the river. Away from water it is not thinner, it is absent.
      if (entry.role === "mist" && !verge) continue;
      const point = bestPlacement(
        plan,
        entry.role,
        verge ? [verge, clumped] : [clumped, loose],
        gradientMemo,
      );
      const eastM = clamp(point.eastM, minimumEastM, maximumEastM);
      const northM = clamp(point.northM, minimumNorthM, maximumNorthM);
      if (insideCampEmberClearEye(plan, entry.role, eastM, northM)) continue;
      const variation = seededUnit(seed, 0xc2b2ae35);
      const scale = roleScale(entry.role, entry.descriptor, variation);
      // One jungle instance represents a stand of canopy, not one isolated tree. The spread is
      // per-instance: a stand of uniform size at uniform spacing is the tell that gave the old
      // canopy its wallpaper look.
      if (entry.role === "jungle") {
        const bulk = 1.15 + seededUnit(seed, 0x8f51a67b) * 0.65;
        scale.widthM *= bulk * 0.85;
        scale.depthM *= bulk * 0.85;
        scale.heightM *= 1.55 + seededUnit(seed, 0x39aa5c11) * 0.65;
      }
      // BED THE STAND INTO THE SLOPE. Placement deliberately seeks steep ground, and a footprint
      // anchored at the centre sample cantilevers off a gorge wall — the stand visibly floats in
      // mid-air on the downhill side. Sinking it by the drop across its own half-width buries the
      // uphill skirt instead, which is what a canopy on a hillside actually looks like.
      const seatDropM = seatDrop(plan, entry.role, eastM, northM, scale, gradientMemo);
      placements.push({
        id: `${entry.id}.${tileX}.${tileZ}.${ordinal}`,
        role: entry.role,
        x: eastM,
        y: sampleCobraCanyonTerrain(plan, eastM, northM) - seatDropM,
        z: -northM,
        yaw: point.yaw ?? seededUnit(seed, 0x27d4eb2f) * Math.PI * 2,
        eastM,
        northM,
        variation,
        batchId: entry.id,
        archetypeId: entry.descriptor?.id ?? null,
        paletteHex: entry.descriptor?.paletteHex ?? null,
        ...scale,
      });
    }
    return placements;
  }

  function tilePlacements(entry, tileX, tileZ, count, work) {
    const key = `${tileX}:${tileZ}:${entry.id}`;
    const cached = tileCache.get(key);
    if (cached) return cached;
    if (work.remaining <= 0) {
      work.pending = true;
      return null;
    }
    const placements = generate(entry, tileX, tileZ, count);
    work.remaining -= placements.length;
    if (tileCache.size > SCATTER_TILE_CACHE_LIMIT) {
      // Insertion-ordered eviction: the oldest quarter goes, which is the ground furthest behind.
      let dropped = 0;
      for (const staleKey of tileCache.keys()) {
        tileCache.delete(staleKey);
        if (++dropped >= SCATTER_TILE_CACHE_LIMIT / 4) break;
      }
    }
    tileCache.set(key, placements);
    return placements;
  }

  // Tile offsets from the camera's own tile, ordered nearest-first, built ONCE. Rebuilding this
  // ring by ring on every collect cost more than generating the props: the ring walk was O(ring^2)
  // per ring, and it ran every time the aircraft moved 48 m.
  const maximumRing = Math.ceil(maximumRadiusM / tileM);
  const tileOffsets = [];
  for (let offsetX = -maximumRing; offsetX <= maximumRing; offsetX++) {
    for (let offsetZ = -maximumRing; offsetZ <= maximumRing; offsetZ++) {
      const distanceM = Math.hypot(offsetX, offsetZ) * tileM;
      if (distanceM > maximumRadiusM + tileM) continue;
      tileOffsets.push({ offsetX, offsetZ, distanceM });
    }
  }
  tileOffsets.sort((left, right) => left.distanceM - right.distanceM
    || left.offsetX - right.offsetX || left.offsetZ - right.offsetZ);

  // Reused across collects: these grow to thousands of entries and are consumed synchronously.
  const byRole = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, []]));
  const radiusByRole = Object.fromEntries(
    COBRA_CANYON_ASSET_ROLES.map((role) => [role, nominalRadiusM]),
  );
  const remaining = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, 0]));

  function collect(cameraEastM, cameraNorthM, workBudget) {
    for (const role of COBRA_CANYON_ASSET_ROLES) {
      byRole[role].length = 0;
      remaining[role] = capacities[role];
    }
    const work = { remaining: workBudget, pending: false };
    const cameraTileX = Math.floor(cameraEastM / tileM);
    const cameraTileZ = Math.floor(cameraNorthM / tileM);
    let live = 0;
    for (const role of COBRA_CANYON_ASSET_ROLES) if (remaining[role] > 0) live += 1;
    for (const offset of tileOffsets) {
      if (!live) break;
      const tileX = cameraTileX + offset.offsetX;
      const tileZ = cameraTileZ + offset.offsetZ;
      const quota = quotaFor(tileX, tileZ);
      if (quota === EMPTY_QUOTA) continue;
      for (let index = 0; index < entries.length; index++) {
        const count = quota[index];
        if (!count) continue;
        const entry = entries[index];
        if (remaining[entry.role] <= 0) continue;
        const placements = tilePlacements(entry, tileX, tileZ, count, work);
        if (!placements) continue;
        const bucket = byRole[entry.role];
        for (const placement of placements) {
          placement.distanceM = Math.hypot(
            placement.eastM - cameraEastM,
            placement.northM - cameraNorthM,
          );
          bucket.push(placement);
          remaining[entry.role] -= 1;
          if (remaining[entry.role] <= 0) {
            live -= 1;
            break;
          }
        }
      }
    }
    for (const role of COBRA_CANYON_ASSET_ROLES) {
      const placements = byRole[role];
      // Tiles were walked nearest-first, so the list is already ordered by distance to within one
      // tile — near enough for the ambient-rung prefix shed, which keeps the cover the pilot is
      // inside and drops the far edge, and far cheaper than re-sorting 8,000 props every rebuild.
      let farthestM = 0;
      for (const placement of placements) {
        if (placement.distanceM > farthestM) farthestM = placement.distanceM;
      }
      radiusByRole[role] = placements.length
        ? Math.max(nominalRadiusM * 0.5, farthestM)
        : nominalRadiusM;
    }
    return { byRole, radiusByRole, pending: work.pending };
  }

  return {
    perTile,
    tileM,
    nominalRadiusM,
    maximumRadiusM,
    collect,
    clear() {
      quotaCache.clear();
      tileCache.clear();
      gradientMemo.clear();
    },
  };
}

/**
 * Scale-in at the outer edge. An instance entering the resident set arrives at zero size and grows
 * to full over the outer band of its role's achieved radius, so the boundary is a thickening of
 * cover rather than a line of trees switching on — the same shed idiom as `ambientRungs`, read
 * radially instead of by rung.
 */
function edgeFade(distanceM, radiusM) {
  const fullM = radiusM * SCATTER_FULL_SCALE_FRACTION;
  if (distanceM <= fullM) return 1;
  if (distanceM >= radiusM) return 0;
  const t = 1 - (distanceM - fullM) / Math.max(1e-6, radiusM - fullM);
  return t * t * (3 - 2 * t);
}

function staticPlacements(plan, qualityTier, descriptors, maximumInstances) {
  const authoredSetPieces = setPiecePlacements(plan, descriptors);
  const generatedWaterAccents = waterAccentPlacements(plan, qualityTier, descriptors);
  const setPieces = authoredSetPieces.slice(0, maximumInstances);
  const waterAccents = generatedWaterAccents.slice(
    0,
    Math.max(0, maximumInstances - setPieces.length),
  );
  return { authoredSetPieces, generatedWaterAccents, setPieces, waterAccents };
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

function materialForRole(THREE, role, foliageAtlas = null, softFalloff = null) {
  if (role === "mist" || role === "waterAccent") {
    const material = new THREE.MeshBasicMaterial({
      map: softFalloff,
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

/**
 * One instanced submission for a role, allocated to a fixed CAPACITY and refilled in place.
 *
 * The near-field scatter changes which props are resident as the aircraft moves, so the mesh is
 * allocated once at the capacity the tier budget granted and `fill` rewrites its matrices. Capacity
 * — not the current occupancy — is what the budget ceiling measures, which is what keeps "spend the
 * same allowance nearer the camera" an honest claim rather than a quietly raised cap.
 */
function createRoleMesh(
  THREE, group, role, capacity, resources, foliageAtlas = null, softFalloff = null,
  authoredGeometry = null, nameSuffix = "", cardGeometry = null,
) {
  if (capacity <= 0) return null;
  // An authored CC0 mesh wins over the procedural cards when one is supplied for this batch.
  // The cards stay as the declared fallback (asset-manifest.json), so a failed asset load
  // costs detail, never the scene.
  const geometry = authoredGeometry ?? cardGeometry ?? geometryForRole(THREE, role);
  // An authored mesh carries its OWN UVs. Handing it the foliage card atlas makes it sample
  // arbitrary regions of an unrelated texture, and with alphaTest 0.48 that punches holes clean
  // through the trunk and fronds — which is why the CC0 palms rendered as black spiky scraps
  // instead of trees. Authored geometry gets a lit, vertex-coloured material and no atlas.
  const material = authoredGeometry
    ? authoredMeshMaterial(THREE, role)
    : materialForRole(THREE, role, foliageAtlas, softFalloff);
  const mesh = tagObject(new THREE.InstancedMesh(geometry, material, capacity), role, capacity);
  mesh.name = `COBRA_CANYON_ASSET_${role.toUpperCase()}${nameSuffix}`;
  // DynamicDrawUsage: the resident set is rewritten as the aircraft moves, not once at boot.
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const instanceColors = new Float32Array(capacity * 3);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);
  mesh.instanceColor.setUsage?.(THREE.DynamicDrawUsage);
  const records = Array.from({ length: capacity }, (unused, instanceId) => ({
    instanceId,
    id: null,
    batchId: null,
    setPieceId: null,
    archetypeId: null,
    role,
  }));
  // Live view of the occupied slots only: an unfilled slot describes nothing and must not appear.
  const live = [];
  mesh.userData.cobraCanyonInstances = live;
  resources.geometries.add(geometry);
  resources.materials.add(material);
  resources.meshes.push(mesh);
  group.add(mesh);

  const matrices = mesh.instanceMatrix.array;
  const unitScale = authoredGeometry ? AUTHORED_MESH_CLUMP_SCALE : 1;
  const controller = {
    role,
    mesh,
    capacity,
    baseCount: 0,
    unitTriangles: geometryTriangles(geometry),
    /**
     * Rewrites the resident set. `placements` may be given as two lists so the caller never has to
     * concatenate 8,000 element arrays every time the aircraft moves 48 m.
     *
     * The matrix is written straight into the instance buffer rather than through
     * Matrix4/Quaternion helpers: every prop stands upright, so its transform is a yaw rotation, a
     * non-uniform scale and a translation, and composing that by hand is several times cheaper
     * across a whole rebuild than `setFromAxisAngle` + `compose` + `setMatrixAt`.
     */
    fill(head, tail, radiusM, centreX = 0, centreY = 0, centreZ = 0) {
      const total = head.length + tail.length;
      const count = Math.min(capacity, total);
      // Generous: the achieved radius plus the tallest thing that can stand at its edge.
      const boundingRadiusM = radiusM + 400;
      for (let index = 0; index < count; index++) {
        const placement = index < head.length ? head[index] : tail[index - head.length];
        const fade = placement.distanceM === undefined
          ? 1
          : edgeFade(placement.distanceM, radiusM);
        // Card placements size a whole CLUMP — several notional trees on crossed quads. One
        // authored palm standing at that size is a sixty-metre plant, which is what filled a
        // third of the frame in the owner's Build 321 capture. Bring a real mesh back to
        // single-tree scale; the field cards keep the clump size they were authored for.
        const unit = unitScale * fade;
        const scaleX = Math.max(1e-4, placement.widthM * unit);
        const scaleY = Math.max(1e-4, placement.heightM * unit);
        const scaleZ = Math.max(1e-4, placement.depthM * unit);
        // Yaw sine/cosine are a property of the prop, so they are memoised on the placement.
        let cos = placement.yawCos;
        if (cos === undefined) {
          cos = placement.yawCos = Math.cos(placement.yaw);
          placement.yawSin = Math.sin(placement.yaw);
        }
        const sin = placement.yawSin;
        const at = index * 16;
        matrices[at] = cos * scaleX;
        matrices[at + 1] = 0;
        matrices[at + 2] = -sin * scaleX;
        matrices[at + 3] = 0;
        matrices[at + 4] = 0;
        matrices[at + 5] = scaleY;
        matrices[at + 6] = 0;
        matrices[at + 7] = 0;
        matrices[at + 8] = sin * scaleZ;
        matrices[at + 9] = 0;
        matrices[at + 10] = cos * scaleZ;
        matrices[at + 11] = 0;
        matrices[at + 12] = placement.x;
        matrices[at + 13] = placement.y;
        matrices[at + 14] = placement.z;
        matrices[at + 15] = 1;
        // Memoised on the placement: tints are a property of the prop, and a placement object
        // survives in the tile cache, so a prop is tinted once ever rather than once per rebuild.
        const tint = placement.tint ?? (placement.tint = instanceTint(role, placement));
        instanceColors[index * 3] = tint[0];
        instanceColors[index * 3 + 1] = tint[1];
        instanceColors[index * 3 + 2] = tint[2];
        const record = records[index];
        record.id = placement.id;
        record.batchId = placement.batchId ?? null;
        record.setPieceId = placement.setPieceId ?? null;
        record.archetypeId = placement.archetypeId ?? null;
      }
      // Retired slots collapse to a degenerate scale so a stale matrix can never draw. Only the
      // slots that WERE occupied need clearing; the rest were cleared when they were retired.
      for (let index = count; index < controller.baseCount; index++) {
        const at = index * 16;
        for (let element = 0; element < 16; element++) matrices[at + element] = 0;
        matrices[at] = 1e-6;
        matrices[at + 5] = 1e-6;
        matrices[at + 10] = 1e-6;
        matrices[at + 15] = 1;
      }
      live.length = count;
      for (let index = 0; index < count; index++) live[index] = records[index];
      controller.baseCount = count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      // A camera-centred sphere, not a scan of every instance: `computeBoundingSphere` walks the
      // whole matrix buffer, and it would run on every rebuild for no gain — the resident set is
      // by construction a disc around the aircraft.
      if (mesh.boundingSphere && count > 0) {
        mesh.boundingSphere.center.set(centreX, centreY, centreZ);
        mesh.boundingSphere.radius = boundingRadiusM;
      } else if (typeof mesh.computeBoundingSphere === "function") {
        mesh.computeBoundingSphere();
      }
    },
  };
  return controller;
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
  const descriptors = descriptorIndex(plan);
  const entries = scatterEntries(plan, descriptors);
  const statics = staticPlacements(plan, qualityTier, descriptors, maximumInstances);
  // The authored world features — set-piece dressing and the river's bank sheens — stay world
  // fixed and are always resident. Whatever the tier allows beyond them is the near-field
  // allowance, and it is spent inside the scatter radius rather than smeared over 256 km².
  const ambientBudget = Math.max(
    0,
    maximumInstances - statics.setPieces.length - statics.waterAccents.length,
  );
  const scatterCapacities = roleScatterCapacities(plan, entries, ambientBudget);
  const scatterRadiusM = Math.max(1, finite(
    options.scatterRadiusM,
    COBRA_CANYON_SCATTER_RADIUS_M[qualityTier] ?? COBRA_CANYON_SCATTER_RADIUS_M.balanced,
  ));
  const scatter = createScatterField(plan, entries, scatterCapacities, {
    radiusM: scatterRadiusM,
    ambientBudget,
  });
  const group = tagObject(new THREE.Group(), "assetKit", maximumInstances);
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
  // One 32x32 ramp for the whole mist/water-accent role: without it these cards draw as
  // hard-edged translucent grey slabs, which is the "grey rectangle" visible from the cockpit.
  const softFalloff = createCobraSoftFalloffTexture(THREE);
  resources.textures.push(softFalloff);
  const controllers = [];
  const staticByRole = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, []]));
  for (const placement of statics.setPieces) staticByRole[placement.role].push(placement);
  for (const placement of statics.waterAccents) staticByRole[placement.role].push(placement);
  const roleCapacity = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [
    role,
    staticByRole[role].length + scatterCapacities[role],
  ]));

  // A TIER HAS TWO CEILINGS AND THE MIX DECIDES WHICH ONE BINDS. A crossed-card jungle stand costs
  // twelve triangles; a plantation row costs a hundred and fifty. The allowance is now split by
  // the local vegetation mix rather than by a fixed authored instance count, so the same instance
  // count can cost very different triangles — mobile blew its 45,000 ceiling by 433 the moment the
  // quarry and the plantation were given a real share. Trim the SCATTER (never the authored world
  // features) until it fits what the static world left behind.
  const cardGeometries = Object.fromEntries(
    COBRA_CANYON_ASSET_ROLES.map((role) => [role, geometryForRole(THREE, role)]),
  );
  const cardTriangles = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [
    role,
    geometryTriangles(cardGeometries[role]),
  ]));
  const triangleCeiling = Math.max(0, Math.trunc(finite(options.maxTriangles, Infinity)));
  if (Number.isFinite(triangleCeiling)) {
    // The authored-mesh slice is reserved separately, and a hero instance REPLACES a card, so
    // costing every slot as a card plus that reserve is a safe over-estimate.
    const reserve = Math.max(0, Math.trunc(finite(options.authoredTriangleBudget, 0)));
    let allowance = triangleCeiling - reserve;
    for (const role of COBRA_CANYON_ASSET_ROLES) {
      allowance -= staticByRole[role].length * cardTriangles[role];
    }
    let scatterCost = 0;
    for (const role of COBRA_CANYON_ASSET_ROLES) {
      scatterCost += scatterCapacities[role] * cardTriangles[role];
    }
    if (scatterCost > allowance && scatterCost > 0) {
      const keep = Math.max(0, allowance / scatterCost);
      for (const role of COBRA_CANYON_ASSET_ROLES) {
        scatterCapacities[role] = Math.floor(scatterCapacities[role] * keep);
        roleCapacity[role] = staticByRole[role].length + scatterCapacities[role];
      }
    }
  }

  // An authored palm is ~470 triangles against a card's dozen, so it cannot go on every
  // placement: the whole jungle would cost millions of triangles and the tier budget throws.
  // Spend a fixed triangle allowance on real palms and keep cards for the rest. Hero membership
  // is drawn from the instance's OWN seed rather than from its index in the resident list, so a
  // given tree is authored geometry or a card as a property of where it stands — it cannot
  // switch representation as the aircraft flies past it.
  const authoredTriangleBudget = Math.max(0, Math.trunc(finite(options.authoredTriangleBudget, 0)));
  const heroPlans = new Map();
  for (const role of COBRA_CANYON_ASSET_ROLES) {
    const authored = options.roleGeometries?.[role] ?? null;
    const capacity = roleCapacity[role];
    if (!authored || capacity <= 0 || authoredTriangleBudget <= 0) continue;
    const unitTriangles = Math.max(1, Math.trunc(authored.attributes.position.count / 3));
    const affordable = Math.min(capacity, Math.trunc(authoredTriangleBudget / unitTriangles));
    if (affordable <= 0) continue;
    heroPlans.set(role, { authored, heroCapacity: affordable, fraction: affordable / capacity });
  }

  const heroControllers = new Map();
  const fieldControllers = new Map();
  for (const role of COBRA_CANYON_ASSET_ROLES) {
    const atlas = role === "jungle" ? foliageAtlas : null;
    const heroPlan = heroPlans.get(role);
    const capacity = roleCapacity[role];
    if (heroPlan) {
      const heroController = createRoleMesh(
        THREE, group, role, heroPlan.heroCapacity, resources, atlas, softFalloff,
        heroPlan.authored, "_HERO",
      );
      if (heroController) {
        heroControllers.set(role, heroController);
        controllers.push(heroController);
      }
      const fieldController = createRoleMesh(
        THREE, group, role, capacity - heroPlan.heroCapacity, resources, atlas, softFalloff,
        null, "", cardGeometries[role],
      );
      if (fieldController) {
        fieldControllers.set(role, fieldController);
        controllers.push(fieldController);
      }
      continue;
    }
    const controller = createRoleMesh(
      THREE, group, role, capacity, resources, atlas, softFalloff, null, "", cardGeometries[role],
    );
    if (controller) {
      fieldControllers.set(role, controller);
      controllers.push(controller);
    }
  }

  // A role trimmed to zero capacity builds no mesh, so its card geometry has no owner: hand it to
  // the resource set directly rather than leaking it.
  for (const role of COBRA_CANYON_ASSET_ROLES) resources.geometries.add(cardGeometries[role]);

  const batchSets = Object.fromEntries(COBRA_CANYON_ASSET_ROLES.map((role) => [role, new Set()]));
  for (const entry of entries) batchSets[entry.role].add(entry.id);
  const roleCountsRecord = {
    authoredAmbientBatches: plan.ambientBatches?.length ?? 0,
    authoredSetPieceCells: plan.setPieceCells?.length ?? 0,
    authoredAmbientArchetypes: descriptors.descriptors.length,
    authoredLandmarkArchetypes: plan.presentationKit?.landmarkArchetypes?.length ?? 0,
    authoredSetPieceArchetypeReferences: (plan.setPieceCells ?? []).reduce(
      (sum, cell) => sum + (cell.archetypeIds?.length ?? 0),
      0,
    ),
    authoredSetPieceAssetReferences: statics.authoredSetPieces.length,
    renderedSetPieceAssetInstances: statics.setPieces.length,
    generatedWaterAccentInstances: statics.generatedWaterAccents.length,
    renderedWaterAccentInstances: statics.waterAccents.length,
    ambientBatchInstances: 0,
    renderBatches: controllers.length,
    assetInstances: 0,
    scatterRadiusM,
    scatterTileM: scatter.tileM,
    scatterInstancesPerTile: scatter.perTile,
    scatterCapacity: COBRA_CANYON_ASSET_ROLES.reduce(
      (sum, role) => sum + scatterCapacities[role],
      0,
    ),
  };
  for (const role of COBRA_CANYON_ASSET_ROLES) {
    // A role with an authored mesh renders as TWO batches (hero geometry + card field), so
    // count them rather than asking whether one exists.
    const roleControllers = controllers.filter((controller) => controller.role === role);
    roleCountsRecord[`${role}AuthoredBatches`] = batchSets[role].size;
    roleCountsRecord[`${role}Batches`] = batchSets[role].size;
    roleCountsRecord[`${role}RenderBatches`] = roleControllers.length;
    roleCountsRecord[`${role}SetPieceInstances`] = staticByRole[role].filter(
      (placement) => placement.setPieceId,
    ).length;
    roleCountsRecord[`${role}Instances`] = 0;
    roleCountsRecord[`${role}ScatterCapacity`] = scatterCapacities[role];
    roleCountsRecord[`${role}ScatterRadiusM`] = scatterRadiusM;
  }
  let roleCounts = Object.freeze({ ...roleCountsRecord });

  const builtDrawCalls = controllers.length;
  const builtInstances = controllers.reduce((sum, controller) => sum + controller.capacity, 0);
  const builtTriangles = controllers.reduce(
    (sum, controller) => sum + controller.capacity * controller.unitTriangles,
    0,
  );
  // The CEILING is what the tier budget measures: the allocation this kit will never exceed no
  // matter where the aircraft flies. Occupancy varies with the ground underneath; the allowance
  // does not.
  const builtMetrics = Object.freeze({
    drawCalls: builtDrawCalls,
    instances: builtInstances,
    triangles: builtTriangles,
  });

  let disposed = false;
  let ambientBudgetLevel = 0;
  let nearRingVisible = true;
  let snapshots = null;
  let currentDiagnostics = null;
  let cameraEastM = null;
  let cameraNorthM = null;
  let refreshPending = false;
  const roleRadiusM = Object.fromEntries(
    COBRA_CANYON_ASSET_ROLES.map((role) => [role, scatterRadiusM]),
  );

  function rebuildSnapshots() {
    const counts = { ...roleCountsRecord };
    let assetInstances = 0;
    for (const role of COBRA_CANYON_ASSET_ROLES) {
      const occupancy = controllers
        .filter((controller) => controller.role === role)
        .reduce((sum, controller) => sum + controller.baseCount, 0);
      counts[`${role}Instances`] = occupancy;
      counts[`${role}ScatterRadiusM`] = Math.round(roleRadiusM[role]);
      assetInstances += occupancy;
    }
    counts.assetInstances = assetInstances;
    counts.ambientBatchInstances = assetInstances
      - counts.renderedSetPieceAssetInstances
      - counts.renderedWaterAccentInstances;
    roleCounts = Object.freeze(counts);
    const next = Array.from({ length: 3 }, () => [null, null]);
    for (let level = 0; level <= 2; level++) {
      for (let nearIndex = 0; nearIndex <= 1; nearIndex++) {
        const near = nearIndex === 1;
        let drawCalls = 0;
        let instances = 0;
        let triangles = 0;
        for (const controller of controllers) {
          const survivesRing = near || STRUCTURAL_ROLES.has(controller.role);
          const count = survivesRing
            ? Math.ceil(controller.baseCount * COBRA_CANYON_AMBIENT_BUDGETS[level][controller.role])
            : 0;
          if (count > 0) drawCalls += 1;
          instances += count;
          triangles += count * controller.unitTriangles;
        }
        next[level][nearIndex] = Object.freeze({
          schema: COBRA_CANYON_ASSET_KIT_SCHEMA,
          qualityTier,
          ambientBudgetLevel: level,
          nearRingVisible: near,
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
    snapshots = next;
  }

  /** Re-collects the resident set around the camera and refills every instanced submission. */
  function refresh(workBudget) {
    const collected = scatter.collect(cameraEastM, cameraNorthM, workBudget);
    refreshPending = collected.pending;
    for (const role of COBRA_CANYON_ASSET_ROLES) {
      roleRadiusM[role] = collected.radiusByRole[role];
      // Authored world features first: they are always resident and never fade, so they occupy
      // the head of the list and survive the ambient-rung prefix shed.
      const statics_ = staticByRole[role];
      const scattered = collected.byRole[role];
      const heroPlan = heroPlans.get(role);
      const hero = heroControllers.get(role);
      const field = fieldControllers.get(role);
      if (heroPlan && hero && field) {
        const heroList = [];
        const fieldList = [];
        for (const list of [statics_, scattered]) {
          for (const placement of list) {
            let pick = placement.heroPick;
            if (pick === undefined) {
              pick = placement.heroPick = seededUnit(hashString(placement.id), 0x1d2c9f31);
            }
            const target = pick < heroPlan.fraction && heroList.length < hero.capacity
              ? heroList
              : fieldList;
            target.push(placement);
          }
        }
        hero.fill(heroList, EMPTY_LIST, roleRadiusM[role], cameraEastM, 0, -cameraNorthM);
        field.fill(fieldList, EMPTY_LIST, roleRadiusM[role], cameraEastM, 0, -cameraNorthM);
      } else if (field) {
        field.fill(statics_, scattered, roleRadiusM[role], cameraEastM, 0, -cameraNorthM);
      }
    }
    rebuildSnapshots();
  }

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

  // Boot the scene where the aircraft starts. Camp Ember is the spawn, and building the first
  // resident set anywhere else would show the pilot a bare valley for the first few seconds.
  const spawn = campEmberPadCentre(plan);
  cameraEastM = finite(options.cameraPosition?.x, spawn?.eastM ?? 0);
  cameraNorthM = options.cameraPosition
    ? -finite(options.cameraPosition.z, 0)
    : (spawn?.northM ?? 0);
  refresh(Infinity);
  apply();

  const disposedDiagnostics = Object.freeze({
    ...snapshots[0][0],
    drawCalls: 0,
    instances: 0,
    triangles: 0,
    disposed: true,
  });

  return Object.freeze({
    group,
    get roleCounts() {
      return roleCounts;
    },
    builtMetrics,
    scatterRadiusM,
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
      const camera = frame.cameraPosition;
      if (camera && Number.isFinite(Number(camera.x)) && Number.isFinite(Number(camera.z))) {
        const nextEastM = Number(camera.x);
        const nextNorthM = -Number(camera.z);
        const travelledM = Math.hypot(nextEastM - cameraEastM, nextNorthM - cameraNorthM);
        if (travelledM >= SCATTER_REBUILD_STEP_M || refreshPending) {
          cameraEastM = nextEastM;
          cameraNorthM = nextNorthM;
          // A jump further than the scatter radius is a scene cut, not flight: nothing resident
          // survives it, so metering the work would show the pilot a bare valley for half a
          // second. Pay the whole rebuild on the frame that already changed everything.
          const teleported = travelledM > scatterRadiusM;
          refresh(teleported ? Infinity : SCATTER_TILE_BUILDS_PER_UPDATE * scatter.perTile);
        }
      } else if (refreshPending) {
        refresh(SCATTER_TILE_BUILDS_PER_UPDATE * scatter.perTile);
      }
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
      scatter.clear();
      group.clear();
      group.userData.cobraCanyonAssetKitDisposed = true;
      currentDiagnostics = disposedDiagnostics;
    },
  });
}
