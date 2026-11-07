import * as T from '../../vendor/three.module.js';
import {terrainMesh} from './terrain.mjs';
export function createTerrain(scene, data, bounds) {
  const {positions, indices} = terrainMesh(data, bounds),
    geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const colors = [],
    base = new T.Color('#b69b78'),
    haze = new T.Color('#8faec4'),
    c = new T.Color(),
    normals = geometry.attributes.normal;
  for (let i = 0; i < positions.length / 3; i++) {
    const distance = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
    c.copy(base)
      .multiplyScalar(0.75 + Math.max(0, normals.getY(i)) * 0.25)
      .lerp(haze, Math.min(0.8, 0.2 + distance / 28000));
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  // The horizon is a ring around the whole map, drawn without fog so the ranges stay visible.
  // One mesh has a bounds that contains the camera, so every range is submitted even when it
  // sits behind you. A kilometre grid made ~1300 draws for the same ring. Eight-kilometre
  // rings split into eight compass slices stay outside the hub camera, so the frustum keeps
  // the ranges in front.
  const material = new T.MeshLambertMaterial({vertexColors: true, fog: false});
  const meshes = [];
  const RING = 8000;
  const SLICES = 8;
  const blocks = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t],
      b = indices[t + 1],
      c = indices[t + 2],
      cx = (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3,
      cz = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3,
      slice = Math.min(SLICES - 1, Math.floor((Math.atan2(cz, cx) + Math.PI) / ((Math.PI * 2) / SLICES))),
      key = `${Math.floor(Math.hypot(cx, cz) / RING)}:${slice}`;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(a, b, c);
  }
  for (const src of blocks.values()) {
    const map = new Map();
    const pos = [],
      col = [],
      nrm = [],
      idx = [];
    for (let t = 0; t < src.length; t++) {
      const vi = src[t];
      let u = map.get(vi);
      if (u == null) {
        u = map.size;
        map.set(vi, u);
        pos.push(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
        col.push(colors[vi * 3], colors[vi * 3 + 1], colors[vi * 3 + 2]);
        nrm.push(normals.getX(vi), normals.getY(vi), normals.getZ(vi));
      }
      idx.push(u);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new T.Mesh(g, material);
    mesh.name = 'USGS_DEM_Horizon';
    scene.add(mesh);
    meshes.push(mesh);
  }
  geometry.dispose();
  return {
    update(day, alien = false) {
      for (const mesh of meshes) mesh.visible = !alien;
      material.color.setScalar(0.15 + 0.85 * day);
    },
    dispose() {
      for (const mesh of meshes) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      material.dispose();
    }
  };
}
