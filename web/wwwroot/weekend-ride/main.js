import * as THREE from "../vendor/three.module.js?v=281";
import { HelmetHud } from "../render/motorcycle/helmet_hud.js?v=281";
import {
  dominantSignedAxis,
  gamepadRiderAxes,
} from "../render/motorcycle/rider_input.js?v=281";
import {
  createRapierTrackDayPresentation,
} from "../render/motorcycle/track_day_presentation.js?v=281";
import { viewPitchRad } from "../render/motorcycle/view_attitude.js?v=281";
import { createControlsOnboarding } from "../render/onboarding/first_run_controls.js?v=281";
import { WEEKEND_RIDE_ONBOARDING_CONTENT } from "../render/onboarding/controls_content.js?v=281";
import { createCobraTelemetryChannel } from "../render/cobra/cobra_telemetry.js?v=281";
import { RELEASE_BUILD } from "../render/release/release_identity.js?v=281";

const RUNWAY_LENGTH_M = 3_048;
const RUNWAY_WIDTH_M = 48;
const SURFACE_ELEV_M = 192.0;
const EYE_HEIGHT_M = 1.55;

const canvas = document.querySelector("#scene");
const hudCanvas = document.querySelector("#hud");
const viewport = document.querySelector(".viewport");
const status = document.querySelector("#status");
const statusText = status.querySelector("span");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
// QA seam: perf audits read draw calls / triangles from the live renderer.
window.__gunsOnlyWeekendRenderInfo = renderer.info;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78919a);
// Fog and world radius are one knob (~1.87/radius): the 22 km track-day ground plane
// must dissolve into haze before its edge instead of showing a hard rim against sky.
scene.fog = new THREE.FogExp2(0x9da99d, 0.00016);

const camera = new THREE.PerspectiveCamera(68, 1, 0.25, 12_000);
scene.add(new THREE.HemisphereLight(0xe8eee2, 0x3d4632, 0.78));
const sun = new THREE.DirectionalLight(0xffdfb0, 1.18);
sun.position.set(-1_200, 2_400, 900);
scene.add(sun);

const skyGeometry = new THREE.SphereGeometry(8_000, 24, 12);
const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x486d7a) },
    horizonColor: { value: new THREE.Color(0xb2b9a7) },
    lowerHazeColor: { value: new THREE.Color(0x718681) },
  },
  vertexShader: `
    varying vec3 vSkyDirection;
    void main() {
      vSkyDirection = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 horizonColor;
    uniform vec3 lowerHazeColor;
    varying vec3 vSkyDirection;
    void main() {
      float height = vSkyDirection.y;
      vec3 colour = mix(lowerHazeColor, horizonColor, smoothstep(-0.14, 0.06, height));
      colour = mix(colour, topColor, smoothstep(0.02, 0.72, height));
      gl_FragColor = vec4(colour, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
sky.frustumCulled = false;
sky.renderOrder = -500;
scene.add(sky);

const runwayMaterial = new THREE.MeshStandardMaterial({
  color: 0x6f7d74,
  roughness: 0.92,
  metalness: 0.02,
});
const runway = new THREE.Mesh(
  new THREE.PlaneGeometry(RUNWAY_LENGTH_M, RUNWAY_WIDTH_M),
  runwayMaterial,
);
runway.rotation.x = -Math.PI / 2;
runway.position.set(0, SURFACE_ELEV_M, 0);
runway.receiveShadow = true;
scene.add(runway);

const helmetHud = new HelmetHud(hudCanvas);

let bridge = null;
let snapshot = null;
let paused = false;
let manualClutch = false;
let rawPhysics = false;
let trackDayPresentation = null;
let animationFrame = 0;
let lastTimeMs = performance.now();
// Shared first-run controls overlay + standstill nudge (created in boot).
let onboarding = null;
const telemetrySession = `web-ride-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const telemetryChannel = createCobraTelemetryChannel({
  session: telemetrySession,
  build: RELEASE_BUILD,
  userAgent: navigator.userAgent,
});
let telemetryRowRecordedAtMs = -Infinity;
const TELEMETRY_ROW_INTERVAL_MS = 100;

function recordRideTelemetry(nowMs, state, frameMs) {
  if (!state) return;
  if (nowMs - telemetryRowRecordedAtMs < TELEMETRY_ROW_INTERVAL_MS) return;
  telemetryRowRecordedAtMs = nowMs;
  telemetryChannel.record({
    k: "st",
    t: nowMs,
    s: {
      ride_phase: state.phase,
      ride_speed_mps: Math.hypot(state.vx ?? 0, state.vy ?? 0, state.vz ?? 0),
      ride_gear: state.gear,
      ride_engine_rpm: state.engine_rpm,
      ride_lean_rad: state.lean_rad,
      ride_wheelie_rad: state.pitch_rad,
      ride_throttle: state.throttle,
      ride_brake: state.brake,
      ride_on_track: state.on_track,
      ride_lap: state.lap,
      ride_frame_ms: frameMs,
    },
  });
  telemetryChannel.flushIfDue(nowMs);
}

// Standstill means the bike is stopped with the throttle untouched — sim truth, not DOM.
function onboardingNudgeState(state) {
  if (!state || paused || state.phase === "finished") return {};
  const speedMps = Math.hypot(state.vx ?? 0, state.vy ?? 0, state.vz ?? 0);
  return { standstill: speedMps < 0.5 && !keys.has("KeyW") };
}

const keys = new Set();
const simQuat = new THREE.Quaternion();
const basisRight = new THREE.Vector3();
const basisUp = new THREE.Vector3();
const basisForward = new THREE.Vector3();
const cameraZAxis = new THREE.Vector3();
const cameraMatrix = new THREE.Matrix4();

function setStatus(message, state = "loading") {
  statusText.textContent = message;
  status.dataset.ready = state === "ready" ? "true" : "false";
  status.dataset.error = state === "error" ? "true" : "false";
}

function resize() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  helmetHud.resize(width, height, dpr);
}

function simToScenePosition(px, py, pz, target) {
  return target.set(px, py + EYE_HEIGHT_M, -pz);
}

/**
 * Apply sim view quaternion with Z-flip only — no extra JS roll. The sim quaternion
 * carries yaw + head-stabilized roll; wheelie/stoppie pitch arrives separately as
 * pitch_rad and tilts the helmet about its own right axis (positive = nose up).
 */
function applyViewAttitude(cameraObject, state) {
  simQuat.set(state.view_qx, state.view_qy, state.view_qz, state.view_qw);
  basisRight.set(1, 0, 0).applyQuaternion(simQuat);
  basisUp.set(0, 1, 0).applyQuaternion(simQuat);
  basisForward.set(0, 0, 1).applyQuaternion(simQuat);
  basisRight.z *= -1;
  basisUp.z *= -1;
  basisForward.z *= -1;
  cameraZAxis.copy(basisForward).negate();
  basisRight.copy(basisUp).cross(cameraZAxis).normalize();
  cameraMatrix.makeBasis(basisRight, basisUp, cameraZAxis);
  cameraObject.quaternion.setFromRotationMatrix(cameraMatrix).normalize();
  const pitchRad = viewPitchRad(state);
  if (pitchRad !== 0) cameraObject.rotateX(pitchRad);
}

function buildTrackDayPresentation(circuit) {
  if (!Array.isArray(circuit) || circuit.length < 2) return;
  if (trackDayPresentation) {
    scene.remove(trackDayPresentation.object3d);
    trackDayPresentation.dispose();
  }
  trackDayPresentation = createRapierTrackDayPresentation(THREE, circuit, {
    surfaceElevationM: SURFACE_ELEV_M,
    trackWidthM: 20,
  });
  scene.add(trackDayPresentation.object3d);
  helmetHud.setCircuit(circuit);
}

function axisValue(positiveCode, negativeCode) {
  return (keys.has(positiveCode) ? 1 : 0) + (keys.has(negativeCode) ? -1 : 0);
}

function sendControls() {
  if (!bridge || paused) return;
  const gamepad = Array.from(navigator.getGamepads?.() ?? [])
    .find((candidate) => candidate?.connected);
  const analog = gamepadRiderAxes(gamepad);
  const throttle = Math.max(keys.has("KeyW") ? 1 : 0, analog.throttle);
  const brake = Math.max(keys.has("KeyS") ? 1 : 0, analog.brake);
  const steer = dominantSignedAxis(axisValue("KeyD", "KeyA"), analog.turn);
  const riderLateral = dominantSignedAxis(
    axisValue("ArrowRight", "ArrowLeft"),
    analog.bodyLateral,
  );
  const riderForeAft = dominantSignedAxis(
    axisValue("ArrowUp", "ArrowDown"),
    analog.bodyForeAft,
  );
  const clutch = manualClutch
    ? (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 0 : 1)
    : 1;
  bridge.SetControls(throttle, brake, steer, riderLateral, riderForeAft, clutch);
}

function refreshSnapshot() {
  if (!bridge) return null;
  snapshot = JSON.parse(bridge.GetState());
  // QA seam: headless smoke scripts steer against authoritative truth, not DOM guesses.
  window.__gunsOnlyWeekendAuthority = snapshot;
  return snapshot;
}

function syncCamera(state) {
  simToScenePosition(state.px, state.py, state.pz, camera.position);
  applyViewAttitude(camera, state);
}

function animate(timeMs) {
  animationFrame = requestAnimationFrame(animate);
  const deltaSeconds = Math.min(Math.max(0, timeMs - lastTimeMs) / 1_000, 0.05);
  const rawFrameMs = timeMs - lastTimeMs;
  lastTimeMs = timeMs;
  if (!bridge) return;

  sendControls();
  if (!paused) bridge.Advance(deltaSeconds);
  const state = refreshSnapshot();
  if (!state) return;

  syncCamera(state);
  renderer.render(scene, camera);
  helmetHud.draw(state);
  onboarding?.advanceNudges(onboardingNudgeState(state), deltaSeconds);
  recordRideTelemetry(timeMs, state, rawFrameMs);

  if (state.phase === "finished") {
    setStatus("RIDE FINISHED", "error");
  } else if ((state.tip_recovery_flash_s ?? 0) > 0) {
    setStatus("TIP-OVER · RECOVERED", "error");
  } else if (paused) {
    setStatus("PAUSED · ESC TO RESUME", "ready");
  } else {
    setStatus(
      rawPhysics
        ? "YZF-R1 ACTIVE · RAW PHYSICS"
        : "YZF-R1 ACTIVE · RIDER REFLEX ASSIST",
      "ready",
    );
  }
}

function isControlKey(code) {
  return code === "KeyW" || code === "KeyS" || code === "KeyA" || code === "KeyD"
    || code === "KeyQ" || code === "KeyE" || code === "KeyC" || code === "KeyR"
    || code === "ShiftLeft" || code === "ShiftRight"
    || code.startsWith("Arrow");
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    event.preventDefault();
    if (!bridge) return;
    paused = !paused;
    bridge.SetPaused(paused);
    return;
  }
  if (event.code === "KeyR") {
    event.preventDefault();
    bridge?.ResetToGrid();
    refreshSnapshot();
    return;
  }
  if (event.code === "KeyC") {
    event.preventDefault();
    if (!bridge) return;
    manualClutch = !manualClutch;
    bridge.SetClutchMode(manualClutch ? 1 : 0);
    return;
  }
  if (event.code === "KeyT") {
    event.preventDefault();
    if (event.repeat) return;
    if (!bridge) return;
    rawPhysics = !rawPhysics;
    bridge.SetControlMode(rawPhysics ? 1 : 0);
    return;
  }
  if (event.code === "KeyQ") {
    event.preventDefault();
    bridge?.FeedShift(-1);
    return;
  }
  if (event.code === "KeyE") {
    event.preventDefault();
    bridge?.FeedShift(1);
    return;
  }
  if (!isControlKey(event.code)) return;
  event.preventDefault();
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", resize, { passive: true });

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  setStatus("WebGL context lost — reload the ride", "error");
});

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  telemetryChannel.flush({ pagehide: true });
  trackDayPresentation?.dispose();
  renderer.dispose();
}, { once: true });

async function boot() {
  resize();
  try {
    await (globalThis.__gunsPrebootReady ?? Promise.resolve());
    const blazor = await new Promise((resolve, reject) => {
      const deadline = performance.now() + 15_000;
      const poll = () => {
        if (globalThis.Blazor) return resolve(globalThis.Blazor);
        if (performance.now() >= deadline) return reject(new Error("Motorcycle runtime unavailable."));
        window.setTimeout(poll, 25);
      };
      poll();
    });
    await blazor.start({
      // Subroute pages must never fetch framework assets under /weekend-ride/_framework/.
      loadBootResource(_type, name) {
        return `/_framework/${name}`;
      },
    });
    const runtimeAccessor = await new Promise((resolve, reject) => {
      const deadline = performance.now() + 15_000;
      const poll = () => {
        if (globalThis.getDotnetRuntime) return resolve(globalThis.getDotnetRuntime);
        if (performance.now() >= deadline) return reject(new Error("Weekend ride bridge unavailable."));
        window.setTimeout(poll, 25);
      };
      poll();
    });
    const { getAssemblyExports } = await runtimeAccessor(0);
    const assemblyExports = await getAssemblyExports("GunsOnly.Web");
    bridge = assemblyExports.GunsOnly.Web.MotorcycleWebBridge;
    bridge.Start();
    snapshot = refreshSnapshot();
    // The centreline is immutable: fetch it once instead of re-marshalling ~1,700
    // points inside every per-frame GetState snapshot.
    buildTrackDayPresentation(JSON.parse(bridge.GetCircuit()));
    manualClutch = snapshot.clutch_mode === "manual";
    setStatus("RAPIER TRACK DAY · RIDER REFLEX ASSIST", "ready");
    onboarding = createControlsOnboarding({
      modeId: WEEKEND_RIDE_ONBOARDING_CONTENT.modeId,
      content: WEEKEND_RIDE_ONBOARDING_CONTENT,
      nudges: [
        { id: "ride", text: "HOLD W — THROTTLE TO RIDE", when: (s) => s.standstill === true, afterSeconds: 3 },
      ],
    });
    onboarding.maybeShowFirstRun();
    lastTimeMs = performance.now();
    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    setStatus(`Weekend ride failed: ${error.message}`, "error");
  }
}

boot();
