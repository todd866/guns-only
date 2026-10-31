import * as T from '../../vendor/three.module.js';
import {fenceSegments} from './fences.mjs';
export function buildFences(scene, world, roads = [], options = {}) {
  const segs = fenceSegments({roads, ...options}),
    v = [],
    h = 1.5;
  for (const s of segs) {
    const [x, z] = s.a,
      [q, w] = s.b,
      dx = q - x,
      dz = w - z,
      L = Math.hypot(dx, dz),
      nx = (-dz / L) * 0.025,
      nz = (dx / L) * 0.025;
    v.push(
      x,
      0,
      z,
      q,
      0,
      w,
      x,
      h,
      z,
      q,
      h,
      w,
      x - nx,
      0.75,
      z - nz,
      q - nx,
      0.75,
      w - nz,
      x + nx,
      0.75,
      z + nz,
      q + nx,
      0.75,
      w + nz
    );
    const count = Math.ceil(L / 3);
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        px = x + dx * t,
        pz = z + dz * t;
      v.push(px, 0, pz, px, h, pz);
      if (i < count) {
        const u = (i + 1) / count;
        v.push(px, 0, pz, x + dx * u, h, z + dz * u, px, h, pz, x + dx * u, 0, z + dz * u);
      }
    }
    const a = [x, 0, z],
      b = [q, 0, w],
      c = [q, h, w],
      d = [x, h, z];
    world.addQuad(a, b, c, d, 'metal');
    world.addQuad(d, c, b, a, 'metal');
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(v, 3));
  const mat = new T.LineBasicMaterial({color: '#88958b'}),
    mesh = new T.LineSegments(geo, mat);
  mesh.name = 'PublicFences';
  scene.add(mesh);
  return {
    segments: segs,
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    }
  };
}
