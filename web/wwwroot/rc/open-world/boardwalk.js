import * as T from '../../vendor/three.module.js';
import { mergeGeometries, toCreasedNormals } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { BOARDWALK, buildBoardwalk, boardwalkWorld, boardwalkHeight, boardwalkRampHeight } from './boardwalk.mjs';
import { smoothBowlNormals, refineSkateTriangles } from './skate-normals.js';

const COLOURS = {
  deck: '#bcbdb6', sand: '#d7b27a', 'pit-wall': '#c8845f', 'pit-floor': '#c8845f',
  'pit-roller': '#cf9666', bank: '#cf9666', skirt: '#8d604a', vert: '#d18b63', roof: '#287b78', hut: '#f1d2a2',
  steps: '#c7c2b6', ledge: '#d8d4c8', planter: '#a79b83', soil: '#775643', bench: '#b27b55',
  steel: '#bcc7c3', coping: '#e7dfcc', stripe: '#ef8064', palm: '#416d46', trunk: '#896345',
  lamp: '#f8d995', sign: '#e9bf72', tower: '#e9e0c9', water: '#4e9b9b'
};
const PLAIN = [.5, .15], LAMP = [.5, .05];

export function createBoardwalk(scene, world, h = BOARDWALK) {
  const root = new T.Group(); root.name = 'Boardwalk'; root.position.set(...h.center); scene.add(root);
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
    if (delta.lengthSq() < 1e-8) return;
    piece(new T.CylinderGeometry(r, r, delta.length(), 8), key, PLAIN,
      at(...from.clone().add(to).multiplyScalar(.5).toArray(), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize())));
  };
  const byMat = new Map();
  for (const source of buildBoardwalk(h)) {
    if (world?.addTri) world.addTri(boardwalkWorld(source.a, h), boardwalkWorld(source.b, h), boardwalkWorld(source.c, h), source.surface);
    const pitGrid=['pit-wall','pit-floor','deck','bank'].includes(source.mat)&&[source.a,source.b,source.c].every(([x,y,z])=>x>=-28&&x<=1&&z>=-18&&z<=-5);
    const curved=pitGrid||source.mat==='vert';
    for (const t of (curved ? refineSkateTriangles([source], source.mat === 'vert' ? boardwalkRampHeight : boardwalkHeight) : [source])) {
      const mat = pitGrid&&source.mat==='bank'?'pit-roller':source.mat==='deck'&&curved&&Math.min(t.a[1],t.b[1],t.c[1])<h.deck-.001?'pit-wall':t.mat;
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(...t.a, ...t.b, ...t.c);
    }
  }
  for (const [mat, positions] of byMat) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    if (mat === 'pit-wall'||mat === 'pit-roller') smoothBowlNormals(g, h.deck, boardwalkHeight);
    else if (mat === 'vert') smoothBowlNormals(g, 4.04, boardwalkRampHeight);
    else if (mat === 'bank') toCreasedNormals(g, Math.PI / 4);
    else g.computeVertexNormals();
    piece(g, mat);
  }

  const solidBox = (x, y, z, w, hh, d, surface = 'metal') => {
    if (!world?.addTri) return;
    const p = [[x-w/2,y-hh/2,z-d/2],[x+w/2,y-hh/2,z-d/2],[x+w/2,y-hh/2,z+d/2],[x-w/2,y-hh/2,z+d/2],
      [x-w/2,y+hh/2,z-d/2],[x+w/2,y+hh/2,z-d/2],[x+w/2,y+hh/2,z+d/2],[x-w/2,y+hh/2,z+d/2]];
    for (const [a,b,c] of [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]]) world.addTri(boardwalkWorld(p[a], h), boardwalkWorld(p[b], h), boardwalkWorld(p[c], h), surface);
  };
  const lampBase = x => Math.abs(x) > 25 ? 1.24 : h.deck;
  for (const x of [-29, -14, 2, 29]) {
    const base = lampBase(x), height = 3.6;
    box(x, base + .08, 2.85, .16, .16, .16, 'steel'); solidBox(x, base + .08, 2.85, .16, .16, .16);
    box(x, base + height / 2, 2.85, .12, height, .12, 'steel'); solidBox(x, base + height / 2, 2.85, .12, height, .12);
    box(x, base + height + .08, 2.85, .42, .12, .42, 'lamp', LAMP);
  }
  // Broad leaf faces read as palms at chase-camera distance without adding foliage clutter.
  const palm = (x, z, base) => {
    tube([x, base, z], [x + .12, base + 3.5, z], .16, 'trunk');
    solidBox(x, base + 1.75, z, .25, 3.5, .25);
    const y = base + 3.52;
    for (let i=0;i<8;i++) {
      const a=i*Math.PI/4,dx=Math.cos(a),dz=Math.sin(a),points=[];
      const shape=[[0,0,.02],[.6,.28,.28],[1.3,.08,.22],[1.9,-.5,0]];
      const p=(j,side)=>{const [r,h,w]=shape[j];return [x+.12+dx*r-dz*w*side,y+h,z+dz*r+dx*w*side];};
      for(let j=0;j<3;j++)points.push(...p(j,-1),...p(j,1),...p(j+1,1),...p(j,-1),...p(j+1,1),...p(j+1,-1));
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));piece(g,'palm');
    }
  };
  for (const [x, z, base] of [[-30, -19, 1.22], [-12, -19, h.deck], [2, -19, 2.02], [30, -19, 1.22], [-30, 18, .04], [29, 18, .04]]) palm(x, z, base);

  // Lifeguard tower on the sand, kept off the drive line.
  for (const x of [-25.4, -22.6]) for (const z of [14, 16.2]) { tube([x, .04, z], [x, 2.1, z], .09, 'tower'); solidBox(x, 1.07, z, .18, 2.14, .18); }
  box(-24, 2.15, 15.1, 4.2, .18, 3.2, 'tower');
  solidBox(-24, 2.15, 15.1, 4.2, .18, 3.2);
  for (const x of [-25.4, -22.6]) for (const z of [14, 16.2]) { tube([x, 2.24, z], [x, 2.79, z], .065, 'tower'); solidBox(x, 2.515, z, .13, .55, .13); }
  box(-24, 2.85, 15.1, 4.8, .12, 3.8, 'roof');
  // Ladder and roof supports keep the tower readable as a real structure.
  for(const x of [-24.5,-23.5])tube([x,.04,11.8],[x,2.24,13.6],.035,'steel');
  for(let i=0;i<7;i++){const t=i/6;tube([-24.5,.14+2*t,11.9+1.6*t],[-23.5,.14+2*t,11.9+1.6*t],.025,'steel');}

  // A small atlas sign and warm lamp strip keep the entrance legible at dusk.
  const sign = new T.PlaneGeometry(7, 1.1), suv = sign.attributes.uv;
  for (let i = 0; i < suv.count; i++) suv.setY(i, .2 + suv.getY(i) * .8);
  piece(sign, 'sign', 'own', at(8, 2.48, -18.015, new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI)));
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = 1024; glowCanvas.height = 160;
  for (const [c, glow] of [[canvas, false], [glowCanvas, true]]) {
    const g = c.getContext('2d'); g.fillStyle = glow ? '#161310' : '#287b78'; g.fillRect(0, 0, 1024, 128);
    g.font = 'italic 900 88px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = glow ? '#66522d' : '#ffe2a8'; g.fillText('BOARDWALK', 512, 68);
    g.fillStyle = glow ? '#161310' : '#fff'; g.fillRect(0, 128, 1024, 16);
    g.fillStyle = glow ? '#ffe9b8' : '#fff'; g.fillRect(0, 144, 1024, 16);
  }
  const texture = new T.CanvasTexture(canvas), glowTexture = new T.CanvasTexture(glowCanvas);
  texture.colorSpace = glowTexture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshStandardMaterial({ vertexColors: true, map: texture, emissive: '#ffffff', emissiveMap: glowTexture, emissiveIntensity: 1.15, roughness: .8, side: T.DoubleSide, shadowSide: T.BackSide });
  const mesh = new T.Mesh(mergeGeometries(pieces), material); mesh.name = 'Boardwalk'; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  for (const g of pieces) g.dispose();
  return { root, dispose() { root.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose(); glowTexture.dispose(); } };
}
