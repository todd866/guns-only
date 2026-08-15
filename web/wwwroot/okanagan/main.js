import * as THREE from "../vendor/three.module.js?v=337";
import { createOkanaganWorld } from "../render/okanagan/okanagan_world.js?v=337";
import { createOkanaganHighway } from "../render/okanagan/okanagan_highway.js?v=337";
import { createOkanaganFireEffects } from "../render/okanagan/okanagan_fire_effects.js?v=337";
import { createFireBossCockpit } from "../render/okanagan/fireboss_cockpit.js?v=337";

const SORTIES = Object.freeze({
  "water-circuits": { index: 0, title: "Water Circuits", working: "197 kg planned" },
  "fire-attack": { index: 1, title: "Solo Initial Attack", working: "347 kg planned" },
  "large-force-employment": { index: 2, title: "Large Force Employment", working: "347 kg planned" },
});
const canvas = document.querySelector("#scene");
const hudCanvas = document.querySelector("#hud");
const mapCanvas = document.querySelector("#map");
const hud = hudCanvas.getContext("2d");
const map = mapCanvas.getContext("2d");
const status = document.querySelector("#status");
const menu = document.querySelector("#sortie-menu");
const pauseMenu = document.querySelector("#pause-menu");
const pauseButton = document.querySelector("#pause-button");
const scoopsButton = document.querySelector("#scoops");
const dropButton = document.querySelector("#drop");
const keys = new Set();
const coarse = matchMedia?.("(pointer: coarse)")?.matches === true;
const constrained = (navigator.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4;
const quality = coarse ? "mobile" : constrained ? "balanced" : "desktop";

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
  document.querySelectorAll(".sortie").forEach((button) => {
    const selected = button.dataset.sortie === id;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  document.querySelector("#start").textContent = `Fly ${SORTIES[id].title}`;
  document.querySelector("#plan-working").textContent = SORTIES[id].working;
}

function startSortie(id) {
  selectSortie(id);
  if (!bridge) return false;
  bridge.Start(SORTIES[id].index);
  state = JSON.parse(bridge.GetState());
  throttle = 0.65;
  scoops = false;
  drop = false;
  running = true;
  telemetryFrames.length = 0;
  lastTelemetryMissionSecond = -Infinity;
  lastTelemetryPhase = "";
  setPaused(false);
  menu.classList.remove("visible");
  document.querySelector("#fire-panel").hidden = id === "water-circuits";
  status.textContent = "ARROWS fly · W/S power · E scoops · hold SPACE to drop · ESC pause";
  canvas.focus();
  return true;
}

function setPaused(value) {
  paused = value;
  if (running) bridge?.SetPaused(value);
  pauseMenu.classList.toggle("visible", value && running && !menu.classList.contains("visible"));
  pauseMenu.setAttribute("aria-hidden", String(!(value && running)));
  document.body.classList.toggle("paused", value);
}

function controls(deltaSeconds) {
  const pitch = (keys.has("ArrowDown") ? 1 : 0) - (keys.has("ArrowUp") ? 1 : 0);
  const roll = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
  const yaw = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  throttle = THREE.MathUtils.clamp(throttle + ((keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0)) * deltaSeconds * 0.35, 0, 1);
  bridge.SetControls(pitch, roll, yaw, throttle, scoops, drop);
}

function updateView(current) {
  camera.position.set(current.position.x, current.position.y + 2.25, current.position.z);
  camera.rotation.set(current.pitch_rad, Math.PI + current.heading_rad, -current.roll_rad, "YXZ");
  sky.position.copy(camera.position);
  cockpit.update(current.mission_s, current.throttle);
  highway.update(current.route, current.active_gate);
  fireEffects.group.visible = current.sortie !== "water-circuits";
  fireEffects.update(current.fire_cells, current.mission_s);
  buildTraffic(current.traffic);
  dropTrail.update(current, drop && current.water_kg > 0);
  if (sun.castShadow) {
    sun.position.set(current.position.x - 12_000, current.position.y + 18_000, current.position.z + 9_000);
    sun.target.position.set(current.position.x, 500, current.position.z);
    sun.target.updateMatrixWorld();
  }
}

function updateDom(current) {
  document.querySelector("#phase").textContent = current.phase.replaceAll("-", " ").toUpperCase();
  document.querySelector("#objective").textContent = current.objective;
  document.querySelector("#radio").textContent = current.radio;
  document.querySelector("#cue").textContent = current.cue;
  document.querySelector("#water-value").textContent = `${Math.round(current.water_kg).toLocaleString()} L`;
  document.querySelector("#water-bar").style.width = `${100 * current.water_kg / current.water_capacity_kg}%`;
  document.querySelector("#scoop-state").textContent = current.scoop_valid ? `FILLING · ${Math.round(current.scoop_rate_kgps)} L/S` : current.scoops_commanded ? "SCOOPS DOWN" : "SCOOPS UP";
  scoopsButton.setAttribute("aria-pressed", String(current.scoops_commanded));
  const plan = current.fuel_plan;
  document.querySelector("#fuel-value").textContent = `${Math.round(current.fuel_kg)} / ${Math.round(plan.minimum_rtb_kg)} KG`;
  document.querySelector("#fuel-bar").style.width = `${Math.min(100, 100 * current.fuel_kg / plan.block_kg)}%`;
  document.querySelector("#fuel-minimum").style.left = `${Math.min(100, 100 * plan.minimum_rtb_kg / plan.block_kg)}%`;
  document.querySelector("#fuel-state").textContent = `${plan.state.toUpperCase()} · ${Math.max(0, Math.round(plan.endurance_min))} MIN`;
  document.querySelector("#fire-value").textContent = `${current.burned_area_ha.toFixed(1)} HA · ${Math.round(current.effective_water_kg).toLocaleString()} L EFFECTIVE`;
  document.querySelector("#population-value").textContent = `${current.population_exposed.toLocaleString()} PEOPLE IN EXPOSURE MODEL`;
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
    throttle: current.throttle,
    scoops_commanded: current.scoops_commanded,
    scoop_valid: current.scoop_valid,
    scoop_fault: current.scoop_fault,
    water_kg: current.water_kg,
    fuel_kg: current.fuel_kg,
    fuel_above_minimum_kg: current.fuel_plan.above_minimum_kg,
    active_gate: gate?.id ?? null,
    gate_range_m: gate ? Math.hypot(gateDx, gateDy, gateDz) : null,
    gate_altitude_error_m: gate ? gateDy : null,
    terrain_clearance_m: world ? current.position.y - world.sampleHeight(current.position.x, current.position.z) : null,
    input: {
      pitch: (keys.has("ArrowDown") ? 1 : 0) - (keys.has("ArrowUp") ? 1 : 0),
      roll: (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0),
      yaw: (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0),
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

function drawHud(current) {
  const width = hudCanvas.width;
  const height = hudCanvas.height;
  const scale = devicePixelRatio;
  hud.clearRect(0, 0, width, height);
  hud.save(); hud.scale(scale, scale);
  const w = width / scale; const h = height / scale;
  hud.strokeStyle = "#8ff6e8"; hud.fillStyle = "#8ff6e8"; hud.lineWidth = 2;
  hud.font = "700 13px ui-monospace, monospace";
  hud.textAlign = "left";
  hud.fillText(`${Math.round(current.tas_mps * 1.94384)} KT`, 28, h * 0.48);
  hud.textAlign = "right";
  hud.fillText(`${Math.round(current.position.y * 3.28084)} FT`, w - 28, h * 0.48);
  hud.textAlign = "center";
  hud.fillText(`${String(Math.round((current.heading_rad * 180 / Math.PI + 360) % 360)).padStart(3, "0")}°`, w / 2, 32);
  hud.fillText(`${Math.round(current.vertical_speed_mps * 196.85)} FPM`, w - 92, h * 0.48 + 22);
  hud.save(); hud.translate(w / 2, h / 2); hud.rotate(current.roll_rad);
  const pitchOffset = current.pitch_rad * 230;
  hud.beginPath(); hud.moveTo(-90, pitchOffset); hud.lineTo(-24, pitchOffset); hud.moveTo(24, pitchOffset); hud.lineTo(90, pitchOffset); hud.stroke();
  hud.beginPath(); hud.moveTo(-14, 0); hud.lineTo(0, 7); hud.lineTo(14, 0); hud.stroke();
  hud.restore();
  const gate = current.route?.[current.active_gate];
  if (gate) {
    const dx = gate.position.x - current.position.x;
    const dz = gate.position.z - current.position.z;
    const bearing = Math.atan2(dx, dz);
    const error = Math.atan2(Math.sin(bearing - current.heading_rad), Math.cos(bearing - current.heading_rad));
    const x = w / 2 + THREE.MathUtils.clamp(error / 0.75, -1, 1) * w * 0.32;
    hud.strokeStyle = "#ffb84d"; hud.fillStyle = "#ffb84d";
    hud.strokeRect(x - 13, h * 0.32 - 13, 26, 26);
    const altitudeError = Math.round((gate.position.y - current.position.y) * 3.28084 / 100) * 100;
    hud.fillText(`${gate.label} · ${Math.round(gate.target_speed_mps * 1.94384)} KT · ${altitudeError >= 0 ? "+" : ""}${altitudeError} FT`, x, h * 0.32 - 22);
  }
  hud.restore();
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
  hudCanvas.width = Math.round(innerWidth * devicePixelRatio); hudCanvas.height = Math.round(innerHeight * devicePixelRatio);
}

function animate(now) {
  animationFrame = requestAnimationFrame(animate);
  const delta = Math.min(0.1, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
  if (running && !paused) {
    controls(delta); bridge.Advance(delta); state = JSON.parse(bridge.GetState());
    recordTelemetry(state, delta);
    updateView(state); updateDom(state); drawHud(state); drawMap(state);
    if (["complete", "failed"].includes(state.phase)) setPaused(true);
  }
  renderer.render(scene, camera);
}

document.querySelectorAll(".sortie").forEach((button) => button.addEventListener("click", () => selectSortie(button.dataset.sortie)));
document.querySelector("#start").addEventListener("click", () => startSortie(currentSortie));
document.querySelector("#resume").addEventListener("click", () => setPaused(false));
document.querySelector("#restart").addEventListener("click", () => startSortie(currentSortie));
document.querySelector("#choose-sortie").addEventListener("click", () => { setPaused(true); pauseMenu.classList.remove("visible"); menu.classList.add("visible"); });
pauseButton.addEventListener("click", () => running && setPaused(!paused));
scoopsButton.addEventListener("click", () => { scoops = !scoops; scoopsButton.setAttribute("aria-pressed", String(scoops)); });
for (const type of ["pointerdown", "touchstart"]) dropButton.addEventListener(type, (event) => { event.preventDefault(); drop = true; dropButton.classList.add("active"); }, { passive: false });
for (const type of ["pointerup", "pointercancel", "touchend"]) dropButton.addEventListener(type, () => { drop = false; dropButton.classList.remove("active"); });
window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "Escape") { event.preventDefault(); if (running) setPaused(!paused); return; }
  if (event.code === "KeyE" && !event.repeat) { scoops = !scoops; scoopsButton.setAttribute("aria-pressed", String(scoops)); }
  if (event.code === "Space") { drop = true; dropButton.classList.add("active"); }
  keys.add(event.code);
});
window.addEventListener("keyup", (event) => { keys.delete(event.code); if (event.code === "Space") { drop = false; dropButton.classList.remove("active"); } });
window.addEventListener("blur", () => { keys.clear(); drop = false; });
window.addEventListener("resize", resize, { passive: true });
window.addEventListener("pagehide", () => { cancelAnimationFrame(animationFrame); world?.dispose(); renderer.dispose(); }, { once: true });

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
  if (SORTIES[requested]) selectSortie(requested);
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
