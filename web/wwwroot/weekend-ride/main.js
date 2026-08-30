import * as THREE from "../vendor/three.module.js";
import { HelmetHud } from "../render/motorcycle/helmet_hud.js?v=350";
import {
  loadRideBest,
  saveRideBest,
} from "../render/ride/ride_best_lap_store.js?v=350";
import { weekendRideResult } from "../render/ride/weekend_ride_result.js?v=350";
import { weekendRideEscapeAction } from "../render/ride/weekend_ride_lifecycle.js?v=350";
import {
  dominantSignedAxis,
  gamepadRiderAxes,
} from "../render/motorcycle/rider_input.js?v=350";
import {
  createRapierTrackDayPresentation,
} from "../render/motorcycle/track_day_presentation.js?v=350";
import { viewPitchRad } from "../render/motorcycle/view_attitude.js?v=350";
import {
  advanceLowSpeedLens,
  lowSpeedLensTarget,
  neutralLowSpeedLens,
} from "../render/camera/low_speed_lens.js?v=350";
import {
  applyTexelStabilizedDirectionalShadow,
} from "../render/visual/shadow_stabilizer.js?v=350";
import { createControlsOnboarding } from "../render/onboarding/first_run_controls.js?v=350";
import { WEEKEND_RIDE_ONBOARDING_CONTENT } from "../render/onboarding/controls_content.js?v=350";
import {
  armFlightAudio,
  setFlightAudioEnabled,
  suspendFlightAudio,
  updateFlightAudio,
} from "../render/audio/flight_audio.js?v=350";
import {
  loadPlayerSettings,
  savePlayerSettings,
} from "../render/settings/player_settings.js?v=350";
import { standaloneNavigationHref } from "../render/shell/standalone_navigation.js?v=350";
import { createCobraTelemetryChannel } from "../render/cobra/cobra_telemetry.js?v=350";
import { RELEASE_BUILD } from "../render/release/release_identity.js?v=350";

const RUNWAY_LENGTH_M = 3_048;
const RUNWAY_WIDTH_M = 48;
const SURFACE_ELEV_M = 192.0;
const EYE_HEIGHT_M = 1.55;
const WEEKEND_LOW_SPEED_LENS = Object.freeze({
  wideFovDeg: 74,
  cruiseFovDeg: 68,
  wideThroughSpeedMps: 3,
  cruiseSpeedMps: 34,
  maxEdgeWrap01: 0.04,
  responsePerSecond: 3.8,
});

const canvas = document.querySelector("#scene");
const hudCanvas = document.querySelector("#hud");
const viewport = document.querySelector(".viewport");
const status = document.querySelector("#status");
const statusText = status.querySelector("span");
const pauseButton = document.querySelector("#pause-button");
const soundButton = document.querySelector("#sound-button");
const rideBrief = document.querySelector("#ride-brief");
const rideBriefStart = document.querySelector("#ride-brief-start");
const pauseMenu = document.querySelector("#pause-menu");
const pauseResume = document.querySelector("#pause-resume");
const pauseEnd = document.querySelector("#pause-end");
const rideResult = document.querySelector("#ride-result");
const resultTitle = document.querySelector("#result-title");
const resultVerdict = document.querySelector("#result-verdict");
const resultSummary = document.querySelector("#result-summary");
const resultCorrection = document.querySelector("#result-correction");
const resultRetry = document.querySelector("#result-retry");
const resultMetricNodes = new Map([
  ["LAPS", document.querySelector("#result-laps")],
  ["LAST", document.querySelector("#result-last")],
  ["RECORD", document.querySelector("#result-record")],
  ["OPEN LAP", document.querySelector("#result-open-lap")],
  ["OFF TRACK", document.querySelector("#result-off-track")],
]);
const resultSectorNodes = [1, 2, 3, 4]
  .map((sector) => document.querySelector(`#result-sector-${sector}`));
const standaloneReturnLinks = ["#ride-brief-return", "#pause-return", "#result-return"]
  .map((selector) => document.querySelector(selector))
  .filter(Boolean);
for (const returnLink of standaloneReturnLinks) {
  returnLink.href = standaloneNavigationHref(
    returnLink.getAttribute("href"),
    window.location,
  );
}
const missionBackground = [
  document.querySelector(".topbar"),
  document.querySelector("aside"),
  viewport,
].filter(Boolean);

// QUALITY TIER. This page had none — no budget, no tier, no shed path (render-architecture §5).
// The three signals are the same ones app.js:1200-1227 reads, and the conservative reading is the
// same: a coarse pointer is a phone unless BOTH memory and core count say otherwise, and missing
// data (Safari does not publish deviceMemory) is not evidence of headroom.
const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches === true;
const touchPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  && new URL(window.location.href).searchParams.get("input") === "touch";
const touchPresentation = coarsePointer || touchPreview;
document.body.dataset.input = touchPresentation ? "touch" : "desktop";
const deviceMemoryGiB = Number.isFinite(navigator.deviceMemory) ? navigator.deviceMemory : null;
const logicalCores = Number.isFinite(navigator.hardwareConcurrency)
  ? navigator.hardwareConcurrency
  : null;
const constrainedDevice = (deviceMemoryGiB !== null && deviceMemoryGiB <= 4)
  || (logicalCores !== null && logicalCores <= 4);
const touchHeadroom = deviceMemoryGiB !== null && deviceMemoryGiB >= 8
  && logicalCores !== null && logicalCores >= 8;
const QUALITY_TIER = touchPresentation
  ? (touchHeadroom ? "balanced" : "mobile")
  : (constrainedDevice ? "balanced" : "desktop");

// CAST-SHADOW CASCADE, sized from this scene rather than copied from a flight sim's.
//
// Weekend Ride's sun sits at atan(2400 / hypot(1200, 900)) = 58 degrees — nearly four times the
// elevation of the F-22/Cobra house sun — so cot(58) = 0.62 and shadows here are SHORT: a 12 m
// conifer lays 7.5 m, a 1.2 m cone lays 0.75 m, a marshal post lays about 1.4 m. Nothing in this
// world casts far, so extent buys nothing past the near field and every metre of it costs texel
// density on the things that matter (kerbs, cones, tyre walls, the bike's own contact shadow).
//
// The rider's near field at 80 m/s is the next ~4 seconds of track, so 300 m of half-extent
// covers everything worth resolving and the 22 km ground plane beyond it is fogged out anyway
// (density 1.6e-4 = a ~11.7 km readable radius by the 1.87/radius law).
//
//   desktop  2048 over 600 m = 0.29 m/texel  (a 1.2 m cone's shadow is ~2.5 texels — readable)
//   balanced 1024 over 520 m = 0.51 m/texel
//   mobile   off. This page's floor is a phone GPU with no budget system behind it; it renders
//            without shadows honestly rather than dropping frames for them.
const SHADOW_TIERS = Object.freeze({
  mobile: Object.freeze({ mapSize: 0, halfExtentM: 0 }),
  balanced: Object.freeze({ mapSize: 1_024, halfExtentM: 260 }),
  desktop: Object.freeze({ mapSize: 2_048, halfExtentM: 300 }),
});
const shadowTier = SHADOW_TIERS[QUALITY_TIER];
// Sub-texel normal offset at 0.29 m/texel; the ground here is a literal plane, so acne only
// appears where the shoulder/track ribbons stack within a few centimetres of it.
const SHADOW_NORMAL_BIAS_M = 0.5;
const SHADOW_DEPTH_BIAS = -0.0004;
const SHADOW_LOOKAHEAD_FRACTION = 0.45;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
// DEFECT 4 (render-architecture §1.2): every ground surface in track_day_presentation.js already
// sets `receiveShadow = true`, but nothing ever enabled the pass or made a light cast — dead code
// pretending to be a feature. PCFSoft matches the production F-22 filter: one engine, one look.
renderer.shadowMap.enabled = shadowTier.mapSize > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// QA seam: perf audits read draw calls / triangles from the live renderer.
window.__gunsOnlyWeekendRenderInfo = renderer.info;
// QA seam: the shadow tier is a rendering decision a perf audit has to be able to read back.
window.__gunsOnlyWeekendQuality = Object.freeze({
  tier: QUALITY_TIER,
  shadowMapSize: shadowTier.mapSize,
  shadowHalfExtentM: shadowTier.halfExtentM,
});

// DEFECT 3: the horizon is drawn twice, in two different colours. `FogExp2(0x9da99d)` is the
// colour geometry dissolves INTO; `background` is what fills the pixels past the geometry. They
// were 0x9da99d and 0x78919a, so the ground plane faded to a pale green-grey and then met a
// blue-grey sky at a visible seam. The sky dome (below) is what the player actually sees up
// there, so the background is now simply the fog colour and the seam has nowhere to appear.
const HORIZON_HAZE_COLOR = 0x9da99d;
const scene = new THREE.Scene();
scene.background = new THREE.Color(HORIZON_HAZE_COLOR);
// Fog and world radius are one knob (~1.87/radius): the 22 km track-day ground plane
// must dissolve into haze before its edge instead of showing a hard rim against sky.
scene.fog = new THREE.FogExp2(HORIZON_HAZE_COLOR, 0.00016);

// DEFECT 2: far plane was 12 km against a 22 km ground plane, so the plane's corners (15.6 km
// out) were clipped and the world ended in mid-air. 24 km clears the corners with margin and
// still leaves the sky dome inside the frustum. Near stays 0.25 m — the depth ratio doubles to
// 96,000:1, which this page can afford because nothing here is drawn at slant range: the only
// coplanar surfaces (track, shoulder, kerbs, patchwork) are within 300 m and already carry
// explicit polygonOffset.
const camera = new THREE.PerspectiveCamera(68, 1, 0.25, 24_000);
let rideLens = neutralLowSpeedLens(WEEKEND_LOW_SPEED_LENS);
scene.add(new THREE.HemisphereLight(0xe8eee2, 0x3d4632, 0.78));
const sun = new THREE.DirectionalLight(0xffdfb0, 1.18);
sun.position.set(-1_200, 2_400, 900);
scene.add(sun);
scene.add(sun.target);
sun.castShadow = shadowTier.mapSize > 0;
if (sun.castShadow) sun.shadow.mapSize.set(shadowTier.mapSize, shadowTier.mapSize);
sun.shadow.bias = SHADOW_DEPTH_BIAS;
sun.shadow.normalBias = SHADOW_NORMAL_BIAS_M;
const sunTravelDirection = sun.position.clone().negate().normalize();
const shadowFocus = new THREE.Vector3();
const shadowForward = new THREE.Vector3();

/** Texel-snapped so the projection does not crawl while the bike translates under it. */
function updateShadowFrame() {
  if (!sun.castShadow) return;
  camera.getWorldDirection(shadowForward);
  shadowForward.y = 0;
  if (shadowForward.lengthSq() < 1e-6) shadowForward.set(0, 0, -1);
  shadowForward.normalize();
  shadowFocus.copy(camera.position)
    .addScaledVector(shadowForward, shadowTier.halfExtentM * SHADOW_LOOKAHEAD_FRACTION);
  shadowFocus.y = SURFACE_ELEV_M;
  applyTexelStabilizedDirectionalShadow(sun, shadowFocus, {
    direction: sunTravelDirection,
    mapSize: shadowTier.mapSize,
    halfExtent: shadowTier.halfExtentM,
  });
}

// The sky dome has to sit outside the ground plane it is meant to back, and inside the far
// plane. At 8 km it was INSIDE the 22 km ground (§1.2) and only render order was hiding it;
// 18 km puts it beyond the plane's 15.6 km corners and 6 km short of the far plane.
const skyGeometry = new THREE.SphereGeometry(18_000, 24, 12);
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

// DEFECT 1: `scene.environment` was never set. Every surface in this scene is
// `MeshStandardMaterial`, and a PBR material with no image-based light has nothing to reflect —
// its whole indirect term collapses onto one hemisphere light, which is exactly the recipe for
// plastic, and is why unlit props read as black silhouettes. The same diagnosis is already
// written down in cobra_canyon_visual_profile.js, where the missing IBL forced the hemisphere
// bounce colour to be lifted as a stand-in.
//
// The environment is a PMREM of THIS PAGE'S OWN SKY SHADER, not a stock studio HDRI: the sky is
// the only light source in the world above the ground, so baking it is both free of new assets
// and automatically consistent with the dome the rider is looking at. A 200 m proxy sphere is
// used rather than the 18 km one so the bake camera's near/far stay sane; radius is irrelevant to
// a directionless environment probe.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyProbeScene = new THREE.Scene();
  const skyProbe = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 12), skyMaterial);
  skyProbe.frustumCulled = false;
  skyProbeScene.add(skyProbe);
  scene.environment = pmrem.fromScene(skyProbeScene, 0, 1, 1_000).texture;
  skyProbe.geometry.dispose();
  pmrem.dispose();
}

const runwayMaterial = new THREE.MeshStandardMaterial({
  color: 0x6f7d74,
  roughness: 0.92,
  metalness: 0.02,
  // Same IBL fill fraction the track-day presentation gets in applySceneMaterialPolicy(); this
  // one mesh is built here rather than there, and a different envMapIntensity would print the
  // runway a different value from the shoulder it butts against.
  envMapIntensity: 0.55,
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
let persistedBestSeconds = null;
let recordAtStartSeconds = null;
/** Identity of the circuit a stored best belongs to; set once the circuit is known. */
let rideCircuitIdentity = null;

/** localStorage can throw outright (blocked cookies, private mode): never let that cost a ride. */
function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Writes a new best the moment the sim reports one, so a crash never loses the record. */
function persistBestLapIfImproved(state) {
  const best = Number(state?.best_lap_s);
  if (!Number.isFinite(best) || best <= 0) return;
  if (persistedBestSeconds !== null && best >= persistedBestSeconds) return;
  const profile = bridge?.GetBestSplitProfile?.();
  if (!profile || profile.length === 0) return;
  if (saveRideBest(safeLocalStorage(), {
    bestLapSeconds: best,
    splitProfile: Array.from(profile),
    bestSectorSeconds: Array.from(state.best_sector_s ?? []),
  }, rideCircuitIdentity)) {
    persistedBestSeconds = best;
  }
}
let snapshot = null;
let playerSettings = loadPlayerSettings(safeLocalStorage());
let dispatchOpen = true;
let paused = false;
let terminal = false;
let tornDown = false;
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
const RIDE_AGAIN_SESSION_KEY = "guns-only.weekend-ride.ride-again";

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
      ride_lap: state.lap,
      ride_frame_ms: frameMs,
    },
  });
  telemetryChannel.flushIfDue(nowMs);
}

// Standstill means the bike is stopped with the throttle untouched — sim truth, not DOM.
function onboardingNudgeState(state) {
  if (!state || dispatchOpen || onboarding?.isOpen() === true
    || paused || state.phase === "finished") return {};
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
  status.dataset.result = state === "result" ? "true" : "false";
}

function applyWeekendAudioIdentity(state) {
  if (!state) return state;
  state.audio_profile_id = "audio.yzf-r1.crossplane.v1";
  state.player_aircraft_id = "vehicle.yzf-r1.track-day.v1";
  return state;
}

function syncSoundControl() {
  if (!soundButton) return;
  soundButton.textContent = `Sound ${playerSettings.audio ? "on" : "off"}`;
  soundButton.setAttribute("aria-pressed", String(playerSettings.audio));
}

function setWeekendAudioEnabled(nextEnabled, { arm = false } = {}) {
  playerSettings = savePlayerSettings({
    ...playerSettings,
    audio: Boolean(nextEnabled),
  }, safeLocalStorage());
  setFlightAudioEnabled(playerSettings.audio);
  syncSoundControl();
  if (arm && playerSettings.audio && snapshot)
    armFlightAudio(applyWeekendAudioIdentity(snapshot));
  return playerSettings.audio;
}

function releaseRideControls() {
  keys.clear();
  bridge?.SetControls(0, 0, 0, 0, 0, 1);
}

function setMissionBackgroundInert(inert) {
  for (const node of missionBackground) node.inert = inert === true;
}

function safeSessionStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function consumeRideAgainIntent() {
  const storage = safeSessionStorage();
  try {
    const replay = storage?.getItem?.(RIDE_AGAIN_SESSION_KEY) === "1";
    storage?.removeItem?.(RIDE_AGAIN_SESSION_KEY);
    return replay;
  } catch {
    return false;
  }
}

function showRideBrief({ focus = true } = {}) {
  if (!bridge || terminal) return false;
  dispatchOpen = true;
  paused = false;
  bridge.SetPaused(true);
  refreshSnapshot();
  document.body.dataset.dispatch = "true";
  document.body.dataset.paused = "false";
  rideBrief.hidden = false;
  pauseMenu.hidden = true;
  pauseButton.disabled = true;
  pauseButton.setAttribute("aria-pressed", "false");
  pauseButton.textContent = "Pause";
  setMissionBackgroundInert(true);
  suspendFlightAudio("weekend-ride-dispatch");
  setStatus("READY · REVIEW SESSION BRIEF", "ready");
  if (focus) queueMicrotask(() => rideBriefStart?.focus({ preventScroll: true }));
  return true;
}

function startRideFromBrief({ showOnboarding = true } = {}) {
  if (!bridge || !dispatchOpen || terminal) return false;
  dispatchOpen = false;
  rideBrief.hidden = true;
  document.body.dataset.dispatch = "false";
  setMissionBackgroundInert(false);
  bridge.SetPaused(false);
  refreshSnapshot();
  pauseButton.disabled = false;
  lastTimeMs = performance.now();
  if (playerSettings.audio) armFlightAudio(applyWeekendAudioIdentity(snapshot));
  canvas.focus?.({ preventScroll: true });
  const teachingOpen = showOnboarding && onboarding?.maybeShowFirstRun() === true;
  if (!teachingOpen) canvas.focus?.({ preventScroll: true });
  setStatus("RAPIER TRACK DAY · RIDER REFLEX ASSIST", "ready");
  return true;
}

function setRidePaused(next, { focus = true } = {}) {
  if (!bridge || dispatchOpen || terminal) return false;
  const shouldPause = next === true;
  if (paused === shouldPause) return false;
  paused = shouldPause;
  bridge.SetPaused(paused);
  refreshSnapshot();
  document.body.dataset.paused = String(paused);
  pauseMenu.hidden = !paused;
  setMissionBackgroundInert(paused);
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseButton.textContent = paused ? "Resume" : "Pause";
  if (paused) {
    releaseRideControls();
    suspendFlightAudio("weekend-ride-paused");
    if (focus) queueMicrotask(() => pauseResume?.focus({ preventScroll: true }));
  } else {
    lastTimeMs = performance.now();
    if (playerSettings.audio) armFlightAudio(applyWeekendAudioIdentity(snapshot));
    if (focus) canvas.focus?.({ preventScroll: true });
  }
  return true;
}

function showRideResult(state) {
  if (!state || terminal) return false;
  terminal = true;
  dispatchOpen = false;
  paused = false;
  releaseRideControls();
  suspendFlightAudio("weekend-ride-result");
  onboarding?.dismiss();
  document.body.dataset.paused = "false";
  document.body.dataset.dispatch = "false";
  document.body.dataset.terminal = "true";
  setMissionBackgroundInert(true);
  rideBrief.hidden = true;
  pauseMenu.hidden = true;
  pauseButton.disabled = true;
  pauseButton.setAttribute("aria-pressed", "false");
  pauseButton.textContent = "Complete";

  const result = weekendRideResult(state, { recordAtStartSeconds });
  resultTitle.textContent = result.title;
  resultVerdict.textContent = result.verdict;
  resultSummary.textContent = result.summary;
  resultCorrection.textContent = result.correction;
  for (const metric of result.metrics) {
    const node = resultMetricNodes.get(metric.label);
    if (!node) continue;
    node.textContent = metric.value;
    if (metric.tone) node.dataset.tone = metric.tone;
    else node.removeAttribute("data-tone");
  }
  result.sectors.forEach((value, index) => {
    if (resultSectorNodes[index]) resultSectorNodes[index].textContent = value;
  });
  window.__gunsOnlyWeekendResult = result;
  rideResult.hidden = false;
  setStatus(result.title, "result");
  queueMicrotask(() => resultRetry?.focus({ preventScroll: true }));
  return true;
}

function endRide() {
  if (!bridge || terminal) return false;
  bridge.EndRide();
  const state = refreshSnapshot();
  persistBestLapIfImproved(state);
  return showRideResult(state);
}

function trapDialogFocus(dialog, event) {
  if (event.code !== "Tab") return;
  const focusable = Array.from(dialog.querySelectorAll("button:not([disabled]), a[href]"));
  if (!focusable.length) return;
  event.stopPropagation();
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const focusOutside = !dialog.contains(document.activeElement);
  if (event.shiftKey && (focusOutside || document.activeElement === first)) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (focusOutside || document.activeElement === last)) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
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

// Which of the track-day meshes stand UP. The presentation already declares its ground surfaces
// by setting `receiveShadow` on them (grass, verge, patchwork, shoulder, track) and leaves the
// props alone, so that flag is a reliable "this is the floor" marker; the two `MeshBasicMaterial`
// backdrops (the merged horizon ridge and the far building silhouettes) are unlit by design and
// sit 8-11 km out, far outside any cascade worth drawing, so they are excluded by material type.
//
// Casting is decided per MESH, and the props are already instanced (cones, tyres, trees, farms,
// beacons), so the entire prop population costs on the order of a dozen shadow submissions.
function applySceneMaterialPolicy(root) {
  root.traverse((object) => {
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    for (const material of materials) {
      // Three r160 has no `scene.environmentIntensity`, so the PMREM's contribution is dialled
      // back per material instead. 0.55 keeps the sky as FILL — it lifts the shadow side off
      // black and gives the asphalt and the tyre walls something to reflect — without letting
      // it compete with the directional key that is doing the modelling.
      if (material.isMeshStandardMaterial) material.envMapIntensity = 0.55;
    }
    if (!object.isMesh) return;
    const unlitBackdrop = materials.some((material) => material.isMeshBasicMaterial);
    object.castShadow = !object.receiveShadow && !unlitBackdrop;
    // Everything lit also receives. The kerbs in particular: they stand 85 mm proud of the
    // track, so they both cast a thin edge shadow onto it AND catch the shadow of the marshal
    // post or tyre wall beside them, and half of that reads as a bug.
    if (!unlitBackdrop) object.receiveShadow = true;
  });
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
  applySceneMaterialPolicy(trackDayPresentation.object3d);
  scene.add(trackDayPresentation.object3d);
  helmetHud.setCircuit(circuit);
}

function axisValue(positiveCode, negativeCode) {
  return (keys.has(positiveCode) ? 1 : 0) + (keys.has(negativeCode) ? -1 : 0);
}

function sendControls() {
  if (!bridge || dispatchOpen || onboarding?.isOpen() === true || paused || terminal) return;
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
  snapshot = applyWeekendAudioIdentity(JSON.parse(bridge.GetState()));
  // QA seam: headless smoke scripts steer against authoritative truth, not DOM guesses.
  window.__gunsOnlyWeekendAuthority = snapshot;
  return snapshot;
}

function syncCamera(state, deltaSeconds) {
  simToScenePosition(state.px, state.py, state.pz, camera.position);
  applyViewAttitude(camera, state);
  const speedMps = Math.hypot(
    Number(state.vx) || 0,
    Number(state.vy) || 0,
    Number(state.vz) || 0,
  );
  rideLens = advanceLowSpeedLens(
    rideLens,
    lowSpeedLensTarget(speedMps, WEEKEND_LOW_SPEED_LENS),
    deltaSeconds,
    WEEKEND_LOW_SPEED_LENS,
  );
  if (Math.abs(camera.fov - rideLens.fovDeg) > 0.001) {
    camera.fov = rideLens.fovDeg;
    camera.updateProjectionMatrix();
  }
  // QA seam: the central projection remains rectilinear; edgeWrap01 records the deliberately
  // bounded peripheral-wrap budget for a future post pass without pretending one exists today.
  window.__gunsOnlyWeekendLens = Object.freeze({
    speedMps,
    fovDeg: rideLens.fovDeg,
    edgeWrapBudget01: rideLens.edgeWrap01,
  });
}

function animate(timeMs) {
  animationFrame = requestAnimationFrame(animate);
  const deltaSeconds = Math.min(Math.max(0, timeMs - lastTimeMs) / 1_000, 0.05);
  const rawFrameMs = timeMs - lastTimeMs;
  lastTimeMs = timeMs;
  if (!bridge) return;

  sendControls();
  const teachingOpen = onboarding?.isOpen() === true;
  if (!dispatchOpen && !teachingOpen && !paused && !terminal) bridge.Advance(deltaSeconds);
  const state = refreshSnapshot();
  if (!state) return;

  updateFlightAudio(state, {
    muted: dispatchOpen || teachingOpen || paused || terminal || !playerSettings.audio,
    nowSeconds: timeMs / 1_000,
  });

  syncCamera(state, deltaSeconds);
  updateShadowFrame();
  renderer.render(scene, camera);
  helmetHud.draw(state);
  persistBestLapIfImproved(state);
  onboarding?.advanceNudges(onboardingNudgeState(state), deltaSeconds);
  recordRideTelemetry(timeMs, state, rawFrameMs);

  if (state.phase === "finished") {
    showRideResult(state);
  } else if ((state.tip_recovery_flash_s ?? 0) > 0) {
    setStatus("TIP-OVER · RECOVERED", "error");
  } else if (dispatchOpen) {
    setStatus("READY · REVIEW SESSION BRIEF", "ready");
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

// Bubble after the shared controls onboarding's capture listener so acknowledgement keys can
// never double as throttle, steering, shifting, reset, or pause input.
window.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (dispatchOpen) return;
    const action = weekendRideEscapeAction({
      onboardingOpen: onboarding?.isOpen() === true,
      paused,
      terminal,
    });
    if (action === "dismiss-onboarding") {
      onboarding.dismiss();
      return;
    }
    if (!bridge || action === "noop") return;
    setRidePaused(action === "pause");
    return;
  }
  if (dispatchOpen) return;
  // Escape above owns dismissal. Every other key waits until the teaching card releases
  // authority, so an acknowledgement can never also reset, shift, or change physics mode.
  if (onboarding?.isOpen() === true) return;
  if (event.code === "KeyM" && !event.repeat && !terminal && !paused) {
    event.preventDefault();
    setWeekendAudioEnabled(!playerSettings.audio, { arm: true });
    return;
  }
  if (terminal || paused) return;
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

pauseButton?.addEventListener("click", () => setRidePaused(!paused));
soundButton?.addEventListener("click", () =>
  setWeekendAudioEnabled(!playerSettings.audio, { arm: true }));
pauseResume?.addEventListener("click", () => setRidePaused(false));
pauseEnd?.addEventListener("click", endRide);
rideBriefStart?.addEventListener("click", () => startRideFromBrief());
rideBrief?.addEventListener("keydown", (event) => trapDialogFocus(rideBrief, event));
pauseMenu?.addEventListener("keydown", (event) => trapDialogFocus(pauseMenu, event));
rideResult?.addEventListener("keydown", (event) => trapDialogFocus(rideResult, event));

function teardownRide(reason) {
  if (tornDown) return;
  tornDown = true;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  setMissionBackgroundInert(false);
  releaseRideControls();
  suspendFlightAudio(reason);
  telemetryChannel.flush({ [reason]: true });
  onboarding?.dispose();
  onboarding = null;
  trackDayPresentation?.dispose();
  trackDayPresentation = null;
  renderer.dispose();
}

function rideAgain() {
  try {
    safeSessionStorage()?.setItem?.(RIDE_AGAIN_SESSION_KEY, "1");
  } catch {
    // A replay still works through the ordinary brief when session storage is unavailable.
  }
  teardownRide("ride_again");
  window.location.reload();
}

resultRetry?.addEventListener("click", rideAgain);

window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", resize, { passive: true });

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  setStatus("WebGL context lost — reload the ride", "error");
});

window.addEventListener("pagehide", () => teardownRide("pagehide"), { once: true });

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
    const circuitPoints = JSON.parse(bridge.GetCircuit());
    rideCircuitIdentity = {
      circuitId: "rapier-strip-weekend",
      circuitLengthM: Number(snapshot?.circuit_length_m) || circuitPoints.length,
    };
    // Chase your real record, not just today's: a best carried over from a previous session
    // seeds the sim so the delta compares against it. A refused seed simply means no best.
    const storedBest = loadRideBest(safeLocalStorage(), rideCircuitIdentity);
    if (storedBest && bridge.SeedBestLap(
      storedBest.bestLapSeconds, storedBest.splitProfile)) {
      // Record what is already on disk, or the first frames would rewrite the same best —
      // and if storage is throwing, retry that write on EVERY frame forever.
      persistedBestSeconds = storedBest.bestLapSeconds;
      recordAtStartSeconds = storedBest.bestLapSeconds;
    }
    snapshot = refreshSnapshot();
    buildTrackDayPresentation(circuitPoints);
    manualClutch = snapshot.clutch_mode === "manual";
    terminal = false;
    dispatchOpen = true;
    paused = false;
    document.body.dataset.dispatch = "true";
    document.body.dataset.paused = "false";
    document.body.dataset.terminal = "false";
    pauseButton.disabled = false;
    soundButton.disabled = false;
    setWeekendAudioEnabled(playerSettings.audio);
    setStatus("RAPIER TRACK DAY · RIDER REFLEX ASSIST", "ready");
    onboarding = createControlsOnboarding({
      modeId: WEEKEND_RIDE_ONBOARDING_CONTENT.modeId,
      content: WEEKEND_RIDE_ONBOARDING_CONTENT,
      focusTarget: canvas,
      nudges: [
        { id: "ride", text: "HOLD W — THROTTLE TO RIDE", when: (s) => s.standstill === true, afterSeconds: 3 },
      ],
    });
    if (consumeRideAgainIntent()) startRideFromBrief({ showOnboarding: false });
    else showRideBrief();
    lastTimeMs = performance.now();
    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    setStatus(`Weekend ride failed: ${error.message}`, "error");
  }
}

const armAudioFromGesture = () => {
  if (playerSettings.audio && snapshot)
    armFlightAudio(applyWeekendAudioIdentity(snapshot));
};
window.addEventListener("pointerdown", armAudioFromGesture, { capture: true, passive: true });
window.addEventListener("keydown", armAudioFromGesture, { capture: true, passive: true });

boot();
