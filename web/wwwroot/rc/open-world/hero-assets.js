import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {fetchAssetBuffer} from '../asset-buffer.mjs';
const templates = new Map();
let pending;
export function heroTemplate(type) {
  const root = templates.get(type);
  if (!root) return null;
  const copy = root.clone(true);
  copy.traverse(o => {
    if (o.isMesh) {
      o.geometry = o.geometry.clone();
      o.material = o.material.clone();
    }
  });
  return copy;
}
export function prepareHeroes() {
  return (pending ??= Promise.all(
    ['B-52', 'C-17', 'A-10', 'landmarks'].map(async type => {
      const buffer = await fetchAssetBuffer(new URL(`../assets/heroes/${type}.glb`, import.meta.url).href);
      const gltf = await new GLTFLoader().parseAsync(
        buffer,
        new URL('../assets/heroes/', import.meta.url).href
      );
      templates.set(type, gltf.scene);
    })
  )
    .then(() => true)
    .catch(() => {
      pending = null;
      return false;
    }));
}
