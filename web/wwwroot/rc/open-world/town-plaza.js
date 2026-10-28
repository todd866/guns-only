import * as T from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { PLAZA, buildPlaza, plazaWorld } from './town-plaza.mjs';

const COLOURS = {
  paver: '#bdc2bf', 'paver-dark': '#a0aba9', granite: '#d4d7d1', rim: '#95a4a2',
  basin: '#49aeb1', bank: '#b4bdb9', skirt: '#828f8d', steps: '#b8c1be',
  sculpture: '#a96b42', awning: '#7c8781', steel: '#56666a', bench: '#8b735b',
  civic: '#d3c5ac', glass: '#24424a', green: '#66834d', soil: '#765a3d', concrete: '#c8bca4', sign: '#ffffff',
};
const PLAIN_UV = [.5, .125];

// One atlas keeps signs legible without adding a draw call to the plaza.
function makeAtlas() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 192, 1024, 64);
  for (const [row, text] of [[0, 'TOWN PLAZA'], [1, 'CIVIC HALL'], [2, 'SUBWAY']]) {
    const y = row * 64; g.fillStyle = '#263d40'; g.fillRect(0, y, 1024, 64);
    g.fillStyle = '#c78b53'; g.fillRect(0, y, 1024, 5);
    g.fillStyle = '#f5e8c9'; g.font = '900 42px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 512, y + 34);
  }
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

export function createTownPlaza(scene, world) {
  const root = new T.Group(); root.name = 'TownPlaza'; root.position.set(...PLAZA.center); root.rotation.y = -PLAZA.yaw; scene.add(root);
  const pieces = [], colour = new T.Color();
  const piece = (geometry, key, uv = PLAIN_UV, matrix = null) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (matrix) g.applyMatrix4(matrix);
    colour.set(COLOURS[key] ?? '#ffffff');
    const n = g.attributes.position.count;
    g.setAttribute('color', new T.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [colour.r, colour.g, colour.b][i % 3]), 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (uv !== 'own') g.setAttribute('uv', new T.Float32BufferAttribute(Array.from({ length: n * 2 }, (_, i) => uv[i % 2]), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    pieces.push(g);
  };
  const at = (x, y, z, q = new T.Quaternion()) => new T.Matrix4().compose(new T.Vector3(x, y, z), q, new T.Vector3(1, 1, 1));
  const byMat = new Map();
  for (const t of buildPlaza()) {
    world?.addTri?.(plazaWorld(t.a), plazaWorld(t.b), plazaWorld(t.c), t.surface);
    if (!byMat.has(t.mat)) byMat.set(t.mat, []);
    byMat.get(t.mat).push(...t.a, ...t.b, ...t.c);
  }
  for (const [mat, positions] of byMat) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); g.computeVertexNormals(); piece(g, mat);
  }

  const atlas = makeAtlas();
  const signUv = row => {
    const top = 1 - row * .25, bottom = top - .25;
    return new T.Float32BufferAttribute([0,top, 1,top, 0,bottom, 1,bottom], 2);
  };
  const sign = (textRow, x, y, z, width, facing = Math.PI, mounted = false) => {
    piece(new T.BoxGeometry(width + .25, 1.25, .16), 'steel', PLAIN_UV, at(x, y, z));
    if (!mounted) for (const sx of [x - width / 2 + .65, x + width / 2 - .65]) piece(new T.BoxGeometry(.12, y - .625, .12), 'steel', PLAIN_UV, at(sx, (y - .625) / 2, z));
    const g = new T.PlaneGeometry(width, 1.05); g.setAttribute('uv', signUv(textRow));
    piece(g, 'sign', 'own', at(x, y, z - .1, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), facing)));
  };
  // The hall fascia and entry marker face the square.
  sign(0, -28, 2.3, -27, 8);
  sign(1, 0, 4, 22.88, 7, Math.PI, true);
  sign(2, 27, 1.95, -6, 5.5);

  const material = new T.MeshStandardMaterial({ vertexColors: true, map: atlas, roughness: .8, metalness: .04, side: T.DoubleSide });
  const mesh = new T.Mesh(mergeGeometries(pieces, false), material); mesh.name = 'TownPlaza'; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  for (const g of pieces) g.dispose();
  return { root, dispose() { root.removeFromParent(); mesh.geometry.dispose(); material.dispose(); atlas.dispose(); } };
}
