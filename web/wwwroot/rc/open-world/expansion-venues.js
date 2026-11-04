import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';
import {VENUE_LOCATIONS, VENUE_EVENTS} from './expansion-venues.mjs';

// Five physical MK64 counterparts. Static props are batched by material; moving train
// and resurfacer are cosmetic and deliberately carry truthful userData labels.
export function createExpansionVenues(scene, world) {
  if (!scene?.add) throw new TypeError('createExpansionVenues requires a scene');
  const root = new T.Group();
  root.name = 'ExpansionVenues';
  scene.add(root);
  const dynamic = [];
  const mats = new Map();
  const material = (color, roughness = 0.78, metalness = 0) => {
    const key = `${color}:${roughness}:${metalness}`;
    if (!mats.has(key)) mats.set(key, new T.MeshStandardMaterial({color, roughness, metalness}));
    return mats.get(key);
  };
  const box = (parent, x, y, z, w, h, d, color, solid = false) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), material(color));
    m.position.set(x, y, z);
    parent.add(m);
    if (solid && world?.addTri) addBox(world, x, z, w, d, y - h / 2, y + h / 2, 'wood');
    return m;
  };
  const cyl = (parent, x, y, z, r, h, color, radial = 10) => {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, h, radial), material(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const cone = (parent, x, y, z, r, h, color, radial = 8) => {
    const m = new T.Mesh(new T.ConeGeometry(r, h, radial), material(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const patch = (parent, x, z, radius, color, segments = 24) => {
    const m = new T.Mesh(new T.CircleGeometry(radius, segments), material(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.025, z);
    parent.add(m);
    return m;
  };
  const fence = (parent, x, z, length, alongX, color = '#806348') => {
    const rail1 = box(parent, x, 0.65, z, alongX ? length : 0.12, 0.12, alongX ? 0.12 : length, color);
    box(parent, x, 0.3, z, alongX ? length : 0.12, 0.12, alongX ? 0.12 : length, color);
    const count = Math.max(2, Math.round(length / 5));
    for (let i = 0; i <= count; i++) {
      const t = -length / 2 + (length * i) / count;
      cyl(parent, x + (alongX ? t : 0), 0.55, z + (alongX ? 0 : t), 0.09, 1.1, color, 8);
    }
    return rail1;
  };
  const dynamicGroup = name => {
    const g = new T.Group();
    g.name = name;
    g.userData.dynamic = true;
    root.add(g);
    return g;
  };

  // Riding stables: open fenced paddock with two clear road gates, hay and sprinklers.
  const st = new T.Group();
  st.name = 'Venue_stables';
  root.add(st);
  patch(st, -1780, -1400, 92, '#a88159');
  box(st, -1780, 2.2, -1465, 24, 4.4, 12, '#9a714e', true);
  box(st, -1780, 4.7, -1465, 26, 1, 14, '#6f4d3b');
  fence(st, -1840, -1450, 82, true);
  fence(st, -1840, -1350, 82, true);
  fence(st, -1880, -1400, 100, false);
  fence(st, -1800, -1400, 100, false);
  // Cut wide entrances back into the loop by placing gate posts outside the lane.
  for (const x of [-1818, -1742]) {
    cyl(st, x, 0.65, -1400, 0.16, 1.3, '#e8c17e');
    box(st, x, 1.35, -1400, 0.08, 0.08, 3, '#e8c17e');
  }
  for (const [x, z] of [
    [-1818, -1422],
    [-1750, -1422],
    [-1790, -1378]
  ]) {
    box(st, x, 0.35, z, 2.2, 0.7, 1.25, '#c98a45');
    box(st, x, 1.02, z, 2.25, 0.1, 1.3, '#d59c52');
  }
  for (const [x, z] of [
    [-1830, -1410],
    [-1728, -1390],
    [-1780, -1340]
  ]) {
    cyl(st, x, 0.08, z, 0.08, 0.16, '#758f5e');
    cone(st, x, 0.18, z, 0.35, 0.24, '#8fb36a', 10);
  }

  // Rail depot: paired rails, ties and two readable crossings; train is cosmetic only.
  const rail = new T.Group();
  rail.name = 'Venue_rail';
  root.add(rail);
  patch(rail, 1950, 2180, 150, '#bb9862');
  for (const x of [1938, 1962]) {
    box(rail, x, 0.08, 2180, 0.1, 0.16, 300, '#4d5250');
    for (let z = 2040; z <= 2320; z += 8) box(rail, 1950, 0.03, z, 34, 0.08, 0.25, '#725941');
  }
  box(rail, 1875, 2, 2180, 18, 4, 14, '#a47b52', true);
  box(rail, 2025, 1.5, 2260, 16, 3, 12, '#b28a59', true);
  for (const z of [2110, 2250]) {
    for (const x of [1918, 1982]) {
      cyl(rail, x, 1.25, z, 0.08, 2.5, '#d74138');
      const lamp = new T.Mesh(new T.SphereGeometry(0.16, 10, 8), material('#ffb34f', 0.35));
      lamp.position.set(x, 2.5, z);
      rail.add(lamp);
    }
  }
  const train = dynamicGroup('SupplyTrain_cosmetic');
  train.userData.role = 'cosmetic moving train; rails remain drivable';
  box(train, 0, 0.7, 0, 5, 1.2, 8, '#b54b3c');
  box(train, 0, 1.7, -1.6, 4.2, 1.4, 2.8, '#d36c46');
  for (const z of [-2.6, 2.6])
    for (const x of [-1.7, 1.7]) cyl(train, x, 0.35, z, 0.38, 0.2, '#29383b', 12).rotation.z = Math.PI / 2;
  train.visible = false;

  // Cold lab: hangar shell, visible warm exits, blue snow floor and sculpted berms.
  const cold = new T.Group();
  cold.name = 'Venue_coldlab';
  root.add(cold);
  patch(cold, 2040, -690, 125, '#d4e8ef');
  box(cold, 2040, 5, -760, 180, 10, 10, '#718b92', true);
  box(cold, 1950, 5, -690, 10, 10, 130, '#718b92', true);
  box(cold, 2130, 5, -690, 10, 10, 130, '#718b92', true);
  box(cold, 2040, 9.5, -690, 180, 1, 130, '#8fa9ad');
  for (const x of [1970, 2040, 2110]) {
    cyl(cold, x, 7, -750, 0.28, 18, '#c8e6ef');
    cyl(cold, x + 6, 5, -750, 0.12, 18, '#72b9cc');
  }
  for (const [x, z, r] of [
    [1990, -650, 9],
    [2070, -720, 12],
    [2110, -640, 7]
  ]) {
    cone(cold, x, r * 0.28, z, r, r * 0.55, '#c8e5ed', 12);
    cone(cold, x, r * 0.6, z, r * 0.45, r * 0.35, '#b0d8e5', 10);
  }
  for (const x of [1970, 2110]) {
    box(cold, x, 2, -625, 26, 4, 1.2, '#e89b54', false);
    box(cold, x, 3.2, -625, 20, 0.2, 0.2, '#f6ce7a');
  }

  // Ice rink: oval inset, boards, rounded island geometry and a slow cosmetic resurfacer.
  const ice = new T.Group();
  ice.name = 'Venue_ice';
  root.add(ice);
  patch(ice, -1070, 1580, 90, '#c4eff8');
  const oval = new T.Mesh(new T.TorusGeometry(66, 2, 8, 40), material('#e5f7fb'));
  oval.scale.z = 0.64;
  oval.rotation.x = -Math.PI / 2;
  oval.position.set(-1070, 0.18, 1580);
  ice.add(oval);
  for (const [x, z, r] of [
    [-1070, 1580, 8],
    [-1060, 1580, 6],
    [-1080, 1580, 5]
  ]) {
    const island = new T.Mesh(new T.IcosahedronGeometry(r, 1), material('#e8fbff'));
    island.scale.y = 0.5;
    island.position.set(x, r * 0.25, z);
    ice.add(island);
  }
  box(ice, -1070, 1.8, 1645, 145, 3.6, 3, '#7ca6b1', true);
  box(ice, -1070, 1.8, 1515, 145, 3.6, 3, '#7ca6b1', true);
  const resurfacer = dynamicGroup('IceResurfacer_cosmetic');
  resurfacer.userData.role = 'cosmetic yielding maintenance bot';
  box(resurfacer, 0, 0.45, 0, 4, 0.8, 5, '#d4a94d');
  box(resurfacer, 0, 0.9, -1.2, 3, 0.5, 1.5, '#e2c977');
  resurfacer.visible = false;

  // Tropical garden: planted edges, shallow creek, boardwalk and a bridge jump.
  const trop = new T.Group();
  trop.name = 'Venue_tropical';
  root.add(trop);
  patch(trop, -640, 3060, 135, '#78a967');
  box(trop, -640, 0.08, 3060, 18, 0.12, 230, '#5ea9bd'); // shallow creek ribbon
  for (const x of [-730, -690, -590, -550]) {
    cyl(trop, x, 3.2, 2975 + (x + 730) * 0.6, 0.32, 6.4, '#866344');
    for (const dx of [-2, 2]) {
      const leaf = cone(trop, x + dx, 6, 2975 + (x + 730) * 0.6, 1.5, 4, '#4f9a5e', 6);
      leaf.rotation.z = dx * 0.08;
    }
  }
  for (const z of [2995, 3045, 3095, 3145]) {
    box(trop, -640, 0.45, z, 15, 0.2, 8, '#a77d52');
    box(trop, -650, 0.9, z, 0.12, 0.9, 8, '#856345');
    box(trop, -630, 0.9, z, 0.12, 0.9, 8, '#856345');
  }
  // Raised bridge over the creek: visible ramped deck and side rails, with a clear landing.
  box(trop, -640, 0.55, 3060, 18, 0.22, 16, '#b88b58');
  box(trop, -650, 1.05, 3060, 0.12, 1, 16, '#886344');
  box(trop, -630, 1.05, 3060, 0.12, 1, 16, '#886344');
  for (const z of [3052, 3060, 3068]) box(trop, -640, 0.7, z, 18, 0.08, 0.3, '#d3aa6b');
  if (world?.addQuad) {
    const L = -649,
      R = -631;
    world.addQuad([L, 0, 3052], [L, 0.55, 3056], [R, 0.55, 3056], [R, 0, 3052], 'wood');
    world.addQuad([L, 0.66, 3056], [L, 0.66, 3064], [R, 0.66, 3064], [R, 0.66, 3056], 'wood');
    world.addQuad([L, 0.55, 3064], [L, 0, 3068], [R, 0, 3068], [R, 0.55, 3064], 'wood');
  }
  for (const [x, z] of [
    [-700, 3005],
    [-580, 3015],
    [-700, 3120],
    [-580, 3130],
    [-640, 3170]
  ]) {
    for (let i = 0; i < 3; i++) {
      const leaf = cone(
        trop,
        x + (i - 1) * 1.3,
        1.6 + i * 0.55,
        z + (i % 2) * 1.2,
        1.15 - i * 0.15,
        2.7,
        ['#39774e', '#5ea85f', '#7cbf67'][i],
        6
      );
      leaf.rotation.z = (i - 1) * 0.24;
    }
  }

  // Merge static props by material while preserving dynamic train/resurfacer groups.
  root.updateMatrixWorld(true);
  const staticMeshes = [];
  root.traverse(o => {
    if (o.isMesh && !o.userData.dynamic && !o.parent?.userData.dynamic) staticMeshes.push(o);
  });
  const buckets = new Map();
  for (const object of staticMeshes) {
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const key = object.material.color.getHexString();
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      if (buckets.has(key)) buckets.get(key).push(flat);
      else buckets.set(key, [flat]);
    } else if (buckets.has(key)) buckets.get(key).push(geometry);
    else buckets.set(key, [geometry]);
    object.removeFromParent();
    object.geometry.dispose();
  }
  for (const [key, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    const mesh = new T.Mesh(geometry, material(`#${key}`));
    mesh.name = `ExpansionStatic_${key}`;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  const update = (time = 0) => {
    const t = Number(time) || 0;
    train.position.set(1950, 0.0, 2180 + Math.sin(t * 0.12) * 120);
    train.visible = true;
    train.rotation.y = Math.sin(t * 0.12) * 0.04;
    resurfacer.position.set(-1070 + Math.sin(t * 0.18) * 42, 0.0, 1580 + Math.cos(t * 0.18) * 28);
    resurfacer.visible = true;
    resurfacer.rotation.y = t * 0.18 + Math.PI / 2;
  };
  // Return bounded, integration-friendly contacts; the caller applies the actual car response.
  const stepHazards = (car, dt = 1 / 60, time = 0) => {
    const pos = car?.pos || car;
    if (!Array.isArray(pos) || pos.length < 3) return [];
    const t = Number(time) || 0,
      out = [],
      trainZ = 2180 + Math.sin(t * 0.12) * 120;
    if (
      Math.abs(pos[0] - 1950) < 9 &&
      Math.min(Math.abs(pos[2] - 2110), Math.abs(pos[2] - 2250)) < 7 &&
      Math.abs(trainZ - pos[2]) < 10
    )
      out.push({
        type: 'train-bump',
        venue: 'rail',
        speedScale: 0.55,
        push: [0, 0, pos[2] < trainZ ? -1.2 : 1.2],
        dt
      });
    const rx = -1070 + Math.sin(t * 0.18) * 42,
      rz = 1580 + Math.cos(t * 0.18) * 28;
    if (Math.hypot(pos[0] - rx, pos[2] - rz) < 5)
      out.push({
        type: 'resurfacer-bump',
        venue: 'ice',
        speedScale: 0.82,
        push: [pos[0] - rx, 0, pos[2] - rz],
        dt
      });
    return out;
  };
  const dispose = () => {
    root.removeFromParent();
    root.traverse(o => {
      o.geometry?.dispose();
      if (o.material) o.material.dispose();
    });
    mats.clear();
  };
  return {root, locations: VENUE_LOCATIONS, events: VENUE_EVENTS, update, stepHazards, dispose};
}
