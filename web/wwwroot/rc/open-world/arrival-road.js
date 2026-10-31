import * as T from '../../vendor/three.module.js';
import {createSurfaceMaps} from './materials.js';

// A textured gate approach connects the forecourt to the existing base road.
// Surfaces sit just above the flat authored apron, without changing driving physics.
export function buildArrivalRoad(scene) {
  const root = new T.Group();
  root.name = 'GateApproach';
  const textures = createSurfaceMaps('asphalt'),
    materials = [];
  const asphalt = new T.MeshStandardMaterial({
    color: '#ffffff',
    map: textures.map,
    roughnessMap: textures.roughnessMap,
    normalMap: textures.normalMap,
    normalScale: new T.Vector2(0.025, 0.025),
    roughness: 0.94
  });
  materials.push(asphalt);
  const paint = new T.MeshStandardMaterial({color: '#e9d9b3', roughness: 0.9}),
    yellow = new T.MeshStandardMaterial({color: '#edbc45', roughness: 0.9});
  materials.push(paint, yellow);
  const strip = (a, b, width, y, material) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz),
      nx = ((-dz / len) * width) / 2,
      nz = ((dx / len) * width) / 2;
    const points = [
      [a[0] - nx, y, a[1] - nz],
      [a[0] + nx, y, a[1] + nz],
      [b[0] + nx, y, b[1] + nz],
      [b[0] - nx, y, b[1] - nz]
    ];
    const g = new T.BufferGeometry(),
      v = [...points[0], ...points[1], ...points[2], ...points[0], ...points[2], ...points[3]];
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    g.setAttribute(
      'uv',
      new T.Float32BufferAttribute(
        v.flatMap((_, i) => (i % 3 === 0 ? [v[i] * 1.2, v[i + 2] * 1.2] : [])),
        2
      )
    );
    g.computeVertexNormals();
    // Road faces are horizontal; explicit upward winding also works for southbound segments.
    if (g.attributes.normal.getY(0) < 0) {
      const p = g.attributes.position,
        u = g.attributes.uv;
      for (let i = 0; i < p.count; i += 3) {
        const a = new T.Vector3().fromBufferAttribute(p, i + 1),
          uv = new T.Vector2().fromBufferAttribute(u, i + 1);
        p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
        u.setXY(i + 1, u.getX(i + 2), u.getY(i + 2));
        p.setXYZ(i + 2, ...a.toArray());
        u.setXY(i + 2, ...uv.toArray());
      }
      g.computeVertexNormals();
    }
    const mesh = new T.Mesh(g, material);
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  const segments = [
    [
      [-641.1, -3.9],
      [-572.9, -53.5]
    ],
    [
      [-572.9, -53.5],
      [-561.6, -39.8]
    ]
  ];
  for (const [a, b] of segments) {
    strip(a, b, 10, 0.03, asphalt);
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz),
      nx = -dz / len,
      nz = dx / len;
    for (const side of [-1, 1])
      strip(
        [a[0] + nx * 4.6 * side, a[1] + nz * 4.6 * side],
        [b[0] + nx * 4.6 * side, b[1] + nz * 4.6 * side],
        0.12,
        0.035,
        paint
      );
    for (let d = 1; d < len - 3; d += 6)
      strip(
        [a[0] + (dx * d) / len, a[1] + (dz * d) / len],
        [a[0] + (dx * (d + 2.8)) / len, a[1] + (dz * (d + 2.8)) / len],
        0.12,
        0.037,
        yellow
      );
  }
  scene.add(root);
  return {
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      materials.forEach(m => m.dispose());
      textures.dispose();
    }
  };
}
