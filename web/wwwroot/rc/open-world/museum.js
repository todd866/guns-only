import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';

// The museum silhouettes are original, cartoon reproductions. Dimensions are authored
// fiction for the RC-scale play space; no real unit markings or logos are used.
const SA2 = [-1391, 2044],
  SA6 = [-1325, 2045],
  RADAR = [-1352, 2038];

export function buildMuseum(scene, world) {
  const root = new T.Group();
  const mats = new Map();
  const material = (color, metalness = 0.1) => {
    const k = color + metalness;
    if (!mats.has(k)) mats.set(k, new T.MeshStandardMaterial({color, roughness: 0.7, metalness}));
    return mats.get(k);
  };
  const mesh = (geometry, mat, x, y, z) => {
    const m = new T.Mesh(geometry, mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  const box = (x, y, z, w, h, d, color, solid = false) => {
    const m = mesh(new T.BoxGeometry(w, h, d), material(color), x, y, z);
    if (solid) addBox(world, x, z, w, d, y - h / 2, y + h / 2, 'metal');
    return m;
  };
  const cyl = (x, y, z, r, h, color, segments = 10) =>
    mesh(new T.CylinderGeometry(r, r, h, segments), material(color, 0.25), x, y, z);
  // One draw mesh per missile, with separate cylindrical body, nose, and crossed fins.
  const missileGeometry = () => {
    const body = new T.CylinderGeometry(0.22, 0.25, 3.55, 10);
    body.rotateZ(Math.PI / 2);
    const nose = new T.ConeGeometry(0.34, 0.8, 10);
    nose.rotateZ(-Math.PI / 2);
    nose.translate(2.17, 0, 0);
    const finsA = new T.BoxGeometry(0.72, 0.08, 0.72);
    finsA.translate(-0.9, 0, 0.32);
    const finsB = new T.BoxGeometry(0.72, 0.72, 0.08);
    finsB.translate(-0.9, 0, 0);
    const g = mergeGeometries([body, nose, finsA, finsB], false);
    body.dispose();
    nose.dispose();
    finsA.dispose();
    finsB.dispose();
    return g;
  };
  const missile = (x, y, z, color) => mesh(missileGeometry(), material(color), x, y, z);
  const dark = '#334047',
    olive = '#6e7c70',
    sand = '#b8a982',
    steel = '#9aa7a5',
    black = '#20292c';
  const merged = (parts, name) => {
    const gs = parts.map(([g, x, y, z]) => {
      g.translate(x, y, z);
      return g;
    });
    const m = new T.Mesh(mergeGeometries(gs, false), material(steel));
    m.name = name;
    root.add(m);
    return m;
  };

  // Single missile on a low, boxy launcher: a recognizable SA-2-style museum prop.
  box(SA2[0], 0.55, SA2[1], 7.2, 1.1, 4.8, olive, true);
  for (const dx of [-2.6, 2.6]) {
    const w1 = cyl(SA2[0] + dx, 0.28, SA2[1] - 1.5, 0.5, 0.5, black);
    w1.rotation.z = Math.PI / 2;
    const w2 = cyl(SA2[0] + dx, 0.28, SA2[1] + 1.5, 0.5, 0.5, black);
    w2.rotation.z = Math.PI / 2;
  }
  const rail = cyl(SA2[0], 1.55, SA2[1], 0.16, 5.8, steel, 8);
  rail.rotation.z = Math.PI / 2;
  missile(SA2[0], 2.25, SA2[1], '#d4d0b2');

  // Three short missiles on a tracked, SA-6-style launcher.
  box(SA6[0], 0.6, SA6[1], 8.5, 1.2, 5.2, dark, true);
  for (const dx of [-3, 3]) {
    box(SA6[0] + dx, 0.3, SA6[1], 1.2, 0.45, 5.8, black, true);
    for (const dz of [-1.8, 0, 1.8]) {
      const w = cyl(SA6[0] + dx, 0.28, SA6[1] + dz, 0.38, 0.45, '#6e7671');
      w.rotation.z = Math.PI / 2;
    }
  }
  const turret = cyl(SA6[0], 1.45, SA6[1], 2.2, 0.7, olive, 12);
  for (const dz of [-1.25, 0, 1.25]) missile(SA6[0], 2.45, SA6[1] + dz, sand);

  // ZSU-23-4 display: one batched silhouette with a rounded turret and four parallel barrels.
  const zsuParts = [
    [new T.BoxGeometry(7.5, 1.2, 4.8), -1400, 0.6, 2002],
    [new T.CylinderGeometry(2, 2, 1, 16), -1400, 1.45, 2002],
    [new T.BoxGeometry(0.9, 0.7, 5.2), -1403.4, 0.4, 2002],
    [new T.BoxGeometry(0.9, 0.7, 5.2), -1396.6, 0.4, 2002],
    ...[-0.42, -0.14, 0.14, 0.42].map(dx => {
      const g = new T.CylinderGeometry(0.12, 0.12, 3.4, 8);
      g.rotateX(Math.PI / 2);
      return [g, -1400 + dx, 2.15, 2002 - 1.4];
    })
  ];
  merged(zsuParts, 'zsu-23-4-four-barrel-turret');
  addBox(world, -1400, 2002, 7.5, 4.8, 0, 1.2, 'metal');

  // Flat Face-style radar: base, pedestal and a single rotating dish under ten meshes.
  box(RADAR[0], 0.55, RADAR[1], 5.8, 1.1, 4.8, steel, true);
  cyl(RADAR[0], 2.1, RADAR[1], 0.8, 3.1, dark, 12);
  const radar = new T.Group();
  radar.position.set(RADAR[0], 3.5, RADAR[1]);
  const dish = new T.Mesh(
    new T.SphereGeometry(2.35, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
    material('#c9c4aa', 0.2)
  );
  dish.scale.set(1, 0.22, 1);
  dish.rotation.x = -Math.PI / 2;
  radar.add(dish);
  const feed = cyl(0, 0.32, 1.75, 0.12, 0.6, black, 8);
  feed.rotation.x = Math.PI / 2;
  radar.add(feed);
  root.add(radar);
  // Fan Song-style rectangular antenna with two side dishes, swivelling with the radar.
  const fan = new T.Group();
  fan.name = 'fan-song-radar';
  fan.position.set(-1335, 0, 2002);
  const antenna = new T.Mesh(new T.BoxGeometry(3.4, 2.2, 0.35), material('#8f9b96'));
  antenna.name = 'fan-song-rectangular-antenna';
  antenna.position.y = 2.3;
  fan.add(antenna);
  for (const side of [-1, 1]) {
    const d = new T.Mesh(
      new T.SphereGeometry(1.15, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
      material('#b8b39d')
    );
    d.name = 'fan-song-side-dish';
    d.scale.set(0.22, 1, 1);
    d.position.set(side * 2, 2.3, 0);
    fan.add(d);
  }
  root.add(fan);
  const fanBase = box(-1335, 0.55, 2002, 5.5, 1.1, 4.2, steel, true);
  fanBase.name = 'fan-song-base';
  scene.add(root);
  root.updateMatrixWorld(true);
  return {
    update(time, carPos) {
      const x = Array.isArray(carPos) ? carPos[0] : (carPos?.x ?? 0),
        z = Array.isArray(carPos) ? (carPos[2] ?? carPos[1]) : (carPos?.z ?? 0);
      const heading = Math.atan2(x - RADAR[0], z - RADAR[1]);
      radar.rotation.y = heading;
      fan.rotation.y = Math.atan2(x + 1335, z - 2002);
      radar.position.y = 3.5 + Math.sin(time * 0.7) * 0.025;
    },
    dispose() {
      scene.remove(root);
      root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
      });
      for (const m of mats.values()) m.dispose();
      mats.clear();
    }
  };
}
