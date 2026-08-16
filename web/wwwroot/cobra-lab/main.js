import * as THREE from "../vendor/three.module.js?v=342";
import {
  loadCobraCanyonWorld,
  planCobraCanyonWorld,
  sampleCobraCanyonTerrain,
} from "../render/cobra/cobra_canyon_plan.js?v=342";
import { createCobraCanyonPresentation } from "../render/cobra/cobra_canyon_presentation.js?v=342";
import { resolveCobraVietnamFoliageTextures } from "../render/cobra/cobra_canyon_foliage.js?v=342";
import {
  COBRA_CANYON_TOUR_BASE_AGL_M,
  createCobraCanyonRouteSampler,
  sampleCobraCanyonTour,
} from "../render/cobra/cobra_canyon_tour.js?v=342";
import { createCobraGroundWarPresentation } from "../render/cobra/cobra_ground_war.js?v=342";
import {
  cobraGoldenPathState,
  createCobraGoldenPath,
} from "../render/cobra/cobra_golden_path.js?v=342";
import { createHud } from "../hud.js?v=342";
import {
  cobraHudState,
  createCobraHudFrame,
} from "../render/cobra/cobra_hud_adapter.js?v=342";
import {
  cobraRotorcraftHudModel,
  drawCobraRotorcraftHud,
  formatAviationAgl,
  formatAviationRange,
} from "../render/cobra/cobra_rotorcraft_hud.js?v=342";
import { cobraObjectiveCopy } from "../render/cobra/cobra_objective_copy.js?v=342";
import {
  cobraTacticalMapBounds,
  cobraTacticalMapModel,
} from "../render/cobra/cobra_tactical_map.js?v=342";
import {
  COBRA_MAP_CAPTION_PX,
  drawCobraTacticalMap,
} from "../render/cobra/cobra_tactical_map_draw.js?v=342";
import { bakeCobraTacticalRelief } from "../render/cobra/cobra_tactical_map_relief.js?v=342";
import {
  emberActObjectiveOverlay,
  emberActRemainingM,
  emberPathGuidanceState,
} from "../render/cobra/cobra_ember_path.js?v=342";
import { createGuidancePath } from "../render/scene/guidance_path.js?v=342";
import {
  updateFlightAudio,
} from "../render/audio/flight_audio.js?v=342";
import {
  cobraKeyboardControlIntent,
  resolveCobraControlProfile,
} from "../render/cobra/cobra_control_profile.js?v=342";
import {
  advanceCobraPilotControls,
  cobraCyclicCommand,
  cobraGamepadControlAxes,
  createCobraGroundedPilotControlState,
  createCobraPilotControlState,
  releaseCobraPilotControls,
} from "../render/cobra/cobra_pilot_input.js?v=342";
import {
  createCobraSortieReadyInterlock,
  hasDeliberateCobraCockpitInput,
} from "../render/cobra/cobra_sortie_ready.js?v=342";
import {
  COBRA_TURNAROUND_ACTION_CODE,
  cobraTurnaroundActionHeld,
  cobraTurnaroundIsActive,
  cobraTurnaroundLocksFlightControls,
} from "../render/cobra/cobra_turnaround.js?v=342";
import {
  createAh1gPresence,
  eyeWorldFromVehicle,
  updateAh1gPresence,
} from "../render/cobra/ah1g_presence.js?v=342";
import {
  acquireAuthorityVisualLockTarget,
  advancePadlockLosGrace,
  lookOffsetFromAngles,
  nextHostileTargetId,
  resolveAuthorityLookAtPoint,
} from "../render/cobra/cobra_camera_bias.js?v=342";
import {
  cobraMissionStatusCopy,
  cobraTerminalCauseCopy,
} from "../render/cobra/cobra_terminal_causes.js?v=342";
import { loadCobraVietnamPalmGeometry } from "../render/cobra/cobra_canyon_foliage_models.js?v=342";
import {
  createParkedCobra,
  placeParkedCobra,
} from "../render/cobra/cobra_parked_airframe.js?v=342";
import {
  cobraFormationRadio,
  cobraFormationLeadPose,
  createCobraFormationLead,
} from "../render/cobra/cobra_formation_lead.js?v=342";
import {
  applyTexelStabilizedDirectionalShadow,
} from "../render/visual/shadow_stabilizer.js?v=342";
import { createCobraTelemetryChannel } from "../render/cobra/cobra_telemetry.js?v=342";
import {
  MAIN_MENU_HREF,
  resolveEscapeAction,
} from "../render/cobra/cobra_mission_exit.js?v=342";
import { createControlsOnboarding } from "../render/onboarding/first_run_controls.js?v=342";
import { COBRA_ONBOARDING_CONTENT } from "../render/onboarding/controls_content.js?v=342";

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

// CAST-SHADOW CASCADE, sized from this scene's geometry rather than copied from the F-22's.
//
// The sun sits at elevation asin(0.28) = 16.3 degrees (the shared house sun), so cot(16.3) = 3.42:
// every metre of height lays 3.42 m of shadow across level ground. That single number sets the
// extent, because a cascade that holds the RECEIVER but not the CASTER standing up-sun of it
// produces no shadow at all — the failure mode that makes a too-small extent look like a bug
// rather than a compromise.
//
//   caster                          height    shadow length
//   gorge wall / ridge              ~300 m    ~1,025 m
//   canopy stand (asset kit)          18 m       62 m
//   AH-1G at its 30 m cruise AGL      30 m      103 m
//
// The receiver ring worth paying for is the near ring the asset kit already draws
// (`nearRingMaximumAglM` 180 / 260 / 360 m in COBRA_CANYON_RENDER_BUDGETS). Add the up-sun ridge
// that shadows it and the desktop volume wants ~1.1 km of half-extent; balanced trims to 800 m
// and accepts that the far half of a ridge shadow falls outside the map, where the 8 km humid
// haze (fog density 2.3e-4) has already taken most of its contrast anyway.
//
// The design doc proposed 600 m. That holds the near ring but CLIPS the ridge that casts into it,
// which is the one shadow this canyon actually needs; the extra 500 m is bought at 2048 rather
// than by dropping texel density, so the map stays near a metre per texel:
//
//   desktop  2048 over 2,200 m  = 1.07 m/texel   (a 60 m canopy shadow is ~56 texels)
//   balanced 1024 over 1,600 m  = 1.56 m/texel
//   mobile   off — the world file already budgets `maxShadowCasters: 0` there, so the mobile
//            floor renders honestly without shadows instead of dropping frames for them.
const COBRA_SHADOW_TIERS = Object.freeze({
  mobile: Object.freeze({ mapSize: 0, halfExtentM: 0 }),
  balanced: Object.freeze({ mapSize: 1_024, halfExtentM: 800 }),
  desktop: Object.freeze({ mapSize: 2_048, halfExtentM: 1_100 }),
});
// Depth bias. `normalBias` is in world metres and must clear the depth slope of one shadow texel
// on the shallowest lit slope; 1.6 m is ~1.5 desktop texels, which is what stops the 105 m-spaced
// basin quads self-striping near the terminator without visibly detaching contact shadows (a
// canopy stand is 18 m tall, so 1.6 m of peter-panning is under a tenth of its own shadow).
const COBRA_SHADOW_NORMAL_BIAS_M = 1.6;
const COBRA_SHADOW_DEPTH_BIAS = -0.00045;
// Where the volume is centred: ahead of the camera along its own view direction, at ground level.
// Centring on the camera itself spends half the map behind the pilot.
const COBRA_SHADOW_LOOKAHEAD_FRACTION = 0.42;
const ROUTE_ENTRY_OFFSETS_M = Object.freeze({
  "route.cobra-canyon.river-gorge.v1": 5_800,
  "route.cobra-canyon.ridge-shadow.v1": 7_300,
  "route.cobra-canyon.road-plantation.v1": 6_250,
});
const FRAME_SAMPLE_COUNT = 180;
const ROUTE_END_LOOKAHEAD_M = 40;
const ROUTE_CAMERA_LOOKAHEAD_M = 180;
// Real-time contract: after deliberate input arms the sortie, the sim advances by real elapsed
// wall time every rendered frame. The only cap is the bridge's own MaximumFrameDeltaSeconds
// (0.1 s = 12 fixed 120 Hz ticks) — the same
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
// State rows are sampled at 10 Hz; the telemetry channel drains several byte-bounded requests per
// cadence because production rows include the complete ground-war evidence and are ~3 KiB each.
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
// #balance-fill is now the points-held bar and #hold-fill the friendly ticket pool; the ids
// are kept because main.js and the lab wiring test both query them by name.
const balanceFill = document.querySelector("#balance-fill");
const balanceLabel = document.querySelector("#balance-label");
const holdFill = document.querySelector("#hold-fill");
const hostileTicketFill = document.querySelector("#hostile-ticket-fill");
const holdLabel = document.querySelector("#hold-label");
const objectiveLine = document.querySelector("#objective-line");
const objectiveDetail = document.querySelector("#objective-detail");
// Conquest chart. Two canvases, one draw function: the minimap is always on, the full map is
// the same picture at overlay size on M. Both are north-up.
const minimapCanvas = document.querySelector("#minimap");
const minimapCtx = minimapCanvas?.getContext("2d", { alpha: true }) ?? null;
const tacticalMapCanvas = document.querySelector("#tactical-map");
const tacticalMapCtx = tacticalMapCanvas?.getContext("2d", { alpha: true }) ?? null;
let tacticalMapOpen = false;
// Bounds are a MISSION constant, not a frame value: the sites do not move, and recomputing the
// enclosing square every frame would also let the chart's scale breathe as sites are added.
let tacticalMapBounds = null;
// Baked once per mission. The chart shipped as a dark box with four dots and the owner could
// not tell where to go from it — a map with no LAND on it cannot be matched against the valley,
// ridges and river actually visible out of the windscreen.
let tacticalMapBackdrop = null;
let tacticalMapRiver = null;
const debrief = document.querySelector("#debrief");
const debriefTitle = document.querySelector("#debrief-title");
const debriefBody = document.querySelector("#debrief-body");
const debriefRestart = document.querySelector("#debrief-restart");
const debriefExit = document.querySelector("#debrief-exit");
const pauseMenu = document.querySelector("#pause-menu");
const pauseResume = document.querySelector("#pause-resume");
const pauseRestart = document.querySelector("#pause-restart");
const pauseExit = document.querySelector("#pause-exit");
const PLAY_MODE = document.body?.dataset?.shell !== "lab";
// The lab remains a continuously running visualisation. A real sortie waits at Ready so the
// first-run card cannot spend the pilot's survival window before they touch the cockpit.
const sortieReadiness = createCobraSortieReadyInterlock({ ready: !PLAY_MODE });
let bridge = null;
let missionTerminal = false;
let missionPaused = false;
let authorityState = null;
// Presentation remembers only the last published phase so it can put a newly started spare back
// behind the neutral Ready edge. Phase completion itself remains mission authority.
let lastTurnaroundPhase = null;
// Play opens at the physical full-down stop. The lab intentionally keeps its old neutral lever
// only until bridge authority supplies the route's authored command below.
let pilotControls = PLAY_MODE
  ? createCobraGroundedPilotControlState()
  : createCobraPilotControlState(0.5);
let windowFocused = typeof document === "undefined" ? true : document.hasFocus();
const cobraControlProfile = resolveCobraControlProfile();
let groundWarPresentation = null;
let emberGuidancePath = null;
let goldenPath = null;
let formationLead = null;
let formationLeadPose = null;
let formationRadio = null;
let ah1gPresence = null;
let presenceDeltaSeconds = 0;
let hostileTargetIds = [];
let hostileTargetIndex = -1;
let lastTargetKey = null;
// Tab owns the persistent gunner mark; V owns an authority-LOS visual lock, preferring that mark
// and cycling to the next visible living hostile when the mark is masked.
let padlockActive = false;
let padlockMaskedSinceMs = null;
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
  const servicing = cobraTurnaroundIsActive(authorityState?.turnaround);
  return {
    groundedIdle: Number.isFinite(clearanceM)
      && clearanceM <= 3
      && !servicing
      && !keys.has(cobraControlProfile.collective.pull.code),
    hostileIdle: !servicing && hostileInRange && !authorityState?.gunner?.selected_target_id,
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

// One combiner: the shared flight HUD paints first, then the authority-backed AH-1G flight /
// gunner strip paints into that same canvas. Build 302's literal jet-only layout hid Nr, torque,
// radar altitude, sink rate, ammo and the crew's fire state during the owner's entire Build 327
// sortie; those are flight instruments in a helicopter, not decorative lab chrome.
const hudCanvas = document.querySelector("#hud-canvas");
const hud = createHud(hudCanvas);
hud.setAudioEnabled(true);
const hudPresentationCtx = hudCanvas.getContext("2d", { alpha: true });
const hudFrameKit = createCobraHudFrame(THREE);
const hudStateScratch = {};
const HUD_SAFE_INSETS = Object.freeze({ top: 10, right: 0, bottom: 0, left: 0 });
const hudViewport = { width: 1, height: 1, pixelRatio: 1 };
const projectionScratch = new THREE.Vector3();

const armAudioFromGesture = () => hud.armAudio();
window.addEventListener("pointerdown", armAudioFromGesture, { capture: true, passive: true });
window.addEventListener("keydown", armAudioFromGesture, { capture: true });

// One-sun doctrine for the canyon scene: the sky shader, the scene light rig, the fog and the
// basin's baked hillshade all read COBRA_CANYON_VISUAL_PROFILE, so glow, prop shading, haze and
// terrain relief agree about the light. Import lives here to keep the whole scene-constants
// block contiguous (top-level imports are hoisted regardless of position).
import { COBRA_CANYON_VISUAL_PROFILE } from "../render/cobra/cobra_canyon_visual_profile.js?v=342";

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
scene.add(sun.target);
// PCFSoft to match the production F-22 rig (app.js): one engine, one shadow filter. Whether the
// map is actually drawn is decided per tier by applyShadowQuality() below.
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sun.shadow.bias = COBRA_SHADOW_DEPTH_BIAS;
sun.shadow.normalBias = COBRA_SHADOW_NORMAL_BIAS_M;
// The travel direction of the light, i.e. from sun toward ground. Handed to the stabiliser
// explicitly so the frame never has to be re-derived from a position we are about to overwrite.
const sunTravelDirection = sunDirection.clone().negate();
const shadowFocus = new THREE.Vector3();
const shadowForward = new THREE.Vector3();
let shadowTier = COBRA_SHADOW_TIERS.balanced;

/**
 * Tier gate. A tier with `mapSize: 0` turns the whole pass off at the renderer, so the shadow
 * chunks in the terrain shaders compile to `return 1.0` and the scene renders honestly without
 * shadows rather than dropping frames for them.
 */
function applyShadowQuality() {
  shadowTier = COBRA_SHADOW_TIERS[qualitySelect?.value] ?? COBRA_SHADOW_TIERS.balanced;
  const enabled = shadowTier.mapSize > 0;
  renderer.shadowMap.enabled = enabled;
  sun.castShadow = enabled;
  if (enabled && sun.shadow.mapSize.x !== shadowTier.mapSize) {
    sun.shadow.mapSize.set(shadowTier.mapSize, shadowTier.mapSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  renderer.shadowMap.needsUpdate = true;
}

/** Texel-snapped so the projection does not crawl as the helicopter translates under it. */
function updateShadowFrame() {
  if (!sun.castShadow) return;
  camera.getWorldDirection(shadowForward);
  shadowForward.y = 0;
  if (shadowForward.lengthSq() < 1e-6) shadowForward.set(0, 0, -1);
  shadowForward.normalize();
  shadowFocus.copy(camera.position)
    .addScaledVector(shadowForward, shadowTier.halfExtentM * COBRA_SHADOW_LOOKAHEAD_FRACTION);
  // World z is -north, matching groundAt()'s callers elsewhere in this file.
  shadowFocus.y = plan ? groundAt(shadowFocus.x, -shadowFocus.z) : 0;
  applyTexelStabilizedDirectionalShadow(sun, shadowFocus, {
    direction: sunTravelDirection,
    mapSize: shadowTier.mapSize,
    halfExtent: shadowTier.halfExtentM,
  });
}

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
    skyCurveExponent: { value: sceneProfile.sky.skyCurveExponent },
    shoulderFalloff: { value: sceneProfile.sky.horizonShoulderFalloff },
    shoulderWeight: { value: sceneProfile.sky.horizonShoulderWeight },
    cloudColor: { value: new THREE.Vector3(...sceneProfile.sky.cloudColor) },
    cloudShelf: { value: new THREE.Vector2(...sceneProfile.sky.cloudShelf) },
    proceduralCloudsEnabled: { value: qualitySelect?.value === "mobile" ? 0 : 1 },
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
    uniform float skyCurveExponent;
    uniform float shoulderFalloff;
    uniform float shoulderWeight;
    uniform vec3 cloudColor;
    uniform vec2 cloudShelf;
    uniform float proceduralCloudsEnabled;
    uniform vec3 sunDirection;
    varying vec3 vSkyDirection;

    float cobraSkyHash(vec3 cell) {
      return fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    }
    float cobraSkyNoise(vec3 point) {
      vec3 cell = floor(point);
      vec3 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      return mix(
        mix(
          mix(cobraSkyHash(cell + vec3(0.0, 0.0, 0.0)),
              cobraSkyHash(cell + vec3(1.0, 0.0, 0.0)), local.x),
          mix(cobraSkyHash(cell + vec3(0.0, 1.0, 0.0)),
              cobraSkyHash(cell + vec3(1.0, 1.0, 0.0)), local.x), local.y),
        mix(
          mix(cobraSkyHash(cell + vec3(0.0, 0.0, 1.0)),
              cobraSkyHash(cell + vec3(1.0, 0.0, 1.0)), local.x),
          mix(cobraSkyHash(cell + vec3(0.0, 1.0, 1.0)),
              cobraSkyHash(cell + vec3(1.0, 1.0, 1.0)), local.x), local.y),
        local.z);
    }
    void main() {
      vec3 direction = normalize(vSkyDirection);
      float aboveHorizon = max(direction.y, 0.0);
      float skyCurve = pow(aboveHorizon, skyCurveExponent);
      vec3 colour = mix(horizonColor, zenithColor, skyCurve);
      // Narrow non-luminous horizon shoulder: stays readable in unusual attitudes.
      float horizonShoulder = exp(-abs(direction.y) * shoulderFalloff);
      colour = mix(colour, horizonColor * 1.08, horizonShoulder * shoulderWeight);

      // Broken monsoon cumulus shelf. This is direction-space paint rather than a texture or
      // azimuth lookup: it cannot reveal a UV seam when the player rolls through the horizon,
      // and it costs no additional draw call. Broad and fine waves overlap into recognisable
      // cloud masses, while the vertical window keeps the zenith open and the terrain readable.
      // Keep the expensive hashes inside the coherent shelf band. Most mobile sky fragments now
      // execute no noise at all; the branch boundary is hidden by the same soft vertical window.
      if (proceduralCloudsEnabled > 0.5
          && direction.y > cloudShelf.x && direction.y < cloudShelf.y) {
        float shelfWindow = smoothstep(cloudShelf.x, cloudShelf.x + 0.035, direction.y)
          * (1.0 - smoothstep(cloudShelf.y - 0.10, cloudShelf.y, direction.y));
        vec3 cloudPoint = vec3(direction.x * 5.4, direction.y * 13.0, direction.z * 5.4);
        float broadCloud = cobraSkyNoise(cloudPoint);
        float cloudBreaks = cobraSkyNoise(cloudPoint * 2.15 + vec3(8.2, 2.7, -4.6));
        float sculptedCloud = broadCloud * 0.70 + cloudBreaks * 0.30;
        float cloudMass = smoothstep(0.51, 0.66, sculptedCloud) * shelfWindow;
        float cloudTop = smoothstep(cloudShelf.x, cloudShelf.y, direction.y);
        vec3 paintedCloud = mix(cloudColor * 0.72, cloudColor * 1.12, cloudTop);
        colour = mix(colour, paintedCloud, cloudMass * 0.64);
      }

      // The same shared sun that lights the basin gives the dome a restrained warm aureole.
      float sunFacing = max(dot(direction, normalize(sunDirection)), 0.0);
      float sunHalo = smoothstep(0.86, 1.0, sunFacing);
      float sunDisc = smoothstep(0.996, 0.9994, sunFacing);
      colour += vec3(1.0, 0.72, 0.42) * sunHalo * sunHalo * 0.055;
      colour += vec3(1.0, 0.86, 0.62) * sunDisc * 0.42;
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
/** @type {{ atlas: import("../vendor/three.module.js").Texture, synthetic?: boolean } | null} */
let foliageTextures = null;
let roleGeometries = null;
let activeRoute = null;
let routeSampler = null;
let activeSetPieces = [];
let routeDistanceM = 0;
let routeComplete = false;
let tourCommandedAglM = COBRA_CANYON_TOUR_BASE_AGL_M;
let yaw = 0;
let pitch = 0;
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
  const battleDamage = authorityState.battle_damage;
  const turnaround = authorityState.turnaround;
  const threatBursts = Array.isArray(battleDamage?.recent_bursts)
    ? battleDamage.recent_bursts
    : [];
  const latestThreatBurst = threatBursts.length
    ? threatBursts[threatBursts.length - 1]
    : null;
  const telemetryPose = pose ?? authorityState.vehicle;
  const activeGateIndex = (authorityState.path_gates ?? [])
    .findIndex((gate) => gate?.active === true);
  const activeGate = activeGateIndex >= 0
    ? authorityState.path_gates[activeGateIndex]
    : null;
  const gateEastM = Number(activeGate?.east_m);
  const gateNorthM = Number(activeGate?.north_m);
  const gateUpM = Number(activeGate?.up_m);
  const ownEastM = Number(telemetryPose?.x_m);
  const ownNorthM = Number(telemetryPose?.z_m);
  const ownUpM = Number(telemetryPose?.y_m);
  const ownYawRad = Number(telemetryPose?.yaw_rad);
  const gateBearingRad = Number.isFinite(gateEastM) && Number.isFinite(gateNorthM)
    && Number.isFinite(ownEastM) && Number.isFinite(ownNorthM)
    ? Math.atan2(gateEastM - ownEastM, gateNorthM - ownNorthM)
    : null;
  const gateBearingErrorRad = gateBearingRad === null || !Number.isFinite(ownYawRad)
    ? null
    : Math.atan2(Math.sin(gateBearingRad - ownYawRad), Math.cos(gateBearingRad - ownYawRad));
  const livingAirThreats = (authorityState.ground_war?.units ?? [])
    .filter((unit) => unit?.alive === true && unit?.faction === "hostile"
      && unit?.role === "dshk-site").length;
  const telemetryLeadPose = cobraFormationLeadPose(authorityState, telemetryPose);
  const telemetryFormationRadio = cobraFormationRadio(authorityState, telemetryPose);
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
      cobra_pedal: authorityState.vehicle.pedal ?? authorityState.vehicle.yaw,
      cobra_power_margin: authorityState.vehicle.power_margin,
      cobra_main_rotor_rpm: rotor?.main_rotor_rpm ?? pose?.main_rotor_rpm,
      cobra_transmission_limit_fraction: rotor?.transmission_limit_fraction,
      cobra_engine_operating: rotor?.engine_operating,
      cobra_engine_shaft_power_w: rotor?.engine_shaft_power_w,
      cobra_engine_shaft_power_fraction: rotor?.engine_shaft_power_fraction,
      cobra_turnaround_phase: turnaround?.phase,
      cobra_turnaround_sequence: turnaround?.sequence,
      cobra_turnaround_action: turnaround?.action,
      cobra_turnaround_hold_progress: turnaround?.hold_progress,
      cobra_turnaround_flight_controls_enabled: turnaround?.flight_controls_enabled,
      cobra_turnaround_weapons_enabled: turnaround?.weapons_enabled,
      // Contact-envelope evidence: without these the crash card can name a cause live
      // while the uploaded owner-flight trace records none of it.
      cobra_contact_failure_cause: authorityState.vehicle.contact_failure_cause,
      cobra_gear_damaged: authorityState.vehicle.gear_damaged,
      cobra_touchdown_sink_mps: authorityState.vehicle.touchdown_sink_mps,
      cobra_touchdown_lateral_mps: authorityState.vehicle.touchdown_lateral_mps,
      cobra_touchdown_yaw_rate_rad_s: authorityState.vehicle.touchdown_yaw_rate_rad_s,
      // Prefer the per-frame hot pose: GetState is 30 Hz and a stale tab can pin spawn forever
      // while the flying tab's camera still reads hot pose (owner 16:41 flight diagnosis).
      cobra_pitch_rad: pose?.pitch_rad ?? authorityState.vehicle.pitch_rad,
      cobra_roll_rad: pose?.roll_rad ?? authorityState.vehicle.roll_rad,
      cobra_yaw_rad: pose?.yaw_rad ?? authorityState.vehicle.yaw_rad,
      cobra_yaw_rate_rad_s: authorityState.vehicle.yaw_rate_rad_s,
      cobra_horizontal_air_speed_mps: authorityState.vehicle.horizontal_air_speed_mps,
      cobra_directional_air_speed_mps: authorityState.vehicle.directional_air_speed_mps,
      cobra_air_track_rad: authorityState.vehicle.air_track_rad,
      cobra_sideslip_rad: authorityState.vehicle.sideslip_rad,
      cobra_advance_ratio: rotor?.advance_ratio,
      cobra_torque_yaw_demand_rad_s: rotor?.torque_yaw_demand_rad_s,
      cobra_scas_roll_rad_s: rotor?.scas_roll_rad_s,
      cobra_scas_pitch_rad_s: rotor?.scas_pitch_rad_s,
      cobra_scas_yaw_rad_s: rotor?.scas_yaw_rad_s,
      cobra_weathervane_yaw_rad_s: rotor?.weathervane_yaw_rad_s,
      cobra_yaw_residual_rad_s: rotor?.yaw_residual_rad_s,
      cobra_wind_e_mps: authorityState.vehicle.wind_e_mps,
      cobra_wind_u_mps: authorityState.vehicle.wind_u_mps,
      cobra_wind_n_mps: authorityState.vehicle.wind_n_mps,
      cobra_gust_pitch_moment_nm: rotor?.gust_pitch_moment_nm,
      cobra_gust_yaw_moment_nm: rotor?.gust_yaw_moment_nm,
      cobra_gust_roll_moment_nm: rotor?.gust_roll_moment_nm,
      cobra_mission_act: authorityState.mission_act,
      cobra_path_gate_count: authorityState.path_gates?.length ?? 0,
      cobra_path_active_gate_index: activeGateIndex,
      cobra_path_active_gate_east_m: Number.isFinite(gateEastM) ? gateEastM : null,
      cobra_path_active_gate_north_m: Number.isFinite(gateNorthM) ? gateNorthM : null,
      cobra_path_active_gate_up_m: Number.isFinite(gateUpM) ? gateUpM : null,
      cobra_path_active_gate_range_m: gateBearingRad === null ? null
        : Math.hypot(gateEastM - ownEastM, gateNorthM - ownNorthM),
      cobra_path_bearing_error_rad: gateBearingErrorRad,
      cobra_path_height_error_m: Number.isFinite(gateUpM) && Number.isFinite(ownUpM)
        ? gateUpM - ownUpM : null,
      cobra_formation_lead_visible: telemetryLeadPose !== null,
      cobra_formation_lead_range_m: telemetryLeadPose && Number.isFinite(ownEastM)
        && Number.isFinite(ownNorthM)
        ? Math.hypot(telemetryLeadPose.x_m - ownEastM, telemetryLeadPose.z_m - ownNorthM)
        : null,
      cobra_formation_radio_sequence: telemetryFormationRadio?.sequence ?? 0,
      cobra_air_threat_count: livingAirThreats,
      cobra_combat_live: authorityState.ground_war?.combat_live ?? false,
      cobra_frame_ms: lastRawFrameMs,
      cobra_route_remaining_m: authorityState.route_guidance.remaining_m,
      cobra_act_remaining_m: emberActRemainingM(authorityState, pose),
      cobra_cross_track_m: authorityState.route_guidance.cross_track_m,
      cobra_inside_corridor: authorityState.route_guidance.inside_corridor,
      cobra_masking: authorityState.masking.state,
      // Hostile-fire evidence must survive the owner-flight upload. A live HUD warning without
      // its acquisition, burst and named-subsystem truth is not diagnosable after the sortie.
      cobra_ground_fire_active_observer_id: battleDamage?.active_observer_id ?? null,
      cobra_ground_fire_acquisition_progress: battleDamage?.acquisition_progress ?? 0,
      cobra_ground_fire_tracking_observers: battleDamage?.tracking_observers ?? 0,
      cobra_ground_fire_threat_tracking: battleDamage?.threat_tracking ?? false,
      cobra_ground_fire_receiving_fire: battleDamage?.receiving_fire ?? false,
      cobra_ground_fire_bursts_fired: battleDamage?.bursts_fired ?? 0,
      cobra_ground_fire_pending_bursts: battleDamage?.pending_bursts ?? 0,
      cobra_ground_fire_damaging_hits: battleDamage?.damaging_hits ?? 0,
      cobra_ground_fire_seconds_to_next_impact: battleDamage?.seconds_to_next_impact ?? null,
      cobra_ground_fire_scas_damaged: battleDamage?.scas_damaged ?? false,
      cobra_ground_fire_engine_damaged: battleDamage?.engine_damaged ?? false,
      cobra_ground_fire_last_burst_sequence: latestThreatBurst?.sequence ?? null,
      cobra_ground_fire_last_burst_observer_id: latestThreatBurst?.observer_id ?? null,
      cobra_ground_fire_last_burst_will_hit: latestThreatBurst?.will_hit ?? null,
      cobra_ground_fire_last_burst_subsystem: latestThreatBurst?.subsystem ?? null,
      cobra_ground_fire_last_burst_has_impacted: latestThreatBurst?.has_impacted ?? null,
      cobra_gunner_state: authorityState.gunner.state,
      cobra_gunner_reason: authorityState.gunner.reason,
      cobra_fire_authorized: authorityState.gunner.fire_authorized,
      cobra_control: authorityState.ground_war?.control,
      cobra_friendly_tickets: authorityState.ground_war?.tickets?.friendly,
      cobra_hostile_tickets: authorityState.ground_war?.tickets?.hostile,
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
  syncTurnaroundLifecycle();
  // Swap acknowledgement belongs at the snapshot boundary: every advance path (manual, parked
  // review, and guided lab tour) eventually samples here, and the sync itself never re-samples.
  // That makes a newly observed authority generation reset/ground exactly once without leaving a
  // camera-mode-specific path frozen on the bridge latch.
  syncParkedAirframes();
  // QA seam: headless smoke scripts steer against authoritative truth, not DOM guesses.
  window.__gunsOnlyCobraAuthority = authorityState;
  // Same contract for the one visual claim a screenshot cannot settle: first person must
  // render ZERO airframe geometry, exterior/tour must render the silhouette. A distant
  // ship on a tour rail is a handful of pixels either way, so this is measured, not eyed.
  window.__gunsOnlyCobraAirframeVisible = () => ah1gPresence?.group?.visible === true;
  refreshGroundTargets();
  const padlockLos = advancePadlockLosGrace({
    padlockActive,
    lockedTargetId: targetSelect?.value || null,
    gunner: authorityState.gunner,
    maskedSinceMs: padlockMaskedSinceMs,
    nowMs,
  });
  padlockActive = padlockLos.padlockActive;
  padlockMaskedSinceMs = padlockLos.maskedSinceMs;
  groundWarPresentation?.sync(
    authorityState.ground_war ?? null,
    targetSelect.value || null,
    authorityState.battle_damage ?? null,
  );
  recordTelemetry(nowMs);
  recordPhase("state", stateStartedAtMs);
}

/**
 * A replacement reaches Operational only after authority has observed governed Nr continuously.
 * Put play back at a neutral Ready edge at that exact published transition so W held through the
 * assisted start cannot turn completion into an uncommanded lift. This does not time or complete
 * the startup; it only gates the pilot's next control edge.
 */
function syncTurnaroundLifecycle() {
  const phase = String(authorityState?.turnaround?.phase ?? "operational");
  const turnaroundActive = cobraTurnaroundIsActive(authorityState?.turnaround);
  const previousTurnaroundActive = lastTurnaroundPhase !== null
    && cobraTurnaroundIsActive({ phase: lastTurnaroundPhase });
  if (PLAY_MODE && previousTurnaroundActive && !turnaroundActive) {
    sortieReadiness.reset(false, { requireNeutral: true });
    pilotControls = createCobraGroundedPilotControlState();
    bridge?.SetTurnaroundAction(false);
    bridge?.SetControls(pilotControls.collective, 0, 0, 0);
    setStatus("SPARE READY · CONTROLS NEUTRAL — HOLD W TO LIFT", "ready");
  }
  lastTurnaroundPhase = phase;
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
  sizeMapCanvas(minimapCanvas, minimapCtx);
  sizeMapCanvas(tacticalMapCanvas, tacticalMapCtx);
}

/**
 * Backing-store size for a map canvas, in device pixels, with the context scaled so the draw
 * module can work in CSS pixels. Only reassigns width/height when the CSS box actually changed:
 * writing canvas.width clears the surface AND resets the transform, so doing it per frame would
 * cost a full reallocation every frame and drop the scale on the floor.
 */
function sizeMapCanvas(canvasEl, ctx) {
  if (!canvasEl || !ctx) return null;
  const width = Math.round(canvasEl.clientWidth);
  const height = Math.round(canvasEl.clientHeight);
  if (!(width > 0) || !(height > 0)) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const backingWidth = Math.round(width * ratio);
  const backingHeight = Math.round(height * ratio);
  if (canvasEl.width !== backingWidth || canvasEl.height !== backingHeight) {
    canvasEl.width = backingWidth;
    canvasEl.height = backingHeight;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width, height };
}

/**
 * Projects the CURRENT authority ground war into a pixel box. One engine: sites, ownership,
 * capture progress, units and tickets are read from the snapshot and reprojected — nothing here
 * infers any of them. Returns null before the first snapshot carries sites.
 */
/**
 * Bakes the shaded-relief chart backdrop once. It samples the SAME terrain the aircraft flies
 * over (`groundAt`), so the chart and the world cannot disagree — one engine.
 */
function bakeTacticalMapBackdrop(bounds) {
  if (!plan || typeof document === "undefined") return null;
  try {
    const relief = bakeCobraTacticalRelief({
      sampleHeightM: (eastM, northM) => groundAt(eastM, northM),
      bounds,
      sizePx: 160,
      waterHeightM: COBRA_CANYON_VISUAL_PROFILE.water?.surfaceHeightM ?? null,
    });
    const canvasEl = document.createElement("canvas");
    canvasEl.width = relief.widthPx;
    canvasEl.height = relief.heightPx;
    const context = canvasEl.getContext("2d");
    if (!context) return null;
    const image = context.createImageData(relief.widthPx, relief.heightPx);
    image.data.set(relief.rgba);
    context.putImageData(image, 0, 0);
    return canvasEl;
  } catch (error) {
    // A chart without relief is still a chart; never let the backdrop take the mission down.
    console.warn("[cobra-lab] tactical relief bake failed", error);
    return null;
  }
}

/** The authored river polyline, in the chart's own {eastM, northM} terms. */
function tacticalMapRiverCourse() {
  const ribbon = (plan?.terrainRibbons ?? []).find((candidate) =>
    String(candidate.laneId ?? candidate.kind ?? "").includes("river"));
  const points = ribbon?.pointsLocalM ?? ribbon?.points ?? [];
  return points
    .map((point) => (Array.isArray(point)
      ? { eastM: Number(point[0]), northM: Number(point[2]) }
      : { eastM: Number(point?.eastM ?? point?.x), northM: Number(point?.northM ?? point?.z) }))
    .filter((point) => Number.isFinite(point.eastM) && Number.isFinite(point.northM));
}

/** Chart scale, for the scale bar. Null before the bounds are known. */
function tacticalMapMetresPerPixel(widthPx) {
  if (!tacticalMapBounds || !(widthPx > 0)) return null;
  return (tacticalMapBounds.maxEastM - tacticalMapBounds.minEastM) / widthPx;
}

function tacticalMapModelFor(widthPx, heightPx, showUnits) {
  const war = authorityState?.ground_war;
  const sites = war?.sites ?? [];
  if (!sites.length) return null;
  if (!tacticalMapBounds) tacticalMapBounds = cobraTacticalMapBounds(sites);
  if (!tacticalMapBackdrop) tacticalMapBackdrop = bakeTacticalMapBackdrop(tacticalMapBounds);
  if (!tacticalMapRiver) tacticalMapRiver = tacticalMapRiverCourse();
  return cobraTacticalMapModel({
    sites,
    river: tacticalMapRiver,
    units: war.units ?? [],
    tickets: war.tickets,
    combatLive: war.combat_live,
    // Sim frame: x is east, z is north, yaw is the compass heading (0 = north), which is exactly
    // the north-up chart convention — no flip, no offset.
    player: {
      eastM: vehiclePose.x_m,
      northM: vehiclePose.z_m,
      headingRad: vehiclePose.yaw_rad,
    },
    bounds: tacticalMapBounds,
    widthPx,
    heightPx,
    showUnits,
  });
}

/** Per-frame chart paint. The open full map replaces the minimap rather than stacking on it. */
function drawTacticalMaps(timeMs) {
  if (parkedCamera) return;
  const nowSeconds = timeMs / 1_000;
  // The objective rides on the chart because the prose card is play-hidden by Build 302
  // (mission cues live on the instrument). Without this the conquest orders reach nobody who
  // is actually flying — which is the exact complaint this whole change answers.
  // The pose is not optional garnish: without it cobraObjectiveCopy falls back to snapshot
  // order rather than range, so the caption can order the pilot to the FAR garrison while a
  // nearer one is the actual job. In play this caption is the only order the pilot ever sees.
  const caption = cobraObjectiveCopy(authorityState?.ground_war, {
    selectedTargetId: targetSelect?.value || authorityState?.gunner?.selected_target_id || "",
    playerHasInteracted,
    player: { eastM: vehiclePose.x_m, northM: vehiclePose.z_m },
    actOverlay: emberActObjectiveOverlay(authorityState?.mission_act, {
      remainingM: emberActRemainingM(authorityState, vehiclePose),
      speedKts: Number(vehiclePose.ground_speed_mps ?? authorityState?.vehicle?.ground_speed_mps) * 1.943844,
      sinkFpm: Math.max(0, -Number(authorityState?.vehicle?.vertical_speed_mps ?? 0) * 196.850394),
    }),
    turnaround: authorityState?.turnaround,
  });
  if (tacticalMapOpen) {
    const box = sizeMapCanvas(tacticalMapCanvas, tacticalMapCtx);
    const headerPx = COBRA_MAP_CAPTION_PX.full;
    const model = box && tacticalMapModelFor(box.width, box.height - headerPx, true);
    if (model) {
      drawCobraTacticalMap(tacticalMapCtx, model, {
        full: true, nowSeconds, caption, headerPx,
        backdrop: tacticalMapBackdrop,
        metresPerPixel: tacticalMapMetresPerPixel(model.widthPx),
      });
    }
    return;
  }
  const box = sizeMapCanvas(minimapCanvas, minimapCtx);
  const headerPx = COBRA_MAP_CAPTION_PX.mini;
  // Units stay off the minimap: at 200 px the whole valley is ~30 px per kilometre and a dozen
  // infantry markers would bury the four points the player is actually flying between.
  const model = box && tacticalMapModelFor(box.width, box.height - headerPx, false);
  if (model) {
    drawCobraTacticalMap(minimapCtx, model, {
      full: false, nowSeconds, caption, headerPx,
      backdrop: tacticalMapBackdrop,
      metresPerPixel: tacticalMapMetresPerPixel(model.widthPx),
    });
  }
}

/**
 * M opens and closes the full map. It does NOT pause the sim — the fight continues while the
 * player reads the chart, which is the whole tension of pulling it up.
 */
function setTacticalMapOpen(open) {
  if (!tacticalMapCanvas) return;
  tacticalMapOpen = Boolean(open);
  tacticalMapCanvas.hidden = !tacticalMapOpen;
  document.body.dataset.map = tacticalMapOpen ? "open" : "closed";
  if (tacticalMapOpen) sizeMapCanvas(tacticalMapCanvas, tacticalMapCtx);
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
    const aglFt = formatAviationAgl(tourCommandedAglM);
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
  setMissionPaused(false, { focus: false });
  lockPlayRoute();
  const requireNeutralEdge = PLAY_MODE && authorityState !== null;
  sortieReadiness.reset(!PLAY_MODE, { requireNeutral: requireNeutralEdge });
  missionTerminal = false;
  padlockActive = false;
  padlockMaskedSinceMs = null;
  if (debrief) debrief.hidden = true;
  activeRoute = routeById(routeSelect.value);
  bridge?.StartRoute(routeSelect.selectedIndex, !PLAY_MODE);
  authorityState = bridge ? JSON.parse(bridge.GetState()) : null;
  lastTurnaroundPhase = authorityState?.turnaround?.phase ?? null;
  pilotControls = PLAY_MODE
    ? createCobraGroundedPilotControlState()
    : createCobraPilotControlState(bridge?.GetHoverCollective() ?? 0.5);
  // Keep the browser and authority copies aligned synchronously, before a single Advance can run,
  // so a Ready dismissal or cyclic/gunner input cannot launch the helicopter on inherited
  // collective.
  bridge?.SetControls(
    pilotControls.collective,
    pilotControls.forwardCyclic,
    pilotControls.rightCyclic,
    pilotControls.yaw,
  );
  bridge?.SetTurnaroundAction(false);
  // A restart is a fresh mission, so the chart's enclosing square is recomputed once, here.
  tacticalMapBounds = null;
  tacticalMapBackdrop = null;
  tacticalMapRiver = null;
  routeSampler = createCobraCanyonRouteSampler(activeRoute);
  routeDistanceM = ROUTE_ENTRY_OFFSETS_M[activeRoute.id] ?? 0;
  routeComplete = false;
  // A restart is a fresh ramp: last mission's wrecks must not survive into it. The pool sync
  // prunes by live slot id, but it returns early on any frame without a pool, so a stale
  // wreck could otherwise linger in the scene.
  for (const [, parked] of parkedPresences) scene.remove(parked.group);
  parkedPresences.clear();
  lastAirframeSwaps = 0;
  // Ready does not advance or poll authority. Populate the ramp immediately from StartRoute's
  // direct snapshot so the two parked spares are present before the player's first input.
  syncParkedAirframes();
  placeCameraOnRoute();
  updateRouteCard();
  lastTargetKey = null;
  refreshGroundTargets();
  groundWarPresentation?.sync(
    authorityState?.ground_war ?? null,
    targetSelect.value || null,
    authorityState?.battle_damage ?? null,
  );
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

// The ramp: every non-flying airframe in the pool renders as a parked presence at its
// slot pose. A crippled bird lists visibly on its bent gear; a destroyed one lists harder.
const parkedPresences = new Map();
let lastAirframeSwaps = 0;
function syncParkedAirframes() {
  const swaps = authorityState?.airframe_swaps ?? 0;
  if (swaps > lastAirframeSwaps && bridge) {
    const turnaroundActive = cobraTurnaroundIsActive(authorityState?.turnaround);
    if (PLAY_MODE && !turnaroundActive) {
      // A turnaround spare must keep authority advancing so its real turbine/rotor state can
      // start. Ordinary/non-turnaround generation changes retain the old neutral Ready defence.
      sortieReadiness.reset(false, { requireNeutral: true });
    }
    if (PLAY_MODE) {
      pilotControls = createCobraGroundedPilotControlState();
    } else {
      // The lab intentionally remains a continuously-running visualization. Its explicit command
      // is the provider's calculated hover trim, not play's cold-ramp doctrine or a guessed 0.5.
      pilotControls = createCobraPilotControlState(bridge.GetHoverCollective());
    }
    // Never mark a generation consumed unless authority accepted that exact acknowledgement.
    // A mismatch leaves lastAirframeSwaps unchanged so the next fresh snapshot retries while the
    // bridge continues holding the spare cold.
    if (!bridge.AcknowledgeAirframeSwap(swaps)) return;
    bridge.SetControls(pilotControls.collective, 0, 0, 0);
    setStatus(turnaroundActive
      ? "SPARE COLD · RELEASE E, THEN HOLD E TO START"
      : "BIRD SWAP · SPARE'S YOURS — THE BENT ONE STAYS ON THE RAMP", "ready");
  }
  lastAirframeSwaps = swaps;
  const pool = authorityState?.airframe_pool;
  if (!Array.isArray(pool)) return;
  const liveIds = new Set();
  for (const slot of pool) {
    if (!slot || slot.state === "player-flying") continue;
    liveIds.add(slot.id);
    let presence = parkedPresences.get(slot.id);
    if (!presence) {
      presence = createParkedCobra(THREE);
      scene.add(presence.group);
      parkedPresences.set(slot.id, presence);
    }
    const listRad = slot.state === "crippled" ? 0.26 : slot.state === "destroyed" ? 0.6 : 0;
    placeParkedCobra(presence, slot, listRad);
  }
  for (const [id, presence] of parkedPresences) {
    if (liveIds.has(id)) continue;
    scene.remove(presence.group);
    parkedPresences.delete(id);
  }
}

function rebuildPresentation() {
  if (!world) return;
  skyMaterial.uniforms.proceduralCloudsEnabled.value = qualitySelect.value === "mobile" ? 0 : 1;
  presentation?.dispose();
  groundWarPresentation?.dispose();
  emberGuidancePath?.dispose();
  plan = planCobraCanyonWorld(world, { qualityTier: qualitySelect.value });
  // The world file's per-tier `maxShadowCasters` is the authority on whether this tier can afford
  // the pass at all (mobile budgets 0); the renderer gate follows the same tier selection.
  applyShadowQuality();
  presentation = createCobraCanyonPresentation(THREE, plan, {
    qualityTier: qualitySelect.value,
    foliageTextures,
    roleGeometries,
  });
  groundWarPresentation = createCobraGroundWarPresentation(THREE);
  emberGuidancePath = createGuidancePath(THREE, {
    maxGates: 16,
    // Airborne soft volumes (owner 2026-08-10): look-through haze you fly through —
    // warm enough to find after lift-off, never a gorge-spanning diamond.
    gateOpacity: 0.22,
    activeOpacity: 0.42,
    activeColor: 0xffe8b8,
    maxVisualHalfM: 28,
  });
  scene.add(presentation.group);
  scene.add(groundWarPresentation.group);
  scene.add(emberGuidancePath.object3d);
  // The golden path is quality-tier independent (one 160-triangle ribbon), so it survives a canyon
  // rebuild instead of being torn down and re-added with it.
  if (!goldenPath) scene.add((goldenPath = createCobraGoldenPath(THREE)).group);
  if (!formationLead) scene.add((formationLead = createCobraFormationLead(THREE)).group);
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
  hostileTargetIds = units
    .filter((unit) => unit.alive && unit.faction === "hostile")
    .sort((a, b) => distanceToPlayer(a) - distanceToPlayer(b))
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
    option.textContent = `${unit.faction === "friendly" ? "FRI" : "HOS"} · ${unit.role} · ${unit.id.slice(-7)}`;
    targetSelect.append(option);
  }
  if (previous && [...targetSelect.options].some((option) => option.value === previous)) {
    targetSelect.value = previous;
    hostileTargetIndex = hostileTargetIds.indexOf(previous);
  } else if (hostileTargetIds.length && playerHasInteracted) {
    // Auto-reselect keeps continuity after a kill, but never before the pilot's first input —
    // a cold-boot auto-selection dragged the camera toward a hostile on spawn.
    hostileTargetIndex = 0;
    targetSelect.value = hostileTargetIds[0];
    bridge?.SetGunnerTarget(targetSelect.value);
    // If the old locked unit died, this continuity mark is only a Tab-style gunner selection.
    // Never swing the eye to its replacement without a fresh V/authority LOS acquisition.
    padlockActive = false;
    padlockMaskedSinceMs = null;
  } else {
    hostileTargetIndex = -1;
    padlockActive = false;
    padlockMaskedSinceMs = null;
  }
}

function applyGunnerTarget(targetId) {
  if (!targetSelect) return;
  targetSelect.value = targetId || "";
  hostileTargetIndex = targetId ? hostileTargetIds.indexOf(targetId) : -1;
  bridge?.SetGunnerTarget(targetId || null);
  groundWarPresentation?.sync(
    authorityState?.ground_war ?? null,
    targetId || null,
    authorityState?.battle_damage ?? null,
  );
}

function cycleHostileTarget() {
  const nextId = nextHostileTargetId(hostileTargetIds, targetSelect?.value || null);
  if (!nextId) return;
  // Tab may select a masked mark for the gunner to report, but a visual lock cannot silently
  // jump to it. The pilot must press V, which goes through authority LOS below.
  padlockActive = false;
  padlockMaskedSinceMs = null;
  applyGunnerTarget(nextId);
}

function togglePadlock() {
  if (padlockActive) {
    padlockActive = false;
    padlockMaskedSinceMs = null;
    return;
  }
  const acquiredTargetId = acquireAuthorityVisualLockTarget({
    selectedTargetId: targetSelect?.value || null,
    hostileTargetIds,
    // One synchronous authority call both checks living-hostile + terrain/obstacle LOS and
    // assigns this exact ID to the AI gunner. No renderer raycast and no select-then-mask frame.
    tryAcquire: (targetId) => bridge?.TrySetVisualLockTarget(targetId) === true,
  });
  if (!acquiredTargetId) return;
  applyGunnerTarget(acquiredTargetId);
  padlockActive = true;
  padlockMaskedSinceMs = null;
}

function updateTour(deltaSeconds) {
  if (parkedCamera || routeComplete) return;
  const routeEndM = Math.max(0, routeSampler.lengthM - ROUTE_END_LOOKAHEAD_M);
  routeDistanceM = Math.min(
    routeEndM,
    routeDistanceM + Number(speedInput.value) * deltaSeconds,
  );
  routeComplete = routeDistanceM >= routeEndM;
  placeCameraOnRoute();
}

function updateManual(deltaSeconds) {
  // Cobra pause is a browser-owned lifecycle hold: without an Advance call, deterministic
  // authority time cannot move. Keep rendering the frozen sight picture but admit no controls.
  if (missionPaused) return;
  // Visual-review park owns the camera: keep the sim alive, but do not overwrite the eye
  // with the vehicle pose (that is what made overnight stills look like Camp Ember everywhere).
  if (parkedCamera) {
    if (bridge && !missionTerminal) {
      bridge.SetTurnaroundAction(false);
      const simStartedAtMs = performance.now();
      if (sortieReadiness.advance(deltaSeconds, (step) => bridge.Advance(step))) {
        recordPhase("sim", simStartedAtMs);
        sampleAuthorityState(lastTimeMs);
      }
    }
    return;
  }
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
    const keyboardIntent = cobraKeyboardControlIntent(keys, cobraControlProfile);
    const analogAxes = cobraGamepadControlAxes(gamepad);
    // A connected controller can continue reporting held buttons after the page loses focus.
    // Authority procedure holds count only while this cockpit owns focus, matching keyboard input.
    const turnaroundActionHeld = windowFocused
      && cobraTurnaroundActionHeld({ activeCodes: keys, gamepad });
    const turnaroundActive = cobraTurnaroundIsActive(authorityState?.turnaround);
    const turnaroundLocksControls = cobraTurnaroundLocksFlightControls(
      authorityState?.turnaround,
    );
    const deliberateInput = hasDeliberateCobraCockpitInput({
      keyboardIntent,
      analogAxes,
      turnaroundAction: turnaroundActive && turnaroundActionHeld,
    });
    if (windowFocused
      && sortieReadiness.observeInput(deliberateInput)
      && deliberateInput) {
      onboarding?.dismiss();
    }
    // A held input rejected by the restart edge gate must not silently preload collective/cyclic
    // while authority is paused. The first accepted edge flips Ready above, then reaches this
    // ordinary integrator on the same frame unchanged.
    if (sortieReadiness.ready && !turnaroundLocksControls) {
      // Authentic controls own only the pilot's physical inputs. Aircraft attitude never feeds
      // back through this browser seam as an unlabeled hold or recovery command.
      pilotControls = advanceCobraPilotControls(pilotControls, {
        keyboardIntent,
        analogAxes,
        deltaSeconds,
        focused: windowFocused,
      });
    } else if (turnaroundLocksControls) {
      // Authority also substitutes a zero command. Mirroring it here keeps the visible/published
      // lever honest and prevents held W from accumulating behind the lock.
      pilotControls = createCobraGroundedPilotControlState();
    }
    if (!missionTerminal) {
      // Cyclic goes through the expo curve on its way to the flight model; the control state
      // itself stays the raw stick position for the readouts and the slew maths.
      bridge.SetControls(
        pilotControls.collective,
        cobraCyclicCommand(pilotControls.forwardCyclic),
        cobraCyclicCommand(pilotControls.rightCyclic),
        pilotControls.yaw,
      );
      bridge.SetTurnaroundAction(turnaroundActionHeld);
      bridge.SetGunnerTarget(targetSelect.value || null);
      bridge.SetEngagementConsent(!turnaroundLocksControls
        && keys.has(cobraControlProfile.fire.code));
      // Rendering stays live at Ready, but authority time starts only after deliberate input.
      const simStartedAtMs = performance.now();
      if (sortieReadiness.advance(deltaSeconds, (step) => bridge.Advance(step))) {
        recordPhase("sim", simStartedAtMs);
        sampleAuthorityState(lastTimeMs);
      }
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
  // 0.30, not 0.12. Depth precision goes as z²/(near·2²⁴), so the cockpit's old near plane cost
  // 2.5× the resolution of the parked review camera's 0.5 — which is why review stills always
  // understated the Camp Ember shimmer that play showed. The nearest cockpit geometry to the
  // rear-seat eye is the canopy glass at ~0.38 m, so 0.30 clears it with margin while 0.5 would
  // clip it.
  if (camera.near !== 0.3) {
    camera.near = 0.3;
    camera.updateProjectionMatrix();
  }

  const lookDistanceM = 140;
  const bodyYaw = Number(vehicle.yaw_rad) || 0;
  const bodyPitch = Number(vehicle.pitch_rad) || 0;
  // Forward view is exactly body-aligned: body-forward projects to the camera principal point,
  // so the waterline is an honest optical-centre reference. Padlock alone may take the eye off
  // axis — F-22 contract: forward is nose-forward, V is the view toggle.
  const bodyLookOffset = lookOffsetFromAngles(bodyYaw, bodyPitch, lookDistanceM);
  const forwardLook = {
    x: camera.position.x + bodyLookOffset.x,
    y: camera.position.y + bodyLookOffset.y,
    z: camera.position.z + bodyLookOffset.z,
  };

  const selectedId = targetSelect?.value || authorityState?.gunner?.selected_target_id;
  const units = authorityState?.ground_war?.units ?? [];
  const selected = selectedId ? units.find((unit) => unit.id === selectedId && unit.alive) : null;
  if (padlockActive && !selected) {
    padlockActive = false;
    padlockMaskedSinceMs = null;
  }

  const lookAt = resolveAuthorityLookAtPoint({
    padlockActive,
    selectedUnit: selected,
    forwardLook,
  });
  lookTarget.set(lookAt.x, lookAt.y, lookAt.z);

  camera.lookAt(lookTarget);
  // Negated: three.js rolls the camera counter-clockwise for a positive rotation.z (right-hand
  // rule about +Z, which points back out of the screen), so feeding a right bank straight in
  // tilted the horizon the wrong way and a left cyclic input read as a roll to the right.
  // Padlock still inherits body roll so the horizon stays aircraft-honest while the eye tracks.
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

function groundFireDebriefDetail(battleDamage) {
  const bursts = Math.max(0, Number(battleDamage?.bursts_fired) || 0);
  const hits = Math.max(0, Number(battleDamage?.damaging_hits) || 0);
  const systems = [];
  if (battleDamage?.scas_damaged === true) systems.push("SCAS OUT");
  if (battleDamage?.engine_damaged === true) systems.push("ENGINE OUT");
  const recentBursts = Array.isArray(battleDamage?.recent_bursts)
    ? battleDamage.recent_bursts
    : [];
  const latestDamage = [...recentBursts].reverse().find((burst) =>
    burst?.has_impacted === true && burst?.will_hit === true);
  const observerId = latestDamage?.observer_id ?? battleDamage?.active_observer_id ?? null;
  const subsystemSummary = systems.length ? systems.join(" + ") : "NO SUBSYSTEM LOSS";
  return `Ground fire: ${subsystemSummary} · ${hits} damaging ${hits === 1 ? "hit" : "hits"} / ${bursts} ${bursts === 1 ? "burst" : "bursts"}${observerId ? ` · source ${observerId}` : ""}.`;
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
  // Conquest outcomes. The sim decides both ends the same way — one side's ticket pool hits
  // zero ("tickets-exhausted", CobraGroundWarRuntime.BleedTickets) — so the copy names the
  // points that did the bleeding rather than the old control meter. The previous branch tested
  // for "lost-basin", a reason the sim has not emitted since tickets landed, so every defeat
  // fell through to the bare "The ground war is lost."
  const friendlyPoints = (war?.sites ?? []).filter((site) => site?.owner === "friendly").length;
  const heldPoints = (war?.sites ?? [])
    .filter((site) => site?.owner === "friendly" || site?.owner === "hostile").length;
  if (victory) {
    title = "VALLEY HELD";
    reason = war?.outcome_reason === "tickets-exhausted"
      ? `Hostile reinforcements ran out — you held ${friendlyPoints} of ${heldPoints} points long enough to bleed them dry.`
      : "The hostile push is finished.";
  } else if (defeat) {
    title = "VALLEY LOST";
    reason = war?.outcome_reason === "tickets-exhausted"
      ? `Friendly reinforcements ran out while hostiles held the points — you finished on ${friendlyPoints} of ${heldPoints}.`
      : "The ground war is lost.";
  } else if (status === "obstacle-collision") {
    title = "OBSTACLE STRIKE";
    const obstacle = authorityState?.collision_obstacle_id;
    reason = obstacle
      ? `Flew into ${String(obstacle).split(".").slice(-2).join(" ")}.`
      : "Flew into a canyon obstacle.";
  } else if (status === "vehicle-authority-lost") {
    // The sim names WHICH envelope violation ended the airframe; fall back to the generic
    // terrain-strike copy only when no specific cause was latched.
    const cause = cobraTerminalCauseCopy(authorityState?.vehicle?.contact_failure_cause);
    title = cause ? cause.title : "AIRFRAME LOST";
    reason = cause
      ? cause.detail
      : "Terrain strike — the impact took the rotor and the airframe with it.";
  } else if (status === "terrain-unavailable") {
    title = "OFF THE MAP";
    reason = "You left surveyed terrain; the sortie cannot continue.";
  } else if (cobraMissionStatusCopy(status)) {
    const missionCopy = cobraMissionStatusCopy(status);
    title = missionCopy.title;
    reason = missionCopy.detail;
  } else {
    title = "SORTIE ENDED";
    reason = `Sortie ended: ${status.replaceAll("-", " ")}.`;
  }
  setText(debriefTitle, title);
  const groundFireDetail = groundFireDebriefDetail(authorityState?.battle_damage);
  setText(
    debriefBody,
    `${reason} ${groundFireDetail} Hostiles down ${war?.debrief?.hostile_kills ?? 0} · rearms ${war?.debrief?.fob_rearms ?? 0} · bird swaps ${authorityState?.airframe_swaps ?? 0} · ${(war?.debrief?.elapsed_s ?? 0).toFixed(0)}s airborne. R restarts.`,
  );
  debrief.hidden = false;
  setStatus(
    victory ? "MISSION COMPLETE · VALLEY HELD" : `MISSION ${status.replaceAll("-", " ").toUpperCase()} · R RESTARTS`,
    victory ? "ready" : "error",
  );
}

function updateObjectiveHud(war) {
  if (!war) return;
  // Two tracks, both published truth: points held, then the ticket pools that decide the
  // mission. The old control marker showed a hidden number that no longer settles anything.
  const sites = Array.isArray(war.sites) ? war.sites.filter(Boolean) : [];
  const heldSites = sites.filter((site) => site.owner === "friendly" || site.owner === "hostile");
  const friendlyPoints = heldSites.filter((site) => site.owner === "friendly").length;
  if (balanceFill) {
    balanceFill.style.width = heldSites.length
      ? `${((friendlyPoints / heldSites.length) * 100).toFixed(0)}%`
      : "0%";
  }
  setText(balanceLabel, heldSites.length
    ? `${friendlyPoints} / ${heldSites.length} POINTS`
    : "— POINTS");
  const friendlyTickets = Number(war.tickets?.friendly);
  const hostileTickets = Number(war.tickets?.hostile);
  const hasTickets = Number.isFinite(friendlyTickets) && Number.isFinite(hostileTickets);
  // Both pools share one scale so the two bars are directly comparable.
  const ticketScale = hasTickets ? Math.max(friendlyTickets, hostileTickets, 1) : 1;
  if (holdFill) {
    holdFill.style.width = hasTickets ? `${(friendlyTickets / ticketScale) * 100}%` : "0%";
  }
  if (hostileTicketFill) {
    hostileTicketFill.style.width = hasTickets ? `${(hostileTickets / ticketScale) * 100}%` : "0%";
  }
  setText(holdLabel, hasTickets
    ? `TICKETS ${Math.round(friendlyTickets)} · ${Math.round(hostileTickets)}`
    : "TICKETS — · —");
  // Ammo/FOB/kills/target/gunner/rotor truth moved from the DOM text strip into the
  // canvas HUD (production hud.js); the card keeps objective copy only for lab/metrics.
  const copy = cobraObjectiveCopy(war, {
    selectedTargetId: authorityState?.gunner?.selected_target_id ?? null,
    playerHasInteracted,
    player: { eastM: vehiclePose.x_m, northM: vehiclePose.z_m },
    actOverlay: emberActObjectiveOverlay(authorityState?.mission_act, {
      remainingM: emberActRemainingM(authorityState, vehiclePose),
      speedKts: Number(vehiclePose.ground_speed_mps ?? authorityState?.vehicle?.ground_speed_mps) * 1.943844,
      sinkFpm: Math.max(0, -Number(authorityState?.vehicle?.vertical_speed_mps ?? 0) * 196.850394),
    }),
    turnaround: authorityState?.turnaround,
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
  if (!missionPaused) {
    if (tourInput.checked) updateTour(deltaSeconds);
    else updateManual(deltaSeconds);
  }
  applyParkedCamera();
  const aglM = tourInput.checked && !parkedCamera ? tourCommandedAglM : cameraAglM();
  const presentationStartedAtMs = performance.now();
  // Parked review stills must see the authored canopy, not the FPS shed path. Swiftshader /
  // headless park shots otherwise trip ambientBudgetLevel 2 and judge an empty corridor.
  presentation.update({
    cameraPosition: camera.position,
    cameraAglM: aglM,
    ambientBudgetLevel: parkedCamera ? 0 : ambientBudgetLevel(),
  });
  if (emberGuidancePath && authorityState) {
    emberGuidancePath.update(emberPathGuidanceState(authorityState));
  }
  // "It is not obvious where I am supposed to fly." The ribbon of sunlit haze answers that through
  // the windscreen; on the tour rails or a parked scenery still there is no pilot to answer.
  goldenPath?.update(cobraGoldenPathState({
    groundWar: authorityState?.ground_war,
    pathGates: authorityState?.path_gates,
    pose: readVehiclePose(),
    groundHeightAt: groundAt,
    nowSeconds: timeMs / 1_000,
    missionAct: authorityState?.mission_act,
    speedKts: Number(authorityState?.vehicle?.ground_speed_mps) * 1.943844,
    sinkFpm: Math.max(0, -Number(authorityState?.vehicle?.vertical_speed_mps ?? 0) * 196.850394),
    suppressed: tourInput.checked || Boolean(parkedCamera),
  }));
  const currentPose = readVehiclePose();
  formationLeadPose = formationLead?.update(
    authorityState,
    currentPose,
    missionPaused ? 0 : deltaSeconds,
  ) ?? null;
  formationRadio = cobraFormationRadio(authorityState, currentPose);
  recordPhase("presentation", presentationStartedAtMs);
  if (tourInput.checked && bridge && !missionTerminal) {
    // A guided scenery camera has no pilot. Advancing the aircraft here used to relax the
    // collective toward zero and crash an unseen Cobra while reviewers were looking elsewhere,
    // eventually cold-swapping the bird and corrupting every later visual judgment. Freeze the
    // authority snapshot; the route camera and all streamed presentation still update normally.
    const pose = readVehiclePose();
    if (pose) updateAh1gPresence(ensureAh1gPresence(), pose, deltaSeconds);
  }
  // The camera mode is the ONLY input that decides whether the airframe exists: first
  // person renders zero cockpit geometry (Build 264 owner ruling), the tour camera looks
  // AT the ship so the silhouette returns. Parked scenery stills also hide the ship —
  // otherwise the AH-1G hull eats the near-field frame the emptiness gate scores.
  if (ah1gPresence) {
    ah1gPresence.setFirstPerson(!tourInput.checked || !!parkedCamera);
  }
  const renderStartedAtMs = performance.now();
  updateShadowFrame();
  renderer.render(scene, camera);
  recordPhase("render", renderStartedAtMs);
  const hudStartedAtMs = performance.now();
  drawHud(timeMs, deltaSeconds);
  drawTacticalMaps(timeMs);
  recordPhase("hud", hudStartedAtMs);
  recordFrameDuration(rawDeltaMs);
  updateMetrics(aglM);
  onboarding?.advanceNudges(missionPaused ? {} : onboardingNudgeState(),
    missionPaused ? 0 : deltaSeconds);
  recordPhase("total", frameStartedAtMs);
  framePhaseSamples += 1;
}

/**
 * World + shared flight HUD + AH-1G authority instruments, zero cockpit. Tour/preview clears the
 * combiner; a terminal sortie lets the debrief card own the frame.
 */
function drawHud(timeMs, deltaSeconds) {
  const pose = readVehiclePose();
  const firstPerson = Boolean(bridge) && !tourInput.checked && !missionTerminal
    && !parkedCamera
    && pose && authorityState;
  if (!firstPerson) {
    hudPresentationCtx.save();
    hudPresentationCtx.setTransform(1, 0, 0, 1, 0, 0);
    hudPresentationCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudPresentationCtx.restore();
    updateFlightAudio(hudStateScratch, {
      muted: true,
      triggerHeld: false,
      nowSeconds: timeMs / 1000,
    });
    return;
  }
  cobraHudState(authorityState, pose, hudStateScratch);
  const selectedId = targetSelect?.value || authorityState?.gunner?.selected_target_id || "";
  const selectedUnit = selectedId
    ? (authorityState?.ground_war?.units ?? []).find((unit) => unit.id === selectedId && unit.alive)
    : null;
  hud.draw(hudFrameKit.update({
    camera,
    pose,
    state: hudStateScratch,
    dt: deltaSeconds,
    nowSeconds: timeMs / 1000,
    padlockActive,
    padlockTargetId: selectedUnit ? selectedId : "",
    padlockTargetUnit: selectedUnit,
  }));
  drawCobraRotorcraftHud(
    hudPresentationCtx,
    cobraRotorcraftHudModel(authorityState, {
      lead: formationLeadPose,
      radio: formationRadio,
    }),
    {
      width: hudViewport.width,
      height: hudViewport.height,
      pixelRatio: hudViewport.pixelRatio,
      safeInsets: HUD_SAFE_INSETS,
      projectWorldPoint: projectSimPointToScreen,
    },
  );
  // Jet gun reports stay off — Cobra tip fire is not the F-22 M61 voice.
  updateFlightAudio(hudStateScratch, {
    muted: missionPaused || missionTerminal || hud.audioEnabled === false,
    triggerHeld: false,
    nowSeconds: timeMs / 1000,
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
    // Review stills are exterior scenery shots — leave first-person / tour rails.
    if (tourInput) tourInput.checked = false;
    if (qualitySelect && qualitySelect.value !== "desktop") {
      qualitySelect.value = "desktop";
      qualitySelect.dispatchEvent(new Event("change"));
    }
    onboarding?.dismiss?.();
    // Strip mission chrome so park stills score the gorge, not the objective card.
    document.querySelector("#play-chrome")?.setAttribute("data-parked", "true");
    document.querySelector("#objective-hud")?.setAttribute("hidden", "");
    // The chart is mission chrome too: a review still must score the gorge, not the map.
    setTacticalMapOpen(false);
    minimapCanvas?.setAttribute("hidden", "");
    parkedCamera = {
      eastM: Number(eastM),
      northM: Number(northM),
      aglM: Number(aglM),
      yawRad: Number(yawRad),
      pitchRad: Number(pitchRad),
    };
    applyParkedCamera();
    return parkedCamera;
  },
  release() {
    parkedCamera = null;
    document.querySelector("#play-chrome")?.removeAttribute("data-parked");
    document.querySelector("#objective-hud")?.removeAttribute("hidden");
    minimapCanvas?.removeAttribute("hidden");
  },
});

function isManualControl(code) {
  return code === "KeyW" || code === "KeyS" || code === "KeyA" || code === "KeyD"
    || code === "KeyR" || code === "KeyC" || code === "KeyE" || code === "KeyF"
    || code.startsWith("Arrow");
}

function pauseMenuFocusables() {
  return [pauseResume, pauseRestart, pauseExit].filter((node) => node && !node.disabled);
}

function setMissionPaused(paused, { focus = true } = {}) {
  const next = paused === true;
  if (missionPaused === next) return false;
  missionPaused = next;
  document.body.dataset.paused = String(next);
  if (pauseMenu) pauseMenu.hidden = !next;
  if (next) {
    keys.clear();
    pilotControls = releaseCobraPilotControls(pilotControls);
    bridge?.SetControls(pilotControls.collective, 0, 0, 0);
    padlockActive = false;
    padlockMaskedSinceMs = null;
    bridge?.SetTurnaroundAction(false);
    bridge?.SetEngagementConsent(false);
    setPlayCursorHidden(false);
    if (focus) queueMicrotask(() => pauseResume?.focus({ preventScroll: true }));
  } else {
    // Do not feed the paused wall-clock gap into the first resumed fixed-step frame.
    lastTimeMs = performance.now();
    if (focus) canvas?.focus?.({ preventScroll: true });
  }
  return true;
}

// Escape peels the topmost layer, then toggles an in-mission pause. Capture ordering matters:
// the onboarding card also listens during capture and must not dismiss and pause on one press.
window.addEventListener("keydown", (event) => {
  if (event.code !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  const action = resolveEscapeAction({
    onboardingOpen: onboarding?.isOpen() === true,
    tacticalMapOpen,
    paused: missionPaused,
    terminal: missionTerminal,
  });
  if (action === "dismiss-onboarding") {
    onboarding.dismiss();
    return;
  }
  if (action === "close-map") {
    setTacticalMapOpen(false);
    return;
  }
  if (action === "noop") return;
  setMissionPaused(action === "pause");
}, true);

pauseMenu?.addEventListener("keydown", (event) => {
  if (event.code !== "Tab") return;
  const focusable = pauseMenuFocusables();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
});
pauseResume?.addEventListener("click", () => setMissionPaused(false));
pauseRestart?.addEventListener("click", restartRoute);
pauseExit?.addEventListener("click", leaveMissionForMenu);

window.addEventListener("keydown", (event) => {
  if (missionPaused) return;
  // Terminal states freeze the sim; R is the keyboard path back into the fight (the debrief
  // card announces it). Guarded by missionTerminal so mid-sortie R keeps its freelook meaning.
  if (event.code === "KeyR" && missionTerminal) {
    event.preventDefault();
    restartRoute();
    return;
  }
  if (event.code === "Tab") {
    event.preventDefault();
    if (!sortieReadiness.observeInput(true)) return;
    playerHasInteracted = true;
    onboarding?.dismiss();
    if (tourInput) tourInput.checked = false;
    cycleHostileTarget();
    return;
  }
  if (event.code === "KeyM") {
    event.preventDefault();
    if (!sortieReadiness.observeInput(true)) return;
    playerHasInteracted = true;
    onboarding?.dismiss();
    if (tourInput) tourInput.checked = false;
    setTacticalMapOpen(!tacticalMapOpen);
    return;
  }
  if (event.code === "KeyV") {
    event.preventDefault();
    if (!sortieReadiness.observeInput(true)) return;
    playerHasInteracted = true;
    onboarding?.dismiss();
    if (tourInput) tourInput.checked = false;
    togglePadlock();
    return;
  }
  if (!isManualControl(event.code) && event.code !== "ShiftLeft" && event.code !== "ShiftRight") return;
  event.preventDefault();
  playerHasInteracted = true;
  keys.add(event.code);
  if (hasDeliberateCobraCockpitInput({
    keyboardIntent: cobraKeyboardControlIntent(keys, cobraControlProfile),
    turnaroundAction: event.code === COBRA_TURNAROUND_ACTION_CODE
      && cobraTurnaroundIsActive(authorityState?.turnaround),
  }) && sortieReadiness.observeInput(true)) {
    onboarding?.dismiss();
  }
  if (isManualControl(event.code) && tourInput) tourInput.checked = false;
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  keys.clear();
  bridge?.SetTurnaroundAction(false);
  windowFocused = false;
  pilotControls = releaseCobraPilotControls(pilotControls);
});
window.addEventListener("focus", () => {
  windowFocused = true;
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    keys.clear();
    bridge?.SetTurnaroundAction(false);
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
debriefExit?.addEventListener("click", leaveMissionForMenu);
targetSelect?.addEventListener("change", () => {
  if (!sortieReadiness.observeInput(true)) return;
  playerHasInteracted = true;
  onboarding?.dismiss();
  // A manual mark may be masked. Keep it as a gunner selection, but never drag an existing
  // visual lock to it without a fresh authority LOS acquisition.
  padlockActive = false;
  padlockMaskedSinceMs = null;
  applyGunnerTarget(targetSelect.value || null);
});
speedInput?.addEventListener("input", () => {
  if (speedValue) speedValue.textContent = `${speedInput.value} m/s`;
});
heightInput?.addEventListener("input", () => {
  if (heightValue) heightValue.textContent = `${heightInput.value} m AGL`;
  if (!tourInput?.checked) placeCameraOnRoute();
});
tourInput?.addEventListener("change", () => {
  if (tourInput.checked) {
    // The guided camera freezes flight authority. Release any action held on the last manual
    // frame so returning to the cockpit cannot complete a shutdown/start hold off-screen.
    bridge?.SetTurnaroundAction(false);
    padlockActive = false;
    padlockMaskedSinceMs = null;
  }
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
  bridge?.SetTurnaroundAction(false);
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
    // QA steering seam for crew-chain / headless lift-off (see web/smoke/cobra-crew-chain.test.mjs).
    window.__gunsOnlyCobraBridge = bridge;
    world = await loadCobraCanyonWorld();
    foliageTextures = await resolveCobraVietnamFoliageTextures(THREE);
    // Authored CC0 palms for the jungle role; null keeps the procedural cards.
    const palm = await loadCobraVietnamPalmGeometry(THREE);
    roleGeometries = palm ? { jungle: palm.geometry } : null;
    lockPlayRoute();
    if (tourInput && PLAY_MODE) tourInput.checked = false;
    rebuildPresentation();
    // Fetched once: StartRoute/Advance refill the same WASM buffer, read per frame via copyTo.
    vehiclePoseView = bridge.GetHotPose();
    authorityState = JSON.parse(bridge.GetState());
    syncParkedAirframes();
    // Ready intentionally performs no Advance, but the initial GetState snapshot is already
    // authoritative. Publish it now so diagnostics and smoke can inspect the cold ramp without
    // requiring a fake pilot input to start mission time.
    window.__gunsOnlyCobraAuthority = authorityState;
    pilotControls = PLAY_MODE
      ? createCobraGroundedPilotControlState()
      : createCobraPilotControlState(bridge.GetHoverCollective());
    bridge.SetControls(
      pilotControls.collective,
      pilotControls.forwardCyclic,
      pilotControls.rightCyclic,
      pilotControls.yaw,
    );
    bridge.SetTurnaroundAction(false);
    refreshGroundTargets();
    groundWarPresentation?.sync(
      authorityState.ground_war,
      null,
      authorityState.battle_damage ?? null,
    );
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
