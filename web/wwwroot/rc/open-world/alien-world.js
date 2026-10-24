import * as T from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { ALIEN_EVENTS, ALIEN_LOCATIONS } from './alien-world.mjs';

export function createAlienWorld(scene, world) {
  if (!scene?.add) throw new TypeError('createAlienWorld requires a scene');
  const root = new T.Group(); root.name = 'AlienWorld'; scene.add(root);
  const materials = new Map(), dynamic = [];
  const mat = (color, roughness = .72, metalness = 0) => {
    const key = `${color}:${roughness}:${metalness}`;
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness, metalness }));
    return materials.get(key);
  };
  const mesh = (parent, geometry, color, position = [0, 0, 0], options = {}) => {
    const m = new T.Mesh(geometry, mat(color, options.roughness ?? .72, options.metalness ?? 0));
    m.position.set(...position); parent.add(m); return m;
  };
  const box = (parent, x, y, z, w, h, d, color, solid = false) => {
    const m = mesh(parent, new T.BoxGeometry(w, h, d), color, [x, y, z]);
    if (solid && world?.addTri) addBoxCollision(x, z, w, d, y - h / 2, y + h / 2, 'rock');
    return m;
  };
  const addBoxCollision = (x, z, w, d, minY, maxY, surface) => {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const p = (a, y, b) => [a, y, b];
    world.addQuad(p(x0, maxY, z0), p(x0, maxY, z1), p(x1, maxY, z1), p(x1, maxY, z0), surface);
    world.addQuad(p(x0, minY, z1), p(x1, minY, z1), p(x1, maxY, z1), p(x0, maxY, z1), surface);
    world.addQuad(p(x1, minY, z0), p(x0, minY, z0), p(x0, maxY, z0), p(x1, maxY, z0), surface);
    world.addQuad(p(x1, minY, z1), p(x1, minY, z0), p(x1, maxY, z0), p(x1, maxY, z1), surface);
    world.addQuad(p(x0, minY, z0), p(x0, minY, z1), p(x0, maxY, z1), p(x0, maxY, z0), surface);
  };
  const surface = (a, b, width, color = '#526579', surfaceName = 'asphalt') => {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1;
    const rx = -dz / length * width / 2, rz = dx / length * width / 2;
    const A = [a[0] - rx, a[2], a[1] - rz], B = [a[0] + rx, a[2], a[1] + rz];
    const C = [b[0] + rx, b[2], b[1] + rz], D = [b[0] - rx, b[2], b[1] - rz];
    if (world?.addQuad) world.addQuad(A, B, C, D, surfaceName);
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute([...A, ...B, ...C, ...A, ...C, ...D], 3)); geometry.computeVertexNormals();
    mesh(root, geometry, color).receiveShadow = true;
  };
  const group = name => { const g = new T.Group(); g.name = name; g.userData.dynamic = true; root.add(g); dynamic.push(g); return g; };

  // A visible, drivable hub and three approach roads connect the course grids.
  const hub = new T.Group(); hub.name = 'AlienGroundHub'; root.add(hub);
  box(hub, 10000, -.04, 200, 70, .08, 70, '#394e5a', false);
  addBoxCollision(10000, 200, 70, 70, -.02, .03, 'asphalt');
  for (const endpoint of [[9940, 200], [10340, 200], [10740, 200]]) surface([10000, 200, 0], [endpoint[0], endpoint[1], 0], 10, '#465f6e');

  // Lunar paddock: low, fast bends framed by luminous crystals and crater banks.
  const lunar = new T.Group(); lunar.name = 'AlienCourse_lunar-paddock'; root.add(lunar);
  for (const [x, z, r, h] of [[9910, 120, 5, 3], [10095, 145, 4, 2.5], [10080, 270, 6, 3.5], [9925, 285, 4, 2.8]]) {
    mesh(lunar, new T.ConeGeometry(r, h, 7), '#a6d9e8', [x, h / 2, z], { metalness: .2 });
    mesh(lunar, new T.ConeGeometry(r * 1.5, .8, 10), '#554d63', [x, .4, z]);
  }
  for (const [x, z, r] of [[9950, 90, 10], [10065, 110, 8], [10100, 290, 9]]) mesh(lunar, new T.TorusGeometry(r, 1.2, 6, 20), '#675a68', [x, .18, z]);

  // Comet quarry: a climbing loop with broad, continuous ramps and safe rock shelves.
  const quarry = new T.Group(); quarry.name = 'AlienCourse_comet-quarry'; root.add(quarry);
  for (const [x, z, r, h] of [[10305, 115, 8, 3], [10485, 120, 7, 4], [10510, 285, 9, 5], [10300, 290, 6, 2.5]]) {
    mesh(quarry, new T.DodecahedronGeometry(r, 1), '#b67c62', [x, h * .5, z]);
    mesh(quarry, new T.ConeGeometry(r * 1.4, 1.2, 8), '#5b4a52', [x, .6, z]);
  }
  for (const [x, z] of [[10355, 155], [10465, 245], [10350, 270]]) box(quarry, x, 1.2, z, 8, 2.4, 5, '#786072', false);

  // Gravity garden: the road rises through a planted alien canopy; floating rocks remain
  // decorative and are kept away from the authored road at their own heights.
  const garden = new T.Group(); garden.name = 'AlienCourse_gravity-garden'; root.add(garden);
  for (const [x, z, y, r] of [[10700, 100, 3, 7], [10895, 120, 7, 8], [10910, 300, 12, 6], [10700, 310, 16, 7]]) {
    const rock = mesh(garden, new T.DodecahedronGeometry(r, 1), '#6f78a8', [x, y, z], { metalness: .15 }); rock.userData.decorative = true;
  }
  for (const [x, z, h] of [[10700, 180, 4], [10910, 200, 8], [10890, 300, 14]]) {
    mesh(garden, new T.CylinderGeometry(1.2, 2.4, h, 8), '#4b8c78', [x, h / 2, z]);
    mesh(garden, new T.SphereGeometry(3, 10, 6), '#9adf9b', [x, h + 2, z]);
  }

  for (const event of ALIEN_EVENTS) {
    // Extend the start lane behind the first checkpoint so all four wheels spawn on
    // authored ground instead of straddling the open end of the loop.
    const first = event.points[0], next = event.points[1], length = Math.hypot(next[0] - first[0], next[1] - first[1]) || 1;
    surface([first[0] - (next[0] - first[0]) / length * 3, first[1] - (next[1] - first[1]) / length * 3, first[2]], first, event.half * 2, event.id === 'gravity-garden' ? '#668a82' : event.id === 'comet-quarry' ? '#806a6d' : '#566b80');
    for (let i = 1; i < event.points.length; i++) surface(event.points[i - 1], event.points[i], event.half * 2, event.id === 'gravity-garden' ? '#668a82' : event.id === 'comet-quarry' ? '#806a6d' : '#566b80');
  }

  // Merge only static meshes; dynamic decorative rocks can be animated independently later.
  root.updateMatrixWorld(true);
  const buckets = new Map(), staticMeshes = [];
  root.traverse(o => { if (o.isMesh && !o.userData.dynamic && !o.parent?.userData.dynamic) staticMeshes.push(o); });
  for (const object of staticMeshes) {
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld); const key = object.material.color.getHexString();
    const flat = geometry.index ? geometry.toNonIndexed() : geometry; if (flat !== geometry) geometry.dispose();
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(flat); object.removeFromParent(); object.geometry.dispose();
  }
  for (const [key, geometries] of buckets) { const geometry = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose()); const combined = new T.Mesh(geometry, mat(`#${key}`)); combined.name = `AlienStatic_${key}`; combined.castShadow = combined.receiveShadow = true; root.add(combined); }

  const update = (time = 0) => {
    const t = Number(time) || 0;
    garden.rotation.y = Math.sin(t * .08) * .015;
  };
  const dispose = () => { root.removeFromParent(); root.traverse(o => { o.geometry?.dispose(); if (o.material) o.material.dispose(); }); materials.clear(); };
  return { root, locations: ALIEN_LOCATIONS, events: ALIEN_EVENTS, update, dispose };
}
