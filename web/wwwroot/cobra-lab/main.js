import * as THREE from "../vendor/three.module.js?v=240";
import {
  loadCobraCanyonWorld,
  planCobraCanyonWorld,
  sampleCobraCanyonTerrain,
} from "../render/cobra/cobra_canyon_plan.js?v=240";
import { createCobraCanyonPresentation } from "../render/cobra/cobra_canyon_presentation.js?v=240";
import {
  COBRA_CANYON_TOUR_BASE_AGL_M,
  createCobraCanyonRouteSampler,
  sampleCobraCanyonTour,
} from "../render/cobra/cobra_canyon_tour.js?v=240";

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
  const clampedDistanceM = THREE.MathUtils.clamp(routeDistanceM, 0, totalLengthM);
  routeProgress.style.transform = `scaleX(${routeComplete ? 1 : clampedDistanceM / totalLengthM})`;
  if (routeComplete) {
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

function restartRoute() {
  if (!plan) return;
  activeRoute = routeById(routeSelect.value);
  routeSampler = createCobraCanyonRouteSampler(activeRoute);
  routeDistanceM = ROUTE_ENTRY_OFFSETS_M[activeRoute.id] ?? 0;
  routeComplete = false;
  placeCameraOnRoute();
  updateRouteCard();
}

function rebuildPresentation() {
  if (!world) return;
  presentation?.dispose();
  plan = planCobraCanyonWorld(world, { qualityTier: qualitySelect.value });
  presentation = createCobraCanyonPresentation(THREE, plan, {
    qualityTier: qualitySelect.value,
  });
  scene.add(presentation.group);
  restartRoute();
  resize();
  frameSamples.fill(0);
  frameSampleCursor = 0;
  frameSampleSize = 0;
  frameCounter = 0;
  frameP95Ms = 0;
  lastTimeMs = performance.now();
  setStatus(`${plan.counts.landmarks} landmarks · ${plan.counts.hazards} authority hazards`, "ready");
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
  if (keys.has("KeyR")) movement.y += 1;
  if (keys.has("KeyF")) movement.y -= 1;
  if (movement.lengthSq() > 0) {
    const boost = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2.8 : 1;
    movement.normalize().multiplyScalar(Number(speedInput.value) * boost * deltaSeconds);
    camera.position.add(movement);
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

function updateMetrics(aglM) {
  if (frameCounter % 12 !== 0) return;
  const diagnostics = presentation.diagnostics();
  const fps = frameP95Ms > 0 ? Math.round(1_000 / frameP95Ms) : 0;
  frameMetric.textContent = frameP95Ms > 0 ? `${fps} fps · p95 ${frameP95Ms.toFixed(1)} ms` : "sampling…";
  drawMetric.textContent = `${renderer.info.render.calls} live · ${diagnostics.drawCalls}/${diagnostics.budget.maxDrawCalls} world`;
  instanceMetric.textContent = `${diagnostics.instances}/${diagnostics.budget.maxInstances}`;
  hazardMetric.textContent = `${plan.counts.hazards} authority · ${diagnostics.hazardsVisible ? "visible" : "missing"}`;
  aglMetric.textContent = `${Math.max(0, aglM).toFixed(1)} m`;
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
  renderer.render(scene, camera);
  recordFrameDuration(rawDeltaMs);
  updateMetrics(aglM);
}

function isManualControl(code) {
  return code === "KeyW" || code === "KeyS" || code === "KeyA" || code === "KeyD"
    || code === "KeyR" || code === "KeyF" || code.startsWith("Arrow");
}

window.addEventListener("keydown", (event) => {
  if (!isManualControl(event.code) && event.code !== "ShiftLeft" && event.code !== "ShiftRight") return;
  event.preventDefault();
  keys.add(event.code);
  if (isManualControl(event.code)) tourInput.checked = false;
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("resize", resize, { passive: true });
routeSelect.addEventListener("change", restartRoute);
qualitySelect.addEventListener("change", rebuildPresentation);
resetButton.addEventListener("click", restartRoute);
speedInput.addEventListener("input", () => {
  speedValue.textContent = `${speedInput.value} m/s`;
});
heightInput.addEventListener("input", () => {
  heightValue.textContent = `${heightInput.value} m AGL`;
  if (!tourInput.checked) placeCameraOnRoute();
});
tourInput.addEventListener("change", () => {
  if (tourInput.checked && routeComplete) restartRoute();
  else if (tourInput.checked) placeCameraOnRoute();
  else {
    yaw = camera.rotation.y;
    pitch = camera.rotation.x;
  }
});
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  setStatus("WebGL context lost — reload the lab", "error");
});

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  presentation?.dispose();
  renderer.dispose();
}, { once: true });

async function boot() {
  resize();
  try {
    world = await loadCobraCanyonWorld();
    rebuildPresentation();
    lastTimeMs = performance.now();
    animationFrame = requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    setStatus(`Cobra Canyon failed: ${error.message}`, "error");
  }
}

boot();
