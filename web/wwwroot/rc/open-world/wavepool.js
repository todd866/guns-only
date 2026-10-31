import * as T from '../../vendor/three.module.js';
import {addBox} from '../physics/world.mjs';
import {WAVEPOOL_BEACH, WAVEPOOL_SURFACES} from './wavepool-course.mjs';
import {addWorldUv, attachSurfaceDetails} from './surface-detail.js';
import {createWaterSurface} from './water-surface.js';
import {WATER_BODIES, WATER, basinTriangles} from '../physics/water.mjs';

const route = WAVEPOOL_BEACH.route;

// Sunrise Splash is intentionally a small authored set piece rather than another streamed
// building. One factory owns all meshes, animation, and solid features so the runtime can
// attach it once and drop it cleanly with the open world.
export function buildWavepoolBeach(scene, world) {
  const root = new T.Group();
  root.name = 'SunriseSplash_WavepoolBeach';
  const materials = new Map();
  const mat = (key, color, options = {}) => {
    if (!materials.has(key))
      materials.set(
        key,
        new T.MeshStandardMaterial({
          color,
          roughness: 0.78,
          ...options
        })
      );
    return materials.get(key);
  };
  const water = mat('water', '#2fb7cc', {roughness: 0.28, metalness: 0.08, transparent: true, opacity: 0.82});
  const foam = mat('foam', '#e8fcf5', {
    roughness: 0.35,
    transparent: true,
    opacity: 0.76,
    emissive: '#5bd8df',
    emissiveIntensity: 0.12
  });
  const sand = mat('sand', '#d8b477');
  const routeMat = mat('route', '#c7834e', {roughness: 0.9});
  const rock = mat('rock', '#82725f', {roughness: 0.98});
  const rockLight = mat('rockLight', '#b38b68', {roughness: 0.95});
  const slideMats = [
    mat('slideOrange', '#ec7d3d'),
    mat('slideBlue', '#37a8c5'),
    mat('slideYellow', '#f2c34f')
  ];
  const wood = mat('wood', '#9a5c38');
  const palmGreen = mat('palmGreen', '#347c56');
  const trim = mat('trim', '#fff0b2', {emissive: '#fff0b2', emissiveIntensity: 0.12});
  // Lines do not have surface normals; never share a MeshStandardMaterial with a LineLoop.
  // The old shared foam material produced invalid GPU lighting on the beach and blacked out
  // the entire WebGL frame on the Apple renderer.
  const foamLine = new T.LineBasicMaterial({color: '#e8fcf5', transparent: true, opacity: 0.72});
  const surfaceDetails = attachSurfaceDetails({sand, water});

  const meshes = [];
  const addMesh = (geometry, material, position = null, name = '') => {
    const mesh = new T.Mesh(geometry, material);
    if (position) mesh.position.set(...position);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const quad = (a, b, c, d, material, name = '') => {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    g.computeVertexNormals();
    return addMesh(g, material, null, name);
  };
  const ribbon = (points, width, y, material, name = '') => {
    const verts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz) || 1;
      const nx = ((-dz / len) * width) / 2,
        nz = ((dx / len) * width) / 2;
      verts.push(
        a[0] + nx,
        y,
        a[1] + nz,
        b[0] + nx,
        y,
        b[1] + nz,
        b[0] - nx,
        y,
        b[1] - nz,
        a[0] + nx,
        y,
        a[1] + nz,
        b[0] - nx,
        y,
        b[1] - nz,
        a[0] - nx,
        y,
        a[1] - nz
      );
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    addWorldUv(g);
    g.computeVertexNormals();
    return addMesh(g, material, null, name);
  };
  const rampedRibbon = (points, width, material, name = '') => {
    const verts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz) || 1;
      const nx = ((-dz / len) * width) / 2,
        nz = ((dx / len) * width) / 2;
      verts.push(
        a[0] + nx,
        a[2],
        a[1] + nz,
        b[0] + nx,
        b[2],
        b[1] + nz,
        b[0] - nx,
        b[2],
        b[1] - nz,
        a[0] + nx,
        a[2],
        a[1] + nz,
        b[0] - nx,
        b[2],
        b[1] - nz,
        a[0] - nx,
        a[2],
        a[1] - nz
      );
      // The visible wet-sand cut and collision share their continuous ground profile.
      const cy = 0.025;
      world.addQuad(
        [a[0] + nx, cy, a[1] + nz],
        [b[0] + nx, cy, b[1] + nz],
        [b[0] - nx, cy, b[1] - nz],
        [a[0] - nx, cy, a[1] - nz],
        WAVEPOOL_SURFACES.sand
      );
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    addWorldUv(g);
    g.computeVertexNormals();
    return addMesh(g, material, null, name);
  };

  // Broad pool and a dry route collar make the intended line readable from the air and from
  // the RC camera. The old event route remains the authoritative checkpoint path.
  // A real pool: a beach-entry basin under a swelling surface the cars float on (physics/water.mjs).
  const body = WATER_BODIES.find(b => b.id === 'wavepool'),
    [bx0, bz0, bx1, bz1] = body.rect;
  const basinGeo = new T.BufferGeometry();
  basinGeo.setAttribute('position', new T.Float32BufferAttribute(basinTriangles(body, 4).flat(2), 3));
  basinGeo.computeVertexNormals();
  addMesh(basinGeo, mat('basin', '#d9c9a0', {roughness: 0.9}), null, 'WavepoolBasin');
  const swell = createWaterSurface({
    size: [bx1 - bx0, bz1 - bz0],
    segments: [Math.round((bx1 - bx0) * 0.6), Math.round((bz1 - bz0) * 0.6)],
    position: [(bx0 + bx1) / 2, body.level, (bz0 + bz1) / 2],
    swell: body.swell
  });
  swell.mesh.name = 'WavepoolWater';
  root.add(swell.mesh);
  meshes.push(swell.mesh);
  const sandSurface = new T.BoxGeometry(118, 0.12, 78);
  addWorldUv(sandSurface);
  addMesh(sandSurface, sand, [-545, -0.03, 3365], 'WavepoolSandCollar');
  ribbon(route, 6.2, 0.1, routeMat, 'WavepoolRouteRibbon');

  // Sandbar shortcut: a continuous, shallow ramp that cuts only the first hairpin and
  // rejoins the next checkpoint. The deck sits above the water, with no isolated step boxes.
  rampedRibbon(WAVEPOOL_BEACH.sandbarShortcut, 2.8, sand, 'WavepoolSandbarShortcut');

  // Animated foam rings at the two wave wash points. The rings remain subtle when paused and
  // read as water motion in the low camera without particle spam.
  const waves = [];
  for (let i = 0; i < 7; i++) {
    const g = new T.RingGeometry(1.2, 1.38, 20);
    const w = addMesh(g, foam, [-595 + i * 16, 0.1, 3360 + (i % 2) * 8], `WaveFoam_${i}`);
    w.rotation.x = -Math.PI / 2;
    waves.push({mesh: w, phase: i * 0.85});
  }
  const waterline = new T.LineLoop(new T.BufferGeometry(), foamLine); // reusable oval foam edge
  const edge = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    edge.push(-545 + 52 * Math.cos(a), 0.13, 3365 + 32 * Math.sin(a));
  }
  waterline.geometry.setAttribute('position', new T.Float32BufferAttribute(edge, 3));
  waterline.name = 'WavepoolFoamEdge';
  root.add(waterline);
  meshes.push(waterline);

  // Rock tunnel, shaped as a chunky arch with a clear 3.5 m opening. The tunnel wall is
  // collision-solid at the shoulders while the roof remains high enough for every body.
  const [tx, tz] = WAVEPOOL_BEACH.landmarks.rockTunnel;
  for (const side of [-1, 1]) {
    const b = addMesh(
      new T.DodecahedronGeometry(3.1, 1),
      side < 0 ? rockLight : rock,
      [tx + side * 4.1, 2.0, tz],
      `RockTunnelShoulder_${side}`
    );
    b.scale.set(1.15, 1.45, 1.7);
    addBox(world, tx + side * 4.1, tz, 2.8, 5.0, 0, 3.6, 'rock');
  }
  const arch = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (i / 8);
    const x = tx + Math.cos(a) * 4.1,
      y = 4.0 + Math.sin(a) * 2.1;
    const m = addMesh(
      new T.DodecahedronGeometry(1.65, 1),
      i % 2 ? rock : rockLight,
      [x, y, tz],
      `RockTunnelArch_${i}`
    );
    m.scale.set(1.35, 0.9, 1.55);
  }
  // Direction chevrons are visual only; the route remains open through the arch.
  for (const side of [-1, 1]) {
    const g = new T.BoxGeometry(0.18, 1.15, 0.12);
    const c = addMesh(g, trim, [tx + side * 3.1, 1.35, tz - 2.55], `TunnelChevron_${side}`);
    c.rotation.y = side * 0.5;
  }

  // Three elevated water slides in the backdrop, built as short coloured tubes with supports.
  // They establish the water-park silhouette without stealing the driving lane.
  const [sx, sz] = WAVEPOOL_BEACH.landmarks.slides;
  for (let i = 0; i < 3; i++) {
    const x = sx + (i - 1) * 8,
      h = 9 + i * 1.5;
    const tube = addMesh(
      new T.CylinderGeometry(1.35, 1.35, 18, 14, 1, true),
      slideMats[i],
      [x, h / 2, sz],
      `WaterSlide_${i}`
    );
    tube.rotation.x = Math.PI / 2;
    tube.rotation.z = (i - 1) * 0.17;
    addMesh(new T.CylinderGeometry(0.18, 0.22, h, 8), wood, [x - 2.3, h / 2, sz + 2.6], `SlideSupport_${i}`);
    addMesh(
      new T.CylinderGeometry(0.18, 0.22, h, 8),
      wood,
      [x + 2.3, h / 2, sz + 2.6],
      `SlideSupport_${i}_b`
    );
  }
  // Lifeguard tower and striped umbrellas make the beach legible at route scale.
  const [lx, lz] = WAVEPOOL_BEACH.landmarks.lifeguardTower;
  addMesh(new T.BoxGeometry(4.4, 5.2, 3.6), wood, [lx, 2.6, lz], 'LifeguardTower');
  addMesh(new T.BoxGeometry(6.4, 0.25, 5.6), trim, [lx, 5.35, lz], 'LifeguardTowerRoof');
  for (const dx of [-9, 9]) {
    addMesh(new T.CylinderGeometry(0.11, 0.14, 3.2, 8), wood, [lx + dx, 1.6, lz - 4], 'BeachUmbrellaPole');
    addMesh(
      new T.ConeGeometry(2.2, 1.2, 12),
      slideMats[(dx + 9) / 18],
      [lx + dx, 3.2, lz - 4],
      'BeachUmbrella'
    );
  }

  // Instanced palms keep the silhouette lively without adding dozens of draw calls.
  const palmPositions = [
    [-612, 3412],
    [-594, 3418],
    [-558, 3420],
    [-525, 3422],
    [-480, 3415],
    [-482, 3320]
  ];
  const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.24, 0.34, 4.4, 8), wood, palmPositions.length);
  const crown = new T.InstancedMesh(new T.ConeGeometry(1.55, 2.4, 8), palmGreen, palmPositions.length);
  const matrix = new T.Matrix4();
  palmPositions.forEach(([x, z], i) => {
    matrix.makeTranslation(x, 2.2, z);
    trunk.setMatrixAt(i, matrix);
    matrix.makeTranslation(x, 4.9, z);
    crown.setMatrixAt(i, matrix);
  });
  trunk.instanceMatrix.needsUpdate = true;
  crown.instanceMatrix.needsUpdate = true;
  trunk.name = 'WavepoolPalmTrunks';
  crown.name = 'WavepoolPalmCrowns';
  root.add(trunk, crown);
  meshes.push(trunk, crown);

  root.updateMatrixWorld(true);
  scene.add(root);
  return {
    root,
    course: WAVEPOOL_BEACH,
    update(time = 0) {
      swell.update(WATER.time); // the physics clock: cars ride the waves the player sees
      for (const wave of waves) {
        const pulse = 0.86 + Math.sin(time * 2.1 + wave.phase) * 0.18;
        wave.mesh.scale.set(pulse, pulse, pulse);
        wave.mesh.material.opacity = 0.56 + (pulse - 0.86) * 0.5;
      }
      waterline.material.opacity = 0.66 + Math.sin(time * 1.2) * 0.08;
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
      });
      foamLine.dispose();
      swell.dispose();
      surfaceDetails.dispose();
      for (const material of materials.values()) material.dispose();
    }
  };
}
