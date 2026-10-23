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
  // turning the arrival lane into an arch or a collision gate.  Its stepped fascia,
  // warm underside and repeated soffit ribs borrow the layered entrance proportions
  // in the Nellis facility-standard photos while staying chunky at toy-car scale.
  for (const x of [-618.5, -595.5]) {
    box(x, 2.15, -35.5, .34, 4.3, .34, '#536468');
    box(x, 3.45, -35.5, .42, .12, .46, '#d8b45f');
    box(x, .82, -35.5, .62, .16, .62, '#746a5d');
  }
  box(-607, 4.28, -35.5, 24.2, .34, 4.8, '#59696a');
  box(-607, 4.05, -35.5, 23.1, .12, 4.2, '#c9b58f');
  box(-607, 4.54, -35.5, 23.5, .18, .25, '#536468');
  box(-607, 4.68, -35.5, 22.4, .10, 4.05, '#d0b77f');
  for (const z of [-37.25, -35.5, -33.75]) box(-607, 4.48, z, 22.8, .12, .18, '#78817a');
  for (let x = -617.5; x <= -596.5; x += 3.5) box(x, 4.61, -35.5, .12, .06, 3.55, '#c9b58f');

  // A modest stone monument sits on the left shoulder, echoing Nellis's low roadside
  // welcome signs and leaving the central driving corridor visually and physically open.
  box(-635.5, 1.18, -28.8, 6.2, 2.35, 1.1, '#897761');
  box(-635.5, 1.12, -28.18, 5.25, 1.65, .08, '#c5a76c');
  box(-635.5, 2.52, -28.8, 6.65, .20, 1.22, '#d0b77f');
  box(-635.5, .22, -28.8, 7.2, .22, 1.45, '#817464');
  // A small geometric roundel gives the sign a Nellis-style focal mark without text.
  add(new T.CylinderGeometry(.48, .48, .06, 16), '#3e5658', -635.5, 1.62, -28.10, Math.PI / 2, 0, 0);
  add(new T.CylinderGeometry(.24, .24, .075, 12), '#dfbd70', -635.5, 1.62, -28.05, Math.PI / 2, 0, 0);
  for (const x of [-638.4, -632.6]) box(x, .74, -29.38, .18, .68, .14, '#dfbd70');

  // Two planted islands sit outside the driving envelope, with deliberately readable curbs.
  for (const [x, z, w, d] of [[-643, -43, 13, 19], [-551, -42, 12, 17], [-644, -76, 15, 10]]) {
    box(x, .16, z, w, .32, d, '#8f806e');
    box(x, .35, z, w - 1.0, .12, d - 1.0, '#c29a62');
    for (const dx of [-w * .32, 0, w * .32]) for (const dz of [-d * .28, d * .28]) rock(x + dx, .55, z + dz, .32);
  }

  // Match the existing 5 × 4 m, 3.4 m-high booth rather than adding a roof
  // halfway through its walls. Deep frames read clearly from a toy-car viewpoint.
  box(-582, 3.38, -69, 5.3, .18, 4.3, '#c5a76c');
  box(-582, 3.68, -69, 5.6, .10, 4.6, '#78817a');
  for(const x of [-583.55,-582,-580.45])box(x,2,-66.90,.10,1.48,.10,'#d3ae62');
  for(const y of [1.30,2.70])box(-582,y,-66.90,3.20,.10,.16,'#d3ae62');
  box(-582,1.22,-66.83,3.35,.10,.36,'#897761');
  box(-582,1.1,-71.04,1.1,2.2,.06,'#536468');
  box(-582,1.65,-71.08,.82,.8,.04,'#2e4a53');
  for(const x of [-582.62,-581.38])box(x,1.15,-71.10,.10,2.30,.12,'#d3ae62');
  box(-582,2.33,-71.10,1.34,.12,.12,'#d3ae62');
  box(-581.62,1.05,-71.14,.08,.18,.08,'#dfbd70');
  for (const x of [-585.8, -578.2]) { cyl(x, .65, -72.2, .16, 1.3, '#d3ae62', 8); box(x, 1.3, -72.2, .28, .08, .28, '#efe0ad'); }

  const palm = (x, z, scale = 1) => {
    cyl(x, 2.3 * scale, z, .28 * scale, 4.6 * scale, '#805c3d', 9).rotation.z = -.08;
    cyl(x + .1 * scale, 4.7 * scale, z, .38 * scale, .35 * scale, '#5e744c', 9);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI * 2 / 8 + .12;
      const dir = new T.Vector3(Math.cos(a) * .92, .30 + .10 * Math.sin(a * 2), Math.sin(a) * .92).normalize();
      const mid = new T.Vector3(x, 4.88 * scale, z).addScaledVector(dir, .66 * scale);
      const leaf = add(new T.SphereGeometry(.5, 8, 4), '#4f724d', mid.x, mid.y, mid.z);
      leaf.scale.set(.20 * scale, .14 * scale, 1.08 * scale);
      leaf.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir);
      // A second, shorter segment bends each frond down toward its tip instead of
      // producing the old starburst of triangular spikes.
      const tipDir = dir.clone(); tipDir.y -= .18; tipDir.normalize();
      const tip = add(new T.SphereGeometry(.5, 8, 4), '#4f724d', mid.x + dir.x * .58 * scale, mid.y + dir.y * .58 * scale, mid.z + dir.z * .58 * scale);
      tip.scale.set(.15 * scale, .10 * scale, .72 * scale);
      tip.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tipDir);
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

