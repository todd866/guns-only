import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Decorative arrival dressing only.  It deliberately accepts no world/collision
// object: every prop is visual and the approach lane remains game geometry's job.
export function buildArrivalArt(scene) {
  const source = new T.Group();
  const materials = new Map();
  const material = (color) => {
    if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({color, roughness: .82, metalness: 0}));
    return materials.get(color);
  };
  const add = (geometry, color, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new T.Mesh(geometry, material(color));
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); source.add(mesh); return mesh;
  };
  const box = (x, y, z, w, h, d, color) => add(new T.BoxGeometry(w, h, d), color, x, y, z);
  const cyl = (x, y, z, r, h, color, sides = 10) => add(new T.CylinderGeometry(r, r * 1.08, h, sides), color, x, y, z);
  const rock = (x, y, z, s, color = '#897761') => {
    const m = add(new T.DodecahedronGeometry(s, 0), color, x, y, z);
    m.scale.set(1.25, .62, .86); m.rotation.y = (x * 3 + z) % 2; return m;
  };

  // Paved shoulders and low curbs frame the approach from spawn (-607,-23) to the gate.
  for (const side of [-1, 1]) {
    const x = -607 + side * 15;
    box(x, .045, -37, 4.1, .09, 31, '#b9b09e');
    box(x, .11, -52.5, 4.45, .22, 31.5, '#817a70');
    for (let z = -25; z >= -65; z -= 5) box(x, .105, z, 3.85, .018, .08, '#d2c6ae');
  }

  // A low, open security canopy gives the threshold a real-base silhouette without
  // turning the arrival lane into an arch or a collision gate.  The broad roof and
  // two slim posts read at driving height, while the warm underside keeps it legible
  // against the desert sky.  Everything here is decorative and merged below.
  for (const x of [-618.5, -595.5]) {
    box(x, 2.15, -35.5, .34, 4.3, .34, '#536468');
    box(x, 3.45, -35.5, .42, .12, .46, '#d8b45f');
    box(x, .82, -35.5, .62, .16, .62, '#746a5d');
  }
  box(-607, 4.28, -35.5, 24.2, .34, 4.8, '#59696a');
  box(-607, 4.05, -35.5, 23.1, .12, 4.2, '#c9b58f');
  for (const z of [-37.25, -35.5, -33.75]) box(-607, 4.48, z, 22.8, .12, .18, '#78817a');

  // A modest stone monument sits on the left shoulder, echoing Nellis's low roadside
  // welcome signs and leaving the central driving corridor visually and physically open.
  box(-635.5, 1.05, -28.8, 5.8, 2.1, .9, '#b8a486');
  box(-635.5, 2.22, -28.8, 6.25, .18, 1.04, '#d0b77f');
  box(-635.5, 1.13, -28.31, 4.35, .88, .045, '#3e5658');
  box(-635.5, .22, -28.8, 6.8, .2, 1.3, '#817464');
  for (const x of [-638.25, -632.75]) box(x, .68, -29.34, .16, .55, .12, '#dfbd70');

  // Two planted islands sit outside the driving envelope, with deliberately readable curbs.
  for (const [x, z, w, d] of [[-643, -43, 13, 19], [-551, -42, 12, 17], [-644, -76, 15, 10]]) {
    box(x, .16, z, w, .32, d, '#8f806e');
    box(x, .35, z, w - 1.0, .12, d - 1.0, '#c29a62');
    for (const dx of [-w * .32, 0, w * .32]) for (const dz of [-d * .28, d * .28]) rock(x + dx, .55, z + dz, .32);
  }

  // Guardhouse trim/detail complements the authored booth at (-582,-69), without replacing it.
  box(-582, 2.25, -69, 6.2, .22, 4.8, '#c5a76c');
  box(-582, 2.42, -69, 5.5, .12, 4.1, '#6e7b78');
  box(-584.25, 1.45, -66.92, 1.5, 1.0, .05, '#2e4a53');
  box(-579.15, 1.45, -66.92, 1.5, 1.0, .05, '#2e4a53');
  box(-582, .9, -71.04, 1.0, 1.8, .05, '#6c6258');
  for (const x of [-585.8, -578.2]) { cyl(x, .65, -72.2, .16, 1.3, '#d3ae62', 8); box(x, 1.3, -72.2, .28, .08, .28, '#efe0ad'); }
  for (const x of [-587.2, -576.8]) box(x, .55, -66.5, .16, 1.1, .16, '#526367');

  const palm = (x, z, scale = 1) => {
    cyl(x, 2.3 * scale, z, .28 * scale, 4.6 * scale, '#805c3d', 9).rotation.z = -.08;
    cyl(x + .1 * scale, 4.7 * scale, z, .38 * scale, .35 * scale, '#5e744c', 9);
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7 + .12;
      const leaf = add(new T.ConeGeometry(.14 * scale, 2.0 * scale, 5), '#4f724d', x + Math.cos(a) * .78 * scale, 5.0 * scale, z + Math.sin(a) * .78 * scale, 0, -a, Math.PI / 2);
      leaf.scale.y = .72; // individual blades give the crown a clear silhouette
    }
  };
  palm(-646, -42, 1.05); palm(-552, -42, .88); palm(-647, -76, .8);

  const agave = (x, z, s = 1) => {
    cyl(x, .62 * s, z, .35 * s, .22 * s, '#557650', 9);
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      const leaf = add(new T.ConeGeometry(.17 * s, 1.35 * s, 4), '#66885b', x + Math.cos(a) * .34 * s, .9 * s, z + Math.sin(a) * .34 * s, Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05);
      leaf.scale.y = .8;
    }
  };
  agave(-639, -48, 1.15); agave(-557, -37, .95); agave(-639, -78, .82);
  for (const [x, z, s] of [[-648, -51, .42], [-635, -39, .3], [-557, -47, .34], [-650, -72, .28], [-574, -44, .24]]) rock(x, s * .55, z, s);

  // Small visual lane markers and tile seams make the threshold legible without adding collision.
  for (const x of [-627, -619, -595, -587]) box(x, .24, -52.5, .18, .08, 1.8, '#d9bd7f');
  for (let z = -28; z >= -48; z -= 4) box(-607, .055, z, 7.8, .012, .06, '#d7c8ab');

  source.updateMatrixWorld(true);
  const groups = new Map();
  source.traverse((object) => {
    if (!object.isMesh) return;
    let geometry = object.geometry.clone();
    if (geometry.index) { const indexed = geometry; geometry = geometry.toNonIndexed(); indexed.dispose(); }
    geometry.applyMatrix4(object.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    const key = object.material.color.getHexString();
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(geometry);
  });
  const root = new T.Group(); root.name = 'ArrivalStreetArt';
  const meshes = [];
  for (const [key, geometries] of groups) {
    const geometry = mergeGeometries(geometries, false); geometries.forEach((g) => g.dispose());
    const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({color: `#${key}`, roughness: .82}));
    mesh.name = `arrival-${key}`; mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh); meshes.push(mesh);
  }
  source.traverse((object) => object.geometry?.dispose());
  materials.forEach((m) => m.dispose());
  scene.add(root);
  return {
    root,
    dispose() { root.removeFromParent(); for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
}

