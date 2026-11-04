import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {districtOffset} from './district-zones.mjs';
import {orientArrival} from './arrival-frame.mjs';

// Authored corridor and hangar elevations, not a random facade kit. All new low geometry
// follows existing walls/fences; every public doorway retains its six-metre cut.
// No collision or road data is changed. Roof services remain above car clearance.
export function buildCorridorArt(scene) {
  const root = new T.Group();
  root.name = 'CorridorArchitecture';
  const regions = [],
    lamps = [],
    ownedMaterials = new Set();
  const warm = new T.MeshStandardMaterial({
    color: '#fff0bc',
    emissive: '#ffd99a',
    emissiveIntensity: 0,
    roughness: 0.35
  });
  ownedMaterials.add(warm);
  function region(name, placement) {
    const source = new T.Group(),
      buckets = new Map(),
      lightParts = [];
    const add = (g, color, kind = 'stone') => {
      if (g.index) {
        const old = g;
        g = g.toNonIndexed();
        old.dispose();
      }
      const c = new T.Color(color),
        colors = [];
      for (let i = 0; i < g.attributes.position.count; i++) colors.push(c.r, c.g, c.b);
      g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      for (const key of Object.keys(g.attributes))
        if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
      const key = kind === 'glass' ? 'glass' : kind === 'metal' ? 'metal' : 'stone';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(g);
    };
    const box = (x, y, z, w, h, d, color, kind = 'stone', yaw = 0) => {
      const g = new T.BoxGeometry(w, h, d);
      g.rotateY(yaw);
      g.translate(x, y, z);
      add(g, color, kind);
    };
    const cylinder = (x, y, z, r, h, color) => {
      const g = new T.CylinderGeometry(r, r, h, 10);
      g.translate(x, y, z);
      add(g, color, 'metal');
    };
    const lamp = (x, y, z, w = 1.1, d = 0.28) => {
      const g = new T.BoxGeometry(w, 0.055, d);
      g.translate(x, y, z);
      lightParts.push(g.toNonIndexed());
      g.dispose();
      lamps.push({region: source, local: new T.Vector3(x, y, z)});
    };
    const finish = () => {
      for (const [kind, parts] of buckets) {
        const g = mergeGeometries(parts, false);
        parts.forEach(p => p.dispose());
        const m = new T.MeshStandardMaterial({
          color: '#ffffff',
          vertexColors: true,
          roughness: kind === 'glass' ? 0.28 : kind === 'metal' ? 0.58 : 0.89,
          metalness: kind === 'metal' ? 0.35 : kind === 'glass' ? 0.1 : 0
        });
        ownedMaterials.add(m);
        const mesh = new T.Mesh(g, m);
        mesh.castShadow = mesh.receiveShadow = true;
        source.add(mesh);
      }
      if (lightParts.length) {
        const g = mergeGeometries(lightParts, false);
        lightParts.forEach(p => p.dispose());
        source.add(new T.Mesh(g, warm));
      }
      source.name = name;
      placement?.(source);
      root.add(source);
      regions.push(source);
      return source;
    };
    return {box, cylinder, lamp, finish};
  }
  // SECURITY: deep shade fins, layered hip-roof edges and practical booth services.
  {
    const {box, cylinder, lamp, finish} = region('GateDetails', orientArrival);
    for (const [x, z, w, d] of [
      [-625, -47, 8.5, 6.2],
      [-589, -48, 7.8, 6.2]
    ]) {
      for (let dz = -2.6; dz < 2.7; dz += 0.65) {
        box(x, 2.43, z + dz, w * 0.76, 0.045, 0.055, '#6d4c40');
      }
      box(x, 1.79, z + d / 2 + 0.12, w + 0.36, 0.09, 0.28, '#eed7ac');
      const face = x < -607 ? x + w / 2 + 0.06 : x - w / 2 - 0.06;
      for (let dz = -1.5; dz <= 1.5; dz += 0.5) box(face, 1.13, z + dz, 0.32, 1.1, 0.045, '#ae7c52', 'metal');
      lamp(face, 1.74, z, 1.1, 0.22);
    }
    // Slatted security canopy: detail stays above its existing clear height.
    for (let x = -614; x <= -600; x += 0.7) box(x, 4.18, -35.5, 0.055, 0.1, 2.25, '#ac8c60');
    for (const x of [-612, -607, -602]) lamp(x, 4.04, -35.5, 2.2, 0.18);
    box(-582, 3.94, -69, 2.1, 0.55, 1.35, '#7b8885', 'metal');
    for (let x = -582.8; x < -581.1; x += 0.2) box(x, 4.24, -69, 0.07, 0.035, 1.15, '#485858', 'metal');
    box(-584.55, 1.2, -68, 0.09, 1.95, 0.09, '#586665', 'metal');
    box(-584.7, 0.85, -68, 0.23, 0.5, 0.5, '#8a9892', 'metal');
    lamp(-582, 2.78, -66.6, 2.1, 0.18);
    for (const x of [-617, -597]) {
      cylinder(x, 2.3, -29, 0.065, 4.6, '#536265');
      lamp(x, 4.58, -29, 1.1, 0.35);
    }
    finish();
  }
  // EXCHANGE: folded entrance canopy, recessed display bays and a service roof.
  {
    const offset = districtOffset('bx'),
      {box, cylinder, lamp, finish} = region('ExchangeDetails', g => g.position.set(...offset));
    box(3, 4.46, 44.3, 21, 0.34, 4.0, '#355c61', 'metal');
    box(3, 4.19, 44.3, 20.7, 0.12, 3.7, '#d2b17a');
    box(3, 4.72, 43.4, 21.6, 0.12, 2.1, '#78938c', 'metal');
    for (let x = -6; x <= 12; x += 1.1) box(x, 4.12, 44.3, 0.06, 0.08, 3.6, '#98734d');
    for (const x of [-4, 3, 10]) lamp(x, 4.04, 44.4, 2.4, 0.24);
    for (const [a, b] of [
      [-35, -24],
      [-23, -12],
      [-11, -1],
      [7, 13],
      [14, 21]
    ]) {
      const x = (a + b) / 2,
        w = b - a;
      box(x, 1.7, 43.37, w, 2.28, 0.055, '#426874', 'glass');
      box(x, 0.46, 43.42, w + 0.12, 0.22, 0.17, '#9d8a71');
      box(x, 2.92, 43.49, w + 0.2, 0.14, 0.35, '#d6b77f');
      for (const xx of [a + 0.04, x, b - 0.04]) box(xx, 1.72, 43.46, 0.07, 2.35, 0.09, '#c4c7b6', 'metal');
    }
    // Different roof profiles at the loading wing and glazed public entrance.
    box(-26, 4.47, 36, 19, 0.48, 10, '#8c9184');
    box(-26, 4.76, 36, 19.5, 0.1, 10.3, '#c9baa0');
    box(-28, 5.15, 35, 3.8, 0.7, 2.5, '#6d7b79', 'metal');
    box(-22, 5.0, 35, 2.4, 0.4, 2.1, '#85928b', 'metal');
    for (let x = -29.5; x < -26.4; x += 0.25) box(x, 5.53, 35, 0.08, 0.04, 2.25, '#465a5d', 'metal');
    for (const x of [-35.7, 21.7]) {
      box(x, 1.9, 43.5, 0.12, 3.8, 0.13, '#71847c', 'metal');
      box(x, 0.65, 43.56, 0.25, 0.6, 0.25, '#687b74', 'metal');
    }
    // Illuminated frames flank the existing open doorway; its glazing stays absent.
    for (const x of [-0.35, 6.35]) {
      box(x, 1.8, 43.5, 0.25, 3.6, 0.24, '#d7b36f');
      lamp(x, 3.58, 43.62, 0.28, 0.22);
    }
    finish();
  }
  // ELEMENTARY: entry portico, classroom sunshades and a distinct stepped gym cap.
  {
    const offset = districtOffset('school'),
      {box, cylinder, lamp, finish} = region('SchoolDetails', g => g.position.set(...offset));
    box(12, 3.46, 2.7, 7.6, 0.2, 5.3, '#d0b484');
    box(12, 3.65, 2.7, 7.9, 0.14, 5.5, '#355f70', 'metal');
    box(12, 3.96, 0.8, 8.2, 0.45, 1.7, '#d3b78d');
    for (let x = 8.8; x <= 15.2; x += 0.4) box(x, 3.35, 2.7, 0.045, 0.07, 4.8, '#9c754c');
    for (const x of [10, 14]) lamp(x, 3.3, 3.2, 1.6, 0.22);
    for (const [x, w] of [
      [-43, 5.5],
      [-35, 5.5],
      [-17, 6],
      [-8, 5]
    ]) {
      box(x, 2.15, 0.065, w, 1.65, 0.055, '#365f6b', 'glass');
      box(x, 1.27, 0.12, w + 0.22, 0.12, 0.22, '#c7b49a');
      box(x, 3.12, 0.38, w + 0.5, 0.12, 0.8, '#ba8053');
      for (const dx of [-w / 2, 0, w / 2]) box(x + dx, 2.15, 0.15, 0.065, 1.85, 0.11, '#d8cbb2');
    }
    box(-30, 7.51, -57, 40, 0.18, 34, '#657d7e', 'metal');
    box(-30, 7.72, -57, 39.3, 0.24, 33.3, '#af9c80');
    box(-40, 8.1, -58, 2.5, 0.6, 2.0, '#667e80', 'metal');
    // Civic threshold built on the existing fence ends, outside the six-metre cut.
    for (const x of [7.55, 14.25]) {
      box(x, 1.7, 46, 0.3, 3.4, 0.24, '#b89974');
      box(x, 3.46, 46, 0.48, 0.12, 0.4, '#426676');
      lamp(x, 3.38, 46.15, 0.35, 0.22);
    }
    box(10.9, 3.65, 46, 7.2, 0.28, 1.8, '#3b6b7b', 'metal');
    box(10.9, 3.47, 46, 7, 0.08, 1.6, '#c4a56d');
    for (const x of [8.6, 10.9, 13.2]) lamp(x, 3.39, 46.05, 1.3, 0.2);
    // Warm wall fixtures pick out the long accessible walk, without adding posts.
    for (const z of [13, 27, 39]) {
      box(2.08, 1.15, z, 0.12, 0.45, 0.25, '#586d6a', 'metal');
      lamp(2.18, 1.4, z, 0.18, 0.32);
    }
    finish();
  }
  // HANGAR ROW: retain the original open barrel bays and their full driving
  // clearances. Different end frames and high service bands identify each bay.
  {
    const {box, lamp, finish} = region('HangarDetails');
    for (const [x, accent] of [
      [353, '#4d8993'],
      [407, '#b48c47']
    ]) {
      for (const side of [-1, 1]) {
        for (const z of [343, 350, 357, 364, 369])
          box(x + side * 12.42, 4.2, z, 0.12, 7.1, 0.2, accent, 'metal');
        box(x + side * 12.45, 5.8, 356, 0.1, 1.1, 20, '#365963', 'glass');
        box(x + side * 12.5, 6.42, 356, 0.18, 0.12, 20.3, '#d1c6a5');
        box(x + side * 12, 8.0, 356, 1.05, 0.24, 28.5, accent, 'metal');
        box(x + side * 11.8, 6.9, 370.25, 0.65, 2.2, 0.25, accent, 'metal');
      }
      box(x, 8.15, 370.15, 24, 0.24, 0.35, accent, 'metal');
      // Service ridge sits on the existing barrel crown, above all play space.
      box(x, 20.55, 356, 2.1, 0.5, 14, '#526d72', 'glass');
      box(x, 20.87, 356, 2.45, 0.14, 14.5, '#aeb8ac', 'metal');
      for (const dx of [-7, 0, 7]) lamp(x + dx, 7.88, 369.8, 2.4, 0.35);
    }
    finish();
  }
  scene.add(root);
  root.updateMatrixWorld(true);
  const bounds = regions.map(region => ({region, box: new T.Box3().setFromObject(region)}));
  const fixtures = lamps.map(l => ({pos: l.region.localToWorld(l.local.clone())}));
  const poolMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: {night: {value: 0}},
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'varying vec2 vUv;uniform float night;void main(){float r=length((vUv-.5)*2.);float a=pow(max(0.,1.-r),2.)*.26*night;gl_FragColor=vec4(1.,.77,.42,a);}'
  });
  const poolParts = [];
  for (const f of fixtures) {
    const g = new T.PlaneGeometry(1, 1);
    const r = Math.max(4, f.pos.y * 2.5);
    g.scale(r, r, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(f.pos.x, 0.065, f.pos.z);
    poolParts.push(g);
  }
  const poolGeometry = mergeGeometries(poolParts, false);
  poolParts.forEach(g => g.dispose());
  const pools = new T.Mesh(poolGeometry, poolMaterial);
  pools.name = 'CorridorLightPools';
  scene.add(pools);
  const driver = new T.Vector3();
  // Exactly two real, unshadowed lights affect the nearby car and facades. Fixed
  // light count avoids shader recompilation as the driver crosses venue boundaries.
  const lights = [0, 1].map(() => {
    const l = new T.PointLight('#ffe3a8', 0, 22, 2);
    scene.add(l);
    return l;
  });
  return {
    root,
    fixtures,
    lights,
    pools,
    update(day, pos, roadFixtures = []) {
      const night = Math.max(0, Math.min(1, 1 - day));
      warm.emissiveIntensity = night * 1.3;
      poolMaterial.uniforms.night.value = night;
      // Daylight needs no lamp search; skip the per-frame allocation and sort.
      const near =
        night > 0.01
          ? [...fixtures, ...roadFixtures]
              .map(f => ({f, d: Math.hypot(f.pos.x - pos[0], f.pos.z - pos[2])}))
              .sort((a, b) => a.d - b.d)
          : [];
      for (let i = 0; i < lights.length; i++) {
        const f = near[i];
        lights[i].intensity = f && f.d < 30 ? night * 42 : 0;
        if (f) lights[i].position.copy(f.f.pos);
      }
      driver.set(...pos);
      for (const {region, box} of bounds) region.visible = box.distanceToPoint(driver) < 550;
      pools.visible = night > 0.01;
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      for (const m of ownedMaterials) m.dispose();
      pools.removeFromParent();
      poolGeometry.dispose();
      poolMaterial.dispose();
      for (const l of lights) l.removeFromParent();
    }
  };
}
