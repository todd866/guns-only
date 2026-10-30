import * as T from '../../vendor/three.module.js';
import {mountainHeight,MOUNTAIN_BOUNDS,ROAD,MOUNTAIN} from './spirit-mountain.mjs';
import {SIZE} from './stream.mjs';

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
  return {
    /** The streamed tile at key now has (or no longer has) detailed ground. */
    tileLoaded(key, on) { const m = chunks.get(key); if (m) m.visible = !on; },
    update(day) { farMat.color.setScalar(.15 + .85 * day); },
    dispose() { root.removeFromParent(); root.traverse(o => o.geometry?.dispose()); [farMat, roadMat, lineMat].forEach(m => m.dispose()); },
  };
}
