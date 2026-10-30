import * as T from '../../vendor/three.module.js';
import {mountainHeight,MOUNTAIN_BOUNDS,ROAD,MOUNTAIN,LAKE,damTris,damSpan,townTris,valleyPoint,TOWN,DAM_PARAPET} from './spirit-mountain.mjs';
import {SIZE} from './stream.mjs';
import {createWaterSurface} from './water-surface.js';
import {WATER} from '../physics/water.mjs';

// Spirit Mountain, drawn (physics and the near ground: spirit-mountain.mjs via the tiles).
// - A far view: the mountain at 16 m, unfogged and hazed like the USGS horizon ranges, so it stands
//   over the base from kilometres away. One chunk per streamed tile, sunk 1.5 m and hidden while
//   that tile's detailed ground is loaded, so the two never fight.
// - The road: a smooth ribbon just above the carved shelf, with a dashed centre line, so its edges
//   are clean instead of following the 4 m ground triangles.
export function createMountainView(scene) {
  const root = new T.Group(); root.name = 'SpiritMountain'; scene.add(root);
  const base = new T.Color('#b69b78'), rock = new T.Color('#9a7f62'), haze = new T.Color('#8faec4'), c = new T.Color();
  const farMat = new T.MeshLambertMaterial({ vertexColors: true, fog: false }), chunks = new Map(), STEP = 16;
  for (let tx = Math.floor(MOUNTAIN_BOUNDS[0] / SIZE); tx <= Math.floor(MOUNTAIN_BOUNDS[2] / SIZE); tx++)
    for (let tz = Math.floor(MOUNTAIN_BOUNDS[1] / SIZE); tz <= Math.floor(MOUNTAIN_BOUNDS[3] / SIZE); tz++) {
      const n = SIZE / STEP + 1, pos = new Float32Array(n * n * 3), idx = [];
      let any = false;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = tx * SIZE + i * STEP, z = tz * SIZE + j * STEP, y = mountainHeight(x, z); if (y > .5) any = true; pos.set([x, y - 1.5, z], (j * n + i) * 3); }
      if (!any) continue;
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const nrm = g.attributes.normal, col = new Float32Array(n * n * 3);
      for (let k = 0; k < n * n; k++) { const up = nrm.getY(k); c.copy(up < .85 ? rock : base).multiplyScalar(.72 + .28 * Math.max(0, up)).lerp(haze, .22); col.set([c.r, c.g, c.b], k * 3); }
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      const m = new T.Mesh(g, farMat); m.name = `MountainFar_${tx},${tz}`; root.add(m); chunks.set(`${tx},${tz}`, m);
    }
  // The road ribbon (and centre dashes), following the generated road.
  const roadMat = new T.MeshStandardMaterial({ color: '#3e4448', roughness: .9 }), lineMat = new T.MeshStandardMaterial({ color: '#e8d27a', roughness: .6 });
  const ribbon = (half, y, keep) => { const v = [], idx = [];
    for (let i = 0; i < ROAD.length; i++) { const a = ROAD[Math.max(0, i - 1)], b = ROAD[Math.min(ROAD.length - 1, i + 1)], len = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / len * half, nz = (b.x - a.x) / len * half, p = ROAD[i];
      v.push(p.x + nx, p.y + y, p.z + nz, p.x - nx, p.y + y, p.z - nz);
      if (i && keep(i)) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  const road = new T.Mesh(ribbon(MOUNTAIN.roadHalf, .03, () => true), roadMat); road.receiveShadow = true; road.name = 'MountainRoad'; root.add(road);
  const dashes = new T.Mesh(ribbon(.07, .045, i => i % 3 === 0), lineMat); dashes.name = 'MountainRoadLine'; root.add(dashes);
  // The dam: concrete in Hoover's horizontal lift bands, with water stains down the downstream
  // face; an asphalt crest road with a dashed line between parapets. Drawn on a grid (the
  // collision is a plain box) so the bands and stains have somewhere to live.
  const span = damSpan(), damV = [], damC = [], col = new T.Color(), concrete = new T.Color('#e0d3b6'), stain = new T.Color('#8f8a7c');
  const y0 = MOUNTAIN.lake.floor - 6, y1 = span.crest, half = span.thick / 2, sq = (P, cs) => { const [a, b, c, e] = P; damV.push(...a, ...b, ...c, ...a, ...c, ...e); for (let i = 0; i < 6; i++) damC.push(...cs[[0, 1, 2, 0, 2, 3][i]]); };
  const shade = (ac, y, face) => { const band = Math.floor((y - y0) / 4.5) % 2 ? .88 : 1.06, joint = Math.abs(((ac - span.from) % 16 + 16) % 16) < 1 ? .72 : 1, streak = face > 0 ? Math.max(0, Math.sin(ac * .9) * Math.sin(ac * .37 + 1)) * (1 - (y - y0) / (y1 - y0)) * .6 : 0; col.copy(concrete).lerp(stain, streak).multiplyScalar(band * joint); return [col.r, col.g, col.b]; };
  for (const face of [1, -1]) for (let y = y0; y < y1; y += 4.5) for (let ac = span.from; ac < span.to; ac += 1) {
    const ya = Math.min(y1, y + 4.5), ab = Math.min(span.to, ac + 1), al = span.along + face * half;
    const P = [valleyPoint(al, ac, y), valleyPoint(al, ab, y), valleyPoint(al, ab, ya), valleyPoint(al, ac, ya)];
    sq(face > 0 ? P : [P[1], P[0], P[3], P[2]], [shade(ac, y, face), shade(ab, y, face), shade(ab, ya, face), shade(ac, ya, face)]);
  }
  const damGeo = new T.BufferGeometry(); damGeo.setAttribute('position', new T.Float32BufferAttribute(damV, 3)); damGeo.setAttribute('color', new T.Float32BufferAttribute(damC, 3)); damGeo.computeVertexNormals();
  const damMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: T.DoubleSide }), dam = new T.Mesh(damGeo, damMat); dam.name = 'SpiritDam'; dam.castShadow = dam.receiveShadow = true; root.add(dam);
  // The crest road and its parapets (the parapets collide: damTris).
  const crest = new T.Group(); crest.name = 'SpiritDamCrest'; root.add(crest);
  const yaw = Math.atan2(...(() => { const a = valleyPoint(0, 0), b = valleyPoint(0, 1); return [b[0] - a[0], b[2] - a[2]]; })());
  const along = (w, d, h, al, ac, y, mat) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat), p = valleyPoint(al, ac, y); m.position.set(...p); m.rotation.y = yaw; crest.add(m); return m; };
  const crestMat = new T.MeshStandardMaterial({ color: '#41474b', roughness: .9 }), parMat = new T.MeshStandardMaterial({ color: '#d6cfbd', roughness: .85 }), mid = (span.from + span.to) / 2, len = span.to - span.from;
  along(span.thick - 2 * DAM_PARAPET.w, len, .04, span.along, mid, y1 + .02, crestMat);
  for (const s of [-1, 1]) along(DAM_PARAPET.w, len, DAM_PARAPET.h, span.along + s * (half - DAM_PARAPET.w / 2), mid, y1 + DAM_PARAPET.h / 2, parMat);
  for (let ac = span.from + 4; ac < span.to - 4; ac += 6) along(.14, 2.6, .01, span.along, ac, y1 + .045, lineMat);
  // The drowned town: weathered adobe, silted and green under the water.
  const townGeo = new T.BufferGeometry(), tv = [];
  for (const [a, b, c] of townTris()) tv.push(...a, ...b, ...c);
  townGeo.setAttribute('position', new T.Float32BufferAttribute(tv, 3)); townGeo.computeVertexNormals();
  const townMat = new T.MeshStandardMaterial({ color: '#9c8f74', roughness: .95 }), town = new T.Mesh(townGeo, townMat); town.name = 'DrownedTown'; town.receiveShadow = true; root.add(town);
  // Its details: dark empty doors and windows, a coping line round each roof, a cross on the steeple.
  const holeMat = new T.MeshStandardMaterial({ color: '#2b2722', roughness: 1 }), trimMat = new T.MeshStandardMaterial({ color: '#7d725e', roughness: .95 });
  const tyaw = Math.atan2(...(() => { const a = valleyPoint(0, 0), b = valleyPoint(0, 1); return [b[0] - a[0], b[2] - a[2]]; })()), floor = MOUNTAIN.lake.floor;
  const piece = (w, h, d, al, ac, y, mat) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(...valleyPoint(al, ac, y)); m.rotation.y = tyaw; town.add(m); };
  for (const [a0, a1, c0, c1, h] of TOWN) {
    const steeple = h > 10, al = (a0 + a1) / 2, ac = (c0 + c1) / 2;
    if (steeple) { piece(.3, 2.4, .3, al, ac, floor + h + 1.2, trimMat); piece(.3, .3, 1.4, al, ac, floor + h + 1.7, trimMat); continue; }
    for (const c of [c0, c1]) {   // the faces toward and away from the main street
      const s = c === c0 ? -1 : 1;
      piece(1.1, 2.1, .12, al, c + s * .02, floor + 1.05, holeMat);   // door
      for (let x = a0 + 2; x < a1 - 1.5; x += 3.2) if (Math.abs(x - al) > 1.4) piece(.9, .9, .12, x, c + s * .02, floor + Math.min(h - .9, 1.8), holeMat);
    }
    piece(a1 - a0 + .3, .25, .3, al, c0, floor + h, trimMat); piece(a1 - a0 + .3, .25, .3, al, c1, floor + h, trimMat);   // roof coping
  }
  // The reservoir's surface: the lake's bounding box at its level; the canyon walls hide the rest.
  const corners = [[MOUNTAIN.lake.back, -220], [MOUNTAIN.lake.back, 220], [MOUNTAIN.lake.dam, -220], [MOUNTAIN.lake.dam, 220]].map(([a, c]) => valleyPoint(a, c));
  const xs = corners.map(p => p[0]), zs = corners.map(p => p[2]), w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs);
  const lake = createWaterSurface({ size: [w, d], segments: [Math.round(w / 3), Math.round(d / 3)], position: [(Math.max(...xs) + Math.min(...xs)) / 2, LAKE.level, (Math.max(...zs) + Math.min(...zs)) / 2], swell: LAKE.swell, shallow: '#2a8fa0', deep: '#0b3f5c' });
  lake.mesh.name = 'SpiritReservoir'; root.add(lake.mesh);
  return {
    /** The upside-down has no dam: the water drains and the drowned town stands in the open. */
    setDam(on) { LAKE.active = on; dam.visible = on; lake.mesh.visible = on; },
    /** The streamed tile at key now has (or no longer has) detailed ground. */
    tileLoaded(key, on) { const m = chunks.get(key); if (m) m.visible = !on; },
    update(day) { farMat.color.setScalar(.15 + .85 * day); lake.update(WATER.time); },
    dispose() { root.removeFromParent(); root.traverse(o => o.geometry?.dispose()); [farMat, roadMat, lineMat, damMat, townMat, crestMat, parMat, holeMat, trimMat].forEach(m => m.dispose()); lake.dispose(); },
  };
}
