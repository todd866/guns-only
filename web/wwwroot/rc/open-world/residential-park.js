import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {parkPoint} from './residential-frame.mjs';

// Context around the small neighbourhood skatepark.  The skate GLB owns the
// concrete riding surface; this layer owns the civic edge around it.  Points
// are anonymous park-local metres so the reference location never enters the
// public game data.
export function prepareResidentialPark(world, data = {}, options = {}) {
  const sceneTerrain = options.terrain;
  const heightAt = sceneTerrain?.heightAt ?? (() => 0);
  const buckets = new Map();
  const materials = new Map();
  let root = null;
  const colours = {
    court: '#5b6570',
    courtLine: '#e7c57c',
    path: '#b8b2a3',
    grass: '#6b8d4c',
    metal: '#3b4544',
    wood: '#a9784d',
    trim: '#f0d79a'
  };
  const COURT_CENTER = [30.9, 33.4];
  const COURT_YAW = 0.274;
  const courtC = Math.cos(COURT_YAW),
    courtS = Math.sin(COURT_YAW);
  // Calibrated from the expanded official aerial against the existing traced
  // skatepad origin. These remain anonymous game-space metres.
  const courtPoint = (u, v) => [
    COURT_CENTER[0] + u * courtC + v * courtS,
    COURT_CENTER[1] - u * courtS + v * courtC
  ];
  // localBox's +x axis uses the conventional counter-clockwise XZ yaw, while
  // the calibrated court frame maps +u to (cos(yaw), -sin(yaw)).
  const courtYaw = yaw => yaw - COURT_YAW;
  const material = key => {
    if (!materials.has(key))
      materials.set(
        key,
        new T.MeshStandardMaterial({
          color: colours[key],
          roughness: key === 'metal' ? 0.62 : 0.9,
          metalness: key === 'metal' ? 0.42 : 0
        })
      );
    return materials.get(key);
  };
  const addGeometry = (key, geometry) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(geometry);
  };
  const wp = (x, z, y = 0) => {
    const p = parkPoint([x, y, z]);
    // Park-local y is an offset from the surrounding terrain.  The concrete
    // GLB has its own level datum; context furniture follows the real grade.
    p[1] += heightAt(p[0], p[2]);
    return p;
  };
  // Surface vertices must remain authored offsets: conformTriangle adds the
  // exact residential grade once. Do not pass terrain-adjusted vertices to it.
  const sp = (x, z, y = 0) => parkPoint([x, y, z]);
  const conform = (a, b, c) =>
    sceneTerrain?.conformTriangle
      ? sceneTerrain.conformTriangle(a, b, c)
      : [
          [
            [a[0], a[1] + heightAt(a[0], a[2]), a[2]],
            [b[0], b[1] + heightAt(b[0], b[2]), b[2]],
            [c[0], c[1] + heightAt(c[0], c[2]), c[2]]
          ]
        ];
  const addSurfaceTri = (key, a, b, c, collision = false) => {
    for (const tri of conform(a, b, c)) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(tri.flat(), 3));
      g.computeVertexNormals();
      addGeometry(key, g);
      if (collision && world?.addTri) world.addTri(...tri, key);
    }
  };
  const quad = (key, a, b, c, d, collision = false) => {
    addSurfaceTri(key, a, b, c, collision);
    addSurfaceTri(key, a, c, d, collision);
  };
  const localQuad = (key, points, y = 0.02, collision = false) => {
    const [a, b, c, d] = points.map(([x, z]) => sp(x, z, y));
    quad(key, a, b, c, d, collision);
  };
  const ribbon = (key, a, b, width, y = 0.03, collision = true) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length < 0.1) return;
    const nx = ((-dz / length) * width) / 2,
      nz = ((dx / length) * width) / 2;
    localQuad(
      key,
      [
        [a[0] + nx, a[1] + nz],
        [b[0] + nx, b[1] + nz],
        [b[0] - nx, b[1] - nz],
        [a[0] - nx, a[1] - nz]
      ],
      y,
      collision
    );
  };
  const localBox = (key, center, size, yaw = 0, bottom = 0, collision = false) => {
    const [w, h, d] = size,
      [x, z] = center,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const corners = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2]
    ].map(([u, v]) => [x + u * c - v * s, z + u * s + v * c]);
    const base = corners.map(([px, pz]) => wp(px, pz, bottom));
    const top = corners.map(([px, pz]) => wp(px, pz, bottom + h));
    const positions = [];
    const faces = [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [2, 6, 7, 3],
      [3, 7, 4, 0]
    ];
    for (const face of faces) {
      const q = face.map(i => (i < 4 ? base[i] : top[i - 4]));
      positions.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
      if (collision && world?.addTri) {
        world.addTri(q[0], q[1], q[2], key);
        world.addTri(q[0], q[2], q[3], key);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    addGeometry(key, g);
  };
  const localCylinder = (key, center, radius, height, radial = 10) => {
    const source = new T.CylinderGeometry(radius, radius * 1.08, height, radial);
    const g = source.toNonIndexed();
    source.dispose();
    const p = wp(center[0], center[1], 0);
    g.translate(p[0], p[1] + height / 2, p[2]);
    if (world?.addTri) {
      const attr = g.getAttribute('position');
      for (let i = 0; i < attr.count; i += 3) {
        const a = [attr.getX(i), attr.getY(i), attr.getZ(i)];
        const b = [attr.getX(i + 1), attr.getY(i + 1), attr.getZ(i + 1)];
        const c = [attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2)];
        world.addTri(a, b, c, key);
      }
    }
    addGeometry(key, g);
  };
  const localTorus = (key, center, radius, tube, y, radial = 18) => {
    const source = new T.TorusGeometry(radius, tube, 8, radial);
    const g = source.toNonIndexed();
    source.dispose();
    g.rotateX(Math.PI / 2);
    const p = wp(center[0], center[1], y);
    g.translate(p[0], p[1], p[2]);
    const attr = g.getAttribute('position');
    if (world?.addTri)
      for (let i = 0; i < attr.count; i += 3) {
        world.addTri(
          [attr.getX(i), attr.getY(i), attr.getZ(i)],
          [attr.getX(i + 1), attr.getY(i + 1), attr.getZ(i + 1)],
          [attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2)],
          key
        );
      }
    addGeometry(key, g);
  };
  const lineRect = (x, z, w, d, width = 0.08) => {
    ribbon(
      'courtLine',
      courtPoint(x - w / 2, z - d / 2),
      courtPoint(x + w / 2, z - d / 2),
      width,
      0.07,
      false
    );
    ribbon(
      'courtLine',
      courtPoint(x + w / 2, z - d / 2),
      courtPoint(x + w / 2, z + d / 2),
      width,
      0.07,
      false
    );
    ribbon(
      'courtLine',
      courtPoint(x + w / 2, z + d / 2),
      courtPoint(x - w / 2, z + d / 2),
      width,
      0.07,
      false
    );
    ribbon(
      'courtLine',
      courtPoint(x - w / 2, z + d / 2),
      courtPoint(x - w / 2, z - d / 2),
      width,
      0.07,
      false
    );
  };
  const arcLine = (x, z, radius, start, end, width = 0.09) => {
    const steps = Math.max(8, Math.ceil((Math.abs(end - start) * radius) / 0.45));
    for (let i = 0; i < steps; i++) {
      const a = start + ((end - start) * i) / steps;
      const b = start + ((end - start) * (i + 1)) / steps;
      ribbon(
        'courtLine',
        courtPoint(x + Math.cos(a) * radius, z + Math.sin(a) * radius),
        courtPoint(x + Math.cos(b) * radius, z + Math.sin(b) * radius),
        width,
        0.075,
        false
      );
    }
  };
  const addCourt = () => {
    // The adjacent court is the lower-right feature in the expanded aerial.
    // Its centre, dimensions, and bearing are digitised into anonymous local
    // metres; no source imagery or real-world identifiers enter the game data.
    const x = 0,
      z = 0,
      w = 17,
      d = 26;
    // A narrow apron separates the painted court from irrigated turf and gives
    // the adjacent public path a believable hard edge without another road
    // ribbon laid over the already-authored triangular path network.
    localQuad(
      'path',
      [
        courtPoint(x - w / 2 - 1, z - d / 2 - 1),
        courtPoint(x + w / 2 + 1, z - d / 2 - 1),
        courtPoint(x + w / 2 + 1, z + d / 2 + 1),
        courtPoint(x - w / 2 - 1, z + d / 2 + 1)
      ],
      0.018,
      true
    );
    localQuad(
      'court',
      [
        courtPoint(x - w / 2, z - d / 2),
        courtPoint(x + w / 2, z - d / 2),
        courtPoint(x + w / 2, z + d / 2),
        courtPoint(x - w / 2, z + d / 2)
      ],
      0.025,
      true
    );
    lineRect(x, z, w - 0.45, d - 0.45, 0.11);
    ribbon('courtLine', courtPoint(x - w / 2 + 0.4, z), courtPoint(x + w / 2 - 0.4, z), 0.1, 0.075, false);
    // Original simplified key/arc markings keep the court readable at RC eye level.
    // Real court language: centre circle, end keys, and a rounded three-point
    // arc at each basket. The lines are intentionally simple at RC distance,
    // but preserve the recognisable geometry visible in the aerial reference.
    arcLine(x, z, 2.15, 0, Math.PI * 2, 0.1);
    for (const end of [-1, 1]) {
      const hoopLocal = [x, z + end * (d / 2 - 1.1)],
        hoopZ = hoopLocal[1];
      lineRect(x, z + end * (d / 2 - 3.1), 3.65, 4.35, 0.1);
      const facing = end < 0 ? Math.PI / 2 : -Math.PI / 2;
      arcLine(x, hoopZ, 5.55, facing - 1.05, facing + 1.05, 0.1);
      localCylinder('metal', courtPoint(...hoopLocal), 0.075, 3.05, 8);
      // Backboard and rim sit at RC-readable human scale; both are solid so
      // an errant car cannot pass through the post assembly.
      localBox('trim', courtPoint(x, hoopZ + end * 0.44), [1.55, 0.9, 0.08], courtYaw(0), 2.9, true);
      localTorus('trim', courtPoint(x, hoopZ + end * 0.03), 0.23, 0.035, 3.05);
    }
  };
  const addEntries = () => {
    // The mapped residential data already supplies the three triangular
    // approaches. Keep this hook for future data-driven curb cuts, but do not
    // redraw those paths on top of themselves.
    if (!Array.isArray(data.roads) || !data.roads.some(r => r.kind === 'path' || r.kind === 'footway')) {
      ribbon('path', [-26, -17], [-18, -10], 2.8, 0.035);
    }
  };
  const addBenches = () => {
    // Small park furniture on the approach paths; the GLB's eastern benches
    // remain untouched, so this does not duplicate its shoulder row.
    for (const [u, v, yaw] of [
      [10, -8, 0.2],
      [10, 8, -0.35],
      [-9, 15, Math.PI / 2]
    ]) {
      const [x, z] = courtPoint(u, v),
        cy = courtYaw(yaw);
      localBox('wood', [x, z], [2.1, 0.12, 0.38], cy, 0.45, true);
      for (const side of [-0.7, 0.7])
        localBox(
          'metal',
          [x + Math.cos(cy) * side, z + Math.sin(cy) * side],
          [0.08, 0.45, 0.08],
          cy,
          0,
          true
        );
    }
  };
  let built = false;
  const build = () => {
    if (built) return;
    addCourt();
    addEntries();
    addBenches();
    built = true;
  };
  const attach = scene => {
    if (!scene?.add) throw new TypeError('prepareResidentialPark.attach requires a scene');
    if (root) return root;
    build();
    root = new T.Group();
    root.name = 'ResidentialParkContext';
    for (const [key, parts] of buckets) {
      if (!parts.length) continue;
      // Cylinders carry UVs/normals while the conforming surfaces do not;
      // normalise the small batches before merging so the whole context stays
      // one draw per material and remains compatible with Three's merger.
      const normalized = parts.map(part => {
        const g = part.index ? part.toNonIndexed() : part.clone();
        for (const name of ['normal', 'uv', 'uv1', 'color']) g.deleteAttribute(name);
        return g;
      });
      const geometry = mergeGeometries(normalized, false);
      normalized.forEach(part => part.dispose());
      parts.forEach(part => part.dispose());
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new T.Mesh(geometry, material(key));
      mesh.name = `ResidentialPark_${key}`;
      mesh.castShadow = mesh.receiveShadow = key !== 'courtLine';
      root.add(mesh);
    }
    scene.add(root);
    return root;
  };
  const dispose = () => {
    root?.removeFromParent();
    root?.traverse(o => o.geometry?.dispose());
    for (const parts of buckets.values()) for (const part of parts) part.dispose();
    for (const m of materials.values()) m.dispose();
    root = null;
    buckets.clear();
    materials.clear();
  };
  // Build collision geometry immediately, alongside the other residential
  // preparation modules, so the world's spatial index sees the court and
  // furniture before the first streamed frame.
  build();
  return {attach, dispose};
}
