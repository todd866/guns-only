export const WEEKEND_ROUTE_SCHEMA = "guns-only.weekend-route.v1";
export const WEEKEND_TRACK_DAY_SCHEMA = "guns-only.weekend-track-day-presentation.v1";
export const WEEKEND_TRACK_SURFACE_URL =
  "/content/packs/weekend-ride/environment/textures/track-asphalt-v1.webp?v=299";
export const WEEKEND_HINTERLAND_GROUND_URL =
  "/content/packs/weekend-ride/environment/textures/weekend-hinterland-ground-v1.webp?v=299";
export const WEEKEND_FIELD_LANDCOVER_URL =
  "/content/packs/weekend-ride/environment/textures/weekend-field-landcover-v1.webp?v=299";

const TRACK_TEXTURE_METRES_PER_TILE = 12;
const GROUND_TEXTURE_METRES_PER_TILE = 160;
const FIELD_TEXTURE_METRES_PER_TILE = 1_450;

function finitePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const z = Number(point?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return Object.freeze({ x, y, z });
}

function tangentAt(circuit, index) {
  const uniqueCount = circuit.length - 1;
  const previous = circuit[(index - 1 + uniqueCount) % uniqueCount];
  const next = circuit[(index + 1) % uniqueCount];
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return Object.freeze({ x: dx / length, z: dz / length });
}

function offsetFromTrack(circuit, index, offsetM) {
  const point = circuit[index];
  const tangent = tangentAt(circuit, index);
  return Object.freeze({
    x: point.x - tangent.z * offsetM,
    y: point.y,
    z: point.z + tangent.x * offsetM,
  });
}

function pointInTrackFrame(point, tangent, alongM, crossM) {
  return Object.freeze({
    x: point.x + tangent.x * alongM - tangent.z * crossM,
    y: point.y,
    z: point.z + tangent.z * alongM + tangent.x * crossM,
  });
}

function distanceToCircuit(circuit, point) {
  let minimumM = Infinity;
  for (let index = 0; index < circuit.length - 1; index++) {
    const start = circuit[index];
    const end = circuit[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 1e-9
      ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared))
      : 0;
    minimumM = Math.min(
      minimumM,
      Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t)),
    );
  }
  return minimumM;
}

function freezeAssets(assets) {
  return Object.freeze(assets.map((asset) => Object.freeze(asset)));
}

function routeHeadingAtProgress(circuit, progressM, circuitLengthM) {
  const wrappedM = ((progressM % circuitLengthM) + circuitLengthM) % circuitLengthM;
  let travelledM = 0;
  for (let index = 0; index < circuit.length - 1; index++) {
    const start = circuit[index];
    const end = circuit[index + 1];
    const segmentM = Math.hypot(end.x - start.x, end.z - start.z);
    if (travelledM + segmentM >= wrappedM || index === circuit.length - 2) {
      return Math.atan2(end.x - start.x, end.z - start.z);
    }
    travelledM += segmentM;
  }
  return 0;
}

/**
 * Symbol-led, temporary first-lap cue plan. Every transition is driven by authoritative route
 * progress, sector, speed, or lap state; time only controls how long a lap acknowledgement stays.
 */
export function planWeekendGoldenPathCue(routeContract, snapshot, previous = {}, nowMs = 0) {
  const lap = Math.max(0, Number(snapshot?.lap) || 0);
  const lastLap = Math.max(0, Number(previous.lastLap) || 0);
  let acknowledgeUntilMs = Number(previous.acknowledgeUntilMs) || 0;
  if (lap > lastLap) acknowledgeUntilMs = nowMs + 2_400;
  const nextState = Object.freeze({ lastLap: lap, acknowledgeUntilMs });
  if (acknowledgeUntilMs > nowMs) {
    return Object.freeze({ kind: "lap", token: `✓ LAP ${lap}`, state: nextState });
  }

  const progressM = Number(snapshot?.circuit_progress_m);
  const circuitLengthM = Number(snapshot?.circuit_length_m);
  const speedMps = Math.hypot(snapshot?.vx ?? 0, snapshot?.vy ?? 0, snapshot?.vz ?? 0);
  const nextSector = Number(snapshot?.next_sector);
  const fractions = Array.from(routeContract?.sector_gate_progress ?? []);
  if (![progressM, circuitLengthM, nextSector].every(Number.isFinite) || !(circuitLengthM > 0)) {
    return Object.freeze({ kind: "none", token: "", state: nextState });
  }
  if (lap === 0 && nextSector === 0 && progressM < 90 && speedMps < 4) {
    return Object.freeze({ kind: "launch", token: "↑", state: nextState });
  }
  if (nextSector >= fractions.length) {
    const finishDistanceM = circuitLengthM - progressM;
    if (finishDistanceM >= 0 && finishDistanceM <= 180) {
      return Object.freeze({ kind: "finish", token: "◎", state: nextState });
    }
    return Object.freeze({ kind: "none", token: "", state: nextState });
  }

  const gateProgressM = Number(fractions[nextSector]) * circuitLengthM;
  const remainingM = gateProgressM - progressM;
  if (remainingM < 35 || remainingM > 190) {
    return Object.freeze({ kind: "none", token: "", state: nextState });
  }
  const circuit = Array.from(routeContract?.centreline ?? [], finitePoint).filter(Boolean);
  if (circuit.length < 4) {
    return Object.freeze({ kind: "none", token: "", state: nextState });
  }
  const before = routeHeadingAtProgress(circuit, gateProgressM - 55, circuitLengthM);
  const after = routeHeadingAtProgress(circuit, gateProgressM + 55, circuitLengthM);
  const turnRad = Math.atan2(Math.sin(after - before), Math.cos(after - before));
  const arrow = turnRad >= 0 ? "↱" : "↰";
  return Object.freeze({
    kind: "sector",
    token: `${arrow} S${nextSector + 1}`,
    state: nextState,
  });
}

export function planWeekendTrackDay(circuitContract) {
  if (circuitContract?.schema !== WEEKEND_ROUTE_SCHEMA
      || circuitContract?.route_kind !== "closed-circuit"
      || circuitContract?.closed !== true) {
    throw new Error("Weekend Track Day requires a closed-circuit Weekend route contract.");
  }
  const circuit = Array.from(circuitContract.centreline ?? [], finitePoint).filter(Boolean);
  if (circuit.length < 4) throw new Error("Weekend Track Day requires a closed sampled circuit.");
  const first = circuit[0];
  const last = circuit[circuit.length - 1];
  if (Math.hypot(first.x - last.x, first.z - last.z) > 0.1) {
    circuit.push(first);
  }

  const trackWidthM = Number(circuitContract.track_width_m);
  const pavementHalfWidthM = Number(circuitContract.pavement_half_width_m);
  if (!(trackWidthM > 0) || !(pavementHalfWidthM > trackWidthM * 0.5)) {
    throw new Error("Weekend Track Day requires authoritative track and pavement widths.");
  }
  const uniqueCount = circuit.length - 1;
  const elevationM = Number(circuitContract.surface_elevation_m);
  if (!Number.isFinite(elevationM)) {
    throw new Error("Weekend Track Day requires an authoritative surface elevation.");
  }
  const paddockAccessPoint = finitePoint(circuitContract.paddock_access);
  const paddockAccessHeadingRad = Number(circuitContract.paddock_access?.heading_rad);
  if (!paddockAccessPoint || !Number.isFinite(paddockAccessHeadingRad)) {
    throw new Error("Weekend Track Day requires an authoritative paddock access pose.");
  }

  let minimumX = Infinity;
  let maximumX = -Infinity;
  let minimumZ = Infinity;
  let maximumZ = -Infinity;
  for (const point of circuit) {
    minimumX = Math.min(minimumX, point.x);
    maximumX = Math.max(maximumX, point.x);
    minimumZ = Math.min(minimumZ, point.z);
    maximumZ = Math.max(maximumZ, point.z);
  }
  const bounds = Object.freeze({ minimumX, maximumX, minimumZ, maximumZ });
  const centroid = Object.freeze({
    x: circuit.slice(0, -1).reduce((sum, point) => sum + point.x, 0) / uniqueCount,
    z: circuit.slice(0, -1).reduce((sum, point) => sum + point.z, 0) / uniqueCount,
  });

  const coneStride = Math.max(1, Math.floor(uniqueCount / 48));
  const cones = [];
  for (let index = 0; index < uniqueCount; index += coneStride) {
    for (const side of [-1, 1]) {
      cones.push({
        kind: "course-cone",
        side,
        center: offsetFromTrack(circuit, index, side * (trackWidthM * 0.5 - 0.7)),
      });
    }
  }
  const tyreWalls = [];
  for (const [zone, fraction] of [0.08, 0.17, 0.29, 0.38, 0.52, 0.61, 0.73, 0.82].entries()) {
    const circuitIndex = Math.min(uniqueCount - 1, Math.floor(uniqueCount * fraction));
    const point = circuit[circuitIndex];
    const tangent = tangentAt(circuit, circuitIndex);
    const left = pointInTrackFrame(point, tangent, 0, pavementHalfWidthM + 12);
    const right = pointInTrackFrame(point, tangent, 0, -pavementHalfWidthM - 12);
    const leftRange = Math.hypot(left.x - centroid.x, left.z - centroid.z);
    const rightRange = Math.hypot(right.x - centroid.x, right.z - centroid.z);
    const outsideSign = leftRange >= rightRange ? 1 : -1;
    for (let index = 0; index < 16; index++) {
      tyreWalls.push({
        kind: "tyre-wall",
        zone,
        center: pointInTrackFrame(
          point,
          tangent,
          (index - 7.5) * 1.08,
          outsideSign * (pavementHalfWidthM + 12),
        ),
        headingRad: Math.atan2(tangent.x, tangent.z),
        stack: index % 4 === 0 || index % 4 === 1 ? 2 : 1,
      });
    }
  }

  const sectorFractions = Array.from(circuitContract.sector_gate_progress ?? [0.25, 0.5, 0.75]);
  const marshalPosts = sectorFractions.map((fraction, sector) => {
    const index = Math.min(uniqueCount - 1, Math.floor(uniqueCount * fraction));
    return {
      kind: "marshal-post",
      sector: sector + 1,
      center: offsetFromTrack(
        circuit,
        index,
        (sector % 2 === 0 ? 1 : -1) * (pavementHalfWidthM + 4),
      ),
    };
  });

  const startTangent = tangentAt(circuit, 0);
  const gantry = Object.freeze({
    kind: "start-gantry",
    center: Object.freeze({ x: first.x, y: elevationM, z: first.z }),
    headingRad: Math.atan2(startTangent.x, startTangent.z),
  });

  // Off-track world: generated landcover under a large ground plane, with no facility-shaped
  // rectangle granting or implying pavement authority.
  const ground = Object.freeze({ kind: "ground-plane", sizeM: 22_000 });

  // Horizon ring: a continuous treeline/hill band plus a few far building
  // silhouettes so deep off-track never reads as a bare two-tone gradient.
  // 5.5 km sits inside the sky sphere (8 km) and survives the fog (~11.7 km).
  const HORIZON_SEGMENTS = 48;
  const horizonSegments = [];
  for (let index = 0; index < HORIZON_SEGMENTS; index++) {
    const bearingRad = (index / HORIZON_SEGMENTS) * Math.PI * 2;
    // Deterministic pseudo-noise: overlapping sines make an irregular ridge.
    const ripple =
      Math.sin(index * 1.7) * 0.5 + Math.sin(index * 0.53 + 1.3) * 0.35 + Math.sin(index * 3.1) * 0.15;
    horizonSegments.push({
      kind: "horizon-ridge",
      bearingRad,
      heightM: 110 + ripple * 62 + 55 * Math.max(0, Math.sin(index * 0.29)),
      tone: (index % 3 + (index % 7 > 3 ? 1 : 0)) % 3,
    });
  }
  const horizonSilhouettes = [];
  for (const [bearingRad, rangeM, widthM, heightM] of [
    [0.35, 3_600, 260, 22],
    [0.75, 4_100, 180, 17],
    [2.4, 3_200, 220, 20],
    [3.6, 4_400, 300, 24],
    [4.4, 3_800, 160, 16],
    [5.5, 3_400, 240, 19],
  ]) {
    horizonSilhouettes.push({
      kind: "horizon-silhouette",
      center: Object.freeze({
        x: Math.cos(bearingRad) * rangeM,
        y: elevationM,
        z: Math.sin(bearingRad) * rangeM,
      }),
      bearingRad,
      widthM,
      heightM,
    });
  }
  const horizon = Object.freeze({
    radiusM: 5_500,
    segments: freezeAssets(horizonSegments),
    silhouettes: freezeAssets(horizonSilhouettes),
  });

  const leftFacility = pointInTrackFrame(first, startTangent, 0, pavementHalfWidthM + 40);
  const rightFacility = pointInTrackFrame(first, startTangent, 0, -pavementHalfWidthM - 40);
  const facilitySide = Math.hypot(leftFacility.x - centroid.x, leftFacility.z - centroid.z)
      >= Math.hypot(rightFacility.x - centroid.x, rightFacility.z - centroid.z)
    ? 1
    : -1;
  const raceControl = Object.freeze({
    kind: "race-control",
    center: pointInTrackFrame(first, startTangent, -22, facilitySide * (pavementHalfWidthM + 28)),
    widthM: 18,
    depthM: 9,
    heightM: 12,
    headingRad: gantry.headingRad,
  });
  const pitGarage = Object.freeze({
    kind: "pit-garage",
    center: pointInTrackFrame(first, startTangent, 62, facilitySide * (pavementHalfWidthM + 34)),
    widthM: 68,
    depthM: 14,
    heightM: 7.5,
    headingRad: gantry.headingRad,
  });

  // Large-scale patchwork sits under the circuit ribbons, augmenting the generated landcover
  // without creating another paved rectangle.
  // Smaller, staggered overlays prevent the old kilometre-wide olive slabs. The canonical
  // parcel texture supplies internal crop/hedge detail while these rotated tones break tiling.
  const fieldPatches = [];
  const patchRows = [-3_750, -2_750, -1_850, -1_050, -510, 720, 1_420, 2_250, 3_200];
  for (const [row, z] of patchRows.entries()) {
    const columns = row % 2 === 0 ? [-3_900, -1_450, 1_150, 3_650] : [-3_100, -650, 2_050];
    for (const [column, x] of columns.entries()) {
      fieldPatches.push({
        kind: "field-patch",
        tone: (row * 2 + column) % 5,
        center: Object.freeze({
          x: x + Math.sin(row * 1.7 + column) * 180,
          y: elevationM,
          z: z + Math.cos(column * 1.3 + row) * 95,
        }),
        widthM: 1_750 + ((row + column) % 3) * 260,
        depthM: 540 + ((row * 3 + column) % 4) * 105,
        headingRad: (Math.sin(row * 0.81 + column * 1.17) * 0.11),
      });
    }
  }
  const accessRoad = Object.freeze({
    kind: "access-road",
    start: paddockAccessPoint,
    headingRad: paddockAccessHeadingRad,
    lengthM: 2_400,
    widthM: 8,
  });

  // Hedgerows: field-boundary rows along the patch seams. Kilometre-long
  // verticals survive the eye-height compression that flattens painted bands,
  // so the patchwork still reads as fields from deep off-track. The +z rows are
  // split around the access road so the hedge never grows across the dirt.
  const roadXAtZ = (z) =>
    accessRoad.start.x + Math.sin(accessRoad.headingRad) * ((z - accessRoad.start.z) / Math.cos(accessRoad.headingRad));
  const hedgerows = [];
  const pushHedgerow = (centerX, z, lengthM, heightM, headingRad = 0) => {
    const segmentLengthM = 72;
    const count = Math.max(1, Math.floor(lengthM / segmentLengthM));
    for (let index = 0; index < count; index++) {
      const alongM = (index - (count - 1) * 0.5) * segmentLengthM;
      hedgerows.push({
        kind: "hedgerow",
        center: Object.freeze({
          x: centerX + Math.cos(headingRad) * alongM,
          y: elevationM,
          z: z + Math.sin(headingRad) * alongM + Math.sin(index * 1.9) * 3.2,
        }),
        lengthM: segmentLengthM - 7 + (index % 3) * 3,
        heightM: heightM * (0.82 + (index % 5) * 0.065),
        depthM: 5.2 + (index % 4) * 0.9,
        headingRad,
        tone: index % 4,
      });
    }
  };
  pushHedgerow(-850, -690, 3_500, 4.4, 0.035);
  pushHedgerow(800, -1_590, 4_000, 3.9, -0.025);
  pushHedgerow(-1_300, -2_330, 3_400, 4.8, 0.055);
  for (const [z, heightM] of [[900, 3.4], [1_690, 3.8]]) {
    const gapX = roadXAtZ(z);
    pushHedgerow(gapX - 30 - 1_400, z, 2_800, heightM + 0.8, -0.03);
    pushHedgerow(gapX + 30 + 1_150, z, 2_300, heightM + 0.8, 0.04);
  }

  // Midfield verticals: flat tone bands compress to a few pixels past ~300 m,
  // so copses of illustrative trees and a few farm blocks carry the parallax
  // that tells a deep off-track rider they are moving and which way is home.
  const trees = [];
  let seed = 41;
  const nextRandom = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  for (let copse = 0; copse < 108; copse++) {
    const bearingRad = nextRandom() * Math.PI * 2;
    const rangeM = 430 + nextRandom() * 3_800;
    const copseX = Math.cos(bearingRad) * rangeM;
    const copseZ = Math.sin(bearingRad) * rangeM;
    if (distanceToCircuit(circuit, { x: copseX, z: copseZ }) < pavementHalfWidthM + 90) continue;
    const count = 5 + Math.floor(nextRandom() * 6);
    for (let index = 0; index < count; index++) {
      const region = index === 0 ? "eucalyptus" : index % 3 === 0 ? "dry-grass" : "scrub";
      const heightM = region === "eucalyptus"
        ? 13 + nextRandom() * 10
        : region === "dry-grass" ? 3.2 + nextRandom() * 2.2 : 4.5 + nextRandom() * 4;
      trees.push({
        kind: "ecology-card",
        region,
        center: Object.freeze({
          x: copseX + (nextRandom() - 0.5) * 120,
          y: elevationM,
          z: copseZ + (nextRandom() - 0.5) * 120,
        }),
        widthM: heightM * (region === "eucalyptus" ? 1.18 : 1.35),
        heightM,
        headingRad: nextRandom() * Math.PI,
        variant: Math.floor(nextRandom() * 3),
      });
    }
  }
  // Track-relative clusters guarantee layered vegetation at riding height, not only random
  // kilometre-scale dots. They remain presentation-only and clear the paved corridor.
  const ecologyStride = Math.max(12, Math.floor(uniqueCount / 36));
  for (let index = 0; index < uniqueCount; index += ecologyStride) {
    const tangent = tangentAt(circuit, index);
    for (const side of [-1, 1]) {
      for (let layer = 0; layer < 3; layer++) {
        const selector = (index / ecologyStride + layer + (side > 0 ? 1 : 0)) % 4;
        const region = selector === 0 ? "eucalyptus" : selector === 3 ? "dry-grass" : "scrub";
        const heightM = region === "eucalyptus"
          ? 16 + nextRandom() * 8
          : region === "dry-grass" ? 4.2 + nextRandom() * 2.4 : 6 + nextRandom() * 4;
        trees.push({
          kind: "ecology-card",
          region,
          center: Object.freeze(pointInTrackFrame(
            circuit[index],
            tangent,
            (layer - 1) * 19 + (nextRandom() - 0.5) * 22,
            side * (pavementHalfWidthM + 38 + layer * 19 + nextRandom() * 34),
          )),
          widthM: heightM * (region === "eucalyptus" ? 1.18 : 1.35),
          heightM,
          headingRad: Math.atan2(tangent.x, tangent.z) + Math.PI * 0.5
            + (nextRandom() - 0.5) * 0.38,
          variant: Math.floor(nextRandom() * 3),
        });
      }
    }
  }
  for (let index = trees.length - 1; index >= 0; index--) {
    if (distanceToCircuit(circuit, trees[index].center) < pavementHalfWidthM + 28)
      trees.splice(index, 1);
  }
  const farms = freezeAssets([
    { kind: "farm", center: { x: 2_250, y: elevationM, z: -950 }, widthM: 26, depthM: 12, heightM: 8, headingRad: 0.4, tone: 0 },
    { kind: "farm", center: { x: 2_290, y: elevationM, z: -910 }, widthM: 12, depthM: 9, heightM: 5, headingRad: 0.4, tone: 1 },
    { kind: "farm", center: { x: -1_950, y: elevationM, z: 1_180 }, widthM: 30, depthM: 13, heightM: 9, headingRad: -0.7, tone: 0 },
    { kind: "farm", center: { x: -1_600, y: elevationM, z: -2_050 }, widthM: 24, depthM: 11, heightM: 7, headingRad: 1.1, tone: 1 },
    { kind: "farm", center: { x: 1_500, y: elevationM, z: 2_400 }, widthM: 28, depthM: 12, heightM: 8, headingRad: 2.2, tone: 0 },
  ].map((farm) => ({ ...farm, center: Object.freeze(farm.center) })));

  // Low rolling landforms sit fully outside the circuit bounds. They give the riding-height
  // camera a layered horizon without changing collision, route, or grip authority.
  const relief = freezeAssets([
    { center: { x: 1_580, y: elevationM, z: 260 }, radiusXM: 610, radiusZM: 520, heightM: 32, phase: 0.4 },
    { center: { x: -1_620, y: elevationM, z: 180 }, radiusXM: 650, radiusZM: 540, heightM: 29, phase: 1.3 },
    { center: { x: 60, y: elevationM, z: 1_360 }, radiusXM: 920, radiusZM: 610, heightM: 38, phase: 2.1 },
    { center: { x: -120, y: elevationM, z: -1_250 }, radiusXM: 880, radiusZM: 560, heightM: 34, phase: 2.9 },
    { center: { x: 1_650, y: elevationM, z: -1_000 }, radiusXM: 720, radiusZM: 520, heightM: 26, phase: 3.6 },
    { center: { x: -1_700, y: elevationM, z: 1_050 }, radiusXM: 760, radiusZM: 540, heightM: 31, phase: 4.4 },
  ].map((patch) => ({ ...patch, center: Object.freeze(patch.center) })));

  const paddock = [];
  for (let index = 0; index < 6; index++) {
    const alongM = -86 + (index % 3) * 24;
    const crossM = facilitySide * (pavementHalfWidthM + 68 + Math.floor(index / 3) * 15);
    paddock.push({
      kind: index < 3 ? "paddock-canopy" : "service-vehicle",
      center: pointInTrackFrame(first, startTangent, alongM, crossM),
      team: index % 3,
    });
  }

  return Object.freeze({
    schema: WEEKEND_TRACK_DAY_SCHEMA,
    circuitId: String(circuitContract.id ?? ""),
    trackWidthM,
    elevationM,
    circuitLengthM: Number(circuitContract.circuit_length_m),
    pavementHalfWidthM,
    runoffWidthM: pavementHalfWidthM - trackWidthM * 0.5,
    bounds,
    paddockAccess: Object.freeze({
      center: paddockAccessPoint,
      headingRad: paddockAccessHeadingRad,
    }),
    ground,
    circuit: Object.freeze(circuit),
    gantry,
    marshalPosts: freezeAssets(marshalPosts),
    cones: freezeAssets(cones),
    tyreWalls: freezeAssets(tyreWalls),
    paddock: freezeAssets(paddock),
    horizon,
    raceControl,
    pitGarage,
    fieldPatches: freezeAssets(fieldPatches),
    accessRoad,
    hedgerows: freezeAssets(hedgerows),
    trees: freezeAssets(trees),
    farms,
    relief,
  });
}

function scenePoint(THREE, point, liftM = 0) {
  return new THREE.Vector3(point.x, point.y + liftM, -point.z);
}

function circuitNormal(circuit, index) {
  const tangent = tangentAt(circuit, index);
  return { x: -tangent.z, z: tangent.x };
}

function buildRibbonGeometry(
  THREE,
  circuit,
  halfWidthM,
  liftM,
  metresPerTile = TRACK_TEXTURE_METRES_PER_TILE,
) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let distanceAlongM = 0;
  for (let index = 0; index < circuit.length; index++) {
    if (index > 0) {
      const previous = circuit[index - 1];
      const current = circuit[index];
      distanceAlongM += Math.hypot(current.x - previous.x, current.z - previous.z);
    }
    const normal = circuitNormal(circuit, index % (circuit.length - 1));
    const point = circuit[index];
    for (const side of [-1, 1]) {
      positions.push(
        point.x + normal.x * halfWidthM * side,
        point.y + liftM,
        -(point.z + normal.z * halfWidthM * side),
      );
      uvs.push(
        distanceAlongM / metresPerTile,
        side * halfWidthM / metresPerTile,
      );
    }
    if (index < circuit.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildEdgeGeometry(THREE, circuit, halfWidthM, stripWidthM, liftM) {
  const positions = [];
  const colours = [];
  const indices = [];
  const red = new THREE.Color(0xb52924);
  const ivory = new THREE.Color(0xe9e1ce);
  let vertex = 0;
  for (let index = 0; index < circuit.length - 1; index++) {
    const colour = Math.floor(index / 5) % 2 === 0 ? red : ivory;
    for (const side of [-1, 1]) {
      for (const endpoint of [index, index + 1]) {
        const normal = circuitNormal(circuit, endpoint % (circuit.length - 1));
        const point = circuit[endpoint];
        for (const inset of [0, stripWidthM]) {
          const offsetM = side * (halfWidthM - inset);
          positions.push(
            point.x + normal.x * offsetM,
            point.y + liftM,
            -(point.z + normal.z * offsetM),
          );
          colours.push(colour.r, colour.g, colour.b);
        }
      }
      if (side < 0) {
        indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
      } else {
        indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
      }
      vertex += 4;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildTwinStripGeometry(THREE, circuit, centerOffsetM, widthM, liftM) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let vertex = 0;
  let distanceAlongM = 0;
  for (let index = 0; index < circuit.length - 1; index++) {
    if (index > 0) {
      distanceAlongM += Math.hypot(
        circuit[index].x - circuit[index - 1].x,
        circuit[index].z - circuit[index - 1].z,
      );
    }
    const segmentM = Math.hypot(
      circuit[index + 1].x - circuit[index].x,
      circuit[index + 1].z - circuit[index].z,
    );
    for (const side of [-1, 1]) {
      for (const endpoint of [index, index + 1]) {
        const point = circuit[endpoint];
        const normal = circuitNormal(circuit, endpoint % (circuit.length - 1));
        for (const edge of [-0.5, 0.5]) {
          const offsetM = side * (centerOffsetM + edge * widthM);
          positions.push(
            point.x + normal.x * offsetM,
            point.y + liftM,
            -(point.z + normal.z * offsetM),
          );
          uvs.push((distanceAlongM + (endpoint === index ? 0 : segmentM)) / 8, edge + 0.5);
        }
      }
      if (side < 0) {
        indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
      } else {
        indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
      }
      vertex += 4;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRollingReliefGeometry(THREE, plan) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = 12;
  let vertex = 0;
  for (const patch of plan.relief) {
    for (let iz = 0; iz <= segments; iz++) {
      const zUnit = iz / segments * 2 - 1;
      for (let ix = 0; ix <= segments; ix++) {
        const xUnit = ix / segments * 2 - 1;
        const radial = Math.min(1, Math.hypot(xUnit, zUnit));
        const falloff = Math.pow(Math.max(0, Math.cos(radial * Math.PI * 0.5)), 2);
        const ripple = 1 + 0.12 * Math.sin(ix * 1.7 + patch.phase)
          * Math.sin(iz * 1.3 + patch.phase * 0.7);
        const x = patch.center.x + xUnit * patch.radiusXM;
        const z = patch.center.z + zUnit * patch.radiusZM;
        positions.push(x, plan.elevationM - 0.04 + patch.heightM * falloff * ripple, -z);
        uvs.push(x / FIELD_TEXTURE_METRES_PER_TILE, z / FIELD_TEXTURE_METRES_PER_TILE);
      }
    }
    const row = segments + 1;
    for (let iz = 0; iz < segments; iz++) {
      for (let ix = 0; ix < segments; ix++) {
        const a = vertex + iz * row + ix;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    vertex += row * row;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildEcologyGeometry(THREE, plan) {
  const regions = {
    eucalyptus: {
      uMin: 0, vMin: 0, uSize: 0.5, vSize: 0.5,
      tints: [[1.12, 1.18, 1.08], [1.05, 1.14, 1.02], [1.16, 1.12, 1.01]],
    },
    "dry-grass": {
      uMin: 0.5, vMin: 0, uSize: 0.5, vSize: 0.5,
      tints: [[1.10, 1.09, 0.98], [1.16, 1.10, 0.94], [1.05, 1.13, 1.00]],
    },
    scrub: {
      uMin: 0, vMin: 0.5, uSize: 0.5, vSize: 0.5,
      tints: [[1.10, 1.17, 1.03], [1.04, 1.13, 0.98], [1.15, 1.12, 0.98]],
    },
  };
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  let vertex = 0;
  const pushCard = (tree, angleRad) => {
    const region = regions[tree.region] ?? regions.scrub;
    const tint = region.tints[tree.variant % region.tints.length];
    const rightX = Math.cos(angleRad);
    const rightZ = -Math.sin(angleRad);
    const normalX = Math.sin(angleRad);
    const normalZ = Math.cos(angleRad);
    const halfWidthM = tree.widthM * 0.5;
    const leftX = tree.center.x - rightX * halfWidthM;
    const leftZ = tree.center.z - rightZ * halfWidthM;
    const rightWorldX = tree.center.x + rightX * halfWidthM;
    const rightWorldZ = tree.center.z + rightZ * halfWidthM;
    positions.push(
      leftX, tree.center.y + 0.04, -leftZ,
      rightWorldX, tree.center.y + 0.04, -rightWorldZ,
      rightWorldX, tree.center.y + tree.heightM, -rightWorldZ,
      leftX, tree.center.y + tree.heightM, -leftZ,
    );
    for (let index = 0; index < 4; index++) normals.push(normalX, 0, -normalZ);
    for (let index = 0; index < 4; index++) colors.push(...tint);
    const u0 = region.uMin;
    const u1 = region.uMin + region.uSize;
    const vTop = region.vMin;
    const vBottom = region.vMin + region.vSize;
    uvs.push(u0, vBottom, u1, vBottom, u1, vTop, u0, vTop);
    indices.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2);
    vertex += 4;
  };
  for (const tree of plan.trees) {
    pushCard(tree, tree.headingRad);
    pushCard(tree, tree.headingRad + Math.PI * 0.5);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function addStartFinish(THREE, root, plan) {
  const group = new THREE.Group();
  group.name = "weekend-start-finish-gantry";
  group.position.copy(scenePoint(THREE, plan.gantry.center, 0.09));
  group.rotation.y = plan.gantry.headingRad;
  const black = new THREE.MeshBasicMaterial({ color: 0x111513 });
  const white = new THREE.MeshBasicMaterial({ color: 0xf1ead8 });
  const squareWidthM = plan.trackWidthM / 10;
  for (let column = 0; column < 10; column++) {
    for (let row = 0; row < 2; row++) {
      const square = new THREE.Mesh(
        new THREE.BoxGeometry(squareWidthM, 0.04, 0.8),
        (column + row) % 2 === 0 ? white : black,
      );
      square.position.set(
        -plan.trackWidthM * 0.5 + squareWidthM * (column + 0.5),
        0,
        (row - 0.5) * 0.8,
      );
      group.add(square);
    }
  }

  const gantryMaterial = new THREE.MeshStandardMaterial({
    color: 0xe46d24,
    roughness: 0.7,
    metalness: 0.08,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e2523,
    roughness: 0.65,
  });
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.65, 5.5, 0.8), gantryMaterial);
    pylon.position.set(side * (plan.trackWidthM * 0.5 + 1.1), 2.7, 0);
    group.add(pylon);
  }
  const crossbar = new THREE.Mesh(
    new THREE.BoxGeometry(plan.trackWidthM + 2.8, 0.8, 1.0),
    darkMaterial,
  );
  crossbar.position.y = 5.3;
  group.add(crossbar);
  for (let index = 0; index < 9; index++) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.42, 0.05),
      index % 2 === 0 ? white : black,
    );
    panel.position.set((index - 4) * 1.65, 5.3, -0.53);
    group.add(panel);
  }
  root.add(group);
}

function addInstancedMarkers(THREE, root, plan) {
  const coneGeometry = new THREE.ConeGeometry(0.35, 1.15, 8);
  const coneMaterial = new THREE.MeshStandardMaterial({
    color: 0xf47b20,
    roughness: 0.72,
  });
  const cones = new THREE.InstancedMesh(coneGeometry, coneMaterial, plan.cones.length);
  cones.name = "weekend-course-cones";
  const transform = new THREE.Object3D();
  plan.cones.forEach((cone, index) => {
    transform.position.copy(scenePoint(THREE, cone.center, 0.58));
    transform.rotation.set(0, index * 0.31, 0);
    transform.updateMatrix();
    cones.setMatrixAt(index, transform.matrix);
  });
  cones.instanceMatrix.needsUpdate = true;
  root.add(cones);

  const tyreGeometry = new THREE.TorusGeometry(0.52, 0.19, 8, 14);
  const tyreMaterial = new THREE.MeshStandardMaterial({
    color: 0x151817,
    roughness: 0.96,
  });
  const tyreCount = plan.tyreWalls.reduce((sum, wall) => sum + wall.stack, 0);
  const tyres = new THREE.InstancedMesh(tyreGeometry, tyreMaterial, tyreCount);
  tyres.name = "weekend-tyre-walls";
  let tyreIndex = 0;
  for (const wall of plan.tyreWalls) {
    for (let stack = 0; stack < wall.stack; stack++) {
      transform.position.copy(scenePoint(THREE, wall.center, 0.55 + stack * 0.78));
      transform.rotation.set(0, wall.headingRad + Math.PI / 2, 0);
      transform.updateMatrix();
      tyres.setMatrixAt(tyreIndex++, transform.matrix);
    }
  }
  tyres.instanceMatrix.needsUpdate = true;
  root.add(tyres);
}

function addMarshalPosts(THREE, root, plan) {
  const orange = new THREE.MeshStandardMaterial({ color: 0xff7021, roughness: 0.75 });
  const pale = new THREE.MeshBasicMaterial({ color: 0xf1e3bc, side: THREE.DoubleSide });
  for (const post of plan.marshalPosts) {
    const group = new THREE.Group();
    group.name = `weekend-marshal-post-${post.sector}`;
    group.position.copy(scenePoint(THREE, post.center, 0));
    const shelter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 1.5), orange);
    shelter.position.y = 0.9;
    group.add(shelter);
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.8, 6), pale);
    flagPole.position.set(1.5, 1.9, 0);
    group.add(flagPole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), pale);
    flag.position.set(2.1, 3.1, 0);
    group.add(flag);
    root.add(group);
  }
}

function addPaddock(THREE, root, plan) {
  const canopyColours = [0x254d63, 0x8b2d28, 0xdbc477];
  const dark = new THREE.MeshStandardMaterial({ color: 0x252c2a, roughness: 0.82 });
  for (const asset of plan.paddock) {
    const group = new THREE.Group();
    group.name = `weekend-${asset.kind}-${asset.team}`;
    group.position.copy(scenePoint(THREE, asset.center, 0));
    if (asset.kind === "paddock-canopy") {
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(5.2, 2.0, 4),
        new THREE.MeshStandardMaterial({
          color: canopyColours[asset.team],
          roughness: 0.76,
        }),
      );
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 3.8;
      group.add(roof);
      for (const x of [-3.5, 3.5]) {
        for (const z of [-3.5, 3.5]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 0.12), dark);
          leg.position.set(x, 1.8, z);
          group.add(leg);
        }
      }
    } else {
      const van = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 2.6, 2.5),
        new THREE.MeshStandardMaterial({
          color: canopyColours[asset.team],
          roughness: 0.68,
        }),
      );
      van.position.y = 1.3;
      group.add(van);
      for (const x of [-2, 2]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.28, 12), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.48, 1.35);
        group.add(wheel);
      }
    }
    root.add(group);
  }

}

function addHorizon(THREE, root, plan) {
  // One merged ridge band: quads between consecutive bearing boundaries whose top
  // edge follows the per-segment heights, so the silhouette reads as wooded hills.
  const segments = plan.horizon.segments;
  const radius = plan.horizon.radiusM;
  const ridgeTones = [
    new THREE.Color(0x526958),
    new THREE.Color(0x465e50),
    new THREE.Color(0x5c715d),
  ];
  const positions = [];
  const colours = [];
  const indices = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const x = Math.cos(segment.bearingRad) * radius;
    const z = Math.sin(segment.bearingRad) * radius;
    const tone = ridgeTones[segment.tone % ridgeTones.length];
    // Bottom sinks below ground so no sliver of sky leaks under the band.
    positions.push(x, plan.elevationM - 12, -z);
    positions.push(x, plan.elevationM + segment.heightM, -z);
    for (let vertex = 0; vertex < 2; vertex++) colours.push(tone.r, tone.g, tone.b);
    const next = ((index + 1) % segments.length) * 2;
    const base = index * 2;
    indices.push(base, next, base + 1, base + 1, next, next + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  const ridge = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  ridge.name = "weekend-horizon-ridge";
  ridge.frustumCulled = false;
  root.add(ridge);

  // Far building silhouettes: one instanced box, flat tone, hazed by the fog.
  const silhouettes = plan.horizon.silhouettes;
  const blocks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x74827d }),
    silhouettes.length,
  );
  blocks.name = "weekend-horizon-silhouettes";
  const transform = new THREE.Object3D();
  silhouettes.forEach((silhouette, index) => {
    transform.position.copy(scenePoint(THREE, silhouette.center, silhouette.heightM / 2));
    transform.rotation.set(0, silhouette.bearingRad, 0);
    transform.scale.set(silhouette.widthM, silhouette.heightM, 42);
    transform.updateMatrix();
    blocks.setMatrixAt(index, transform.matrix);
  });
  blocks.instanceMatrix.needsUpdate = true;
  root.add(blocks);
}

function addMidfield(THREE, root, plan, roadsideAtlas) {
  const trees = new THREE.Mesh(
    buildEcologyGeometry(THREE, plan),
    // The atlas is painted with its own sun/lee modelling. Keeping the cards unlit
    // preserves those midtones instead of driving crossed normals into black clumps.
    new THREE.MeshBasicMaterial({
      color: roadsideAtlas ? 0xffffff : 0x667f58,
      map: roadsideAtlas,
      vertexColors: true,
      alphaTest: roadsideAtlas ? 0.28 : 0,
      side: THREE.DoubleSide,
    }),
  );
  trees.name = "weekend-midfield-trees-roadside-atlas";
  trees.receiveShadow = true;
  root.add(trees);

  const farmTones = [new THREE.Color(0xa45f4c), new THREE.Color(0x7d8580)];
  const farms = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    plan.farms.length,
  );
  farms.name = "weekend-farm-buildings";
  const transform = new THREE.Object3D();
  plan.farms.forEach((farm, index) => {
    transform.position.copy(scenePoint(THREE, farm.center, farm.heightM / 2));
    transform.rotation.set(0, farm.headingRad, 0);
    transform.scale.set(farm.widthM, farm.heightM, farm.depthM);
    transform.updateMatrix();
    farms.setMatrixAt(index, transform.matrix);
    farms.setColorAt(index, farmTones[farm.tone % farmTones.length]);
  });
  farms.instanceMatrix.needsUpdate = true;
  if (farms.instanceColor) farms.instanceColor.needsUpdate = true;
  root.add(farms);
}

function addCircuitFacilities(THREE, root, plan) {
  const control = plan.raceControl;
  const controlGroup = new THREE.Group();
  controlGroup.name = "weekend-race-control";
  controlGroup.position.copy(scenePoint(THREE, control.center, 0));
  controlGroup.rotation.y = control.headingRad;
  const controlBlock = new THREE.Mesh(
    new THREE.BoxGeometry(control.widthM, control.heightM, control.depthM),
    new THREE.MeshStandardMaterial({ color: 0xe0e4dc, roughness: 0.78 }),
  );
  controlBlock.position.y = control.heightM / 2;
  controlGroup.add(controlBlock);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(control.widthM * 0.82, 2.1, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x3b5d67, roughness: 0.28, metalness: 0.18 }),
  );
  glass.position.set(0, control.heightM - 2.3, -control.depthM * 0.5 - 0.08);
  controlGroup.add(glass);
  const mullions = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 2.25, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xe9eee8 }),
    5,
  );
  mullions.name = "weekend-race-control-window-mullions";
  const detailTransform = new THREE.Object3D();
  for (let index = 0; index < 5; index++) {
    detailTransform.position.set(
      (index - 2) * control.widthM * 0.17,
      control.heightM - 2.3,
      -control.depthM * 0.5 - 0.19,
    );
    detailTransform.updateMatrix();
    mullions.setMatrixAt(index, detailTransform.matrix);
  }
  mullions.instanceMatrix.needsUpdate = true;
  controlGroup.add(mullions);
  const controlRoof = new THREE.Mesh(
    new THREE.BoxGeometry(control.widthM + 2.2, 0.55, control.depthM + 2.1),
    new THREE.MeshStandardMaterial({ color: 0xf3eedf, roughness: 0.68 }),
  );
  controlRoof.position.y = control.heightM + 0.25;
  controlGroup.add(controlRoof);
  const controlAccent = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, control.heightM * 0.84, control.depthM + 0.35),
    new THREE.MeshStandardMaterial({ color: 0xf47a2d, roughness: 0.66 }),
  );
  controlAccent.position.set(-control.widthM * 0.5 + 1.4, control.heightM * 0.47, 0);
  controlGroup.add(controlAccent);
  const balcony = new THREE.Mesh(
    new THREE.BoxGeometry(control.widthM * 0.86, 0.28, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x65716e, roughness: 0.74 }),
  );
  balcony.position.set(0, control.heightM - 3.7, -control.depthM * 0.5 - 1.05);
  controlGroup.add(balcony);
  const balconyRail = new THREE.Mesh(
    new THREE.BoxGeometry(control.widthM * 0.82, 0.14, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xe6ebe5 }),
  );
  balconyRail.position.set(0, control.heightM - 2.45, -control.depthM * 0.5 - 2.15);
  controlGroup.add(balconyRail);
  const balconyPosts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 1.25, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xe6ebe5 }),
    7,
  );
  balconyPosts.name = "weekend-race-control-balcony-posts";
  for (let index = 0; index < 7; index++) {
    detailTransform.position.set(
      (index - 3) * control.widthM * 0.125,
      control.heightM - 3.05,
      -control.depthM * 0.5 - 2.15,
    );
    detailTransform.updateMatrix();
    balconyPosts.setMatrixAt(index, detailTransform.matrix);
  }
  balconyPosts.instanceMatrix.needsUpdate = true;
  controlGroup.add(balconyPosts);
  root.add(controlGroup);

  const garage = plan.pitGarage;
  const garageGroup = new THREE.Group();
  garageGroup.name = "weekend-pit-garage";
  garageGroup.position.copy(scenePoint(THREE, garage.center, 0));
  garageGroup.rotation.y = garage.headingRad;
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(garage.widthM, garage.heightM, garage.depthM),
    new THREE.MeshStandardMaterial({ color: 0xe1dfd2, roughness: 0.84 }),
  );
  block.position.y = garage.heightM / 2;
  garageGroup.add(block);
  const garageRoof = new THREE.Mesh(
    new THREE.BoxGeometry(garage.widthM + 3, 0.65, garage.depthM + 3),
    new THREE.MeshStandardMaterial({ color: 0x657674, roughness: 0.72 }),
  );
  garageRoof.position.y = garage.heightM + 0.28;
  garageGroup.add(garageRoof);
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d5960,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });
  for (let bay = -3; bay <= 3; bay++) {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(7.1, 4.7), doorMaterial);
    door.position.set(bay * 8.4, 2.45, -garage.depthM * 0.5 - 0.02);
    garageGroup.add(door);
  }
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(garage.widthM * 0.92, 0.38, 3.1),
    new THREE.MeshStandardMaterial({ color: 0xf5792e, roughness: 0.68 }),
  );
  awning.position.set(0, garage.heightM - 1.2, -garage.depthM * 0.5 - 1.35);
  garageGroup.add(awning);
  const pitWall = new THREE.Mesh(
    new THREE.BoxGeometry(garage.widthM * 0.84, 1.25, 0.62),
    new THREE.MeshStandardMaterial({ color: 0xf4eddb, roughness: 0.86 }),
  );
  pitWall.position.set(0, 0.62, -garage.depthM * 0.5 - 8.5);
  garageGroup.add(pitWall);
  const doorJambs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.32, 5.1, 0.24),
    new THREE.MeshBasicMaterial({ color: 0xe8e9df }),
    8,
  );
  doorJambs.name = "weekend-pit-garage-door-jambs";
  for (let index = 0; index < 8; index++) {
    detailTransform.position.set(
      (index - 3.5) * 8.4,
      2.55,
      -garage.depthM * 0.5 - 0.16,
    );
    detailTransform.updateMatrix();
    doorJambs.setMatrixAt(index, detailTransform.matrix);
  }
  doorJambs.instanceMatrix.needsUpdate = true;
  garageGroup.add(doorJambs);
  const garageFascia = new THREE.Mesh(
    new THREE.BoxGeometry(garage.widthM * 0.94, 0.66, 0.28),
    new THREE.MeshBasicMaterial({ color: 0xf2eee2 }),
  );
  garageFascia.position.set(0, garage.heightM - 0.72, -garage.depthM * 0.5 - 0.18);
  garageGroup.add(garageFascia);
  const roofVents = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.6, 0.75, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xaebbb7, roughness: 0.64 }),
    5,
  );
  roofVents.name = "weekend-pit-garage-roof-vents";
  for (let index = 0; index < 5; index++) {
    detailTransform.position.set((index - 2) * 12, garage.heightM + 0.9, 0);
    detailTransform.updateMatrix();
    roofVents.setMatrixAt(index, detailTransform.matrix);
  }
  roofVents.instanceMatrix.needsUpdate = true;
  garageGroup.add(roofVents);
  const pitStripe = new THREE.Mesh(
    new THREE.BoxGeometry(garage.widthM * 0.84, 0.18, 0.68),
    new THREE.MeshBasicMaterial({ color: 0xf06e2c }),
  );
  pitStripe.position.set(0, 1.16, -garage.depthM * 0.5 - 8.5);
  garageGroup.add(pitStripe);
  const fencePosts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.1, 1.55, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xd9dfda }),
    15,
  );
  fencePosts.name = "weekend-pit-wall-fence-posts";
  for (let index = 0; index < 15; index++) {
    detailTransform.position.set(
      (index - 7) * garage.widthM * 0.057,
      2.0,
      -garage.depthM * 0.5 - 8.5,
    );
    detailTransform.updateMatrix();
    fencePosts.setMatrixAt(index, detailTransform.matrix);
  }
  fencePosts.instanceMatrix.needsUpdate = true;
  garageGroup.add(fencePosts);
  for (const y of [1.45, 2.35]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(garage.widthM * 0.82, 0.1, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xd9dfda }),
    );
    rail.position.set(0, y, -garage.depthM * 0.5 - 8.5);
    garageGroup.add(rail);
  }
  root.add(garageGroup);
}

function addHedgerows(THREE, root, plan) {
  const hedgeTones = [
    new THREE.Color(0x5f7b4c),
    new THREE.Color(0x4f6d45),
    new THREE.Color(0x718054),
    new THREE.Color(0x566a4a),
  ];
  const rows = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    plan.hedgerows.length,
  );
  rows.name = "weekend-field-hedgerows";
  const transform = new THREE.Object3D();
  plan.hedgerows.forEach((row, index) => {
    transform.position.copy(scenePoint(THREE, row.center, row.heightM / 2));
    transform.rotation.set(0, row.headingRad, 0);
    transform.scale.set(row.lengthM, row.heightM, row.depthM);
    transform.updateMatrix();
    rows.setMatrixAt(index, transform.matrix);
    rows.setColorAt(index, hedgeTones[row.tone % hedgeTones.length]);
  });
  rows.instanceMatrix.needsUpdate = true;
  if (rows.instanceColor) rows.instanceColor.needsUpdate = true;
  root.add(rows);
}

function addRollingRelief(THREE, root, plan, fieldTexture) {
  const relief = new THREE.Mesh(
    buildRollingReliefGeometry(THREE, plan),
    new THREE.MeshStandardMaterial({
      color: fieldTexture ? 0xdde6d4 : 0x809469,
      map: fieldTexture,
      roughness: 1,
      metalness: 0,
    }),
  );
  relief.name = "weekend-rolling-field-relief";
  relief.receiveShadow = true;
  root.add(relief);
}

function addFieldPatchwork(THREE, root, plan, fieldTexture) {
  // Mowed/unmowed overlays modulate the macro parcel map without returning to
  // kilometre-wide flat slabs. The access road is deliberately a separate material.
  const patchTones = [
    new THREE.Color(0xd7c99e), // dry mown grass
    new THREE.Color(0x9ebc87), // green pasture
    new THREE.Color(0xb6b992), // mixed scrub
    new THREE.Color(0xd8c090), // harvested tan
    new THREE.Color(0x89aa82), // damp field
  ];
  const positions = [];
  const colours = [];
  const uvs = [];
  const indices = [];
  let vertex = 0;
  const pushQuad = (corners, y, tone) => {
    for (const [x, z] of corners) {
      positions.push(x, y, -z);
      colours.push(tone.r, tone.g, tone.b);
      uvs.push(x / FIELD_TEXTURE_METRES_PER_TILE, z / FIELD_TEXTURE_METRES_PER_TILE);
    }
    indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    vertex += 4;
  };
  for (const patch of plan.fieldPatches) {
    const halfW = patch.widthM / 2;
    const halfD = patch.depthM / 2;
    const cos = Math.cos(patch.headingRad);
    const sin = Math.sin(patch.headingRad);
    const corner = (localX, localZ) => [
      patch.center.x + localX * cos + localZ * sin,
      patch.center.z - localX * sin + localZ * cos,
    ];
    pushQuad(
      [
        corner(-halfW, -halfD),
        corner(halfW, -halfD),
        corner(-halfW, halfD),
        corner(halfW, halfD),
      ],
      plan.elevationM - 0.05,
      patchTones[patch.tone % patchTones.length],
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const patchwork = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: fieldTexture,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
      // A few centimetres above the ground plane is below depth precision past
      // ~200 m; slope-scaled offset keeps the bands winning at any distance.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  patchwork.name = "weekend-field-patchwork-and-access-road";
  patchwork.receiveShadow = true;
  root.add(patchwork);
}

function addPaddockAccessRoad(THREE, root, plan) {
  const road = plan.accessRoad;
  const dirX = Math.sin(road.headingRad);
  const dirZ = Math.cos(road.headingRad);
  const normalX = dirZ;
  const normalZ = -dirX;
  const positions = [];
  const colors = [];
  const indices = [];
  let vertex = 0;
  const pushStrip = (offsetM, widthM, liftM, tint) => {
    const halfWidthM = widthM * 0.5;
    const startX = road.start.x + normalX * offsetM;
    const startZ = road.start.z + normalZ * offsetM;
    const endX = startX + dirX * road.lengthM;
    const endZ = startZ + dirZ * road.lengthM;
    positions.push(
      startX - normalX * halfWidthM, plan.elevationM + liftM, -(startZ - normalZ * halfWidthM),
      startX + normalX * halfWidthM, plan.elevationM + liftM, -(startZ + normalZ * halfWidthM),
      endX - normalX * halfWidthM, plan.elevationM + liftM, -(endZ - normalZ * halfWidthM),
      endX + normalX * halfWidthM, plan.elevationM + liftM, -(endZ + normalZ * halfWidthM),
    );
    for (let index = 0; index < 4; index++) colors.push(tint.r, tint.g, tint.b);
    indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    vertex += 4;
  };
  pushStrip(0, road.widthM, -0.018, new THREE.Color(0xd8c7a2));
  pushStrip(-road.widthM * 0.24, 1.05, 0.004, new THREE.Color(0x9f8e70));
  pushStrip(road.widthM * 0.24, 1.05, 0.004, new THREE.Color(0x9f8e70));
  pushStrip(0, 0.56, 0.006, new THREE.Color(0xc3b492));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const access = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  access.name = "weekend-paddock-access-road";
  access.receiveShadow = true;
  root.add(access);

  // Delineators make the access leg legible at riding height without widening its
  // authoritative eight-metre corridor or adding collision/grip authority.
  const spacingM = 24;
  const markerPairs = 18;
  const markerCount = markerPairs * 2;
  const bodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.18, 1.35, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xf4f1df }),
    markerCount,
  );
  bodies.name = "weekend-paddock-access-delineators";
  const caps = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.24, 0.2, 0.24),
    new THREE.MeshBasicMaterial({ color: 0xf06c2c }),
    markerCount,
  );
  caps.name = "weekend-paddock-access-delineator-caps";
  const transform = new THREE.Object3D();
  let markerIndex = 0;
  for (let pair = 0; pair < markerPairs; pair++) {
    const alongM = 18 + pair * spacingM;
    for (const side of [-1, 1]) {
      const x = road.start.x + dirX * alongM
        + normalX * side * (road.widthM * 0.5 + 1.25);
      const z = road.start.z + dirZ * alongM
        + normalZ * side * (road.widthM * 0.5 + 1.25);
      transform.position.copy(scenePoint(THREE, { x, y: plan.elevationM, z }, 0.68));
      transform.updateMatrix();
      bodies.setMatrixAt(markerIndex, transform.matrix);
      transform.position.y += 0.69;
      transform.updateMatrix();
      caps.setMatrixAt(markerIndex, transform.matrix);
      markerIndex++;
    }
  }
  bodies.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  root.add(bodies, caps);
}

export function createWeekendTrackDayPresentation(THREE, circuitContract, options = {}) {
  const plan = planWeekendTrackDay(circuitContract);
  const surfaceTexture = options.surfaceTexture?.isTexture ? options.surfaceTexture : null;
  const groundTexture = options.groundTexture?.isTexture ? options.groundTexture : null;
  const fieldTexture = options.fieldTexture?.isTexture ? options.fieldTexture : null;
  const roadsideAtlas = options.roadsideAtlas?.isTexture ? options.roadsideAtlas : null;
  const vergeTexture = groundTexture?.clone?.() ?? null;
  const patchFieldTexture = fieldTexture?.clone?.() ?? null;
  const reliefFieldTexture = fieldTexture?.clone?.() ?? null;
  if (groundTexture) {
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    groundTexture.wrapS = THREE.MirroredRepeatWrapping;
    groundTexture.wrapT = THREE.MirroredRepeatWrapping;
    groundTexture.repeat.set(
      plan.ground.sizeM / GROUND_TEXTURE_METRES_PER_TILE,
      plan.ground.sizeM / GROUND_TEXTURE_METRES_PER_TILE,
    );
    groundTexture.needsUpdate = true;
  }
  if (vergeTexture) {
    vergeTexture.colorSpace = THREE.SRGBColorSpace;
    vergeTexture.wrapS = THREE.MirroredRepeatWrapping;
    vergeTexture.wrapT = THREE.MirroredRepeatWrapping;
    vergeTexture.repeat.set(1, 1);
    vergeTexture.needsUpdate = true;
  }
  if (fieldTexture) {
    fieldTexture.colorSpace = THREE.SRGBColorSpace;
    fieldTexture.wrapS = THREE.MirroredRepeatWrapping;
    fieldTexture.wrapT = THREE.MirroredRepeatWrapping;
    fieldTexture.repeat.set(
      plan.ground.sizeM / FIELD_TEXTURE_METRES_PER_TILE,
      plan.ground.sizeM / FIELD_TEXTURE_METRES_PER_TILE,
    );
    fieldTexture.needsUpdate = true;
  }
  for (const detailTexture of [patchFieldTexture, reliefFieldTexture]) {
    if (!detailTexture) continue;
    detailTexture.colorSpace = THREE.SRGBColorSpace;
    detailTexture.wrapS = THREE.MirroredRepeatWrapping;
    detailTexture.wrapT = THREE.MirroredRepeatWrapping;
    detailTexture.repeat.set(
      detailTexture === reliefFieldTexture ? 2.75 : 1.2,
      detailTexture === reliefFieldTexture ? 2.75 : 1.2,
    );
    detailTexture.needsUpdate = true;
  }
  if (roadsideAtlas) {
    roadsideAtlas.colorSpace = THREE.SRGBColorSpace;
    roadsideAtlas.flipY = false;
    roadsideAtlas.wrapS = THREE.ClampToEdgeWrapping;
    roadsideAtlas.wrapT = THREE.ClampToEdgeWrapping;
    roadsideAtlas.generateMipmaps = true;
    roadsideAtlas.minFilter = THREE.LinearMipmapLinearFilter;
    roadsideAtlas.magFilter = THREE.LinearFilter;
    roadsideAtlas.needsUpdate = true;
  }
  const root = new THREE.Group();
  root.name = "weekend-track-day";

  // World ground: no void anywhere a rider can plausibly wander (11 km each way).
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(plan.ground.sizeM, plan.ground.sizeM),
    new THREE.MeshStandardMaterial({
      color: fieldTexture ? 0xe7eadc : groundTexture ? 0xd8dfd0 : 0x7e956a,
      map: fieldTexture ?? groundTexture,
      roughness: 1.0,
      metalness: 0.0,
    }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = plan.elevationM - 0.08;
  grass.name = "weekend-hinterland-ground";
  grass.receiveShadow = true;
  root.add(grass);

  // Circuit-relative verge: a landcover ribbon follows the facility without creating a
  // rectangular slab or changing the authoritative paved/grip corridor.
  const verge = new THREE.Mesh(
    buildRibbonGeometry(
      THREE,
      plan.circuit,
      plan.pavementHalfWidthM + 72,
      0.015,
      GROUND_TEXTURE_METRES_PER_TILE,
    ),
    new THREE.MeshStandardMaterial({
      color: groundTexture ? 0xd5e0ce : 0x718765,
      map: vergeTexture,
      roughness: 1.0,
      metalness: 0.0,
    }),
  );
  verge.name = "weekend-circuit-verge";
  verge.receiveShadow = true;
  root.add(verge);

  addFieldPatchwork(THREE, root, plan, patchFieldTexture);
  addPaddockAccessRoad(THREE, root, plan);
  addRollingRelief(THREE, root, plan, reliefFieldTexture);
  addHedgerows(THREE, root, plan);
  addHorizon(THREE, root, plan);
  addMidfield(THREE, root, plan, roadsideAtlas);
  addCircuitFacilities(THREE, root, plan);

  // Paved runoff mirrors the sim contract exactly; visuals do not grant grip.
  const shoulder = new THREE.Mesh(
    buildRibbonGeometry(THREE, plan.circuit, plan.pavementHalfWidthM, 0.03),
    new THREE.MeshStandardMaterial({
      color: surfaceTexture ? 0xc5cbc6 : 0x656e66,
      map: surfaceTexture,
      roughness: 0.95,
      metalness: 0.01,
    }),
  );
  shoulder.name = "weekend-paved-shoulder";
  shoulder.receiveShadow = true;
  root.add(shoulder);

  const track = new THREE.Mesh(
    buildRibbonGeometry(THREE, plan.circuit, plan.trackWidthM * 0.5, 0.055),
    new THREE.MeshStandardMaterial({
      color: surfaceTexture ? 0xffffff : 0x29302e,
      map: surfaceTexture,
      roughness: 0.93,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  track.name = "weekend-track-surface";
  track.receiveShadow = true;
  root.add(track);

  const curbs = new THREE.Mesh(
    buildEdgeGeometry(THREE, plan.circuit, plan.trackWidthM * 0.5, 1.15, 0.085),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.0,
    }),
  );
  curbs.name = "weekend-track-curbs";
  root.add(curbs);

  const trackEdgeLines = new THREE.Mesh(
    buildTwinStripGeometry(
      THREE,
      plan.circuit,
      plan.trackWidthM * 0.5 - 1.34,
      0.24,
      0.096,
    ),
    new THREE.MeshBasicMaterial({ color: 0xf4ead3 }),
  );
  trackEdgeLines.name = "weekend-track-edge-lines";
  root.add(trackEdgeLines);

  const runoffEdgeLines = new THREE.Mesh(
    buildTwinStripGeometry(
      THREE,
      plan.circuit,
      plan.pavementHalfWidthM - 0.4,
      0.34,
      0.068,
    ),
    new THREE.MeshBasicMaterial({ color: 0xd6c48b }),
  );
  runoffEdgeLines.name = "weekend-runoff-edge-lines";
  root.add(runoffEdgeLines);

  addStartFinish(THREE, root, plan);
  addInstancedMarkers(THREE, root, plan);
  addMarshalPosts(THREE, root, plan);
  addPaddock(THREE, root, plan);

  return Object.freeze({
    object3d: root,
    plan,
    dispose() {
      root.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material?.dispose?.());
        } else {
          object.material?.dispose?.();
        }
      });
      vergeTexture?.dispose?.();
      patchFieldTexture?.dispose?.();
      reliefFieldTexture?.dispose?.();
    },
  });
}
