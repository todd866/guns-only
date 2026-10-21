// Area 51½ presentation polish: lighting presets per track, a sun shadow that follows the car,
// clear-coat toy paint, and Re-Volt-style feedback (tyre dust, skid marks, balloon splashes).
// Presentation only; nothing here touches the physics.
import * as T from '../vendor/three.module.js';

// Outdoor: hard desert sun. Indoor: bright, even, warm ceiling light with soft overhead shadow.
export const LIGHTING = {
  outdoor: { hemi: [0xd8ecf5, 0x8a7a5e, 1.35], sun: [0xffe1b0, 3.4], sunDir: [-0.45, 1, -0.35], exposure: 1.1 },
  indoor: { hemi: [0xfff3df, 0x8c7a62, 2.1], sun: [0xfff1dc, 1.6], sunDir: [-0.15, 1, -0.1], exposure: 1.15 },
};
export const isIndoor = track => track === 'bx' || track === 'school';

export function applyLighting({ renderer, hemi, sun, contactSun }, preset) {
  hemi.color.set(preset.hemi[0]); hemi.groundColor.set(preset.hemi[1]); hemi.intensity = preset.hemi[2];
  sun.color.set(preset.sun[0]); sun.intensity = preset.sun[1];
  sun.userData.dir = new T.Vector3(...preset.sunDir).normalize();
  // A tight 40 m shadow box that follows the car: 2048² gives ~2 cm texels, crisp at toy scale.
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  contactSun.intensity = 0.5;
  renderer.toneMappingExposure = preset.exposure;
}

// Keep the sun's shadow box centred on the car, snapped to whole texels so shadows don't shimmer.
export function followSun(sun, at) {
  const texel = 40 / sun.shadow.mapSize.x, snap = v => Math.round(v / texel) * texel;
  const cx = snap(at.x), cz = snap(at.z), d = sun.userData.dir;
  sun.target.position.set(cx, at.y, cz);
  sun.position.set(cx + d.x * 60, at.y + d.y * 60, cz + d.z * 60);
  sun.target.updateMatrixWorld();
}

// Glossy toy paint: bright body panels become clear-coated; tyres and chassis keep their finish.
export function clearcoat(root) {
  const done = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.material?.color) return;
    const hsl = {}; o.material.color.getHSL(hsl);
    if (hsl.s < 0.35 || hsl.l < 0.3) return;
    if (!done.has(o.material)) {
      const m = o.material;
      done.set(m, new T.MeshPhysicalMaterial({ color: m.color, map: m.map ?? null, vertexColors: m.vertexColors,
        roughness: 0.38, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 }));
    }
    o.material = done.get(o.material);
  });
}

// Studio environment for reflections: two warm softboxes and a cool fill, so paint has highlights.
export function studioEnvironment(renderer) {
  const studio = new T.Scene(); studio.background = new T.Color('#7d8c90');
  for (const [x, y, z, w, h, d, c] of [[0, 7, 0, 12, .1, 12, 0xfff1d8], [-6, 2.5, 0, .1, 4, 9, 0xffd9a8], [6, 3, 0, .1, 3, 7, 0xcfe6ff], [0, 2, 6, 8, 3, .1, 0x9fb3b8]]) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); studio.add(m);
  }
  const pmrem = new T.PMREMGenerator(renderer), tex = pmrem.fromScene(studio, 0.04).texture;
  pmrem.dispose(); studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

// Tyre dust and splashes: one pooled Points cloud, CPU-updated (a few hundred particles).
// Skid marks: a ring buffer of flat quads in one InstancedMesh, fading as they age.
export function createEffects(scene) {
  const MAX = 600, pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), life = new Float32Array(MAX), vel = new Float32Array(MAX * 3);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
  // Soft round puff: a radial-gradient sprite, so particles read as dust rather than squares.
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const points = new T.Points(geo, new T.PointsMaterial({ size: 0.12, map: new T.CanvasTexture(c), vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false }));
  points.frustumCulled = false; scene.add(points);
  let next = 0;
  function emit(p, v, colour, n = 1, spread = 0.6) {
    const c = new T.Color(colour);
    for (let k = 0; k < n; k++) {
      const i = next; next = (next + 1) % MAX;
      pos.set([p[0] + (Math.random() - .5) * .05, p[1], p[2] + (Math.random() - .5) * .05], i * 3);
      vel.set([v[0] * .2 + (Math.random() - .5) * spread, .3 + Math.random() * spread, v[2] * .2 + (Math.random() - .5) * spread], i * 3);
      col.set([c.r, c.g, c.b], i * 3); life[i] = 0.5 + Math.random() * 0.5;
    }
  }
  const SKIDS = 400, skidGeo = new T.PlaneGeometry(0.05, 0.09); skidGeo.rotateX(-Math.PI / 2);
  const skids = new T.InstancedMesh(skidGeo, new T.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SKIDS);
  skids.frustumCulled = false; skids.count = 0; scene.add(skids);
  let skidNext = 0; const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), s1 = new T.Vector3(1, 1, 1);
  // Each mark is stretched to the distance the wheel moved this frame, so trails are continuous.
  function skid(p, yaw, length) {
    // `yaw` is the body's own rotation about +Y (from its quaternion), so apply it unchanged.
    q.setFromAxisAngle(up, yaw); s1.set(1, 1, Math.max(0.3, length / 0.09)); m4.compose(new T.Vector3(p[0], p[1] + 0.004, p[2]), q, s1);
    skids.setMatrixAt(skidNext, m4); skidNext = (skidNext + 1) % SKIDS; skids.count = Math.min(SKIDS, skids.count + 1);
    skids.instanceMatrix.needsUpdate = true;
  }
  const DUSTY = { dirt: '#c8a878', gravel: '#b59a78', grass: '#9fb071', rubber: '#7a5a4a' }, SKIDDY = new Set(['asphalt', 'concrete', 'tile', 'gymfloor', 'wood']);
  return {
    // Per frame: each wheel of each car leaves dust on loose ground and marks when sliding.
    carFeedback(car, dt) {
      const speed = car.speed, yaw = Math.atan2(2 * (car.q[3] * car.q[1] + car.q[0] * car.q[2]), 1 - 2 * (car.q[1] ** 2 + car.q[2] ** 2));
      car.wheels.forEach((w, i) => {
        if (!w.contact || !w.contactPoint) return;
        const dusty = DUSTY[w.surface];
        if (dusty && speed > 2 && Math.random() < dt * 30) emit(w.contactPoint, car.vel, dusty, 1);
        if (w.slip && speed > 3) {
          if (SKIDDY.has(w.surface)) skid(w.contactPoint, yaw, speed * dt);
          if (Math.random() < dt * 20) emit(w.contactPoint, car.vel, '#d9d4cc', 1, 0.3);
        }
      });
    },
    splash(p) { emit([p[0], p[1] + 0.1, p[2]], [0, 0, 0], '#7fd4ff', 40, 1.6); },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
        life[i] -= dt; vel[i * 3 + 1] -= 3 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}
