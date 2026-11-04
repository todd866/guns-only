// Base service badges. They are deliberately ordinary military keepsakes; the late lab
// reveal supplies the first genuinely alien silhouette. Instancing keeps this collection
// loop to two draw calls, base-wide.
import * as T from '../../vendor/three.module.js';
import {SPECIMENS} from './catalog.mjs';
export function createSpecimens(scene, progress) {
  const badgeGeo = new T.CylinderGeometry(0.34, 0.34, 0.1, 12),
    badgeMat = new T.MeshStandardMaterial({
      color: '#d5a93f',
      emissive: '#6b4a12',
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.55
    }),
    baseGeo = new T.CylinderGeometry(0.5, 0.58, 0.08, 16),
    baseMat = new T.MeshStandardMaterial({color: '#586d70', roughness: 0.75});
  const badges = new T.InstancedMesh(badgeGeo, badgeMat, SPECIMENS.length),
    bases = new T.InstancedMesh(baseGeo, baseMat, SPECIMENS.length);
  const m = new T.Object3D(),
    colour = new T.Color();
  for (const mesh of [badges, bases]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const place = (mesh, i, x, y, z, sx, sy, sz) => {
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.updateMatrix();
    mesh.setMatrixAt(i, m.matrix);
  };
  function update(t) {
    SPECIMENS.forEach((p, i) => {
      const collected = progress.specimens.includes(p.id),
        scale = collected ? 0 : 1,
        bob = Math.sin(t * 2 + i) * 0.04;
      place(bases, i, p.x, 0.04, p.z, 1, 1, 1);
      bases.setColorAt(i, colour.set(collected ? '#727c7c' : '#586d70'));
      place(badges, i, p.x, 0.34 + bob, p.z, 0.95 * scale, 0.95 * scale, 0.95 * scale);
      badges.setColorAt(i, colour.set(collected ? '#727c7c' : '#d5a93f'));
    });
    for (const mesh of [badges, bases]) mesh.instanceMatrix.needsUpdate = true;
    bases.instanceColor.needsUpdate = true;
    badges.instanceColor.needsUpdate = true;
  }
  update(0);
  return {
    update,
    dispose() {
      for (const mesh of [badges, bases]) mesh.removeFromParent();
      badgeGeo.dispose();
      baseGeo.dispose();
      badgeMat.dispose();
      baseMat.dispose();
    }
  };
}
