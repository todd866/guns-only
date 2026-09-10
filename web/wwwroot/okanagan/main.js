import { createBrowserPilotLogbook } from "../render/progression/pilot_logbook.js";
import { installDisposedPageRestore } from "../render/onboarding/disposed_page_restore.js";
const pilotLogbook = createBrowserPilotLogbook();
installDisposedPageRestore();
window.addEventListener("pagehide", () => pilotLogbook.finish({ outcome: "Left before completion" }));
import * as THREE from "../vendor/three.module.js";
import { createOkanaganWorld, loadOkanaganSceneryTextures } from "../render/okanagan/okanagan_world.js?v=361";
import {
  createOkanaganWorldRoot, okanaganWorldToRender, okanaganRenderToWorld,
  setOkanaganCockpitCamera, lookAtOkanaganPoint,
} from "../render/okanagan/okanagan_render_frame.js?v=361";
import { createOkanaganSiteMarkers } from "../render/okanagan/okanagan_site_markers.js";
import { createOkanaganHighway } from "../render/okanagan/okanagan_highway.js?v=361";
import { createOkanaganFireEffects } from "../render/okanagan/okanagan_fire_effects.js?v=361";
import { createOkanaganDropCurtain } from "../render/okanagan/okanagan_drop_curtain.js?v=361";
import { createOkanaganPracticeTarget } from "../render/okanagan/okanagan_practice_target.js?v=361";
import {
  createOkanaganTrafficCraft,
  poseOkanaganTrafficCraft,
} from "../render/okanagan/okanagan_traffic.js?v=361";
import { createFireBossCockpit } from "../render/okanagan/fireboss_cockpit.js?v=361";
import { createHud } from "../hud.js?v=361";
import {
  armFlightAudio,
  flightAudioDiagnostics,
  setFlightAudioEnabled,
  suspendFlightAudio,
  updateFlightAudio,
} from "../render/audio/flight_audio.js?v=361";
import {
  loadPlayerSettings,
  savePlayerSettings,
} from "../render/settings/player_settings.js?v=361";
import { standaloneNavigationHref } from "../render/shell/standalone_navigation.js?v=361";
import { standardGamepadState } from "../render/input/dual_stick_input.js?v=361";
import { mobileVirtualStickState } from "../render/input/mobile_virtual_stick.js?v=361";
import { createOkanaganKeyboardControls } from "../render/okanagan/okanagan_keyboard_controls.js?v=361";
import { bindOkanaganDropButton } from "../render/okanagan/okanagan_drop_button.js?v=361";
import {
  compactOkanaganCue,
  okanaganFlightState,
  okanaganRadioCaption,
  okanaganRadioHoldMs,
} from "../render/okanagan/okanagan_hud_adapter.js?v=361";
import {
  cycleOkanaganTarget,
  okanaganTargets,
  retainOkanaganTarget,
} from "../render/okanagan/okanagan_targets.js?v=361";
import {
  okanaganDebriefModel,
  okanaganMissionTerminal,
} from "../render/okanagan/okanagan_debrief.js?v=361";
import {
  okanaganDialogFocusables,
  okanaganDialogTabTarget,
} from "../render/okanagan/okanagan_dialog_focus.js?v=361";

import { okanaganNavigation, okanaganNavigationPlaces, drawOkanaganMap }
  from "../render/okanagan/okanagan_navigation.js?v=361";

const SORTIES = Object.freeze({
  "water-circuits": {
    index: 0,
    title: "Water Circuits",
    block: 610,
    working: "197 KG",
    objective: "Complete one water circuit.",
    execution: "Scoop · drop on the lake target · recover above RTB minimum",
  },
  "fire-attack": {
    index: 1,
    title: "Initial Attack",
    block: 760,
    working: "347 KG",
    objective: "Knock down the west-side flank.",
    execution: "See the column · hit the line · two loads · recover",
  },
  "large-force-employment": {
    index: 2,
    title: "Large Force Employment",
    block: 760,
    working: "347 KG",
    objective: "Hold, then fly the assigned west-flank drops.",
    execution: "Wait for Air Attack · hit Division Alpha · recover",
  },
  "peachland-defence": {index:3, title:"Peachland Defence", block:925, working:"—", objective:"Hold the hillside neighbourhood edge.", execution:"Homes above Beach Avenue · one load · hand off and recover"},
  "big-white-defence": {index:4, title:"Big White Defence", block:925, working:"—", objective:"Protect Happy Valley homes and lift terminals.", execution:"Climb over the lake · cross the ridge · work downhill"},
  "silver-star-defence": {index:5, title:"SilverStar Defence", block:925, working:"—", objective:"Protect the village and lift infrastructure.", execution:"Long ferry · watch the reserve · one downhill attack"},
  "apex-defence": {index:6, title:"Apex Defence", block:925, working:"—", objective:"Defend the village below the ski slopes.", execution:"South valley ferry · ridge clearance · protect the escape"},
});

/** localStorage access itself can throw in locked-down browsing; a sortie must still boot. */
function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const canvas = document.querySelector("#scene");
const preview = new URLSearchParams(location.search).get("preview");
const hudCanvas = document.querySelector("#hud");
const mapCanvas = document.querySelector("#map");
const map = mapCanvas.getContext("2d");
const mapPanel = document.querySelector("#nav-map");
const mapModeButton = document.querySelector("#map-mode");
const navigationPanel = document.querySelector("#navigation-director");
const navigationTurn = document.querySelector("#navigation-turn");
const navigationFix = document.querySelector("#navigation-fix");
const navigationBearing = document.querySelector("#navigation-bearing");
const navigationRange = document.querySelector("#navigation-range");
const navigationAltitude = document.querySelector("#navigation-altitude");
const navigationVertical = document.querySelector("#navigation-vertical");
const navigationProcedure = document.querySelector("#navigation-procedure");
let mapOverview = false;
let navigationPlaces = [];
let lastMapDraw = -Infinity;
const flightHud = createHud(hudCanvas);
const status = document.querySelector("#status");
const missionSurface = document.querySelector(".viewport");
const menu = document.querySelector("#sortie-menu");
const pauseMenu = document.querySelector("#pause-menu");
const missionResult = document.querySelector("#mission-result");
const missionResultPanel = missionResult.querySelector(".mission-result__panel");
const missionResultKicker = document.querySelector("#mission-result-kicker");
const missionResultTitle = document.querySelector("#mission-result-title");
const missionResultSummary = document.querySelector("#mission-result-summary");
const missionResultFacts = document.querySelector("#mission-result-facts");
const missionResultCorrection = document.querySelector("#mission-result-correction");
const missionResultCorrectionRow = missionResultCorrection.closest(".mission-result__correction");
const missionResultRestart = document.querySelector("#mission-result-restart");
const missionResultChoose = document.querySelector("#mission-result-choose");
const dispatchObjective = document.querySelector("#dispatch-objective");
const dispatchExecution = document.querySelector("#dispatch-execution");
const planMinimum = document.querySelector("#plan-minimum");
const pauseTitle = document.querySelector("#pause-title");
const startButton = document.querySelector("#start");
const pauseResume = document.querySelector("#resume");
const pauseButton = document.querySelector("#pause-button");
const targetButton = document.querySelector("#target-button");
const padlockButton = document.querySelector("#padlock-button");
const scoopsButton = document.querySelector("#scoops");
const dropButton = document.querySelector("#drop");
const navButton = document.querySelector("#nav-button");
const soundButton = document.querySelector("#sound");
const trimValue = document.querySelector("#trim-value");
const autoTrimButton = document.querySelector("#auto-trim");
const trimDownButton = document.querySelector("#trim-down");
const trimUpButton = document.querySelector("#trim-up");
const standaloneReturnLinks = Array.from(document.querySelectorAll(
  'a[href*="program=okanagan-fireboss"]',
));
for (const returnLink of standaloneReturnLinks) {
  returnLink.href = standaloneNavigationHref(
    returnLink.getAttribute("href"),
    window.location,
  );
}
const sortieButtons = Array.from(document.querySelectorAll(".sortie"));
const keys = new Set();
const keyboardControls = createOkanaganKeyboardControls();
let dropButtonControl = null;
const coarse = matchMedia?.("(pointer: coarse)")?.matches === true;
const touchPreview = ["localhost", "127.0.0.1"].includes(location.hostname)
  && new URL(location.href).searchParams.get("input") === "touch";
const touchInput = coarse || touchPreview;
document.body.dataset.input = touchInput ? "touch" : "desktop";
const constrained = (navigator.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4;
const quality = touchInput ? "mobile" : constrained ? "balanced" : "desktop";

let bridge;
let world;
let state;
let currentSortie = "water-circuits";
let running = false;
let paused = true;
let scoops = false;
let drop = false;
let throttle = 0.65;
let elevatorTrim = 0;
let animationFrame = 0;
let lastTime = performance.now();
const telemetryFrames = [];
let lastTelemetryMissionSecond = -Infinity;
let lastTelemetryPhase = "";
let gamepadState = Object.freeze({ connected: false, padlock: false });
let leftStick = Object.freeze({ x: 0, y: 0 });
let rightStick = Object.freeze({ x: 0, y: 0 });
let lastRadio = "";
let radioHideAt = 0;
let selectedTargetId = "";
let padlock = false;
let missionTerminal = false;
let missionResultModel = null;
let playerSettings = loadPlayerSettings(safeLocalStorage());
missionSurface.inert = true;

function syncSoundControl() {
  soundButton.textContent = `Sound ${playerSettings.audio ? "on" : "off"}`;
  soundButton.setAttribute("aria-pressed", String(playerSettings.audio));
}

function setOkanaganAudioEnabled(nextEnabled, { arm = false } = {}) {
  playerSettings = savePlayerSettings({
    ...playerSettings,
    audio: Boolean(nextEnabled),
  }, safeLocalStorage());
  setFlightAudioEnabled(playerSettings.audio);
  syncSoundControl();
  if (arm && playerSettings.audio && running) {
    armFlightAudio(state ? okanaganFlightState(state) : null);
  }
  return playerSettings.audio;
}

setFlightAudioEnabled(playerSettings.audio);
syncSoundControl();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "mobile", powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.07;
renderer.shadowMap.enabled = quality === "desktop";
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const geographicWorld = createOkanaganWorldRoot();
scene.add(geographicWorld);
const sceneryQueryPosition = new THREE.Vector3();
const siteMarkers = createOkanaganSiteMarkers(geographicWorld);
scene.background = new THREE.Color(0x7895aa);
scene.fog = new THREE.FogExp2(0x9eb2b7, quality === "mobile" ? 0.000095 : 0.00007);
const camera = new THREE.PerspectiveCamera(67, 1, 0.25, 65_000);
camera.rotation.order = "YXZ";
scene.add(camera);
const hudFrame = {
  state: null,
  camera,
  playerPosition: new THREE.Vector3(),
  playerForward: new THREE.Vector3(),
  banditPosition: new THREE.Vector3(),
  wingmanPosition: new THREE.Vector3(),
  padlock: false,
  padlockTarget: null,
  padlockTargetPosition: null,
  triggerHeld: false,
  civilianTargetPosition: new THREE.Vector3(),
  dt: 0,
  now: 0,
};
scene.add(new THREE.HemisphereLight(0xeaf3f5, 0x4d5135, 1.18));
const sun = new THREE.DirectionalLight(0xffe4bd, 1.42);
sun.position.set(-12_000, 18_000, -9_000);
sun.castShadow = quality === "desktop";
if (sun.castShadow) {
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6_000, right: 6_000, top: 6_000, bottom: -6_000, near: 500, far: 40_000 });
  sun.shadow.normalBias = 1.2;
}
scene.add(sun);

const sky = new THREE.Mesh(new THREE.SphereGeometry(58_000, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: { top: { value: new THREE.Color(0x3f6f94) }, horizon: { value: new THREE.Color(0xd2d0c3) } },
  vertexShader: "varying vec3 d; void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader: "uniform vec3 top;uniform vec3 horizon;varying vec3 d;void main(){gl_FragColor=vec4(mix(horizon,top,smoothstep(-.04,.72,d.y)),1.);}",
}));
scene.add(sky);
const cockpit = createFireBossCockpit(camera);
const highway = createOkanaganHighway(geographicWorld);
const fireEffects = createOkanaganFireEffects(geographicWorld, quality === "mobile" ? 80 : 180);
const trafficGroup = new THREE.Group();
const trafficModels = new Map();
geographicWorld.add(trafficGroup);
const dropCurtain = createOkanaganDropCurtain(geographicWorld);
const practiceTarget = createOkanaganPracticeTarget(geographicWorld);

window.__gunsOnlyOkanagan = Object.freeze({
  getState: () => state,
  getQuality: () => quality,
  getRenderInfo: () => renderer.info,
  getSceneryDiagnostics: () => world?.diagnostics?.() ?? null,
  getTelemetry: () => telemetryFrames.map((frame) => ({ ...frame })),
  getLastTelemetry: () => telemetryFrames.at(-1) ?? null,
  getAudioDiagnostics: () => flightAudioDiagnostics(),
  getSelectedTarget: () => selectedTarget(),
  getDebrief: () => missionResultModel,
  getGuidance: () => ({
    navigation: okanaganNavigation(state),
    mapVisible: !mapPanel.hidden,
    mapOverview,
    visible: highway.group.visible === true,
    marks: highway.group.children.filter((child) => child.visible).map((child) => ({
      style: child.userData.guidanceStyle ?? null,
      x: child.position.x,
      y: child.position.y,
      z: child.position.z,
    })),
  }),
  start: (sortie = currentSortie) => startSortie(sortie),
});

function buildTraffic(tracks = [], timeSeconds = 0) {
  const live = new Set();
  for (const track of tracks) {
    live.add(track.callsign);
    let craft = trafficModels.get(track.callsign);
    if (!craft) {
      craft = createOkanaganTrafficCraft(track.kind);
      trafficModels.set(track.callsign, craft);
      trafficGroup.add(craft);
    }
    poseOkanaganTrafficCraft(craft, track, timeSeconds);
  }
  for (const [callsign, craft] of trafficModels) {
    if (live.has(callsign)) continue;
    trafficModels.delete(callsign);
    craft.traverse((object) => { object.geometry?.dispose?.(); object.material?.dispose?.(); });
    craft.removeFromParent();
  }
}

function selectSortie(id) {
  if (!SORTIES[id]) return;
  currentSortie = id;
  sortieButtons.forEach((button) => {
    const selected = button.dataset.sortie === id;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  startButton.textContent = "Start";
  startButton.setAttribute("aria-label", `Start ${SORTIES[id].title}`);
  document.querySelector("#plan-working").textContent = SORTIES[id].working;
  document.querySelector("#plan-block").textContent = `${SORTIES[id].block} KG`;
  publishSortiePlanPreview(id);
  dispatchObjective.textContent = SORTIES[id].objective;
  dispatchExecution.textContent = SORTIES[id].execution;
  pauseTitle.textContent = SORTIES[id].title;
}

function publishSortiePlanPreview(id) {
  if (!bridge || !SORTIES[id]) {
    planMinimum.textContent = "—";
    return false;
  }
  try {
    const preview = JSON.parse(bridge.PreviewPlan(SORTIES[id].index));
    const minimumRtbKg = Number(preview?.fuel_plan?.minimum_rtb_kg);
    if (!Number.isFinite(minimumRtbKg) || minimumRtbKg <= 0) throw new Error("invalid RTB minimum");
    planMinimum.textContent = `${Math.round(minimumRtbKg)} KG`;
    const workingKg = Number(preview?.fuel_plan?.working_kg);
    document.querySelector("#plan-working").textContent = Number.isFinite(workingKg)
      ? `${Math.round(workingKg)} KG` : "—";
    return true;
  } catch (error) {
    console.warn("Fire Boss plan preview unavailable", error);
    planMinimum.textContent = "—";
    return false;
  }
}

function moveSortieSelection(event) {
  if (!sortieButtons.includes(event.target)) return false;
  const commands = new Map([
    ["ArrowLeft", -1], ["ArrowUp", -1], ["ArrowRight", 1], ["ArrowDown", 1],
    ["Home", "first"], ["End", "last"],
  ]);
  const command = commands.get(event.code);
  if (command == null) return false;
  event.preventDefault();
  event.stopPropagation();
  const currentIndex = Math.max(0, sortieButtons.indexOf(event.target));
  const nextIndex = command === "first"
    ? 0
    : command === "last"
      ? sortieButtons.length - 1
      : (currentIndex + command + sortieButtons.length) % sortieButtons.length;
  const next = sortieButtons[nextIndex];
  selectSortie(next.dataset.sortie);
  next.focus({ preventScroll: true });
  return true;
}

function releasePlayerInputs() {
  keys.clear();
  keyboardControls.clear();
  dropButtonControl?.release();
  bridge?.ReleaseFlightControls();
  if (bridge && state) state = JSON.parse(bridge.GetState());
  drop = false;
  leftStick = Object.freeze({ x: 0, y: 0 });
  rightStick = Object.freeze({ x: 0, y: 0 });
  dropButton.classList.remove("active");
}

function syncTrimControl() {
  const assist = state?.auto_trim;
  const actualTrim = Number.isFinite(assist?.applied_trim) ? assist.applied_trim
    : Number.isFinite(state?.elevator_trim) ? state.elevator_trim : elevatorTrim;
  const automatic = assist?.enabled ?? true;
  const percent = Math.round(actualTrim * 100);
  trimValue.textContent = `${percent > 0 ? "+" : ""}${percent}%`;
  autoTrimButton.textContent = !automatic ? "MANUAL" : assist?.saturated ? "AUTO LIMIT"
    : assist?.status === "low-speed" ? "AUTO SLOW"
    : assist?.status === "attitude" ? "AUTO WAIT"
    : assist?.status === "surface" || assist?.status === "waiting" ? "AUTO READY" : "AUTO TRIM";
  autoTrimButton.setAttribute("aria-pressed", String(automatic));
  const status = !automatic ? "Manual pitch trim" : assist?.saturated ? "Automatic trim at limit"
    : assist?.status === "active" ? "Automatic trim holding nose attitude"
    : assist?.status === "pilot" ? "Automatic trim waiting for stick release"
    : assist?.status === "low-speed" ? "Automatic trim paused at low speed"
    : assist?.status === "attitude" ? "Automatic trim paused during steep manoeuvre"
    : "Automatic trim ready after takeoff";
  autoTrimButton.setAttribute("aria-label", `${status}. Toggle automatic trim.`);
  autoTrimButton.title = status;
  autoTrimButton.dataset.status = assist?.saturated ? "limit" : assist?.status ?? "waiting";
  trimDownButton.disabled = actualTrim <= -0.5;
  trimUpButton.disabled = actualTrim >= 0.5;
}

function changeElevatorTrim(step) {
  if (!bridge || !running || paused || missionTerminal) return;
  const actual = Number.isFinite(state?.auto_trim?.applied_trim) ? state.auto_trim.applied_trim : elevatorTrim;
  elevatorTrim = Math.max(-0.5, Math.min(0.5, Math.round((actual + step) * 100) / 100));
  bridge.SetElevatorTrim(elevatorTrim);
  state = JSON.parse(bridge.GetState());
  syncTrimControl();
  canvas.focus({ preventScroll: true });
}

function setMissionSurfaceInert(inert) {
  missionSurface.inert = inert === true;
}

function activeMissionDialog() {
  if (missionResult.classList.contains("visible")) return missionResult;
  if (pauseMenu.classList.contains("visible")) return pauseMenu;
  if (menu.classList.contains("visible")) return menu;
  return null;
}

function trapDialogTab(event) {
  const dialog = activeMissionDialog();
  if (!dialog) return false;
  const focusable = okanaganDialogFocusables(dialog.querySelectorAll(
    'button:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])',
  ));
  if (focusable.length === 0) return false;
  const next = okanaganDialogTabTarget(focusable, document.activeElement, event.shiftKey);
  if (next) {
    event.preventDefault();
    next.focus({ preventScroll: true });
  }
  return true;
}

function hideMissionResult() {
  missionTerminal = false;
  missionResultModel = null;
  missionResult.classList.remove("visible");
  missionResult.setAttribute("aria-hidden", "true");
}

function renderMissionResultFacts(facts) {
  missionResultFacts.replaceChildren(...facts.map((item) => {
    const row = document.createElement("div");
    row.className = "mission-result__fact";
    row.dataset.fact = item.id;
    row.dataset.tone = item.tone;
    const term = document.createElement("dt");
    term.textContent = item.label;
    const detail = document.createElement("dd");
    detail.textContent = item.value;
    row.append(term, detail);
    return row;
  }));
}

function showMissionResult(current) {
  const model = okanaganDebriefModel(current);
  if (!model || missionTerminal) return false;
  missionTerminal = true;
  const sites = current.sites ?? [];
  const reached = sites.filter(s => s.protected_by_drop === true).length;
  const condition = sites.length ? ` · ${sites.filter(s => s.status === "intact").length} intact / ${sites.filter(s => s.status === "damaged").length} damaged / ${sites.filter(s => s.status === "lost").length} lost · ${reached} reached by drop` : "";
  pilotLogbook.finish({ outcome: model.title + condition, correction: model.correction,
    durationSeconds: current.mission_s, effectiveDrops: current.effective_drops,
    waterKg: current.effective_water_kg, cycles: current.completed_cycles });
  missionResultModel = model;
  paused = true;
  running = false;
  releasePlayerInputs();
  pauseMenu.classList.remove("visible");
  pauseMenu.setAttribute("aria-hidden", "true");
  menu.classList.remove("visible");
  menu.setAttribute("aria-hidden", "true");
  missionResultPanel.dataset.outcome = model.outcome;
  missionResultKicker.textContent = model.kicker;
  missionResultTitle.textContent = model.title;
  missionResultSummary.textContent = model.summary;
  missionResultSummary.hidden = !model.summary;
  renderMissionResultFacts(model.facts);
  missionResultCorrection.textContent = model.correction;
  missionResultCorrectionRow.hidden = !model.correction;
  missionResult.setAttribute("aria-describedby", [
    model.summary ? "mission-result-summary" : null,
    model.facts.length > 0 ? "mission-result-facts" : null,
    model.correction ? "mission-result-correction" : null,
  ].filter(Boolean).join(" "));
  missionResult.classList.add("visible");
  missionResult.setAttribute("aria-hidden", "false");
  setMissionSurfaceInert(true);
  document.body.classList.add("paused");
  status.textContent = model.failed ? "Sortie failed" : "Sortie complete";
  suspendFlightAudio("okanagan-result");
  queueMicrotask(() => missionResultRestart.focus({ preventScroll: true }));
  return true;
}

function openSortieMenu() {
  if (running && !missionTerminal && !paused) bridge?.SetPaused(true);
  paused = true;
  running = false;
  releasePlayerInputs();
  hideMissionResult();
  pauseMenu.classList.remove("visible");
  pauseMenu.setAttribute("aria-hidden", "true");
  menu.classList.add("visible");
  menu.setAttribute("aria-hidden", "false");
  setMissionSurfaceInert(true);
  document.body.classList.add("paused");
  status.textContent = "Ready · choose a sortie";
  suspendFlightAudio("okanagan-dispatch");
  queueMicrotask(() => document.querySelector(`.sortie[data-sortie="${currentSortie}"]`)?.focus({ preventScroll: true }));
}

function startSortie(id) {
  selectSortie(id);
  if (!bridge) return false;
  hideMissionResult();
  releasePlayerInputs();
  menu.classList.remove("visible");
  menu.setAttribute("aria-hidden", "true");
  setMissionSurfaceInert(false);
  pilotLogbook.finish({ outcome: "Left before completion" });
  bridge.Start(SORTIES[id].index);
  pilotLogbook.begin({ activity: `Okanagan · ${SORTIES[id].title || id}` });
  state = JSON.parse(bridge.GetState());
  throttle = 0.65;
  elevatorTrim = 0;
  syncTrimControl();
  scoops = false;
  drop = false;
  selectedTargetId = "";
  padlock = false;
  running = true;
  telemetryFrames.length = 0;
  lastTelemetryMissionSecond = -Infinity;
  lastTelemetryPhase = "";
  setPaused(false);
  planMinimum.textContent = `${Math.round(state.fuel_plan.minimum_rtb_kg)} KG`;
  status.textContent = "Flying";
  if (playerSettings.audio) armFlightAudio(okanaganFlightState(state));
  canvas.focus();
  return true;
}

function setPaused(value) {
  if (missionTerminal) return false;
  paused = value === true;
  if (paused) releasePlayerInputs();
  if (running && bridge) {
    bridge.SetPaused(paused);
    state = JSON.parse(bridge.GetState());
  }
  const pauseVisible = paused && running && !menu.classList.contains("visible");
  pauseMenu.classList.toggle("visible", pauseVisible);
  pauseMenu.setAttribute("aria-hidden", String(!pauseVisible));
  document.body.classList.toggle("paused", paused);
  setMissionSurfaceInert(paused);
  if (value) suspendFlightAudio("okanagan-paused");
  if (pauseVisible) queueMicrotask(() => pauseResume?.focus({ preventScroll: true }));
  else if (!paused && running) {
    if (playerSettings.audio) armFlightAudio(okanaganFlightState(state));
    canvas.focus({ preventScroll: true });
  }
  return true;
}

function controls(deltaSeconds) {
  const gamepad = Array.from(navigator.getGamepads?.() ?? []).find((pad) => pad?.connected && pad.mapping === "standard") ?? null;
  const nextGamepad = standardGamepadState(gamepad, gamepadState);
  if (nextGamepad.padlockPressed) togglePadlock();
  gamepadState = nextGamepad;
  const pitch = THREE.MathUtils.clamp(
    (keys.has("ArrowDown") ? 1 : 0) - (keys.has("ArrowUp") ? 1 : 0)
      + finiteControl(nextGamepad.pitch) + finiteControl(rightStick.y), -1, 1);
  const roll = THREE.MathUtils.clamp(
    (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0)
      + finiteControl(nextGamepad.roll) + finiteControl(rightStick.x), -1, 1);
  const yaw = THREE.MathUtils.clamp(
    (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0)
      + finiteControl(leftStick.x), -1, 1);
  const throttleRate = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0)
    + (nextGamepad.throttleUp ? 1 : 0) - (nextGamepad.throttleDown ? 1 : 0)
    - finiteControl(leftStick.y);
  throttle = THREE.MathUtils.clamp(throttle + throttleRate * deltaSeconds * 0.35, 0, 1);
  bridge.SetControls(pitch, roll, yaw, throttle, scoops, drop);
}

function finiteControl(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function selectedTarget() {
  const targets = okanaganTargets(state);
  const target = retainOkanaganTarget(targets, selectedTargetId);
  selectedTargetId = target?.id ?? "";
  return target;
}

function cycleTarget(direction = 1) {
  const target = cycleOkanaganTarget(okanaganTargets(state), selectedTargetId, direction);
  selectedTargetId = target?.id ?? "";
  return target;
}

function togglePadlock() {
  if (!running || paused) return false;
  const target = selectedTarget();
  if (!target) return false;
  padlock = !padlock;
  return padlock;
}

function previewCamera(current) {
  if (preview === "incident") {
    const cells = current.fire_cells ?? [];
    let x = 0;
    let y = 0;
    let z = 0;
    let weight = 0;
    for (const cell of cells) {
      const intensity = Number(cell?.intensity) || 0;
      if (intensity < 0.08) continue;
      x += cell.x * intensity;
      y += cell.y * intensity;
      z += cell.z * intensity;
      weight += intensity;
    }
    if (weight < 0.1) return false;
    x /= weight;
    y /= weight;
    z /= weight;
    // The diagnostic view is offset uphill from the fire centroid. Using the fire's
    // elevation here put this camera underground and made correctly seated trees float.
    const viewX = x + 620, viewZ = z + 1_050;
    const viewY = Math.max(y + 95, (world?.sampleHeight(viewX, viewZ) ?? y) + 80);
    okanaganWorldToRender({x: viewX, y: viewY, z: viewZ}, camera.position);
    lookAtOkanaganPoint(camera, {x, y: Math.max(y + 28, (world?.sampleHeight(x, z) ?? y) + 15), z});
    return true;
  }
  if (preview === "practice" && current.drop_aim) {
    const aim = current.drop_aim;
    okanaganWorldToRender({x: aim.x + 180, y: aim.y + 55, z: aim.z + 220}, camera.position);
    lookAtOkanaganPoint(camera, {x: aim.x, y: aim.y + 8, z: aim.z});
    return true;
  }
  if (preview === "traffic") {
    const track = (current.traffic ?? []).find((item) => item.kind === "HELICOPTER")
      ?? current.traffic?.[0];
    if (!track?.position) return false;
    const cells = current.fire_cells ?? [];
    let x = 0;
    let y = 0;
    let z = 0;
    let weight = 0;
    for (const cell of cells) {
      const intensity = Number(cell?.intensity) || 0;
      if (intensity < 0.08) continue;
      x += cell.x * intensity;
      y += cell.y * intensity;
      z += cell.z * intensity;
      weight += intensity;
    }
    if (weight < 0.1) {
      okanaganWorldToRender({x: track.position.x - 220, y: track.position.y + 48,
        z: track.position.z + 160}, camera.position);
    } else {
      x /= weight;
      y /= weight;
      z /= weight;
      okanaganWorldToRender({x: x + 1_350, y: y + 180, z: z + 420}, camera.position);
    }
    lookAtOkanaganPoint(camera, {...track.position, y: track.position.y + 4});
    return true;
  }
  return false;
}

function updateView(current, deltaSeconds) {
  if (!previewCamera(current)) {
    setOkanaganCockpitCamera(camera, current);
    const bodyQuaternion = camera.quaternion.clone();
    const target = selectedTarget();
    if (padlock && target) {
      lookAtOkanaganPoint(camera, target.position);
      cockpit.group.quaternion.copy(camera.quaternion).invert().multiply(bodyQuaternion);
    } else {
      cockpit.group.quaternion.identity();
    }
  }
  camera.updateMatrixWorld(true);
  sky.position.copy(camera.position);
  cockpit.update(current.mission_s, current.throttle);
  highway.update(current.route, current.active_gate, current.position);
  fireEffects.group.visible = current.sortie !== "water-circuits";
  fireEffects.update(current.fire_cells, current.mission_s, undefined, {
    kg: current.drop_credit_kg,
    x: current.drop_credit?.x ?? current.position?.x,
    y: current.drop_credit?.y ?? current.position?.y,
    z: current.drop_credit?.z ?? current.position?.z,
    dtSeconds: deltaSeconds,
  });
  practiceTarget.update(current.drop_aim, current.sortie === "water-circuits");
  const surfaceY = world
    ? world.sampleHeight(current.position.x, current.position.z)
    : Number(current.drop_aim?.y) || 342;
  dropCurtain.update(
    current,
    current.water_released_this_tick_kg > 0,
    deltaSeconds,
    surfaceY,
  );
  buildTraffic(current.traffic, current.mission_s);
  if (sun.castShadow) {
    okanaganWorldToRender({x: current.position.x - 12_000,
      y: current.position.y + 18_000, z: current.position.z + 9_000}, sun.position);
    okanaganWorldToRender({x: current.position.x, y: 500, z: current.position.z}, sun.target.position);
    sun.target.updateMatrixWorld();
  }
}

function updateDom(current) {
  siteMarkers.update(current.sites ?? []);
  const sites = current.sites ?? [];
  const condition = document.querySelector("#site-condition");
  condition.hidden = sites.length === 0;
  const lost = sites.filter(s => s.status === "lost").length;
  const damaged = sites.filter(s => s.status === "damaged").length;
  const threatened = sites.filter(s => s.threat > .08 && s.status !== "lost").length;
  const reached = sites.filter(s => s.protected_by_drop === true).length;
  condition.textContent = sites.length
    ? `${sites.length-lost-damaged} INTACT · ${damaged} DAMAGED · ${lost} LOST · ${threatened} AT RISK${reached ? ` · ${reached} WET` : ""}`
    : "";
  const now = performance.now();
  document.querySelector("#cue").textContent = compactOkanaganCue(current);
  const radio = document.querySelector("#radio");
  const transmission = okanaganRadioCaption(current.radio);
  if (transmission && transmission !== lastRadio) {
    lastRadio = transmission;
    radio.textContent = transmission;
    radioHideAt = now + okanaganRadioHoldMs(transmission);
  }
  radio.dataset.visible = String(Boolean(transmission) && now < radioHideAt);
  const waterTarget = Number(current.scoop_target_water_kg);
  document.querySelector("#water-value").textContent = Number.isFinite(waterTarget) && waterTarget > 0
    ? `${Math.round(current.water_kg).toLocaleString()} / ${Math.round(waterTarget).toLocaleString()} L target`
    : `${Math.round(current.water_kg).toLocaleString()} L`;
  const scoopState = document.querySelector("#scoop-state");
  scoopState.textContent = current.scoop_fault || (current.scoop_valid
    ? `FILLING · ${Math.round(current.scoop_rate_kgps)} L/S`
    : current.scoops_commanded ? "SCOOPS DOWN" : "SCOOPS UP");
  scoopState.dataset.level = current.scoop_fault ? "caution" : "normal";
  scoopsButton.setAttribute("aria-pressed", String(current.scoops_commanded));
  padlockButton.setAttribute("aria-pressed", String(padlock));
  syncSoundControl();
  syncTrimControl();
  const nav = okanaganNavigation(current);
  const procedure = compactOkanaganCue(current);
  navigationPanel.hidden = !nav && !procedure;
  navigationPanel.dataset.waypoint = String(Boolean(nav));
  navigationProcedure.textContent = procedure;
  navigationProcedure.hidden = Boolean(nav && (procedure === nav.label || procedure === `FLY ${nav.label}`));
  if (nav) {
    navigationPanel.dataset.direction = nav.direction;
    navigationTurn.textContent = nav.turn;
    navigationFix.textContent = nav.label;
    navigationBearing.textContent = nav.bearingText;
    navigationRange.textContent = nav.rangeText;
    navigationAltitude.textContent = nav.altitudeText;
    navigationVertical.textContent = nav.verticalText;
  }
}

function recordTelemetry(current, inputDeltaSeconds) {
  const phaseChanged = current.phase !== lastTelemetryPhase;
  if (!phaseChanged && current.mission_s - lastTelemetryMissionSecond < 0.25) return;
  const gate = current.route?.[current.active_gate] ?? current.route?.at(-1) ?? null;
  const gateDx = gate ? gate.position.x - current.position.x : 0;
  const gateDy = gate ? gate.position.y - current.position.y : 0;
  const gateDz = gate ? gate.position.z - current.position.z : 0;
  telemetryFrames.push(Object.freeze({
    mission_s: current.mission_s,
    sortie: current.sortie,
    phase: current.phase,
    surface: current.surface,
    flyable: current.flyable,
    position: { ...current.position },
    tas_kt: current.tas_mps * 1.94384,
    altitude_ft: current.position.y * 3.28084,
    vertical_speed_fpm: current.vertical_speed_mps * 196.85,
    heading_deg: (current.heading_rad * 180 / Math.PI + 360) % 360,
    pitch_deg: current.pitch_rad * 180 / Math.PI,
    roll_deg: current.roll_rad * 180 / Math.PI,
    aoa_deg: current.aoa_rad * 180 / Math.PI,
    pitch_rate_dps: current.pitch_rate_radps * 180 / Math.PI,
    roll_rate_dps: current.roll_rate_radps * 180 / Math.PI,
    load_factor: current.load_factor,
    engine_power_fraction: current.engine_power_fraction,
    throttle: current.throttle,
    elevator_trim: current.elevator_trim,
    auto_trim: current.auto_trim,
    applied_controls: current.applied_controls,
    pending_controls: current.pending_controls,
    input_tap_ticks: current.input_tap_ticks,
    scoops_commanded: current.scoops_commanded,
    scoop_valid: current.scoop_valid,
    scoop_fault: current.scoop_fault,
    water_kg: current.water_kg,
    scoop_target_water_kg: current.scoop_target_water_kg,
    drop_target_water_kg: current.drop_target_water_kg,
    water_released_this_tick_kg: current.water_released_this_tick_kg,
    fuel_kg: current.fuel_kg,
    fuel_above_minimum_kg: current.fuel_plan.above_minimum_kg,
    active_gate: gate?.id ?? null,
    selected_target: selectedTargetId || null,
    padlock,
    gate_range_m: gate ? Math.hypot(gateDx, gateDy, gateDz) : null,
    gate_altitude_error_m: gate ? gateDy : null,
    terrain_clearance_m: world ? current.position.y - world.sampleHeight(current.position.x, current.position.z) : null,
    input: {
      pitch: THREE.MathUtils.clamp((keys.has("ArrowDown") ? 1 : 0) - (keys.has("ArrowUp") ? 1 : 0)
        + finiteControl(gamepadState.pitch) + finiteControl(rightStick.y), -1, 1),
      roll: THREE.MathUtils.clamp((keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0)
        + finiteControl(gamepadState.roll) + finiteControl(rightStick.x), -1, 1),
      yaw: THREE.MathUtils.clamp((keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0)
        + finiteControl(leftStick.x), -1, 1),
      throttle,
      elevator_trim: elevatorTrim,
      scoops,
      drop,
      frame_dt_s: inputDeltaSeconds,
    },
  }));
  if (telemetryFrames.length > 1_200) telemetryFrames.splice(0, telemetryFrames.length - 1_200);
  lastTelemetryMissionSecond = current.mission_s;
  lastTelemetryPhase = current.phase;
}

function drawHud(current, deltaSeconds, nowSeconds) {
  const target = selectedTarget();
  const flightState = okanaganFlightState(current);
  // The navigation director presents the procedure beside bearing/range/altitude.
  flightState.fireboss_cue = "";
  flightState.civilian_target_horizontal_inset_px = 95;
  flightState.civilian_target_label = target?.label ?? "";
  flightState.civilian_target_kind = target?.kind ?? "";
  flightState.civilian_target_padlocked = padlock && Boolean(target);
  hudFrame.state = flightState;
  okanaganWorldToRender(current.position, hudFrame.playerPosition);
  okanaganWorldToRender({x: Math.sin(current.heading_rad) * Math.cos(current.pitch_rad),
    y: Math.sin(current.pitch_rad), z: Math.cos(current.heading_rad) * Math.cos(current.pitch_rad)},
  hudFrame.playerForward);
  if (target) okanaganWorldToRender(target.position, hudFrame.civilianTargetPosition);
  hudFrame.padlock = padlock && Boolean(target);
  hudFrame.padlockTarget = hudFrame.padlock ? "civilian" : null;
  hudFrame.padlockTargetPosition = hudFrame.padlock ? hudFrame.civilianTargetPosition : null;
  hudFrame.dt = deltaSeconds;
  hudFrame.now = nowSeconds;
  flightHud.draw(hudFrame);
  updateFlightAudio(flightState, { muted: paused, nowSeconds });
}

function drawMap(current, force = false) {
  if (mapCanvas.hidden || !world) return;
  const now = performance.now();
  if (!force && now - lastMapDraw < 100) return;
  lastMapDraw = now;
  const rect = mapCanvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(rect.width), height = Math.round(rect.height);
  if (!width || !height) return;
  if (mapCanvas.width !== Math.round(width * ratio) || mapCanvas.height !== Math.round(height * ratio)) {
    mapCanvas.width = Math.round(width * ratio); mapCanvas.height = Math.round(height * ratio);
  }
  map.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawOkanaganMap(map, current, world.worldData, navigationPlaces, width, height, mapOverview);
}

function resize() {
  const pixelRatio = Math.min(devicePixelRatio, quality === "mobile" ? 1.25 : 1.75);
  renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  flightHud.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2), {
    top: 0, right: 0, bottom: 0, left: 0,
  });
  flightHud.setTouchMode(touchInput);
  flightHud.setPresentationProfile(touchInput ? "touch_dual_stick" : "civilian");
  flightHud.setLegendVisible(false);
}

function animate(now) {
  animationFrame = requestAnimationFrame(animate);
  const delta = Math.min(0.1, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
  if (running && !paused) {
    controls(delta);
    keyboardControls.applied(bridge.Advance(delta));
    state = JSON.parse(bridge.GetState());
    recordTelemetry(state, delta);
    updateView(state, delta); updateDom(state); drawHud(state, delta, state.mission_s);
    if (!mapCanvas.hidden) drawMap(state);
    if (okanaganMissionTerminal(state)) showMissionResult(state);
  }
  world?.update(okanaganRenderToWorld(camera.position, sceneryQueryPosition));
  renderer.render(scene, camera);
}

sortieButtons.forEach((button) => button.addEventListener("click", () => selectSortie(button.dataset.sortie)));
menu.addEventListener("keydown", moveSortieSelection);
startButton.addEventListener("click", () => startSortie(currentSortie));
pauseResume.addEventListener("click", () => setPaused(false));
document.querySelector("#restart").addEventListener("click", () => startSortie(currentSortie));
document.querySelector("#choose-sortie").addEventListener("click", openSortieMenu);
missionResultRestart.addEventListener("click", () => startSortie(currentSortie));
missionResultChoose.addEventListener("click", openSortieMenu);
pauseButton.addEventListener("click", () => running && !missionTerminal && setPaused(!paused));
targetButton.addEventListener("click", () => { if (running && !paused) cycleTarget(1); });
padlockButton.addEventListener("click", () => togglePadlock());
scoopsButton.addEventListener("click", () => { scoops = !scoops; scoopsButton.setAttribute("aria-pressed", String(scoops)); });
navButton.addEventListener("click", () => {
  mapCanvas.hidden = !mapCanvas.hidden;
  mapPanel.hidden = mapCanvas.hidden;
  document.body.classList.toggle("nav-open", !mapCanvas.hidden);
  navButton.setAttribute("aria-pressed", String(!mapCanvas.hidden));
  if (!mapCanvas.hidden && state) drawMap(state, true);
});
mapModeButton.addEventListener("click", () => {
  mapOverview = !mapOverview;
  mapModeButton.textContent = mapOverview ? "ROUTE" : "LOCAL";
  mapModeButton.setAttribute("aria-pressed", String(mapOverview));
  if (state) drawMap(state, true);
});
soundButton.addEventListener("click", () => {
  setOkanaganAudioEnabled(!playerSettings.audio, { arm: true });
});
autoTrimButton.addEventListener("click", () => {
  if (!bridge || !running || paused || missionTerminal) return;
  bridge.SetAutoTrimEnabled(!(state?.auto_trim?.enabled ?? true));
  state = JSON.parse(bridge.GetState());
  elevatorTrim = state.auto_trim.manual_trim;
  syncTrimControl();
  canvas.focus({ preventScroll: true });
});
trimDownButton.addEventListener("click", () => changeElevatorTrim(-0.02));
trimUpButton.addEventListener("click", () => changeElevatorTrim(0.02));
dropButtonControl = bindOkanaganDropButton(dropButton, {
  canPress: () => running && !paused && !missionTerminal,
  onChange(pressed) {
    drop = pressed;
    dropButton.classList.toggle("active", pressed);
  },
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Tab" && trapDialogTab(event)) return;
  if (event.code === "Escape") {
    if (missionTerminal) return;
    if (running) {
      event.preventDefault();
      setPaused(!paused);
    }
    return;
  }
  if (event.code === "KeyR" && !event.repeat && (running || missionTerminal)) {
    startSortie(currentSortie);
    return;
  }
  if (missionTerminal || !running || paused) return;
  if (event.code === "BracketLeft" || event.code === "BracketRight") {
    event.preventDefault();
    if (!event.repeat) changeElevatorTrim(event.code === "BracketLeft" ? -0.02 : 0.02);
    return;
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(event.code)) event.preventDefault();
  if (event.code === "Tab" && !event.repeat && running) { cycleTarget(event.shiftKey ? -1 : 1); return; }
  if (event.code === "KeyV" && !event.repeat) { togglePadlock(); return; }
  if (event.code === "KeyM" && !event.repeat) {
    setOkanaganAudioEnabled(!playerSettings.audio, { arm: true });
    return;
  }
  if (event.code === "KeyE" && !event.repeat) { scoops = !scoops; scoopsButton.setAttribute("aria-pressed", String(scoops)); }
  if (event.code === "Space") { drop = true; dropButton.classList.add("active"); }
  if (playerSettings.audio && running && !paused) armFlightAudio(okanaganFlightState(state));
  keys.add(event.code);
  keyboardControls.down(event.code, performance.now());
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  const tap = keyboardControls.up(event.code, performance.now());
  if (tap && bridge && running && !paused && !missionTerminal)
    bridge.QueueControlTap(tap.axis, tap.direction, tap.durationSeconds);
  if (event.code === "Space") { drop = false; dropButton.classList.remove("active"); }
});
window.addEventListener("blur", releasePlayerInputs);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releasePlayerInputs();
});
window.addEventListener("resize", resize, { passive: true });
window.addEventListener("pagehide", () => { releasePlayerInputs(); cancelAnimationFrame(animationFrame); suspendFlightAudio("okanagan-pagehide"); world?.dispose(); siteMarkers.dispose();
  renderer.dispose(); }, { once: true });

function bindFlightStick(element, update) {
  let pointerId = null;
  let previous = {};
  const render = (value) => {
    element.style.setProperty("--stick-x", `${value.x * 30}px`);
    element.style.setProperty("--stick-y", `${value.y * 30}px`);
    element.dataset.active = String(Math.hypot(value.x, value.y) > 0.01);
  };
  const move = (event) => {
    if (event.pointerId !== pointerId) return;
    const value = mobileVirtualStickState(event, element.getBoundingClientRect(), previous);
    previous = value; update(value); render(value);
  };
  const release = (event) => {
    if (pointerId === null || (event && event.pointerId !== pointerId)) return;
    try { element.releasePointerCapture(pointerId); } catch {}
    pointerId = null; previous = {}; const neutral = { x: 0, y: 0 }; update(neutral); render(neutral);
  };
  element.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pointerId = event.pointerId;
    element.setPointerCapture(pointerId);
    if (playerSettings.audio) armFlightAudio(state ? okanaganFlightState(state) : null);
    move(event);
  });
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("lostpointercapture", release);
}

bindFlightStick(document.querySelector("#left-stick"), (value) => { leftStick = value; });
bindFlightStick(document.querySelector("#right-stick"), (value) => { rightStick = value; });

async function boot() {
  resize();
  const [terrainData, worldData, resortData] = await Promise.all([
    fetch("/content/packs/okanagan-fire/environment/okanagan-central.cdem.json").then((response) => response.json()),
    fetch("/content/packs/okanagan-fire/environment/okanagan-central.world.json").then((response) => response.json()),
    fetch("/content/packs/okanagan-fire/environment/okanagan-resorts.osm.json").then((response) => response.json()),
  ]);
  worldData.resorts = resortData.resorts;
  navigationPlaces = okanaganNavigationPlaces(worldData);
  const sceneryTextures = await loadOkanaganSceneryTextures(terrainData, quality);
  world = createOkanaganWorld(geographicWorld, terrainData, worldData, quality, sceneryTextures);
  const blazor = await waitFor(() => globalThis.Blazor, "Fire Boss runtime unavailable");
  await blazor.start({ loadBootResource: (_type, name) => `/_framework/${name}` });
  const runtimeAccessor = await waitFor(() => globalThis.getDotnetRuntime, "Fire Boss bridge unavailable");
  const { getAssemblyExports } = await runtimeAccessor(0);
  const assemblyExports = await getAssemblyExports("GunsOnly.Web");
  bridge = assemblyExports.GunsOnly.Web.OkanaganWebBridge;
  status.textContent = "Ready · choose a sortie";
  status.dataset.ready = "true";
  const requested = new URLSearchParams(location.search).get("sortie");
  selectSortie(SORTIES[requested] ? requested : currentSortie);
  queueMicrotask(() => document.querySelector(`.sortie[data-sortie="${currentSortie}"]`)?.focus({ preventScroll: true }));
  lastTime = performance.now(); animationFrame = requestAnimationFrame(animate);
}

function waitFor(read, message) {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + 20_000;
    const poll = () => { const value = read(); if (value) resolve(value); else if (performance.now() >= deadline) reject(new Error(message)); else setTimeout(poll, 25); };
    poll();
  });
}

boot().catch((error) => { console.error(error); status.textContent = error instanceof Error ? error.message : String(error); });
