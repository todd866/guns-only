import * as THREE from "../../vendor/three.module.js";
import { createPeachland, createPeachlandExclusion, withinPeachland } from "./peachland.js";

import { createResortScenery, createResortExclusion } from "./resorts.js";

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

const FIRE_BENCH = geographicToWorld(49.850, -119.655);
const BUNCHGRASS = new THREE.Color(0xa88d55);
const DRY_PONDEROSA = new THREE.Color(0x796f43);
const DOUGLAS_FIR = new THREE.Color(0x3f5236);
const ROCK_HIGH = new THREE.Color(0x77746a);
const INCIDENT_TIMBER = new THREE.Color(0x2a3a28);

/** Vertex shade for the CDEM mesh. The fire bench is forced onto darker fir so the flank
 *  reads as timber from the lake, not dry bunchgrass. */
export function okanaganGroundCoverShade(x, z, elevationM, extras = {}) {
  const minimum = Number.isFinite(extras.minimum) ? extras.minimum : 342;
  const maximum = Number.isFinite(extras.maximum) ? extras.maximum : 2_000;
  const elevationT = (elevationM - minimum) / Math.max(1, maximum - minimum);
  const lowT = THREE.MathUtils.smoothstep(elevationM, 380, 930);
  const highT = THREE.MathUtils.smoothstep(elevationM, 2_020, 2_350);
  const color = BUNCHGRASS.clone().lerp(DRY_PONDEROSA, lowT)
    .lerp(DOUGLAS_FIR, THREE.MathUtils.clamp(lowT * 0.82 + elevationT * 0.28, 0, 1))
    .lerp(ROCK_HIGH, highT);
  const fireRangeM = Math.hypot(x - FIRE_BENCH.x, z - FIRE_BENCH.z);
  if (fireRangeM < 2_800) color.lerp(INCIDENT_TIMBER, 0.72 * (1 - fireRangeM / 2_800));
  return color;
}

/** Dedicated west-bench stems. Valley sampling is too thin to make the published flank read. */
export function okanaganIncidentTimberPoints(count = 80) {
  const bounded = Math.max(0, Math.trunc(count));
  const points = [];
  for (let attempt = 0; attempt < bounded * 8 && points.length < bounded; attempt += 1) {
    const angle = hash01(attempt * 19 + 3) * Math.PI * 2;
    const radius = 90 + Math.sqrt(hash01(attempt * 41 + 7)) * 2_280;
    if (radius > 2_400) continue;
    points.push(Object.freeze({
      x: FIRE_BENCH.x + Math.cos(angle) * radius,
      z: FIRE_BENCH.z + Math.sin(angle) * radius,
      radius,
    }));
  }
  return points;
}

export async function loadOkanaganSceneryTextures(terrainData, quality = "desktop") {
  const textures = new Map();
  async function load(id, url) {
    try {
      const texture = await new THREE.TextureLoader().loadAsync(url);
      if (quality === "mobile" && texture.image.width > 2048) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 2048;
        canvas.getContext("2d").drawImage(texture.image, 0, 0, 2048, 2048);
        texture.image = canvas;
        texture.needsUpdate = true;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      textures.set(id, texture);
    } catch (error) { console.warn(`Scenery texture unavailable: ${id}`, error); }
  }
  await Promise.all(terrainHierarchy(terrainData).map(({ grid }) => grid).filter(grid => grid.texture?.url).flatMap(grid => [
    load(grid.id, grid.texture.url),
    ...(grid.texture.fallback ? [load(`${grid.id}-fallback`, grid.texture.fallback.url)] : []),
  ]));
  return textures;
}

export function createOkanaganWorld(scene, terrainData, worldData, quality = "desktop", textures = new Map()) {
  const group = new THREE.Group();
  group.name = "okanagan-central-world";
  scene.add(group);
  const localScenery = [];

  const terrain = createTerrain(terrainData, worldData, textures);
  group.add(terrain.mesh);
  group.add(createLake(worldData));
  group.add(createRoads(worldData, terrain.sampleHeight));
  group.add(createRunway(worldData, terrain.sampleHeight));
  group.add(createSettlements(worldData, terrain.sampleHeight, quality, terrain.isOperationalSurface));
  group.add(createPeachland(worldData.peachland, geographicToWorld, terrain.sampleHeight, quality));
  for (const resort of worldData.resorts ?? []) {
    const local = new THREE.Group();
    local.add(createPeachland(resort, geographicToWorld, terrain.sampleHeight, quality));
    local.add(createResortScenery(resort, geographicToWorld, terrain.sampleHeight, quality));
    const b = resort.bounds;
    localScenery.push({ group: local, centre: geographicToWorld((b.south+b.north)/2, (b.west+b.east)/2) });
    group.add(local);
  }
  group.add(createForest(terrainData, worldData, terrain.sampleHeight, quality,
    terrain.isOperationalSurface));
  group.add(createIncidentTimber(worldData, terrain.sampleHeight, quality,
    terrain.isOperationalSurface));

  return Object.freeze({
    group,
    sampleHeight: terrain.sampleHeight,
    worldData,
    update(position) {
      for (const local of localScenery) local.group.visible = Math.hypot(position.x-local.centre.x,position.z-local.centre.z) < 25_000;
    },
    dispose() {
      for (const texture of textures.values()) texture.dispose();
      group.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      group.removeFromParent();
    },
  });
}

export function terrainHierarchy(grid, parent = grid) {
  return [{ grid, parent }, ...(grid.details ?? []).flatMap(child => terrainHierarchy(child, grid))];
}

function createTerrain(data, world, textures) {
  const sampleHeight = createOkanaganSurfaceSampler(data, world);
  const isOperationalSurface = (x, z) => {
    const [longitude, latitude] = worldToGeographic(x, z);
    return isOkanaganLake(world, longitude, latitude) || kelownaRunwayBlend(x, z) > 0.02;
  };
  const group = new THREE.Group();
  group.name = "measured-okanagan-terrain";
  for (const { grid, parent } of terrainHierarchy(data)) {
    const { rows, columns, bounds } = grid;
    const positions = [];
    const colors = [];
    const indices = [];
    const uvs = [];
    const weights = [];
    const coverages = [];
    const texture = textures.get(grid.id);
    const fallbackTexture = textures.get(`${grid.id}-fallback`);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, map: texture ?? null });
    if (texture) {
      material.onBeforeCompile = shader => {
        shader.uniforms.coverFallback = { value: fallbackTexture ?? texture };
        shader.uniforms.hasCoverFallback = { value: fallbackTexture ? 1 : 0 };
        shader.vertexShader = `attribute float mapWeight; attribute float coverWeight; varying float vMapWeight; varying float vCoverWeight;\n${shader.vertexShader}`
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMapWeight = mapWeight; vCoverWeight = coverWeight;");
        shader.fragmentShader = `varying float vMapWeight; varying float vCoverWeight; uniform sampler2D coverFallback; uniform float hasCoverFallback;\n${shader.fragmentShader}`.replace("#include <map_fragment>",
          // Aerial photography already contains daylight; reduce it before the scene relights it.
          "#ifdef USE_MAP\nvec3 cover = mix(texture2D(coverFallback, vMapUv).rgb, texture2D(map, vMapUv).rgb, vCoverWeight);\ndiffuseColor.rgb *= mix(vColor, cover * 0.4, vMapWeight * mix(vCoverWeight, 1.0, hasCoverFallback));\n#endif")
          .replace("#include <color_fragment>", "");
      };
      material.customProgramCacheKey = () => "okanagan-georeferenced-cover-v1";
    }
    const addVertex = (longitude, latitude) => {
      const p = geographicToWorld(latitude, longitude);
      p.y = sampleHeight(p.x, p.z);
      const index = positions.length / 3;
      positions.push(p.x, p.y, p.z);
      const color = okanaganGroundCoverShade(p.x, p.z, p.y);
      // Broad, coherent ground variation; independent noise per vertex made a triangular quilt.
      color.offsetHSL(0, 0, (Math.sin(p.x / 430) * Math.cos(p.z / 620)) * 0.025);
      if (isAgriculturePoint(world, p.x, p.z)) color.lerp(new THREE.Color(0x7b8148), 0.45);
      const edge = Math.min((longitude - bounds.west) / ((parent.bounds.east - parent.bounds.west) / (parent.columns - 1)),
        (bounds.east - longitude) / ((parent.bounds.east - parent.bounds.west) / (parent.columns - 1)),
        (latitude - bounds.south) / ((parent.bounds.north - parent.bounds.south) / (parent.rows - 1)),
        (bounds.north - latitude) / ((parent.bounds.north - parent.bounds.south) / (parent.rows - 1)));
      const u = (longitude - bounds.west) / (bounds.east - bounds.west);
      const v = (latitude - bounds.south) / (bounds.north - bounds.south);
      const maskRow = Math.max(0, Math.min(rows - 1, Math.round(v * (rows - 1))));
      const maskCol = Math.max(0, Math.min(columns - 1, Math.round(u * (columns - 1))));
      const coverage = (grid.texture?.coverage?.[maskRow]?.[maskCol] ?? 255) / 255;
      const weight = THREE.MathUtils.smoothstep(edge, 0, grid.blendCells ?? 1);
      uvs.push(u, v);
      weights.push(weight);
      coverages.push(coverage);
      colors.push(color.r, color.g, color.b);
      return index;
    };
    for (let row = 0; row < rows; row += 1) {
      const lat = bounds.south + (bounds.north - bounds.south) * row / (rows - 1);
      for (let column = 0; column < columns; column += 1)
        addVertex(bounds.west + (bounds.east - bounds.west) * column / (columns - 1), lat);
    }
    const shoreCells = new Map(grid.shoreCells ?? []);
    const waterCells = new Set(grid.waterCells ?? []);
    for (let row = 0; row < rows - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        if ((grid.details ?? []).some(({ parentWindow: w }) => w
          && row >= w.rowStart && row < w.rowEnd && column >= w.columnStart && column < w.columnEnd)) continue;
        const key = row * (columns - 1) + column;
        if (waterCells.has(key)) continue;
        if (shoreCells.has(key)) {
          for (const polygon of shoreCells.get(key)) {
            const rings = polygon.map((ring) => ring.slice(0, -1).map(([lon, lat]) => new THREE.Vector2(lon, lat)));
            const triangles = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
            const vertexIds = rings.flat().map((v) => addVertex(v.x, v.y));
            for (const [a, b, c] of triangles) indices.push(vertexIds[c], vertexIds[b], vertexIds[a]);
          }
          continue;
        }
        const a = row * columns + column;
        indices.push(a, a + columns, a + 1, a + 1, a + columns, a + columns + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("mapWeight", new THREE.Float32BufferAttribute(weights, 1));
    geometry.setAttribute("coverWeight", new THREE.Float32BufferAttribute(coverages, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = grid.id ? `${grid.id}-terrain` : "regional-terrain";
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { mesh: group, sampleHeight, isOperationalSurface };
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

/** The detail patch blends to its parent along one coarse cell, matching the shared sim surface. */
export function createOkanaganRawSampler(data) {
  const base = createRawCdemSampler(data);
  const details = (data.details ?? []).map((grid) => ({ grid, sample: createOkanaganRawSampler(grid) }));
  const stepX = (data.bounds.east - data.bounds.west) / (data.columns - 1);
  const stepZ = (data.bounds.north - data.bounds.south) / (data.rows - 1);
  return (x, z) => {
    const [longitude, latitude] = worldToGeographic(x, z);
    let height = base(x, z);
    for (const { grid, sample } of details) {
      const b = grid.bounds;
      const edge = Math.min((longitude - b.west) / stepX, (b.east - longitude) / stepX,
        (latitude - b.south) / stepZ, (b.north - latitude) / stepZ);
      if (edge <= 0) continue;
      const blend = THREE.MathUtils.smoothstep(edge, 0, grid.blendCells ?? 1);
      height = THREE.MathUtils.lerp(height, sample(x, z), blend);
    }
    return height;
  };
}

export function createOkanaganSurfaceSampler(terrainData, worldData) {
  const rawHeight = createOkanaganRawSampler(terrainData);
  return (x, z) => operationalSurfaceHeight(worldData, rawHeight, x, z);
}

function operationalSurfaceHeight(world, rawHeight, x, z) {
  const [longitude, latitude] = worldToGeographic(x, z);
  if (isOkanaganLake(world, longitude, latitude))
    return world.lake.surfaceElevationM;
  const raw = rawHeight(x, z);
  return THREE.MathUtils.lerp(raw, world.airfields[0].elevationM, kelownaRunwayBlend(x, z));
}

function worldToGeographic(x, z) {
  return [ANCHOR_LON + x / DEG_LON_M, ANCHOR_LAT + z / DEG_LAT_M];
}

const polygonRows = new WeakMap();
export function isOkanaganLake(world, longitude, latitude) {
  return pointInPolygon(longitude, latitude, world.lake.shoreline)
    && !(world.lake.islands ?? []).some(ring => pointInPolygon(longitude, latitude, ring));
}
function pointInPolygon(longitude, latitude, shoreline) {
  let prepared = polygonRows.get(shoreline);
  if (!prepared) {
    const south = Math.min(...shoreline.map((p) => p[1]));
    const north = Math.max(...shoreline.map((p) => p[1]));
    const bins = Array.from({ length: 256 }, () => []);
    const row = (lat) => Math.max(0, Math.min(255, Math.floor((lat - south) / (north - south) * 256)));
    for (let i = 0, j = shoreline.length - 1; i < shoreline.length; j = i++) {
      const a = shoreline[j], b = shoreline[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      for (let r = row(Math.min(a[1], b[1])); r <= row(Math.max(a[1], b[1])); r += 1) bins[r].push([a, b]);
    }
    prepared = { south, north, bins, row };
    polygonRows.set(shoreline, prepared);
  }
  if (latitude < prepared.south || latitude > prepared.north) return false;
  let inside = false;
  for (const [[xi, yi], [xj, yj]] of prepared.bins[prepared.row(latitude)]) {
    const dx = xj - xi, dy = yj - yi;
    const cross = (longitude - xi) * dy - (latitude - yi) * dx;
    const dot = (longitude - xi) * dx + (latitude - yi) * dy;
    if (Math.abs(cross) < 1e-12 && dot >= 0 && dot <= dx * dx + dy * dy) return true;
    if (((yi > latitude) !== (yj > latitude)) && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
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
  for (const ring of world.lake.islands ?? []) {
    const hole = new THREE.Path();
    ring.forEach(([longitude, latitude], index) => {
      const p = geographicToWorld(latitude, longitude);
      if (index === 0) hole.moveTo(p.x, -p.z); else hole.lineTo(p.x, -p.z);
    });
    hole.closePath();
    shape.holes.push(hole);
  }
  const lake = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({
    color: 0x2a6f87,
    roughness: 0.24,
    metalness: 0.05,
    transparent: false,
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

  // Forty-one paint strips share one draw call. Each strip keeps its original geometry/pose.
  const paint = [];
  for (const mark of [...group.children].filter(child => child.material?.isMeshBasicMaterial)) {
    mark.updateMatrix();
    const geometry = mark.geometry.toNonIndexed().applyMatrix4(mark.matrix);
    paint.push(...geometry.attributes.position.array);
    geometry.dispose(); mark.geometry.dispose(); mark.material.dispose(); mark.removeFromParent();
  }
  const paintGeometry = new THREE.BufferGeometry();
  paintGeometry.setAttribute("position", new THREE.Float32BufferAttribute(paint, 3));
  group.add(new THREE.Mesh(paintGeometry, new THREE.MeshBasicMaterial({ color: 0xe8e8df })));

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
  group.name = "surrogate-regional-settlements";
  const count = quality === "mobile" ? 180 : quality === "balanced" ? 500 : 1_200;
  const geometry = new THREE.BoxGeometry(12, 7, 18);
  const material = new THREE.MeshStandardMaterial({ color: 0xb9aa8b, roughness: 0.93 });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  let index = 0;
  let seed = 0;
  for (const community of world.communities) {
    if (community.id === "peachland" && world.peachland) continue;
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
      const [longitude, latitude] = worldToGeographic(x, z);
      if (withinPeachland(world.peachland, latitude, longitude)) continue;
      if (isOperationalSurface(x, z) || sampleHeight(x, z) > 940) continue;
      const y = sampleHeight(x, z);
      const slope = Math.hypot(sampleHeight(x + 20, z) - sampleHeight(x - 20, z),
        sampleHeight(x, z + 20) - sampleHeight(x, z - 20)) / 40;
      if (slope > 0.25) continue;
      dummy.rotation.y = (Math.round(hash01(seed * 43) * 4) * Math.PI / 2) + 0.16;
      const scale = 0.65 + hash01(seed * 71) * 1.65;
      const downtown = community.id === "kelowna" && radius < 0.22;
      dummy.scale.set(scale, downtown ? 2.4 + hash01(seed * 53) * 4.8 : 0.65 + hash01(seed * 53) * 1.4, scale);
      dummy.position.set(x, y + 3.5 * dummy.scale.y, z);
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
    for (const path of road.paths ?? [road.points]) {
    const points = path.map(([longitude, latitude]) => geographicToWorld(latitude, longitude));
    const roadMesh = createTerrainRibbon(points, road.widthM, sampleHeight, world, 0.75,
      new THREE.MeshStandardMaterial({ color: 0x454747, roughness: 0.98 }));
    roadMesh.name = road.name;
    group.add(roadMesh);
    if (road.id === "highway-97") {
      group.add(createTerrainRibbon(points, 0.9, sampleHeight, world, 0.88,
        new THREE.MeshBasicMaterial({ color: 0xd3ae55 })));
    }
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
    const [centreLongitude, centreLatitude] = worldToGeographic(points[index].x, points[index].z);
    const bridgeLift = centreLatitude > 49.87 && centreLatitude < 49.89
      && centreLongitude > -119.54 && centreLongitude < -119.49
      && isOkanaganLake(world, centreLongitude, centreLatitude) ? 7.5 : 0;
    for (const side of [-1, 1]) {
      const point = points[index].clone().addScaledVector(across, side * width / 2);
      point.y = sampleHeight(point.x, point.z) + offset + bridgeLift;
      const cursor = (index * 2 + (side === 1 ? 1 : 0)) * 3;
      positions[cursor] = point.x;
      positions[cursor + 1] = point.y;
      positions[cursor + 2] = point.z;
    }
    if (index < points.length - 1) {
      const [lon, lat] = worldToGeographic((points[index].x + points[index + 1].x) / 2,
        (points[index].z + points[index + 1].z) / 2);
      if (withinPeachland(world.peachland, lat, lon)) continue;
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

export function okanaganForestStandChance(x, z, elevationM, world) {
  if (isAgriculturePoint(world, x, z, 0.94)) return 0.13;
  const elevation = THREE.MathUtils.clamp(0.18 + (finiteElevation(elevationM) - 420) / 1_050, 0.16, 0.92);
  const fire = geographicToWorld(49.850, -119.655);
  const fireRangeM = Math.hypot(x - fire.x, z - fire.z);
  if (fireRangeM < 3_800) return Math.max(elevation, 0.78);
  return elevation;
}

function finiteElevation(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function createIncidentTimber(world, sampleHeight, quality, isOperationalSurface) {
  const count = quality === "mobile" ? 280 : quality === "balanced" ? 700 : 1_400;
  const group = new THREE.Group();
  group.name = "incident-timber-stand";
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.9, 1.3, 12, 6),
    new THREE.MeshStandardMaterial({ color: 0x4f3525, roughness: 1 }),
    count,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.ConeGeometry(8.4, 26, 7),
    new THREE.MeshStandardMaterial({ color: 0x2c432c, roughness: 0.96 }),
    count,
  );
  const dummy = new THREE.Object3D();
  const crownColor = new THREE.Color();
  let placed = 0;
  const candidates = okanaganIncidentTimberPoints(count * 2);
  for (let index = 0; index < candidates.length && placed < count; index += 1) {
    const point = candidates[index];
    if (isOperationalSurface(point.x, point.z)) continue;
    const y = sampleHeight(point.x, point.z);
    const heightScale = 1.15 + hash01(index * 47) * 1.15;
    dummy.position.set(point.x, y + 6 * heightScale, point.z);
    dummy.rotation.y = hash01(index * 59) * Math.PI * 2;
    dummy.scale.set(heightScale, heightScale, heightScale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = y + 18 * heightScale;
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    crownColor.setHex(y < 780 ? 0x4a5534 : 0x2c432c);
    crownColor.offsetHSL(0, 0, (hash01(index * 67) - 0.5) * 0.06);
    crowns.setColorAt(placed, crownColor);
    placed += 1;
  }
  trunks.count = crowns.count = placed;
  trunks.castShadow = crowns.castShadow = quality === "desktop";
  trunks.receiveShadow = crowns.receiveShadow = true;
  group.add(trunks, crowns);
  return group;
}

function createForest(terrainData, world, sampleHeight, quality, isOperationalSurface) {
  const count = quality === "mobile" ? 1_700 : quality === "balanced" ? 5_500 : 13_000;
  const group = new THREE.Group();
  group.name = "ponderosa-douglas-fir-stands";
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.9, 9, 5),
    new THREE.MeshStandardMaterial({ color: 0x4f3525, roughness: 1 }), count);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(5.3, 18, 7),
    new THREE.MeshStandardMaterial({ color: 0x304d31, roughness: 0.96 }), count);
  const pines = new THREE.InstancedMesh(pineCrownGeometry(), crowns.material, count);
  const dummy = new THREE.Object3D();
  const bounds = terrainData.bounds;
  const excludePeachland = createPeachlandExclusion(world.peachland, geographicToWorld);
  const resortExclusions = (world.resorts ?? []).map(r => createResortExclusion(r, geographicToWorld));
  const regions = [world.peachland?.bounds, bounds].filter(Boolean);
  let placed = 0;
  let pineCount = 0;
  let firCount = 0;
  const crownColor = new THREE.Color();
  for (let attempt = 0; attempt < count * 9 && placed < count; attempt += 1) {
    const region = regions[attempt % regions.length];
    const latitude = region.south + (region.north - region.south) * hash01(attempt * 17 + 3);
    const longitude = region.west + (region.east - region.west) * hash01(attempt * 31 + 11);
    const point = geographicToWorld(latitude, longitude, 0);
    if (isOperationalSurface(point.x, point.z)) continue;
    if (excludePeachland(point.x, point.z) || resortExclusions.some(exclude => exclude(point.x, point.z))) continue;
    if (world.communities.some((community) => {
      if (community.id === "peachland" && world.peachland) return false;
      const centre = geographicToWorld(community.latitude, community.longitude, 0);
      const [radiusX, radiusZ] = communityFootprint(community.id);
      return ((point.x - centre.x) / radiusX) ** 2 + ((point.z - centre.z) / radiusZ) ** 2 < 0.72;
    })) continue;
    const y = sampleHeight(point.x, point.z);
    const slope = Math.hypot(sampleHeight(point.x + 30, point.z) - sampleHeight(point.x - 30, point.z),
      sampleHeight(point.x, point.z + 30) - sampleHeight(point.x, point.z - 30)) / 60;
    if (slope > 0.9 || y > 2_170 || hash01(attempt * 83) < THREE.MathUtils.smoothstep(y, 1_990, 2_180)) continue;
    if (hash01(attempt * 79 + 5) > okanaganForestStandChance(point.x, point.z, y, world)) continue;
    const heightScale = 0.65 + hash01(attempt * 47) * 0.8;
    dummy.position.set(point.x, y + 4.5 * heightScale, point.z);
    dummy.rotation.y = hash01(attempt * 59) * Math.PI * 2;
    dummy.scale.set(heightScale, heightScale, heightScale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = y + 14 * heightScale;
    dummy.updateMatrix();
    const pine = y < 900 && hash01(attempt * 23) > 0.2;
    const canopy = pine ? pines : crowns;
    const canopyIndex = pine ? pineCount++ : firCount++;
    canopy.setMatrixAt(canopyIndex, dummy.matrix);
    crownColor.setHex(pine ? 0x58633a : y < 1_350 ? 0x344b32 : 0x293f30);
    crownColor.offsetHSL(0, 0, (hash01(attempt * 67) - 0.5) * 0.08);
    canopy.setColorAt(canopyIndex, crownColor);
    placed += 1;
  }
  trunks.count = placed;
  crowns.count = firCount;
  pines.count = pineCount;
  trunks.castShadow = crowns.castShadow = pines.castShadow = quality === "desktop";
  trunks.receiveShadow = crowns.receiveShadow = pines.receiveShadow = true;
  group.add(trunks, crowns, pines);
  return group;
}

function pineCrownGeometry() {
  const positions = [];
  // An open, irregular mature pine crown, distinct from the narrow fir spire.
  for (const [x, y, z, sx, sy, sz] of [[0, 3, 0, 4.5, 6, 4.1], [-2.5, -1, 0.8, 3.8, 4.3, 3.7],
    [2.6, -2.5, -0.7, 3.4, 3.5, 3.2]]) {
    const part = new THREE.IcosahedronGeometry(1, 0).scale(sx, sy, sz).translate(x, y, z);
    positions.push(...part.attributes.position.array);
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function hash01(value) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
