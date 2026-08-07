import * as THREE from "../vendor/three.module.js?v=271";
import {
  loadCobraCanyonWorld,
  planCobraCanyonWorld,
  sampleCobraCanyonTerrain,
} from "../render/cobra/cobra_canyon_plan.js?v=271";
import { createCobraCanyonPresentation } from "../render/cobra/cobra_canyon_presentation.js?v=271";
import {
  COBRA_CANYON_TOUR_BASE_AGL_M,
  createCobraCanyonRouteSampler,
  sampleCobraCanyonTour,
} from "../render/cobra/cobra_canyon_tour.js?v=271";
import { createCobraGroundWarPresentation } from "../render/cobra/cobra_ground_war.js?v=271";
import { createHud } from "../hud.js?v=271";
import {
  cobraHudState,
  createCobraHudFrame,
} from "../render/cobra/cobra_hud_adapter.js?v=271";
import {
  cobraRotorcraftHudModel,
  drawCobraRotorcraftHud,
  formatAviationAgl,
  formatAviationRange,
} from "../render/cobra/cobra_rotorcraft_hud.js?v=271";
import { cobraObjectiveCopy } from "../render/cobra/cobra_objective_copy.js?v=271";
import {
  emberActObjectiveOverlay,
  emberPathGuidanceState,
} from "../render/cobra/cobra_ember_path.js?v=271";
import { createGuidancePath } from "../render/scene/guidance_path.js?v=271";
import {
  cobraKeyboardControlIntent,
  resolveCobraControlProfile,
} from "../render/cobra/cobra_control_profile.js?v=271";
import {
  advanceCobraPilotControls,
  cobraGamepadControlAxes,
  createCobraPilotControlState,
  releaseCobraPilotControls,
} from "../render/cobra/cobra_pilot_input.js?v=271";
import {
  createAh1gPresence,
  eyeWorldFromVehicle,
  updateAh1gPresence,
} from "../render/cobra/ah1g_presence.js?v=271";
import {
  COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD,
  clampInducedLookRotation,
  lookAnglesFromOffset,
  lookOffsetFromAngles,
} from "../render/cobra/cobra_camera_bias.js?v=271";
import { createCobraTelemetryChannel } from "../render/cobra/cobra_telemetry.js?v=271";
import {
  MAIN_MENU_HREF,
  resolveEscapeAction,
} from "../render/cobra/cobra_mission_exit.js?v=271";
import { createControlsOnboarding } from "../render/onboarding/first_run_controls.js?v=271";
import { COBRA_ONBOARDING_CONTENT } from "../render/onboarding/controls_content.js?v=271";

const ROUTE_NOTES = Object.freeze({
  "route.cobra-canyon.river-gorge.v1": Object.freeze({
    kind: "MASKED RIVER RUN",
    note: "Narrow · wire and bridge hazards · strongest terrain masking",
  }),
  "route.cobra-canyon.ridge-shadow.v1": Object.freeze({
    kind: "RIDGE SHADOW",
    note: "Saddle crossing · mast and guy-wire hazards · widest sight lines",
  }),
  "route.cobra-canyon.road-plantation.v1": Object.freeze({
    kind: "RED-EARTH TRANSIT",
    note: "Road following · plantation wires · quarry break at the north end",
  }),
});

const QUALITY_PIXEL_RATIOS = Object.freeze({ mobile: 1, balanced: 1.35, desktop: 1.75 });
const ROUTE_ENTRY_OFFSETS_M = Object.freeze({
  "route.cobra-canyon.river-gorge.v1": 5_800,
  "route.cobra-canyon.ridge-shadow.v1": 7_300,
  "route.cobra-canyon.road-plantation.v1": 6_250,
});
const FRAME_SAMPLE_COUNT = 180;
const ROUTE_END_LOOKAHEAD_M = 40;
const ROUTE_CAMERA_LOOKAHEAD_M = 180;
// Real-time contract: the sim advances by real elapsed wall time every rendered frame. The only
// cap is the bridge's own MaximumFrameDeltaSeconds (0.1 s = 12 fixed 120 Hz ticks) — the same
// spiral-brake doctrine as the F-22 loop's SIM_CATCHUP_CAP_SECONDS: past the cap the mission
// deliberately loses wall-clock time rather than chase a stall with ever-longer catch-up frames.
// Low frame rate therefore NEVER means slow motion down to 10 fps; the slow-motion floor exists
// only for extreme (<10 fps) stalls. The old 50 ms JS clamp silently turned the owner's 12.5 fps
// production drive into 0.62x real time.
const SIM_MAX_FRAME_ADVANCE_SECONDS = 0.1;
// Full-state JSON (units, sites, events…) feeds the HUD and ground-war presentation — 30 Hz is
// indistinguishable there, and serializing + parsing it at render rate was pure main-thread
// waste. The camera and airframe presence read the 7-slot binary hot pose every frame instead
// (the Cobra-scale analogue of the F-22 SnapshotHotFrame).
const AUTHORITY_STATE_SAMPLE_INTERVAL_MS = 1_000 / 30;
// Telemetry rows at ~10 Hz keep the channel's 5 s flush cadence draining faster than rows arrive.
const TELEMETRY_ROW_INTERVAL_MS = 100;
const canvas = document.querySelector("#scene");
const viewport = document.querySelector(".viewport");

function setPlayCursorHidden(hidden) {
  const value = hidden ? "none" : "";
  document.body.style.cursor = value;
  if (canvas) canvas.style.cursor = value;
}
const routeSelect = document.querySelector("#route");
const qualitySelect = document.querySelector("#quality");
const speedInput = document.querySelector("#speed");
const heightInput = document.querySelector("#height");
const targetSelect = document.querySelector("#target");
const tourInput = document.querySelector("#tour");
const resetButton = document.querySelector("#reset");
const status = document.querySelector("#status");
const statusText = status.querySelector("span");
const speedValue = document.querySelector("#speed-value");
const heightValue = document.querySelector("#height-value");
const routeKind = document.querySelector("#route-kind");
const routeName = document.querySelector("#route-name");
const routeNote = document.querySelector("#route-note");
const routeProgress = document.querySelector("#route-progress");
const routeFeature = document.querySelector("#route-feature");
const frameMetric = document.querySelector("#frame");
const drawMetric = document.querySelector("#draws");
const instanceMetric = document.querySelector("#instances");
const setPieceMetric = document.querySelector("#set-pieces");
const hazardMetric = document.querySelector("#hazards");
const aglMetric = document.querySelector("#agl");
const powerMetric = document.querySelector("#power");
const gunnerMetric = document.querySelector("#gunner");
const controlMetric = document.querySelector("#control");
const ammoMetric = document.querySelector("#ammo");
const fobMetric = document.querySelector("#fob");
const killsMetric = document.querySelector("#kills");
const balanceFill = document.querySelector("#balance-fill");
const holdFill = document.querySelector("#hold-fill");
const holdLabel = document.querySelector("#hold-label");
const objectiveLine = document.querySelector("#objective-line");
const objectiveDetail = document.querySelector("#objective-detail");
const debrief = document.querySelector("#debrief");
const debriefTitle = document.querySelector("#debrief-title");
const debriefBody = document.querySelector("#debrief-body");
const debriefRestart = document.querySelector("#debrief-restart");
const PLAY_MODE = document.body?.dataset?.shell !== "lab";
let bridge = null;
let missionTerminal = false;
let authorityState = null;
let pilotControls = createCobraPilotControlState(0.5);
let windowFocused = typeof document === "undefined" ? true : document.hasFocus();
const cobraControlProfile = resolveCobraControlProfile();
let groundWarPresentation = null;
let emberGuidancePath = null;
let ah1gPresence = null;
let presenceDeltaSeconds = 0;
let hostileTargetIds = [];
let hostileTargetIndex = -1;
let lastTargetKey = null;
// No target is cued before the pilot's first input: a cold-boot auto-selection used to swing
// the camera toward a hostile before the player had touched anything.
let playerHasInteracted = false;
// Shared first-run controls overlay + contextual nudges (play shell only; created in boot).
let onboarding = null;

// Sim-derived nudge flags: authority truth, not DOM guesses. Grounded-idle means the ship is
// on or near the deck with the collective untouched; hostile-idle means a hostile sits inside
// the gun's 2 km solution envelope (CobraGunTargeting.MaximumSolutionRangeM) with no target cued.
const NUDGE_HOSTILE_RANGE_M = 2_000;
function onboardingNudgeState() {
  if (!bridge || missionTerminal || tourInput?.checked) return {};
  const clearanceM = authorityState?.route_guidance?.current_clearance_m;
  const vehicle = authorityState?.vehicle;
  const hostileInRange = vehicle != null
    && (authorityState?.ground_war?.units ?? []).some((unit) => unit.alive
      && unit.faction === "hostile"
      && Math.hypot(unit.x_m - vehicle.x_m, unit.z_m - vehicle.z_m) <= NUDGE_HOSTILE_RANGE_M);
  return {
    groundedIdle: Number.isFinite(clearanceM)
      && clearanceM <= 3
      && !keys.has(cobraControlProfile.collective.pull.code),
    hostileIdle: hostileInRange && !authorityState?.gunner?.selected_target_id,
  };
}
const telemetrySession = `web-cobra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const telemetryChannel = createCobraTelemetryChannel({
  session: telemetrySession,
  build: new URL(import.meta.url).searchParams.get("v") ?? "dev",
  userAgent: navigator.userAgent,
});
let telemetryRowRecordedAtMs = -Infinity;
let authorityStateSampledAtMs = -Infinity;
// Per-frame binary vehicle pose (camera + presence read this at render rate). Slot order is the
// bridge contract — keep in lockstep with CobraWebBridge.FillHotPose:
// [0] x_m, [1] y_m, [2] z_m, [3] pitch_rad, [4] roll_rad, [5] yaw_rad, [6] main_rotor_rpm.
let vehiclePoseView = null;
const vehiclePoseScratch = new Float64Array(7);
const vehiclePose = {
  x_m: 0, y_m: 0, z_m: 0, pitch_rad: 0, roll_rad: 0, yaw_rad: 0, main_rotor_rpm: 0,
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
  precision: "highp",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

// Build 264 owner ruling: no cockpit, the STANDARD F-22 HUD instead, with
// rotorcraft extras. One engine: this is the production hud.js instance fed by
// the cobra adapter — never a fork. Audio stays off (gun/GCAS tones are jet
// systems the Cobra does not carry).
const hudCanvas = document.querySelector("#hud-canvas");
const hud = createHud(hudCanvas);
hud.setAudioEnabled(false);
const hudPresentationCtx = hudCanvas.getContext("2d", { alpha: true });
const hudFrameKit = createCobraHudFrame(THREE);
const hudStateScratch = {};
// Top inset clears the fixed mission header; the mission card lives bottom-left.
const HUD_SAFE_INSETS = Object.freeze({ top: 40, right: 0, bottom: 0, left: 0 });
const hudViewport = { width: 1, height: 1, pixelRatio: 1 };
const projectionScratch = new THREE.Vector3();

// One-sun doctrine for the canyon scene: the sky shader, the scene light rig, the fog and the
// basin's baked hillshade all read COBRA_CANYON_VISUAL_PROFILE, so glow, prop shading, haze and
// terrain relief agree about the light. Import lives here to keep the whole scene-constants
// block contiguous (top-level imports are hoisted regardless of position).
import { COBRA_CANYON_VISUAL_PROFILE } from "../render/cobra/cobra_canyon_visual_profile.js?v=271";

const sceneProfile = COBRA_CANYON_VISUAL_PROFILE;
const scene = new THREE.Scene();
scene.background = new THREE.Color(sceneProfile.fog.color);
scene.fog = new THREE.FogExp2(sceneProfile.fog.color, sceneProfile.fog.density);

const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 32_000);
camera.rotation.order = "YXZ";
scene.add(new THREE.HemisphereLight(
  sceneProfile.lighting.hemisphereSkyColor,
  sceneProfile.lighting.hemisphereGroundColor,
  sceneProfile.lighting.hemisphereIntensity,
));
const sunDirection = new THREE.Vector3(...sceneProfile.sunDirectionWorld);
const sun = new THREE.DirectionalLight(
  sceneProfile.lighting.sunColor,
  sceneProfile.lighting.sunIntensity,
);
sun.position.copy(sunDirection).multiplyScalar(sceneProfile.lighting.sunDistanceM);
scene.add(sun);

const skyGeometry = new THREE.SphereGeometry(23_000, 32, 16);
// THE F-22'S SKY. This is createDecisionSupportSky's cool (Korea) branch at zero altitude —
// render/scene/scene_builders.js — reproduced here rather than imported, because that builder
// lives inside a 2,600-line module with a configureSceneBuilders() runtime handshake and an
// airframe/effects dependency chain this page must not pull in to draw a dome. The maths and the
// constants are the same, and the constants themselves live in the shared visual profile. The
// honest follow-up is extracting the sky into its own module both pages import.
const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    zenithColor: { value: new THREE.Vector3(...sceneProfile.sky.zenithColor) },
    horizonColor: { value: new THREE.Vector3(...sceneProfile.sky.horizonColor) },
    belowHorizonColor: { value: new THREE.Vector3(...sceneProfile.sky.belowHorizonColor) },
    cloudColor: { value: new THREE.Vector3(...sceneProfile.sky.cloudColor) },
    cloudShelf: { value: new THREE.Vector2(...sceneProfile.sky.cloudShelf) },
    skyCurveExponent: { value: sceneProfile.sky.skyCurveExponent },
    shoulderFalloff: { value: sceneProfile.sky.horizonShoulderFalloff },
    shoulderWeight: { value: sceneProfile.sky.horizonShoulderWeight },
    sunDirection: { value: sunDirection.clone() },
  },
  vertexShader: `
    varying vec3 vSkyDirection;
    void main() {
      vSkyDirection = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 zenithColor;
    uniform vec3 horizonColor;
    uniform vec3 belowHorizonColor;
    uniform vec3 cloudColor;
    uniform vec2 cloudShelf;
    uniform float skyCurveExponent;
    uniform float shoulderFalloff;
    uniform float shoulderWeight;
    uniform vec3 sunDirection;
    varying vec3 vSkyDirection;
    void main() {
      vec3 direction = normalize(vSkyDirection);
      float aboveHorizon = max(direction.y, 0.0);
      float skyCurve = pow(aboveHorizon, skyCurveExponent);
      vec3 colour = mix(horizonColor, zenithColor, skyCurve);
      // Narrow non-luminous horizon shoulder: stays readable in unusual attitudes.
      float horizonShoulder = exp(-abs(direction.y) * shoulderFalloff);
      colour = mix(colour, horizonColor * 1.08, horizonShoulder * shoulderWeight);
      // Painted cumulus band (the documented divergence: no tactical cloud field here).
      float azimuth = atan(direction.z, direction.x);
      float shelf = smoothstep(cloudShelf.x, cloudShelf.x + 0.035, direction.y)
        * (1.0 - smoothstep(cloudShelf.y * 0.62, cloudShelf.y, direction.y));
      float puff = 0.5 * sin(azimuth * 7.3 + 1.7)
        + 0.34 * sin(azimuth * 16.7 - direction.y * 47.0 + 0.6)
        + 0.22 * sin(azimuth * 29.3 + direction.y * 83.0);
      colour = mix(colour, cloudColor, shelf * smoothstep(0.16, 0.68, puff) * 0.55);
      if (direction.y < 0.0) {
        colour = mix(belowHorizonColor, horizonColor, exp(direction.y * 16.0));
      }
      gl_FragColor = vec4(colour, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
sky.name = "COBRA_CANYON_LAB_SKY";
sky.frustumCulled = false;
sky.renderOrder = -1_000;
scene.add(sky);

const keys = new Set();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const movement = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const routePoint = { eastM: 0, upM: 0, northM: 0 };
const lookPoint = { eastM: 0, upM: 0, northM: 0 };
const routeTour = {};
const lookTour = {};
const frameSamples = new Float32Array(FRAME_SAMPLE_COUNT);
let frameSampleCursor = 0;
let frameSampleSize = 0;
let frameCounter = 0;
let frameP95Ms = 0;
let frameP99Ms = 0;
let lastRawFrameMs = 0;
let world = null;
let plan = null;
let presentation = null;
let activeRoute = null;
let routeSampler = null;
let activeSetPieces = [];
let routeDistanceM = 0;
let routeComplete = false;
let tourCommandedAglM = COBRA_CANYON_TOUR_BASE_AGL_M;
let yaw = 0;
let pitch = 0.08;
let lastTimeMs = performance.now();
let animationFrame = 0;

// Per-frame cost seam. Six performance.now() reads per frame (tens of nanoseconds each) buy the
// only number that settles a "feels laggy" report: WHICH phase owns the frame. Weekend Ride
// exposes renderer.info the same way; this page needs the phase split as well because it runs a
// sim, a JSON snapshot, a canvas HUD and a three.js scene in the same callback.
const FRAME_PHASES = Object.freeze(["sim", "state", "presentation", "render", "hud", "total"]);
const framePhaseTotals = Object.fromEntries(FRAME_PHASES.map((phase) => [phase, 0]));
let framePhaseSamples = 0;
function recordPhase(phase, startedAtMs) {
  framePhaseTotals[phase] += performance.now() - startedAtMs;
}
window.__gunsOnlyCobraRenderInfo = renderer.info;
window.__gunsOnlyCobraFrameProfile = Object.freeze({
  reset() {
    for (const phase of FRAME_PHASES) framePhaseTotals[phase] = 0;
    framePhaseSamples = 0;
  },
  read() {
    const frames = Math.max(1, framePhaseSamples);
    const mean = Object.fromEntries(
      FRAME_PHASES.map((phase) => [phase, framePhaseTotals[phase] / frames]),
    );
    return { frames: framePhaseSamples, meanMs: mean, p95Ms: frameP95Ms, p99Ms: frameP99Ms };
  },
});

function setStatus(message, state = "loading") {
  statusText.textContent = message;
  status.dataset.ready = state === "ready" ? "true" : "false";
  status.dataset.error = state === "error" ? "true" : "false";
}

function recordTelemetry(nowMs) {
  if (!authorityState) return;
  if (nowMs - telemetryRowRecordedAtMs < TELEMETRY_ROW_INTERVAL_MS) return;
  telemetryRowRecordedAtMs = nowMs;
  const pose = vehiclePose?.x_m != null ? vehiclePose : null;
  const rotor = authorityState.vehicle?.rotorcraft;
  telemetryChannel.record({
    k: "st",
    t: nowMs,
    s: {
      cobra_world_id: authorityState.world_id,
      cobra_route: authorityState.route,
      cobra_route_id: authorityState.route_id,
      cobra_status: authorityState.status,
      cobra_authority_tick: authorityState.authority_tick,
      cobra_x_m: pose?.x_m ?? authorityState.vehicle.x_m,
      cobra_y_m: pose?.y_m ?? authorityState.vehicle.y_m,
      cobra_z_m: pose?.z_m ?? authorityState.vehicle.z_m,
      cobra_ground_speed_mps: authorityState.vehicle.ground_speed_mps,
      cobra_vertical_speed_mps: authorityState.vehicle.vertical_speed_mps,
      cobra_collective: authorityState.vehicle.collective,
      cobra_power_margin: authorityState.vehicle.power_margin,
      cobra_main_rotor_rpm: rotor?.main_rotor_rpm ?? pose?.main_rotor_rpm,
      cobra_transmission_limit_fraction: rotor?.transmission_limit_fraction,
      // Prefer the per-frame hot pose: GetState is 30 Hz and a stale tab can pin spawn forever
      // while the flying tab's camera still reads hot pose (owner 16:41 flight diagnosis).
      cobra_pitch_rad: pose?.pitch_rad ?? authorityState.vehicle.pitch_rad,
      cobra_roll_rad: pose?.roll_rad ?? authorityState.vehicle.roll_rad,
      cobra_mission_act: authorityState.mission_act,
      cobra_frame_ms: lastRawFrameMs,
      cobra_route_remaining_m: authorityState.route_guidance.remaining_m,
      cobra_cross_track_m: authorityState.route_guidance.cross_track_m,
      cobra_inside_corridor: authorityState.route_guidance.inside_corridor,
      cobra_masking: authorityState.masking.state,
      cobra_gunner_state: authorityState.gunner.state,
      cobra_gunner_reason: authorityState.gunner.reason,
      cobra_fire_authorized: authorityState.gunner.fire_authorized,
      cobra_control: authorityState.ground_war?.control,
      cobra_ammo: authorityState.ground_war?.ammo_remaining,
      cobra_fob_range_m: authorityState.ground_war?.fob_range_m,
      cobra_hostile_kills: authorityState.ground_war?.debrief?.hostile_kills,
    },
  });
  telemetryChannel.flushIfDue(nowMs);
}

/**
 * Pull the full authority snapshot at HUD rate (30 Hz) and fan it out to every JSON consumer.
 * The camera does not wait on this — it reads the per-frame hot pose.
 */
function sampleAuthorityState(nowMs, { force = false } = {}) {
  if (!bridge) return;
  if (!force && nowMs - authorityStateSampledAtMs < AUTHORITY_STATE_SAMPLE_INTERVAL_MS) return;
  authorityStateSampledAtMs = nowMs;
  const stateStartedAtMs = performance.now();
  authorityState = JSON.parse(bridge.GetState());
  // QA seam: headless smoke scripts steer against authoritative truth, not DOM guesses.
  window.__gunsOnlyCobraAuthority = authorityState;
  // Same contract for the one visual claim a screenshot cannot settle: first person must
  // render ZERO airframe geometry, exterior/tour must render the silhouette. A distant
  // ship on a tour rail is a handful of pixels either way, so this is measured, not eyed.
  window.__gunsOnlyCobraAirframeVisible = () => ah1gPresence?.group?.visible === true;
  refreshGroundTargets();
  groundWarPresentation?.sync(authorityState.ground_war ?? null, targetSelect.value || null);
  recordTelemetry(nowMs);
  recordPhase("state", stateStartedAtMs);
}

function readVehiclePose() {
  if (!vehiclePoseView) return authorityState?.vehicle ?? null;
  // copyTo re-derives the underlying view, so WASM memory growth cannot detach this read.
  vehiclePoseView.copyTo(vehiclePoseScratch, 0);
  vehiclePose.x_m = vehiclePoseScratch[0];
  vehiclePose.y_m = vehiclePoseScratch[1];
  vehiclePose.z_m = vehiclePoseScratch[2];
  vehiclePose.pitch_rad = vehiclePoseScratch[3];
  vehiclePose.roll_rad = vehiclePoseScratch[4];
  vehiclePose.yaw_rad = vehiclePoseScratch[5];
  vehiclePose.main_rotor_rpm = vehiclePoseScratch[6];
  return vehiclePose;
}

function qualityPixelRatio() {
  const ceiling = QUALITY_PIXEL_RATIOS[qualitySelect.value] ?? QUALITY_PIXEL_RATIOS.balanced;
  return Math.min(window.devicePixelRatio || 1, ceiling);
}

function resize() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setPixelRatio(qualityPixelRatio());
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  // The HUD keeps device sharpness regardless of the scene quality tier — same
  // doctrine as app.js: adaptive/scene resolution owns the 3D surface only.
  hudViewport.width = width;
  hudViewport.height = height;
  hudViewport.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  hud.resize(width, height, hudViewport.pixelRatio, HUD_SAFE_INSETS);
}

function routeById(routeId) {
  return plan?.routeLanes.find((candidate) => candidate.id === routeId) ?? plan?.routeLanes[0];
}

function groundAt(eastM, northM) {
  return sampleCobraCanyonTerrain(plan, eastM, northM);
}

function cameraAglM() {
  return camera.position.y - groundAt(camera.position.x, -camera.position.z);
}

function updateRouteCard() {
  const details = ROUTE_NOTES[activeRoute.id] ?? { kind: "AUTHORED ROUTE", note: activeRoute.flightVerb };
  routeKind.textContent = details.kind;
  routeName.textContent = activeRoute.displayName;
  routeNote.textContent = details.note;
  activeSetPieces = (plan.setPieceCells ?? []).filter((setPiece) => setPiece.routeId === activeRoute.id);
  setPieceMetric.textContent = `${activeSetPieces.length}/${plan.setPieceCells?.length ?? 0}`;
  updateRouteProgress();
}

function formatRouteDistance(distanceM) {
  return formatAviationRange(distanceM, { style: "nav" });
}

function updateRouteProgress() {
  if (!routeSampler) return;
  const totalLengthM = routeSampler.lengthM;
  const authorityRemainingM = authorityState?.route_guidance?.remaining_m;
  const clampedDistanceM = authorityRemainingM == null
    ? THREE.MathUtils.clamp(routeDistanceM, 0, totalLengthM)
    : THREE.MathUtils.clamp(totalLengthM - authorityRemainingM, 0, totalLengthM);
  const authorityComplete = authorityState?.status === "route-complete";
  routeProgress.style.transform = `scaleX(${authorityComplete || routeComplete
    ? 1
    : clampedDistanceM / totalLengthM})`;
  if (authorityComplete || routeComplete) {
    routeFeature.textContent = "ROUTE COMPLETE · RESTART OR SELECT ANOTHER RUN";
    return;
  }
  if (tourInput.checked && routeTour.active) {
    const offsetFt = Math.abs(routeTour.lateralOffsetM) * 3.28084;
    const lateral = offsetFt >= 2
      ? ` · ${Math.round(offsetFt)} FT ${routeTour.lateralOffsetM > 0 ? "RIGHT" : "LEFT"}`
      : "";
    const aglFt = formatAviationAgl(routeCommandedAglM);
    routeFeature.textContent = `${routeTour.cue} · ${aglFt ?? "—"} FT AGL${lateral}`;
    return;
  }
  if (!activeSetPieces.length) {
    routeFeature.textContent = "Authored route inspection";
    return;
  }
  let nextSetPiece = null;
  let remainingM = 0;
  for (const candidate of activeSetPieces) {
    if (candidate.distanceAlongRouteM + 1 < clampedDistanceM) continue;
    nextSetPiece = candidate;
    remainingM = candidate.distanceAlongRouteM - clampedDistanceM;
    break;
  }
  if (!nextSetPiece) {
    routeFeature.textContent = `ROUTE EXIT · ${formatRouteDistance(totalLengthM - clampedDistanceM)}`;
    return;
  }
  const phase = remainingM <= 220 ? "NOW" : "NEXT";
  routeFeature.textContent = `${phase} · ${nextSetPiece.displayName} · ${formatRouteDistance(remainingM)}`;
}

function placeCameraOnRoute() {
  routeSampler.sample(routeDistanceM, routePoint);
  routeSampler.sample(routeDistanceM + ROUTE_CAMERA_LOOKAHEAD_M, lookPoint);
  const totalLengthM = routeSampler.lengthM;
  sampleCobraCanyonTour(activeRoute.id, routeDistanceM, totalLengthM, routeTour);
  sampleCobraCanyonTour(
    activeRoute.id,
    routeDistanceM + ROUTE_CAMERA_LOOKAHEAD_M,
    totalLengthM,
    lookTour,
  );
  const routeLateralM = tourInput.checked ? routeTour.lateralOffsetM : 0;
  const lookLateralM = tourInput.checked ? lookTour.lateralOffsetM : 0;
  const routeEastM = routePoint.eastM + routePoint.tangentNorth * routeLateralM;
  const routeNorthM = routePoint.northM - routePoint.tangentEast * routeLateralM;
  const lookEastM = lookPoint.eastM + lookPoint.tangentNorth * lookLateralM;
  const lookNorthM = lookPoint.northM - lookPoint.tangentEast * lookLateralM;
  const manualAglM = Number(heightInput.value);
  const routeAglM = tourInput.checked ? routeTour.commandedAglM : manualAglM;
  const lookAglM = tourInput.checked ? lookTour.commandedAglM : manualAglM;
  const groundM = groundAt(routeEastM, routeNorthM);
  const lookGroundM = groundAt(lookEastM, lookNorthM);
  const horizontalLookaheadM = Math.hypot(lookEastM - routeEastM, lookNorthM - routeNorthM);
  const lookDownM = Math.min(lookAglM * 0.38, horizontalLookaheadM * 0.06);
  tourCommandedAglM = routeAglM;
  camera.position.set(routeEastM, groundM + routeAglM, -routeNorthM);
  lookTarget.set(lookEastM, lookGroundM + lookAglM - lookDownM, -lookNorthM);
  camera.lookAt(lookTarget);
  camera.rotation.z = tourInput.checked
    ? THREE.MathUtils.clamp(-routeTour.lateralSlopePerM * 1.7, -0.14, 0.14)
    : 0;
  yaw = camera.rotation.y;
  pitch = camera.rotation.x;
}

function lockPlayRoute() {
  if (!PLAY_MODE || !routeSelect) return;
  routeSelect.selectedIndex = 0;
}

function restartRoute() {
  if (!plan) return;
  lockPlayRoute();
  missionTerminal = false;
  if (debrief) debrief.hidden = true;
  activeRoute = routeById(routeSelect.value);
  bridge?.StartRoute(routeSelect.selectedIndex);
  authorityState = bridge ? JSON.parse(bridge.GetState()) : null;
  pilotControls = createCobraPilotControlState(authorityState?.vehicle?.collective ?? 0.5);
  routeSampler = createCobraCanyonRouteSampler(activeRoute);
  routeDistanceM = ROUTE_ENTRY_OFFSETS_M[activeRoute.id] ?? 0;
  routeComplete = false;
  placeCameraOnRoute();
  updateRouteCard();
  lastTargetKey = null;
  refreshGroundTargets();
  groundWarPresentation?.sync(authorityState?.ground_war ?? null, targetSelect.value || null);
  // Restart must clear the terminal banner, otherwise "MISSION VEHICLE AUTHORITY LOST"
  // and data-error stay stale above a live sortie.
  if (bridge) {
    setStatus(PLAY_MODE
      ? "HOLD THE BRIDGE · AH-1G ONLINE"
      : "AH-1G AUTHORITY ONLINE · LAB", "ready");
  }
}

function ensureAh1gPresence() {
  if (ah1gPresence) return ah1gPresence;
  ah1gPresence = createAh1gPresence(THREE);
  scene.add(ah1gPresence.group);
  return ah1gPresence;
}

function rebuildPresentation() {
  if (!world) return;
  presentation?.dispose();
  groundWarPresentation?.dispose();
  emberGuidancePath?.dispose();
  plan = planCobraCanyonWorld(world, { qualityTier: qualitySelect.value });
  presentation = createCobraCanyonPresentation(THREE, plan, {
    qualityTier: qualitySelect.value,
  });
  groundWarPresentation = createCobraGroundWarPresentation(THREE);
  emberGuidancePath = createGuidancePath(THREE, { maxGates: 16 });
  scene.add(presentation.group);
  scene.add(groundWarPresentation.group);
  scene.add(emberGuidancePath.object3d);
  // Presence is ownship, not canyon scenery — recreate after canyon rebuild so it stays on top.
  if (ah1gPresence) {
    scene.remove(ah1gPresence.group);
    ah1gPresence.dispose();
    ah1gPresence = null;
  }
  ensureAh1gPresence();
  restartRoute();
  resize();
  frameSamples.fill(0);
  frameSampleCursor = 0;
  frameSampleSize = 0;
  frameCounter = 0;
  frameP95Ms = 0;
  frameP99Ms = 0;
  lastTimeMs = performance.now();
  setStatus(`${plan.counts.landmarks} landmarks · ground war online`, "ready");
}

function refreshGroundTargets() {
  const units = authorityState?.ground_war?.units ?? [];
  // Rebuild only when the living set changes: per-frame DOM churn reset focus and the
  // ever-shuffling order made Tab cycling unpredictable.
  const aliveKey = units
    .filter((unit) => unit.alive)
    .map((unit) => unit.id)
    .sort()
    .join("|");
  if (aliveKey === lastTargetKey) return;
  lastTargetKey = aliveKey;
  const vehicle = authorityState?.vehicle;
  const distanceToPlayer = (unit) => vehicle
    ? Math.hypot(unit.x_m - vehicle.x_m, unit.z_m - vehicle.z_m)
    : 0;
  // Gunnery seam first so Tab→F from spawn hits a shootable mark instead of the nearest
  // OutOfLimits infantry (Build 267 flight: ON TARGET rare, OUT OF LIMITS dominant).
  const SEAM_ID = "ground.hostile.gunnery-seam.000";
  hostileTargetIds = units
    .filter((unit) => unit.alive && unit.faction === "hostile")
    .sort((a, b) => {
      if (a.id === SEAM_ID && b.id !== SEAM_ID) return -1;
      if (b.id === SEAM_ID && a.id !== SEAM_ID) return 1;
      return distanceToPlayer(a) - distanceToPlayer(b);
    })
    .map((unit) => unit.id);
  const previous = targetSelect.value;
  targetSelect.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No target";
  targetSelect.append(none);
  for (const unit of units.filter((candidate) => candidate.alive)) {
    const option = document.createElement("option");
    option.value = unit.id;
    const tag = unit.id === SEAM_ID ? "SEAM" : unit.id.slice(-7);
    option.textContent = `${unit.faction === "friendly" ? "FRI" : "HOS"} · ${unit.role} · ${tag}`;
    targetSelect.append(option);
  }
  if (previous && [...targetSelect.options].some((option) => option.value === previous))
    targetSelect.value = previous;
  else if (hostileTargetIds.length && playerHasInteracted) {
    // Auto-reselect keeps continuity after a kill, but never before the pilot's first input —
    // a cold-boot auto-selection dragged the camera toward a hostile on spawn.
    // The WASM bridge still auto-assigns the seam for fire consent without moving the camera.
    hostileTargetIndex = 0;
    targetSelect.value = hostileTargetIds[0];
  }
}

function cycleHostileTarget() {
  if (!hostileTargetIds.length) return;
  // First Tab from idle jumps to the preferred (seam-first) mark instead of advancing
  // past it when index was still -1.
  if (hostileTargetIndex < 0) hostileTargetIndex = 0;
  else hostileTargetIndex = (hostileTargetIndex + 1) % hostileTargetIds.length;
  targetSelect.value = hostileTargetIds[hostileTargetIndex];
  bridge?.SetGunnerTarget(targetSelect.value || null);
}

function updateTour(deltaSeconds) {
  if (routeComplete) return;
  const routeEndM = Math.max(0, routeSampler.lengthM - ROUTE_END_LOOKAHEAD_M);
  routeDistanceM = Math.min(
    routeEndM,
    routeDistanceM + Number(speedInput.value) * deltaSeconds,
  );
  routeComplete = routeDistanceM >= routeEndM;
  placeCameraOnRoute();
}

function updateManual(deltaSeconds) {
  presenceDeltaSeconds = deltaSeconds;
  if (!bridge) {
    // Vestigial freelook: pre-authority camera control only.
    const lookRate = 1.12;
    if (keys.has("ArrowLeft")) yaw += lookRate * deltaSeconds;
    if (keys.has("ArrowRight")) yaw -= lookRate * deltaSeconds;
    if (keys.has("ArrowUp")) pitch += lookRate * deltaSeconds;
    if (keys.has("ArrowDown")) pitch -= lookRate * deltaSeconds;
    pitch = THREE.MathUtils.clamp(pitch, -1.18, 0.72);
    camera.rotation.set(pitch, yaw, 0);

    forward.set(Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, Math.sin(yaw));
    movement.set(0, 0, 0);
    if (keys.has("KeyW")) movement.add(forward);
    if (keys.has("KeyS")) movement.sub(forward);
    if (keys.has("KeyD")) movement.add(right);
    if (keys.has("KeyA")) movement.sub(right);
    // F is reserved for gunner engagement consent (AH-1G crew contract).
    if (keys.has("KeyR")) movement.y += 1;
    if (keys.has("KeyC")) movement.y -= 1;
    if (movement.lengthSq() > 0) {
      const boost = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2.8 : 1;
      movement.normalize().multiplyScalar(Number(speedInput.value) * boost * deltaSeconds);
      camera.position.add(movement);
    }
  }
  if (bridge) {
    const gamepad = Array.from(navigator.getGamepads?.() ?? []).find(Boolean);
    // The hot-pose attitude feeds the idle-stick leveling assist: rate-command dynamics
    // latch whatever attitude a keyboard tap leaves behind, so the released spring must
    // centre onto a level-the-ship command, not bare neutral.
    const pose = readVehiclePose();
    pilotControls = advanceCobraPilotControls(pilotControls, {
      keyboardIntent: cobraKeyboardControlIntent(keys, cobraControlProfile),
      analogAxes: cobraGamepadControlAxes(gamepad),
      attitude: pose
        ? { pitchRad: pose.pitch_rad, rollRad: pose.roll_rad }
        : null,
      deltaSeconds,
      focused: windowFocused,
    });
    if (!missionTerminal) {
      bridge.SetControls(
        pilotControls.collective,
        pilotControls.forwardCyclic,
        pilotControls.rightCyclic,
        pilotControls.yaw,
      );
      bridge.SetGunnerTarget(targetSelect.value || null);
      bridge.SetEngagementConsent(keys.has(cobraControlProfile.fire.code));
      // Advance runs every rendered frame; the JSON snapshot is sampled at HUD rate.
      const simStartedAtMs = performance.now();
      bridge.Advance(deltaSeconds);
      recordPhase("sim", simStartedAtMs);
      sampleAuthorityState(lastTimeMs);
    }
    syncAuthorityCamera();
  }
  const bounds = plan.boundsLocalM;
  camera.position.x = THREE.MathUtils.clamp(
    camera.position.x,
    bounds.minimumEastM,
    bounds.maximumEastM,
  );
  camera.position.z = THREE.MathUtils.clamp(
    camera.position.z,
    -bounds.maximumNorthM,
    -bounds.minimumNorthM,
  );
  // Authority eye sits inside the airframe — do not yank it to a 4 m AGL freelook floor.
  if (!bridge) {
    camera.position.y = Math.max(camera.position.y, groundAt(camera.position.x, -camera.position.z) + 4);
  }
}

function syncAuthorityCamera() {
  const vehicle = readVehiclePose();
  if (!vehicle) return;
  const presence = ensureAh1gPresence();
  updateAh1gPresence(presence, vehicle, presenceDeltaSeconds);
  eyeWorldFromVehicle(THREE, vehicle, camera.position);
  if (camera.near !== 0.12) {
    camera.near = 0.12;
    camera.updateProjectionMatrix();
  }

  const lookDistanceM = 140;
  const bodyYaw = Number(vehicle.yaw_rad) || 0;
  const bodyPitch = Number(vehicle.pitch_rad) || 0;
  // Fixed rear-seat look bias (slightly up through the glass) + gunner-target crew bias.
  const lookYaw = bodyYaw;
  const lookPitch = bodyPitch + 0.08;
  lookTarget.set(
    camera.position.x + Math.sin(lookYaw) * lookDistanceM,
    camera.position.y + Math.sin(lookPitch) * lookDistanceM,
    camera.position.z - Math.cos(lookYaw) * lookDistanceM,
  );

  const selectedId = targetSelect?.value || authorityState?.gunner?.selected_target_id;
  const units = authorityState?.ground_war?.units ?? [];
  const selected = selectedId ? units.find((unit) => unit.id === selectedId && unit.alive) : null;
  if (selected) {
    // Target cueing leans the view toward the gunner's mark, but the induced rotation is
    // clamped to ±0.05 rad: the AH-1G's only clear glass is dead ahead, and the old unclamped
    // lerp swung the sole windshield gap off-axis whenever a near hostile was selected.
    const bias = 0.22;
    const biasedX = THREE.MathUtils.lerp(lookTarget.x, selected.x_m, bias);
    const biasedY = THREE.MathUtils.lerp(lookTarget.y, selected.y_m + 1.2, bias);
    const biasedZ = THREE.MathUtils.lerp(lookTarget.z, -selected.z_m, bias);
    const base = lookAnglesFromOffset(
      lookTarget.x - camera.position.x,
      lookTarget.y - camera.position.y,
      lookTarget.z - camera.position.z,
    );
    const desired = lookAnglesFromOffset(
      biasedX - camera.position.x,
      biasedY - camera.position.y,
      biasedZ - camera.position.z,
    );
    const clamped = clampInducedLookRotation(base, desired, COBRA_CAMERA_TARGET_BIAS_LIMIT_RAD);
    const offset = lookOffsetFromAngles(clamped.yawRad, clamped.pitchRad, lookDistanceM);
    lookTarget.set(
      camera.position.x + offset.x,
      camera.position.y + offset.y,
      camera.position.z + offset.z,
    );
  }

  camera.lookAt(lookTarget);
  // Negated: three.js rolls the camera counter-clockwise for a positive rotation.z (right-hand
  // rule about +Z, which points back out of the screen), so feeding a right bank straight in
  // tilted the horizon the wrong way and a left cyclic input read as a roll to the right.
  camera.rotation.z = -(Number(vehicle.roll_rad) || 0);
}

function recordFrameDuration(durationMs) {
  lastRawFrameMs = durationMs;
  frameSamples[frameSampleCursor] = durationMs;
  frameSampleCursor = (frameSampleCursor + 1) % FRAME_SAMPLE_COUNT;
  frameSampleSize = Math.min(FRAME_SAMPLE_COUNT, frameSampleSize + 1);
  frameCounter += 1;
  if (frameCounter % 15 !== 0 || frameSampleSize < 15) return;
  const ordered = Array.from(frameSamples.subarray(0, frameSampleSize)).sort((a, b) => a - b);
  frameP95Ms = ordered[Math.floor((ordered.length - 1) * 0.95)];
  frameP99Ms = ordered[Math.floor((ordered.length - 1) * 0.99)];
}

function ambientBudgetLevel() {
  if (frameP95Ms > 28) return 2;
  if (frameP95Ms > 20) return 1;
  return 0;
}

function setText(node, value) {
  if (node) node.textContent = value;
}

function showMissionDebrief(war, status) {
  if (!debrief || missionTerminal) return;
  missionTerminal = true;
  const victory = status === "victory";
  const defeat = status === "defeat";
  // Every terminal state gets an explicit outcome + cause: the sim halts here, and a frozen
  // HUD with no card reads as a crash of the game rather than of the helicopter.
  let title;
  let reason;
  if (victory) {
    title = "BRIDGE HELD";
    reason = "You held friendly control long enough to keep the basin.";
  } else if (defeat) {
    title = "BASIN LOST";
    reason = war?.outcome_reason === "lost-basin"
      ? "Hostile control locked the basin before you could tip it back."
      : "The ground war is lost.";
  } else if (status === "obstacle-collision") {
    title = "OBSTACLE STRIKE";
    const obstacle = authorityState?.collision_obstacle_id;
    reason = obstacle
      ? `Flew into ${String(obstacle).split(".").slice(-2).join(" ")}.`
      : "Flew into a canyon obstacle.";
  } else if (status === "vehicle-authority-lost") {
    title = "AIRFRAME LOST";
    reason = "Terrain strike — the impact took the rotor and the airframe with it.";
  } else if (status === "terrain-unavailable") {
    title = "OFF THE MAP";
    reason = "You left surveyed terrain; the sortie cannot continue.";
  } else {
    title = "SORTIE ENDED";
    reason = `Sortie ended: ${status.replaceAll("-", " ")}.`;
  }
  setText(debriefTitle, title);
  setText(
    debriefBody,
    `${reason} Hostiles down ${war?.debrief?.hostile_kills ?? 0} · rearms ${war?.debrief?.fob_rearms ?? 0} · ${(war?.debrief?.elapsed_s ?? 0).toFixed(0)}s airborne. R restarts.`,
  );
  debrief.hidden = false;
  setStatus(
    victory ? "MISSION COMPLETE · BRIDGE HELD" : `MISSION ${status.replaceAll("-", " ").toUpperCase()} · R RESTARTS`,
    victory ? "ready" : "error",
  );
}

function updateObjectiveHud(war) {
  if (!war) return;
  const controlPct = ((war.control + 1) * 50);
  if (balanceFill) balanceFill.style.left = `${controlPct.toFixed(0)}%`;
  const holdPct = Math.round((war.victory_hold_progress ?? 0) * 100);
  if (holdFill) {
    holdFill.style.width = `${holdPct}%`;
    holdFill.style.left = "0";
  }
  setText(holdLabel, war.control >= (war.victory_control_threshold ?? 0.55)
    ? `HOLD ${holdPct}%`
    : war.control <= (war.defeat_control_threshold ?? -0.75)
      ? `LOSING ${Math.round((war.defeat_hold_progress ?? 0) * 100)}%`
      : "HOLD —");
  // Ammo/FOB/kills/target/gunner/rotor truth moved from the DOM text strip into the
  // canvas HUD (hud.js + drawCobraRotorcraftHud); the card keeps objective copy only.
  // Owner sortie web-cobra-1786090836886-dc8wvig0: tip-friendly copy stayed up while the
  // pilot idled on Camp Ember and control bled through −0.75 — losing must outrank tip.
  const copy = cobraObjectiveCopy(war, {
    selectedTargetId: authorityState?.gunner?.selected_target_id ?? null,
    playerHasInteracted,
    actOverlay: emberActObjectiveOverlay(authorityState?.mission_act),
  });
  if (copy) {
    setText(objectiveLine, copy.line);
    setText(objectiveDetail, copy.detail);
  }
}

function updateMetrics(aglM) {
  if (frameCounter % 12 !== 0) return;
  const diagnostics = presentation.diagnostics();
  const fps = frameP95Ms > 0 ? Math.round(1_000 / frameP95Ms) : 0;
  setText(frameMetric, frameP95Ms > 0 ? `${fps} fps · p95 ${frameP95Ms.toFixed(1)} ms` : "sampling…");
  setText(drawMetric, `${renderer.info.render.calls} live · ${diagnostics.drawCalls}/${diagnostics.budget.maxDrawCalls} world`);
  setText(instanceMetric, `${diagnostics.instances}/${diagnostics.budget.maxInstances}`);
  setText(hazardMetric, authorityState
    ? `${authorityState.masking.state} · ${authorityState.masking.observers_with_line_of_sight} LOS`
    : `${plan.counts.hazards} authority · ${diagnostics.hazardsVisible ? "visible" : "missing"}`);
  const clearanceM = authorityState?.route_guidance?.current_clearance_m == null
    ? Math.max(0, aglM)
    : authorityState.route_guidance.current_clearance_m;
  const aglFt = formatAviationAgl(clearanceM);
  setText(aglMetric, aglFt === null ? "—" : `${aglFt} ft`);
  setText(powerMetric, authorityState
    ? `${(authorityState.vehicle.hover_power_margin * 100).toFixed(0)}% · ${authorityState.vehicle.power_assessment}`
    : "—");
  setText(gunnerMetric, authorityState
    ? `${authorityState.gunner.state} · ${authorityState.gunner.reason}`
    : "—");
  const war = authorityState?.ground_war;
  if (war) {
    setText(controlMetric, `${war.control >= 0 ? "+" : ""}${war.control.toFixed(2)} · trend ${war.trend.toFixed(3)}`);
    setText(ammoMetric, war.ammo_dry
      ? "DRY · return to FOB"
      : `${war.ammo_remaining}/${war.ammo_capacity}${war.ammo_bingo ? " · BINGO" : ""}`);
    setText(fobMetric, war.over_fob
      ? "ON PAD · rearm"
      : `${formatAviationRange(war.fob_range_m, { style: "nav" })} · ${(war.fob_bearing_rad * 180 / Math.PI + 360) % 360 | 0}°`);
    setText(killsMetric, `${war.debrief.hostile_kills} hos · ${war.debrief.friendly_kills} fri · ${war.debrief.fob_rearms} rearm`);
    updateObjectiveHud(war);
  } else {
    setText(controlMetric, "—");
    setText(ammoMetric, "—");
    setText(fobMetric, "—");
    setText(killsMetric, "—");
  }
  if (authorityState && authorityState.status !== "active") {
    showMissionDebrief(war, authorityState.status);
  }
  updateRouteProgress();
}

function animate(timeMs) {
  animationFrame = requestAnimationFrame(animate);
  const rawDeltaMs = Math.max(0, timeMs - lastTimeMs);
  // Real elapsed time, capped only by the bridge's 0.1 s spiral brake (see the constant above):
  // at 20 fps the sim still runs 1.00x real time.
  const deltaSeconds = Math.min(rawDeltaMs / 1_000, SIM_MAX_FRAME_ADVANCE_SECONDS);
  lastTimeMs = timeMs;
  if (!plan || !presentation) return;

  const frameStartedAtMs = performance.now();
  if (tourInput.checked) updateTour(deltaSeconds);
  else updateManual(deltaSeconds);
  applyParkedCamera();
  const aglM = tourInput.checked && !parkedCamera ? tourCommandedAglM : cameraAglM();
  const presentationStartedAtMs = performance.now();
  presentation.update({
    cameraPosition: camera.position,
    cameraAglM: aglM,
    ambientBudgetLevel: ambientBudgetLevel(),
  });
  if (emberGuidancePath && authorityState) {
    emberGuidancePath.update(emberPathGuidanceState(authorityState));
  }
  recordPhase("presentation", presentationStartedAtMs);
  if (tourInput.checked && bridge && !missionTerminal) {
    // Keep the ground war alive during guided preview even when the camera is on rails.
    pilotControls = releaseCobraPilotControls(pilotControls);
    bridge.SetControls(pilotControls.collective, 0, 0, 0);
    bridge.SetGunnerTarget(null);
    bridge.SetEngagementConsent(false);
    bridge.Advance(deltaSeconds);
    sampleAuthorityState(timeMs);
    const pose = readVehiclePose();
    if (pose) updateAh1gPresence(ensureAh1gPresence(), pose, deltaSeconds);
  }
  // The camera mode is the ONLY input that decides whether the airframe exists: first
  // person renders zero cockpit geometry (Build 264 owner ruling), the tour camera looks
  // AT the ship so the silhouette returns. Set unconditionally — the earlier per-branch
  // version left the shell hidden whenever a terminal mission froze the tour branch.
  if (ah1gPresence) ah1gPresence.setFirstPerson(!tourInput.checked);
  const renderStartedAtMs = performance.now();
  renderer.render(scene, camera);
  recordPhase("render", renderStartedAtMs);
  const hudStartedAtMs = performance.now();
  drawHud(timeMs, deltaSeconds);
  recordPhase("hud", hudStartedAtMs);
  recordFrameDuration(rawDeltaMs);
  updateMetrics(aglM);
  onboarding?.advanceNudges(onboardingNudgeState(), deltaSeconds);
  recordPhase("total", frameStartedAtMs);
  framePhaseSamples += 1;
}

/**
 * World + HUD, zero cockpit: the production hud.js pass over the rendered frame,
 * then the rotorcraft extras in the same combiner language. Tour/preview is an
 * exterior camera, so the combiner clears instead — as does a terminal sortie, whose
 * card owns the frame and whose rotor truth stopped being true at the strike.
 */
function drawHud(timeMs, deltaSeconds) {
  const pose = readVehiclePose();
  const firstPerson = Boolean(bridge) && !tourInput.checked && !missionTerminal
    && pose && authorityState;
  if (!firstPerson) {
    hudPresentationCtx.save();
    hudPresentationCtx.setTransform(1, 0, 0, 1, 0, 0);
    hudPresentationCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudPresentationCtx.restore();
    return;
  }
  cobraHudState(authorityState, pose, hudStateScratch);
  hud.draw(hudFrameKit.update({
    camera,
    pose,
    state: hudStateScratch,
    dt: deltaSeconds,
    nowSeconds: timeMs / 1000,
  }));
  drawCobraRotorcraftHud(hudPresentationCtx, cobraRotorcraftHudModel(authorityState), {
    width: hudViewport.width,
    height: hudViewport.height,
    pixelRatio: hudViewport.pixelRatio,
    safeInsets: HUD_SAFE_INSETS,
    projectWorldPoint: projectSimPointToScreen,
  });
}

/**
 * Sim-frame world point -> CSS pixels on the combiner, through the REAL render camera
 * (so the designation bracket and hud.js symbology cannot disagree). Sim Z is north and
 * the render frame flips it, exactly as the ground-war presentation places its units.
 */
function projectSimPointToScreen(xM, yM, zM) {
  projectionScratch.set(Number(xM) || 0, Number(yM) || 0, -(Number(zM) || 0));
  projectionScratch.project(camera);
  const inFrame = projectionScratch.z < 1
    && Math.abs(projectionScratch.x) <= 1 && Math.abs(projectionScratch.y) <= 1;
  return {
    x: (projectionScratch.x * 0.5 + 0.5) * hudViewport.width,
    y: (0.5 - projectionScratch.y * 0.5) * hudViewport.height,
    inFrame,
  };
}

// QA seam, alongside __gunsOnlyCobraAuthority: headless visual review parks the PRODUCTION camera
// at a named world pose so the same shot is comparable across builds. It overrides pose only —
// after the tour/manual update and after presentation.update(), so streaming, ambient shedding,
// budgets, shaders and the sim all still run their production path (one-engine doctrine). Visual
// work on this scene has to be judged from rendered frames, and a reviewer who cannot return to
// the same viewpoint is comparing two different pictures.
let parkedCamera = null;
function applyParkedCamera() {
  if (!parkedCamera) return;
  const groundM = groundAt(parkedCamera.eastM, parkedCamera.northM);
  camera.position.set(parkedCamera.eastM, groundM + parkedCamera.aglM, -parkedCamera.northM);
  camera.rotation.set(parkedCamera.pitchRad, parkedCamera.yawRad, 0);
  if (camera.near !== 0.5) {
    camera.near = 0.5;
    camera.updateProjectionMatrix();
  }
}
window.__gunsOnlyCobraLabCamera = Object.freeze({
  park(eastM, northM, aglM, yawRad, pitchRad = 0) {
    parkedCamera = {
      eastM: Number(eastM),
      northM: Number(northM),
      aglM: Number(aglM),
      yawRad: Number(yawRad),
      pitchRad: Number(pitchRad),
    };
    return parkedCamera;
  },
  release() {
    parkedCamera = null;
  },
});

function isManualControl(code) {
  return code === "KeyW" || code === "KeyS" || code === "KeyA" || code === "KeyD"
    || code === "KeyR" || code === "KeyC" || code === "KeyF" || code.startsWith("Arrow");
}

// Escape leaves the sortie for the menu (cobra_mission_exit.js documents why this page exits
// rather than pausing). Two reasons this is its own listener, in CAPTURE phase on window:
//  - the onboarding overlay dismisses on any key from a capture-phase listener on document, and
//    document-capture runs before window-bubble. A bubble handler would always find the card
//    already closed and quit the mission on the player's first-ever keypress;
//  - the mission keydown handler below returns early for anything outside its manual-control
//    allowlist, which is precisely why Build 265's Escape did nothing at all.
window.addEventListener("keydown", (event) => {
  if (event.code !== "Escape") return;
  event.preventDefault();
  const action = resolveEscapeAction({
    onboardingOpen: onboarding?.isOpen() === true,
    missionTerminal,
  });
  if (action === "dismiss-onboarding") {
    event.stopPropagation();
    onboarding.dismiss();
    return;
  }
  leaveMissionForMenu();
}, true);

window.addEventListener("keydown", (event) => {
  // Terminal states freeze the sim; R is the keyboard path back into the fight (the debrief
  // card announces it). Guarded by missionTerminal so mid-sortie R keeps its freelook meaning.
  if (event.code === "KeyR" && missionTerminal) {
    event.preventDefault();
    restartRoute();
    return;
  }
  if (event.code === "Tab") {
    event.preventDefault();
    playerHasInteracted = true;
    if (tourInput) tourInput.checked = false;
    cycleHostileTarget();
    return;
  }
  if (!isManualControl(event.code) && event.code !== "ShiftLeft" && event.code !== "ShiftRight") return;
  event.preventDefault();
  playerHasInteracted = true;
  keys.add(event.code);
  if (isManualControl(event.code) && tourInput) tourInput.checked = false;
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  keys.clear();
  windowFocused = false;
  pilotControls = releaseCobraPilotControls(pilotControls);
});
window.addEventListener("focus", () => {
  windowFocused = true;
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    keys.clear();
    windowFocused = false;
    pilotControls = releaseCobraPilotControls(pilotControls);
  } else {
    windowFocused = document.hasFocus();
  }
});
window.addEventListener("resize", resize, { passive: true });
routeSelect?.addEventListener("change", () => {
  if (PLAY_MODE) {
    lockPlayRoute();
    return;
  }
  restartRoute();
});
qualitySelect?.addEventListener("change", rebuildPresentation);
resetButton?.addEventListener("click", restartRoute);
debriefRestart?.addEventListener("click", restartRoute);
targetSelect?.addEventListener("change", () => {
  playerHasInteracted = true;
  bridge?.SetGunnerTarget(targetSelect.value || null);
  // Refresh the in-world highlight immediately rather than waiting for the next 30 Hz sample.
  groundWarPresentation?.sync(authorityState?.ground_war ?? null, targetSelect.value || null);
});
speedInput?.addEventListener("input", () => {
  if (speedValue) speedValue.textContent = `${speedInput.value} m/s`;
});
heightInput?.addEventListener("input", () => {
  if (heightValue) heightValue.textContent = `${heightInput.value} m AGL`;
  if (!tourInput?.checked) placeCameraOnRoute();
});
tourInput?.addEventListener("change", () => {
  if (tourInput.checked && routeComplete) restartRoute();
  else if (tourInput.checked) placeCameraOnRoute();
  else {
    yaw = camera.rotation.y;
    pitch = camera.rotation.x;
  }
});
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  setStatus("WebGL context lost — reload the mission", "error");
});

/**
 * Stop the sortie and give everything back: the frame loop, the telemetry tail, the scene's GPU
 * resources, the held keys and the onboarding chrome (which lives on document.body and would
 * otherwise outlive the page it belongs to). Idempotent — pagehide and an Escape exit can both
 * reach it, and the second call must be a no-op rather than a double dispose.
 */
let missionTornDown = false;
function teardownMission(reason) {
  if (missionTornDown) return;
  missionTornDown = true;
  telemetryChannel.flush({ [reason]: true });
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  keys.clear();
  pilotControls = releaseCobraPilotControls(pilotControls);
  onboarding?.dispose();
  onboarding = null;
  setPlayCursorHidden(false);
  presentation?.dispose();
  groundWarPresentation?.dispose();
  emberGuidancePath?.dispose();
  emberGuidancePath = null;
  if (ah1gPresence) {
    scene.remove(ah1gPresence.group);
    ah1gPresence.dispose();
    ah1gPresence = null;
  }
  renderer.dispose();
}

/** Escape's exit: tear the mission down first, then hand the browser back to the sortie list. */
function leaveMissionForMenu() {
  teardownMission("exit");
  window.location.href = MAIN_MENU_HREF;
}

window.addEventListener("pagehide", () => teardownMission("pagehide"), { once: true });

async function boot() {
  resize();
  try {
    await (globalThis.__gunsPrebootReady ?? Promise.resolve());
    const blazor = await new Promise((resolve, reject) => {
      const deadline = performance.now() + 15_000;
      const poll = () => {
        if (globalThis.Blazor) return resolve(globalThis.Blazor);
        if (performance.now() >= deadline) return reject(new Error("Flight runtime unavailable."));
        window.setTimeout(poll, 25);
      };
      poll();
    });
    await blazor.start({
      // Subroute pages must never fetch framework assets under /cobra-lab/_framework/.
      loadBootResource(_type, name) {
        return `/_framework/${name}`;
      },
    });
    const runtimeAccessor = await new Promise((resolve, reject) => {
      const deadline = performance.now() + 15_000;
      const poll = () => {
        if (globalThis.getDotnetRuntime) return resolve(globalThis.getDotnetRuntime);
        if (performance.now() >= deadline) return reject(new Error("Cobra authority unavailable."));
        window.setTimeout(poll, 25);
      };
      poll();
    });
    const { getAssemblyExports } = await runtimeAccessor(0);
    const assemblyExports = await getAssemblyExports("GunsOnly.Web");
    bridge = assemblyExports.GunsOnly.Web.CobraWebBridge;
    world = await loadCobraCanyonWorld();
    lockPlayRoute();
    if (tourInput && PLAY_MODE) tourInput.checked = false;
    rebuildPresentation();
    // Fetched once: StartRoute/Advance refill the same WASM buffer, read per frame via copyTo.
    vehiclePoseView = bridge.GetHotPose();
    authorityState = JSON.parse(bridge.GetState());
    pilotControls = createCobraPilotControlState(authorityState.vehicle.collective);
    refreshGroundTargets();
    groundWarPresentation?.sync(authorityState.ground_war);
    updateObjectiveHud(authorityState.ground_war);
    setStatus(PLAY_MODE
      ? "HOLD THE BRIDGE · AH-1G ONLINE"
      : "AH-1G AUTHORITY ONLINE · LAB", "ready");
    if (PLAY_MODE) {
      setPlayCursorHidden(true);
      onboarding = createControlsOnboarding({
        modeId: COBRA_ONBOARDING_CONTENT.modeId,
        content: COBRA_ONBOARDING_CONTENT,
        nudges: [
          { id: "lift", text: "HOLD W — COLLECTIVE UP", when: (s) => s.groundedIdle === true, afterSeconds: 3 },
          { id: "engage", text: "TAB TO TARGET · HOLD F TO ENGAGE", when: (s) => s.hostileIdle === true, afterSeconds: 1.5 },
        ],
      });
      onboarding.maybeShowFirstRun();
    }
    lastTimeMs = performance.now();
    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    setStatus(`Hold the Bridge failed: ${error.message}`, "error");
  }
}

boot();
