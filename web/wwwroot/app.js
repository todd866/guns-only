import * as THREE from "./vendor/three.module.js";
import { createHud } from "./hud.js";

const DEG = Math.PI / 180;
const MAX_GIMBAL_YAW = 150 * DEG;
const MAX_GIMBAL_PITCH = 90 * DEG;
const PADLOCK_MAX_YAW = 165 * DEG;
const PADLOCK_MAX_PITCH = 88 * DEG;
const PADLOCK_FRAME_FRACTION = 0.88;
const MAX_TRACERS = 48;
const SUN_DIRECTION = new THREE.Vector3(0.32, 0.78, -0.53).normalize();

const sceneCanvas = document.querySelector("#scene");
const hudCanvas = document.querySelector("#hud");
const bootScreen = document.querySelector("#boot");
const bootStatus = document.querySelector("#boot-status");
const fatalScreen = document.querySelector("#fatal");
const fatalMessage = document.querySelector("#fatal-message");
const touchControls = document.querySelector("#touch-controls");
const tiltPrompt = document.querySelector("#tilt-prompt");
const tiltStatus = document.querySelector("#tilt-status");

const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches === true;
const touchCapable = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
const smallViewport = Math.min(
  window.screen?.width || window.innerWidth,
  window.screen?.height || window.innerHeight,
) <= 900 || Math.min(window.innerWidth, window.innerHeight) <= 600;
const mobileControls = coarsePointer || (touchCapable && smallViewport);
document.documentElement.classList.toggle("touch-mode", mobileControls);

// Centralised, deliberately conservative quality knobs. The shader work stays identical across
// tiers; mobile saves fill-rate and vertex cost while desktop keeps the silhouette and deck edges
// crisp. These are evaluated once and never branch inside the render loop.
const VISUAL_QUALITY = Object.freeze({
  pixelRatioCap: mobileControls ? 1.4 : ((navigator.deviceMemory || 8) <= 4 ? 1.6 : 2),
  oceanRadialSegments: mobileControls ? 112 : 145,
  oceanAngularSegments: mobileControls ? 144 : 192,
  shadowMapSize: mobileControls ? 512 : ((navigator.deviceMemory || 8) <= 4 ? 1024 : 2048),
  cloudOctaves: mobileControls ? 2 : 3,
  carrierSprayCount: mobileControls ? 28 : 44,
});

const keyMap = new Map([
  ["ArrowDown", 0],
  ["ArrowUp", 1],
  ["ArrowLeft", 2],
  ["ArrowRight", 3],
  ["KeyA", 4],
  ["KeyD", 5],
  ["KeyW", 6],
  ["KeyS", 7],
  ["KeyF", 8],
  ["KeyV", 9],
  ["KeyK", 10],
  ["KeyR", 11],
  ["Space", 12],
]);

const heldKeys = new Set();

// --- Telemetry recorder ----------------------------------------------------------------------
// Tuning feel by guesswork is a waste of time; this captures every input event AND the full sim
// state each frame from a REAL playthrough and POSTs it to /telemetry (same origin, so the dev
// server writes it to disk for analysis). Fire-and-forget — a failed POST must never disturb the
// sim. Sampled at ~30 Hz to keep sessions a few MB.
const BUILD = "31";   // MUST match the HUD build stamp — recorded so stale-build sessions are obvious
const recorder = {
  session: `web-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  build: BUILD,
  buf: [],
  frame: 0,
  lastT: -1,          // last recorded sim-time; dedupe so a fast render loop doesn't write each state 27×
  lastPost: 0,
  samples: 0,
  flushes: 0,
  errors: 0,
  lastError: null,
  _headerSent: false,
  // Every method is fully guarded: telemetry must NEVER be able to crash the flight loop (an
  // earlier version did — an oversized keepalive-fetch body throws, and it killed the sim).
  event(type, code) {
    try { this.buf.push({ k: "in", t: Math.round(performance.now()), type, code, held: [...heldKeys] }); }
    catch (e) { this.errors++; this.lastError = String(e); }
  },
  sample(state) {
    try {
      this.samples++;
      // Dedupe by SIM time: the render loop can run far faster than the sim (which caps catch-up),
      // so without this every sim state was written ~27× (a 28 s session = 22 k rows / 27 MB). Only
      // record when the sim actually advanced.
      if (state && state.t === this.lastT) return;
      this.lastT = state ? state.t : this.lastT;
      if (!this._headerSent) {   // first row: the build + session context, so a stale build is unmistakable
        this.buf.push({ k: "hdr", build: this.build, session: this.session, ua: navigator.userAgent, t0: Date.now() });
        this._headerSent = true;
      }
      this.buf.push({ k: "st", t: Math.round(performance.now()), build: this.build, held: [...heldKeys], s: state });
      if (this.buf.length > 4000) this.buf.splice(0, this.buf.length - 4000);   // hard cap: never grow unbounded
      if (performance.now() - this.lastPost > 1000) this.flush();
    } catch (e) { this.errors++; this.lastError = String(e); }
  },
  flush() {
    try {
      if (!this.buf.length) return;
      const rows = this.buf;
      this.buf = [];
      this.lastPost = performance.now();
      this.flushes++;
      // NO keepalive: its 64 KB body cap is what threw before. Plain fetch, failure ignored.
      fetch("/telemetry", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: this.session, rows }) })
        .catch((e) => { this.errors++; this.lastError = "fetch:" + String(e); });
    } catch (e) { this.errors++; this.lastError = String(e); }
  },
};
globalThis.__rec = recorder;   // inspectable: __rec.samples / .flushes / .errors / .lastError
window.addEventListener("beforeunload", () => recorder.flush());
document.addEventListener("visibilitychange", () => { if (document.hidden) recorder.flush(); });

let bridge = null;
const keyOwners = new Map();
let padlock = false;
let dragging = false;
let activePointer = null;
let lastPointerX = 0;
let lastPointerY = 0;
let lastLookTime = performance.now();
let sensorYaw = 0;
let sensorPitch = 0;
let resetMobileInput = () => {};

function pressMappedKey(code, source) {
  const gkey = keyMap.get(code);
  if (!bridge || gkey === undefined) return false;
  let owners = keyOwners.get(code);
  if (!owners) {
    owners = new Set();
    keyOwners.set(code, owners);
  }
  if (owners.has(source)) return true;
  owners.add(source);
  if (owners.size > 1) return true;
  heldKeys.add(code);
  bridge.FeedKey(gkey, true);
  recorder.event("down", code);
  return true;
}

function releaseMappedKey(code, source) {
  const owners = keyOwners.get(code);
  if (!owners?.delete(source)) return;
  if (owners.size) return;
  keyOwners.delete(code);
  heldKeys.delete(code);
  const gkey = keyMap.get(code);
  if (bridge && gkey !== undefined) bridge.FeedKey(gkey, false);
  recorder.event("up", code);
}

function releaseAllMappedKeys() {
  if (bridge) {
    for (const code of heldKeys) {
      const gkey = keyMap.get(code);
      if (gkey !== undefined) bridge.FeedKey(gkey, false);
    }
  }
  keyOwners.clear();
  heldKeys.clear();
}

function setBootStatus(message) {
  bootStatus.textContent = message;
}

function waitForGlobal(getter, timeoutMs = 15000) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    function poll() {
      const value = getter();
      if (value) {
        resolve(value);
      } else if (performance.now() - started > timeoutMs) {
        reject(new Error("The .NET WebAssembly loader did not become available."));
      } else {
        requestAnimationFrame(poll);
      }
    }
    poll();
  });
}

function showFatal(error) {
  console.error(error);
  bootScreen.classList.add("ready");
  fatalMessage.textContent = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
  fatalScreen.classList.add("visible");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function expStep(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

function angleNearestReference(angle, reference) {
  const delta = angle - reference;
  if (delta > Math.PI) return angle - Math.PI * 2;
  if (delta < -Math.PI) return angle + Math.PI * 2;
  return angle;
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function gameViewport() {
  const viewport = window.visualViewport;
  return {
    width: Math.max(1, Math.round(viewport?.width || window.innerWidth)),
    height: Math.max(1, Math.round(viewport?.height || window.innerHeight)),
  };
}

function gameSafeInsets() {
  const style = getComputedStyle(document.documentElement);
  const inset = (name) => Math.max(0, Number.parseFloat(style.getPropertyValue(name)) || 0);
  return {
    top: inset("--safe-top"),
    right: inset("--safe-right"),
    bottom: inset("--safe-bottom"),
    left: inset("--safe-left"),
  };
}

function applyProceduralFinish(material, options = {}) {
  const grain = options.grain ?? 0.08;
  const grainScale = options.grainScale ?? 1.2;
  const panels = options.panels ?? 0;
  const panelScale = options.panelScale ?? 0.5;
  const hullBands = options.hullBands === true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFinishGrain = { value: grain };
    shader.uniforms.uFinishScale = { value: grainScale };
    shader.uniforms.uPanelStrength = { value: panels };
    shader.uniforms.uPanelScale = { value: panelScale };
    shader.vertexShader = shader.vertexShader
      .replace("varying vec3 vViewPosition;", `
        varying vec3 vViewPosition;
        varying vec3 vFinishPosition;
      `)
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vFinishPosition = position;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("varying vec3 vViewPosition;", `
        varying vec3 vViewPosition;
        varying vec3 vFinishPosition;
        uniform float uFinishGrain;
        uniform float uFinishScale;
        uniform float uPanelStrength;
        uniform float uPanelScale;

        float finishNoise(vec3 p) {
          float a = sin(dot(p, vec3(1.73, 3.17, 2.11)));
          float b = sin(dot(p, vec3(-4.13, 1.37, 3.71)) + a * 1.31);
          float c = sin(dot(p, vec3(7.07, -2.43, 1.19)) + b * 0.83);
          return 0.5 + 0.25 * b + 0.25 * c;
        }

        float finishPanel(vec3 p) {
          vec3 cell = abs(fract(p) - 0.5);
          float edge = max(max(cell.x, cell.y), cell.z);
          return smoothstep(0.472, 0.497, edge);
        }
      `)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `
        vec4 diffuseColor = vec4( diffuse, opacity );
        float finishValue = finishNoise(vFinishPosition * uFinishScale);
        float panelValue = finishPanel(vFinishPosition * uPanelScale);
      `)
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        diffuseColor.rgb *= 1.0 + (finishValue - 0.5) * uFinishGrain * 0.32;
        diffuseColor.rgb *= 1.0 - panelValue * uPanelStrength;
        ${hullBands ? `
          float antiFouling = 1.0 - smoothstep(-18.6, -17.7, vFinishPosition.y);
          float bootTop = smoothstep(-18.6, -18.15, vFinishPosition.y)
            * (1.0 - smoothstep(-17.75, -17.3, vFinishPosition.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.115, 0.057, 0.052), antiFouling * 0.82);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.018, 0.020), bootTop * 0.96);
        ` : ""}
      `)
      .replace("#include <roughnessmap_fragment>", `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor
          + (finishValue - 0.5) * uFinishGrain
          + panelValue * uPanelStrength * 0.7, 0.075, 1.0);
      `);
  };
  material.customProgramCacheKey = () => `procedural-finish-${hullBands ? 1 : 0}`;
  return material;
}

function makeMaterial(color, roughness = 0.72, metalness = 0.08, emissive = 0x000000,
  options = {}) {
  // Painted military aluminium is primarily a rough dielectric. MeshPhysicalMaterial supplies a
  // calibrated Fresnel response; the tiny analytic grain breaks up broad highlights without maps.
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    emissive,
    ior: options.ior ?? 1.48,
    specularIntensity: options.specularIntensity ?? 0.62,
    specularColor: options.specularColor ?? 0xd9e2e3,
    clearcoat: options.clearcoat ?? 0,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.48,
    envMapIntensity: options.envMapIntensity ?? 0.74,
  });
  return applyProceduralFinish(material, options);
}

function createLitEnvironment(renderer) {
  // A compact procedural PMREM gives every physical material something coherent to reflect. It is
  // generated once at boot and contains no fetched texture or per-frame capture cost.
  const environmentScene = new THREE.Scene();
  const environmentMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vEnvironmentDirection;
      void main() {
        vEnvironmentDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vEnvironmentDirection;
      void main() {
        vec3 d = normalize(vEnvironmentDirection);
        float skyMix = pow(clamp(d.y * 0.5 + 0.5, 0.0, 1.0), 0.55);
        vec3 lower = vec3(0.018, 0.052, 0.060);
        vec3 horizon = vec3(0.36, 0.49, 0.51);
        vec3 zenith = vec3(0.025, 0.145, 0.34);
        vec3 color = d.y < 0.0 ? mix(lower, horizon * 0.44, smoothstep(-0.5, 0.0, d.y))
          : mix(horizon, zenith, skyMix);
        float sun = pow(max(dot(d, normalize(vec3(0.32, 0.78, -0.53))), 0.0), 720.0);
        color += vec3(1.0, 0.72, 0.39) * sun * 12.0;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  environmentScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 18), environmentMaterial));
  const generator = new THREE.PMREMGenerator(renderer);
  generator.compileCubemapShader();
  const target = generator.fromScene(environmentScene, 0.035, 0.1, 80);
  generator.dispose();
  environmentMaterial.dispose();
  environmentScene.children[0].geometry.dispose();
  return target;
}

function box(group, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  group.add(mesh);
  return mesh;
}

function deckOverlayBox(group, size, position, material) {
  // Glitch fix: thin deck overlays casting onto the deck produced crawling, decal-shaped shadows.
  const mesh = box(group, size, position, material);
  mesh.userData.noShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

function depthBiasDeckMaterial(material) {
  // Glitch fix: near-coplanar deck layers lost depth precision and shimmered on approach.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  return material;
}

function beveledBox(group, size, position, material, radius = 0.16) {
  const bevel = Math.min(radius, size.x * 0.18, size.y * 0.18, size.z * 0.18);
  const width = Math.max(0.02, size.x - bevel * 2);
  const height = Math.max(0.02, size.y - bevel * 2);
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.5, -height * 0.5);
  shape.lineTo(width * 0.5, -height * 0.5);
  shape.lineTo(width * 0.5, height * 0.5);
  shape.lineTo(-width * 0.5, height * 0.5);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, size.z - bevel * 2),
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
  });
  geometry.center();
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  group.add(mesh);
  return mesh;
}

function cylinder(group, radius, length, position, material, radialSegments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1, false),
    material,
  );
  // Aircraft local forward is -Z; cylinders are authored along +Y by three.js.
  mesh.rotation.x = Math.PI / 2;
  mesh.position.copy(position);
  group.add(mesh);
  return mesh;
}

function verticalCylinder(group, radius, length, position, material, radialSegments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1, false),
    material,
  );
  mesh.position.copy(position);
  group.add(mesh);
  return mesh;
}

function createHullGeometry() {
  // Closely spaced bow and stern stations keep highlights flowing down the shell instead of
  // breaking into the large flat facets that made the ship look low-poly. Local -Z is the bow.
  const stations = [
    { z: -128, beam: 0.35, bottom: -7.0 },
    { z: -121, beam: 5.3, bottom: -15.5 },
    { z: -110, beam: 11.8, bottom: -21.8 },
    { z: -82, beam: 13.2, bottom: -23.5 },
    { z: -25, beam: 13.5, bottom: -24.0 },
    { z: 45, beam: 13.35, bottom: -23.8 },
    { z: 92, beam: 12.85, bottom: -23.0 },
    { z: 116, beam: 11.35, bottom: -20.8 },
    { z: 126, beam: 8.4, bottom: -17.5 },
  ];
  const positions = [];
  const indices = [];
  const crossSegments = 12;
  for (const station of stations) {
    for (let segment = 0; segment <= crossSegments; segment++) {
      const theta = Math.PI - segment / crossSegments * Math.PI;
      const depth = Math.sin(theta);
      const flare = 1 - depth * 0.38;
      positions.push(
        Math.cos(theta) * station.beam * flare,
        -1.7 - depth * (-1.7 - station.bottom),
        station.z,
      );
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const a = i * (crossSegments + 1);
    const b = a + crossSegments + 1;
    for (let segment = 0; segment < crossSegments; segment++) {
      indices.push(a + segment, a + segment + 1, b + segment);
      indices.push(a + segment + 1, b + segment + 1, b + segment);
    }
  }
  const ringSize = crossSegments + 1;
  const bowCentre = positions.length / 3;
  positions.push(0, (stations[0].bottom - 1.7) * 0.5, stations[0].z);
  const sternCentre = positions.length / 3;
  const stern = stations[stations.length - 1];
  positions.push(0, (stern.bottom - 1.7) * 0.5, stern.z);
  const sternStart = (stations.length - 1) * ringSize;
  for (let segment = 0; segment < ringSize; segment++) {
    const next = (segment + 1) % ringSize;
    indices.push(bowCentre, next, segment);
    indices.push(sternCentre, sternStart + segment, sternStart + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWakeMaterial(bowWave = false) {
  const uniforms = {
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0x7898a0) },
    uFogDensity: { value: 0.000055 },
    uBowWave: { value: bowWave ? 1 : 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      #include <common>
      #include <logdepthbuf_pars_vertex>

      float oceanHeight(vec2 point) {
        float wave = 0.0;
        vec2 d0 = normalize(vec2(0.92, 0.38));
        vec2 d1 = normalize(vec2(-0.34, 0.94));
        vec2 d2 = normalize(vec2(0.66, -0.75));
        vec2 d3 = normalize(vec2(-0.88, -0.47));
        float k0 = 6.28318530718 / 148.0;
        float k1 = 6.28318530718 / 73.0;
        float k2 = 6.28318530718 / 31.0;
        float k3 = 6.28318530718 / 14.0;
        wave += 1.55 * sin(k0 * dot(d0, point) - sqrt(9.81 * k0) * uTime * 0.92 + 0.4);
        wave += 0.92 * sin(k1 * dot(d1, point) - sqrt(9.81 * k1) * uTime * 1.04 + 2.1);
        wave += 0.52 * sin(k2 * dot(d2, point) - sqrt(9.81 * k2) * uTime * 1.12 + 4.3);
        wave += 0.24 * sin(k3 * dot(d3, point) - sqrt(9.81 * k3) * uTime * 1.2 + 1.2);
        return wave;
      }

      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        world.y += oceanHeight(world.xz);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uBowWave;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      #include <common>
      #include <logdepthbuf_pars_fragment>

      void main() {
        float crossWake = abs(vUv.x - 0.5);
        float divergingCentre = mix(0.14, 0.34, vUv.y);
        float rails = exp(-pow((crossWake - divergingCentre) / 0.038, 2.0));
        float churnWidth = mix(0.23, 0.075, vUv.y);
        float churn = exp(-pow(crossWake / churnWidth, 2.0));
        float flow = vUv.y * 92.0 - uTime * 2.35;
        float streaks = 0.54 + 0.30 * sin(flow + vUv.x * 19.0);
        streaks += 0.16 * sin(flow * 2.13 - vUv.x * 37.0 + 1.7);
        streaks += 0.08 * sin(flow * 4.31 + vUv.x * 71.0);
        float brokenFoam = smoothstep(0.38, 0.79, streaks);
        brokenFoam *= 0.72 + 0.28 * smoothstep(-0.4, 0.55,
          sin(vUv.y * 31.0 - uTime * 0.72 + sin(vUv.x * 17.0)));
        float endFade = 1.0 - smoothstep(0.70, 1.0, vUv.y);
        float startFade = smoothstep(0.0, 0.035, vUv.y);
        float sternFoam = rails * (0.54 + brokenFoam * 0.32) + churn * brokenFoam * 0.94;

        // A separate low-cost sheet runs along the hull. Its two coherent ribbons start at the
        // cutwater and peel outboard instead of looking like a second propeller wake.
        float bowCentre = mix(0.04, 0.43, smoothstep(0.0, 0.52, vUv.y));
        float bowRail = exp(-pow((crossWake - bowCentre) / mix(0.075, 0.052, vUv.y), 2.0));
        float bowPulse = 0.70 + 0.30 * sin(vUv.y * 53.0 - uTime * 1.35 + vUv.x * 11.0);
        float bowFoam = bowRail * smoothstep(0.38, 0.78, bowPulse);
        bowFoam *= 1.0 - smoothstep(0.68, 1.0, vUv.y);
        float foam = mix(sternFoam, bowFoam, uBowWave) * startFade * endFade;
        float fog = 1.0 - exp(-uFogDensity * uFogDensity *
          dot(vWorldPosition - cameraPosition, vWorldPosition - cameraPosition));
        vec3 color = mix(vec3(0.48, 0.66, 0.70), vec3(0.91, 0.96, 0.92), brokenFoam);
        color = mix(color, uFogColor, fog);
        gl_FragColor = vec4(color, foam * 0.82 * (1.0 - fog * 0.72));
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  return { material, uniforms };
}

function createWakeGeometry(startZ = 116, endZ = 870, startHalfWidth = 7, endHalfWidth = 45) {
  // A lightly tessellated tapered sheet in the ship's local frame. The wake shader applies the
  // same wave heights as the ocean, keeping the foam attached to the surface instead of floating.
  const positions = [];
  const uvs = [];
  const indices = [];
  const longitudinalSegments = 56;
  const crossSegments = 6;
  for (let along = 0; along <= longitudinalSegments; along++) {
    const v = along / longitudinalSegments;
    const z = startZ + (endZ - startZ) * v;
    const halfWidth = startHalfWidth + (endHalfWidth - startHalfWidth) * v;
    for (let across = 0; across <= crossSegments; across++) {
      const u = across / crossSegments;
      positions.push((u * 2 - 1) * halfWidth, 0, z);
      uvs.push(u, v);
    }
  }
  const row = crossSegments + 1;
  for (let along = 0; along < longitudinalSegments; along++) {
    for (let across = 0; across < crossSegments; across++) {
      const a = along * row + across;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addParkedAircraft(group, material, canopyMaterial) {
  // Three small deck aircraft provide an immediate scale cue while leaving the landing lane clear.
  const places = [
    { x: -9.2, z: -70, yaw: -0.05 },
    { x: -9.0, z: -91, yaw: 0.035 },
    { x: 8.4, z: -104, yaw: -0.025 },
  ];
  const temp = new THREE.Object3D();
  const parkedFuselage = createLoftGeometry([
    { z: -4.2, rx: 0.04, ry: 0.04, y: 0 },
    { z: -3.35, rx: 0.34, ry: 0.3, y: 0.05 },
    { z: -1.5, rx: 0.48, ry: 0.43, y: 0.08 },
    { z: 1.65, rx: 0.43, ry: 0.38, y: 0.07 },
    { z: 3.7, rx: 0.09, ry: 0.08, y: 0.06 },
  ], 12);
  const parkedWing = createPlanformGeometry([
    [0, -2.45], [-0.58, -2.1], [-3.15, 0.15], [-2.88, 0.72], [-0.85, 0.46],
    [-0.6, 2.52], [0, 2.76], [0.6, 2.52], [0.85, 0.46], [2.88, 0.72],
    [3.15, 0.15], [0.58, -2.1],
  ], 0.11, 0.028);
  const parkedTail = createPlanformGeometry([
    [0, 1.85], [-0.42, 1.92], [-1.65, 2.8], [-0.5, 2.62],
    [0, 2.85], [0.5, 2.62], [1.65, 2.8], [0.42, 1.92],
  ], 0.09, 0.02);
  const fuselages = new THREE.InstancedMesh(parkedFuselage, material, places.length);
  const wings = new THREE.InstancedMesh(parkedWing, material, places.length);
  const tails = new THREE.InstancedMesh(parkedTail, material, places.length);
  const canopies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 5), canopyMaterial, places.length);
  places.forEach((place, index) => {
    temp.position.set(place.x, 0.84, place.z);
    temp.rotation.set(0, place.yaw, 0);
    temp.scale.set(1, 1, 1);
    temp.updateMatrix();
    fuselages.setMatrixAt(index, temp.matrix);
    temp.position.set(place.x, 0.82, place.z);
    temp.scale.set(1, 1, 1);
    temp.updateMatrix();
    wings.setMatrixAt(index, temp.matrix);
    temp.position.set(place.x, 0.96, place.z);
    temp.updateMatrix();
    tails.setMatrixAt(index, temp.matrix);
    temp.position.set(place.x, 1.28, place.z - 1.65);
    temp.scale.set(0.82, 0.58, 1.58);
    temp.updateMatrix();
    canopies.setMatrixAt(index, temp.matrix);
  });
  group.add(fuselages, wings, tails, canopies);
}

function createRoundDownGeometry() {
  // The aft six metres roll over sharply instead of ending as a square slab. Local +Z is aft.
  const positions = [
    -15, 0.02, 116, 15, 0.02, 116, -12.5, -4.1, 129, 12.5, -4.1, 129,
    -15, -1.8, 116, 15, -1.8, 116,
  ];
  const indices = [
    0, 2, 1, 1, 2, 3,
    0, 4, 2, 1, 3, 5,
    0, 1, 4, 1, 5, 4,
    2, 4, 3, 3, 4, 5,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addDeckSeams(group, material) {
  // Welded/planked steel panels: one preallocated instanced draw rather than dozens of meshes.
  const longitudinal = [-12, -9, -6, -3, 3, 6, 9, 12];
  const transverseCount = 31;
  const seams = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1), material, longitudinal.length + transverseCount,
  );
  const temp = new THREE.Object3D();
  let index = 0;
  for (const x of longitudinal) {
    temp.position.set(x, 0.025, 0);
    temp.scale.set(0.035, 0.024, 238);
    temp.updateMatrix();
    seams.setMatrixAt(index++, temp.matrix);
  }
  for (let i = 0; i < transverseCount; i++) {
    temp.position.set(0, 0.028, -116 + i * (232 / (transverseCount - 1)));
    temp.scale.set(29.2, 0.022, 0.035);
    temp.updateMatrix();
    seams.setMatrixAt(index++, temp.matrix);
  }
  seams.receiveShadow = true;
  seams.userData.noShadow = true;
  group.add(seams);
}

function addDeckEdgeDetail(group, catwalkMaterial, railMaterial) {
  box(group, { x: 2.5, y: 0.42, z: 214 }, new THREE.Vector3(-16.0, -1.05, 3), catwalkMaterial);
  box(group, { x: 2.5, y: 0.42, z: 214 }, new THREE.Vector3(16.0, -1.05, 3), catwalkMaterial);

  const positions = [];
  for (const side of [-1, 1]) {
    const x = side * 17.0;
    positions.push(x, -0.72, -104, x, -0.72, 110);
    positions.push(x, 0.15, -104, x, 0.15, 110);
    for (let z = -104; z <= 110; z += 13.4) positions.push(x, -0.72, z, x, 0.15, z);
  }
  const rails = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)),
    railMaterial,
  );
  group.add(rails);
}

function addDeckWear(group, material) {
  // Restrained rubber/scuff ribbons give the landing area direction and use-history at eye level.
  // One instanced draw keeps them cheaper than a texture and avoids shimmering coplanar decals.
  const marks = [
    [-3.5, -18, 0.36, 46, -0.004], [3.3, -14, 0.32, 52, 0.006],
    [-2.8, 7, 0.24, 29, 0.011], [2.7, 10, 0.22, 34, -0.009],
    [-4.3, -2, 0.18, 23, 0.018], [4.1, 2, 0.17, 25, -0.015],
  ];
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, marks.length);
  const temp = new THREE.Object3D();
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    temp.position.set(mark[0], 0.19, mark[1]);
    temp.rotation.set(0, mark[4], 0);
    temp.scale.set(mark[2], 0.018, mark[3]);
    temp.updateMatrix();
    mesh.setMatrixAt(i, temp.matrix);
  }
  mesh.receiveShadow = true;
  mesh.userData.noShadow = true;
  group.add(mesh);
}

function addDeckEdgeLights(group, material) {
  // Tiny fixed deck lamps are invaluable scale and perspective cues in the groove, even by day.
  const countPerSide = 15;
  const lamps = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.095, 6, 4), material, countPerSide * 2,
  );
  const temp = new THREE.Object3D();
  let index = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < countPerSide; i++) {
      temp.position.set(side * 14.62, 0.19, -108 + i * (216 / (countPerSide - 1)));
      temp.scale.setScalar(i % 4 === 0 ? 1.18 : 1);
      temp.updateMatrix();
      lamps.setMatrixAt(index++, temp.matrix);
    }
  }
  lamps.userData.noShadow = true;
  group.add(lamps);
}

function addDeckTieDowns(group, material) {
  // Recessed six-point tie-down cups are a strong close-range scale cue. One instanced draw keeps
  // the full deck grid cheaper than a texture lookup and the slight lift avoids coplanar flicker.
  const columns = [-12.4, -8.3, -4.15, 0, 4.15, 8.3, 12.4];
  const rows = 27;
  const mesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.085, 6), material, columns.length * rows,
  );
  const temp = new THREE.Object3D();
  let index = 0;
  for (let row = 0; row < rows; row++) {
    const z = -108 + row * (216 / (rows - 1));
    for (const x of columns) {
      temp.position.set(x, 0.116, z);
      temp.rotation.set(-Math.PI / 2, 0, (row & 1) * Math.PI / 6);
      temp.updateMatrix();
      mesh.setMatrixAt(index++, temp.matrix);
    }
  }
  mesh.receiveShadow = true;
  mesh.userData.noShadow = true;
  group.add(mesh);
}

function addCarrierContactShadows(group) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x050708,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const patches = [
    [10.7, -28, 5.8, 18],
    [-9.2, -70, 1.55, 8.5],
    [-9.0, -91, 1.55, 8.5],
    [8.4, -104, 1.55, 8.5],
  ];
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), material, patches.length);
  const temp = new THREE.Object3D();
  for (let i = 0; i < patches.length; i++) {
    temp.position.set(patches[i][0], 0.125, patches[i][1]);
    temp.rotation.set(-Math.PI / 2, 0, 0);
    temp.scale.set(patches[i][2], patches[i][3], 1);
    temp.updateMatrix();
    mesh.setMatrixAt(i, temp.matrix);
  }
  mesh.userData.noShadow = true;
  mesh.renderOrder = 2;
  group.add(mesh);
}

function createCarrierSpray() {
  const count = VISUAL_QUALITY.carrierSprayCount;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const seed = ((i * 37) % count) / count;
    const side = i & 1 ? 1 : -1;
    positions[i * 3] = side * (0.9 + seed * 4.8);
    positions[i * 3 + 1] = 0.15 + ((i * 13) % 9) * 0.055;
    positions[i * 3 + 2] = -127 + seed * 8.5;
    seeds[i] = seed + (i & 1) * 0.013;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, VISUAL_QUALITY.pixelRatioCap) },
    uFogColor: { value: new THREE.Color(0x7898a0) },
    uFogDensity: { value: 0.000055 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vSprayAlpha;
      varying vec3 vSprayWorld;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        float age = fract(uTime * (0.18 + aSeed * 0.045) + aSeed);
        float side = sign(position.x);
        vec3 animated = position;
        animated.x += side * age * (6.0 + aSeed * 8.0);
        animated.y += sin(age * 3.14159265) * (2.0 + aSeed * 2.8) - age * age * 1.2;
        animated.z += age * (15.0 + aSeed * 21.0);
        vec4 world = modelMatrix * vec4(animated, 1.0);
        vec4 view = viewMatrix * world;
        vSprayWorld = world.xyz;
        vSprayAlpha = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.58, 1.0, age));
        gl_PointSize = clamp((3.0 + aSeed * 3.0) * 170.0 / max(-view.z, 1.0), 1.0, 8.0)
          * uPixelRatio;
        gl_Position = projectionMatrix * view;
        // Glitch fix: conventional point depth did not compare correctly with the logarithmic sea.
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying float vSprayAlpha;
      varying vec3 vSprayWorld;
      #include <logdepthbuf_pars_fragment>
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float soft = 1.0 - smoothstep(0.16, 0.5, length(point));
        float fog = 1.0 - exp(-uFogDensity * uFogDensity
          * dot(vSprayWorld - cameraPosition, vSprayWorld - cameraPosition));
        vec3 color = mix(vec3(0.78, 0.88, 0.87), uFogColor, fog);
        gl_FragColor = vec4(color, soft * vSprayAlpha * 0.66 * (1.0 - fog));
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  return { points, uniforms };
}

function createBarrier(material, netMaterial) {
  const barrier = new THREE.Group();
  box(barrier, { x: 0.3, y: 4.6, z: 0.3 }, new THREE.Vector3(-13.2, 2.3, 0), material);
  box(barrier, { x: 0.3, y: 4.6, z: 0.3 }, new THREE.Vector3(13.2, 2.3, 0), material);
  box(barrier, { x: 26.2, y: 0.18, z: 0.24 }, new THREE.Vector3(0, 4.3, 0), material);
  const net = box(barrier, { x: 25.8, y: 3.3, z: 0.08 }, new THREE.Vector3(0, 2.35, 0), netMaterial);
  // Glitch fix: a translucent net was casting as an opaque rectangular shadow slab.
  net.userData.noShadow = true;
  net.renderOrder = 3;
  barrier.position.z = -43;
  return barrier;
}

function createCarrier() {
  // Essex-like straight deck authored in the same local frame the old deck used: local -Z is the
  // bow, +X is starboard, and y=0 is the landing surface. updateCarrierVisual() scales it from the
  // kernel deck fields and app.js applies the established (x, y, -z), rotation.y=-heading transform.
  const group = new THREE.Group();
  const structure = new THREE.Group();
  group.add(structure);

  const hullMat = makeMaterial(0x3c4950, 0.66, 0.06, 0x010203,
    { grain: 0.13, grainScale: 0.19, hullBands: true, envMapIntensity: 0.62 });
  const hullDark = makeMaterial(0x202b31, 0.78, 0.05, 0x000101, { grain: 0.11 });
  const deckMat = makeMaterial(0x292f30, 0.77, 0.04, 0x010202,
    { grain: 0.18, grainScale: 0.34, specularIntensity: 0.5 });
  const islandMat = makeMaterial(0x59666c, 0.61, 0.05, 0x010202,
    { grain: 0.1, grainScale: 0.8 });
  const islandLight = makeMaterial(0x6b777b, 0.58, 0.045, 0x010202,
    { grain: 0.08, grainScale: 0.9 });
  const aircraftMat = makeMaterial(0x687577, 0.54, 0.07, 0x000101,
    { grain: 0.09, grainScale: 1.7 });
  const glass = makeMaterial(0x0e2833, 0.13, 0.03, 0x02090c,
    { grain: 0, clearcoat: 1, clearcoatRoughness: 0.1, specularIntensity: 1, envMapIntensity: 1.25 });
  const paint = depthBiasDeckMaterial(
    makeMaterial(0xdad8c7, 0.68, 0.01, 0x000000, { grain: 0.06 }),
  );
  const yellowPaint = depthBiasDeckMaterial(
    makeMaterial(0xc7a94f, 0.7, 0.01, 0x000000, { grain: 0.08 }),
  );
  const seamMat = depthBiasDeckMaterial(makeMaterial(0x111719, 0.96, 0.02));
  const skidMat = depthBiasDeckMaterial(makeMaterial(0x0b0f10, 1.0, 0.01));
  const laneMat = depthBiasDeckMaterial(makeMaterial(0x303739, 0.95, 0.04));
  const deckPatchMat = depthBiasDeckMaterial(makeMaterial(0x202b31, 0.78, 0.05, 0x000101,
    { grain: 0.11 }));
  const catwalkMat = makeMaterial(0x27343a, 0.86, 0.18);
  // Glitch fix: translucent rails wrote depth and intermittently punched holes in later effects.
  const railMat = new THREE.LineBasicMaterial({
    color: 0x718087, transparent: true, opacity: 0.72, depthWrite: false,
  });
  const barrierNet = makeMaterial(0x9aa6a5, 0.86, 0.03, 0x000000, { grain: 0.04 });
  barrierNet.transparent = true;
  barrierNet.opacity = 0.28;
  barrierNet.depthWrite = false;
  const deckLampMat = makeMaterial(0xb6d6cf, 0.32, 0.25, 0x315e58);

  const hull = new THREE.Mesh(createHullGeometry(), hullMat);
  // Glitch fix: large ship surfaces must not disappear from child-mesh bounds at screen edges.
  hull.frustumCulled = false;
  structure.add(hull);
  const flightDeck = box(structure, { x: 30, y: 1.8, z: 250 }, new THREE.Vector3(0, -0.9, 0), deckMat);
  flightDeck.frustumCulled = false;
  const roundDown = new THREE.Mesh(createRoundDownGeometry(), deckMat);
  roundDown.frustumCulled = false;
  structure.add(roundDown);
  addDeckSeams(structure, seamMat);
  addDeckTieDowns(structure, seamMat);
  addDeckEdgeDetail(structure, catwalkMat, railMat);
  addDeckEdgeLights(structure, deckLampMat);
  box(structure, { x: 27.5, y: 3.0, z: 226 }, new THREE.Vector3(0, -3.05, 2), hullDark);
  box(structure, { x: 31.2, y: 0.32, z: 218 }, new THREE.Vector3(0, -2.0, 2), islandMat);

  // The landing-area group rotates independently of the ship for the nine-degree angled deck.
  // It is anchored at wire three; local -Z is rollout/bolter direction.
  const landingArea = new THREE.Group();
  structure.add(landingArea);
  deckOverlayBox(landingArea, { x: 25.2, y: 0.065, z: 208 }, new THREE.Vector3(0, 0.065, -44), laneMat);
  addDeckWear(landingArea, skidMat);
  deckOverlayBox(landingArea, { x: 0.62, y: 0.09, z: 202 }, new THREE.Vector3(0, 0.12, -43), paint);
  deckOverlayBox(landingArea, { x: 0.26, y: 0.085, z: 204 }, new THREE.Vector3(-11.9, 0.115, -43), paint);
  deckOverlayBox(landingArea, { x: 0.26, y: 0.085, z: 204 }, new THREE.Vector3(11.9, 0.115, -43), paint);
  deckOverlayBox(structure, { x: 8.0, y: 0.08, z: 0.32 }, new THREE.Vector3(-7.7, 0.09, -37), yellowPaint);
  deckOverlayBox(structure, { x: 8.0, y: 0.08, z: 0.32 }, new THREE.Vector3(7.7, 0.09, -37), yellowPaint);
  deckOverlayBox(structure, { x: 10.5, y: 0.07, z: 20 }, new THREE.Vector3(-7.4, 0.075, -15), deckPatchMat);
  deckOverlayBox(structure, { x: 11.0, y: 0.07, z: 20 }, new THREE.Vector3(7.2, 0.075, 24), deckPatchMat);

  deckOverlayBox(landingArea, { x: 25, y: 0.10, z: 1.7 }, new THREE.Vector3(0, 0.14, 0), paint);
  deckOverlayBox(landingArea, { x: 0.42, y: 0.11, z: 30 }, new THREE.Vector3(-5.5, 0.15, 1), yellowPaint);
  deckOverlayBox(landingArea, { x: 0.42, y: 0.11, z: 30 }, new THREE.Vector3(5.5, 0.15, 1), yellowPaint);
  const wires = [];
  for (let wire = 1; wire <= 4; wire++) {
    const wireMaterial = makeMaterial(0xc9b47a, 0.38, 0.72, 0x000000,
      { grain: 0.035, grainScale: 8, specularIntensity: 0.9, envMapIntensity: 1.0 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 23.5, 10), wireMaterial);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(0, 0.24, (3 - wire) * 5.2);
    mesh.castShadow = true;
    landingArea.add(mesh);
    wires.push(mesh);
  }

  const barrier = createBarrier(islandLight, barrierNet);
  structure.add(barrier);

  // Starboard island: stepped bridge, dark glazing, funnel, lattice mast and a simple radar yard.
  beveledBox(structure, { x: 7.2, y: 4.8, z: 27 }, new THREE.Vector3(10.8, 2.35, -25), islandMat, 0.32);
  beveledBox(structure, { x: 6.5, y: 5.6, z: 18 }, new THREE.Vector3(10.7, 7.45, -29), islandLight, 0.28);
  beveledBox(structure, { x: 7.6, y: 3.8, z: 13 }, new THREE.Vector3(10.4, 12.0, -33), islandMat, 0.24);
  box(structure, { x: 6.6, y: 0.9, z: 10.5 }, new THREE.Vector3(10.3, 12.7, -39.7), glass);
  box(structure, { x: 0.3, y: 0.9, z: 10.0 }, new THREE.Vector3(6.45, 12.7, -33), glass);
  verticalCylinder(structure, 2.0, 8.4, new THREE.Vector3(11.2, 17.0, -20), hullDark, 12);
  verticalCylinder(structure, 0.34, 13.5, new THREE.Vector3(10.7, 24.0, -34), islandLight, 10);
  box(structure, { x: 10.5, y: 0.26, z: 0.34 }, new THREE.Vector3(10.7, 27.4, -34), islandLight);
  box(structure, { x: 0.28, y: 0.26, z: 6.5 }, new THREE.Vector3(10.7, 27.4, -34), islandLight);
  box(structure, { x: 5.8, y: 1.3, z: 0.22 }, new THREE.Vector3(10.7, 29.5, -34), islandLight);

  // Port-quarter LSO platform and lens: a small but distinctive recovery cue on short final.
  box(structure, { x: 3.4, y: 0.34, z: 4.8 }, new THREE.Vector3(-16.4, -0.35, 82), catwalkMat);
  box(structure, { x: 0.18, y: 1.35, z: 2.9 }, new THREE.Vector3(-17.65, 0.34, 82), islandLight);
  const lens = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 5), deckLampMat, 5);
  const lensTransform = new THREE.Object3D();
  for (let i = 0; i < 5; i++) {
    lensTransform.position.set(-17.65 + (i - 2) * 0.31, 0.72, 84.46);
    lensTransform.updateMatrix();
    lens.setMatrixAt(i, lensTransform.matrix);
  }
  lens.userData.noShadow = true;
  structure.add(lens);

  // Side sponsons and compact gun tubs strengthen the period silhouette without cluttering final.
  for (const x of [-15.1, 15.1]) {
    for (const z of [-67, 69]) {
      box(structure, { x: 3.8, y: 0.7, z: 9 }, new THREE.Vector3(x, -1.7, z), hullDark);
      verticalCylinder(structure, 1.15, 0.75, new THREE.Vector3(x, -0.95, z), islandMat, 10);
    }
  }
  addParkedAircraft(structure, aircraftMat, glass);
  addCarrierContactShadows(structure);

  const wake = createWakeMaterial();
  const wakeMesh = new THREE.Mesh(createWakeGeometry(), wake.material);
  // Glitch fix: shader-displaced wake vertices exceeded static bounds and popped at frustum edges.
  wakeMesh.frustumCulled = false;
  wakeMesh.renderOrder = -2;
  const bowWake = createWakeMaterial(true);
  const bowWakeMesh = new THREE.Mesh(createWakeGeometry(-131, 118, 13.5, 28), bowWake.material);
  bowWakeMesh.frustumCulled = false;
  bowWakeMesh.renderOrder = -1;
  const spray = createCarrierSpray();
  group.add(wakeMesh, bowWakeMesh, spray.points);

  structure.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = object.userData.noShadow !== true;
    object.receiveShadow = true;
  });
  group.userData.structure = structure;
  group.userData.hull = hull;
  group.userData.landingArea = landingArea;
  group.userData.wires = wires;
  group.userData.barrier = barrier;
  group.userData.highlightedWire = 0;
  group.userData.wakes = [wakeMesh, bowWakeMesh];
  group.userData.wakeUniforms = [wake.uniforms, bowWake.uniforms];
  group.userData.spray = spray.points;
  group.userData.sprayUniforms = spray.uniforms;
  return group;
}

function updateCarrierVisual(carrier, state, nowSeconds, fogColor, fogDensity) {
  const deckLength = Number.isFinite(state.deck_len) ? Math.max(100, state.deck_len) : 250;
  const deckWidth = Number.isFinite(state.deck_w) ? Math.max(18, state.deck_w) : 30;
  const deckAltitude = Number.isFinite(state.deck_alt) ? Math.max(8, state.deck_alt) : 20;
  const scaleX = deckWidth / 30;
  const scaleZ = deckLength / 250;
  // Glitch fix: deck heave moved the wake through the sea; cancel parent Y and keep a fixed lift.
  const seaLocalY = -carrier.position.y;
  carrier.userData.structure.scale.set(scaleX, 1, scaleZ);
  carrier.userData.hull.scale.y = deckAltitude / 20;
  for (let i = 0; i < carrier.userData.wakes.length; i++) {
    carrier.userData.wakes[i].scale.set(scaleX, 1, scaleZ);
    carrier.userData.wakes[i].position.y = seaLocalY + 0.18;
    carrier.userData.wakeUniforms[i].uTime.value = nowSeconds;
    carrier.userData.wakeUniforms[i].uFogColor.value.copy(fogColor);
    carrier.userData.wakeUniforms[i].uFogDensity.value = fogDensity;
  }
  carrier.userData.spray.scale.set(scaleX, 1, scaleZ);
  carrier.userData.spray.position.y = seaLocalY;
  carrier.userData.sprayUniforms.uTime.value = nowSeconds;
  carrier.userData.sprayUniforms.uFogColor.value.copy(fogColor);
  carrier.userData.sprayUniforms.uFogDensity.value = fogDensity;

  // Resolve the kernel touchdown point into the established carrier-local frame. This keeps the
  // painted wire zone coincident with tx/tz even when heading or deck dimensions vary.
  if (Number.isFinite(state.tx) && Number.isFinite(state.tz)) {
    const heading = Number.isFinite(state.cheading) ? state.cheading : 0;
    const dx = state.tx - state.cx;
    const dz = state.cz - state.tz; // sim Z was negated for the render world
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    carrier.userData.landingArea.position.x = (c * dx + s * dz) / scaleX;
    carrier.userData.landingArea.position.z = (-s * dx + c * dz) / scaleZ;
    const landingHeading = Number.isFinite(state.landing_heading) ? state.landing_heading : heading;
    carrier.userData.landingArea.rotation.y = -(landingHeading - heading);
  }

  const axial = state.deck_config !== "ANGLED";
  carrier.userData.barrier.visible = axial;
  const caughtWire = state.arrest_phase === "ARRESTED" || state.arrest_phase === "STOPPED"
    ? Math.max(0, Math.min(4, Number(state.wire) || 0)) : 0;
  if (caughtWire !== carrier.userData.highlightedWire) {
    carrier.userData.highlightedWire = caughtWire;
    for (let i = 0; i < carrier.userData.wires.length; i++) {
      const caught = i + 1 === caughtWire;
      carrier.userData.wires[i].material.color.setHex(caught ? 0xffd060 : 0xc9b47a);
      carrier.userData.wires[i].material.emissive.setHex(caught ? 0x5a2b00 : 0x000000);
    }
  }
}

function createLoftGeometry(stations, radialSegments = 18) {
  const positions = [];
  const indices = [];
  for (const station of stations) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const theta = segment / radialSegments * Math.PI * 2;
      positions.push(
        Math.cos(theta) * station.rx,
        station.y + Math.sin(theta) * station.ry,
        station.z,
      );
    }
  }
  for (let station = 0; station < stations.length - 1; station++) {
    const a = station * radialSegments;
    const b = a + radialSegments;
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      indices.push(a + segment, a + next, b + segment);
      indices.push(a + next, b + next, b + segment);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createPlanformGeometry(points, thickness = 0.16, bevel = 0.045) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, thickness - bevel * 2),
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, thickness * 0.5, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function createFinGeometry(points, thickness = 0.12) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness * 0.55,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: thickness * 0.22,
    bevelThickness: thickness * 0.22,
    steps: 1,
  });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(thickness * 0.5, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function addFighterPanelLines(group, material) {
  const positions = [];
  const add = (ax, ay, az, bx, by, bz) => positions.push(ax, ay, az, bx, by, bz);
  for (const side of [-1, 1]) {
    add(side * 0.9, 0.215, -2.78, side * 4.82, 0.215, 0.42);
    add(side * 1.35, 0.218, -1.58, side * 4.18, 0.218, 0.77);
    add(side * 1.7, 0.218, 0.72, side * 4.66, 0.218, 0.82);
    add(side * 0.72, 0.22, 3.05, side * 2.75, 0.22, 4.28);
  }
  // Glitch fix: the former ring radii were inside the fuselage, so the lines popped through it.
  const rings = [
    [0.25, 0.82, 0.76, 0.1],
    [1.75, 0.77, 0.71, 0.1],
    [3.15, 0.67, 0.61, 0.1],
  ];
  const ringSegments = 14;
  for (const [z, radiusX, radiusY, centreY] of rings) {
    for (let i = 0; i < ringSegments; i++) {
      const a = i / ringSegments * Math.PI * 2;
      const b = (i + 1) / ringSegments * Math.PI * 2;
      add(Math.cos(a) * radiusX, centreY + Math.sin(a) * radiusY, z,
        Math.cos(b) * radiusX, centreY + Math.sin(b) * radiusY, z);
    }
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)),
    material,
  );
  lines.renderOrder = 2;
  group.add(lines);
}

function createDrone() {
  const group = new THREE.Group();
  const skin = makeMaterial(0x667276, 0.48, 0.075, 0x010202,
    { grain: 0.12, grainScale: 2.3, panels: 0.025, panelScale: 0.52, envMapIntensity: 0.92 });
  const skinDark = makeMaterial(0x465157, 0.56, 0.055, 0x010202,
    { grain: 0.1, grainScale: 2.7, envMapIntensity: 0.78 });
  const underside = makeMaterial(0x303a3f, 0.62, 0.045, 0x000101,
    { grain: 0.11, grainScale: 2.1, envMapIntensity: 0.65 });
  const edge = makeMaterial(0x171f23, 0.64, 0.05, 0x000000, { grain: 0.06 });
  const intake = makeMaterial(0x080d0f, 0.38, 0.12, 0x000000,
    { grain: 0.03, envMapIntensity: 0.3 });
  const canopy = makeMaterial(0x102e3a, 0.095, 0.02, 0x02090d,
    { grain: 0, clearcoat: 1, clearcoatRoughness: 0.065, specularIntensity: 1, envMapIntensity: 1.35 });

  // The primary wing is a shallow beveled solid, so it catches a narrow leading-edge highlight
  // instead of disappearing as a two-sided card. Aircraft local -Z remains forward throughout.
  const wingPoints = [
    [0, -3.72], [-0.74, -3.36], [-2.05, -2.26], [-5.42, 0.18], [-5.18, 0.98],
    [-2.05, 0.72], [-1.52, 3.48], [0, 3.88], [1.52, 3.48], [2.05, 0.72],
    [5.18, 0.98], [5.42, 0.18], [2.05, -2.26], [0.74, -3.36],
  ];
  const wing = new THREE.Mesh(createPlanformGeometry(wingPoints, 0.18, 0.052), [skin, skinDark]);
  wing.position.y = 0.03;
  group.add(wing);

  const tailPoints = [
    [0, 2.62], [-0.7, 2.72], [-3.0, 4.04], [-2.86, 4.62], [-0.72, 4.23],
    [0, 4.52], [0.72, 4.23], [2.86, 4.62], [3.0, 4.04], [0.7, 2.72],
  ];
  const tailplane = new THREE.Mesh(createPlanformGeometry(tailPoints, 0.14, 0.038), [skin, edge]);
  tailplane.position.y = 0.17;
  group.add(tailplane);

  const fuselage = new THREE.Mesh(createLoftGeometry([
    { z: -6.65, rx: 0.025, ry: 0.025, y: 0.02 },
    { z: -5.65, rx: 0.34, ry: 0.30, y: 0.04 },
    { z: -4.35, rx: 0.62, ry: 0.54, y: 0.08 },
    { z: -2.6, rx: 0.78, ry: 0.72, y: 0.11 },
    { z: -0.2, rx: 0.82, ry: 0.76, y: 0.10 },
    { z: 2.55, rx: 0.70, ry: 0.64, y: 0.09 },
    { z: 4.65, rx: 0.48, ry: 0.43, y: 0.1 },
    { z: 5.65, rx: 0.18, ry: 0.17, y: 0.1 },
  ]), skin);
  group.add(fuselage);

  // Separate shoulder nacelles, recessed intake faces and hot-metal exhaust rings make the target
  // read as a powered fighter from front and rear quarters, where most padlock views live.
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(createLoftGeometry([
      { z: -2.75, rx: 0.48, ry: 0.38, y: -0.12 },
      { z: -1.8, rx: 0.62, ry: 0.48, y: -0.08 },
      { z: 2.9, rx: 0.58, ry: 0.45, y: -0.04 },
      { z: 4.65, rx: 0.43, ry: 0.36, y: 0.0 },
    ], 14), underside);
    nacelle.position.x = side * 1.08;
    group.add(nacelle);

    const intakeFace = new THREE.Mesh(new THREE.CircleGeometry(0.43, 18), intake);
    intakeFace.scale.y = 0.76;
    intakeFace.position.set(side * 1.08, -0.12, -2.765);
    intakeFace.rotation.y = Math.PI;
    group.add(intakeFace);
    const intakeLip = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.055, 6, 18), skinDark);
    intakeLip.scale.y = 0.76;
    intakeLip.position.copy(intakeFace.position);
    group.add(intakeLip);

    const exhaustFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 18),
      // Glitch fix: translucent exhaust discs wrote opaque depth and popped against the nacelles.
      new THREE.MeshBasicMaterial({
        color: 0xdf6f28,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
      }),
    );
    exhaustFace.position.set(side * 1.08, 0.0, 4.67);
    exhaustFace.userData.noShadow = true;
    exhaustFace.renderOrder = 1;
    group.add(exhaustFace);
    const exhaustRing = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.065, 7, 18), edge);
    exhaustRing.position.copy(exhaustFace.position);
    group.add(exhaustRing);
  }

  const canopyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12), canopy);
  canopyMesh.scale.set(0.88, 0.72, 2.25);
  canopyMesh.position.set(0, 0.72, -2.55);
  group.add(canopyMesh);
  box(group, new THREE.Vector3(0.075, 0.055, 2.45), new THREE.Vector3(0, 1.11, -2.35), edge);
  box(group, new THREE.Vector3(1.02, 0.055, 0.075), new THREE.Vector3(0, 1.08, -1.55), edge);

  const finGeometry = createFinGeometry([
    [1.72, 0.0], [4.62, 0.0], [4.1, 2.55], [3.38, 3.04], [2.45, 0.3],
  ]);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(finGeometry, [skinDark, edge]);
    fin.position.set(side * 1.04, 0.24, 0);
    fin.rotation.z = side * -0.2;
    group.add(fin);
  }

  addFighterPanelLines(group, new THREE.LineBasicMaterial({
    // Glitch fix: transparent linework must not occlude later transparent combat effects.
    color: 0x1b2529, transparent: true, opacity: 0.46, depthWrite: false,
  }));

  const leftLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4b58, toneMapped: false }),
  );
  leftLight.position.set(-5.28, 0.21, 0.55);
  leftLight.userData.noShadow = true;
  group.add(leftLight);
  const rightLight = leftLight.clone();
  rightLight.material = new THREE.MeshBasicMaterial({ color: 0x62ffc0, toneMapped: false });
  rightLight.position.x = 5.28;
  rightLight.userData.noShadow = true;
  group.add(rightLight);

  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = object.userData.noShadow !== true;
    object.receiveShadow = true;
  });
  return group;
}

function createFireballMaterial(coreColor, edgeColor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlpha: { value: 0 },
      uAge: { value: 0 },
      uCoreColor: { value: new THREE.Color(coreColor) },
      uEdgeColor: { value: new THREE.Color(edgeColor) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vFirePosition;
      varying vec3 vFireNormal;
      varying vec3 vFireView;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vFirePosition = position;
        vFireNormal = normalize(normalMatrix * normal);
        vec4 view = viewMatrix * world;
        vFireView = -view.xyz;
        gl_Position = projectionMatrix * view;
        // Glitch fix: conventional effect depth caused occlusion pops in a logarithmic-depth scene.
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAlpha;
      uniform float uAge;
      uniform vec3 uCoreColor;
      uniform vec3 uEdgeColor;
      varying vec3 vFirePosition;
      varying vec3 vFireNormal;
      varying vec3 vFireView;
      #include <logdepthbuf_pars_fragment>
      void main() {
        vec3 p = normalize(vFirePosition);
        float billow = sin(p.x * 11.0 + p.y * 7.0 - uAge * 8.0);
        billow += sin(p.z * 17.0 - p.x * 5.0 + uAge * 5.3) * 0.55;
        billow += sin((p.x + p.y - p.z) * 25.0 - uAge * 11.0) * 0.23;
        billow = billow * 0.22 + 0.55;
        float facing = max(dot(normalize(vFireNormal), normalize(vFireView)), 0.0);
        float softEdge = smoothstep(0.0, 0.42, facing);
        float hot = smoothstep(0.34, 0.78, billow + facing * 0.24);
        vec3 color = mix(uEdgeColor, uCoreColor, hot);
        gl_FragColor = vec4(color, uAlpha * softEdge * (0.66 + billow * 0.45));
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createSmokePuffMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlpha: { value: 0 },
      uAge: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vSmokePosition;
      varying vec3 vSmokeNormal;
      varying vec3 vSmokeView;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vSmokePosition = position;
        vSmokeNormal = normalize(normalMatrix * normal);
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vSmokeView = -view.xyz;
        gl_Position = projectionMatrix * view;
        // Glitch fix: smoke used linear depth against logarithmic world geometry and flickered out.
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAlpha;
      uniform float uAge;
      uniform vec3 uColor;
      varying vec3 vSmokePosition;
      varying vec3 vSmokeNormal;
      varying vec3 vSmokeView;
      #include <logdepthbuf_pars_fragment>
      void main() {
        vec3 p = normalize(vSmokePosition);
        float detail = sin(p.x * 9.0 + p.y * 13.0 + uAge * 0.7);
        detail += sin(p.z * 16.0 - p.x * 7.0 - uAge * 0.43) * 0.45;
        float facing = max(dot(normalize(vSmokeNormal), normalize(vSmokeView)), 0.0);
        float softEdge = smoothstep(0.02, 0.52 + detail * 0.055, facing);
        vec3 smokeColor = uColor * (0.84 + detail * 0.045 + facing * 0.11);
        gl_FragColor = vec4(smokeColor, uAlpha * softEdge);
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createBanditDestruction() {
  // Built once, then animated by transforms and pre-existing shader uniforms only. The kernel freezes on Splash,
  // so this render-clock effect supplies the visible payoff without asking the sim to keep moving.
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 14, 10);
  const outerMaterial = createFireballMaterial(0xffb13b, 0xe8380c);
  const innerMaterial = createFireballMaterial(0xfff0a0, 0xff731c);
  const outer = new THREE.Mesh(sphere, outerMaterial);
  const inner = new THREE.Mesh(sphere, innerMaterial);
  outer.renderOrder = 12;
  inner.renderOrder = 13;
  group.add(outer, inner);

  const shockwaveMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb14c,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shockwave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 6, 28), shockwaveMaterial);
  shockwave.renderOrder = 14;
  group.add(shockwave);

  const debrisDirections = new Float32Array([
    -0.82, 0.28, 0.49,  0.76, 0.45, -0.47, -0.52, 0.81, 0.27,
     0.46, 0.75, 0.48, -0.19, -0.38, 0.90,  0.25, -0.72, -0.65,
     0.91, -0.08, 0.39, -0.68, -0.48, 0.56,  0.36, 0.19, -0.91,
    -0.31, 0.91, 0.27,  0.61, -0.31, 0.72, -0.56, 0.52, -0.64,
     0.12, 0.98, -0.18, -0.94, 0.09, -0.32,  0.84, 0.22, 0.50,
     0.47, -0.73, 0.50, -0.39, -0.61, -0.69,  0.03, 0.56, 0.83,
  ]);
  const debrisPositions = new Float32Array(debrisDirections.length);
  const debrisGeometry = new THREE.BufferGeometry();
  debrisGeometry.setAttribute("position",
    new THREE.BufferAttribute(debrisPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const debris = new THREE.Points(debrisGeometry, new THREE.PointsMaterial({
    color: 0xffc260,
    size: 2.8,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  debris.frustumCulled = false;
  debris.renderOrder = 15;
  group.add(debris);

  const smokeDirections = [
    [-0.62, 0.72, -0.18], [0.38, 0.86, 0.31], [0.72, 0.48, -0.44],
    [-0.28, 0.94, 0.52], [0.12, 1.0, -0.68], [-0.78, 0.58, 0.41],
  ];
  const smoke = [];
  for (let i = 0; i < smokeDirections.length; i++) {
    const material = createSmokePuffMaterial(i < 2 ? 0x3b3530 : 0x252a2c);
    const puff = new THREE.Mesh(sphere, material);
    puff.userData.direction = new THREE.Vector3(
      smokeDirections[i][0], smokeDirections[i][1], smokeDirections[i][2],
    ).normalize();
    puff.userData.delay = i * 0.1;
    puff.renderOrder = 11;
    smoke.push(puff);
    group.add(puff);
  }

  const flash = new THREE.PointLight(0xff6a22, 0, 95, 2);
  group.add(flash);
  group.userData.outer = outer;
  group.userData.inner = inner;
  group.userData.shockwave = shockwave;
  group.userData.debris = debris;
  group.userData.debrisDirections = debrisDirections;
  group.userData.debrisPositions = debrisPositions;
  group.userData.smoke = smoke;
  group.userData.flash = flash;
  group.visible = false;
  return group;
}

function createGunEffects() {
  // Every GPU object and backing array is allocated once. The flight loop only overwrites these
  // buffers, so a long burst cannot create a garbage-collector hitch at the moment of payoff.
  const tracerPositions = new Float32Array(MAX_TRACERS * 2 * 3);
  const tracerGeometry = new THREE.BufferGeometry();
  tracerGeometry.setAttribute("position",
    new THREE.BufferAttribute(tracerPositions, 3).setUsage(THREE.DynamicDrawUsage));
  tracerGeometry.setDrawRange(0, 0);
  const tracers = new THREE.LineSegments(
    tracerGeometry,
    new THREE.LineBasicMaterial({
      color: 0xffd36a,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  tracers.frustumCulled = false;
  tracers.renderOrder = 20;
  const tracerGlow = new THREE.LineSegments(
    tracerGeometry,
    new THREE.LineBasicMaterial({
      color: 0xff731d,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  tracerGlow.frustumCulled = false;
  tracerGlow.renderOrder = 19;

  const tracerHeadPositions = new Float32Array(MAX_TRACERS * 3);
  const tracerHeadGeometry = new THREE.BufferGeometry();
  tracerHeadGeometry.setAttribute("position",
    new THREE.BufferAttribute(tracerHeadPositions, 3).setUsage(THREE.DynamicDrawUsage));
  tracerHeadGeometry.setDrawRange(0, 0);
  const tracerHeads = new THREE.Points(
    tracerHeadGeometry,
    new THREE.PointsMaterial({
      color: 0xfff0b0,
      size: 2.25,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  tracerHeads.frustumCulled = false;
  tracerHeads.renderOrder = 21;

  const muzzleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd45c,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), muzzleMaterial);
  muzzle.visible = false;
  muzzle.renderOrder = 22;
  const muzzleConeGeometry = new THREE.ConeGeometry(0.46, 3.6, 8);
  muzzleConeGeometry.rotateX(-Math.PI / 2);
  const muzzleCone = new THREE.Mesh(muzzleConeGeometry, muzzleMaterial.clone());
  muzzleCone.visible = false;
  muzzleCone.renderOrder = 22;
  const muzzleLight = new THREE.PointLight(0xffa42c, 0, 38, 2);

  const sparkDirections = new Float32Array([
    -0.88, 0.22, 0.42,  0.84, 0.36, -0.40, -0.48, 0.78, -0.39,
     0.52, 0.72, 0.46, -0.18, -0.42, 0.89,  0.22, -0.75, -0.63,
     0.94, -0.13, 0.31, -0.71, -0.54, 0.44,  0.38, 0.15, -0.91,
    -0.28, 0.93, 0.24,  0.63, -0.36, 0.69, -0.57, 0.48, -0.67,
  ]);
  const sparkPositions = new Float32Array(sparkDirections.length);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position",
    new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const sparkMaterial = new THREE.PointsMaterial({
    color: 0xffc34e,
    size: 3.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.visible = false;
  sparks.frustumCulled = false;
  sparks.renderOrder = 21;
  const hitLight = new THREE.PointLight(0xff8b27, 0, 42, 2);

  const group = new THREE.Group();
  group.add(tracerGlow, tracers, tracerHeads, muzzle, muzzleCone, muzzleLight, sparks, hitLight);
  group.userData.tracers = tracers;
  group.userData.tracerGlow = tracerGlow;
  group.userData.tracerPositions = tracerPositions;
  group.userData.tracerHeads = tracerHeads;
  group.userData.tracerHeadPositions = tracerHeadPositions;
  group.userData.muzzle = muzzle;
  group.userData.muzzleCone = muzzleCone;
  group.userData.muzzleLight = muzzleLight;
  group.userData.sparks = sparks;
  group.userData.sparkPositions = sparkPositions;
  group.userData.sparkDirections = sparkDirections;
  group.userData.hitLight = hitLight;
  return group;
}

function createGlider() {
  const group = new THREE.Group();
  const white = makeMaterial(0xdce4e5, 0.56, 0.12);
  const dark = makeMaterial(0x29353a, 0.72, 0.2);

  cylinder(group, 0.28, 5.8, new THREE.Vector3(0, 0, 0), white, 14);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.15, 14), white);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.45;
  group.add(nose);
  box(group, new THREE.Vector3(22, 0.1, 0.88), new THREE.Vector3(0, 0.08, -0.2), white);
  box(group, new THREE.Vector3(4.5, 0.08, 0.62), new THREE.Vector3(0, 0.25, 2.45), dark);
  box(group, new THREE.Vector3(0.1, 1.6, 1.0), new THREE.Vector3(0, 0.75, 2.45), dark);
  return group;
}

function createAwacs() {
  const group = new THREE.Group();
  const skin = makeMaterial(0xb8c0c2, 0.62, 0.24);
  const lower = makeMaterial(0x707d82, 0.75, 0.22);
  const dark = makeMaterial(0x242e33, 0.7, 0.28);
  const glass = makeMaterial(0x263b48, 0.28, 0.5, 0x061118);

  cylinder(group, 2.25, 37, new THREE.Vector3(0, 0, 0), skin, 20);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.26, 20, 12), skin);
  nose.scale.z = 0.72;
  nose.position.z = -18.5;
  group.add(nose);
  box(group, new THREE.Vector3(40, 0.42, 7.2), new THREE.Vector3(0, 0.1, 1.2), skin);
  box(group, new THREE.Vector3(14, 0.28, 4.8), new THREE.Vector3(0, 1.0, 15.5), lower);
  box(group, new THREE.Vector3(0.35, 7.6, 5.2), new THREE.Vector3(0, 3.2, 15.4), lower);

  for (const x of [-13, -6.6, 6.6, 13]) {
    cylinder(group, 1.05, 5.2, new THREE.Vector3(x, -0.8, 1.0), dark, 14);
    const intake = new THREE.Mesh(
      new THREE.CircleGeometry(0.78, 14),
      new THREE.MeshBasicMaterial({ color: 0x11191d, side: THREE.DoubleSide }),
    );
    intake.rotation.y = Math.PI;
    intake.position.set(x, -0.8, -1.62);
    group.add(intake);
  }

  const cockpit = box(group, new THREE.Vector3(3.45, 1.0, 1.1), new THREE.Vector3(0, 1.15, -17.8), glass);
  cockpit.rotation.x = -0.12;

  const mast = cylinder(group, 0.34, 3.4, new THREE.Vector3(0, 3.45, -0.5), lower, 12);
  mast.rotation.set(0, 0, 0);
  const dome = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.78, 28), skin);
  dome.add(disc);
  box(dome, new THREE.Vector3(10.3, 0.12, 0.18), new THREE.Vector3(0, 0.46, 0), dark);
  box(dome, new THREE.Vector3(0.18, 0.12, 10.3), new THREE.Vector3(0, 0.46, 0), dark);
  dome.position.set(0, 5.3, -0.5);
  group.add(dome);
  group.userData.rotodome = dome;

  return group;
}

function createSky() {
  const uniforms = {
    uTime: { value: 0 },
    uAltitude: { value: 0 },
    uSunDirection: { value: SUN_DIRECTION.clone() },
  };
  const material = new THREE.ShaderMaterial({
    // Glitch fix: disabling sky-shell culling prevents transient missing wedges at sphere seams.
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    uniforms,
    defines: { CLOUD_OCTAVES: VISUAL_QUALITY.cloudOctaves },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;

      void main() {
        vDirection = normalize(mat3(modelMatrix) * position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uAltitude;
      uniform vec3 uSunDirection;
      varying vec3 vDirection;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise21(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(cell);
        float b = hash21(cell + vec2(1.0, 0.0));
        float c = hash21(cell + vec2(0.0, 1.0));
        float e = hash21(cell + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
      }

      float cloudFbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.54;
        mat2 rotation = mat2(0.84, -0.54, 0.54, 0.84);
        for (int octave = 0; octave < CLOUD_OCTAVES; octave++) {
          value += noise21(p) * amplitude;
          p = rotation * p * 2.03 + vec2(7.1, -3.7);
          amplitude *= 0.49;
        }
        return value;
      }

      void main() {
        vec3 d = normalize(vDirection);
        float h = d.y;
        float altitudeMix = smoothstep(2800.0, 21000.0, uAltitude);

        float lowSkyCurve = pow(clamp(max(h, 0.0), 0.0, 1.0), 0.38);
        vec3 lowHorizon = vec3(0.34, 0.50, 0.56);
        vec3 lowZenith = vec3(0.016, 0.13, 0.36);
        vec3 lowSky = mix(lowHorizon, lowZenith, lowSkyCurve);
        float horizonBand = exp(-abs(h) * 18.0);
        lowSky += vec3(0.075, 0.07, 0.042) * horizonBand;
        lowSky = mix(vec3(0.035, 0.11, 0.16), lowSky, smoothstep(-0.12, 0.018, h));

        // The optical depth collapses with altitude. Raising both the scale and exponent is
        // important: a fixed falloff leaves a blue wash across the whole frame at 70,000 ft.
        float limbScale = mix(7.0, 150.0, pow(altitudeMix, 1.25));
        float limbExponent = mix(1.05, 2.75, altitudeMix);
        float limb = exp(-pow(abs(h) * limbScale, limbExponent));
        float brightCore = exp(-pow(abs(h) * mix(22.0, 430.0, altitudeMix), 1.42));
        vec3 space = vec3(0.00035, 0.00055, 0.0055);
        vec3 highSky = space + vec3(0.0018, 0.0028, 0.019) * pow(max(h, 0.0), 0.32);
        highSky += vec3(0.10, 0.38, 0.92) * limb;
        highSky += vec3(0.82, 1.18, 1.48) * brightCore * altitudeMix;

        vec3 color = mix(lowSky, highSky, altitudeMix);

        // Two analytic cloud layers share the atmospheric light: darker optical depth beneath,
        // warm sun-facing shoulders above, and a high streak layer. No texture fetches or sprites.
        vec2 wind = vec2(uTime * 0.0017, -uTime * 0.0009);
        vec2 cloudUv = d.xz / max(h + 0.105, 0.072);
        float cloudBase = cloudFbm(cloudUv * 0.72 + wind);
        float cloudDetail = cloudFbm(cloudUv * 1.77 - wind * 0.37 + 9.4);
        float cloudField = cloudBase * 0.78 + cloudDetail * 0.22;
        float cumulus = smoothstep(0.535, 0.70, cloudField);
        cumulus *= smoothstep(0.012, 0.075, h) * (1.0 - smoothstep(0.27, 0.52, h));
        cumulus *= (1.0 - altitudeMix) * 0.72;
        float sunSample = cloudFbm((cloudUv + normalize(uSunDirection.xz) * 0.15) * 0.72 + wind);
        // Glitch fix: a zero-light procedural sample formed coherent near-black angular patches.
        float cloudLight = clamp(0.48 + (sunSample - cloudBase) * 3.2, 0.12, 1.0);
        float cloudCore = smoothstep(0.61, 0.79, cloudField);
        vec3 cloudShade = mix(vec3(0.36, 0.45, 0.47), vec3(0.87, 0.91, 0.88), cloudLight);
        cloudShade += vec3(0.13, 0.085, 0.035) * cloudLight * (1.0 - altitudeMix);
        color = mix(color, cloudShade, cumulus * (0.56 + cloudCore * 0.34));

        vec2 cirrusUv = d.xz / max(h + 0.28, 0.19);
        float cirrusField = sin(cirrusUv.x * 8.3 + cirrusUv.y * 3.1 + uTime * 0.006);
        cirrusField += 0.57 * sin(cirrusUv.x * -13.7 + cirrusUv.y * 9.6 - uTime * 0.004);
        cirrusField += 0.29 * sin(cirrusUv.x * 25.0 + cirrusUv.y * 14.0);
        float cirrus = smoothstep(1.16, 1.7, cirrusField);
        cirrus *= smoothstep(0.12, 0.38, h) * (1.0 - altitudeMix) * 0.16;
        color = mix(color, vec3(0.76, 0.83, 0.85), cirrus);

        vec2 spherical = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
        vec2 starGrid = spherical * vec2(760.0, 430.0);
        vec2 starCell = floor(starGrid);
        vec2 starUv = fract(starGrid) - 0.5;
        float seed = hash21(starCell);
        float starCore = 1.0 - smoothstep(0.016, 0.065, length(starUv));
        float star = smoothstep(0.9925, 0.9998, seed) * starCore;
        star *= pow(altitudeMix, 1.8) * smoothstep(0.018, 0.15, h);
        color += vec3(0.46, 0.57, 0.78) * star;

        float sunDot = dot(d, normalize(uSunDirection));
        float sunDisc = smoothstep(0.99991, 0.999975, sunDot);
        float sunHalo = pow(max(sunDot, 0.0), mix(210.0, 700.0, altitudeMix));
        float sunAura = pow(max(sunDot, 0.0), 18.0) * (1.0 - altitudeMix * 0.7);
        color += vec3(1.0, 0.80, 0.48) * (sunDisc * 3.25 + sunHalo * 0.4 + sunAura * 0.042);

        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  // Glitch fix: the former 690 km shell amplified float error; depth is disabled, so keep it local.
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4096, 48, 28), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}

function createOceanGeometry(radius = 360000, radialSegments = 145, angularSegments = 192) {
  // Concentric exponential rings spend vertices where a landing pilot needs them: ~7 m radial
  // spacing under the aircraft, ~85 m at 1.5 km, then progressively coarser toward the horizon.
  // This is both lighter and far more useful than uniformly tessellating a 500 km square. The two
  // segment arguments are the explicit quality knobs if a lower-end WebGL target needs scaling.
  const positions = [0, 0, 0];
  const indices = [];
  const growth = 8.0;
  const growthScale = Math.exp(growth) - 1;
  for (let ring = 1; ring <= radialSegments; ring++) {
    const t = ring / radialSegments;
    const ringRadius = radius * (Math.exp(growth * t) - 1) / growthScale;
    for (let segment = 0; segment < angularSegments; segment++) {
      const angle = segment / angularSegments * Math.PI * 2;
      positions.push(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius);
    }
  }
  for (let segment = 0; segment < angularSegments; segment++) {
    const next = (segment + 1) % angularSegments;
    indices.push(0, 1 + next, 1 + segment);
  }
  for (let ring = 1; ring < radialSegments; ring++) {
    const inner = 1 + (ring - 1) * angularSegments;
    const outer = inner + angularSegments;
    for (let segment = 0; segment < angularSegments; segment++) {
      const next = (segment + 1) % angularSegments;
      indices.push(inner + segment, inner + next, outer + segment);
      indices.push(inner + next, outer + next, outer + segment);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createSea() {
  const uniforms = {
    uTime: { value: 0 },
    uAltitude: { value: 0 },
    uSunDirection: { value: SUN_DIRECTION.clone() },
    uFogColor: { value: new THREE.Color(0x7898a0) },
    uFogDensity: { value: 0.000055 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    extensions: { derivatives: true },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uAltitude;
      varying vec3 vWorldPosition;
      varying float vWaveCrest;
      varying vec3 vWaveNormal;
      #include <common>
      #include <logdepthbuf_pars_vertex>

      void addWave(inout vec3 displacement, inout vec2 slope, inout float crest,
                   vec2 point, vec2 direction, float wavelength, float amplitude,
                   float speed, float phaseOffset, float steepness) {
        float k = 6.28318530718 / wavelength;
        float phase = k * dot(direction, point) - sqrt(9.81 * k) * uTime * speed + phaseOffset;
        float waveSin = sin(phase);
        float waveCos = cos(phase);
        displacement.xz += direction * (amplitude * steepness * waveCos);
        displacement.y += amplitude * waveSin;
        slope += direction * (amplitude * k * waveCos);
        crest += amplitude * waveSin;
      }

      void main() {
        vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 displacement = vec3(0.0);
        vec2 slope = vec2(0.0);
        float crest = 0.0;
        addWave(displacement, slope, crest, worldBase.xz, normalize(vec2(0.92, 0.38)),
          148.0, 1.55, 0.92, 0.4, 0.48);
        addWave(displacement, slope, crest, worldBase.xz, normalize(vec2(-0.34, 0.94)),
          73.0, 0.92, 1.04, 2.1, 0.40);
        addWave(displacement, slope, crest, worldBase.xz, normalize(vec2(0.66, -0.75)),
          31.0, 0.52, 1.12, 4.3, 0.31);
        addWave(displacement, slope, crest, worldBase.xz, normalize(vec2(-0.88, -0.47)),
          14.0, 0.24, 1.2, 1.2, 0.24);
        float radial = length(position.xz);
        float geometryDetail = 1.0 - smoothstep(22000.0, 115000.0, radial);
        worldBase += displacement * geometryDetail;
        // Curvature begins beyond the local tactical bubble, so flat-world sim objects still sit
        // in the water nearby while the ocean meets a believable horizon at altitude.
        float horizonRadial = max(radial - 12000.0, 0.0);
        worldBase.y -= horizonRadial * horizonRadial / 12742000.0;
        vWaveCrest = crest;
        vWaveNormal = normalize(vec3(-slope.x * geometryDetail, 1.0,
          -slope.y * geometryDetail));
        vWorldPosition = worldBase;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldBase, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uAltitude;
      uniform vec3 uSunDirection;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vWorldPosition;
      varying float vWaveCrest;
      varying vec3 vWaveNormal;
      #include <common>
      #include <logdepthbuf_pars_fragment>

      float waveField(vec2 point, vec2 direction, float frequency, float speed, float phase) {
        return sin(dot(point, direction) * frequency - uTime * speed + phase);
      }

      void main() {
        vec2 fromCamera = vWorldPosition.xz - cameraPosition.xz;
        float radialDistance = length(fromCamera);
        float altitudeMix = smoothstep(2200.0, 21000.0, uAltitude);
        float detailFade = exp(-radialDistance / 7200.0) * exp(-max(uAltitude, 0.0) / 9000.0);

        // Continuous directional ripples travel with the swell. Unlike a time-shifted cell hash,
        // this cannot pop or vibrate as a cell boundary crosses the camera.
        vec2 microDirA = vec2(0.94, 0.34);
        vec2 microDirB = vec2(-0.31, 0.95);
        vec2 microDirC = vec2(0.63, -0.78);
        float microA = waveField(vWorldPosition.xz, microDirA, 0.72, 1.18, 0.2);
        float microB = waveField(vWorldPosition.xz, microDirB, 0.39, 0.74, 2.4);
        float microC = waveField(vWorldPosition.xz, microDirC, 0.19, 0.48, 4.7);
        vec2 rippleSlope = microDirA * microA * 0.112
          + microDirB * microB * 0.078 + microDirC * microC * 0.052;
        vec3 normal = normalize(vWaveNormal
          + vec3(-rippleSlope.x, 0.0, -rippleSlope.y) * detailFade);

        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 sunDirection = normalize(uSunDirection);
        vec3 halfDirection = normalize(viewDirection + sunDirection);
        vec3 reflectionDirection = reflect(-viewDirection, normal);
        float noV = max(dot(normal, viewDirection), 0.0);
        float noH = max(dot(normal, halfDirection), 0.0);
        float fresnel = 0.02 + 0.98 * pow(1.0 - noV, 5.0);
        float tightGlint = pow(noH, mix(260.0, 620.0, altitudeMix));
        float broadGlint = pow(noH, 72.0) * 0.14;

        float broadSwell = sin(vWorldPosition.x * 0.041 + vWorldPosition.z * 0.017 - uTime * 0.68);
        float crossSwell = sin(vWorldPosition.x * -0.025 + vWorldPosition.z * 0.078 + uTime * 0.96);
        float distanceTone = smoothstep(450.0, 18000.0, radialDistance);
        vec3 nearWater = vec3(0.008, 0.072, 0.092);
        vec3 middleWater = vec3(0.010, 0.097, 0.126);
        vec3 farWater = vec3(0.010, 0.044, 0.074);
        vec3 color = mix(mix(nearWater, middleWater, 1.0 - noV), farWater, distanceTone);
        color *= 0.88 + broadSwell * 0.055 + crossSwell * 0.032;
        color = mix(color, vec3(0.012, 0.034, 0.064), altitudeMix * 0.62);
        // Use the actual reflected elevation rather than a generic edge tint: steep facets pick up
        // the blue zenith while grazing facets catch the bright atmospheric horizon.
        float reflectedElevation = clamp(reflectionDirection.y, 0.0, 1.0);
        vec3 reflectedHorizon = vec3(0.34, 0.49, 0.53);
        vec3 reflectedZenith = vec3(0.018, 0.115, 0.29);
        vec3 reflectedSky = mix(reflectedHorizon, reflectedZenith,
          pow(reflectedElevation, 0.42));
        float reflectedSun = pow(max(dot(reflectionDirection, sunDirection), 0.0),
          mix(190.0, 520.0, altitudeMix));
        reflectedSky += vec3(1.0, 0.74, 0.4) * reflectedSun * 2.2;
        color = mix(color, reflectedSky, fresnel * 0.86);

        // Soft forward-scatter through the lifted face gives the large waves volume without
        // falsely lighting their backs like matte terrain.
        float facingSun = max(dot(normal, sunDirection), 0.0);
        color += vec3(0.025, 0.075, 0.078) * facingSun * (0.35 + max(vWaveCrest, 0.0) * 0.12);

        float capPattern = vWaveCrest + broadSwell * 0.38 + crossSwell * 0.24;
        float foamBreakup = smoothstep(-0.44, 0.72,
          broadSwell * 0.68 + crossSwell * 0.54 + microC * 0.18);
        float whiteCap = smoothstep(1.52, 2.22, capPattern) * (0.48 + foamBreakup * 0.52);
        whiteCap *= detailFade * (1.0 - smoothstep(6500.0, 19000.0, radialDistance));
        vec3 foamColor = mix(vec3(0.44, 0.62, 0.64), vec3(0.82, 0.88, 0.82), foamBreakup);
        color = mix(color, foamColor, whiteCap * 0.68);

        // A long, broken specular corridor runs from the viewer toward the projected sun.
        // This remains readable when individual sub-pixel wave highlights average out.
        vec2 sunHorizontal = normalize(uSunDirection.xz + vec2(0.00001));
        float alongSun = dot(fromCamera, sunHorizontal);
        float acrossSun = abs(dot(fromCamera, vec2(-sunHorizontal.y, sunHorizontal.x)));
        float pathWidth = 120.0 + max(alongSun, 0.0) * 0.046;
        float sunPath = exp(-pow(acrossSun / max(pathWidth, 1.0), 1.38));
        sunPath *= smoothstep(-180.0, 2600.0, alongSun);
        float glitterBreakup = 0.30 + 0.70 * smoothstep(-0.34, 0.86,
          microA + microB * 0.55 + microC * 0.22);
        float pathLight = sunPath * glitterBreakup * (0.038 + tightGlint * 3.0 + broadGlint);
        pathLight *= 1.0 - altitudeMix * 0.42;
        color += vec3(1.0, 0.76, 0.46) * (tightGlint * 0.86 + broadGlint + pathLight);

        float fog = 1.0 - exp(-uFogDensity * uFogDensity * radialDistance * radialDistance);
        float horizonHaze = smoothstep(12000.0, 90000.0, radialDistance) * (1.0 - altitudeMix * 0.62);
        fog = max(fog, horizonHaze * 0.88);
        color = mix(color, uFogColor, fog);

        gl_FragColor = vec4(color, 1.0);
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(createOceanGeometry(
    650000,
    VISUAL_QUALITY.oceanRadialSegments,
    VISUAL_QUALITY.oceanAngularSegments,
  ), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

class FlightView {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: sceneCanvas,
      antialias: true,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.setClearColor(0x020611, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Glitch fix: the 0.12 m / 720 km clip range wasted depth precision on sub-cockpit distances.
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.5, 680000);
    this.camera.rotation.order = "YXZ";

    this.scene = new THREE.Scene();
    this.environmentTarget = createLitEnvironment(this.renderer);
    this.scene.environment = this.environmentTarget.texture;
    this.fogLow = new THREE.Color(0x7898a0);
    this.fogHigh = new THREE.Color(0x1c2a43);
    this.fogColor = this.fogLow.clone();
    this.scene.fog = new THREE.FogExp2(this.fogColor, 0.000055);
    this.sky = createSky();
    this.sea = createSea();
    this.scene.add(this.sky.mesh, this.sea.mesh);

    this.scene.add(new THREE.HemisphereLight(0xb5cad0, 0x102229, 0.78));
    this.sun = new THREE.DirectionalLight(0xffe2b4, 2.65);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;
    this.sun.shadow.mapSize.set(VISUAL_QUALITY.shadowMapSize, VISUAL_QUALITY.shadowMapSize);
    this.sun.shadow.camera.left = -175;
    this.sun.shadow.camera.right = 175;
    this.sun.shadow.camera.top = 175;
    this.sun.shadow.camera.bottom = -175;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 3600;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.00018;
    this.sun.shadow.normalBias = 0.16;

    this.drone = createDrone();
    this.awacs = createAwacs();
    // Keep the chase/reference airframe available without duplicating its heavier geometry.
    this.hiddenDrone = this.drone.clone(true);
    this.hiddenGlider = createGlider();
    this.hiddenDrone.visible = false;
    this.hiddenGlider.visible = false;
    this.awacs.visible = false;
    this.carrier = createCarrier();
    this.carrier.visible = false;
    this.banditDestruction = createBanditDestruction();
    this.gunEffects = createGunEffects();
    this.scene.add(
      this.drone,
      this.awacs,
      this.hiddenDrone,
      this.hiddenGlider,
      this.carrier,
      this.banditDestruction,
      this.gunEffects,
    );

    this.playerPosition = new THREE.Vector3();
    this.playerForward = new THREE.Vector3(0, 0, -1);
    this.playerUp = new THREE.Vector3(0, 1, 0);
    this.playerRight = new THREE.Vector3(1, 0, 0);
    this.playerQuaternion = new THREE.Quaternion();
    this.banditPosition = new THREE.Vector3();
    this.leadPipper = new THREE.Vector3();
    this.banditQuaternion = new THREE.Quaternion();
    this.playerFrame = this.createAttitudeFrame();
    this.banditFrame = this.createAttitudeFrame();
    this.banditWasAlive = true;
    this.banditSplashTime = -1;
    this.lastRoundsFired = 0;
    this.lastHitCount = 0;
    this.muzzleFlashUntil = -1;
    this.hitSparkTime = -1;
    this.aimPoint = new THREE.Vector3();   // carrier touchdown point (fly the velocity vector onto it)
    this.localTarget = new THREE.Vector3();
    this.localYawQuaternion = new THREE.Quaternion();
    this.localPitchQuaternion = new THREE.Quaternion();
    this.localGimbalQuaternion = new THREE.Quaternion();
    this.inversePlayerQuaternion = new THREE.Quaternion();
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);

    this.hud = createHud(hudCanvas);
    this.hudFrame = {
      state: null,
      camera: this.camera,
      playerPosition: this.playerPosition,
      playerForward: this.playerForward,
      playerUp: this.playerUp,
      playerRight: this.playerRight,
      banditPosition: this.banditPosition,
      banditForward: this.banditFrame.forward,
      leadPipper: this.leadPipper,
      aimPoint: null,
      sensorYaw: 0,
      sensorPitch: 0,
      padlock: false,
      triggerHeld: false,
      dt: 0,
      now: 0,
    };
    this.resize();
  }

  resize() {
    const { width, height } = gameViewport();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, VISUAL_QUALITY.pixelRatioCap);
    document.documentElement.style.setProperty("--game-width", `${width}px`);
    document.documentElement.style.setProperty("--game-height", `${height}px`);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    if (this.carrier?.userData.sprayUniforms) {
      this.carrier.userData.sprayUniforms.uPixelRatio.value = pixelRatio;
    }
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.hud.resize(width, height, pixelRatio, gameSafeInsets());
  }

  createAttitudeFrame() {
    return {
      forward: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      zAxis: new THREE.Vector3(),
      matrix: new THREE.Matrix4(),
      quaternion: new THREE.Quaternion(),
    };
  }

  frameFromState(state, prefix, frame) {
    frame.forward.set(state[`${prefix}fx`], state[`${prefix}fy`], -state[`${prefix}fz`]).normalize();
    frame.up.set(state[`${prefix}lx`], state[`${prefix}ly`], -state[`${prefix}lz`]).normalize();

    // Sim X/Y/Z is east/up/north (left-handed physical space). Flipping Z gives three.js
    // coordinates. Build the full attitude from the kernel's forward/lift frame: using a
    // world-up lookAt here reverses roll and becomes singular at a loop apex.
    frame.zAxis.copy(frame.forward).negate();
    frame.right.copy(frame.up).cross(frame.zAxis).normalize();
    frame.matrix.makeBasis(frame.right, frame.up, frame.zAxis);
    frame.quaternion.setFromRotationMatrix(frame.matrix).normalize();
    return frame;
  }

  updateGimbal(dt) {
    if (padlock) {
      this.localTarget.copy(this.banditPosition).sub(this.playerPosition).normalize();
      this.inversePlayerQuaternion.copy(this.playerQuaternion).invert();
      this.localTarget.applyQuaternion(this.inversePlayerQuaternion);

      // Follow the target through the six on the same side of the canopy. Raw atan2 jumps from
      // +180 to -180 there; resolving it beside the current head angle prevents a 330-degree
      // whip across the nose in the middle of a break turn.
      const targetHorizontal = Math.hypot(this.localTarget.x, this.localTarget.z);
      const rawTargetYaw = targetHorizontal < 0.02
        ? sensorYaw
        : Math.atan2(this.localTarget.x, -this.localTarget.z);
      const targetYaw = angleNearestReference(rawTargetYaw, sensorYaw);
      const targetPitch = Math.atan2(
        this.localTarget.y,
        targetHorizontal,
      );

      // Keep a little nose-side framing instead of cancelling every bit of own-ship motion with
      // a dead-centre target lock. The residual 12% makes pitch/roll readable while leaving the
      // bandit comfortably inside the 66-degree view through normal dogfight geometry.
      const desiredYaw = clamp(
        targetYaw * PADLOCK_FRAME_FRACTION,
        -PADLOCK_MAX_YAW,
        PADLOCK_MAX_YAW,
      );
      const desiredPitch = clamp(
        targetPitch * PADLOCK_FRAME_FRACTION,
        -PADLOCK_MAX_PITCH,
        PADLOCK_MAX_PITCH,
      );
      const trackingError = Math.max(
        Math.abs(targetYaw - sensorYaw),
        Math.abs(targetPitch - sensorPitch),
      );
      const follow = expStep(trackingError > 28 * DEG ? 18 : 12, dt);
      sensorYaw += (desiredYaw - sensorYaw) * follow;
      sensorPitch += (desiredPitch - sensorPitch) * follow;
    } else if (!dragging && performance.now() - lastLookTime > 900) {
      const recenter = expStep(1.65, dt);
      sensorYaw += (0 - sensorYaw) * recenter;
      sensorPitch += (0 - sensorPitch) * recenter;
      if (Math.abs(sensorYaw) < 0.0001) sensorYaw = 0;
      if (Math.abs(sensorPitch) < 0.0001) sensorPitch = 0;
    }
  }

  updateBanditDestruction(alive, nowSeconds) {
    const effect = this.banditDestruction;
    const data = effect.userData;
    if (alive) {
      this.banditWasAlive = true;
      this.banditSplashTime = -1;
      effect.visible = false;
      return;
    }

    if (this.banditWasAlive || this.banditSplashTime < 0) {
      this.banditSplashTime = nowSeconds;
      effect.position.copy(this.banditPosition);
      effect.visible = true;
    }
    this.banditWasAlive = false;

    const age = nowSeconds - this.banditSplashTime;
    if (age >= 4.8) {
      effect.visible = false;
      return;
    }

    effect.visible = true;
    const burst = clamp(age / 0.72, 0, 1);
    data.outer.scale.setScalar(1.5 + burst * 12.5);
    data.inner.scale.setScalar(0.9 + burst * 7.0);
    data.outer.material.uniforms.uAlpha.value = Math.max(0, 0.92 * (1 - age / 1.15));
    data.inner.material.uniforms.uAlpha.value = Math.max(0, 1 - age / 0.72);
    data.outer.material.uniforms.uAge.value = age;
    data.inner.material.uniforms.uAge.value = age;
    data.flash.intensity = Math.max(0, 68 * (1 - age / 0.48));

    const shockActive = age < 1.05;
    data.shockwave.visible = shockActive;
    if (shockActive) {
      data.shockwave.quaternion.copy(this.camera.quaternion);
      data.shockwave.scale.setScalar(1.5 + age * 19.0);
      data.shockwave.material.opacity = Math.max(0, 0.82 * (1 - age / 1.05));
    }

    const debrisActive = age < 2.4;
    data.debris.visible = debrisActive;
    if (debrisActive) {
      const debrisPositions = data.debrisPositions;
      const debrisDirections = data.debrisDirections;
      for (let i = 0; i < debrisDirections.length; i += 3) {
        const speed = 15 + (i / 3 % 7) * 1.7;
        debrisPositions[i] = debrisDirections[i] * age * speed;
        debrisPositions[i + 1] = debrisDirections[i + 1] * age * speed - 4.9 * age * age;
        debrisPositions[i + 2] = debrisDirections[i + 2] * age * speed;
      }
      data.debris.geometry.attributes.position.needsUpdate = true;
      data.debris.material.opacity = Math.max(0, 1 - age / 2.4);
    } else {
      data.debris.material.opacity = 0;
    }

    for (let i = 0; i < data.smoke.length; i++) {
      const puff = data.smoke[i];
      const puffAge = age - puff.userData.delay;
      if (puffAge <= 0) {
        puff.visible = false;
        continue;
      }
      puff.visible = true;
      puff.position.copy(puff.userData.direction).multiplyScalar(puffAge * (4.8 + i * 0.45));
      puff.position.y += puffAge * 4.6;
      puff.scale.setScalar(2.2 + puffAge * (3.3 + i * 0.12));
      puff.material.uniforms.uAge.value = puffAge;
      puff.material.uniforms.uAlpha.value = Math.max(
        0, Math.min(0.58, puffAge * 1.4) * (1 - age / 4.8),
      );
    }
  }

  updateGunEffects(state, nowSeconds) {
    const data = this.gunEffects.userData;
    const positions = data.tracerPositions;
    const tracerHeadPositions = data.tracerHeadPositions;
    const rounds = Array.isArray(state.tracers) ? state.tracers : null;
    const count = Math.min(rounds?.length || 0, MAX_TRACERS);
    for (let i = 0; i < count; i++) {
      const round = rounds[i];
      const offset = i * 6;
      const x = Number(round[0]) || 0;
      const y = Number(round[1]) || 0;
      const z = -(Number(round[2]) || 0);
      const vx = Number(round[3]) || 0;
      const vy = Number(round[4]) || 0;
      const vz = -(Number(round[5]) || 0);
      const speed = Math.max(1, Math.hypot(vx, vy, vz));
      const streak = clamp(speed * 0.014, 9, 20);
      positions[offset] = x - vx / speed * streak;
      positions[offset + 1] = y - vy / speed * streak;
      positions[offset + 2] = z - vz / speed * streak;
      positions[offset + 3] = x;
      positions[offset + 4] = y;
      positions[offset + 5] = z;
      const headOffset = i * 3;
      tracerHeadPositions[headOffset] = x;
      tracerHeadPositions[headOffset + 1] = y;
      tracerHeadPositions[headOffset + 2] = z;
    }
    data.tracers.geometry.setDrawRange(0, count * 2);
    data.tracers.geometry.attributes.position.needsUpdate = count > 0;
    data.tracers.visible = count > 0;
    data.tracerGlow.visible = count > 0;
    data.tracerHeads.geometry.setDrawRange(0, count);
    data.tracerHeads.geometry.attributes.position.needsUpdate = count > 0;
    data.tracerHeads.visible = count > 0;

    const roundsFired = Number(state.rounds_fired) || 0;
    if (roundsFired < this.lastRoundsFired) this.lastRoundsFired = roundsFired;
    if (roundsFired > this.lastRoundsFired) this.muzzleFlashUntil = nowSeconds + 0.048;
    this.lastRoundsFired = roundsFired;
    const muzzleActive = nowSeconds < this.muzzleFlashUntil;
    data.muzzle.visible = muzzleActive;
    data.muzzleCone.visible = muzzleActive;
    data.muzzle.position.copy(this.playerPosition).addScaledVector(this.playerForward, 6.4);
    data.muzzle.quaternion.copy(this.playerQuaternion);
    data.muzzleCone.position.copy(this.playerPosition).addScaledVector(this.playerForward, 7.4);
    data.muzzleCone.quaternion.copy(this.playerQuaternion);
    data.muzzleLight.position.copy(data.muzzle.position);
    if (muzzleActive) {
      const pulse = 0.82 + 0.18 * Math.sin(roundsFired * 2.17);
      data.muzzle.scale.set(1.45 * pulse, 0.72 * pulse, 2.7 * pulse);
      data.muzzleCone.scale.set(0.9 * pulse, 0.9 * pulse, 1.45 * pulse);
      data.muzzle.material.opacity = 0.84;
      data.muzzleCone.material.opacity = 0.72;
      data.muzzleLight.intensity = 22;
    } else {
      data.muzzle.material.opacity = 0;
      data.muzzleCone.material.opacity = 0;
      data.muzzleLight.intensity = 0;
    }

    const hits = Number(state.hits) || 0;
    if (hits < this.lastHitCount) this.lastHitCount = hits;
    if (hits > this.lastHitCount) this.hitSparkTime = nowSeconds;
    this.lastHitCount = hits;
    const sparkAge = nowSeconds - this.hitSparkTime;
    const sparksActive = sparkAge >= 0 && sparkAge < 0.34;
    data.sparks.visible = sparksActive;
    if (sparksActive) {
      const sparkPositions = data.sparkPositions;
      const directions = data.sparkDirections;
      for (let i = 0; i < directions.length; i += 3) {
        const velocity = 18 + (i / 3) * 1.15;
        sparkPositions[i] = this.banditPosition.x + directions[i] * sparkAge * velocity;
        sparkPositions[i + 1] = this.banditPosition.y + directions[i + 1] * sparkAge * velocity
          - 4.9 * sparkAge * sparkAge;
        sparkPositions[i + 2] = this.banditPosition.z + directions[i + 2] * sparkAge * velocity;
      }
      data.sparks.geometry.attributes.position.needsUpdate = true;
      data.sparks.material.opacity = 1 - sparkAge / 0.34;
      data.hitLight.position.copy(this.banditPosition);
      data.hitLight.intensity = 18 * (1 - sparkAge / 0.34);
    } else {
      data.sparks.material.opacity = 0;
      data.hitLight.intensity = 0;
    }
  }

  update(state, dt, nowSeconds) {
    const playerFrame = this.frameFromState(state, "p", this.playerFrame);
    const banditFrame = this.frameFromState(state, "b", this.banditFrame);

    this.playerPosition.set(state.px, state.py, -state.pz);
    this.playerForward.copy(playerFrame.forward);
    this.playerUp.copy(playerFrame.up);
    this.playerRight.copy(playerFrame.right);
    this.playerQuaternion.copy(playerFrame.quaternion);
    this.banditPosition.set(state.bx, state.by, -state.bz);
    this.banditQuaternion.copy(banditFrame.quaternion);
    if (state.lead_valid === true && Number.isFinite(state.lead_x)
      && Number.isFinite(state.lead_y) && Number.isFinite(state.lead_z)) {
      this.leadPipper.set(state.lead_x, state.lead_y, -state.lead_z);
    }

    this.updateGimbal(dt);

    this.camera.position.copy(this.playerPosition)
      .addScaledVector(this.playerUp, 0.6)
      .addScaledVector(this.playerForward, 4.0);
    // Positive sensor yaw means look right. In three.js local +Y rotation turns -Z left,
    // hence the deliberate negative sign here.
    this.localYawQuaternion.setFromAxisAngle(this.yAxis, -sensorYaw);
    this.localPitchQuaternion.setFromAxisAngle(this.xAxis, sensorPitch);
    this.localGimbalQuaternion.copy(this.localYawQuaternion).multiply(this.localPitchQuaternion);
    this.camera.quaternion.copy(this.playerQuaternion).multiply(this.localGimbalQuaternion);
    this.camera.updateMatrixWorld(true);

    const cameraAltitude = Math.max(0, this.camera.position.y);
    const atmosphereMix = smoothstep(1800, 14000, cameraAltitude);
    const fogDensity = 0.000055 + (0.000009 - 0.000055) * atmosphereMix;
    this.fogColor.copy(this.fogLow).lerp(this.fogHigh, atmosphereMix);
    this.scene.fog.color.copy(this.fogColor);
    this.scene.fog.density = fogDensity;

    const isCarrier = state.carrier === true;
    const balloonStrike = /balloon|kj-500/i.test(state.beat ?? "");
    const banditAlive = state.bandit_alive !== false && state.fight !== "Splash";
    // The carrier and the fighter now coexist. Keep using the established bandit mesh, physical
    // bx/by/-bz placement, forward/lift attitude, and range scale assist from every other beat.
    this.drone.visible = !balloonStrike && banditAlive;
    this.awacs.visible = balloonStrike && banditAlive;
    this.hiddenDrone.visible = false;
    this.hiddenGlider.visible = false;
    this.carrier.visible = isCarrier;
    if (isCarrier) {
      // Sim frame X=east, Y=up, Z=north; render flips Z. Deck-centre origin at deck height.
      this.carrier.position.set(state.cx, state.cy, -state.cz);
      this.carrier.rotation.y = -(state.cheading ?? 0);
      updateCarrierVisual(this.carrier, state, nowSeconds, this.fogColor, fogDensity);
      if (Number.isFinite(state.tx)) this.aimPoint.set(state.tx, state.ty, -state.tz);
    }

    const target = balloonStrike ? this.awacs : this.drone;
    target.position.copy(this.banditPosition);
    target.quaternion.copy(this.banditQuaternion);
    // True scale is retained in the merge; the visual assist ramps only after 250 m.
    const range = Number.isFinite(state.range_m) ? state.range_m : this.banditPosition.distanceTo(this.playerPosition);
    const scale = 1 + 5 * smoothstep(250, 18000, range);
    target.scale.setScalar(scale);
    if (this.awacs.userData.rotodome) this.awacs.userData.rotodome.rotation.y = nowSeconds * 0.42;
    this.updateBanditDestruction(banditAlive, nowSeconds);
    this.updateGunEffects(state, nowSeconds);

    this.sky.mesh.position.copy(this.camera.position);
    this.sky.uniforms.uTime.value = nowSeconds;
    this.sky.uniforms.uAltitude.value = cameraAltitude;
    this.sea.mesh.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sea.uniforms.uTime.value = nowSeconds;
    this.sea.uniforms.uAltitude.value = cameraAltitude;
    this.sea.uniforms.uFogColor.value.copy(this.fogColor);
    this.sea.uniforms.uFogDensity.value = fogDensity;

    this.sun.castShadow = isCarrier;
    this.sunTarget.position.copy(isCarrier ? this.carrier.position : this.camera.position);
    this.sun.position.copy(this.sunTarget.position).addScaledVector(SUN_DIRECTION, 1600);
    this.sunTarget.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
    const hudFrame = this.hudFrame;
    hudFrame.state = state;
    hudFrame.aimPoint = isCarrier ? this.aimPoint : null; // HUD gates approach-only symbology from mode
    hudFrame.sensorYaw = sensorYaw;
    hudFrame.sensorPitch = sensorPitch;
    hudFrame.padlock = padlock;
    hudFrame.triggerHeld = heldKeys.has("KeyF");
    hudFrame.dt = dt;
    hudFrame.now = nowSeconds;
    this.hud.draw(hudFrame);
  }
}

function installMobileInput(view) {
  if (!mobileControls || !touchControls) return;

  view.hud.setTouchMode?.(true);
  const TILT_DEADZONE = 5;
  const TILT_RELEASE = 3;
  const PITCH_GAIN = 1.15;
  const ROLL_GAIN = 1;
  const activeControls = new Map();
  const tiltKeys = { pitch: null, roll: null };
  const tiltTitle = tiltPrompt?.querySelector("strong");
  const tiltCopy = tiltPrompt?.querySelector("p");
  const orientationSupported = typeof globalThis.DeviceOrientationEvent !== "undefined";
  let tiltState = "off";
  let orientationListening = false;
  let orientationTimer = 0;
  let calibration = null;
  let calibrationAngle = null;
  let latestOrientation = null;
  let filteredPitch = 0;
  let filteredRoll = 0;
  let suspended = false;

  function status(message) {
    if (tiltStatus) tiltStatus.textContent = message;
  }

  function screenAngle() {
    const raw = window.screen?.orientation?.angle ?? window.orientation ?? 0;
    return ((Number(raw) || 0) % 360 + 360) % 360;
  }

  function orientationAxes(event) {
    if (event.beta == null || event.gamma == null) return null;
    const beta = Number(event.beta);
    const gamma = Number(event.gamma);
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
    const angle = screenAngle();
    if (angle === 90) return { roll: beta, pitch: -gamma, angle };
    if (angle === 270) return { roll: -beta, pitch: gamma, angle };
    if (angle === 180) return { roll: -gamma, pitch: -beta, angle };
    return { roll: gamma, pitch: beta, angle };
  }

  function angleDelta(value, centre) {
    return ((value - centre + 540) % 360) - 180;
  }

  function releaseTiltAxes() {
    for (const axis of ["pitch", "roll"]) {
      const code = tiltKeys[axis];
      if (code) releaseMappedKey(code, `tilt:${axis}`);
      tiltKeys[axis] = null;
    }
  }

  function updateTiltAxis(axis, value, negativeCode, positiveCode) {
    const source = `tilt:${axis}`;
    const active = tiltKeys[axis];
    if (active) {
      const keep = active === negativeCode ? value < -TILT_RELEASE : value > TILT_RELEASE;
      if (keep) return;
      releaseMappedKey(active, source);
      tiltKeys[axis] = null;
    }
    const next = value <= -TILT_DEADZONE ? negativeCode : value >= TILT_DEADZONE ? positiveCode : null;
    if (next && pressMappedKey(next, source)) tiltKeys[axis] = next;
  }

  function captureCentre(sample, message = "TILT CENTRED") {
    calibration = { roll: sample.roll, pitch: sample.pitch };
    calibrationAngle = sample.angle;
    filteredPitch = 0;
    filteredRoll = 0;
    releaseTiltAxes();
    status(message);
  }

  function awaitFreshCentre() {
    calibration = null;
    calibrationAngle = null;
    filteredPitch = 0;
    filteredRoll = 0;
    releaseTiltAxes();
    status("TILT RECENTRING…");
  }

  function stopOrientationListener() {
    if (!orientationListening) return;
    window.removeEventListener("deviceorientation", handleOrientation);
    orientationListening = false;
  }

  function useButtonStick(message) {
    window.clearTimeout(orientationTimer);
    stopOrientationListener();
    releaseTiltAxes();
    tiltState = "fallback";
    document.documentElement.classList.remove("tilt-pending", "tilt-enabled");
    document.documentElement.classList.add("tilt-fallback");
    status(message || "BUTTON STICK");
  }

  function handleOrientation(event) {
    if (suspended || document.hidden || (tiltState !== "waiting" && tiltState !== "enabled")) return;
    const sample = orientationAxes(event);
    if (!sample) return;
    latestOrientation = sample;

    if (tiltState === "waiting") {
      window.clearTimeout(orientationTimer);
      tiltState = "enabled";
      captureCentre(sample);
      document.documentElement.classList.remove("tilt-pending", "tilt-fallback");
      document.documentElement.classList.add("tilt-enabled");
      return;
    }

    if (!calibration || calibrationAngle !== sample.angle) {
      captureCentre(sample, "TILT RECENTRED");
      return;
    }

    const pitch = clamp(angleDelta(sample.pitch, calibration.pitch) * PITCH_GAIN, -30, 30);
    const roll = clamp(angleDelta(sample.roll, calibration.roll) * ROLL_GAIN, -30, 30);
    filteredPitch = filteredPitch * 0.72 + pitch * 0.28;
    filteredRoll = filteredRoll * 0.72 + roll * 0.28;
    updateTiltAxis("pitch", filteredPitch, "ArrowUp", "ArrowDown");
    updateTiltAxis("roll", filteredRoll, "ArrowLeft", "ArrowRight");
  }

  function startOrientationListener() {
    if (!orientationListening) {
      window.addEventListener("deviceorientation", handleOrientation, { passive: true });
      orientationListening = true;
    }
    tiltState = "waiting";
    status("WAITING FOR TILT…");
    if (tiltTitle) tiltTitle.textContent = "HOLD LEVEL — CALIBRATING";
    if (tiltCopy) tiltCopy.textContent = "Hold the device at your comfortable flying angle while the sensor centres.";
    orientationTimer = window.setTimeout(() => useButtonStick("NO TILT DATA · BUTTONS"), 3000);
  }

  async function enableTilt() {
    if (tiltState === "requesting" || tiltState === "waiting") return;
    if (tiltState === "enabled" && latestOrientation) {
      captureCentre(latestOrientation);
      return;
    }
    if (!orientationSupported) {
      useButtonStick("TILT UNAVAILABLE · BUTTONS");
      return;
    }

    tiltState = "requesting";
    status("REQUESTING TILT…");
    try {
      const requestPermission = globalThis.DeviceOrientationEvent?.requestPermission;
      if (typeof requestPermission === "function") {
        const permission = await requestPermission.call(globalThis.DeviceOrientationEvent);
        if (permission !== "granted") {
          useButtonStick("TILT DENIED · BUTTONS");
          return;
        }
      }
      startOrientationListener();
    } catch (error) {
      console.warn("Tilt permission unavailable", error);
      useButtonStick("TILT DENIED · BUTTONS");
    }
  }

  function recenterTilt() {
    if (tiltState === "enabled" && latestOrientation) {
      captureCentre(latestOrientation);
      return;
    }
    if (!orientationSupported) {
      useButtonStick("TILT UNAVAILABLE · BUTTONS");
      return;
    }
    if (tiltTitle) tiltTitle.textContent = "TAP TO ENABLE TILT";
    if (tiltCopy) tiltCopy.textContent = "Hold your flying angle; this becomes centre. Then tilt forward to push, back to pull, and left/right to roll.";
    document.documentElement.classList.remove("tilt-fallback");
    document.documentElement.classList.add("tilt-pending");
    tiltState = "off";
    status("TILT OFF");
  }

  function setControlActive(button) {
    const active = [...activeControls.values()].some((control) => control.button === button);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  function endControl(event) {
    const control = activeControls.get(event.pointerId);
    if (!control) return;
    releaseMappedKey(control.code, control.source);
    activeControls.delete(event.pointerId);
    setControlActive(control.button);
  }

  touchControls.querySelectorAll("[data-hold-key]").forEach((button, index) => {
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      endControl(event);
      const code = button.dataset.holdKey;
      const source = `touch:${index}:${event.pointerId}`;
      if (!pressMappedKey(code, source)) return;
      if (code === "KeyF") view.hud.armAudio();
      activeControls.set(event.pointerId, { button, code, source });
      setControlActive(button);
      try { button.setPointerCapture(event.pointerId); } catch { /* pointer may already be gone */ }
    }, { passive: false });
    button.addEventListener("pointerup", endControl);
    button.addEventListener("pointercancel", endControl);
    button.addEventListener("lostpointercapture", endControl);
  });

  touchControls.querySelector('[data-mobile-action="enable-tilt"]')?.addEventListener("click", enableTilt);
  touchControls.querySelector('[data-mobile-action="buttons-only"]')?.addEventListener("click", () => {
    useButtonStick("BUTTON STICK");
  });
  touchControls.querySelector('[data-mobile-action="recenter"]')?.addEventListener("click", recenterTilt);
  touchControls.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("pointerup", endControl);
  window.addEventListener("pointercancel", endControl);

  const preventGesture = (event) => event.preventDefault();
  document.addEventListener("touchmove", preventGesture, { passive: false });
  document.addEventListener("gesturestart", preventGesture, { passive: false });
  document.addEventListener("gesturechange", preventGesture, { passive: false });
  document.addEventListener("gestureend", preventGesture, { passive: false });
  document.addEventListener("dblclick", preventGesture, { passive: false });

  function orientationChanged() {
    if (tiltState === "enabled") awaitFreshCentre();
  }

  window.addEventListener("orientationchange", orientationChanged, { passive: true });
  window.screen?.orientation?.addEventListener?.("change", orientationChanged);
  window.addEventListener("blur", () => { suspended = true; });
  window.addEventListener("focus", () => {
    suspended = false;
    if (tiltState === "enabled") awaitFreshCentre();
  });
  document.addEventListener("visibilitychange", () => {
    suspended = document.hidden;
    if (suspended) {
      resetMobileInput();
      releaseAllMappedKeys();
    } else if (tiltState === "enabled") {
      awaitFreshCentre();
    }
  });

  resetMobileInput = () => {
    const buttons = new Set();
    for (const control of activeControls.values()) releaseMappedKey(control.code, control.source);
    for (const control of activeControls.values()) buttons.add(control.button);
    activeControls.clear();
    for (const button of buttons) setControlActive(button);
    releaseTiltAxes();
    filteredPitch = 0;
    filteredRoll = 0;
  };

  if (orientationSupported) {
    document.documentElement.classList.add("tilt-pending");
    status("TILT OFF");
  } else {
    useButtonStick("TILT UNAVAILABLE · BUTTONS");
  }

  globalThis.__gunsMobile = {
    active: true,
    get tiltState() { return tiltState; },
    get calibration() { return calibration ? { ...calibration } : null; },
    recenter: recenterTilt,
  };
}

function installInput(view) {
  window.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Space", "F1"].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat || !bridge) return;

    if (/^Digit[1-5]$/.test(event.code)) {
      bridge.StartBeat(Number(event.code.slice(-1)));
      return;
    }

    if (event.code === "F1") {
      bridge.SetVariant(bridge.GetVariant() === 0 ? 1 : 0);
      return;
    }

    if (event.code === "KeyC") {
      bridge.ToggleDeckConfiguration();
      return;
    }

    if (event.code === "KeyH") {
      view.hud.toggleLegend();
      return;
    }

    if (event.code === "KeyM") {
      view.hud.toggleAudio();
      return;
    }

    const gkey = keyMap.get(event.code);
    if (gkey === undefined) return;
    if (event.code === "KeyV") padlock = !padlock;
    if (event.code === "KeyF") view.hud.armAudio();
    pressMappedKey(event.code, "keyboard");
  }, { passive: false });

  window.addEventListener("keyup", (event) => {
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    if (!bridge) return;
    releaseMappedKey(event.code, "keyboard");
  }, { passive: false });

  window.addEventListener("blur", () => {
    resetMobileInput();
    releaseAllMappedKeys();
    dragging = false;
    activePointer = null;
    sceneCanvas.classList.remove("dragging");
  });

  sceneCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    dragging = true;
    activePointer = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastLookTime = performance.now();
    sceneCanvas.classList.add("dragging");
    sceneCanvas.setPointerCapture(event.pointerId);
    sceneCanvas.focus({ preventScroll: true });
  });

  sceneCanvas.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== activePointer) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastLookTime = performance.now();
    sensorYaw = clamp(sensorYaw + dx * 0.0027, -MAX_GIMBAL_YAW, MAX_GIMBAL_YAW);
    sensorPitch = clamp(sensorPitch - dy * 0.00245, -MAX_GIMBAL_PITCH, MAX_GIMBAL_PITCH);
  });

  function endDrag(event) {
    if (event.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
    lastLookTime = performance.now();
    sceneCanvas.classList.remove("dragging");
    if (sceneCanvas.hasPointerCapture(event.pointerId)) sceneCanvas.releasePointerCapture(event.pointerId);
  }

  sceneCanvas.addEventListener("pointerup", endDrag);
  sceneCanvas.addEventListener("pointercancel", endDrag);

  let resizeFrame = 0;
  function scheduleResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      view.resize();
    });
  }
  window.addEventListener("resize", scheduleResize, { passive: true });
  window.addEventListener("orientationchange", scheduleResize, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleResize, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleResize, { passive: true });
  installMobileInput(view);
}

async function boot() {
  setBootStatus("STARTING .NET RUNTIME…");
  const blazor = await waitForGlobal(() => globalThis.Blazor);
  await blazor.start();

  setBootStatus("LINKING FLIGHT KERNEL…");
  const runtimeAccessor = await waitForGlobal(() => globalThis.getDotnetRuntime);
  const { getAssemblyExports, getConfig } = await runtimeAccessor(0);
  await getConfig();
  const assemblyExports = await getAssemblyExports("GunsOnly.Web");
  bridge = assemblyExports.GunsOnly.Web.WebBridge;
  bridge.StartBeat(5);   // start behind the boat, ready to land

  setBootStatus("CALIBRATING SENSOR…");
  const view = new FlightView();
  installInput(view);

  let previous = performance.now();
  let firstFrame = true;

  function tick(now) {
    try {
      const dt = clamp((now - previous) / 1000, 0, 0.25);
      previous = now;
      bridge.Advance(dt);
      const state = JSON.parse(bridge.GetState());
      // Debug/QA hook. Two jobs: (1) let an automated browser verify things a screenshot can't
      // (roll direction under live input — the mirrored-roll bug the desktop shipped and only
      // flying caught), and (2) make the desktop-vs-web CONFORMANCE diff possible: both shells
      // drive the identical compiled kernel, so the same scenario must produce the same
      // telemetry. Cheap, harmless, and the only way to prove the web build is the same game.
      globalThis.__gunsState = state;
      globalThis.__gunsBridge = bridge;
      recorder.sample(state);
      view.update(state, dt, now / 1000);
      if (firstFrame) {
        firstFrame = false;
        bootScreen.classList.add("ready");
      }
      requestAnimationFrame(tick);
    } catch (error) {
      showFatal(error);
    }
  }

  requestAnimationFrame(tick);
}

boot().catch(showFatal);
