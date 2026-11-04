// Saucer Springs presentation: lighting presets per track, a sun shadow that follows the car,
// clear-coat toy paint, and Re-Volt-style feedback (tyre dust, skid marks, balloon splashes).
// Presentation only; nothing here touches the physics.
import * as T from '../vendor/three.module.js';
import {environmentRadiance} from './environment-light.js';

// Outdoor: hard desert sun. Indoor: bright, even, warm ceiling light with soft overhead shadow.
export const LIGHTING = {
  outdoor: {hemi: [0xd8ecf5, 0x8a7a5e, 1.35], sun: [0xfff1db, 3.4], sunDir: [-0.45, 1, -0.35], exposure: 1.1},
  indoor: {hemi: [0xfff3df, 0x8c7a62, 2.1], sun: [0xfff1dc, 1.6], sunDir: [-0.15, 1, -0.1], exposure: 1.15}
};
export const isIndoor = track => track === 'bx' || track === 'school';

export function applyLighting({renderer, hemi, sun, contactSun}, preset) {
  hemi.color.set(preset.hemi[0]);
  hemi.groundColor.set(preset.hemi[1]);
  hemi.intensity = preset.hemi[2];
  sun.color.set(preset.sun[0]);
  sun.intensity = preset.sun[1];
  sun.userData.dir = new T.Vector3(...preset.sunDir).normalize();
  // A tight 40 m shadow box that follows the car: 2048² gives ~2 cm texels, crisp at toy scale.
  Object.assign(sun.shadow.camera, {left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  contactSun.intensity = 0.5;
  renderer.toneMappingExposure = preset.exposure;
}

// Keep the sun's shadow box centred on the car, snapped to whole shadow texels in LIGHT space, so
// moving doesn't make shadow edges swim (ported from render/visual/shadow_stabilizer.js in the
// flight game; snapping world x/z, as before, still swims whenever the sun is not overhead).
export function followSun(sun, at) {
  const cam = sun.shadow.camera,
    texel = (cam.right - cam.left) / sun.shadow.mapSize.x,
    d = sun.userData.dir;
  const dir = new T.Vector3(-d.x, -d.y, -d.z).normalize(),
    right = new T.Vector3().crossVectors(dir, new T.Vector3(0, 1, 0)).normalize(),
    up = new T.Vector3().crossVectors(right, dir).normalize();
  const focus = new T.Vector3(at.x, at.y, at.z),
    lx = focus.dot(right),
    ly = focus.dot(up);
  focus
    .addScaledVector(right, Math.round(lx / texel) * texel - lx)
    .addScaledVector(up, Math.round(ly / texel) * texel - ly);
  sun.target.position.copy(focus);
  sun.position.set(focus.x + d.x * 60, focus.y + d.y * 60, focus.z + d.z * 60);
  sun.target.updateMatrixWorld();
}

// Glossy toy paint: bright body panels become clear-coated; tyres and chassis keep their finish.
export function clearcoat(root) {
  const done = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.material?.color) return;
    const hsl = {};
    o.material.color.getHSL(hsl);
    if (hsl.s < 0.35 || hsl.l < 0.3) return;
    if (!done.has(o.material)) {
      const m = o.material;
      done.set(
        m,
        new T.MeshPhysicalMaterial({
          color: m.color,
          map: m.map ?? null,
          vertexColors: m.vertexColors,
          roughness: 0.38,
          metalness: 0.05,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          envMapIntensity: 1.1
        })
      );
    }
    o.material = done.get(o.material);
  });
}

// Studio environment for reflections: two warm softboxes and a cool fill, so paint has highlights.
export function studioEnvironment(renderer) {
  const studio = new T.Scene();
  studio.background = new T.Color('#7d8c90');
  for (const [x, y, z, w, h, d, c] of [
    [0, 7, 0, 12, 0.1, 12, 0xfff1d8],
    [-6, 2.5, 0, 0.1, 4, 9, 0xffd9a8],
    [6, 3, 0, 0.1, 3, 7, 0xcfe6ff],
    [0, 2, 6, 8, 3, 0.1, 0x9fb3b8]
  ]) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({color: c}));
    m.position.set(x, y, z);
    studio.add(m);
  }
  const pmrem = new T.PMREMGenerator(renderer),
    tex = pmrem.fromScene(studio, 0.04).texture;
  pmrem.dispose();
  studio.traverse(o => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return tex;
}

// Tyre dust and splashes: one pooled Points cloud, CPU-updated (a few hundred particles).
// Skid marks: a ring buffer of flat quads in one InstancedMesh, fading as they age.
export function createEffects(scene) {
  // Smoke and dust (audit 2026-10-31, 3.4 item 5): soft round sprites that swell and fade as they
  // rise, instead of flat same-size grey discs. One pooled Points draw.
  const MAX = 600,
    pos = new Float32Array(MAX * 3),
    col = new Float32Array(MAX * 3),
    life = new Float32Array(MAX),
    span = new Float32Array(MAX).fill(1),
    vel = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX),
    base = new Float32Array(MAX),
    alpha = new Float32Array(MAX);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new T.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new T.BufferAttribute(alpha, 1));
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'),
    grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const puffMat = new T.ShaderMaterial({
    uniforms: {map: {value: new T.CanvasTexture(c)}, scale: {value: 420}},
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    vertexShader:
      'attribute float aSize;attribute float aAlpha;varying float vAlpha;varying vec3 vColor;uniform float scale;void main(){vColor=color;vAlpha=aAlpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*scale/max(.1,-mv.z);gl_Position=projectionMatrix*mv;}',
    fragmentShader:
      'uniform sampler2D map;varying float vAlpha;varying vec3 vColor;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(vColor,t.a*vAlpha);if(gl_FragColor.a<.01)discard;}'
  });
  const points = new T.Points(geo, puffMat);
  points.frustumCulled = false;
  scene.add(points);
  let next = 0;
  function emit(p, v, colour, n = 1, spread = 0.6, grow = 0.12) {
    const c = new T.Color(colour);
    for (let k = 0; k < n; k++) {
      const i = next;
      next = (next + 1) % MAX;
      pos.set([p[0] + (Math.random() - 0.5) * 0.05, p[1], p[2] + (Math.random() - 0.5) * 0.05], i * 3);
      vel.set(
        [
          v[0] * 0.2 + (Math.random() - 0.5) * spread,
          0.3 + Math.random() * spread,
          v[2] * 0.2 + (Math.random() - 0.5) * spread
        ],
        i * 3
      );
      col.set([c.r, c.g, c.b], i * 3);
      life[i] = span[i] = 0.6 + Math.random() * 0.6;
      base[i] = grow * (0.8 + Math.random() * 0.4);
    }
  }
  // Tyre marks: one continuous ribbon per wheel along the path it actually took, fading with age,
  // instead of stamps turned to the body (which fanned into stacked squares in a drift).
  const QUADS = 1200,
    rp = new Float32Array(QUADS * 6 * 3),
    ra = new Float32Array(QUADS * 6),
    born = new Float32Array(QUADS).fill(-1e9);
  const ribbon = new T.BufferGeometry();
  ribbon.setAttribute('position', new T.BufferAttribute(rp, 3));
  ribbon.setAttribute('aAlpha', new T.BufferAttribute(ra, 1));
  const markMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    vertexShader:
      'attribute float aAlpha;varying float vA;void main(){vA=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying float vA;void main(){gl_FragColor=vec4(.07,.07,.07,vA);}'
  });
  const marks = new T.Mesh(ribbon, markMat);
  marks.frustumCulled = false;
  scene.add(marks);
  const tracks = new Map();
  let quadNext = 0,
    clock = 0;
  const MARK = {width: 0.045, alpha: 0.32, fade: 30, gap: 0.5};
  function skid(key, p) {
    const last = tracks.get(key);
    tracks.set(key, [p[0], p[1] + 0.004, p[2]]);
    if (!last) return;
    const dx = p[0] - last[0],
      dz = p[2] - last[2],
      len = Math.hypot(dx, dz);
    if (len < 0.02) {
      tracks.set(key, last);
      return;
    }
    if (len > MARK.gap) return; // a jump in position: start a new strip
    const nx = ((-dz / len) * MARK.width) / 2,
      nz = ((dx / len) * MARK.width) / 2,
      y = p[1] + 0.004;
    const v = [
      [last[0] + nx, last[1], last[2] + nz],
      [last[0] - nx, last[1], last[2] - nz],
      [p[0] - nx, y, p[2] - nz],
      [p[0] + nx, y, p[2] + nz]
    ];
    const i = quadNext;
    quadNext = (quadNext + 1) % QUADS;
    [0, 1, 2, 0, 2, 3].forEach((k, j) => rp.set(v[k], (i * 6 + j) * 3));
    born[i] = clock;
    ribbon.attributes.position.needsUpdate = true;
  }
  const DUSTY = {dirt: '#c8a878', gravel: '#b59a78', grass: '#9fb071', rubber: '#7a5a4a'},
    SKIDDY = new Set(['asphalt', 'concrete', 'tile', 'gymfloor', 'wood']);
  return {
    // Per frame: each wheel of each car leaves dust on loose ground and marks when sliding.
    carFeedback(car, dt) {
      const th = 2 * Math.atan2(car.q[1], car.q[3]),
        right = [Math.cos(th), 0, -Math.sin(th)];
      const lateral = car.vel[0] * right[0] + car.vel[2] * right[2];
      const speed = car.speed;
      car.wheels.forEach((w, i) => {
        const key = car.wheels.length * (car.__fxId ??= Math.random()) + i;
        if (!w.contact || !w.contactPoint) {
          tracks.delete(key);
          return;
        }
        const dusty = DUSTY[w.surface];
        if (dusty && speed > 2 && Math.random() < dt * 30) emit(w.contactPoint, car.vel, dusty, 1, 0.6, 0.16);
        if (w.slip && speed > 3 && Math.abs(lateral) > 1.2) {
          if (SKIDDY.has(w.surface)) skid(key, w.contactPoint);
          else tracks.delete(key);
          if (Math.random() < dt * 20) emit(w.contactPoint, car.vel, '#d9d4cc', 1, 0.3, 0.2);
        } else tracks.delete(key);
      });
    },
    puff(p) {
      emit(p, [0, 0, 0], '#e8e4dc', 1, 0.12);
    },
    boom(p) {
      emit([p[0], p[1] + 0.1, p[2]], [0, 0, 0], '#ffb347', 30, 1.4, 0.3);
    },
    splash(p) {
      emit([p[0], p[1] + 0.1, p[2]], [0, 0, 0], '#7fd4ff', 40, 1.6, 0.18);
    },
    update(dt) {
      clock += dt;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) {
          pos[i * 3 + 1] = -999;
          alpha[i] = 0;
          continue;
        }
        life[i] -= dt;
        vel[i * 3 + 1] -= 1.2 * dt;
        for (let k = 0; k < 3; k++) vel[i * 3 + k] *= 1 - 1.5 * dt; // air drag: puffs slow and hang
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const age = 1 - Math.max(0, life[i]) / span[i];
        size[i] = base[i] * (1 + age * 2.5);
        alpha[i] = 0.55 * Math.pow(1 - age, 1.5) * Math.min(1, age * 8 + 0.2);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      for (let i = 0; i < QUADS; i++) {
        const a = MARK.alpha * Math.max(0, 1 - (clock - born[i]) / MARK.fade);
        for (let j = 0; j < 6; j++) ra[i * 6 + j] = a;
      }
      ribbon.attributes.aAlpha.needsUpdate = true;
    }
  };
}

// Forza-style driving line: a smooth ribbon along the racing line, draped on the ground, with
// scrolling chevrons. Colour compares the car's speed with the line's target speed at that point:
// green = room to go faster, yellow = hold, red = brake. Shown ~30 m ahead, faded behind.
export function createRacingLine(
  scene,
  line,
  world,
  {width = 0.5, step = 0.5, closed = true, tint = null} = {}
) {
  const pts = line.map(([x, z]) => new T.Vector3(x, 0, z));
  const curve = new T.CatmullRomCurve3(pts, closed, 'centripetal');
  const n = Math.max(16, Math.round(curve.getLength() / step)),
    samples = curve.getSpacedPoints(n).slice(0, closed ? n : n + 1);
  const N = samples.length;
  // Drape on the world, and keep arc length.
  const s = new Float32Array(N);
  let L = 0;
  // Drape along the drivable surface: cast from just above the previous point, so the line never
  // jumps onto a tree canopy, roof edge, sign or table top that overhangs the road.
  let lastY = null;
  samples.forEach((p, i) => {
    const from = lastY === null ? 30 : lastY + 0.6,
      hit = world.raycast([p.x, from, p.z], [0, -1, 0], lastY === null ? 60 : 3);
    lastY = hit ? hit.point[1] : (lastY ?? 0);
    p.y = lastY + 0.025;
    if (i) L += samples[i - 1].distanceTo(p);
    s[i] = L;
  });
  if (closed) L += samples[N - 1].distanceTo(samples[0]);
  else L += 1e4; // open lines never wrap
  // Target speed: lateral grip limit from curvature, then a backward braking pass (twice round the loop).
  const A_LAT = 9,
    A_BRAKE = 5.5,
    VMAX = 13,
    v = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = samples[(i - 4 + N) % N],
      b = samples[i],
      c = samples[(i + 4) % N];
    const h1 = Math.atan2(b.x - a.x, b.z - a.z),
      h2 = Math.atan2(c.x - b.x, c.z - b.z);
    const turn = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))),
      ds = a.distanceTo(b) + b.distanceTo(c);
    const k = turn / Math.max(ds, 1e-3);
    v[i] = Math.min(VMAX, Math.sqrt(A_LAT / Math.max(k, 1e-4)));
  }
  for (let pass = 0; pass < 2; pass++)
    for (let i = N - 1; i >= 0; i--) {
      const j = (i + 1) % N,
        ds = samples[i].distanceTo(samples[j]);
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * A_BRAKE * ds));
    }
  // Ribbon geometry: two vertices per sample, u across (0..1), arc length and target speed attributes.
  const posA = new Float32Array(N * 2 * 3),
    uA = new Float32Array(N * 2),
    sA = new Float32Array(N * 2),
    vA = new Float32Array(N * 2),
    idx = [];
  for (let i = 0; i < N; i++) {
    const p = samples[i],
      q = samples[(i + 1) % N],
      o = samples[(i - 1 + N) % N];
    const dx = q.x - o.x,
      dz = q.z - o.z,
      l = Math.hypot(dx, dz) || 1,
      nx = ((-dz / l) * width) / 2,
      nz = ((dx / l) * width) / 2;
    posA.set([p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz], i * 6);
    uA.set([0, 1], i * 2);
    sA.set([s[i], s[i]], i * 2);
    vA.set([v[i], v[i]], i * 2);
    const a = i * 2,
      b = ((i + 1) % N) * 2;
    if (closed || i < N - 1) idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(posA, 3));
  geo.setAttribute('u', new T.BufferAttribute(uA, 1));
  geo.setAttribute('arc', new T.BufferAttribute(sA, 1));
  geo.setAttribute('vt', new T.BufferAttribute(vA, 1));
  geo.setIndex(idx);
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    uniforms: {carS: {value: 0}, carV: {value: 0}, loopL: {value: L}, time: {value: 0}},
    vertexShader: `attribute float u; attribute float arc; attribute float vt; varying float vU; varying float vArc; varying float vVt;
      void main(){ vU=u; vArc=arc; vVt=vt; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float carS; uniform float carV; uniform float loopL; uniform float time; varying float vU; varying float vArc; varying float vVt;
      void main(){
        float ahead = mod(vArc - carS + loopL, loopL);
        float a = smoothstep(0.1, 0.9, ahead) * (1.0 - smoothstep(24.0, 34.0, ahead));
        if (a < 0.01) discard;
        float d = vVt - carV;                     // >0: room to speed up
        vec3 green = vec3(0.22, 0.85, 0.35), yellow = vec3(1.0, 0.82, 0.2), red = vec3(1.0, 0.22, 0.18);
        vec3 c = d > 1.0 ? green : (d > -1.0 ? yellow : red);
        float chev = fract((vArc - abs(vU - 0.5) * 0.6) / 0.7 - time * 1.4);
        float stripe = smoothstep(0.0, 0.08, chev) * (1.0 - smoothstep(0.42, 0.5, chev));
        float edge = smoothstep(0.0, 0.12, vU) * smoothstep(1.0, 0.88, vU);
        gl_FragColor = vec4(mix(c * 0.85, c * 1.3, stripe), a * edge * (0.78 + 0.22 * stripe));
      }`
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  let near = 0;
  return {
    mesh,
    update(carPos, carSpeed, t) {
      let best = near,
        bd = Infinity;
      for (let k = -20; k <= 40; k++) {
        const i = (((near + k) % N) + N) % N,
          p = samples[i],
          d = (p.x - carPos[0]) ** 2 + (p.z - carPos[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (bd > 64)
        for (let i = 0; i < N; i++) {
          const p = samples[i],
            d = (p.x - carPos[0]) ** 2 + (p.z - carPos[2]) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      near = best;
      mat.uniforms.carS.value = s[best];
      mat.uniforms.carV.value = carSpeed;
      mat.uniforms.time.value = t;
    }
  };
}

// "Proper game" lighting pass: a real HDRI sky for image-based light and reflections (CC0, Poly
// Haven "Goegap", assets/env), ground-truth ambient occlusion, a touch of bloom, SMAA. Outdoor
// tracks also show the HDRI as the sky. ?gfx=classic turns all of it off for comparison.
import {RGBELoader} from '../vendor/three/addons/loaders/RGBELoader.js';
import {EffectComposer} from '../vendor/three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from '../vendor/three/addons/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from '../vendor/three/addons/postprocessing/OutputPass.js';
import {SMAAPass} from '../vendor/three/addons/postprocessing/SMAAPass.js';
import {ShaderPass} from '../vendor/three/addons/postprocessing/ShaderPass.js';

// The look (owner, 30 Oct: "graphics look great, why doesn't mine look like that"): a grade after
// tone mapping. A touch more contrast and colour, warm highlights and cool shadows (the
// golden-afternoon split), and a soft vignette that pulls the eye to the car.
export const GRADE = Object.freeze({
  saturation: 1.14,
  contrast: 1.07,
  warm: [0.02, 0.008, -0.014],
  cool: [-0.012, 0.0, 0.016],
  vignette: 0.24
});
export const gradeShader = (g = GRADE) => ({
  uniforms: {
    tDiffuse: {value: null},
    sat: {value: g.saturation},
    contrast: {value: g.contrast},
    warm: {value: new T.Vector3(...g.warm)},
    cool: {value: new T.Vector3(...g.cool)},
    vig: {value: g.vignette},
    old: {value: 0}
  },
  vertexShader:
    'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float sat,contrast,vig,old;uniform vec3 warm,cool;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 x=c.rgb;float l=dot(x,vec3(.2126,.7152,.0722));
      x=mix(vec3(l),x,sat);x=(x-.5)*contrast+.5;x+=mix(cool,warm,smoothstep(.15,.85,l));
      x*=1.-vig*smoothstep(.42,.9,distance(vUv,vec2(.5)));
      // old: the dark world is the past, graded like an old hand-tinted photograph.
      x=mix(x,vec3(dot(x,vec3(.393,.769,.189)),dot(x,vec3(.349,.686,.168)),dot(x,vec3(.272,.534,.131))),old);gl_FragColor=vec4(clamp(x,0.,1.),c.a);}`
});

export async function setupPolish({renderer, scene, camera, indoor, world = false}) {
  const hdr = await new RGBELoader().setDataType(T.FloatType).loadAsync('./assets/env/goegap_1k.hdr');
  hdr.mapping = T.EquirectangularReflectionMapping;
  // Three r160 ignores Scene.environmentIntensity. Scale the source radiance
  // before convolution, so streamed meshes also receive the intended fill.
  const radiance = environmentRadiance(hdr, world ? 0.06 : indoor ? 0.55 : 0.9);
  const pmrem = new T.PMREMGenerator(renderer),
    env = pmrem.fromEquirectangular(radiance).texture;
  pmrem.dispose();
  radiance.dispose();
  scene.environment = env;
  if (!indoor && !world) {
    scene.background = hdr;
    scene.backgroundIntensity = 1.0;
    scene.backgroundBlurriness = 0.02;
  } else hdr.dispose();
  const w = innerWidth,
    h = innerHeight,
    composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Real-time GTAO measured too expensive (page main thread blocked 150 ms–1.3 s per frame on the
  // M5); districts already carry baked AO in COLOR_0, so screen-space AO is opt-in (?gfx=ao).
  const ao =
    new URLSearchParams(location.search).get('gfx') === 'ao'
      ? new GTAOPass(scene, camera, w / 2, h / 2)
      : null;
  if (ao) {
    ao.updateGtaoMaterial({radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.2, samples: 8});
    composer.addPass(ao);
  }
  composer.addPass(new UnrealBloomPass(new T.Vector2(w, h), indoor ? 0.22 : 0.1, 0.35, indoor ? 0.92 : 1.6));
  composer.addPass(new OutputPass());
  const grade = indoor ? null : new ShaderPass(gradeShader());
  if (grade) composer.addPass(grade);
  composer.addPass(new SMAAPass(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()));
  return {
    render: () => composer.render(),
    resize: (W, H) => {
      composer.setSize(W, H);
      ao?.setSize(W / 2, H / 2);
    },
    setPixelRatio: r => composer.setPixelRatio(r),
    setOld: v => {
      if (grade) grade.uniforms.old.value = v;
    }
  };
}
