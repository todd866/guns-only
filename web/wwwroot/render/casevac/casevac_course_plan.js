/**
 * Deterministic decorative layout for the fictional CASEVAC course.
 *
 * This module is presentation-only. None of its surfaces, obstacles, cues, or
 * clearances are collision, landing-zone, exposure, weather, or mission truth.
 * A future scene integration must align these visuals with authoritative
 * scenario definitions rather than deriving authority from this plan.
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
    orchardRows: 4,
    orchardColumns: 6,
    receiverTrees: 4,
    pickupPeople: 3,
    receiverPeople: 3,
    rainStreaksPerSite: 24,
  }),
  balanced: Object.freeze({
    orchardRows: 6,
    orchardColumns: 8,
    receiverTrees: 7,
    pickupPeople: 4,
    receiverPeople: 4,
    rainStreaksPerSite: 48,
  }),
  desktop: Object.freeze({
    orchardRows: 8,
    orchardColumns: 10,
    receiverTrees: 10,
    pickupPeople: 5,
    receiverPeople: 5,
    rainStreaksPerSite: 72,
  }),
});

const SITE_ENVELOPES = Object.freeze({
  pickup: Object.freeze({
    minimum: Object.freeze({ x: -142, y: -1, z: -126 }),
    maximum: Object.freeze({ x: 142, y: 35, z: 126 }),
  }),
  receiver: Object.freeze({
    minimum: Object.freeze({ x: -132, y: -1, z: -118 }),
    maximum: Object.freeze({ x: 138, y: 35, z: 118 }),
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

function segment(id, from, to, kind = "decorative") {
  return { id, from, to, kind };
}

function rectangularFence(prefix, halfWidth, halfDepth, gate) {
  const xGap = Math.max(2, finite(gate?.halfWidthM, 5));
  const gateSide = gate?.side ?? "south";
  const result = [];
  const add = (name, from, to) =>
    result.push(segment(`${prefix}.${name}`, from, to, "fence"));

  if (gateSide === "south") {
    add("south-west", point(-halfWidth, 0, halfDepth),
      point(-xGap, 0, halfDepth));
    add("south-east", point(xGap, 0, halfDepth),
      point(halfWidth, 0, halfDepth));
  } else {
    add("south", point(-halfWidth, 0, halfDepth),
      point(halfWidth, 0, halfDepth));
  }
  add("east", point(halfWidth, 0, halfDepth),
    point(halfWidth, 0, -halfDepth));
  if (gateSide === "north") {
    add("north-east", point(halfWidth, 0, -halfDepth),
      point(xGap, 0, -halfDepth));
    add("north-west", point(-xGap, 0, -halfDepth),
      point(-halfWidth, 0, -halfDepth));
  } else {
    add("north", point(halfWidth, 0, -halfDepth),
      point(-halfWidth, 0, -halfDepth));
  }
  add("west", point(-halfWidth, 0, -halfDepth),
    point(-halfWidth, 0, halfDepth));
  return result;
}

function utilityLine(prefix, polePoints, poleHeightM) {
  const poles = polePoints.map((position, index) => ({
    id: `${prefix}.pole.${index + 1}`,
    position,
    heightM: poleHeightM,
  }));
  const wires = [];
  for (let index = 1; index < poles.length; index++) {
    for (let conductor = -1; conductor <= 1; conductor++) {
      const lateral = conductor * 0.68;
      wires.push(segment(
        `${prefix}.wire.${index}.${conductor + 2}`,
        point(
          poles[index - 1].position.x + lateral,
          poleHeightM * 0.9,
          poles[index - 1].position.z,
        ),
        point(
          poles[index].position.x + lateral,
          poleHeightM * 0.9,
          poles[index].position.z,
        ),
        "utility-wire",
      ));
    }
  }
  return { poles, wires };
}

function orchardTrees(seed, quality) {
  const trees = [];
  const xMinimum = -72;
  const xMaximum = 72;
  const zMinimum = -70;
  const zMaximum = 64;
  const rowStep = (zMaximum - zMinimum)
    / Math.max(1, quality.orchardRows - 1);
  const columnStep = (xMaximum - xMinimum)
    / Math.max(1, quality.orchardColumns - 1);

  for (let row = 0; row < quality.orchardRows; row++) {
    for (let column = 0; column < quality.orchardColumns; column++) {
      const key = `orchard:${row}:${column}`;
      const x = xMinimum + column * columnStep
        + (seededUnit(seed, `${key}:x`) - 0.5) * 3.4;
      const z = zMinimum + row * rowStep
        + (seededUnit(seed, `${key}:z`) - 0.5) * 3.0;
      const distanceToPad = Math.hypot(x, z);
      const insideApproachLane = z > 22 && Math.abs(x) < 13;
      const insideShed = x > 40 && x < 76 && z > 22 && z < 62;
      if (distanceToPad < 25 || insideApproachLane || insideShed) continue;
      trees.push({
        id: `decor.casevac.pickup.orchard-tree.${trees.length + 1}`,
        position: point(x, 0, z),
        heightM: 5.8 + seededUnit(seed, `${key}:height`) * 2.5,
        crownRadiusM: 2.2 + seededUnit(seed, `${key}:radius`) * 0.8,
        yaw: seededUnit(seed, `${key}:yaw`) * Math.PI * 2,
        swayPhase: seededUnit(seed, `${key}:sway`) * Math.PI * 2,
      });
    }
  }
  return trees;
}

function receiverTrees(seed, quality) {
  const positions = [
    [-64, -46], [-78, -8], [-65, 47], [-14, 68], [37, 68],
    [72, 42], [81, 4], [70, -48], [20, -72], [-30, -70],
  ];
  return positions.slice(0, quality.receiverTrees).map(([x, z], index) => ({
    id: `decor.casevac.receiver.tree.${index + 1}`,
    position: point(
      x + (seededUnit(seed, `receiver-tree:${index}:x`) - 0.5) * 3,
      0,
      z + (seededUnit(seed, `receiver-tree:${index}:z`) - 0.5) * 3,
    ),
    heightM: 6.3 + seededUnit(seed, `receiver-tree:${index}:height`) * 2.8,
    crownRadiusM: 2.4 + seededUnit(seed, `receiver-tree:${index}:radius`) * 0.9,
    yaw: seededUnit(seed, `receiver-tree:${index}:yaw`) * Math.PI * 2,
    swayPhase: seededUnit(seed, `receiver-tree:${index}:sway`) * Math.PI * 2,
  }));
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
  const utility = utilityLine(
    "decor.casevac.pickup.utility",
    [
      point(-84, 0, -86),
      point(-28, 0, -86),
      point(28, 0, -86),
      point(84, 0, -86),
    ],
    11.5,
  );
  return {
    id: CASEVAC_COURSE_SITE_IDS.pickup,
    role: "ORCHARD_PICKUP",
    envelope: SITE_ENVELOPES.pickup,
    pad: {
      id: "decor.casevac.pickup.pad",
      position: point(0, 0, 0),
      sizeM: point(17, 0.16, 17),
      material: "compacted-orchard-hardstand",
      visualOnly: true,
    },
    capsuleStand: point(6.8, 0.55, 5.8),
    windsock: {
      id: "decor.casevac.pickup.windsock",
      position: point(23, 0, -20),
      mastHeightM: 5.5,
    },
    trees: orchardTrees(seed, quality),
    structures: [
      {
        id: "decor.casevac.pickup.packing-shed",
        position: point(58, 0, 42),
        sizeM: point(23, 5.2, 16),
        yaw: -0.08,
        kind: "packing-shed",
      },
      {
        id: "decor.casevac.pickup.water-pump",
        position: point(-48, 0, 43),
        sizeM: point(5.5, 3.2, 4.8),
        yaw: 0.18,
        kind: "pump-house",
      },
    ],
    fences: rectangularFence(
      "decor.casevac.pickup.fence",
      91,
      82,
      { side: "south", halfWidthM: 14 },
    ),
    poles: utility.poles,
    wires: utility.wires,
    people: staff(
      "decor.casevac.pickup",
      quality.pickupPeople,
      [
        [10, 8, -2.3],
        [4, 11, -2.7],
        [12, 3, -1.9],
        [-8, 10, 2.5],
        [-12, 4, 1.9],
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
  const utility = utilityLine(
    "decor.casevac.receiver.utility",
    [
      point(92, 0, -72),
      point(92, 0, -24),
      point(92, 0, 24),
      point(92, 0, 72),
    ],
    12.5,
  );
  return {
    id: CASEVAC_COURSE_SITE_IDS.receiver,
    role: "CLINIC_HANDOFF",
    envelope: SITE_ENVELOPES.receiver,
    pad: {
      id: "decor.casevac.receiver.pad",
      position: point(0, 0, 0),
      sizeM: point(18, 0.18, 18),
      material: "weathered-clinic-hardstand",
      visualOnly: true,
    },
    capsuleStand: point(-8, 0.55, 8),
    windsock: {
      id: "decor.casevac.receiver.windsock",
      position: point(26, 0, -23),
      mastHeightM: 6,
    },
    trees: receiverTrees(seed, quality),
    structures: [
      {
        id: "decor.casevac.receiver.clinic",
        position: point(-46, 0, 28),
        sizeM: point(38, 8.5, 24),
        yaw: 0,
        kind: "clinic",
      },
      {
        id: "decor.casevac.receiver.service-annex",
        position: point(-58, 0, -17),
        sizeM: point(17, 4.8, 13),
        yaw: 0.08,
        kind: "service-annex",
      },
      {
        id: "decor.casevac.receiver.covered-handoff",
        position: point(-17, 0, 18),
        sizeM: point(13, 3.6, 9),
        yaw: 0,
        kind: "open-awning",
      },
    ],
    fences: rectangularFence(
      "decor.casevac.receiver.fence",
      98,
      82,
      { side: "north", halfWidthM: 16 },
    ),
    poles: utility.poles,
    wires: utility.wires,
    people: staff(
      "decor.casevac.receiver",
      quality.receiverPeople,
      [
        [-14, 11, -2.4],
        [-8, 15, -2.6],
        [-20, 8, -2.1],
        [9, 12, 2.7],
        [14, 7, 2.4],
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
      pads: 2,
      windsocks: 2,
      capsules: 1,
    },
  };
  return deepFreeze(plan);
}
