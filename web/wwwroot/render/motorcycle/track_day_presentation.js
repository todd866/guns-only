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

function clampRunwayPoint(point, insetM = 0.5) {
  return Object.freeze({
    x: Math.max(-RUNWAY_HALF_LENGTH_M + insetM, Math.min(RUNWAY_HALF_LENGTH_M - insetM, point.x)),
    y: point.y,
    z: Math.max(-RUNWAY_HALF_WIDTH_M + insetM, Math.min(RUNWAY_HALF_WIDTH_M - insetM, point.z)),
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
  const coneStride = Math.max(1, Math.floor(uniqueCount / 48));
  const cones = [];
  for (let index = 0; index < uniqueCount; index += coneStride) {
    for (const side of [-1, 1]) {
      cones.push({
        kind: "course-cone",
        side,
        center: clampRunwayPoint(
          offsetFromTrack(circuit, index, side * (trackWidthM * 0.5 - 0.7)),
        ),
      });
    }
  }

  let minimumX = Infinity;
  let maximumX = -Infinity;
  for (const point of circuit) {
    minimumX = Math.min(minimumX, point.x);
    maximumX = Math.max(maximumX, point.x);
  }
  const tyreWalls = [];
  for (const endX of [minimumX, maximumX]) {
    const wallX = Math.sign(endX || 1) * Math.min(RUNWAY_HALF_LENGTH_M - 4, Math.abs(endX) + 8);
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
      center: clampRunwayPoint(
        offsetFromTrack(circuit, index, (sector % 2 === 0 ? 1 : -1) * (trackWidthM * 0.5 + 2)),
        1.5,
      ),
    };
  });

  const startTangent = tangentAt(circuit, 0);
  const gantry = Object.freeze({
    kind: "start-gantry",
    center: clampRunwayPoint({ x: first.x, y: elevationM, z: first.z }),
    headingRad: Math.atan2(startTangent.x, startTangent.z),
  });

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
    circuit: Object.freeze(circuit),
    gantry,
    marshalPosts: freezeAssets(marshalPosts),
    cones: freezeAssets(cones),
    tyreWalls: freezeAssets(tyreWalls),
    paddock: freezeAssets(paddock),
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

export function createRapierTrackDayPresentation(THREE, circuit, options = {}) {
  const plan = planRapierTrackDay(circuit, options);
  const root = new THREE.Group();
  root.name = "rapier-track-day";

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(3_800, 900),
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
