import { AssetPipelineError, assetAssert } from "./errors.js?runtime=2";

function traverse(root, visitor) {
  if (!root) return;
  if (typeof root.traverse === "function") {
    root.traverse(visitor);
    return;
  }
  visitor(root);
  if (Array.isArray(root.children)) {
    for (const child of root.children) traverse(child, visitor);
  }
}

function materialList(material) {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function collectTextureValue(value, textures, visited) {
  if (!value || typeof value !== "object") return;
  if (value.isTexture === true) {
    textures.add(value);
    return;
  }
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectTextureValue(item, textures, visited);
  }
}

function collectMaterialTextures(material, textures) {
  const visited = new Set();
  for (const value of Object.values(material)) collectTextureValue(value, textures, visited);
  if (material.uniforms && typeof material.uniforms === "object") {
    for (const uniform of Object.values(material.uniforms)) {
      collectTextureValue(uniform?.value, textures, visited);
    }
  }
}

export function disposeResourceSet(resources) {
  const unique = new Set(resources ?? []);
  for (const resource of unique) {
    if (resource && typeof resource.dispose === "function") resource.dispose();
  }
  return unique.size;
}

/** Disposes resources owned by an entire standalone scene tree. */
export function disposeSceneResources(root, options = {}) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  traverse(root, (object) => {
    if (object?.geometry && typeof object.geometry.dispose === "function") geometries.add(object.geometry);
    for (const material of materialList(object?.material)) {
      if (!material) continue;
      materials.add(material);
      if (options.textures !== false) collectMaterialTextures(material, textures);
    }
  });
  disposeResourceSet(geometries);
  disposeResourceSet(materials);
  if (options.textures !== false) disposeResourceSet(textures);
  return { geometries: geometries.size, materials: materials.size, textures: textures.size };
}

/** Disposes all unique resources owned by a cached glTF source. */
export function disposeGltfSource(gltf) {
  const roots = new Set();
  if (gltf?.scene) roots.add(gltf.scene);
  if (Array.isArray(gltf?.scenes)) for (const scene of gltf.scenes) roots.add(scene);

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  for (const root of roots) {
    traverse(root, (object) => {
      if (object?.geometry && typeof object.geometry.dispose === "function") geometries.add(object.geometry);
      for (const material of materialList(object?.material)) {
        if (!material) continue;
        materials.add(material);
        collectMaterialTextures(material, textures);
      }
    });
  }
  disposeResourceSet(geometries);
  disposeResourceSet(materials);
  disposeResourceSet(textures);
  return { geometries: geometries.size, materials: materials.size, textures: textures.size };
}

export function selectGltfScene(gltf, selector) {
  assetAssert(gltf && typeof gltf === "object", "INVALID_GLTF", "Model loader returned no glTF object.");
  const scenes = Array.isArray(gltf.scenes) ? gltf.scenes : [];
  if (selector === undefined || selector === null || selector === "") {
    const scene = gltf.scene ?? scenes[0];
    assetAssert(scene, "MISSING_GLTF_SCENE", "Loaded glTF contains no scene.");
    return scene;
  }
  if (Number.isInteger(selector)) {
    const scene = scenes[selector];
    assetAssert(scene, "MISSING_GLTF_SCENE", `Loaded glTF has no scene at index ${selector}.`);
    return scene;
  }
  const scene = scenes.find((candidate) => candidate?.name === selector);
  assetAssert(scene, "MISSING_GLTF_SCENE", `Loaded glTF has no scene named "${selector}".`);
  return scene;
}

/**
 * Clones a static glTF hierarchy. Geometry and textures remain shared with the
 * cached source; materials are cloned per instance so tint/uniform edits do not
 * leak between instances. Skinned meshes require an injected SkeletonUtils clone.
 */
export function cloneStaticGltfScene(sourceScene, options = {}) {
  assetAssert(sourceScene && typeof sourceScene.clone === "function", "UNCLONEABLE_GLTF_SCENE",
    "Static glTF scene must expose Object3D.clone(true).");
  traverse(sourceScene, (object) => {
    if (object?.isSkinnedMesh === true || object?.type === "SkinnedMesh") {
      throw new AssetPipelineError("SKINNED_GLTF_REQUIRES_CUSTOM_CLONER",
        "Static scene cloning cannot safely clone SkinnedMesh objects; inject a SkeletonUtils-based cloneScene function.");
    }
  });

  const scene = sourceScene.clone(true);
  const ownedResources = new Set();
  if (options.cloneMaterials !== false) {
    const materialClones = new Map();
    traverse(scene, (object) => {
      if (!object?.material) return;
      const cloneMaterial = (material) => {
        if (!material || typeof material.clone !== "function") return material;
        const existing = materialClones.get(material);
        if (existing) return existing;
        const clone = material.clone();
        if (clone !== material) {
          materialClones.set(material, clone);
          ownedResources.add(clone);
        }
        return clone;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material);
    });
  }
  return { scene, ownedResources };
}

/** Converts GLTFLoader.load/loadAsync or a function into the registry contract. */
export function createGltfLoaderAdapter(loader) {
  if (typeof loader === "function") return loader;
  assetAssert(loader && typeof loader === "object", "INVALID_MODEL_LOADER",
    "A model loader function or GLTFLoader-like object is required.");
  if (typeof loader.loadAsync === "function") {
    return (url) => loader.loadAsync(url);
  }
  if (typeof loader.load === "function") {
    return (url) => new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  }
  throw new AssetPipelineError("INVALID_MODEL_LOADER",
    "Model loader must provide loadAsync(url), load(url,...), or be a function.");
}
