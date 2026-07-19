function transformedGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
}

function compatibleAttributeNames(geometries) {
  const first = Object.keys(geometries[0].attributes);
  return first.filter((name) => geometries.every((geometry) => {
    const candidate = geometry.getAttribute(name);
    const reference = geometries[0].getAttribute(name);
    return candidate && candidate.itemSize === reference.itemSize && candidate.normalized === reference.normalized
      && candidate.array.constructor === reference.array.constructor;
  }));
}

function mergeGeometryGroup(THREE, geometries, name) {
  const merged = new THREE.BufferGeometry();
  merged.name = name;
  const attributeNames = compatibleAttributeNames(geometries);
  for (const attributeName of attributeNames) {
    const reference = geometries[0].getAttribute(attributeName);
    const length = geometries.reduce((sum, geometry) => sum + geometry.getAttribute(attributeName).array.length, 0);
    const values = new reference.array.constructor(length);
    let offset = 0;
    for (const geometry of geometries) {
      const source = geometry.getAttribute(attributeName).array;
      values.set(source, offset);
      offset += source.length;
    }
    merged.setAttribute(attributeName, new THREE.BufferAttribute(values, reference.itemSize, reference.normalized));
  }

  const indices = [];
  let vertexOffset = 0;
  for (const geometry of geometries) {
    const positions = geometry.getAttribute("position");
    if (geometry.index) {
      for (const index of geometry.index.array) indices.push(index + vertexOffset);
    } else {
      for (let index = 0; index < positions.count; index++) indices.push(index + vertexOffset);
    }
    vertexOffset += positions.count;
  }
  merged.setIndex(vertexOffset > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : indices);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Flattens static meshes into one primitive per material while preserving named
 * interaction/animation components and all instanced meshes.
 */
export function consolidateStaticMeshes(THREE, scene, options = {}) {
  const preserveNames = new Set(options.preserveNames ?? []);
  const preservePrefixes = options.preservePrefixes ?? [];
  const candidates = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || Array.isArray(object.material)) return;
    if (object.userData?.noMerge === true || preserveNames.has(object.name)
      || preservePrefixes.some((prefix) => object.name.startsWith(prefix))) return;
    candidates.push(object);
  });

  const groups = new Map();
  for (const mesh of candidates) {
    if (!groups.has(mesh.material)) groups.set(mesh.material, []);
    groups.get(mesh.material).push(mesh);
  }
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(transformedGeometry);
    const merged = new THREE.Mesh(mergeGeometryGroup(THREE, geometries, `MERGED_${material.name}_GEOMETRY`), material);
    merged.name = `MERGED_${material.name}`;
    merged.castShadow = meshes.some((mesh) => mesh.castShadow);
    merged.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
    merged.userData = { consolidatedMeshes: meshes.map((mesh) => mesh.name).sort() };
    for (const mesh of meshes) mesh.removeFromParent();
    scene.add(merged);
    for (const geometry of geometries) geometry.dispose();
  }
  scene.updateMatrixWorld(true);
  return scene;
}

export function preparePbrGeometry(scene) {
  scene.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const geometry = object.geometry;
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (geometry.index && geometry.getAttribute("uv") && geometry.getAttribute("normal") && !geometry.getAttribute("tangent")) {
      geometry.computeTangents();
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });
  return scene;
}
