import * as T from '../../vendor/three.module.js';
import {mergeGeometries, toCreasedNormals} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {
  PLAYGROUND,
  buildPlayground,
  playgroundWorld,
  DECK,
  FLOOR,
  ROOF,
  FENCE,
  FORT,
  LOOKOUT,
  RAMP,
  BRIDGE,
  SPIRAL,
  SANDPIT,
  SEESAW,
  MERRY,
  bridgeY
} from './playground.mjs';

// Bright council-playground primaries over warm timber and terracotta softfall. One vertex-coloured
// mesh plus a sign atlas keeps the whole playground to a single draw.
const COLOURS = {
  softfall: '#c8644a',
  'softfall-b': '#c25f47',
  sand: '#e9d39b',
  edging: '#a7a397',
  timber: '#9a6b3f',
  deck: '#b98652',
  'deck-side': '#8f633a',
  post: '#7a5432',
  'rail-wood': '#c89a5e',
  ramp: '#a87b4b',
  plank: '#b08250',
  skirt: '#6f4d2f',
  slide: '#f3c623',
  'slide-b': '#2f8fd8',
  'slide-c': '#e8443a',
  'slide-wall': '#f6f1e4',
  seesaw: '#37b26c',
  merry: '#e8443a',
  pole: '#c9ced3',
  turf: '#6f9e46',
  frame: '#2f8fd8',
  spring: '#5b6470',
  fence: '#f6f1e4',
  bench: '#8b6a4a',
  roof: '#e8443a',
  'roof-b': '#f3c623',
  rope: '#d9c69a',
  chain: '#9aa3ab',
  seat: '#232629',
  sail: '#f8f3e6',
  'sail-b': '#2fb3b8',
  alien: '#7fe07a',
  rocket: '#f6f1e4',
  'rocket-fin': '#e8443a',
  dark: '#15181c',
  sign: '#ffffff'
};
const PLAIN_UV = [0.5, 0.8];

function makeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#2f8fd8';
  g.fillRect(0, 64, 512, 64);
  g.fillStyle = '#f3c623';
  g.fillRect(0, 64, 512, 6);
  g.fillStyle = '#ffffff';
  g.font = '900 34px system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('ADVENTURE PLAYGROUND', 256, 99);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createPlayground(scene, world) {
  const root = new T.Group();
  root.name = 'AdventurePlayground';
  root.position.set(...PLAYGROUND.center);
  scene.add(root);
  const pieces = [],
    colour = new T.Color();
  const piece = (geometry, key, uv = PLAIN_UV, matrix = null) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (matrix) g.applyMatrix4(matrix);
    colour.set(COLOURS[key] ?? '#ffffff');
    const n = g.attributes.position.count;
    g.setAttribute(
      'color',
      new T.Float32BufferAttribute(
        Array.from({length: n * 3}, (_, i) => [colour.r, colour.g, colour.b][i % 3]),
        3
      )
    );
    if (!g.attributes.normal) g.computeVertexNormals();
    if (uv !== 'own')
      g.setAttribute(
        'uv',
        new T.Float32BufferAttribute(
          Array.from({length: n * 2}, (_, i) => uv[i % 2]),
          2
        )
      );
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    pieces.push(g);
  };
  const at = (x, y, z, q = new T.Quaternion(), s = 1) =>
    new T.Matrix4().compose(new T.Vector3(x, y, z), q, new T.Vector3(s, s, s));
  const byMat = new Map();
  for (const t of buildPlayground()) {
    world?.addTri?.(playgroundWorld(t.a), playgroundWorld(t.b), playgroundWorld(t.c), t.surface);
    if (t.mat === 'fence') continue;
    if (!byMat.has(t.mat)) byMat.set(t.mat, []);
    byMat.get(t.mat).push(...t.a, ...t.b, ...t.c);
  }
  for (const [mat, positions] of byMat) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    piece(
      mat.startsWith('slide') || mat === 'turf' || mat === 'merry'
        ? toCreasedNormals(g, Math.PI / 5)
        : (g.computeVertexNormals(), toCreasedNormals(g, Math.PI / 8)),
      mat
    );
  }
  const tube = (a, b, r, key, sides = 8) => {
    const from = new T.Vector3(...a),
      to = new T.Vector3(...b),
      d = to.clone().sub(from);
    piece(
      new T.CylinderGeometry(r, r, d.length(), sides),
      key,
      PLAIN_UV,
      at(
        ...from.clone().add(to).multiplyScalar(0.5).toArray(),
        new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize())
      )
    );
  };
  const box = (x, y, z, w, h, d, key, q) => piece(new T.BoxGeometry(w, h, d), key, PLAIN_UV, at(x, y, z, q));

  // Fort and lookout roofs: tall pointed hats on the corner posts, well above any car.
  const roof = (x0, x1, z0, z1, key, peak) => {
    const g = new T.ConeGeometry((Math.hypot(x1 - x0, z1 - z0) / 2) * 1.05, peak, 4, 1, true);
    g.rotateY(Math.PI / 4);
    piece(g, key, PLAIN_UV, at((x0 + x1) / 2, DECK + ROOF + peak / 2, (z0 + z1) / 2, new T.Quaternion(), 1));
    for (const x of [x0 + 0.09, x1 - 0.09])
      box(x, DECK + ROOF, (z0 + z1) / 2, 0.2, 0.14, z1 - z0, 'deck-side');
  };
  roof(...FORT.x, ...FORT.z, 'roof', 2.6);
  roof(...LOOKOUT.x, ...LOOKOUT.z, 'roof-b', 1.8);
  // Ramp handrails on posts, matching the grind lines.
  for (const x of [RAMP.x[0] - 0.05, RAMP.x[1] + 0.05]) {
    tube([x, DECK + 0.55, RAMP.z[0]], [x, FLOOR + 0.55, RAMP.z[1]], 0.035, 'pole');
    for (let k = 0; k <= 4; k++) {
      const z = RAMP.z[0] + ((RAMP.z[1] - RAMP.z[0]) * k) / 4,
        y = DECK + ((FLOOR - DECK) * k) / 4;
      tube([x, y, z], [x, y + 0.55, z], 0.03, 'pole');
    }
  }
  // Rope bridge: rope rails, posts every two metres, slats.
  for (const z of [BRIDGE.z[0] - 0.08, BRIDGE.z[1] + 0.08]) {
    for (let k = 0; k < 9; k++) {
      const xa = BRIDGE.x[1] + ((BRIDGE.x[0] - BRIDGE.x[1]) * k) / 9,
        xb = BRIDGE.x[1] + ((BRIDGE.x[0] - BRIDGE.x[1]) * (k + 1)) / 9;
      tube([xa, bridgeY(xa) + 0.45, z], [xb, bridgeY(xb) + 0.45, z], 0.025, 'rope', 6);
    }
    for (let x = BRIDGE.x[0]; x <= BRIDGE.x[1] + 1e-6; x += 1.5)
      tube([x, bridgeY(x), z], [x, bridgeY(x) + 0.45, z], 0.02, 'rope', 6);
  }
  for (let x = BRIDGE.x[0] + 0.25; x < BRIDGE.x[1]; x += 0.5)
    box(
      x,
      bridgeY(x) + 0.005,
      (BRIDGE.z[0] + BRIDGE.z[1]) / 2,
      0.08,
      0.012,
      BRIDGE.z[1] - BRIDGE.z[0],
      'skirt'
    );
  // Spiral slide: central pole cap and the hanging connector's tie rods to the pole top.
  piece(
    new T.SphereGeometry(0.24, 12, 8),
    'roof-b',
    PLAIN_UV,
    at(SPIRAL.center[0], DECK + 1.7, SPIRAL.center[1])
  );
  for (const s of [-1, 1])
    tube(
      [SPIRAL.center[0], DECK + 1.55, SPIRAL.center[1]],
      [SPIRAL.from + 1.6, DECK + 0.45, SPIRAL.start[1] + s * 0.95],
      0.018,
      'chain',
      5
    );
  // Fireman's pole off the lookout.
  tube(
    [LOOKOUT.x[1] + 0.4, FLOOR, LOOKOUT.z[0] - 0.5],
    [LOOKOUT.x[1] + 0.4, DECK + 1.1, LOOKOUT.z[0] - 0.5],
    0.04,
    'pole'
  );
  // Swings: A-frames, a top bar, chains and seats hanging above car height.
  for (const x of [-30, -24, -18])
    for (const s of [-1, 1]) tube([x, FLOOR, -24 + s * 1.2], [x, 2.45, -24], 0.06, 'frame');
  tube([-30, 2.45, -24], [-18, 2.45, -24], 0.055, 'frame');
  for (const x of [-28.4, -25.6, -22.4, -19.6]) {
    for (const s of [-1, 1]) tube([x + s * 0.22, 2.42, -24], [x + s * 0.22, 0.52, -24], 0.008, 'chain', 4);
    box(x, 0.5, -24, 0.5, 0.04, 0.2, 'seat');
  }
  // Monkey bars between two ladders.
  for (const x of [14, 26])
    for (let y = 0.4; y < 2.1; y += 0.35) tube([x, y, -26], [x, y, -24.8], 0.025, 'pole');
  for (const z of [-26, -24.8]) tube([14, 2.1, z], [26, 2.1, z], 0.04, 'frame');
  for (let x = 14.5; x < 26; x += 0.5) tube([x, 2.1, -26], [x, 2.1, -24.8], 0.02, 'pole');
  // Merry-go-round handrails, above car height.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2,
      x = MERRY.at[0] + Math.cos(a) * 1.6,
      z = MERRY.at[1] + Math.sin(a) * 1.6;
    tube([MERRY.at[0], MERRY.h + 0.9, MERRY.at[1]], [x, MERRY.h + 0.75, z], 0.025, 'pole');
    tube([x, MERRY.h + 0.75, z], [x, MERRY.h + 0.55, z], 0.025, 'pole');
  }
  // Seesaw handles and pivot.
  const tilt = Math.atan2(SEESAW.high - FLOOR, SEESAW.x[1] - SEESAW.x[0]),
    mid = (SEESAW.z[0] + SEESAW.z[1]) / 2;
  piece(
    new T.CylinderGeometry(0.18, 0.22, 0.5, 10),
    'frame',
    PLAIN_UV,
    at((SEESAW.x[0] + SEESAW.x[1]) / 2, 0.25, mid)
  );
  for (const x of [SEESAW.x[0] + 0.5, SEESAW.x[1] - 0.5]) {
    const y = FLOOR + (x - SEESAW.x[0]) * Math.tan(tilt);
    tube([x, y, mid - 0.35], [x, y + 0.35, mid - 0.35], 0.02, 'pole');
    tube([x, y, mid + 0.35], [x, y + 0.35, mid + 0.35], 0.02, 'pole');
  }
  // Spring riders: an alien and a rocket on fat springs.
  for (const [x, z, kind] of [
    [6, 24, 'alien'],
    [9, 26, 'rocket'],
    [-8, 24, 'alien']
  ]) {
    piece(new T.CylinderGeometry(0.1, 0.1, 0.3, 10), 'spring', PLAIN_UV, at(x, FLOOR + 0.15, z));
    if (kind === 'alien') {
      piece(new T.SphereGeometry(0.22, 14, 10), 'alien', PLAIN_UV, at(x, 0.52, z, new T.Quaternion(), 1));
      piece(
        new T.SphereGeometry(0.3, 16, 12),
        'alien',
        PLAIN_UV,
        new T.Matrix4().compose(new T.Vector3(x, 0.9, z), new T.Quaternion(), new T.Vector3(1, 0.8, 1))
      );
      for (const s of [-1, 1])
        piece(new T.SphereGeometry(0.08, 10, 8), 'dark', PLAIN_UV, at(x + s * 0.12, 0.95, z + 0.25));
      for (const s of [-1, 1]) tube([x + s * 0.1, 1.1, z], [x + s * 0.2, 1.35, z], 0.015, 'alien', 5);
    } else {
      piece(new T.CylinderGeometry(0.16, 0.2, 0.7, 14), 'rocket', PLAIN_UV, at(x, 0.65, z));
      piece(new T.ConeGeometry(0.16, 0.32, 14), 'rocket-fin', PLAIN_UV, at(x, 1.16, z));
      for (let k = 0; k < 3; k++)
        box(
          x + Math.cos(k * 2.1) * 0.2,
          0.42,
          z + Math.sin(k * 2.1) * 0.2,
          0.04,
          0.24,
          0.14,
          'rocket-fin',
          new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -k * 2.1)
        );
    }
  }
  // Shade sails over the sandpit and the swings, on tall masts.
  const sail = (pts, key) => {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pts.flat(), 3));
    g.computeVertexNormals();
    piece(g, key);
    for (const [x, y, z] of pts) tube([x, FLOOR, z], [x, y + 0.1, z], 0.05, 'pole');
  };
  sail(
    [
      [SANDPIT.x[0] - 0.5, 4.2, SANDPIT.z[0] - 0.5],
      [SANDPIT.x[1] + 0.5, 3.6, SANDPIT.z[0] + 2],
      [SANDPIT.x[0] + 2, 3.8, SANDPIT.z[1] + 0.5]
    ],
    'sail-b'
  );
  sail(
    [
      [-31, 4, -21],
      [-17, 4.4, -22],
      [-24, 3.6, -28]
    ],
    'sail'
  );
  // Entry arch over the south gate.
  for (const x of [-4.1, 4.1])
    tube([x, FLOOR, PLAYGROUND.half[1]], [x, 3.1, PLAYGROUND.half[1]], 0.08, 'frame');
  const plate = new T.PlaneGeometry(7.6, 1.1);
  plate.setAttribute('uv', new T.Float32BufferAttribute([0, 0.5, 1, 0.5, 0, 0, 1, 0], 2));
  piece(plate, 'sign', 'own', at(0, 3.0, PLAYGROUND.half[1] + 0.06));
  const back = new T.PlaneGeometry(7.6, 1.1);
  back.rotateY(Math.PI);
  back.setAttribute('uv', new T.Float32BufferAttribute([0, 0.5, 1, 0.5, 0, 0, 1, 0], 2));
  piece(back, 'sign', 'own', at(0, 3.0, PLAYGROUND.half[1] - 0.06));
  // Picket fence over the fence's collision wall: two rails and a picket every 30 cm.
  for (const [[ax, az], [bx, bz]] of FENCE) {
    const l = Math.hypot(bx - ax, bz - az),
      yaw = Math.atan2(bx - ax, bz - az),
      q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
    // Flat, double-sided pickets: two triangles each instead of a twelve-triangle box.
    const flat = (x, y, z, w, h) => {
      const g = new T.PlaneGeometry(w, h);
      g.rotateY(Math.PI / 2);
      piece(g, 'fence', PLAIN_UV, at(x, y, z, q));
    };
    for (const y of [0.2, 0.55]) flat((ax + bx) / 2, y, (az + bz) / 2, l, 0.06);
    for (let d = 0.15; d < l; d += 0.3)
      flat(ax + ((bx - ax) * d) / l, 0.36, az + ((bz - az) * d) / l, 0.07, 0.7);
  }
  // Bins and fence-post caps.
  for (const [x, z] of [
    [-5.5, 30],
    [5.5, 30],
    [-36, 10],
    [36, 10]
  ])
    piece(new T.CylinderGeometry(0.22, 0.2, 0.7, 12), 'frame', PLAIN_UV, at(x, 0.38, z));

  const atlas = makeAtlas();
  const material = new T.MeshStandardMaterial({
    vertexColors: true,
    map: atlas,
    roughness: 0.78,
    metalness: 0.02,
    side: T.DoubleSide
  });
  const mesh = new T.Mesh(mergeGeometries(pieces, false), material);
  mesh.name = 'AdventurePlayground';
  mesh.castShadow = mesh.receiveShadow = true;
  root.add(mesh);
  for (const g of pieces) g.dispose();
  return {
    root,
    dispose() {
      root.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
      atlas.dispose();
    }
  };
}
