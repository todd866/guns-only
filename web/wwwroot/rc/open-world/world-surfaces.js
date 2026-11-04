import * as T from '../../vendor/three.module.js';
import {createSurfaceMaps} from './materials.js';
import {EVENTS} from './catalog.mjs';
import {WORLD_LINKS} from './navigation.mjs';

// The baked landmark package contains untextured event floors. Cover only those
// existing footprints; millimetre-scale visual overlays never enter collision.
// World-space UVs and small event-footprint batches keep detail continuous and culling bounded.
export function buildWorldSurfaces(scene) {
  const root = new T.Group();
  root.name = 'WorldSurfaceDetail';
  const maps = new Map(),
    materials = new Map(),
    buckets = new Map();
  let group = 'links';
  const material = kind => {
    if (!materials.has(kind)) {
      const t = createSurfaceMaps(kind);
      maps.set(kind, t);
      materials.set(
        kind,
        new T.MeshStandardMaterial({
          color: '#ffffff',
          map: t.map,
          normalMap: t.normalMap,
          roughnessMap: t.roughnessMap,
          roughness: 1,
          normalScale: new T.Vector2(0.055, 0.055),
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1
        })
      );
    }
    return materials.get(kind);
  };
  const quad = (kind, a, b, c, d) => {
    const key = `${kind}:${group}`;
    if (!buckets.has(key)) buckets.set(key, {kind, p: [], uv: []});
    const v = buckets.get(key),
      scale = kind === 'asphalt' ? 1.2 : kind === 'sand' ? 0.32 : 0.16;
    for (const p of [a, b, c, a, c, d]) {
      v.p.push(...p);
      v.uv.push(p[0] * scale, p[2] * scale);
    }
  };
  for (const e of EVENTS) {
    if (!['ramp-rat', 'hangar-hop', 'whoops', 'wing-walker'].includes(e.id)) continue;
    group = e.id;
    const xs = e.points.map(p => p[0]),
      zs = e.points.map(p => p[1]),
      x0 = Math.min(...xs) - 10,
      x1 = Math.max(...xs) + 10,
      z0 = Math.min(...zs) - 10,
      z1 = Math.max(...zs) + 10,
      kind = e.surface === 'dirt' ? 'sand' : 'concrete';
    // Split at tile boundaries, independent of event size.
    for (let x = x0; x < x1;) {
      const xx = Math.min(x1, (Math.floor(x / 256) + 1) * 256);
      for (let z = z0; z < z1;) {
        const zz = Math.min(z1, (Math.floor(z / 256) + 1) * 256);
        quad(kind, [x, 0.016, z], [x, 0.016, zz], [xx, 0.016, zz], [xx, 0.016, z]);
        z = zz;
      }
      x = xx;
    }
  }
  group = 'links';
  for (const {
    points: [a, b]
  } of WORLD_LINKS) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz),
      nx = (-dz / len) * 3,
      nz = (dx / len) * 3;
    const n = Math.ceil(len / 64);
    for (let i = 0; i < n; i++) {
      const p = [a[0] + (dx * i) / n, a[1] + (dz * i) / n],
        q = [a[0] + (dx * (i + 1)) / n, a[1] + (dz * (i + 1)) / n];
      quad(
        'asphalt',
        [p[0] + nx, 0.026, p[1] + nz],
        [q[0] + nx, 0.026, q[1] + nz],
        [q[0] - nx, 0.026, q[1] - nz],
        [p[0] - nx, 0.026, p[1] - nz]
      );
    }
  }
  for (const {kind, p, uv} of buckets.values()) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new T.Mesh(g, material(kind));
    m.receiveShadow = true;
    root.add(m);
  }
  scene.add(root);
  return {
    root,
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      for (const m of materials.values()) m.dispose();
      for (const t of maps.values()) t.dispose();
    }
  };
}
