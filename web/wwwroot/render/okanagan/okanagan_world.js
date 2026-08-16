import * as THREE from "../../vendor/three.module.js?v=340";

const DEG_LAT_M = 111_320;
const ANCHOR_LAT = 49.88;
const ANCHOR_LON = -119.50;
const DEG_LON_M = DEG_LAT_M * Math.cos(ANCHOR_LAT * Math.PI / 180);

export function geographicToWorld(latitude, longitude, altitude = 0) {
  return new THREE.Vector3(
    (longitude - ANCHOR_LON) * DEG_LON_M,
    altitude,
    (latitude - ANCHOR_LAT) * DEG_LAT_M,
  );
}

export function createOkanaganWorld(scene, terrainData, worldData, quality = "desktop") {
  const group = new THREE.Group();
  group.name = "okanagan-central-world";
  scene.add(group);

  const terrain = createTerrain(terrainData, worldData);
  group.add(terrain.mesh);
  group.add(createLake(worldData));
  group.add(createRoads(worldData, terrain.sampleHeight));
  group.add(createRunway(worldData, terrain.sampleHeight));
  group.add(createSettlements(worldData, terrain.sampleHeight, quality, terrain.isOperationalSurface));
  group.add(createForest(terrainData, worldData, terrain.sampleHeight, quality,
    terrain.isOperationalSurface));

  return Object.freeze({
    group,
    sampleHeight: terrain.sampleHeight,
    worldData,
    dispose() {
      group.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      group.removeFromParent();
    },
  });
}

function createTerrain(data, world) {
  const { rows, columns, bounds, elevationsM } = data;
  // Four subdivisions per source interval keep the lake bank and the airport cut/fill from being
  // represented by kilometre-wide triangles. Heights still come from the committed 33×33 CDEM.
  const meshRows = (rows - 1) * 4 + 1;
  const meshColumns = (columns - 1) * 4 + 1;
  const positions = new Float32Array(meshRows * meshColumns * 3);
  const colors = new Float32Array(meshRows * meshColumns * 3);
  const minimum = Math.min(...elevationsM.flat());
  const maximum = Math.max(...elevationsM.flat());
  const bunchgrass = new THREE.Color(0xa88d55);
  const dryPonderosa = new THREE.Color(0x796f43);
  const douglasFir = new THREE.Color(0x3f5236);
  const rockHigh = new THREE.Color(0x77746a);
  const fieldColors = [0x9b8244, 0x6f7c3f, 0xb09a57, 0x596b37]
    .map((color) => new THREE.Color(color));
  const sampleHeight = createOkanaganSurfaceSampler(data, world);
  const isOperationalSurface = (x, z) => {
    const [longitude, latitude] = worldToGeographic(x, z);
    return pointInPolygon(longitude, latitude, world.lake.shoreline)
      || kelownaRunwayBlend(x, z) > 0.02;
  };
  let cursor = 0;
  for (let row = 0; row < meshRows; row += 1) {
    const latitude = bounds.south + (bounds.north - bounds.south) * row / (meshRows - 1);
    for (let column = 0; column < meshColumns; column += 1) {
      const longitude = bounds.west + (bounds.east - bounds.west) * column / (meshColumns - 1);
      const point = geographicToWorld(latitude, longitude, 0);
      point.y = sampleHeight(point.x, point.z);
      positions[cursor * 3] = point.x;
      positions[cursor * 3 + 1] = point.y;
      positions[cursor * 3 + 2] = point.z;
      const elevationT = (point.y - minimum) / Math.max(1, maximum - minimum);
      const lowT = THREE.MathUtils.smoothstep(point.y, 380, 930);
      const highT = THREE.MathUtils.smoothstep(point.y, 1_250, 1_850);
      const variation = (hash01(point.x * 0.00017 + point.z * 0.00031) - 0.5) * 0.13;
      const color = bunchgrass.clone().lerp(dryPonderosa, lowT)
        .lerp(douglasFir, THREE.MathUtils.clamp(lowT * 0.82 + elevationT * 0.28, 0, 1))
        .lerp(rockHigh, highT);
      if (isAgriculturePoint(world, point.x, point.z)) {
        const fieldBand = Math.floor((point.x + point.z * 0.37) / 420) & 3;
        color.lerp(fieldColors[fieldBand], 0.64);
      }
      color.offsetHSL(0, 0, variation);
      colors[cursor * 3] = color.r;
      colors[cursor * 3 + 1] = color.g;
      colors[cursor * 3 + 2] = color.b;
      cursor += 1;
    }
  }
  const indices = [];
  for (let row = 0; row < meshRows - 1; row += 1) {
    for (let column = 0; column < meshColumns - 1; column += 1) {
      const a = row * meshColumns + column;
      const b = a + 1;
      const c = a + meshColumns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
  }));
  mesh.receiveShadow = true;

  return { mesh, sampleHeight, isOperationalSurface };
}

function createRawCdemSampler(data) {
  const { rows, columns, bounds, elevationsM } = data;
  return function sampleRawHeight(x, z) {
    const longitude = ANCHOR_LON + x / DEG_LON_M;
    const latitude = ANCHOR_LAT + z / DEG_LAT_M;
    const columnF = (longitude - bounds.west) / (bounds.east - bounds.west) * (columns - 1);
    const rowF = (latitude - bounds.south) / (bounds.north - bounds.south) * (rows - 1);
    const column0 = Math.max(0, Math.min(columns - 1, Math.floor(columnF)));
    const row0 = Math.max(0, Math.min(rows - 1, Math.floor(rowF)));
    const column1 = Math.min(columns - 1, column0 + 1);
    const row1 = Math.min(rows - 1, row0 + 1);
    const tx = Math.max(0, Math.min(1, columnF - column0));
    const tz = Math.max(0, Math.min(1, rowF - row0));
    const south = elevationsM[row0][column0] * (1 - tx) + elevationsM[row0][column1] * tx;
    const north = elevationsM[row1][column0] * (1 - tx) + elevationsM[row1][column1] * tx;
    return south * (1 - tz) + north * tz;
  };
}

export function createOkanaganSurfaceSampler(terrainData, worldData) {
  const rawHeight = createRawCdemSampler(terrainData);
  return (x, z) => operationalSurfaceHeight(worldData, rawHeight, x, z);
}

function operationalSurfaceHeight(world, rawHeight, x, z) {
  const [longitude, latitude] = worldToGeographic(x, z);
  if (pointInPolygon(longitude, latitude, world.lake.shoreline))
    return world.lake.surfaceElevationM;
  const raw = rawHeight(x, z);
  return THREE.MathUtils.lerp(raw, world.airfields[0].elevationM, kelownaRunwayBlend(x, z));
}

function worldToGeographic(x, z) {
  return [ANCHOR_LON + x / DEG_LON_M, ANCHOR_LAT + z / DEG_LAT_M];
}

function pointInPolygon(longitude, latitude, shoreline) {
  let inside = false;
  for (let i = 0, j = shoreline.length - 1; i < shoreline.length; j = i++) {
    const [xi, yi] = shoreline[i];
    const [xj, yj] = shoreline[j];
    const dx = xj - xi;
    const dy = yj - yi;
    const cross = (longitude - xi) * dy - (latitude - yi) * dx;
    const dot = (longitude - xi) * dx + (latitude - yi) * dy;
    if (Math.abs(cross) < 1e-10 && dot >= 0 && dot <= dx * dx + dy * dy) return true;
    const crosses = ((yi > latitude) !== (yj > latitude))
      && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function kelownaRunwayBlend(x, z) {
  const north = geographicToWorld(49.9670, -119.3778, 433);
  const south = geographicToWorld(49.9442, -119.3650, 433);
  const dx = south.x - north.x;
  const dz = south.z - north.z;
  const alongRaw = ((x - north.x) * dx + (z - north.z) * dz) / (dx * dx + dz * dz);
  if (alongRaw < -0.16 || alongRaw > 1.16) return 0;
  const along = THREE.MathUtils.clamp(alongRaw, 0, 1);
  const distance = Math.hypot(x - (north.x + dx * along), z - (north.z + dz * along));
  return 1 - THREE.MathUtils.smoothstep(distance, 90, 560);
}

function createLake(world) {
  const shape = new THREE.Shape();
  world.lake.shoreline.forEach(([longitude, latitude], index) => {
    const point = geographicToWorld(latitude, longitude, world.lake.surfaceElevationM);
    if (index === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  const lake = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({
    color: 0x2a6f87,
    roughness: 0.24,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
    depthWrite: true,
  }));
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = world.lake.surfaceElevationM + 0.6;
  lake.receiveShadow = true;
  lake.name = "Okanagan Lake";
  return lake;
}

function createRunway(world, sampleHeight) {
  const airport = world.airfields[0];
  // The airport reference point is close to field centre. The simulation uses surveyed-looking
  // threshold coordinates for Runway 16/34, so use their midpoint here as well; subtracting a
  // second half-length put the rendered strip entirely beyond the aircraft's north threshold.
  const centre = geographicToWorld((49.9670 + 49.9442) / 2, (-119.3778 - 119.3650) / 2,
    airport.elevationM);
  const group = new THREE.Group();
  const runway = new THREE.Mesh(new THREE.BoxGeometry(61, 0.8, airport.runwayLengthM),
    new THREE.MeshStandardMaterial({ color: 0x41474a, roughness: 0.94 }));
  runway.rotation.y = airport.runwayHeadingDeg * Math.PI / 180;
  runway.position.copy(centre);
  runway.position.y = Math.max(airport.elevationM, sampleHeight(centre.x, centre.z)) + 1.2;
  runway.receiveShadow = true;
  group.add(runway);
  const along = new THREE.Vector3(Math.sin(airport.runwayHeadingDeg * Math.PI / 180), 0,
    Math.cos(airport.runwayHeadingDeg * Math.PI / 180));
  const across = new THREE.Vector3(along.z, 0, -along.x);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, airport.runwayLengthM - 30),
      new THREE.MeshBasicMaterial({ color: 0xe8e8df }));
    edge.rotation.y = runway.rotation.y;
    edge.position.copy(runway.position).addScaledVector(across, side * 27.5);
    edge.position.y += 0.08;
    group.add(edge);
  }
  for (let index = -10; index <= 10; index += 1) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 26),
      new THREE.MeshBasicMaterial({ color: 0xe6e7df }));
    mark.rotation.y = runway.rotation.y;
    mark.position.copy(runway.position);
    mark.position.addScaledVector(along, index * 105);
    mark.position.y += 0.08;
    group.add(mark);
  }
  for (const end of [-1, 1]) {
    for (let stripe = -4; stripe <= 4; stripe += 1) {
      const threshold = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.13, 30),
        new THREE.MeshBasicMaterial({ color: 0xf0f0e8 }));
      threshold.rotation.y = runway.rotation.y;
      threshold.position.copy(runway.position)
        .addScaledVector(along, end * (airport.runwayLengthM / 2 - 70))
        .addScaledVector(across, stripe * 5.7);
      threshold.position.y += 0.09;
      group.add(threshold);
    }
  }

  // YLW's parallel taxiway and east-side terminal/apron are important visual anchors when
  // departing Runway 16. They are deliberately low-detail so the outside-world scene stays clear.
  const taxiway = new THREE.Mesh(new THREE.BoxGeometry(23, 0.55, airport.runwayLengthM - 210),
    new THREE.MeshStandardMaterial({ color: 0x565a59, roughness: 0.96 }));
  taxiway.rotation.y = runway.rotation.y;
  taxiway.position.copy(runway.position).addScaledVector(across, -104);
  taxiway.position.y += 0.1;
  group.add(taxiway);
  const apronCentre = runway.position.clone().addScaledVector(across, -235).addScaledVector(along, 90);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(245, 0.45, 520),
    new THREE.MeshStandardMaterial({ color: 0x777b77, roughness: 0.95 }));
  apron.rotation.y = runway.rotation.y;
  apron.position.copy(apronCentre);
  apron.position.y += 0.12;
  group.add(apron);
  const terminal = new THREE.Mesh(new THREE.BoxGeometry(62, 13, 250),
    new THREE.MeshStandardMaterial({ color: 0xc0b69f, roughness: 0.88 }));
  terminal.rotation.y = runway.rotation.y;
  terminal.position.copy(apronCentre).addScaledVector(across, -150);
  terminal.position.y += 6.8;
  group.add(terminal);
  group.name = "Kelowna International Runway 16/34";
  return group;
}

function createSettlements(world, sampleHeight, quality, isOperationalSurface) {
  const group = new THREE.Group();
  group.name = "2021-census-communities";
  const count = quality === "mobile" ? 180 : quality === "balanced" ? 500 : 1_200;
  const geometry = new THREE.BoxGeometry(12, 7, 18);
  const material = new THREE.MeshStandardMaterial({ color: 0xb9aa8b, roughness: 0.93 });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  let index = 0;
  let seed = 0;
  for (const community of world.communities) {
    const centre = geographicToWorld(community.latitude, community.longitude, 0);
    const share = Math.max(18, Math.round(count * community.population2021 / 202260));
    const [radiusX, radiusZ] = communityFootprint(community.id);
    let accepted = 0;
    for (let attempt = 0; attempt < share * 8 && accepted < share && index < count; attempt += 1) {
      seed += 1;
      const angle = hash01(seed * 13 + community.population2021) * Math.PI * 2;
      const radius = Math.sqrt(hash01(seed * 29 + 7));
      const x = centre.x + Math.cos(angle) * radius * radiusX;
      const z = centre.z + Math.sin(angle) * radius * radiusZ;
      if (isOperationalSurface(x, z) || sampleHeight(x, z) > 940) continue;
      const y = sampleHeight(x, z);
      dummy.position.set(x, y + 4, z);
      dummy.rotation.y = (Math.round(hash01(seed * 43) * 4) * Math.PI / 2) + 0.16;
      const scale = 0.65 + hash01(seed * 71) * 1.65;
      const downtown = community.id === "kelowna" && radius < 0.22;
      dummy.scale.set(scale, downtown ? 2.4 + hash01(seed * 53) * 4.8 : 0.65 + hash01(seed * 53) * 1.4, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index++, dummy.matrix);
      accepted += 1;
    }
  }
  mesh.count = index;
  mesh.castShadow = quality === "desktop";
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function communityFootprint(id) {
  if (id === "kelowna") return [7_600, 6_800];
  if (id === "west-kelowna") return [5_000, 3_700];
  if (id === "lake-country") return [3_500, 4_900];
  return [1_700, 4_100];
}

function createRoads(world, sampleHeight) {
  const group = new THREE.Group();
  group.name = "central-okanagan-road-landmarks";
  for (const road of world.roads ?? []) {
    const points = road.points.map(([longitude, latitude]) => geographicToWorld(latitude, longitude));
    const roadMesh = createTerrainRibbon(points, road.widthM, sampleHeight, world, 0.75,
      new THREE.MeshStandardMaterial({ color: 0x454747, roughness: 0.98 }));
    roadMesh.name = road.name;
    group.add(roadMesh);
    if (road.id === "highway-97") {
      group.add(createTerrainRibbon(points, 0.9, sampleHeight, world, 0.88,
        new THREE.MeshBasicMaterial({ color: 0xd3ae55 })));
    }
  }
  return group;
}

function createTerrainRibbon(controlPoints, width, sampleHeight, world, offset, material) {
  const points = [];
  for (let segment = 0; segment < controlPoints.length - 1; segment += 1) {
    const start = controlPoints[segment];
    const end = controlPoints[segment + 1];
    const steps = Math.max(1, Math.ceil(start.distanceTo(end) / 180));
    for (let step = segment === 0 ? 0 : 1; step <= steps; step += 1)
      points.push(start.clone().lerp(end, step / steps));
  }
  const positions = new Float32Array(points.length * 2 * 3);
  const indices = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const direction = next.clone().sub(previous).setY(0).normalize();
    const across = new THREE.Vector3(direction.z, 0, -direction.x);
    for (const side of [-1, 1]) {
      const point = points[index].clone().addScaledVector(across, side * width / 2);
      const [longitude, latitude] = worldToGeographic(point.x, point.z);
      const bridgeLift = pointInPolygon(longitude, latitude, world.lake.shoreline) ? 7.5 : 0;
      point.y = sampleHeight(point.x, point.z) + offset + bridgeLift;
      const cursor = (index * 2 + (side === 1 ? 1 : 0)) * 3;
      positions[cursor] = point.x;
      positions[cursor + 1] = point.y;
      positions[cursor + 2] = point.z;
    }
    if (index < points.length - 1) {
      const a = index * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

export function isAgriculturePoint(world, x, z, scale = 1) {
  return (world.agriculture ?? []).some((zone) => {
    const centre = geographicToWorld(zone.latitude, zone.longitude);
    const angle = (Number(zone.rotationDeg) || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - centre.x;
    const dz = z - centre.z;
    const localX = dx * cos + dz * sin;
    const localZ = -dx * sin + dz * cos;
    return (localX / (zone.radiusXM * scale)) ** 2
      + (localZ / (zone.radiusZM * scale)) ** 2 < 1;
  });
}

function createForest(terrainData, world, sampleHeight, quality, isOperationalSurface) {
  const count = quality === "mobile" ? 900 : quality === "balanced" ? 3_000 : 7_000;
  const group = new THREE.Group();
  group.name = "ponderosa-douglas-fir-stands";
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.9, 9, 5),
    new THREE.MeshStandardMaterial({ color: 0x4f3525, roughness: 1 }), count);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(5.3, 18, 7),
    new THREE.MeshStandardMaterial({ color: 0x304d31, roughness: 0.96 }), count);
  const dummy = new THREE.Object3D();
  const bounds = terrainData.bounds;
  let placed = 0;
  const crownColor = new THREE.Color();
  for (let attempt = 0; attempt < count * 9 && placed < count; attempt += 1) {
    const latitude = bounds.south + (bounds.north - bounds.south) * hash01(attempt * 17 + 3);
    const longitude = bounds.west + (bounds.east - bounds.west) * hash01(attempt * 31 + 11);
    const point = geographicToWorld(latitude, longitude, 0);
    if (isOperationalSurface(point.x, point.z)) continue;
    if (world.communities.some((community) => {
      const centre = geographicToWorld(community.latitude, community.longitude, 0);
      const [radiusX, radiusZ] = communityFootprint(community.id);
      return ((point.x - centre.x) / radiusX) ** 2 + ((point.z - centre.z) / radiusZ) ** 2 < 0.72;
    })) continue;
    const y = sampleHeight(point.x, point.z);
    const agriculture = isAgriculturePoint(world, point.x, point.z, 0.94);
    if (agriculture && hash01(attempt * 83) < 0.87) continue;
    const density = THREE.MathUtils.clamp(0.18 + (y - 420) / 1_050, 0.16, 0.92);
    if (hash01(attempt * 79 + 5) > density) continue;
    const heightScale = 0.65 + hash01(attempt * 47) * 0.8;
    dummy.position.set(point.x, y + 4.5 * heightScale, point.z);
    dummy.rotation.y = hash01(attempt * 59) * Math.PI * 2;
    dummy.scale.set(heightScale, heightScale, heightScale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = y + 14 * heightScale;
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    crownColor.setHex(y < 780 ? 0x58633a : y < 1_350 ? 0x344b32 : 0x293f30);
    crownColor.offsetHSL(0, 0, (hash01(attempt * 67) - 0.5) * 0.08);
    crowns.setColorAt(placed, crownColor);
    placed += 1;
  }
  trunks.count = crowns.count = placed;
  trunks.castShadow = crowns.castShadow = quality === "desktop";
  trunks.receiveShadow = crowns.receiveShadow = true;
  group.add(trunks, crowns);
  return group;
}

function hash01(value) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
