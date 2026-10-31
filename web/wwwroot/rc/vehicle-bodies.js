import * as T from '../vendor/three.module.js';
export const VEHICLE_NAMES = Object.freeze({
  buggy: 'Buggy',
  monster: 'Monster',
  rally: 'Rally',
  pickup: 'Pickup',
  golf: 'Golf cart',
  pumpkin: 'Pumpkin 🎃'
});
// Original toy shells around the shared wheel pivots; dimensions and styling are fiction.
export function makeVehicleBody(kind = 'buggy', color = '#db6d2f') {
  if (!VEHICLE_NAMES[kind]) throw new RangeError(`unknown vehicle body: ${kind}`);
  const g = new T.Group();
  g.name = 'VehicleBody';
  g.userData.kind = kind;
  const paint = new T.MeshStandardMaterial({color, roughness: 0.32, metalness: 0.12}),
    glass = new T.MeshStandardMaterial({color: '#233b4a', roughness: 0.18, metalness: 0.25}),
    rubber = new T.MeshStandardMaterial({color: '#253038', roughness: 0.8}),
    chrome = new T.MeshStandardMaterial({color: '#c0c8c8', roughness: 0.25, metalness: 0.6}),
    lamp = new T.MeshStandardMaterial({color: '#fff4c5', emissive: '#fff0a8', emissiveIntensity: 0.4});
  const add = (geo, m, x = 0, y = 0, z = 0, name = '') => {
    const o = new T.Mesh(geo, m);
    o.position.set(x, y, z);
    o.name = name;
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const box = (w, h, d, x, y, z, m = paint, name = '') => add(new T.BoxGeometry(w, h, d), m, x, y, z, name);
  const profile = (points, width, m, name) => {
    const s = new T.Shape();
    points.forEach(([z, y], i) => (i ? s.lineTo(-z, y) : s.moveTo(-z, y)));
    s.closePath();
    const geo = new T.ExtrudeGeometry(s, {
      depth: width - 0.02,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.01,
      bevelThickness: 0.01
    });
    geo.rotateY(Math.PI / 2);
    geo.translate(-width / 2 + 0.01, 0, 0);
    return add(geo, m, 0, 0, 0, name);
  };
  if (kind === 'pumpkin') return pumpkinBody(g, add, lamp);
  const raised = kind === 'monster' ? 0.025 : 0,
    w = kind === 'monster' ? 0.49 : 0.43;
  profile(
    [
      [-0.34, 0.11 + raised],
      [-0.31, 0.2 + raised],
      [-0.12, 0.23 + raised],
      [0.3, 0.2 + raised],
      [0.34, 0.11 + raised]
    ],
    w,
    paint,
    'sculpted-shell'
  );
  if (kind === 'golf') {
    box(0.34, 0.045, 0.42, 0, 0.2, 0.02, rubber, 'floor');
    for (const x of [-0.16, 0.16])
      for (const z of [-0.16, 0.16]) box(0.018, 0.3, 0.018, x, 0.36, z, chrome, 'roof-post');
    profile(
      [
        [-0.24, 0.5],
        [0, 0.53],
        [0.24, 0.5],
        [0.24, 0.48],
        [-0.24, 0.48]
      ],
      0.48,
      paint,
      'canopy'
    );
    for (const x of [-0.085, 0.085]) {
      box(0.14, 0.055, 0.13, x, 0.27, 0.04, rubber, 'seat');
      box(0.14, 0.13, 0.035, x, 0.33, 0.11, rubber, 'seat-back');
    }
  } else {
    const truck = kind === 'monster' || kind === 'pickup',
      back = truck ? 0.06 : kind === 'rally' ? 0.23 : 0.12,
      top = kind === 'buggy' ? 0.32 : 0.37 + raised;
    profile(
      [
        [-0.22, 0.22 + raised],
        [-0.11, top],
        [back - 0.05, top],
        [back, 0.22 + raised]
      ],
      w * 0.82,
      glass,
      'windows'
    );
    profile(
      [
        [-0.12, top - 0.005],
        [-0.1, top + 0.02],
        [back - 0.04, top + 0.02],
        [back - 0.025, top - 0.005]
      ],
      w * 0.86,
      paint,
      'roof'
    );
    for (const x of [-w * 0.425, w * 0.425])
      box(0.018, top - 0.22 - raised, 0.025, x, (top + 0.22 + raised) / 2, back - 0.05, paint, 'rear-pillar');
    if (truck) {
      box(w * 0.8, 0.03, 0.22, 0, 0.21 + raised, 0.21, rubber, 'bed');
      for (const x of [-w * 0.43, w * 0.43])
        box(0.045, 0.09, 0.24, x, 0.25 + raised, 0.21, paint, 'bed-rail');
      box(w, 0.09, 0.035, 0, 0.25 + raised, 0.33, paint, 'tailgate');
    } else {
      box(w + 0.08, 0.025, 0.085, 0, 0.31, 0.3, rubber, 'spoiler');
      for (const x of [-0.14, 0.14]) box(0.02, 0.1, 0.02, x, 0.26, 0.3, chrome, 'spoiler-post');
    }
  }
  for (const side of [-1, 1]) {
    box(0.065, 0.045, 0.025, side * w * 0.32, 0.17 + raised, -0.333, lamp, 'headlight');
    box(0.05, 0.025, 0.025, side * w * 0.32, 0.17 + raised, 0.335, rubber, 'tail-light');
  }
  box(w * 0.45, 0.045, 0.025, 0, 0.13 + raised, -0.34, rubber, 'grille');
  for (const o of g.children) {
    o.scale.y = 0.65;
    o.position.y = o.position.y * 0.65 - 0.1;
  }
  if (kind === 'monster')
    for (const x of [-0.275, 0.275])
      for (const z of [-0.25, 0.25]) {
        const a = add(new T.TorusGeometry(0.135, 0.005, 6, 18, Math.PI), paint, x, -0.085, z, 'wheel-arch');
        a.rotation.y = Math.PI / 2;
      }
  return g;
}

// The pumpkin car (20 pumpkins splatted): a ribbed jack-o'-lantern on the wheels, its carved face
// glowing from inside (the bloom picks it up), a crooked stem and a leaf on top.
function pumpkinBody(g, add, lamp) {
  const skin = new T.MeshStandardMaterial({color: '#f07a14', roughness: 0.55}),
    stemMat = new T.MeshStandardMaterial({color: '#5c7a2a', roughness: 0.8}),
    glow = new T.MeshStandardMaterial({color: '#ffd35a', emissive: '#ffb42a', emissiveIntensity: 2.2});
  // Fits the same footprint as the other shells: inside the track, under 0.44 m long and 0.26 m tall.
  const R = 0.175,
    cy = 0.118,
    geo = new T.SphereGeometry(R, 40, 20),
    p = geo.attributes.position,
    v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.x, v.z),
      k = 1 - 0.08 * Math.pow(Math.abs(Math.cos(a * 4)), 3);
    p.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  const body = add(geo, skin, 0, cy, 0, 'sculpted-shell');
  body.scale.set(1, 0.66, 1.2);
  const stem = add(
    new T.CylinderGeometry(0.014, 0.022, 0.04, 8),
    stemMat,
    0.006,
    cy + R * 0.66 + 0.008,
    0.02,
    'stem'
  );
  stem.rotation.z = 0.35;
  const leaf = add(new T.SphereGeometry(0.032, 10, 6), stemMat, -0.032, cy + R * 0.66 - 0.004, 0.04, 'leaf');
  leaf.scale.set(1, 0.2, 0.6);
  // The face, carved on the nose (-z), just proud of the skin, glowing from inside.
  const front = -R * 1.2 - 0.002,
    flat = (pts, y, name) => {
      const s = new T.Shape(pts.map(([x, z]) => new T.Vector2(x * 0.7, z * 0.7)));
      const m = add(new T.ShapeGeometry(s), glow, 0, 0, 0, name);
      m.position.set(0, y, front);
      m.rotation.y = Math.PI;
      return m;
    };
  for (const sx of [-1, 1])
    flat(
      [
        [sx * 0.05, 0],
        [sx * 0.13, 0],
        [sx * 0.09, 0.06]
      ],
      cy + 0.02,
      'eye'
    );
  flat(
    [
      [-0.02, 0],
      [0.02, 0],
      [0, 0.035]
    ],
    cy - 0.005,
    'nose'
  );
  flat(
    [
      [-0.14, 0.03],
      [-0.09, 0],
      [-0.05, 0.02],
      [0, -0.01],
      [0.05, 0.02],
      [0.09, 0],
      [0.14, 0.03],
      [0.1, -0.04],
      [0, -0.06],
      [-0.1, -0.04]
    ],
    cy - 0.04,
    'mouth'
  );
  for (const sx of [-1, 1])
    add(new T.SphereGeometry(0.014, 8, 6), lamp, sx * 0.065, cy + 0.025, front + 0.004, 'headlight');
  return g;
}
