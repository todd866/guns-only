import * as T from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { SKATESTREET, buildSkatestreet, skatestreetWorld } from './skatestreet.mjs';

// Skatestreet art is deliberately one merged mesh: the world has a shared draw budget and
// the collision builder remains the source of truth for every rideable surface.
const COLOURS = {
  floor: '#b9b4a9', deck: '#1c7774', 'bowl-wall': '#b87945', 'bowl-floor': '#8e572f',
  hip: '#e49b50', ramp: '#d7a05b', bank: '#c98c50', skirt: '#594235', funbox: '#d0a269',
  steps: '#777b7a', ledge: '#d7d0c2', steel: '#aab8b8', wall: '#53656a', frame: '#324449',
  truss: '#6b7f80', light: '#fff0bb', sign: '#d8a551', teal: '#206b6d'
};
const PLAIN = [.5, .15], LAMP = [.5, .05];

export function createSkatestreet(scene, world, h = SKATESTREET) {
  const root = new T.Group(); root.name = 'Skatestreet'; scene.add(root);
  root.position.set(...h.center);
  const pieces = [], colour = new T.Color();
  const piece = (geometry, key, uv = PLAIN, matrix = null) => {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (matrix) g.applyMatrix4(matrix);
    colour.set(COLOURS[key] ?? '#ffffff').convertSRGBToLinear();
    const n = g.attributes.position.count;
    g.setAttribute('color', new T.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [colour.r, colour.g, colour.b][i % 3]), 3));
    if (uv !== 'own') g.setAttribute('uv', new T.Float32BufferAttribute(Array.from({ length: n * 2 }, (_, i) => uv[i % 2]), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    pieces.push(g);
  };
  const at = (x, y, z, q = new T.Quaternion()) => new T.Matrix4().compose(new T.Vector3(x, y, z), q, new T.Vector3(1, 1, 1));
  const box = (x, y, z, w, hh, d, key, uv = PLAIN) => piece(new T.BoxGeometry(w, hh, d), key, uv, at(x, y, z));
  const tube = (a, b, r = .06, key = 'steel') => {
    const from = new T.Vector3(...a), to = new T.Vector3(...b), delta = to.clone().sub(from);
    piece(new T.CylinderGeometry(r, r, delta.length(), 8), key, PLAIN,
      at(...from.clone().add(to).multiplyScalar(.5).toArray(), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize())));
  };
  const wedge = (x, y, z, w, hh, d, key, rise = 'z') => {
    const p = rise === 'z' ? [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2], [-w / 2, hh, d / 2], [w / 2, hh, d / 2]] : [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2], [w / 2, hh, -d / 2], [w / 2, hh, d / 2]];
    const idx = [[0, 1, 2], [0, 2, 3], [3, 2, 5], [3, 5, 4], [0, 3, 4], [0, 4, rise === 'z' ? 1 : 4], [1, 2, 5], [1, 5, rise === 'z' ? 0 : 4]];
    const pos = []; for (const f of idx) for (const i of f) pos.push(...p[i]);
    piece(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(pos, 3)), key, PLAIN, at(x, y, z));
  };

  for (const t of buildSkatestreet(h)) {
    if (world?.addTri) world.addTri(skatestreetWorld(t.a, h), skatestreetWorld(t.b, h), skatestreetWorld(t.c, h), t.surface);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([...t.a, ...t.b, ...t.c], 3));
    piece(g, t.mat);
  }

  const L = h.length / 2, W = h.width / 2;
  // Open-sided gym shell: the front stays clear for the chase camera and the high clerestory
  // catches warm light across the wooden bowls.
  box(0, 2.4, -W, h.length, 4.8, .55, 'wall');
  box(-L, 2.4, 0, .55, 4.8, h.width, 'wall'); box(L, 2.4, 0, .55, 4.8, h.width, 'wall');
  for (const x of [-L + 3, -L + 17, 0, L - 17, L - 3]) {
    tube([x, 4.8, -W + .2], [x, 12.4, -W + .2], .14, 'frame');
    tube([x, 12.4, -W + .2], [x, 12.4, W - .2], .12, 'truss');
  }
  for (const z of [-W + 2, -W / 2, 0, W / 2, W - 2]) tube([-L + 2, 12.4, z], [L - 2, 12.4, z], .07, 'truss');
  // Recessed lamps and their simple emissive strips make the level readable without glare.
  for (const z of [-20, -8, 6, 20]) box(0, 11.9, z, h.length - 8, .1, .42, 'light', LAMP);

  // Mezzanine fascia, west bank handrail, and a few bold street props.
  box(-19, 3.25, -28, 28, .28, 5.6, 'teal');
  box(-19, 2.1, -30.45, 28, 2.2, .3, 'frame');
  wedge(-3, .12, -20, 8, 3.15, 10, 'bank');
  for (const x of [-7, -3, 1]) tube([x, 3.35, -30.2], [x, 4.15, -30.2], .045, 'steel');
  tube([-7, 4.15, -30.2], [1, 4.15, -30.2], .065, 'steel');
  box(-9, .7, 16, 9, 1.4, 4, 'funbox'); box(-9, 1.45, 16, 7, .14, 3.5, 'ledge');
  wedge(5, .1, 19, 8, 2.5, 7, 'kicker');
  for (let i = 0; i < 5; i++) box(12, .16 + i * .28, 15.5 - i * .9, 4.5, .32, 1.8, 'steps');
  box(27.5, .78, 22, 14, 1.5, 2.2, 'ledge');

  // A clerestory header sign faces the open approach and is duplicated inside the back wall.
  for (const x of [-L + 6, L - 6]) box(x, 8.5, -W - .33, 6, 1.1, .18, 'frame');
  const sign = new T.PlaneGeometry(20, 2.35);
  piece(sign, 'sign', 'own', at(0, 8.6, -W - .36));
  const inner = new T.PlaneGeometry(20, 2.35);
  piece(inner, 'sign', 'own', at(0, 8.6, -W + .36, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI)));
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = 1024; glowCanvas.height = 160;
  for (const [c, glow] of [[canvas, false], [glowCanvas, true]]) {
    const g = c.getContext('2d'); g.fillStyle = '#17383b'; g.fillRect(0, 0, 1024, 128);
    g.font = 'italic 900 86px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = glow ? '#4d4025' : '#f0c875'; g.fillText('SKATESTREET', 512, 68);
    g.fillStyle = glow ? '#000' : '#e6f1df'; g.fillRect(0, 128, 1024, 16); g.fillStyle = glow ? '#ffe9b8' : '#fff'; g.fillRect(0, 144, 1024, 16);
  }
  const texture = new T.CanvasTexture(canvas), glowTexture = new T.CanvasTexture(glowCanvas);
  texture.colorSpace = glowTexture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshStandardMaterial({ vertexColors: true, map: texture, emissive: '#ffffff', emissiveMap: glowTexture, emissiveIntensity: 1.1, roughness: .75, side: T.DoubleSide });
  const mesh = new T.Mesh(mergeGeometries(pieces), material); mesh.name = 'Skatestreet'; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  for (const g of pieces) g.dispose();
  return { root, dispose() { root.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose(); glowTexture.dispose(); } };
}
