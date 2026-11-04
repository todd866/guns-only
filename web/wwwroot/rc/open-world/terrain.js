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
  const material = new T.MeshLambertMaterial({vertexColors: true, fog: false}),
    mesh = new T.Mesh(geometry, material);
  mesh.name = 'USGS_DEM_Horizon';
  scene.add(mesh);
  return {
    update(day, alien = false) {
      mesh.visible = !alien;
      material.color.setScalar(0.15 + 0.85 * day);
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    }
  };
}
