export const RAPIER_TRACK_DAY_SCHEMA = "guns-only.rapier-track-day-presentation.v1";

const DEFAULT_TRACK_WIDTH_M = 20;
const RUNWAY_HALF_LENGTH_M = 1_524;
const RUNWAY_HALF_WIDTH_M = 24;

function finitePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const z = Number(point?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return Object.freeze({ x, y, z });
}

function clampPavedPoint(point, pavedHalfLengthM, pavedHalfWidthM, insetM = 0.5) {
  return Object.freeze({
    x: Math.max(-pavedHalfLengthM + insetM, Math.min(pavedHalfLengthM - insetM, point.x)),
    y: point.y,
    z: Math.max(-pavedHalfWidthM + insetM, Math.min(pavedHalfWidthM - insetM, point.z)),
  });
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

function freezeAssets(assets) {
  return Object.freeze(assets.map((asset) => Object.freeze(asset)));
}

export function planRapierTrackDay(circuitInput, options = {}) {
  const circuit = Array.from(circuitInput ?? [], finitePoint).filter(Boolean);
  if (circuit.length < 4) throw new Error("Rapier track day requires a closed sampled circuit.");
  const first = circuit[0];
  const last = circuit[circuit.length - 1];
  if (Math.hypot(first.x - last.x, first.z - last.z) > 0.1) {
    circuit.push(first);
  }

  const trackWidthM = Number(options.trackWidthM) || DEFAULT_TRACK_WIDTH_M;
  const uniqueCount = circuit.length - 1;
  const elevationM = Number(options.surfaceElevationM) || first.y;

  let minimumX = Infinity;
  let maximumX = -Infinity;
  let maximumAbsZ = 0;
  for (const point of circuit) {
    minimumX = Math.min(minimumX, point.x);
    maximumX = Math.max(maximumX, point.x);
    maximumAbsZ = Math.max(maximumAbsZ, Math.abs(point.z));
  }
  // Paved extents follow the authoritative circuit: the runway rectangle plus the
  // hairpin aprons, so hairpin-side cues are not squashed onto the 48 m strip.
  const pavedHalfLengthM = Math.max(
    RUNWAY_HALF_LENGTH_M,
    Math.max(Math.abs(minimumX), Math.abs(maximumX)) + trackWidthM * 0.5,
  );
  const pavedHalfWidthM = Math.max(RUNWAY_HALF_WIDTH_M, maximumAbsZ + trackWidthM * 0.5);
  const clampPaved = (point, insetM) =>
    clampPavedPoint(point, pavedHalfLengthM, pavedHalfWidthM, insetM);

  const coneStride = Math.max(1, Math.floor(uniqueCount / 48));
  const cones = [];
  for (let index = 0; index < uniqueCount; index += coneStride) {
    for (const side of [-1, 1]) {
      cones.push({
        kind: "course-cone",
        side,
        center: clampPaved(
          offsetFromTrack(circuit, index, side * (trackWidthM * 0.5 - 0.7)),
        ),
      });
    }
  }
  const tyreWalls = [];
  for (const endX of [minimumX, maximumX]) {
    // Beyond the track's OUTER edge at the hairpin apex, never on the racing surface.
    const wallX = Math.sign(endX || 1) * Math.min(
      pavedHalfLengthM - 4,
      Math.abs(endX) + trackWidthM * 0.5 + 8,
    );
    for (let index = 0; index < 12; index++) {
      tyreWalls.push({
        kind: "tyre-wall",
        center: Object.freeze({
          x: wallX,
          y: elevationM,
          z: -20 + index * (40 / 11),
        }),
        stack: index % 3 === 1 ? 2 : 1,
      });
    }
  }

  const marshalPosts = [0.25, 0.5, 0.75].map((fraction, sector) => {
    const index = Math.min(uniqueCount - 1, Math.floor(uniqueCount * fraction));
    return {
      kind: "marshal-post",
      sector: sector + 1,
      center: clampPaved(
        offsetFromTrack(circuit, index, (sector % 2 === 0 ? 1 : -1) * (trackWidthM * 0.5 + 2)),
        1.5,
      ),
    };
  });

  const startTangent = tangentAt(circuit, 0);
  const gantry = Object.freeze({
    kind: "start-gantry",
    center: clampPaved({ x: first.x, y: elevationM, z: first.z }),
    headingRad: Math.atan2(startTangent.x, startTangent.z),
  });

  // Off-track world: a ground plane large enough that a rider a kilometre out still
  // stands on grass, and tall threshold beacons that point back at the strip.
  const ground = Object.freeze({ kind: "ground-plane", sizeM: 22_000 });
  const beacons = [];
  for (const endSign of [-1, 1]) {
    for (const sideSign of [-1, 1]) {
      beacons.push({
        kind: "threshold-beacon",
        heightM: 30,
        center: Object.freeze({
          x: endSign * (RUNWAY_HALF_LENGTH_M - 12),
          y: elevationM,
          z: sideSign * (pavedHalfWidthM + 14),
        }),
      });
    }
  }

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

  // Airfield landmark: the beacons vanish at range; a 44 m aviation water tower
  // plus a hangar block in the airfield cluster mark the field itself from deep
  // off-track (Rapier-strip fiction). Mid-field so it does not crowd the gantry.
  const waterTower = Object.freeze({
    kind: "water-tower",
    center: Object.freeze({ x: 120, y: elevationM, z: 150 }),
    heightM: 50,
  });
  const hangar = Object.freeze({
    kind: "hangar",
    center: Object.freeze({ x: 10, y: elevationM, z: 190 }),
    widthM: 92,
    depthM: 32,
    heightM: 16,
    headingRad: 0,
  });

  // Ground variation: large painted tone bands (mowed/unmowed) and a dirt access
  // road toward the paddock, so the olive plane is not one uniform value.
  // Farmland-style bands either side of the strip: staggered x-extents so the
  // edges never read as one infinite ruler line, tones spanning mowed greens to
  // harvested tan so the variation survives the haze at a kilometre.
  const fieldPatches = freezeAssets([
    { kind: "field-patch", tone: 0, center: { x: 200, y: elevationM, z: -430 }, widthM: 5_600, depthM: 520 },
    { kind: "field-patch", tone: 2, center: { x: -600, y: elevationM, z: -1_250 }, widthM: 6_400, depthM: 620 },
    { kind: "field-patch", tone: 1, center: { x: 500, y: elevationM, z: -1_950 }, widthM: 7_200, depthM: 720 },
    { kind: "field-patch", tone: 3, center: { x: -300, y: elevationM, z: -2_750 }, widthM: 8_000, depthM: 840 },
    { kind: "field-patch", tone: 2, center: { x: 300, y: elevationM, z: -3_650 }, widthM: 8_800, depthM: 940 },
    { kind: "field-patch", tone: 0, center: { x: -200, y: elevationM, z: 620 }, widthM: 5_400, depthM: 560 },
    { kind: "field-patch", tone: 2, center: { x: 500, y: elevationM, z: 1_350 }, widthM: 6_600, depthM: 680 },
    { kind: "field-patch", tone: 1, center: { x: -500, y: elevationM, z: 2_150 }, widthM: 7_400, depthM: 800 },
    { kind: "field-patch", tone: 3, center: { x: 300, y: elevationM, z: 3_050 }, widthM: 8_200, depthM: 920 },
    { kind: "field-patch", tone: 1, center: { x: -3_600, y: elevationM, z: -600 }, widthM: 1_600, depthM: 1_800 },
    { kind: "field-patch", tone: 2, center: { x: 3_700, y: elevationM, z: 500 }, widthM: 1_800, depthM: 2_000 },
  ].map((patch) => ({ ...patch, center: Object.freeze(patch.center) })));
  const accessRoad = Object.freeze({
    kind: "access-road",
    start: Object.freeze({
      x: Math.max(-1_200, Math.min(1_200, first.x - 110)),
      y: elevationM,
      z: 72,
    }),
    headingRad: 0.22,
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
  const pushHedgerow = (centerX, z, lengthM, heightM) =>
    hedgerows.push({
      kind: "hedgerow",
      center: Object.freeze({ x: centerX, y: elevationM, z }),
      lengthM,
      heightM,
      depthM: 2.4,
    });
  pushHedgerow(-850, -690, 3_500, 3.6);
  pushHedgerow(800, -1_590, 4_000, 3.1);
  pushHedgerow(-1_300, -2_330, 3_400, 4.0);
  for (const [z, heightM] of [[900, 3.4], [1_690, 3.8]]) {
    const gapX = roadXAtZ(z);
    pushHedgerow(gapX - 30 - 1_400, z, 2_800, heightM);
    pushHedgerow(gapX + 30 + 1_150, z, 2_300, heightM);
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
  for (let copse = 0; copse < 46; copse++) {
    const bearingRad = nextRandom() * Math.PI * 2;
    const rangeM = 650 + nextRandom() * 3_900;
    const copseX = Math.cos(bearingRad) * rangeM;
    const copseZ = Math.sin(bearingRad) * rangeM;
    if (Math.abs(copseX) < pavedHalfLengthM + 140 && Math.abs(copseZ) < 260) continue;
    const count = 3 + Math.floor(nextRandom() * 4);
    for (let index = 0; index < count; index++) {
      trees.push({
        kind: "tree",
        center: Object.freeze({
          x: copseX + (nextRandom() - 0.5) * 90,
          y: elevationM,
          z: copseZ + (nextRandom() - 0.5) * 90,
        }),
        heightM: 6 + nextRandom() * 8,
      });
    }
  }
  const farms = freezeAssets([
    { kind: "farm", center: { x: 2_250, y: elevationM, z: -950 }, widthM: 26, depthM: 12, heightM: 8, headingRad: 0.4, tone: 0 },
    { kind: "farm", center: { x: 2_290, y: elevationM, z: -910 }, widthM: 12, depthM: 9, heightM: 5, headingRad: 0.4, tone: 1 },
    { kind: "farm", center: { x: -1_950, y: elevationM, z: 1_180 }, widthM: 30, depthM: 13, heightM: 9, headingRad: -0.7, tone: 0 },
    { kind: "farm", center: { x: -1_600, y: elevationM, z: -2_050 }, widthM: 24, depthM: 11, heightM: 7, headingRad: 1.1, tone: 1 },
    { kind: "farm", center: { x: 1_500, y: elevationM, z: 2_400 }, widthM: 28, depthM: 12, heightM: 8, headingRad: 2.2, tone: 0 },
  ].map((farm) => ({ ...farm, center: Object.freeze(farm.center) })));

  const paddock = [];
  for (let index = 0; index < 6; index++) {
    paddock.push({
      kind: index < 3 ? "paddock-canopy" : "service-vehicle",
      center: Object.freeze({
        x: Math.max(-900, Math.min(900, first.x - 80 - (index % 3) * 22)),
        y: elevationM,
        z: 54 + Math.floor(index / 3) * 14,
      }),
      team: index % 3,
    });
  }

  return Object.freeze({
    schema: RAPIER_TRACK_DAY_SCHEMA,
    trackWidthM,
    elevationM,
    // Mirrors sim-side PaintedCircuit.PavedApronHalfWidthM (track half-width + 6 m shoulder).
    apronHalfWidthM: trackWidthM * 0.5 + 6,
    pavedHalfLengthM,
    pavedHalfWidthM,
    ground,
    circuit: Object.freeze(circuit),
    gantry,
    marshalPosts: freezeAssets(marshalPosts),
    cones: freezeAssets(cones),
    tyreWalls: freezeAssets(tyreWalls),
    beacons: freezeAssets(beacons),
    paddock: freezeAssets(paddock),
    horizon,
    waterTower,
    hangar,
    fieldPatches,
    accessRoad,
    hedgerows: freezeAssets(hedgerows),
    trees: freezeAssets(trees),
    farms,
  });
}

function scenePoint(THREE, point, liftM = 0) {
  return new THREE.Vector3(point.x, point.y + liftM, -point.z);
}

function circuitNormal(circuit, index) {
  const tangent = tangentAt(circuit, index);
  return { x: -tangent.z, z: tangent.x };
}

function buildRibbonGeometry(THREE, circuit, halfWidthM, liftM) {
  const positions = [];
  const indices = [];
  for (let index = 0; index < circuit.length; index++) {
    const normal = circuitNormal(circuit, index % (circuit.length - 1));
    const point = circuit[index];
    for (const side of [-1, 1]) {
      positions.push(
        point.x + normal.x * halfWidthM * side,
        point.y + liftM,
        -(point.z + normal.z * halfWidthM * side),
      );
    }
    if (index < circuit.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
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

function addStartFinish(THREE, root, plan) {
  const group = new THREE.Group();
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
  let tyreIndex = 0;
  for (const wall of plan.tyreWalls) {
    for (let stack = 0; stack < wall.stack; stack++) {
      transform.position.copy(scenePoint(THREE, wall.center, 0.55 + stack * 0.78));
      transform.rotation.set(0, Math.PI / 2, 0);
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

function addPaddockAndAirfield(THREE, root, plan) {
  const canopyColours = [0x254d63, 0x8b2d28, 0xdbc477];
  const dark = new THREE.MeshStandardMaterial({ color: 0x252c2a, roughness: 0.82 });
  for (const asset of plan.paddock) {
    const group = new THREE.Group();
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

  const hangarMaterial = new THREE.MeshStandardMaterial({
    color: 0x59645f,
    roughness: 0.88,
  });
  for (let index = 0; index < 5; index++) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(55, 12, 24), hangarMaterial);
    hangar.position.set(-900 + index * 420, plan.elevationM + 6, 125);
    root.add(hangar);
  }
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 4.4, 24, 8),
    new THREE.MeshStandardMaterial({ color: 0x68716a, roughness: 0.82 }),
  );
  tower.position.set(0, plan.elevationM + 12, 88);
  root.add(tower);
}

function addThresholdBeacons(THREE, root, plan) {
  const orange = new THREE.MeshStandardMaterial({ color: 0xf47b20, roughness: 0.7 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xe9e1ce, roughness: 0.7 });
  for (const beacon of plan.beacons) {
    const group = new THREE.Group();
    group.position.copy(scenePoint(THREE, beacon.center, 0));
    const bandHeightM = beacon.heightM / 5;
    for (let band = 0; band < 5; band++) {
      const mast = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, bandHeightM, 2.4),
        band % 2 === 0 ? orange : ivory,
      );
      mast.position.y = bandHeightM * (band + 0.5);
      group.add(mast);
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
    new THREE.Color(0x39473a),
    new THREE.Color(0x324236),
    new THREE.Color(0x3f4c3b),
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
  ridge.frustumCulled = false;
  root.add(ridge);

  // Far building silhouettes: one instanced box, flat tone, hazed by the fog.
  const silhouettes = plan.horizon.silhouettes;
  const blocks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x5a665f }),
    silhouettes.length,
  );
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

function addMidfield(THREE, root, plan) {
  // Illustrative conifer cones, one instanced draw. Solid flat green; the fog
  // supplies the aerial perspective.
  const trees = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x35462f, roughness: 0.95 }),
    plan.trees.length,
  );
  const transform = new THREE.Object3D();
  plan.trees.forEach((tree, index) => {
    transform.position.copy(scenePoint(THREE, tree.center, tree.heightM / 2));
    transform.rotation.set(0, index * 0.73, 0);
    transform.scale.set(tree.heightM * 0.42, tree.heightM, tree.heightM * 0.42);
    transform.updateMatrix();
    trees.setMatrixAt(index, transform.matrix);
  });
  trees.instanceMatrix.needsUpdate = true;
  root.add(trees);

  const farmTones = [new THREE.Color(0x74463a), new THREE.Color(0x5d5f58)];
  const farms = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    plan.farms.length,
  );
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

function addAirfieldLandmarks(THREE, root, plan) {
  const tower = plan.waterTower;
  const group = new THREE.Group();
  group.position.copy(scenePoint(THREE, tower.center, 0));
  const shaftHeightM = tower.heightM * 0.62;
  const tankHeightM = tower.heightM * 0.3;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 2.3, shaftHeightM, 10),
    new THREE.MeshStandardMaterial({ color: 0x707a72, roughness: 0.85 }),
  );
  shaft.position.y = shaftHeightM / 2;
  group.add(shaft);
  // Aviation checker colours: the orange tank is the one saturated accent on the
  // horizon, so the airfield cluster is unmistakable from kilometres out.
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(7.4, 6.4, tankHeightM, 14),
    new THREE.MeshStandardMaterial({ color: 0xe2661f, roughness: 0.62 }),
  );
  tank.position.y = shaftHeightM + tankHeightM / 2;
  group.add(tank);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(7.6, tower.heightM - shaftHeightM - tankHeightM, 14),
    new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.7 }),
  );
  cap.position.y = shaftHeightM + tankHeightM + (tower.heightM - shaftHeightM - tankHeightM) / 2;
  group.add(cap);
  root.add(group);

  // Hangar block: a wide light slab reads at ranges where slim masts vanish.
  const hangar = plan.hangar;
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(hangar.widthM, hangar.heightM, hangar.depthM),
    new THREE.MeshStandardMaterial({ color: 0x9aa099, roughness: 0.82 }),
  );
  block.position.copy(scenePoint(THREE, hangar.center, hangar.heightM / 2));
  block.rotation.y = hangar.headingRad;
  root.add(block);
}

function addHedgerows(THREE, root, plan) {
  const rows = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x39452f, roughness: 0.95 }),
    plan.hedgerows.length,
  );
  const transform = new THREE.Object3D();
  plan.hedgerows.forEach((row, index) => {
    transform.position.copy(scenePoint(THREE, row.center, row.heightM / 2));
    transform.rotation.set(0, 0, 0);
    transform.scale.set(row.lengthM, row.heightM, row.depthM);
    transform.updateMatrix();
    rows.setMatrixAt(index, transform.matrix);
  });
  rows.instanceMatrix.needsUpdate = true;
  root.add(rows);
}

function addFieldPatchwork(THREE, root, plan) {
  // Mowed/unmowed tone bands plus the dirt access road, merged into ONE mesh:
  // flat painted quads a few centimetres above the grass/verge planes.
  const patchTones = [
    new THREE.Color(0x6d774f), // mowed, lighter
    new THREE.Color(0x424d37), // unmowed, darker
    new THREE.Color(0x5c6649), // scrub
    new THREE.Color(0x857c55), // harvested tan
  ];
  const roadTone = new THREE.Color(0x8f815f);
  const positions = [];
  const colours = [];
  const indices = [];
  let vertex = 0;
  const pushQuad = (corners, y, tone) => {
    for (const [x, z] of corners) {
      positions.push(x, y, -z);
      colours.push(tone.r, tone.g, tone.b);
    }
    indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    vertex += 4;
  };
  for (const patch of plan.fieldPatches) {
    const halfW = patch.widthM / 2;
    const halfD = patch.depthM / 2;
    pushQuad(
      [
        [patch.center.x - halfW, patch.center.z - halfD],
        [patch.center.x + halfW, patch.center.z - halfD],
        [patch.center.x - halfW, patch.center.z + halfD],
        [patch.center.x + halfW, patch.center.z + halfD],
      ],
      plan.elevationM - 0.05,
      patchTones[patch.tone % patchTones.length],
    );
  }
  const road = plan.accessRoad;
  const dirX = Math.sin(road.headingRad);
  const dirZ = Math.cos(road.headingRad);
  const normalX = dirZ;
  const normalZ = -dirX;
  const halfWidth = road.widthM / 2;
  const endX = road.start.x + dirX * road.lengthM;
  const endZ = road.start.z + dirZ * road.lengthM;
  pushQuad(
    [
      [road.start.x - normalX * halfWidth, road.start.z - normalZ * halfWidth],
      [road.start.x + normalX * halfWidth, road.start.z + normalZ * halfWidth],
      [endX - normalX * halfWidth, endZ - normalZ * halfWidth],
      [endX + normalX * halfWidth, endZ + normalZ * halfWidth],
    ],
    plan.elevationM - 0.035,
    roadTone,
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const patchwork = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
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
  patchwork.receiveShadow = true;
  root.add(patchwork);
}

export function createRapierTrackDayPresentation(THREE, circuit, options = {}) {
  const plan = planRapierTrackDay(circuit, options);
  const root = new THREE.Group();
  root.name = "rapier-track-day";

  // World ground: no void anywhere a rider can plausibly wander (11 km each way).
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(plan.ground.sizeM, plan.ground.sizeM),
    new THREE.MeshStandardMaterial({
      color: 0x566248,
      roughness: 1.0,
      metalness: 0.0,
    }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = plan.elevationM - 0.08;
  grass.receiveShadow = true;
  root.add(grass);

  // Nearfield verge stays a touch lighter so the strip surrounds read at speed.
  const verge = new THREE.Mesh(
    new THREE.PlaneGeometry(3_800, 900),
    new THREE.MeshStandardMaterial({
      color: 0x5d6b4e,
      roughness: 1.0,
      metalness: 0.0,
    }),
  );
  verge.rotation.x = -Math.PI / 2;
  verge.position.y = plan.elevationM - 0.06;
  verge.receiveShadow = true;
  root.add(verge);

  addFieldPatchwork(THREE, root, plan);
  addHedgerows(THREE, root, plan);
  addHorizon(THREE, root, plan);
  addMidfield(THREE, root, plan);
  addAirfieldLandmarks(THREE, root, plan);

  // Runway edge stripes: the strip must be findable from a kilometre off-track.
  // Top stays below the track ribbon lift (0.055) so hairpin flares crossing the
  // runway edge cannot z-fight the stripe.
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xe9e1ce });
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(RUNWAY_HALF_LENGTH_M * 2, 0.04, 0.9),
      stripeMaterial,
    );
    stripe.position.set(0, plan.elevationM + 0.02, side * (RUNWAY_HALF_WIDTH_M - 1.2));
    root.add(stripe);
  }

  addThresholdBeacons(THREE, root, plan);

  // Paved shoulder mirrors the sim's apron corridor (PaintedCircuit.PavedApronHalfWidthM):
  // wherever grip is asphalt beyond the 48 m strip, the ground must look like asphalt.
  const shoulder = new THREE.Mesh(
    buildRibbonGeometry(THREE, plan.circuit, plan.apronHalfWidthM, 0.03),
    new THREE.MeshStandardMaterial({
      color: 0x656e66,
      roughness: 0.95,
      metalness: 0.01,
    }),
  );
  shoulder.receiveShadow = true;
  root.add(shoulder);

  const track = new THREE.Mesh(
    buildRibbonGeometry(THREE, plan.circuit, plan.trackWidthM * 0.5, 0.055),
    new THREE.MeshStandardMaterial({
      color: 0x29302e,
      roughness: 0.93,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
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
  root.add(curbs);

  addStartFinish(THREE, root, plan);
  addInstancedMarkers(THREE, root, plan);
  addMarshalPosts(THREE, root, plan);
  addPaddockAndAirfield(THREE, root, plan);

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
    },
  });
}
