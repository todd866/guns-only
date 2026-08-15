import * as THREE from "../../vendor/three.module.js?v=337";

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

  const terrain = createTerrain(terrainData);
  group.add(terrain.mesh);
  group.add(createLake(worldData));
  group.add(createRunway(worldData, terrain.sampleHeight));
  group.add(createSettlements(worldData, terrain.sampleHeight, quality));
  group.add(createForest(terrainData, worldData, terrain.sampleHeight, quality));

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

function createTerrain(data) {
  const { rows, columns, bounds, elevationsM } = data;
  const positions = new Float32Array(rows * columns * 3);
  const colors = new Float32Array(rows * columns * 3);
  const minimum = Math.min(...elevationsM.flat());
  const maximum = Math.max(...elevationsM.flat());
  const dryLow = new THREE.Color(0x776f45);
  const pineMid = new THREE.Color(0x52623c);
  const rockHigh = new THREE.Color(0x77756a);
  let cursor = 0;
  for (let row = 0; row < rows; row += 1) {
    const latitude = bounds.south + (bounds.north - bounds.south) * row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const longitude = bounds.west + (bounds.east - bounds.west) * column / (columns - 1);
      const world = geographicToWorld(latitude, longitude, elevationsM[row][column]);
      positions[cursor * 3] = world.x;
      positions[cursor * 3 + 1] = world.y;
      positions[cursor * 3 + 2] = world.z;
      const elevationT = (world.y - minimum) / Math.max(1, maximum - minimum);
      const color = elevationT < 0.52
        ? dryLow.clone().lerp(pineMid, elevationT / 0.52)
        : pineMid.clone().lerp(rockHigh, (elevationT - 0.52) / 0.48);
      colors[cursor * 3] = color.r;
      colors[cursor * 3 + 1] = color.g;
      colors[cursor * 3 + 2] = color.b;
      cursor += 1;
    }
  }
  const indices = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
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

  function sampleHeight(x, z) {
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
  }
  return { mesh, sampleHeight };
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
  const runway = new THREE.Mesh(new THREE.BoxGeometry(46, 0.8, airport.runwayLengthM),
    new THREE.MeshStandardMaterial({ color: 0x41474a, roughness: 0.94 }));
  runway.rotation.y = airport.runwayHeadingDeg * Math.PI / 180;
  runway.position.copy(centre);
  runway.position.y = Math.max(airport.elevationM, sampleHeight(centre.x, centre.z)) + 1.2;
  runway.receiveShadow = true;
  group.add(runway);
  for (let index = -10; index <= 10; index += 1) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 26),
      new THREE.MeshBasicMaterial({ color: 0xe6e7df }));
    mark.rotation.y = runway.rotation.y;
    mark.position.copy(runway.position);
    const along = new THREE.Vector3(Math.sin(airport.runwayHeadingDeg * Math.PI / 180), 0,
      Math.cos(airport.runwayHeadingDeg * Math.PI / 180));
    mark.position.addScaledVector(along, index * 105);
    mark.position.y += 0.08;
    group.add(mark);
  }
  return group;
}

function createSettlements(world, sampleHeight, quality) {
  const group = new THREE.Group();
  group.name = "2021-census-communities";
  const count = quality === "mobile" ? 180 : quality === "balanced" ? 380 : 680;
  const geometry = new THREE.BoxGeometry(12, 7, 18);
  const material = new THREE.MeshStandardMaterial({ color: 0xb9aa8b, roughness: 0.93 });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  let index = 0;
  for (const community of world.communities) {
    const centre = geographicToWorld(community.latitude, community.longitude, 0);
    const share = Math.max(18, Math.round(count * community.population2021 / 202260));
    for (let building = 0; building < share && index < count; building += 1) {
      const angle = hash01(index * 13 + community.population2021) * Math.PI * 2;
      const radius = Math.sqrt(hash01(index * 29 + 7)) * Math.min(3_800, 450 + Math.sqrt(community.population2021) * 8);
      const x = centre.x + Math.cos(angle) * radius;
      const z = centre.z + Math.sin(angle) * radius;
      const y = sampleHeight(x, z);
      dummy.position.set(x, y + 4, z);
      dummy.rotation.y = hash01(index * 43) * Math.PI;
      const scale = 0.65 + hash01(index * 71) * 1.5;
      dummy.scale.set(scale, 0.7 + hash01(index * 53) * 2.1, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index++, dummy.matrix);
    }
  }
  mesh.count = index;
  mesh.castShadow = quality === "desktop";
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function createForest(terrainData, world, sampleHeight, quality) {
  const count = quality === "mobile" ? 900 : quality === "balanced" ? 2_000 : 4_200;
  const group = new THREE.Group();
  group.name = "ponderosa-douglas-fir-stands";
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.9, 9, 5),
    new THREE.MeshStandardMaterial({ color: 0x4f3525, roughness: 1 }), count);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(5.3, 18, 7),
    new THREE.MeshStandardMaterial({ color: 0x304d31, roughness: 0.96 }), count);
  const dummy = new THREE.Object3D();
  const bounds = terrainData.bounds;
  let placed = 0;
  for (let attempt = 0; attempt < count * 3 && placed < count; attempt += 1) {
    const latitude = bounds.south + (bounds.north - bounds.south) * hash01(attempt * 17 + 3);
    const longitude = bounds.west + (bounds.east - bounds.west) * hash01(attempt * 31 + 11);
    const point = geographicToWorld(latitude, longitude, 0);
    if (point.x > -5_500 && point.x < 1_800) continue;
    if (world.communities.some((community) => {
      const centre = geographicToWorld(community.latitude, community.longitude, 0);
      return centre.distanceToSquared(point) < 1_500 * 1_500;
    })) continue;
    const y = sampleHeight(point.x, point.z);
    const heightScale = 0.65 + hash01(attempt * 47) * 0.8;
    dummy.position.set(point.x, y + 4.5 * heightScale, point.z);
    dummy.rotation.y = hash01(attempt * 59) * Math.PI * 2;
    dummy.scale.set(heightScale, heightScale, heightScale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = y + 14 * heightScale;
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
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
