import * as THREE from "../vendor/three.module.js";
import { createOkanaganWorld } from "../render/okanagan/okanagan_world.js?v=351";
import { createOkanaganHighway } from "../render/okanagan/okanagan_highway.js?v=351";
import { createOkanaganFireEffects } from "../render/okanagan/okanagan_fire_effects.js?v=351";
import { createFireBossCockpit } from "../render/okanagan/fireboss_cockpit.js?v=351";
import { createHud } from "../hud.js?v=351";
import {
  armFlightAudio,
  flightAudioDiagnostics,
  setFlightAudioEnabled,
  suspendFlightAudio,
  updateFlightAudio,
} from "../render/audio/flight_audio.js?v=351";
import {
  loadPlayerSettings,
  savePlayerSettings,
} from "../render/settings/player_settings.js?v=351";
import { standaloneNavigationHref } from "../render/shell/standalone_navigation.js?v=351";
import { standardGamepadState } from "../render/input/dual_stick_input.js?v=351";
import { mobileVirtualStickState } from "../render/input/mobile_virtual_stick.js?v=351";
import {
  compactOkanaganCue,
  okanaganFlightState,
  okanaganRadioHoldMs,
} from "../render/okanagan/okanagan_hud_adapter.js?v=351";
import {
  cycleOkanaganTarget,
  okanaganTargets,
  retainOkanaganTarget,
} from "../render/okanagan/okanagan_targets.js?v=351";
import {
  okanaganDebriefModel,
  okanaganMissionTerminal,
} from "../render/okanagan/okanagan_debrief.js?v=351";
import {
  okanaganDialogFocusables,
  okanaganDialogTabTarget,
} from "../render/okanagan/okanagan_dialog_focus.js?v=351";

const SORTIES = Object.freeze({
  "water-circuits": {
    index: 0,
    title: "Water Circuits",
    block: 610,
    working: "197 KG",
    objective: "Complete one water circuit.",
    execution: "Scoop · drop · recover above RTB minimum",
  },
  "fire-attack": {
    index: 1,
    title: "Solo Initial Attack",
    block: 760,
    working: "347 KG",
    objective: "Attack the west-side fire.",
    execution: "Choose a line · drop · recover above RTB minimum",
  },
  "large-force-employment": {
    index: 2,
    title: "Large Force Employment",
    block: 760,
    working: "347 KG",
    objective: "Fly assigned drops.",
    execution: "Follow Air Attack · respect holds · recover",
  },
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
const hudCanvas = document.querySelector("#hud");
const mapCanvas = document.querySelector("#map");
const map = mapCanvas.getContext("2d");
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
sun.position.set(-12_000, 18_000, 9_000);
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
const highway = createOkanaganHighway(scene);
const fireEffects = createOkanaganFireEffects(scene, quality === "mobile" ? 80 : 180);
const trafficGroup = new THREE.Group();
const trafficModels = new Map();
scene.add(trafficGroup);
const dropTrail = createDropTrail();
scene.add(dropTrail.group);

window.__gunsOnlyOkanagan = Object.freeze({
  getState: () => state,
  getQuality: () => quality,
  getRenderInfo: () => renderer.info,
  getTelemetry: () => telemetryFrames.map((frame) => ({ ...frame })),
  getLastTelemetry: () => telemetryFrames.at(-1) ?? null,
  getAudioDiagnostics: () => flightAudioDiagnostics(),
  getSelectedTarget: () => selectedTarget(),
  getDebrief: () => missionResultModel,
  start: (sortie = currentSortie) => startSortie(sortie),
});

function createDropTrail() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(36 * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9de9f3, size: 16, transparent: true, opacity: 0.72, depthWrite: false }));
  const samples = [];
  function update(current, active) {
    if (active && current) {
      samples.unshift({ x: current.position.x, y: current.position.y - 2.5, z: current.position.z, age: 0 });
      if (samples.length > 36) samples.length = 36;
    }
    for (const sample of samples) { sample.age += 1 / 60; sample.y -= 3.5; }
    const alive = samples.filter((sample) => sample.age < 2.2);
    samples.length = 0; samples.push(...alive);
    const array = geometry.attributes.position.array;
    samples.forEach((sample, index) => { array[index * 3] = sample.x; array[index * 3 + 1] = sample.y; array[index * 3 + 2] = sample.z; });
    geometry.setDrawRange(0, samples.length);
    geometry.attributes.position.needsUpdate = true;
  }
  return { group: points, update };
}

function buildTraffic(tracks = []) {
  const live = new Set();
  for (const track of tracks) {
    live.add(track.callsign);
    const helicopter = track.kind === "HELICOPTER";
    let craft = trafficModels.get(track.callsign);
    if (!craft) {
      craft = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({ color: helicopter ? 0xffd157 : 0xf4f5ed });
      const body = new THREE.Mesh(new THREE.BoxGeometry(helicopter ? 22 : 9, 5, helicopter ? 8 : 28), material);
      craft.add(body);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(34, 1, helicopter ? 1.5 : 5), material);
      wing.position.y = 2; craft.add(wing);
      trafficModels.set(track.callsign, craft);
      trafficGroup.add(craft);
    }
    craft.position.set(track.position.x, track.position.y, track.position.z);
    craft.rotation.y = track.heading_rad;
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
  drop = false;
  leftStick = Object.freeze({ x: 0, y: 0 });
  rightStick = Object.freeze({ x: 0, y: 0 });
  dropButton.classList.remove("active");
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
    'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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
  bridge.Start(SORTIES[id].index);
  state = JSON.parse(bridge.GetState());
  throttle = 0.65;
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
  if (running) bridge?.SetPaused(paused);
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

function updateView(current) {
  camera.position.set(current.position.x, current.position.y + 2.25, current.position.z);
  camera.rotation.set(current.pitch_rad, Math.PI + current.heading_rad, -current.roll_rad, "YXZ");
  const bodyQuaternion = camera.quaternion.clone();
  const target = selectedTarget();
  if (padlock && target) {
    camera.lookAt(target.position.x, target.position.y, target.position.z);
    cockpit.group.quaternion.copy(camera.quaternion).invert().multiply(bodyQuaternion);
  } else {
    cockpit.group.quaternion.identity();
  }
  camera.updateMatrixWorld(true);
  sky.position.copy(camera.position);
  cockpit.update(current.mission_s, current.throttle);
  highway.update(current.route, current.active_gate, current.position);
  fireEffects.group.visible = current.sortie !== "water-circuits";
  fireEffects.update(current.fire_cells, current.mission_s);
  buildTraffic(current.traffic);
  dropTrail.update(current, current.water_released_this_tick_kg > 0);
  if (sun.castShadow) {
    sun.position.set(current.position.x - 12_000, current.position.y + 18_000, current.position.z + 9_000);
    sun.target.position.set(current.position.x, 500, current.position.z);
    sun.target.updateMatrixWorld();
  }
}

function updateDom(current) {
  const now = performance.now();
  document.querySelector("#cue").textContent = compactOkanaganCue(current);
  const radio = document.querySelector("#radio");
  const transmission = String(current.radio ?? "").trim();
  if (transmission && transmission !== lastRadio) {
    lastRadio = transmission;
    radio.textContent = transmission;
    radioHideAt = now + okanaganRadioHoldMs(transmission);
  }
  radio.dataset.visible = String(Boolean(transmission) && now < radioHideAt);
  document.querySelector("#water-value").textContent = `${Math.round(current.water_kg).toLocaleString()} L`;
  const scoopState = document.querySelector("#scoop-state");
  scoopState.textContent = current.scoop_fault || (current.scoop_valid
    ? `FILLING · ${Math.round(current.scoop_rate_kgps)} L/S`
    : current.scoops_commanded ? "SCOOPS DOWN" : "SCOOPS UP");
  scoopState.dataset.level = current.scoop_fault ? "caution" : "normal";
  scoopsButton.setAttribute("aria-pressed", String(current.scoops_commanded));
  padlockButton.setAttribute("aria-pressed", String(padlock));
  syncSoundControl();
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
    scoops_commanded: current.scoops_commanded,
    scoop_valid: current.scoop_valid,
    scoop_fault: current.scoop_fault,
    water_kg: current.water_kg,
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
  flightState.civilian_target_label = target?.label ?? "";
  flightState.civilian_target_kind = target?.kind ?? "";
  flightState.civilian_target_padlocked = padlock && Boolean(target);
  hudFrame.state = flightState;
  hudFrame.playerPosition.set(current.position.x, current.position.y, current.position.z);
  hudFrame.playerForward.set(Math.sin(current.heading_rad) * Math.cos(current.pitch_rad),
    Math.sin(current.pitch_rad), Math.cos(current.heading_rad) * Math.cos(current.pitch_rad));
  if (target) hudFrame.civilianTargetPosition.set(target.position.x, target.position.y, target.position.z);
  hudFrame.padlock = padlock && Boolean(target);
  hudFrame.padlockTarget = hudFrame.padlock ? "civilian" : null;
  hudFrame.padlockTargetPosition = hudFrame.padlock ? hudFrame.civilianTargetPosition : null;
  hudFrame.dt = deltaSeconds;
  hudFrame.now = nowSeconds;
  flightHud.draw(hudFrame);
  updateFlightAudio(flightState, { muted: paused, nowSeconds });
}

function drawMap(current) {
  const w = mapCanvas.width; const h = mapCanvas.height;
  map.clearRect(0, 0, w, h); map.fillStyle = "rgba(3,15,18,.92)"; map.fillRect(0, 0, w, h);
  const project = ({ x, z }) => [w * (0.5 + x / 48_000), h * (0.5 - z / 52_000)];
  const lake = world?.worldData?.lake?.shoreline ?? [];
  if (lake.length) {
    map.beginPath();
    lake.forEach(([lon, lat], index) => {
      const x = (lon + 119.5) * 71_800; const z = (lat - 49.88) * 111_320;
      const p = project({ x, z }); if (index === 0) map.moveTo(...p); else map.lineTo(...p);
    });
    map.closePath(); map.fillStyle = "#205a70"; map.fill();
  }
  map.strokeStyle = "#ffb84d"; map.lineWidth = 2; map.beginPath();
  current.route.forEach((gate, index) => { const p = project(gate.position); index === 0 ? map.moveTo(...p) : map.lineTo(...p); }); map.stroke();
  for (const cell of current.fire_cells ?? []) { const p = project(cell); map.fillStyle = `rgba(255,90,20,${Math.min(1, cell.intensity)})`; map.fillRect(p[0] - 2, p[1] - 2, 4, 4); }
  for (const track of current.traffic ?? []) { const p = project(track.position); map.fillStyle = "#ffd157"; map.fillRect(p[0] - 3, p[1] - 3, 6, 6); map.fillText(track.callsign, p[0] + 5, p[1]); }
  const own = project(current.position); map.fillStyle = "#8ff6e8"; map.beginPath(); map.arc(own[0], own[1], 4, 0, Math.PI * 2); map.fill();
  map.fillStyle = "#d5ece8"; map.font = "10px ui-monospace"; map.fillText("N ↑  OKANAGAN", 10, 15);
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
    controls(delta); bridge.Advance(delta); state = JSON.parse(bridge.GetState());
    recordTelemetry(state, delta);
    updateView(state); updateDom(state); drawHud(state, delta, state.mission_s);
    if (!mapCanvas.hidden) drawMap(state);
    if (okanaganMissionTerminal(state)) showMissionResult(state);
  }
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
  document.body.classList.toggle("nav-open", !mapCanvas.hidden);
  navButton.setAttribute("aria-pressed", String(!mapCanvas.hidden));
  if (!mapCanvas.hidden && state) drawMap(state);
});
soundButton.addEventListener("click", () => {
  setOkanaganAudioEnabled(!playerSettings.audio, { arm: true });
});
for (const type of ["pointerdown", "touchstart"]) dropButton.addEventListener(type, (event) => { event.preventDefault(); drop = true; dropButton.classList.add("active"); }, { passive: false });
for (const type of ["pointerup", "pointercancel", "touchend"]) dropButton.addEventListener(type, () => { drop = false; dropButton.classList.remove("active"); });
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
});
window.addEventListener("keyup", (event) => { keys.delete(event.code); if (event.code === "Space") { drop = false; dropButton.classList.remove("active"); } });
window.addEventListener("blur", () => { keys.clear(); drop = false; leftStick = { x: 0, y: 0 }; rightStick = { x: 0, y: 0 }; });
window.addEventListener("resize", resize, { passive: true });
window.addEventListener("pagehide", () => { cancelAnimationFrame(animationFrame); suspendFlightAudio("okanagan-pagehide"); world?.dispose(); renderer.dispose(); }, { once: true });

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
  const [terrainData, worldData] = await Promise.all([
    fetch("/content/packs/okanagan-fire/environment/okanagan-central.cdem.json").then((response) => response.json()),
    fetch("/content/packs/okanagan-fire/environment/okanagan-central.world.json").then((response) => response.json()),
  ]);
  world = createOkanaganWorld(scene, terrainData, worldData, quality);
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
