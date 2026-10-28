import * as T from '../../vendor/three.module.js';
import { mergeGeometries, toCreasedNormals } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { SKATESTREET, buildSkatestreet, skatestreetWorld, streetBowlHeight } from './skatestreet.mjs';
import { smoothBowlNormals, refineSkateTriangles } from './skate-normals.js';

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
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (matrix) g.applyMatrix4(matrix);
    colour.set(COLOURS[key] ?? '#ffffff');
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
  const byMat = new Map();
  for (const t of buildSkatestreet(h)) {
    if (world?.addTri) world.addTri(skatestreetWorld(t.a, h), skatestreetWorld(t.b, h), skatestreetWorld(t.c, h), t.surface);
    const gridDeck = t.mat === 'deck' && [t.a,t.b,t.c].every(([x,y,z]) => x>=-35 && x<=10 && z>=-24 && z<=4 && Math.abs(y-h.deck)<.001);
    const render = gridDeck || ['bowl-wall','bowl-floor','hip'].includes(t.mat) ? refineSkateTriangles([t], streetBowlHeight) : [t];
    for (const r of render) {
      const mat=gridDeck&&Math.min(r.a[1],r.b[1],r.c[1])<h.deck-.001?'bowl-wall':r.mat;
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(...r.a, ...r.b, ...r.c);
    }
  }
  for (const [mat, positions] of byMat) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    if (mat === 'bowl-wall') smoothBowlNormals(g, h.deck, streetBowlHeight);
    else if (mat === 'ramp' || mat === 'hip') toCreasedNormals(g, Math.PI / 4);
    piece(g, mat);
  }

  const L = h.length / 2, W = h.width / 2;
  // Open-sided gym shell: the front stays clear for the chase camera and the high clerestory
  // catches warm light across the wooden bowls.
  for (const x of [-L, -L + 18, 0, L - 18, L]) {
    tube([x, 1, -W + .2], [x, 12.4, -W + .2], .14, 'frame');
    tube([x, 12.4, -W + .2], [x, 12.4, W - .2], .12, 'truss');
  }
  for (const z of [-W + 2, -W / 2, 0, W / 2, W - 2]) tube([-L + 2, 12.4, z], [L - 2, 12.4, z], .07, 'truss');
  for (const x of [-L, L]) for (const z of [-W, 0, W]) tube([x, 1, z], [x, 12.4, z], .16, 'frame');
  for (const z of [-W, W]) box(0, 10, z, h.length, .5, .4, 'frame');
  for (const z of [-W + 3, W - 3]) box(0, 12.65, z, h.length, .16, 6, 'wall');
  // Recessed lamps and their simple emissive strips make the level readable without glare.
  for (const z of [-20, -8, 6, 20]) box(0, 11.9, z, h.length - 8, .1, .42, 'light', LAMP);

  // High clerestory headers sit above the one-metre perimeter walls in the collision builder.
  for (const x of [-L + 6, L - 6]) box(x, 8.5, -W - .33, 6, 1.1, .18, 'frame');
  for (const z of [-W, W]) for (const x of [-8, 8]) tube([x, 9.7, z], [x, 10, z], .025, 'steel');
  for (const z of [-W, W]) {
    box(0, 8.6, z, 20, 2.35, .16, 'teal');
    for (const side of [-1, 1]) {
      const sign = new T.PlaneGeometry(20, 2.35), uv = sign.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, .2 + uv.getY(i) * .8);
      piece(sign, 'sign', 'own', at(0, 8.6, z + side * .1, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), side < 0 ? Math.PI : 0)));
    }
  }
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = 1024; glowCanvas.height = 160;
  for (const [c, glow] of [[canvas, false], [glowCanvas, true]]) {
    const g = c.getContext('2d'); g.fillStyle = '#17383b'; g.fillRect(0, 0, 1024, 128);
    g.font = 'italic 900 86px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = glow ? '#4d4025' : '#f0c875'; g.fillText('SKATESTREET', 512, 68);
    g.fillStyle = glow ? '#000' : '#fff'; g.fillRect(0, 128, 1024, 16); g.fillStyle = glow ? '#ffe9b8' : '#fff'; g.fillRect(0, 144, 1024, 16);
  }
  const texture = new T.CanvasTexture(canvas), glowTexture = new T.CanvasTexture(glowCanvas);
  texture.colorSpace = glowTexture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshStandardMaterial({ vertexColors: true, map: texture, emissive: '#ffffff', emissiveMap: glowTexture, emissiveIntensity: 1.1, roughness: .75, side: T.DoubleSide });
  const mesh = new T.Mesh(mergeGeometries(pieces), material); mesh.name = 'Skatestreet'; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  for (const g of pieces) g.dispose();
  return { root, dispose() { root.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose(); glowTexture.dispose(); } };
}
