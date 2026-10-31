import * as T from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { SCHOOLYARD, buildSchoolyard, yardWorld, yardLocal, poolDepth } from './schoolyard.mjs';
import { smoothBowlNormals, refineSkateTriangles } from './skate-normals.js';

// Schoolyard collision and visuals. Collision is added at prepare time (as the other
// neighbourhood layers do); the visuals are one vertex-coloured mesh to keep the world's
// draw budget. The pool fills the terrain hole the runtime cut for it.
const COLOURS = { deck: '#c9c5b8', 'pool-wall': '#86c6d6', 'pool-floor': '#a6d6e2', bus: '#f2b705', 'bus-roof': '#e3a90a', kicker: '#b98a52', skirt: '#7a5a37', planter: '#b9b5a9', 'planter-top': '#5f8c3a', platform: '#c2bfb4', steps: '#cbc8bd', bank: '#bdb9ad', steel: '#c9d0cf', glass: '#28363c', tyre: '#1d2224' };

export function prepareSchoolyard(world, terrain) {
  const hole = terrain?.holes?.[0];
  if (!hole) return { attach() {}, dispose() {} };
  const tris = buildSchoolyard(hole);
  for (const t of tris) world?.addTri?.(t.a, t.b, t.c, t.surface);
  let mesh = null;
  return {
    attach(scene) {
      const pieces = [], colour = new T.Color();
      const piece = (g, key, matrix = null) => {
        g = g.index ? g.toNonIndexed() : g; if (matrix) g.applyMatrix4(matrix);
        colour.set(COLOURS[key]);
        const n = g.attributes.position.count;
        g.setAttribute('color', new T.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [colour.r, colour.g, colour.b][i % 3]), 3));
        if (!g.attributes.normal) g.computeVertexNormals();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
        pieces.push(g);
      };
      const byMat = new Map();
      for (const source of tris) for (const t of (['pool-wall','pool-floor','deck'].includes(source.mat) ? refineSkateTriangles([source], (x,z) => { const p=yardLocal([x,0,z]);return SCHOOLYARD.datum-poolDepth(p[0],p[2]); }) : [source])) { const mat=t.mat==='deck'&&Math.min(t.a[1],t.b[1],t.c[1])<SCHOOLYARD.datum-.001?'pool-wall':t.mat;if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(...t.a, ...t.b, ...t.c); }
      for (const [mat, positions] of byMat) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); if (mat === 'pool-wall') smoothBowlNormals(g, SCHOOLYARD.datum, (x,z) => { const p=yardLocal([x,0,z]);return SCHOOLYARD.datum-poolDepth(p[0],p[2]); }); else g.computeVertexNormals(); piece(g, mat); }
      const at = (p, q = new T.Quaternion()) => new T.Matrix4().compose(new T.Vector3(...yardWorld(p)), q, new T.Vector3(1, 1, 1));
      const tube = (a, b, r, key = 'steel') => {
        const from = new T.Vector3(...a), to = new T.Vector3(...b);
        piece(new T.CylinderGeometry(r, r, from.distanceTo(to), 8), key, at(from.clone().add(to).multiplyScalar(.5).toArray(), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), to.clone().sub(from).normalize())));
      };
      const box = (p, size, key) => piece(new T.BoxGeometry(...size), key, at(p));
      // Pool coping, following the rounded rectangle.
      const p = SCHOOLYARD.pool, [cx, cz] = p.at, [hx, hz] = p.half, r = p.corner, rim = [];
      for (const [sx, sz, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, 1.5 * Math.PI]])
        for (let i = 0; i <= 6; i++) { const a = a0 + i / 6 * Math.PI / 2; rim.push([cx + sx * (hx - r) + Math.cos(a) * r, cz + sz * (hz - r) + Math.sin(a) * r]); }
      for (let i = 0; i < rim.length; i++) { const [x0, z0] = rim[i], [x1, z1] = rim[(i + 1) % rim.length]; tube([x0, .02, z0], [x1, .02, z1], .07); }
      // Short bus: windows, wheels and bumpers over the collision box.
      const b = SCHOOLYARD.bus, [bx, bz] = b.at, L = b.length / 2, W = b.width / 2;
      for (const side of [-1, 1]) box([bx - .3, 1.12, bz + side * (W + .01)], [b.length - 2.2, .38, .02], 'glass');
      box([bx + L + .01, 1.1, bz], [.02, .45, b.width - .3], 'glass');
      for (const x of [bx - L + 1.6, bx + L - 1.6]) for (const side of [-1, 1]) piece(new T.CylinderGeometry(.42, .42, .3, 14), 'tyre', at([x, .42, bz + side * (W - .1)], new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2)));
      for (const x of [bx - L - .05, bx + L + .05]) box([x, .45, bz], [.12, .22, b.width + .1], 'tyre');
      // Handrails down the steps.
      const pf = SCHOOLYARD.platform, top = pf.height, foot = pf.z[1] + (pf.steps - 1) * pf.tread;
      for (const x of [pf.x[0] + 3.2, pf.x[1] - 3.2]) { tube([x, top + .85, pf.z[1] - .2], [x, .85 + top / pf.steps, foot], .035); tube([x, top, pf.z[1] - .2], [x, top + .85, pf.z[1] - .2], .03); tube([x, top / pf.steps, foot], [x, .85 + top / pf.steps, foot], .03); }
      mesh = new T.Mesh(mergeGeometries(pieces), new T.MeshStandardMaterial({ vertexColors: true, roughness: .8 }));
      mesh.name = 'Schoolyard'; mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
      for (const g of pieces) g.dispose();
    },
    dispose() { mesh?.removeFromParent(); mesh?.geometry.dispose(); mesh?.material.dispose(); mesh = null; },
  };
}
