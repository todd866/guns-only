import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/three/addons/utils/BufferGeometryUtils.js';

// Merge an RC car's fixed parts into one mesh per material (owner, 2026-10-30: the app was
// unplayable; WebKit pays ~2x Chrome per draw call, and seven ~34-part cars were 400+ calls with
// their shadows). Parts are merged inside the container that poses them (the car root, Body,
// VehicleBody, JetShell, each steering pivot and each wheel), never across one. Parts the
// game toggles or repaints by name (the alloy/copper kits, the nose art) stay as they are.
// A container's parts move together, so they merge in its frame: the posed shells, and each
// steering pivot and wheel (a wheel's tread, hub and bolts spin as one).
const isContainer = node => /^(Body|VehicleBody|JetShell)$|^(Steer_|Wheel_)/.test(node.name);
const KEEP = /^(Mesh_Body_alloy|Mesh_Body_copper|NoseArt|AlienGunner)$/;

export function batchCarParts(root) {
  unbatchCarParts(root);
  root.updateMatrixWorld(true);
  const groups = new Map();   // container -> material -> meshes
  const visit = (node, container) => {
    if (node !== root && KEEP.test(node.name)) return;
    const here = node !== root && isContainer(node) ? node : container;
    if (node.isMesh && !node.isSkinnedMesh && node.visible && !Array.isArray(node.material) && node.geometry?.attributes?.position) {
      if (!groups.has(here)) groups.set(here, new Map());
      // A wheel's tread, hub and bolts are plain colours: two vertex-coloured materials (metal hub
      // parts, matte rubber and graphite) draw the whole wheel in two calls instead of four.
      const plain = /^Wheel_/.test(here.name) && !node.material.map && node.material.isMeshStandardMaterial;
      const key = plain ? wheelMaterial(root, node.material.metalness > .5) : node.material;
      const byMat = groups.get(here); if (!byMat.has(key)) byMat.set(key, []); byMat.get(key).push(node);
    }
    for (const child of [...node.children]) visit(child, here);
  };
  visit(root, root);
  let before = 0, after = 0;
  for (const [container, byMat] of groups) {
    const toLocal = new T.Matrix4().copy(container.matrixWorld).invert();
    for (const [material, meshes] of byMat) {
      before += meshes.length;
      if (meshes.length < 2 && !material.userData.wheelBatch) { after += meshes.length; continue; }
      const tint = material.userData.wheelBatch;
      const parts = meshes.map(m => {
        let g = m.geometry.clone(); if (g.index) { const flat = g.toNonIndexed(); g.dispose(); g = flat; }
        if (tint) { const c = m.material.color, n = g.attributes.position.count, rgb = new Float32Array(n * 3); for (let i = 0; i < n; i++) rgb.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new T.BufferAttribute(rgb, 3)); }
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        g.morphAttributes = {}; g.applyMatrix4(new T.Matrix4().multiplyMatrices(toLocal, m.matrixWorld)); return g;
      });
      // Every part must offer the same attributes to merge; fill gaps rather than drop the group.
      const names = new Set(parts.flatMap(g => Object.keys(g.attributes)));
      for (const g of parts) for (const name of names) if (!g.attributes[name]) {
        const n = g.attributes.position.count, size = name === 'uv' ? 2 : 3;
        g.setAttribute(name, new T.BufferAttribute(new Float32Array(n * size).fill(name === 'color' ? 1 : 0), size));
      }
      const merged = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
      if (!merged) { after += meshes.length; continue; }
      merged.computeBoundingSphere();
      const mesh = new T.Mesh(merged, material); mesh.name = 'BatchedParts';
      mesh.castShadow = meshes.some(m => m.castShadow); mesh.receiveShadow = meshes.some(m => m.receiveShadow);
      container.add(mesh);
      for (const m of meshes) { m.visible = false; m.userData.batchedAway = true; }   // hidden, not removed: lookups by name keep working
      after += 1;
    }
  }
  return { before, after };
}

// Undo a batch: drop the merged meshes and show the parts again, before anything re-dresses the car.
export function unbatchCarParts(root) {
  const merged = [];
  root.traverse(o => { if (o.name === 'BatchedParts') merged.push(o); else if (o.userData.batchedAway) { o.visible = true; delete o.userData.batchedAway; } });
  for (const m of merged) { m.removeFromParent(); m.geometry.dispose(); }
}

const wheelMaterials = new WeakMap();
function wheelMaterial(root, metal) {
  if (!wheelMaterials.has(root)) wheelMaterials.set(root, [false, true].map(m => Object.assign(new T.MeshStandardMaterial(
    { vertexColors: true, roughness: m ? .3 : .85, metalness: m ? .72 : .1 }), { userData: { wheelBatch: true } })));
  return wheelMaterials.get(root)[metal ? 1 : 0];
}
