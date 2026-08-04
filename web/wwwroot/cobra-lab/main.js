import * as THREE from "../vendor/three.module.js?v=258";
import {
  loadCobraCanyonWorld,
  planCobraCanyonWorld,
  sampleCobraCanyonTerrain,
} from "../render/cobra/cobra_canyon_plan.js?v=258";
import { createCobraCanyonPresentation } from "../render/cobra/cobra_canyon_presentation.js?v=258";
import {
  COBRA_CANYON_TOUR_BASE_AGL_M,
  createCobraCanyonRouteSampler,
  sampleCobraCanyonTour,
} from "../render/cobra/cobra_canyon_tour.js?v=258";
import { createCobraGroundWarPresentation } from "../render/cobra/cobra_ground_war.js?v=258";
import { gunnerStatusText } from "../render/cobra/cobra_gunner_status.js?v=258";
import { formatCobraRotorcraftStrip } from "../render/cobra/cobra_rotorcraft_hud.js?v=258";
import {
  cobraKeyboardControlIntent,
  resolveCobraControlProfile,
} from "../render/cobra/cobra_control_profile.js?v=258";
import {
  advanceCobraPilotControls,
  cobraGamepadControlAxes,
  createCobraPilotControlState,
  releaseCobraPilotControls,
} from "../render/cobra/cobra_pilot_input.js?v=258";

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
const canvas = document.querySelector("#scene");
const viewport = document.querySelector(".viewport");
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
const hudAmmo = document.querySelector("#hud-ammo");
const hudFob = document.querySelector("#hud-fob");
const hudKills = document.querySelector("#hud-kills");
const hudTarget = document.querySelector("#hud-target");
const hudGunner = document.querySelector("#hud-gunner");
const hudRotor = document.querySelector("#hud-rotor");
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
let hostileTargetIds = [];
let hostileTargetIndex = -1;
let lastTargetKey = null;
const telemetrySession = `web-cobra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const telemetryRows = [];
let telemetryLastFlushMs = 0;

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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78919a);
scene.fog = new THREE.FogExp2(0x9da99d, 0.000056);

const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 32_000);
camera.rotation.order = "YXZ";
scene.add(new THREE.HemisphereLight(0xe8eee2, 0x3d4632, 0.82));
const sun = new THREE.DirectionalLight(0xffdfb0, 1.28);
sun.position.set(-3_800, 7_600, 2_400);
scene.add(sun);

const skyGeometry = new THREE.SphereGeometry(23_000, 32, 16);
const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x486d7a) },
    horizonColor: { value: new THREE.Color(0xb2b9a7) },
    lowerHazeColor: { value: new THREE.Color(0x718681) },
    sunColor: { value: new THREE.Color(0xffd59b) },
    sunDirection: { value: new THREE.Vector3(-0.42, 0.54, -0.73).normalize() },
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
    uniform vec3 sunColor;
    uniform vec3 sunDirection;
    varying vec3 vSkyDirection;
    void main() {
      float height = vSkyDirection.y;
      vec3 colour = mix(lowerHazeColor, horizonColor, smoothstep(-0.14, 0.06, height));
      colour = mix(colour, topColor, smoothstep(0.02, 0.72, height));
      float sunGlow = pow(max(dot(vSkyDirection, sunDirection), 0.0), 18.0) * 0.26;
      float sunCore = pow(max(dot(vSkyDirection, sunDirection), 0.0), 320.0) * 1.25;
      gl_FragColor = vec4(colour + sunColor * (sunGlow + sunCore), 1.0);
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
let pitch = -0.03;
let lastTimeMs = performance.now();
let animationFrame = 0;

function setStatus(message, state = "loading") {
  statusText.textContent = message;
  status.dataset.ready = state === "ready" ? "true" : "false";
  status.dataset.error = state === "error" ? "true" : "false";
}

function recordTelemetry(nowMs) {
  if (!authorityState) return;
  telemetryRows.push({
    k: "st",
    t: nowMs,
    s: {
      cobra_world_id: authorityState.world_id,
      cobra_route: authorityState.route,
      cobra_route_id: authorityState.route_id,
      cobra_status: authorityState.status,
      cobra_authority_tick: authorityState.authority_tick,
      cobra_x_m: authorityState.vehicle.x_m,
      cobra_y_m: authorityState.vehicle.y_m,
      cobra_z_m: authorityState.vehicle.z_m,
      cobra_ground_speed_mps: authorityState.vehicle.ground_speed_mps,
      cobra_vertical_speed_mps: authorityState.vehicle.vertical_speed_mps,
      cobra_collective: authorityState.vehicle.collective,
      cobra_power_margin: authorityState.vehicle.hover_power_margin,
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
  if (nowMs - telemetryLastFlushMs < 10_000 || telemetryRows.length < 120) return;
  flushTelemetry();
}

async function flushTelemetry() {
  if (!telemetryRows.length) return;
  const rows = telemetryRows.splice(0, 1_500);
  telemetryLastFlushMs = performance.now();
  try {
    await fetch("../api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        session: telemetrySession,
        batchId: `${telemetrySession}-${Date.now()}`,
        rows,
      }),
    });
  } catch {
    // Telemetry is diagnostic and must never stall the flight loop.
  }
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
  return distanceM < 1_000
    ? `${Math.max(0, Math.round(distanceM / 10) * 10)} m`
    : `${(distanceM / 1_000).toFixed(1)} km`;
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
    const offsetM = Math.abs(routeTour.lateralOffsetM);
    const lateral = offsetM >= 0.5
      ? ` · ${offsetM.toFixed(0)} M ${routeTour.lateralOffsetM > 0 ? "RIGHT" : "LEFT"}`
      : "";
    routeFeature.textContent = `${routeTour.cue} · ${tourCommandedAglM.toFixed(0)} M AGL${lateral}`;
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

function rebuildPresentation() {
  if (!world) return;
  presentation?.dispose();
  groundWarPresentation?.dispose();
  plan = planCobraCanyonWorld(world, { qualityTier: qualitySelect.value });
  presentation = createCobraCanyonPresentation(THREE, plan, {
    qualityTier: qualitySelect.value,
  });
  groundWarPresentation = createCobraGroundWarPresentation(THREE);
  scene.add(presentation.group);
  scene.add(groundWarPresentation.group);
  restartRoute();
  resize();
  frameSamples.fill(0);
  frameSampleCursor = 0;
  frameSampleSize = 0;
  frameCounter = 0;
  frameP95Ms = 0;
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
  if (previous && [...targetSelect.options].some((option) => option.value === previous))
    targetSelect.value = previous;
  else if (hostileTargetIds.length) {
    hostileTargetIndex = 0;
    targetSelect.value = hostileTargetIds[0];
  }
}

function cycleHostileTarget() {
  if (!hostileTargetIds.length) return;
  hostileTargetIndex = (hostileTargetIndex + 1) % hostileTargetIds.length;
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
  if (!bridge) {
    // Vestigial freelook: pre-authority camera control only. Once the bridge owns the
    // camera, syncAuthorityCamera overwrites these position/rotation writes every frame.
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
    pilotControls = advanceCobraPilotControls(pilotControls, {
      keyboardIntent: cobraKeyboardControlIntent(keys, cobraControlProfile),
      analogAxes: cobraGamepadControlAxes(gamepad),
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
      bridge.Advance(deltaSeconds);
      authorityState = JSON.parse(bridge.GetState());
      // QA seam: headless smoke scripts steer against authoritative truth, not DOM guesses.
      window.__gunsOnlyCobraAuthority = authorityState;
      refreshGroundTargets();
      groundWarPresentation?.sync(authorityState.ground_war, targetSelect.value || null);
      recordTelemetry(lastTimeMs);
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
  camera.position.y = Math.max(camera.position.y, groundAt(camera.position.x, -camera.position.z) + 4);
}

function syncAuthorityCamera() {
  const vehicle = authorityState?.vehicle;
  if (!vehicle) return;
  camera.position.set(vehicle.x_m, vehicle.y_m + 2.4, -vehicle.z_m);
  const lookDistanceM = 140;
  lookTarget.set(
    vehicle.x_m + Math.sin(vehicle.yaw_rad) * lookDistanceM,
    vehicle.y_m + Math.sin(vehicle.pitch_rad) * lookDistanceM,
    -vehicle.z_m - Math.cos(vehicle.yaw_rad) * lookDistanceM,
  );
  camera.lookAt(lookTarget);
  camera.rotation.z = vehicle.roll_rad;
}

function recordFrameDuration(durationMs) {
  frameSamples[frameSampleCursor] = durationMs;
  frameSampleCursor = (frameSampleCursor + 1) % FRAME_SAMPLE_COUNT;
  frameSampleSize = Math.min(FRAME_SAMPLE_COUNT, frameSampleSize + 1);
  frameCounter += 1;
  if (frameCounter % 15 !== 0 || frameSampleSize < 15) return;
  const ordered = Array.from(frameSamples.subarray(0, frameSampleSize)).sort((a, b) => a - b);
  frameP95Ms = ordered[Math.floor((ordered.length - 1) * 0.95)];
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
  const reason = war?.outcome_reason === "held-bridge"
    ? "You held friendly control long enough to keep the basin."
    : war?.outcome_reason === "lost-basin"
      ? "Hostile control locked the basin before you could tip it back."
      : `Sortie ended: ${status.replaceAll("-", " ")}.`;
  setText(debriefTitle, victory ? "BRIDGE HELD" : defeat ? "BASIN LOST" : "SORTIE ENDED");
  setText(
    debriefBody,
    `${reason} Hostiles down ${war?.debrief?.hostile_kills ?? 0} · rearms ${war?.debrief?.fob_rearms ?? 0} · ${(war?.debrief?.elapsed_s ?? 0).toFixed(0)}s airborne.`,
  );
  debrief.hidden = false;
  setStatus(
    victory ? "MISSION COMPLETE · BRIDGE HELD" : `MISSION ${status.replaceAll("-", " ").toUpperCase()}`,
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
  setText(hudAmmo, war.ammo_dry ? "AMMO DRY" : `AMMO ${war.ammo_remaining}`);
  setText(hudFob, war.over_fob
    ? "FOB PAD · REARM"
    : `FOB ${(war.fob_range_m / 1_000).toFixed(1)} KM`);
  setText(hudKills, `KILLS ${war.debrief?.hostile_kills ?? 0}`);
  const selected = authorityState?.gunner?.selected_target_id;
  setText(hudTarget, selected ? `TARGET ${selected.split(".").pop()}` : "TARGET —");
  setText(hudGunner, gunnerStatusText(authorityState?.gunner, war));
  setText(
    hudRotor,
    formatCobraRotorcraftStrip(authorityState?.vehicle, authorityState?.route_guidance),
  );
  if (war.ammo_dry) {
    setText(objectiveLine, "BINGO / DRY · REARM AT CAMP EMBER");
    setText(objectiveDetail, "Put the skids on the Camp Ember pad, then return to the fight");
  } else if (war.ammo_bingo) {
    setText(objectiveLine, "BINGO AMMO · CAMP EMBER SOON");
    setText(objectiveDetail, "Gun can under a fifth — break off for the pad before it runs dry");
  } else if ((war.victory_hold_progress ?? 0) > 0) {
    setText(objectiveLine, `HOLDING FRIENDLY CONTROL · ${holdPct}%`);
    setText(objectiveDetail, "Keep tipping the fight — do not let hostiles claw it back");
  } else {
    setText(objectiveLine, "TIP CONTROL FRIENDLY · HOLD 45s");
    setText(objectiveDetail, "Tab target · hold F gunner · olive friendlies / dark hostiles");
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
  setText(aglMetric, authorityState?.route_guidance?.current_clearance_m == null
    ? `${Math.max(0, aglM).toFixed(1)} m`
    : `${authorityState.route_guidance.current_clearance_m.toFixed(1)} m`);
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
      : `${(war.fob_range_m / 1_000).toFixed(1)} km · ${(war.fob_bearing_rad * 180 / Math.PI + 360) % 360 | 0}°`);
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
  const deltaSeconds = Math.min(rawDeltaMs / 1_000, 0.05);
  lastTimeMs = timeMs;
  if (!plan || !presentation) return;

  if (tourInput.checked) updateTour(deltaSeconds);
  else updateManual(deltaSeconds);
  const aglM = tourInput.checked ? tourCommandedAglM : cameraAglM();
  presentation.update({
    cameraPosition: camera.position,
    cameraAglM: aglM,
    ambientBudgetLevel: ambientBudgetLevel(),
  });
  if (tourInput.checked && bridge && !missionTerminal) {
    // Keep the ground war alive during guided preview even when the camera is on rails.
    pilotControls = releaseCobraPilotControls(pilotControls);
    bridge.SetControls(pilotControls.collective, 0, 0, 0);
    bridge.SetGunnerTarget(null);
    bridge.SetEngagementConsent(false);
    bridge.Advance(deltaSeconds);
    authorityState = JSON.parse(bridge.GetState());
    refreshGroundTargets();
  }
  groundWarPresentation?.sync(authorityState?.ground_war ?? null, targetSelect?.value || null);
  renderer.render(scene, camera);
  recordFrameDuration(rawDeltaMs);
  updateMetrics(aglM);
}

function isManualControl(code) {
  return code === "KeyW" || code === "KeyS" || code === "KeyA" || code === "KeyD"
    || code === "KeyR" || code === "KeyC" || code === "KeyF" || code.startsWith("Arrow");
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Tab") {
    event.preventDefault();
    if (tourInput) tourInput.checked = false;
    cycleHostileTarget();
    return;
  }
  if (!isManualControl(event.code) && event.code !== "ShiftLeft" && event.code !== "ShiftRight") return;
  event.preventDefault();
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
  bridge?.SetGunnerTarget(targetSelect.value || null);
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

window.addEventListener("pagehide", () => {
  void flushTelemetry();
  cancelAnimationFrame(animationFrame);
  presentation?.dispose();
  groundWarPresentation?.dispose();
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
    authorityState = JSON.parse(bridge.GetState());
    pilotControls = createCobraPilotControlState(authorityState.vehicle.collective);
    refreshGroundTargets();
    groundWarPresentation?.sync(authorityState.ground_war);
    updateObjectiveHud(authorityState.ground_war);
    setStatus(PLAY_MODE
      ? "HOLD THE BRIDGE · AH-1G ONLINE"
      : "AH-1G AUTHORITY ONLINE · LAB", "ready");
    lastTimeMs = performance.now();
    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    setStatus(`Hold the Bridge failed: ${error.message}`, "error");
  }
}

boot();
