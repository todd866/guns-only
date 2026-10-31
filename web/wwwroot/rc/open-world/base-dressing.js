import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';

// Authored fiction for the RC world: decorative props are deliberately parked beside,
// rather than across, the documented race centerlines.
export function buildDressing(scene, world) {
  const root = new T.Group(),
    mats = new Map();
  const mat = c => {
    if (!mats.has(c)) mats.set(c, new T.MeshStandardMaterial({color: c, roughness: 0.8}));
    return mats.get(c);
  };
  const box = (x, y, z, w, h, d, c, solid = false) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z);
    root.add(m);
    if (solid) addBox(world, x, z, w, d, y - h / 2, y + h / 2, 'wood');
    return m;
  };
  const cyl = (x, y, z, r, h, c) => {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 10), mat(c));
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  // Water tower on an empty apron edge, clear of catalogued roads.
  cyl(1550, 5, -500, 1.1, 10, '#87979a');
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const leg = box(1550 + Math.cos(a) * 2.4, 5, -500 + Math.sin(a) * 2.4, 0.35, 10, 0.35, '#65777b');
  }
  cyl(1550, 11, -500, 3, 2, '#9eaaa8');
  cyl(1550, 12, -500, 2.7, 0.3, '#c8b890');
  // Desert plants and rocks around the boundary of the open apron.
  for (const [x, z, s] of [
    [1450, -450, 1],
    [1490, -460, 1.3],
    [1600, -460, 0.8],
    [1640, -500, 1.1]
  ]) {
    cyl(x, s * 1.5, z, 0.18 * s, 3 * s, '#6f825d');
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const branch = cyl(
        x + Math.cos(a) * s * 0.45,
        2 * s,
        z + Math.sin(a) * s * 0.45,
        0.09 * s,
        1.3 * s,
        '#6f825d'
      );
      branch.rotation.z = Math.cos(a) * 0.65;
      branch.rotation.x = Math.sin(a) * 0.65;
      for (let j = 0; j < 5; j++) {
        const leaf = new T.Mesh(new T.ConeGeometry(0.13 * s, 1.2 * s, 4), mat('#78945f'));
        leaf.position.set(x + Math.cos(a) * s, 2.7 * s, z + Math.sin(a) * s);
        leaf.rotation.z = Math.cos(j) * 0.8;
        leaf.rotation.x = Math.sin(j) * 0.8;
        root.add(leaf);
      }
    }
  }
  for (const [x, z, s] of [
    [1420, -520, 1.5],
    [1660, -470, 1],
    [1510, -550, 0.8]
  ]) {
    const r = new T.Mesh(new T.DodecahedronGeometry(s), mat('#8c806e'));
    r.position.set(x, s * 0.55, z);
    root.add(r);
  }
  for (const [x, z] of [
    [1440, -455],
    [1610, -475],
    [1630, -515]
  ])
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9,
        leaf = new T.Mesh(new T.ConeGeometry(0.22, 1.8, 4), mat('#77978a'));
      leaf.position.set(x + Math.cos(a) * 0.5, 0.5, z + Math.sin(a) * 0.5);
      leaf.rotation.z = -Math.cos(a) * 1.1;
      leaf.rotation.x = Math.sin(a) * 1.1;
      root.add(leaf);
    }
  // AGE logistics details at the ramp perimeter.
  for (const [x, z] of [
    [690, -120],
    [710, -120],
    [730, -120]
  ]) {
    box(x, 0.35, z, 1.5, 0.7, 2, '#b28d5c');
    box(x, 0.78, z, 1.25, 0.12, 1.75, '#d0aa70');
    for (const dx of [-0.7, 0.7])
      for (const dz of [-0.6, 0.6]) {
        const wheel = cyl(x + dx, 0.22, z + dz, 0.22, 0.15, '#283137');
        wheel.rotation.z = Math.PI / 2;
      }
    box(x, 0.3, z + 1.4, 0.12, 0.12, 0.8, '#747f7e');
  }
  for (const x of [750, 755, 760])
    for (let i = 0; i < 5; i++) box(x, 0.15, -120 + i * 0.25, 1.2, 0.12, 0.18, '#9b714b');
  for (const x of [-1240, -1218]) {
    box(x, 0.65, 900, 1.5, 1.3, 0.12, '#d0b57c');
    box(x, 0.95, 900, 1.1, 0.5, 0.08, '#476d73');
  }
  // Picnic tables and bowling return sit beside, not on, their activity lanes.
  box(-1080, 0.5, 1265, 3, 0.15, 1.2, '#ad8059');
  for (const dx of [-1, 1]) box(-1080 + dx, 0.25, 1265, 0.15, 0.5, 0.15, '#73513d');
  box(-1008, 0.8, 1245, 1.2, 1.6, 0.8, '#8b9a9a');
  const hood = new T.Mesh(new T.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8b9a9a'));
  hood.position.set(-1008, 1.55, 1245);
  root.add(hood);
  for (const dx of [-0.35, 0.35]) box(-1008 + dx, 0.75, 1246.1, 0.08, 0.08, 1.8, '#aeb7b4');
  for (let i = 0; i < 3; i++) {
    const ball = new T.Mesh(new T.SphereGeometry(0.25, 12, 8), mat(['#d6a94f', '#687bac', '#a66864'][i]));
    ball.position.set(-1008, 0.95, 1245.5 + i * 0.55);
    root.add(ball);
  }
  // Baseball dugouts behind the diamond; mailboxes face the nearby housing loop.
  for (const x of [-1360, -1294]) {
    box(x, 1.1, 1469, 12, 2.2, 0.15, '#a78b6f');
    for (const dx of [-5.8, 5.8]) box(x + dx, 1.1, 1470, 0.15, 2.2, 2, '#a78b6f');
    box(x, 2.3, 1470, 13, 0.2, 2.4, '#6b7774');
    box(x, 0.5, 1469.6, 10, 0.16, 0.6, '#c2a787');
  }
  for (const x of [-1310, -1298, -1286]) {
    box(x, 0.7, 1100, 1, 0.9, 0.35, '#607f86');
    box(x, 0.25, 1100, 1.2, 0.12, 0.5, '#8f795f');
  }
  // Skatepark edge modules: rail, funbox and stairs, with only rideable solids collidable.
  for (const x of [-1180, -1172]) {
    cyl(x, 0.4, 1165, 0.08, 0.8, '#bdc2b0');
  }
  box(-1176, 0.8, 1165, 8, 0.12, 0.12, '#bdc2b0');
  box(-1130, 0.45, 1168, 5, 0.9, 2.5, '#a28e78', true);
  for (let i = 0; i < 4; i++) box(-1095 + i * 1.1, 0.12 + i * 0.16, 1165, 1, 0.24, 2, '#b5a083', true);
  // Sloped ends make the funbox reachable from the ground using ordinary throttle.
  for (const side of [-1, 1]) {
    const x = -1130 + side * 2.5,
      x2 = x + side * 3,
      a = [x, 0.9, 1166.75],
      b = [x, 0.9, 1169.25],
      c = [x2, 0, 1169.25],
      d = [x2, 0, 1166.75],
      points = side > 0 ? [a, b, c, d] : [b, a, d, c];
    world.addQuad(...points, 'wood');
    const g = new T.BufferGeometry();
    g.setAttribute(
      'position',
      new T.Float32BufferAttribute(
        [...points[0], ...points[1], ...points[2], ...points[0], ...points[2], ...points[3]],
        3
      )
    );
    g.computeVertexNormals();
    root.add(new T.Mesh(g, mat('#a28e78')));
  }
  root.updateMatrixWorld(true);
  const gs = [];
  root.traverse(o => {
    if (o.isMesh) {
      let g = o.geometry.clone();
      if (g.index) {
        const old = g;
        g = g.toNonIndexed();
        old.dispose();
      }
      g.applyMatrix4(o.matrixWorld);
      const c = [];
      for (let i = 0; i < g.attributes.position.count; i++)
        c.push(o.material.color.r, o.material.color.g, o.material.color.b);
      g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
      g.deleteAttribute('uv');
      gs.push(g);
    }
  });
  const mergedGeometry = mergeGeometries(gs, false);
  const material = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.8}),
    mesh = new T.Mesh(mergedGeometry, material);
  gs.forEach(g => g.dispose());
  root.traverse(o => o.geometry?.dispose());
  for (const m of mats.values()) m.dispose();
  scene.add(mesh);
  return {
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    }
  };
}
