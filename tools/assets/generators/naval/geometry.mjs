const EPSILON = 1e-6;

function requireFiniteTuple(values, label) {
  if (!Array.isArray(values) || values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`${label} must be a finite [x, y, z] tuple`);
  }
}

export function material(THREE, name, color, options = {}) {
  const value = new THREE.MeshStandardMaterial({
    name,
    color,
    metalness: options.metalness ?? 0.35,
    roughness: options.roughness ?? 0.65,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    side: options.side ?? THREE.FrontSide,
  });
  value.name = name;
  return value;
}

export function addBox(THREE, parent, name, size, position, meshMaterial, options = {}) {
  requireFiniteTuple(size, `${name} size`);
  requireFiniteTuple(position, `${name} position`);
  const geometry = new THREE.BoxGeometry(...size);
  geometry.name = `${name}_GEOMETRY`;
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.fromArray(position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  if (options.castShadow !== false) mesh.castShadow = true;
  mesh.receiveShadow = options.receiveShadow !== false;
  parent.add(mesh);
  return mesh;
}

export function addCylinder(THREE, parent, name, radiusTop, radiusBottom, length, position, meshMaterial, options = {}) {
  requireFiniteTuple(position, `${name} position`);
  const radialSegments = options.radialSegments ?? 12;
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments, options.heightSegments ?? 1, false);
  geometry.name = `${name}_GEOMETRY`;
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.fromArray(position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = options.receiveShadow !== false;
  parent.add(mesh);
  return mesh;
}

export function addSphere(THREE, parent, name, radius, position, meshMaterial, options = {}) {
  requireFiniteTuple(position, `${name} position`);
  const geometry = new THREE.SphereGeometry(radius, options.widthSegments ?? 10, options.heightSegments ?? 6);
  geometry.name = `${name}_GEOMETRY`;
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.fromArray(position);
  mesh.castShadow = options.castShadow === true;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

export function addAnchor(THREE, parent, id, node, translation, rotation = [0, 0, 0]) {
  requireFiniteTuple(translation, `${node} translation`);
  requireFiniteTuple(rotation, `${node} rotation`);
  if (!/^SOCKET_[A-Z0-9_]+$/.test(node)) throw new Error(`invalid socket node '${node}'`);
  const anchor = new THREE.Object3D();
  anchor.name = node;
  anchor.position.fromArray(translation);
  anchor.rotation.set(...rotation);
  anchor.userData.anchorId = id;
  parent.add(anchor);
  return Object.freeze({ id, node, translation: Object.freeze([...translation]), rotation: Object.freeze([...rotation]) });
}

export function createStationHullGeometry(THREE, stations, crossSegments = 16) {
  if (!Array.isArray(stations) || stations.length < 3) throw new Error("hull needs at least three stations");
  if (!Number.isInteger(crossSegments) || crossSegments < 4) throw new Error("crossSegments must be an integer >= 4");
  const positions = [];
  const uvs = [];
  const indices = [];
  const ringSize = crossSegments + 1;
  for (const [index, station] of stations.entries()) {
    if (![station.z, station.halfBeam, station.gunwaleY, station.keelY].every(Number.isFinite)) throw new Error(`invalid hull station ${index}`);
    if (station.halfBeam <= 0 || station.gunwaleY <= station.keelY) throw new Error(`invalid dimensions at hull station ${index}`);
    for (let segment = 0; segment <= crossSegments; segment++) {
      const ratio = segment / crossSegments;
      const angle = Math.PI * ratio;
      const depth = Math.sin(angle);
      const flare = 1 - depth * (station.keelTuck ?? 0.42);
      positions.push(
        -Math.cos(angle) * station.halfBeam * flare,
        station.gunwaleY - depth * (station.gunwaleY - station.keelY),
        station.z,
      );
      uvs.push(segment / crossSegments, index / (stations.length - 1));
    }
  }
  for (let station = 0; station < stations.length - 1; station++) {
    const current = station * ringSize;
    const next = current + ringSize;
    for (let segment = 0; segment < crossSegments; segment++) {
      const a = current + segment;
      const b = current + segment + 1;
      const c = next + segment;
      const d = next + segment + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  for (const stationIndex of [0, stations.length - 1]) {
    const station = stations[stationIndex];
    const centre = positions.length / 3;
    positions.push(0, (station.gunwaleY + station.keelY) * 0.5, station.z);
    uvs.push(0.5, stationIndex === 0 ? 0 : 1);
    const start = stationIndex * ringSize;
    for (let segment = 0; segment < crossSegments; segment++) {
      if (stationIndex === 0) indices.push(centre, start + segment, start + segment + 1);
      else indices.push(centre, start + segment + 1, start + segment);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = "STATION_HULL_GEOMETRY";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  geometry.computeBoundingBox();
  return geometry;
}

export function createExtrudedOutlineGeometry(THREE, outline, bottomY, topY) {
  if (!Array.isArray(outline) || outline.length < 3) throw new Error("outline needs at least three [x, z] points");
  if (!Number.isFinite(bottomY) || !Number.isFinite(topY) || topY <= bottomY) throw new Error("invalid extrusion heights");
  const shape = new THREE.Shape();
  outline.forEach(([x, z], index) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`invalid outline point ${index}`);
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: topY - bottomY,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  // Shape XY maps to runtime XZ. Extrusion Z maps to runtime Y.
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(1, 1, -1);
  geometry.translate(0, bottomY, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export function addOutlineDeck(THREE, parent, name, outline, bottomY, topY, meshMaterial) {
  const geometry = createExtrudedOutlineGeometry(THREE, outline, bottomY, topY);
  geometry.name = `${name}_GEOMETRY`;
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function addInstancedBoxes(THREE, parent, name, size, positions, meshMaterial) {
  requireFiniteTuple(size, `${name} size`);
  const geometry = new THREE.BoxGeometry(...size);
  geometry.name = `${name}_GEOMETRY`;
  const mesh = new THREE.InstancedMesh(geometry, meshMaterial, positions.length);
  mesh.name = name;
  const transform = new THREE.Object3D();
  positions.forEach((position, index) => {
    requireFiniteTuple(position, `${name}[${index}] position`);
    transform.position.fromArray(position);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(1, 1, 1);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function primitiveTriangles(geometry) {
  if (!geometry) return 0;
  if (geometry.index) return Math.floor(geometry.index.count / 3);
  const positions = geometry.getAttribute?.("position");
  return positions ? Math.floor(positions.count / 3) : 0;
}

export function measureScene(THREE, scene) {
  scene.updateMatrixWorld(true);
  const uniqueGeometries = new Set();
  const materials = new Set();
  let storedTriangles = 0;
  let renderedTriangles = 0;
  let drawCalls = 0;
  let meshNodes = 0;
  let instanceCount = 0;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    meshNodes++;
    drawCalls += Array.isArray(object.material) ? object.material.length : 1;
    const triangles = primitiveTriangles(object.geometry);
    const instances = object.isInstancedMesh ? object.count : 1;
    instanceCount += instances;
    renderedTriangles += triangles * instances;
    if (!uniqueGeometries.has(object.geometry)) {
      uniqueGeometries.add(object.geometry);
      storedTriangles += triangles;
    }
    for (const value of Array.isArray(object.material) ? object.material : [object.material]) if (value) materials.add(value);
  });
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const finiteBounds = [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite);
  if (!finiteBounds || size.lengthSq() < EPSILON) throw new Error("scene has empty or invalid bounds");
  return Object.freeze({
    storedTriangles,
    renderedTriangles,
    drawCalls,
    materials: materials.size,
    meshNodes,
    instanceCount,
    bounds: Object.freeze({ min: Object.freeze(bounds.min.toArray()), max: Object.freeze(bounds.max.toArray()), size: Object.freeze(size.toArray()) }),
  });
}

export function finalizeSpec(THREE, spec) {
  spec.scene.updateMatrixWorld(true);
  const metrics = measureScene(THREE, spec.scene);
  const budget = spec.metadata.budgets;
  for (const [metric, limit] of [["renderedTriangles", budget.triangles], ["drawCalls", budget.drawCalls], ["materials", budget.materials]]) {
    if (metrics[metric] > limit) throw new Error(`${spec.assetId} ${metric} ${metrics[metric]} exceeds budget ${limit}`);
  }
  spec.scene.userData.assetId = spec.assetId;
  spec.scene.userData.coordinateSystem = spec.metadata.coordinateSystem;
  spec.scene.userData.generator = "guns-only/naval-specs@1";
  return Object.freeze({ ...spec, anchors: Object.freeze([...spec.anchors]), metadata: Object.freeze({ ...spec.metadata, metrics }) });
}
