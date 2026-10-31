import * as T from '../../vendor/three.module.js';

// A good alien, held in a glass specimen jar in the mine's back cell: a small round teal being with
// big dark eyes and a soft glow (it is what wakes the toys). Freed, the lid pops, it floats up,
// circles the robot and drifts out ahead of you.
export function createGoodAlien(scene, at) {
  const root = new T.Group();
  root.name = 'GoodAlien';
  root.position.set(...at);
  scene.add(root);
  const mats = {
    skin: new T.MeshStandardMaterial({
      color: '#6fe3d2',
      emissive: '#2fd1c0',
      emissiveIntensity: 0.7,
      roughness: 0.4
    }),
    eye: new T.MeshStandardMaterial({color: '#101820', roughness: 0.1, metalness: 0.4}),
    glass: new T.MeshStandardMaterial({
      color: '#cfefff',
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    }),
    lid: new T.MeshStandardMaterial({color: '#8a8f94', roughness: 0.35, metalness: 0.8})
  };
  const jar = new T.Group();
  root.add(jar);
  const glassWall = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.42, 24, 1, true), mats.glass);
  glassWall.position.y = 0.21;
  jar.add(glassWall);
  const base = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.03, 24), mats.lid);
  base.position.y = 0.015;
  jar.add(base);
  const lid = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.04, 24), mats.lid);
  lid.position.y = 0.44;
  jar.add(lid);
  const being = new T.Group();
  being.position.y = 0.18;
  root.add(being);
  being.add(new T.Mesh(new T.SphereGeometry(0.08, 20, 14), mats.skin));
  const head = new T.Mesh(new T.SphereGeometry(0.07, 20, 14), mats.skin);
  head.position.y = 0.1;
  being.add(head);
  for (const x of [-0.028, 0.028]) {
    const e = new T.Mesh(new T.SphereGeometry(0.022, 12, 8), mats.eye);
    e.scale.set(1, 1.4, 0.6);
    e.position.set(x, 0.11, 0.058);
    being.add(e);
  }
  const glow = new T.PointLight('#5ff0dc', 1.6, 3, 1.5);
  glow.position.y = 0.15;
  being.add(glow);
  let freed = 0,
    orbit = 0;
  return {
    get freed() {
      return freed > 0;
    },
    free() {
      if (!freed) freed = 1e-6;
    },
    /** follow: where to drift once free (the robot). */
    sync(time, dt, follow) {
      being.rotation.y = Math.sin(time * 0.8) * 0.4;
      head.position.y = 0.1 + Math.sin(time * 3) * 0.006;
      glow.intensity = 1.4 + 0.4 * Math.sin(time * 2);
      if (!freed) {
        being.position.y = 0.18 + Math.sin(time * 1.6) * 0.02;
        return;
      }
      freed += dt;
      lid.position.y = Math.min(1.2, 0.44 + freed * 1.5);
      lid.rotation.x = Math.min(1.5, freed * 3);
      lid.visible = freed < 2.5;
      orbit += dt * 1.6;
      const want = follow
        ? new T.Vector3(
            follow[0] + Math.cos(orbit) * 0.35 - root.position.x,
            follow[1] + 0.45 - root.position.y,
            follow[2] + Math.sin(orbit) * 0.35 - root.position.z
          )
        : new T.Vector3(0, 0.6, 0);
      if (freed < 1) want.set(0, 0.7, 0);
      being.position.lerp(want, Math.min(1, dt * 2.5));
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      Object.values(mats).forEach(m => m.dispose());
    }
  };
}
