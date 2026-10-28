import * as T from '../../vendor/three.module.js';
import { mergeGeometries, toCreasedNormals } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { buildMarseille, addMarseilleCollision, MARSEILLE_PARK, marseilleWorld, marseilleLocal, marseilleHeight } from './marseille.mjs';
import { smoothBowlNormals, refineSkateTriangles } from './skate-normals.js';

const COLOURS = { deck: '#d0d1c6', bowl: '#c6d5cf', floor: '#9fb8b4', wall: '#c6d5cf', bank: '#b8c9c5', top: '#d5dbcf', steps: '#d1bc9a', ledge: '#b97253', skirt: '#9ca99f', coping: '#eae4d2', stripe: '#327c83', dark: '#495e60' };
export function createMarseille(scene, world) {
  addMarseilleCollision(world);
  const pieces = [], colour = new T.Color(), floor = new T.Color(COLOURS.floor), rim = new T.Color(COLOURS.bowl);
  const piece = (geometry, key, ownUv = false) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    colour.set(COLOURS[key]);
    const n = g.attributes.position.count, colours = [];
    for (let i = 0; i < n; i++) {
      if (key === 'bowl') colour.lerpColors(floor, rim, Math.max(0, Math.min(1, 1 + g.attributes.position.getY(i) / 2.2)));
      colours.push(colour.r, colour.g, colour.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(colours, 3));
    if (!ownUv) g.setAttribute('uv', new T.Float32BufferAttribute(Array.from({ length: n * 2 }, (_, i) => i % 2 ? .02 : .5), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    pieces.push(g);
  };
  const byMat = new Map();
  for (const source of buildMarseille()) for (const t of (source.surface === 'bowl' || source.surface === 'hip' || source.mat === 'deck' ? refineSkateTriangles([source], (x,z) => { const p=marseilleLocal([x,0,z]); return marseilleHeight(p[0],p[2]); }) : [source])) {
    const mat = t.surface === 'hip' ? 'hip' : t.surface === 'bowl' || t.mat === 'deck' && Math.min(t.a[1],t.b[1],t.c[1]) < -.001 ? 'bowl' : t.mat;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(...t.a, ...t.b, ...t.c);
  }
  for (const [mat, positions] of byMat) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    if (mat === 'bowl') {
      smoothBowlNormals(g, marseilleWorld([0,0,0])[1], (x,z) => { const p=marseilleLocal([x,0,z]);return marseilleHeight(p[0],p[2]); }); piece(g, mat);
    } else if (mat === 'hip') { toCreasedNormals(g, Math.PI / 4); piece(g, 'bowl'); } else piece(g, mat);
  }
  const ribbon = (a, b, width, key) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), nx = -dz / len * width / 2, nz = dx / len * width / 2;
    const p = [[a[0] + nx, a[2] + .018, a[1] + nz], [b[0] + nx, b[2] + .018, b[1] + nz], [b[0] - nx, b[2] + .018, b[1] - nz], [a[0] - nx, a[2] + .018, a[1] - nz]].map(marseilleWorld);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]], 3)); piece(g, key);
  };
  for (const rail of MARSEILLE_PARK.rails) for (let i = 1; i < rail.pts.length; i++) ribbon(rail.pts[i - 1], rail.pts[i], rail.kind === 'coping' ? .22 : .12, i % 5 === 0 ? 'stripe' : 'coping');
  // Painted plaza joints and channel-edge chevrons share the park's one draw.
  for (const z of [18, 30]) ribbon([-38, z, 0], [16, z, 0], .04, 'dark');
  for (const x of [-20, 16, 30]) ribbon([x, 18, 0], [x, 30, 0], .04, 'dark');
  for (let x = 19.5; x < 27; x += 1.4) ribbon([x, 16.7, .84], [x + .6, 16.7, .84], .16, 'stripe');
  // A low spillway marker identifies the site from the normal chase camera.
  const sign = new T.PlaneGeometry(7, 1.2), uv = sign.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, .1 + uv.getY(i) * .9);
  for (const z of [-9.9,-4.1]) { const post = new T.BoxGeometry(.1,2,.1); post.translate(...marseilleWorld([-38.45,1,z])); piece(post,'dark'); }
  for (const side of [-1,1]) { const panel=sign.clone();panel.rotateY(side*Math.PI/2);panel.translate(...marseilleWorld([-38.4+side*.015,1.4,-7]));piece(panel,'coping',true); }
  sign.dispose();
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#28595e'; ctx.fillRect(0, 0, 1024, 230); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f6e6ba'; ctx.font = 'italic 900 118px system-ui'; ctx.fillText('THE BOWLS', 512, 113);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshStandardMaterial({ vertexColors: true, map: texture, roughness: .85, side: T.DoubleSide });
  const mesh = new T.Mesh(mergeGeometries(pieces), material); mesh.name = 'MarseilleBowls'; mesh.receiveShadow = true; scene.add(mesh);
  for (const g of pieces) g.dispose();
  return { dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose(); } };
}
