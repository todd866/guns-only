import * as THREE from "../vendor/three.module.js?v=299";
import { HelmetHud } from "../render/motorcycle/helmet_hud.js?v=299";
import {
  dominantSignedAxis,
  gamepadRiderAxes,
} from "../render/motorcycle/rider_input.js?v=299";
import {
  WEEKEND_FIELD_LANDCOVER_URL,
  WEEKEND_HINTERLAND_GROUND_URL,
  WEEKEND_TRACK_SURFACE_URL,
  createWeekendTrackDayPresentation,
} from "../render/motorcycle/track_day_presentation.js?v=299";
import {
  WEEKEND_ROADSIDE_ATLAS_URL,
  createWeekendOpenRoadPresentation,
} from "../render/motorcycle/weekend_open_road_presentation.js?v=299";
import {
  createR1FirstPersonRig,
} from "../render/motorcycle/r1_first_person.js?v=299";
import { viewPitchRad } from "../render/motorcycle/view_attitude.js?v=299";
import { createWeekendVisualQa } from "../render/motorcycle/weekend_visual_qa.js?v=299";
import { createControlsOnboarding } from "../render/onboarding/first_run_controls.js?v=299";
import { WEEKEND_RIDE_ONBOARDING_CONTENT } from "../render/onboarding/controls_content.js?v=299";
import { createCobraTelemetryChannel } from "../render/cobra/cobra_telemetry.js?v=299";
import { RELEASE_BUILD } from "../render/release/release_identity.js?v=299";

const EYE_HEIGHT_M = 1.55;

const canvas = document.querySelector("#scene");
const hudCanvas = document.querySelector("#hud");
const viewport = document.querySelector(".viewport");
const status = document.querySelector("#status");
const statusText = status.querySelector("span");
const diagnosticsToggle = document.querySelector("#diagnostics-toggle");
const rideAnnouncer = document.querySelector("#ride-announcer");

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
scene.background = new THREE.Color(0x96adb3);
// Fog and world radius are one knob (~1.87/radius): the 22 km track-day ground plane
// must dissolve into haze before its edge instead of showing a hard rim against sky.
scene.fog = new THREE.FogExp2(0xa8b8b7, 0.00016);

const camera = new THREE.PerspectiveCamera(68, 1, 0.25, 24_000);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xf4f8f4, 0x67745f, 1.65));
const sun = new THREE.DirectionalLight(0xffefd1, 2.05);
sun.position.set(-1_200, 2_400, 900);
scene.add(sun);

const skyGeometry = new THREE.SphereGeometry(8_000, 24, 12);
const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x5791ad) },
    horizonColor: { value: new THREE.Color(0xc5d5d5) },
    lowerHazeColor: { value: new THREE.Color(0x8aa6aa) },
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
      // ShaderMaterial does not append the built-in material output chunks. These
      // includes are required because THREE.Color uniforms are linear values.
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
sky.frustumCulled = false;
sky.renderOrder = -500;
scene.add(sky);

const trackSurfaceTexture = new THREE.TextureLoader().load(WEEKEND_TRACK_SURFACE_URL);
trackSurfaceTexture.name = "TEX_WEEKEND_TRACK_ASPHALT_V1";
trackSurfaceTexture.colorSpace = THREE.SRGBColorSpace;
trackSurfaceTexture.wrapS = THREE.MirroredRepeatWrapping;
trackSurfaceTexture.wrapT = THREE.MirroredRepeatWrapping;
trackSurfaceTexture.minFilter = THREE.LinearMipmapLinearFilter;
trackSurfaceTexture.magFilter = THREE.LinearFilter;
trackSurfaceTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const hinterlandGroundTexture = new THREE.TextureLoader().load(WEEKEND_HINTERLAND_GROUND_URL);
hinterlandGroundTexture.name = "TEX_WEEKEND_HINTERLAND_GROUND_V1";
hinterlandGroundTexture.colorSpace = THREE.SRGBColorSpace;
hinterlandGroundTexture.wrapS = THREE.MirroredRepeatWrapping;
hinterlandGroundTexture.wrapT = THREE.MirroredRepeatWrapping;
hinterlandGroundTexture.minFilter = THREE.LinearMipmapLinearFilter;
hinterlandGroundTexture.magFilter = THREE.LinearFilter;
hinterlandGroundTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const fieldLandcoverTexture = new THREE.TextureLoader().load(WEEKEND_FIELD_LANDCOVER_URL);
fieldLandcoverTexture.name = "TEX_WEEKEND_FIELD_LANDCOVER_V1";
fieldLandcoverTexture.colorSpace = THREE.SRGBColorSpace;
fieldLandcoverTexture.wrapS = THREE.MirroredRepeatWrapping;
fieldLandcoverTexture.wrapT = THREE.MirroredRepeatWrapping;
fieldLandcoverTexture.minFilter = THREE.LinearMipmapLinearFilter;
fieldLandcoverTexture.magFilter = THREE.LinearFilter;
fieldLandcoverTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const roadsideAtlasTexture = new THREE.TextureLoader().load(WEEKEND_ROADSIDE_ATLAS_URL);
roadsideAtlasTexture.name = "TEX_WEEKEND_ROADSIDE_ATLAS_V1";

const helmetHud = new HelmetHud(hudCanvas);
const r1FirstPerson = createR1FirstPersonRig(THREE);
camera.add(r1FirstPerson.object3d);

let bridge = null;
let snapshot = null;
let paused = false;
let manualClutch = false;
let rawPhysics = false;
let diagnosticsEnabled = false;
let trackDayPresentation = null;
let openRoadPresentation = null;
let weekendVisualQa = null;
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
      ride_engine_rpm: state.rpm,
      ride_lean_rad: state.lean_rad,
      ride_wheelie_rad: state.pitch_rad,
      ride_throttle: state.throttle,
      ride_brake: state.brake,
      ride_on_track: state.on_track,
      ride_on_open_road: state.on_open_road,
      ride_open_road_distance_m: state.open_road_distance_m,
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

function setDiagnosticsEnabled(enabled, { announce = true } = {}) {
  diagnosticsEnabled = enabled === true;
  helmetHud.setDiagnosticsEnabled(diagnosticsEnabled);
  diagnosticsToggle?.setAttribute("aria-pressed", String(diagnosticsEnabled));
  diagnosticsToggle?.setAttribute(
    "aria-label",
    diagnosticsEnabled ? "Hide detailed ride diagnostics" : "Show detailed ride diagnostics",
  );
  diagnosticsToggle?.setAttribute(
    "title",
    `${diagnosticsEnabled ? "Hide" : "Show"} detailed ride diagnostics (I)`,
  );
  if (announce && rideAnnouncer) {
    rideAnnouncer.textContent = diagnosticsEnabled
      ? "Detailed ride diagnostics shown"
      : "Detailed ride diagnostics hidden";
  }
  // QA seam: proves the engineering overlays are opt-in without reading pixels.
  window.__gunsOnlyWeekendDiagnosticsEnabled = diagnosticsEnabled;
}

function toggleDiagnostics() {
  setDiagnosticsEnabled(!diagnosticsEnabled);
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

function buildTrackDayPresentation(routeContract) {
  if (!Array.isArray(routeContract?.centreline) || routeContract.centreline.length < 2) return;
  if (trackDayPresentation) {
    scene.remove(trackDayPresentation.object3d);
    trackDayPresentation.dispose();
  }
  trackDayPresentation = createWeekendTrackDayPresentation(THREE, routeContract, {
    surfaceTexture: trackSurfaceTexture,
    groundTexture: hinterlandGroundTexture,
    fieldTexture: fieldLandcoverTexture,
    roadsideAtlas: roadsideAtlasTexture,
  });
  scene.add(trackDayPresentation.object3d);
  helmetHud.setCircuit(routeContract.centreline);
}

function buildOpenRoadPresentation(networkContract) {
  if (openRoadPresentation) {
    scene.remove(openRoadPresentation.object3d);
    openRoadPresentation.dispose();
  }
  openRoadPresentation = createWeekendOpenRoadPresentation(THREE, networkContract, {
    surfaceTexture: trackSurfaceTexture,
    roadsideAtlas: roadsideAtlasTexture,
  });
  scene.add(openRoadPresentation.object3d);
  // QA seam: the immutable graph is renderer-neutral and never re-sent in GetState().
  window.__gunsOnlyWeekendOpenRoad = openRoadPresentation.plan;
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

  // Query-param-only clean-world QA owns the camera while active. Simulation, HUD and
  // first-person presentation remain untouched and resume when the seam restores ownership.
  if (weekendVisualQa?.active) {
    weekendVisualQa.render();
    return;
  }

  sendControls();
  if (!paused) bridge.Advance(deltaSeconds);
  const state = refreshSnapshot();
  if (!state) return;

  syncCamera(state);
  r1FirstPerson.update(state);
  renderer.render(scene, camera);
  helmetHud.draw(state);
  onboarding?.advanceNudges(onboardingNudgeState(state), deltaSeconds);
  recordRideTelemetry(timeMs, state, rawFrameMs);

  const goldenPathToken = typeof state.golden_path_token === "string"
    ? state.golden_path_token
    : "";
  window.__gunsOnlyWeekendGoldenPath = Object.freeze({
    kind: state.golden_path_kind ?? "none",
    token: goldenPathToken,
  });

  if (state.phase === "finished") {
    setStatus("RIDE FINISHED", "error");
  } else if ((state.tip_recovery_flash_s ?? 0) > 0) {
    setStatus("TIP-OVER · RECOVERED", "error");
  } else if (paused) {
    setStatus("PAUSED · ESC TO RESUME", "ready");
  } else if (goldenPathToken) {
    setStatus(goldenPathToken, "ready");
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
  if (event.code === "KeyI") {
    event.preventDefault();
    if (event.repeat) return;
    toggleDiagnostics();
    return;
  }
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
diagnosticsToggle?.addEventListener("click", toggleDiagnostics);

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  setStatus("WebGL context lost — reload the ride", "error");
});

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  telemetryChannel.flush({ pagehide: true });
  trackDayPresentation?.dispose();
  openRoadPresentation?.dispose();
  weekendVisualQa?.restore();
  trackSurfaceTexture.dispose();
  hinterlandGroundTexture.dispose();
  fieldLandcoverTexture.dispose();
  roadsideAtlasTexture.dispose();
  r1FirstPerson.dispose();
  onboarding?.dispose();
  renderer.dispose();
}, { once: true });

async function boot() {
  resize();
  setDiagnosticsEnabled(false, { announce: false });
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
    // The immutable route contract is fetched once; only authoritative progress/sector state
    // crosses the per-frame snapshot boundary.
    buildTrackDayPresentation(JSON.parse(bridge.GetCircuit()));
    buildOpenRoadPresentation(JSON.parse(bridge.GetRoadNetwork()));
    weekendVisualQa = createWeekendVisualQa({
      THREE,
      renderer,
      scene,
      camera,
      canvas,
      r1Object: r1FirstPerson.object3d,
      getTrackPresentation: () => trackDayPresentation,
      getOpenRoadPresentation: () => openRoadPresentation,
      textures: [
        trackSurfaceTexture,
        hinterlandGroundTexture,
        fieldLandcoverTexture,
        roadsideAtlasTexture,
      ],
      search: location.search,
    });
    manualClutch = snapshot.clutch_mode === "manual";
    setStatus("WEEKEND TRACK DAY · RIDER REFLEX ASSIST", "ready");
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
