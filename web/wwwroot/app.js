import * as THREE from "./vendor/three.module.js";
import { createHud } from "./hud.js";

const DEG = Math.PI / 180;
const MAX_GIMBAL_YAW = 150 * DEG;
const MAX_GIMBAL_PITCH = 90 * DEG;
const SUN_DIRECTION = new THREE.Vector3(0.32, 0.78, -0.53).normalize();

const sceneCanvas = document.querySelector("#scene");
const hudCanvas = document.querySelector("#hud");
const bootScreen = document.querySelector("#boot");
const bootStatus = document.querySelector("#boot-status");
const fatalScreen = document.querySelector("#fatal");
const fatalMessage = document.querySelector("#fatal-message");

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
let bridge = null;
let padlock = false;
let dragging = false;
let activePointer = null;
let lastPointerX = 0;
let lastPointerY = 0;
let lastLookTime = performance.now();
let sensorYaw = 0;
let sensorPitch = 0;

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

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function makeMaterial(color, roughness = 0.72, metalness = 0.16, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive });
}

function box(group, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
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

function createDrone() {
  const group = new THREE.Group();
  const skin = makeMaterial(0x3f4b52, 0.68, 0.38, 0x030708);
  const edge = makeMaterial(0x161f25, 0.82, 0.2);
  const sensor = makeMaterial(0x101a21, 0.28, 0.58, 0x07141a);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.72, 4.4, 4), skin);
  nose.rotation.x = -Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.position.z = -0.75;
  group.add(nose);

  box(group, new THREE.Vector3(7.4, 0.12, 1.15), new THREE.Vector3(0, 0.05, 0.25), skin);
  box(group, new THREE.Vector3(4.8, 0.1, 0.9), new THREE.Vector3(0, 0.08, 0.85), edge, new THREE.Vector3(0, 0.16, 0));
  box(group, new THREE.Vector3(0.12, 1.3, 1.1), new THREE.Vector3(-1.35, 0.55, 1.15), edge, new THREE.Vector3(0, 0, -0.45));
  box(group, new THREE.Vector3(0.12, 1.3, 1.1), new THREE.Vector3(1.35, 0.55, 1.15), edge, new THREE.Vector3(0, 0, 0.45));

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 10), sensor);
  ball.position.set(0, -0.34, -2.55);
  group.add(ball);

  const aperture = new THREE.Mesh(
    new THREE.CircleGeometry(0.19, 16),
    new THREE.MeshBasicMaterial({ color: 0x76d8e8, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  );
  aperture.rotation.y = Math.PI;
  aperture.position.set(0, -0.36, -3.01);
  group.add(aperture);

  const leftLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4055 }),
  );
  leftLight.position.set(-3.6, 0.08, 0.25);
  group.add(leftLight);
  const rightLight = leftLight.clone();
  rightLight.material = new THREE.MeshBasicMaterial({ color: 0x62ffc0 });
  rightLight.position.x = 3.6;
  group.add(rightLight);

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
    uAltitude: { value: 0 },
    uSunDirection: { value: SUN_DIRECTION.clone() },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;

      void main() {
        vDirection = normalize(mat3(modelMatrix) * position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAltitude;
      uniform vec3 uSunDirection;
      varying vec3 vDirection;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec3 d = normalize(vDirection);
        float h = d.y;
        float altitudeMix = smoothstep(2400.0, 21000.0, uAltitude);

        float lowSkyCurve = pow(max(h, 0.0), 0.46);
        vec3 lowHorizon = vec3(0.47, 0.69, 0.86);
        vec3 lowZenith = vec3(0.018, 0.115, 0.30);
        vec3 lowSky = mix(lowHorizon, lowZenith, lowSkyCurve);
        lowSky = mix(vec3(0.13, 0.26, 0.36), lowSky, smoothstep(-0.18, 0.035, h));

        // At stratospheric altitude the remaining atmosphere is a narrow optical limb.
        // Its exponential tightens with altitude instead of smearing blue to the zenith.
        float limbSharpness = mix(8.0, 105.0, altitudeMix);
        float limb = exp(-abs(h) * limbSharpness);
        vec3 space = vec3(0.0012, 0.0022, 0.012);
        vec3 highSky = space + vec3(0.11, 0.29, 0.58) * limb;
        highSky += vec3(0.006, 0.011, 0.034) * pow(max(h, 0.0), 0.35);

        vec3 color = mix(lowSky, highSky, altitudeMix);

        vec2 spherical = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
        vec2 starGrid = spherical * vec2(760.0, 430.0);
        vec2 starCell = floor(starGrid);
        vec2 starUv = fract(starGrid) - 0.5;
        float seed = hash21(starCell);
        float starCore = 1.0 - smoothstep(0.018, 0.08, length(starUv));
        float star = smoothstep(0.992, 0.9995, seed) * starCore;
        star *= pow(altitudeMix, 1.7) * smoothstep(-0.025, 0.13, h);
        color += vec3(0.58, 0.69, 0.84) * star;

        float sunDot = dot(d, normalize(uSunDirection));
        float sunDisc = smoothstep(0.99986, 0.99994, sunDot);
        float sunHalo = pow(max(sunDot, 0.0), mix(340.0, 900.0, altitudeMix));
        color += vec3(1.0, 0.78, 0.42) * (sunDisc * 2.0 + sunHalo * 0.2);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(350000, 48, 28), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}

function createSea() {
  const uniforms = {
    uTime: { value: 0 },
    uAltitude: { value: 0 },
    uSunDirection: { value: SUN_DIRECTION.clone() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    extensions: { derivatives: true },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uAltitude;
      varying vec3 vWorldPosition;

      void main() {
        vec3 displaced = position;
        vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;
        float detail = exp(-max(uAltitude, 0.0) / 6200.0);
        float wave = sin(worldBase.x * 0.011 + uTime * 0.72) * 0.46;
        wave += sin(worldBase.z * 0.016 - uTime * 0.57) * 0.31;
        wave += sin((worldBase.x + worldBase.z) * 0.0042 + uTime * 0.29) * 0.68;
        displaced.y += wave * detail;
        vec4 world = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uAltitude;
      uniform vec3 uSunDirection;
      varying vec3 vWorldPosition;

      void main() {
        vec3 dx = dFdx(vWorldPosition);
        vec3 dy = dFdy(vWorldPosition);
        vec3 normal = normalize(cross(dy, dx));
        if (normal.y < 0.0) normal = -normal;

        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 halfDirection = normalize(viewDirection + normalize(uSunDirection));
        float altitudeMix = smoothstep(2200.0, 21000.0, uAltitude);
        float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);
        float glint = pow(max(dot(normal, halfDirection), 0.0), mix(620.0, 1150.0, altitudeMix));

        float broadSwell = sin(vWorldPosition.x * 0.0014 + vWorldPosition.z * 0.0011 + uTime * 0.18);
        vec3 nearColor = vec3(0.015, 0.105, 0.15) + broadSwell * vec3(0.004, 0.008, 0.01);
        vec3 highSheet = vec3(0.11, 0.20, 0.28);
        vec3 color = mix(nearColor, highSheet, altitudeMix * 0.86);
        color += fresnel * mix(vec3(0.035, 0.13, 0.20), vec3(0.08, 0.15, 0.23), altitudeMix);
        color += vec3(1.0, 0.67, 0.28) * glint * mix(1.8, 0.72, altitudeMix);

        float radialDistance = length(vWorldPosition.xz - cameraPosition.xz);
        float hazeStart = mix(82000.0, 43000.0, altitudeMix);
        float haze = smoothstep(hazeStart, 238000.0, radialDistance);
        vec3 horizonSheet = mix(vec3(0.24, 0.40, 0.51), vec3(0.13, 0.22, 0.32), altitudeMix);
        color = mix(color, horizonSheet, haze * 0.94);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  // The plane follows the aircraft laterally, making its full 500 km useful in every mission.
  const geometry = new THREE.PlaneGeometry(500000, 500000, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
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
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setClearColor(0x020611, 1);

    this.camera = new THREE.PerspectiveCamera(66, 1, 0.12, 400000);
    this.camera.rotation.order = "YXZ";

    this.scene = new THREE.Scene();
    this.sky = createSky();
    this.sea = createSea();
    this.scene.add(this.sky.mesh, this.sea.mesh);

    this.scene.add(new THREE.HemisphereLight(0x91b9d0, 0x10242d, 1.28));
    this.sun = new THREE.DirectionalLight(0xffe1ae, 2.25);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;

    this.drone = createDrone();
    this.awacs = createAwacs();
    this.hiddenDrone = createDrone();
    this.hiddenGlider = createGlider();
    this.hiddenDrone.visible = false;
    this.hiddenGlider.visible = false;
    this.awacs.visible = false;
    this.scene.add(this.drone, this.awacs, this.hiddenDrone, this.hiddenGlider);

    this.playerPosition = new THREE.Vector3();
    this.playerForward = new THREE.Vector3(0, 0, -1);
    this.playerUp = new THREE.Vector3(0, 1, 0);
    this.playerRight = new THREE.Vector3(1, 0, 0);
    this.playerQuaternion = new THREE.Quaternion();
    this.banditPosition = new THREE.Vector3();
    this.banditQuaternion = new THREE.Quaternion();
    this.localTarget = new THREE.Vector3();
    this.localYawQuaternion = new THREE.Quaternion();
    this.localPitchQuaternion = new THREE.Quaternion();
    this.localGimbalQuaternion = new THREE.Quaternion();
    this.inversePlayerQuaternion = new THREE.Quaternion();
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);

    this.hud = createHud(hudCanvas);
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.hud.resize(width, height, pixelRatio);
  }

  frameFromState(state, prefix) {
    const forward = new THREE.Vector3(state[`${prefix}fx`], state[`${prefix}fy`], -state[`${prefix}fz`]).normalize();
    const up = new THREE.Vector3(state[`${prefix}lx`], state[`${prefix}ly`], -state[`${prefix}lz`]).normalize();

    // Sim X/Y/Z is east/up/north (left-handed physical space). Flipping Z gives three.js
    // coordinates. Build the full attitude from the kernel's forward/lift frame: using a
    // world-up lookAt here reverses roll and becomes singular at a loop apex.
    const zAxis = forward.clone().negate();
    const right = up.clone().cross(zAxis).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, up, zAxis);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
    return { forward, up, right, quaternion };
  }

  updateGimbal(dt) {
    if (padlock) {
      this.localTarget.copy(this.banditPosition).sub(this.playerPosition).normalize();
      this.inversePlayerQuaternion.copy(this.playerQuaternion).invert();
      this.localTarget.applyQuaternion(this.inversePlayerQuaternion);
      const desiredYaw = clamp(Math.atan2(this.localTarget.x, -this.localTarget.z), -MAX_GIMBAL_YAW, MAX_GIMBAL_YAW);
      const desiredPitch = clamp(
        Math.atan2(this.localTarget.y, Math.hypot(this.localTarget.x, this.localTarget.z)),
        -MAX_GIMBAL_PITCH,
        MAX_GIMBAL_PITCH,
      );
      const follow = expStep(10, dt);
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

  update(state, dt, nowSeconds) {
    const playerFrame = this.frameFromState(state, "p");
    const banditFrame = this.frameFromState(state, "b");

    this.playerPosition.set(state.px, state.py, -state.pz);
    this.playerForward.copy(playerFrame.forward);
    this.playerUp.copy(playerFrame.up);
    this.playerRight.copy(playerFrame.right);
    this.playerQuaternion.copy(playerFrame.quaternion);
    this.banditPosition.set(state.bx, state.by, -state.bz);
    this.banditQuaternion.copy(banditFrame.quaternion);

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

    const balloonStrike = /balloon|kj-500/i.test(state.beat ?? "");
    this.drone.visible = !balloonStrike;
    this.awacs.visible = balloonStrike;
    this.hiddenDrone.visible = false;
    this.hiddenGlider.visible = false;

    const target = balloonStrike ? this.awacs : this.drone;
    target.position.copy(this.banditPosition);
    target.quaternion.copy(this.banditQuaternion);
    // True scale is retained in the merge; the visual assist ramps only after 250 m.
    const range = Number.isFinite(state.range_m) ? state.range_m : this.banditPosition.distanceTo(this.playerPosition);
    const scale = 1 + 5 * smoothstep(250, 18000, range);
    target.scale.setScalar(scale);
    if (this.awacs.userData.rotodome) this.awacs.userData.rotodome.rotation.y = nowSeconds * 0.42;

    this.sky.mesh.position.copy(this.camera.position);
    this.sky.uniforms.uAltitude.value = Math.max(0, this.camera.position.y);
    this.sea.mesh.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sea.uniforms.uTime.value = nowSeconds;
    this.sea.uniforms.uAltitude.value = Math.max(0, this.camera.position.y);

    this.sun.position.copy(this.camera.position).addScaledVector(SUN_DIRECTION, 80000);
    this.sunTarget.position.copy(this.camera.position);
    this.sunTarget.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
    this.hud.draw({
      state,
      camera: this.camera,
      playerPosition: this.playerPosition,
      playerForward: this.playerForward,
      playerUp: this.playerUp,
      playerRight: this.playerRight,
      banditPosition: this.banditPosition,
      sensorYaw,
      sensorPitch,
      padlock,
      now: nowSeconds,
    });
  }
}

function installInput(view) {
  window.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Space", "F1"].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat || !bridge) return;

    if (/^Digit[1-4]$/.test(event.code)) {
      bridge.StartBeat(Number(event.code.slice(-1)));
      return;
    }

    if (event.code === "F1") {
      bridge.SetVariant(bridge.GetVariant() === 0 ? 1 : 0);
      return;
    }

    if (event.code === "KeyH") {
      view.hud.toggleLegend();
      return;
    }

    const gkey = keyMap.get(event.code);
    if (gkey === undefined) return;
    if (event.code === "KeyV") padlock = !padlock;
    heldKeys.add(event.code);
    bridge.FeedKey(gkey, true);
  }, { passive: false });

  window.addEventListener("keyup", (event) => {
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    if (!bridge || !heldKeys.has(event.code)) return;
    heldKeys.delete(event.code);
    const gkey = keyMap.get(event.code);
    if (gkey !== undefined) bridge.FeedKey(gkey, false);
  }, { passive: false });

  window.addEventListener("blur", () => {
    if (bridge) {
      for (const code of heldKeys) {
        const gkey = keyMap.get(code);
        if (gkey !== undefined) bridge.FeedKey(gkey, false);
      }
    }
    heldKeys.clear();
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
  window.addEventListener("resize", () => view.resize(), { passive: true });
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
  bridge.StartBeat(1);

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
