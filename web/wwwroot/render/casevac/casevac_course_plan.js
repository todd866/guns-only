/**
 * Deterministic non-obstacle dressing for the fictional CASEVAC course.
 *
 * Pads, people, capsule staging, windsocks, weather, and guidance cues are
 * presentation-only. Substantial physical scenery is deliberately absent here:
 * it is built exclusively from simulation-projected collision primitives by
 * casevac_collision_scenery.js, keeping visible hazards and physics co-located.
 */

export const CASEVAC_SCENERY_SCHEMA =
  "casevac.course-scenery.presentation.v1";

export const CASEVAC_COURSE_SITE_IDS = Object.freeze({
  pickup: "location.ukraine.casevac-pickup-a.v1",
  receiver: "location.ukraine.casevac-handoff-a.v1",
});

export const CASEVAC_CAPSULE_ID =
  "payload.evacuation-capsule.prototype.v1";

export const CASEVAC_CAPSULE_VISUAL_STATES = Object.freeze({
  atPickup: "AT_PICKUP",
  inAircraft: "IN_AIRCRAFT",
  atReceiver: "AT_RECEIVER",
});

export const CASEVAC_DEFAULT_ANCHORS = Object.freeze({
  pickup: Object.freeze({ x: 0, y: 0, z: 0 }),
  receiver: Object.freeze({ x: 840, y: 8, z: -430 }),
});

export const CASEVAC_SCENERY_QUALITY = Object.freeze({
  mobile: Object.freeze({
    pickupPeople: 5,
    receiverPeople: 5,
    rainStreaksPerSite: 24,
  }),
  balanced: Object.freeze({
    pickupPeople: 6,
    receiverPeople: 6,
    rainStreaksPerSite: 48,
  }),
  desktop: Object.freeze({
    pickupPeople: 8,
    receiverPeople: 8,
    rainStreaksPerSite: 72,
  }),
});

const SITE_ENVELOPES = Object.freeze({
  pickup: Object.freeze({
    minimum: Object.freeze({ x: -142, y: -1, z: -126 }),
    maximum: Object.freeze({ x: 142, y: 66, z: 126 }),
  }),
  receiver: Object.freeze({
    minimum: Object.freeze({ x: -132, y: -1, z: -118 }),
    maximum: Object.freeze({ x: 138, y: 66, z: 118 }),
  }),
});

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

function mixedUint32(value) {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function seededUnit(seed, key) {
  return mixedUint32((seed >>> 0) ^ hashString(key)) / 4294967296;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function point(x, y, z) {
  return { x, y, z };
}

function staff(prefix, count, basePositions) {
  return Array.from({ length: count }, (_, index) => {
    const position = basePositions[index % basePositions.length];
    return {
      id: `${prefix}.staff.${index + 1}`,
      position: point(position[0], 0, position[1]),
      yaw: position[2],
      pose: index === 0 ? "shielding" : index === 1 ? "ready" : "standing",
    };
  });
}

function rainStreaks(seed, siteKey, count, radiusM) {
  return Array.from({ length: count }, (_, index) => {
    const angle = seededUnit(seed, `${siteKey}:rain:${index}:angle`) * Math.PI * 2;
    const radius = Math.sqrt(
      seededUnit(seed, `${siteKey}:rain:${index}:radius`),
    ) * radiusM;
    const y = 4 + seededUnit(seed, `${siteKey}:rain:${index}:y`) * 18;
    return {
      x: Math.cos(angle) * radius,
      y,
      z: Math.sin(angle) * radius,
      lengthM: 0.8 + seededUnit(seed, `${siteKey}:rain:${index}:length`) * 1.4,
    };
  });
}

function pickupPlan(seed, quality) {
  return {
    id: CASEVAC_COURSE_SITE_IDS.pickup,
    role: "ORCHARD_PICKUP",
    envelope: SITE_ENVELOPES.pickup,
    pad: {
      id: "decor.casevac.pickup.pad",
      position: point(0, 0, 0),
      sizeM: point(24, 0.16, 24),
      material: "compacted-orchard-hardstand",
      visualOnly: true,
    },
    capsuleStand: point(6.8, 0.55, 5.8),
    signal: {
      id: "decor.casevac.pickup.signal-smoke",
      position: point(-15, 0, 13),
      heightM: 54,
      puffs: 14,
      color: "amber-smoke",
    },
    responseVehicle: {
      id: "decor.casevac.pickup.response-vehicle",
      position: point(24, 0, 15),
      yaw: -0.55,
      kind: "FIELD_RESPONSE",
      visualOnly: true,
    },
    landingLights: Array.from({ length: 16 }, (_, index) => {
      const angle = index / 16 * Math.PI * 2;
      return point(Math.cos(angle) * 13.6, 0.28, Math.sin(angle) * 13.6);
    }),
    windsock: {
      id: "decor.casevac.pickup.windsock",
      position: point(23, 0, -20),
      mastHeightM: 5.5,
    },
    // Collision-sized trees, buildings, fences, poles, and wires must come
    // from the projected authority stream, never this decorative plan.
    trees: [],
    structures: [],
    fences: [],
    poles: [],
    wires: [],
    people: staff(
      "decor.casevac.pickup",
      quality.pickupPeople,
      [
        [10, 8, -2.3],
        [4, 11, -2.7],
        [12, 3, -1.9],
        [-8, 10, 2.5],
        [-12, 4, 1.9],
        [15, -5, -1.4],
        [-15, -7, 1.2],
        [1, 15, Math.PI],
      ],
    ),
    approachCue: {
      id: "cue.casevac.pickup.approach",
      points: [
        point(-136, 24, 92),
        point(-88, 15, 59),
        point(-43, 7, 29),
        point(-13, 2, 9),
        point(0, 0.25, 0),
      ],
    },
    escapeCue: {
      id: "cue.casevac.pickup.escape",
      points: [
        point(0, 0.25, 0),
        point(31, 7, -25),
        point(75, 16, -61),
        point(130, 27, -105),
      ],
    },
    rain: rainStreaks(
      seed,
      "pickup",
      quality.rainStreaksPerSite,
      104,
    ),
  };
}

function receiverPlan(seed, quality) {
  return {
    id: CASEVAC_COURSE_SITE_IDS.receiver,
    role: "CLINIC_HANDOFF",
    envelope: SITE_ENVELOPES.receiver,
    pad: {
      id: "decor.casevac.receiver.pad",
      position: point(0, 0, 0),
      sizeM: point(26, 0.18, 26),
      material: "weathered-clinic-hardstand",
      visualOnly: true,
    },
    capsuleStand: point(-8, 0.55, 8),
    signal: {
      id: "decor.casevac.receiver.signal-smoke",
      position: point(16, 0, 14),
      heightM: 54,
      puffs: 14,
      color: "green-smoke",
    },
    responseVehicle: {
      id: "decor.casevac.receiver.response-vehicle",
      position: point(24, 0, 18),
      yaw: -0.72,
      kind: "CLINIC_RESPONSE",
      visualOnly: true,
    },
    landingLights: Array.from({ length: 16 }, (_, index) => {
      const angle = index / 16 * Math.PI * 2;
      return point(Math.cos(angle) * 14.6, 0.3, Math.sin(angle) * 14.6);
    }),
    windsock: {
      id: "decor.casevac.receiver.windsock",
      position: point(26, 0, -23),
      mastHeightM: 6,
    },
    trees: [],
    structures: [],
    fences: [],
    poles: [],
    wires: [],
    people: staff(
      "decor.casevac.receiver",
      quality.receiverPeople,
      [
        [-14, 11, -2.4],
        [-8, 15, -2.6],
        [-20, 8, -2.1],
        [9, 12, 2.7],
        [14, 7, 2.4],
        [16, -6, -1.4],
        [-17, -5, 1.2],
        [1, 17, Math.PI],
      ],
    ),
    approachCue: {
      id: "cue.casevac.receiver.approach",
      points: [
        point(132, 25, -46),
        point(89, 16, -31),
        point(48, 8, -17),
        point(16, 2.3, -6),
        point(0, 0.25, 0),
      ],
    },
    escapeCue: {
      id: "cue.casevac.receiver.escape",
      points: [
        point(0, 0.25, 0),
        point(-33, 8, -24),
        point(-79, 18, -57),
        point(-128, 29, -94),
      ],
    },
    rain: rainStreaks(
      seed,
      "receiver",
      quality.rainStreaksPerSite,
      100,
    ),
  };
}

export function planCasevacCourseScenery(options = {}) {
  const qualityTier = options.qualityTier ?? "balanced";
  const quality = CASEVAC_SCENERY_QUALITY[qualityTier];
  if (!quality)
    throw new TypeError(`Unknown CASEVAC scenery quality tier: ${qualityTier}.`);
  const seed = Math.trunc(finite(options.seed, 0x2038_0701)) >>> 0;
  const pickup = pickupPlan(seed, quality);
  const receiver = receiverPlan(seed ^ 0x9e37_79b9, quality);
  const plan = {
    schema: CASEVAC_SCENERY_SCHEMA,
    seed,
    qualityTier,
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
    sites: { pickup, receiver },
    counts: {
      trees: pickup.trees.length + receiver.trees.length,
      structures: pickup.structures.length + receiver.structures.length,
      people: pickup.people.length + receiver.people.length,
      utilityPoles: pickup.poles.length + receiver.poles.length,
      utilityWires: pickup.wires.length + receiver.wires.length,
      fenceSegments: pickup.fences.length + receiver.fences.length,
      rainStreaks: pickup.rain.length + receiver.rain.length,
      landingLights: pickup.landingLights.length
        + receiver.landingLights.length,
      signalPuffs: pickup.signal.puffs + receiver.signal.puffs,
      responseVehicles: 2,
      pads: 2,
      windsocks: 2,
      capsules: 1,
    },
  };
  return deepFreeze(plan);
}
