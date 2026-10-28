import * as T from '../../vendor/three.module.js';
import { mergeGeometries, toCreasedNormals } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { HANGAR, buildHangar, hangarWorld } from './skate-hangar.mjs';

// Visuals and collision for the Skate Hangar. Riding surfaces come from the same triangles
// as collision. The whole hangar is one mesh: the world shares a draw budget, so colour is
// per vertex and one small texture carries the door sign (top) and a lamp strip (bottom).
const COLOURS = { floor: '#a5a8a1', ramp: '#c79c62', deck: '#9da19b', bank: '#a3a69f', skirt: '#6d5338', pyramid: '#b48d5a', 'pyramid-top': '#d0b07c', wall: '#b4bfc0', steel: '#c9d0cf', frame: '#3d4a4e', truss: '#68777c' };
// Texture rows (v up): sign 1..0.2, plain 0.2..0.1 (white map, a faint glow: under the trusses
// the shell's inner faces and ramp sides see little sun and read black), lamp 0.1..0 (glows).
const PLAIN = [.5, .15], LAMP = [.5, .05];

export function createSkateHangar(scene, world, h = HANGAR) {
  const root = new T.Group(); root.name = 'SkateHangar'; scene.add(root);
  root.position.set(...h.center); root.rotation.y = -h.yaw;
  const pieces = [], colour = new T.Color();
  // Adds a geometry with one colour and one UV region (or its own sign UVs).
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

  const byMat = new Map();
  for (const t of buildHangar(h)) {
    if (world?.addTri) world.addTri(hangarWorld(t.a, h), hangarWorld(t.b, h), hangarWorld(t.c, h), t.surface);
    if (!byMat.has(t.mat)) byMat.set(t.mat, []);
    byMat.get(t.mat).push(...t.a, ...t.b, ...t.c);
  }
  for (const [mat, positions] of byMat) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); if (mat === 'ramp') toCreasedNormals(g, Math.PI / 4); else g.computeVertexNormals();
    piece(g, mat);
  }
  const tube = (a, b, r = .05, key = 'steel') => {
    const from = new T.Vector3(...a), to = new T.Vector3(...b);
    piece(new T.CylinderGeometry(r, r, from.distanceTo(to), 8), key, PLAIN, at(...from.clone().add(to).multiplyScalar(.5).toArray(), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), to.clone().sub(from).normalize())));
  };
  const box = (x, y, z, w, hh, d, key, uv = PLAIN) => piece(new T.BoxGeometry(w, hh, d), key, uv, at(x, y, z));
  // Coping on every lip.
  const v = h.vert, Z = v.half, R = v.radius, west = v.bottom[0] - R, east = v.bottom[1] + R, W = h.width / 2, L = h.length / 2;
  tube([west, R, -Z], [west, R, Z], .07); tube([east, R, -Z], [east, R, Z], .07);
  const q = h.quarter;
  for (const z of [-W + .02, W - .02]) tube([q.x[0], q.radius, z], [q.x[1], q.radius, z]);
  const p = h.pyramid, t = p.top / 2;
  for (const [a, b] of [[[-t, -t], [t, -t]], [[t, -t], [t, t]], [[t, t], [-t, t]], [[-t, t], [-t, -t]]])
    tube([p.at[0] + a[0], p.height, p.at[1] + a[1]], [p.at[0] + b[0], p.height, p.at[1] + b[1]], .04);
  // Guard rail at the back of the west deck.
  const rail = west - v.deck + .1;
  tube([rail, R + .9, -Z], [rail, R + .9, Z], .035);
  for (let z = -Z; z <= Z; z += 3.5) tube([rail, R, z], [rail, R + .9, z], .03);
  // Open arched trusses over the long walls, with purlins; sunlight falls through.
  const rise = h.roof - 9, ribs = 9, segs = 10;
  const archPoint = s => [9 + rise * Math.sin(Math.PI * s), -W + 2 * W * s];
  for (let i = 0; i < ribs; i++) {
    const x = -L + 2 + (h.length - 4) * i / (ribs - 1);
    for (let k = 0; k < segs; k++) { const [y0, z0] = archPoint(k / segs), [y1, z1] = archPoint((k + 1) / segs); tube([x, y0, z0], [x, y1, z1], .16, 'truss'); }
  }
  for (const s of [.08, .25, .5, .75, .92]) { const [y, z] = archPoint(s); tube([-L + 2, y, z], [L - 2, y, z], .07, 'truss'); }
  // Lamp strips under the trusses.
  for (const s of [.32, .5, .68]) { const [y, z] = archPoint(s); box(0, y - .45, z, h.length - 8, .1, .45, 'steel', LAMP); }
  // Door frame and sign facing the flight line.
  for (const z of [-W, W]) box(L, 4.5, z, .6, 9, .6, 'frame');
  box(L, 9.4, 0, .6, 1.1, h.width + .6, 'frame');
  const sign = new T.PlaneGeometry(16, 2), suv = sign.attributes.uv;
  for (let i = 0; i < suv.count; i++) suv.setY(i, .2 + suv.getY(i) * .8);
  piece(sign, 'steel', 'own', at(L + .32, 11, 0, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2)));
  // The same sign reads correctly from inside, hung on the header's back face.
  const inner = new T.PlaneGeometry(16, 2), iuv = inner.attributes.uv;
  for (let i = 0; i < iuv.count; i++) iuv.setY(i, .2 + iuv.getY(i) * .8);
  piece(inner, 'steel', 'own', at(L - .32, 11, 0, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -Math.PI / 2)));

  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = 1024; glowCanvas.height = 160;
  for (const [c, glow] of [[canvas, false], [glowCanvas, true]]) {
    const g = c.getContext('2d');
    g.fillStyle = '#1b2a2e'; g.fillRect(0, 0, 1024, 128);
    g.font = 'italic 900 92px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = glow ? '#5a4520' : '#edbd6a'; g.fillText('SKATE HANGAR', 512, 68);
    g.fillStyle = glow ? '#464d4e' : '#ffffff'; g.fillRect(0, 128, 1024, 16);
    g.fillStyle = glow ? '#ffe9b8' : '#ffffff'; g.fillRect(0, 144, 1024, 16);
  }
  const texture = new T.CanvasTexture(canvas), glowTexture = new T.CanvasTexture(glowCanvas);
  texture.colorSpace = glowTexture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshStandardMaterial({ vertexColors: true, map: texture, emissive: '#ffffff', emissiveMap: glowTexture, emissiveIntensity: 1.2, roughness: .72, side: T.DoubleSide });
  const mesh = new T.Mesh(mergeGeometries(pieces), material); mesh.name = 'SkateHangar'; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  for (const g of pieces) g.dispose();
  return { root, dispose() { root.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose(); glowTexture.dispose(); } };
}
