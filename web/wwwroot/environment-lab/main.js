import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/three/addons/controls/OrbitControls.js";
import { loadKoreaEnvironment } from "../render/environment/korea_environment.js";
import { loadKoreaTerrain } from "../render/environment/korea_terrain.js";
import { createTacticalCloudField } from "../render/environment/tactical_clouds.js?v=authoritative-clouds-v3";

const parameters = new URLSearchParams(location.search);
const terrainLookMode = parameters.has("terrain-look");
if (terrainLookMode) document.documentElement.dataset.terrainLook = "true";
const PRODUCTION_SUN_DIRECTION = new THREE.Vector3(0.32, 0.78, -0.53).normalize();
const VISUAL_PROFILE_URL = "../content/packs/korea-1950s/visual-profile.json";
const SITE_CONFIGURATIONS = Object.freeze({
  ukraine: Object.freeze({
    label: "Soniachne Steppe · fictional Ukraine",
    manifestUrl: new URL(
      "../content/packs/ukraine-modern/environment/terrain/soniachne-steppe.manifest.json",
      import.meta.url,
    ).href,
    sceneryEra: "ukraine-modern",
    inland: true,
    weatherId: "weather.ukraine-training.soniachne-broken-cumulus.v1",
  }),
  "korea-modern": Object.freeze({
    label: "Korea central front · modern treatment",
    manifestUrl: null,
    sceneryEra: "modern",
    inland: false,
    weatherId: "weather.korea-2030s.drone-front-cumulus.v1",
  }),
  "korea-1950s": Object.freeze({
    label: "Korea central front · 1950s treatment",
    manifestUrl: null,
    sceneryEra: "1950s",
    inland: false,
    weatherId: "weather.korea-1950s.inland-cumulus.v1",
  }),
});

function vectorParameter(name) {
  const values = parameters.get(name)?.split(",").map(Number);
  return values?.length === 3 && values.every(Number.isFinite) ? values : null;
}

const requestedTerrainLookPosition = vectorParameter("terrain-position");
const requestedTerrainLookTarget = vectorParameter("terrain-target");
const requestedTerrainLookView = requestedTerrainLookPosition && requestedTerrainLookTarget
  ? Object.freeze({
    position: Object.freeze(requestedTerrainLookPosition),
    target: Object.freeze(requestedTerrainLookTarget),
  })
  : null;

const canvas = document.querySelector("#scene");
const viewport = document.querySelector(".viewport");
const status = document.querySelector("#status");
const site = document.querySelector("#site");
const quality = document.querySelector("#quality");
const altitude = document.querySelector("#altitude");
const elevation = document.querySelector("#elevation");
const bearing = document.querySelector("#bearing");
const speed = document.querySelector("#speed");
const clouds = document.querySelector("#clouds");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  logarithmicDepthBuffer: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, 1, 1, 680000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 20;
controls.maxDistance = 24000;
const ambient = new THREE.HemisphereLight(0xb5cad0, 0x102229, 0.78);
const sun = new THREE.DirectionalLight(0xffe2b4, 2.65);
const sunTarget = new THREE.Object3D();
sun.target = sunTarget;
scene.add(ambient, sun, sunTarget);

let environment = null;
let terrain = null;
let tacticalClouds = null;
let visualProfile = null;
const terrainFogColor = new THREE.Color(0xa8c1cc);
let terrainFogDensity = 1 / 56_000;
let elapsed = 0;
let previous = performance.now();

const requestedSite = parameters.get("site");
site.value = SITE_CONFIGURATIONS[requestedSite] ? requestedSite : "ukraine";

function siteConfiguration() {
  return SITE_CONFIGURATIONS[site.value] ?? SITE_CONFIGURATIONS.ukraine;
}

function setCameraView() {
  const height = Number(altitude.value);
  // Mission-like low-level look: from the player start toward the road-aligned settlement east of
  // the first intercept lane. The old 5 km empty-parcel view made valid scenery read as absent.
  camera.position.set(-250, height, -450);
  controls.target.set(-760, Math.max(85, height * 0.28), -1900);
  controls.update();
  document.querySelector("#altitude-value").value = `${Math.round(height).toLocaleString()} m`;
}

function updateLabels() {
  document.querySelector("#elevation-value").value = `${elevation.value}°`;
  document.querySelector("#bearing-value").value = `${bearing.value}°`;
  document.querySelector("#speed-value").value = `${Number(speed.value).toFixed(1)}×`;
}

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}

function metrics() {
  let triangles = 0;
  let draws = 0;
  const roots = [environment?.group, terrain?.group, tacticalClouds?.group].filter(Boolean);
  for (const root of roots) root.traverse((object) => {
    if (!object.isMesh) return;
    draws++;
    const geometry = object.geometry;
    const perInstance = geometry.index ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;
    triangles += perInstance * Math.max(1, object.isInstancedMesh ? object.count : 1);
  });
  document.querySelector("#triangles").textContent = Math.round(triangles).toLocaleString();
  document.querySelector("#layers").textContent = String(
    tacticalClouds?.descriptors.filter((cloud) => cloud.present).length ?? 0,
  );
  document.querySelector("#draws").textContent = String(draws);
}

async function loadVisualProfile() {
  const response = await fetch(VISUAL_PROFILE_URL);
  if (!response.ok) {
    throw new Error(`Visual profile request failed: ${response.status} ${VISUAL_PROFILE_URL}`);
  }
  return response.json();
}

function applyProductionProfile(profile) {
  const environmentProfile = profile.environment ?? {};
  const lighting = environmentProfile.lighting ?? {};
  const fog = environmentProfile.fog ?? {};
  renderer.toneMappingExposure = Number(environmentProfile.exposure) || 1.02;
  ambient.intensity = Number(lighting.ambientIntensity) || 1.35;
  sun.intensity = Number(lighting.sunIntensity) || 2.4;
  sun.color.set(lighting.sunColor ?? "#FFE3B7");
  terrainFogColor.set(fog.color ?? "#A8C1CC");
  terrainFogDensity = 1 / Math.max(1, Number(fog.farMetres) || 56_000);
}

function terrainFrame(deltaSeconds = 0) {
  return {
    cameraPosition: camera.position,
    deltaSeconds,
    fogColor: terrainFogColor,
    fogDensity: terrainFogDensity,
    sunDirection: sunDirection(),
  };
}

async function rebuild() {
  const siteConfig = siteConfiguration();
  site.disabled = true;
  quality.disabled = true;
  status.lastChild.textContent = " Loading environment…";
  environment?.dispose();
  terrain?.dispose();
  tacticalClouds?.dispose();
  [environment, visualProfile] = await Promise.all([
    loadKoreaEnvironment(THREE, { qualityTier: quality.value }),
    loadVisualProfile(),
  ]);
  applyProductionProfile(visualProfile);
  scene.add(environment.group);
  environment.ocean.visible = !siteConfig.inland;
  // Production loads terrain separately from the atmosphere adapter. A null manifest keeps the
  // validated Korea default; the Ukraine option exercises its own local content-pack product.
  terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: siteConfig.manifestUrl,
    qualityTier: quality.value,
    maximumConcurrentLoads: quality.value === "mobile" ? 3 : 6,
    sceneryEra: siteConfig.sceneryEra,
    sunDirection: sunDirection(),
    fogColor: terrainFogColor,
    fogDensity: terrainFogDensity,
  });
  await terrain.ready;
  scene.add(terrain.group);
  // The authored pack clouds remain an art-reference fixture. This lab now exercises the exact
  // authoritative module admitted to FlightView, including the mobile impostor fallback.
  for (const cloud of environment.clouds) cloud.visible = false;
  tacticalClouds = createTacticalCloudField(THREE, { qualityTier: quality.value });
  tacticalClouds.configure({
    id: siteConfig.weatherId,
    seed: site.value === "ukraine" ? "2030082450a10008" : "20300915d20e0001",
    layers: [{
      base_m: site.value === "ukraine" ? 1050 : 1150,
      top_m: site.value === "ukraine" ? 2250 : 2850,
      coverage_01: site.value === "ukraine" ? 0.38 : 0.44,
      scale_m: site.value === "ukraine" ? 6200 : 4500,
      extinction_per_m: site.value === "ukraine" ? 0.014 : 0.018,
      wind_east_mps: site.value === "ukraine" ? 12 : 11,
      wind_north_mps: 4,
    }],
    cells: [{
      east_m: site.value === "ukraine" ? -5100 : 5600,
      north_m: site.value === "ukraine" ? 5800 : 4800,
      base_m: 850,
      top_m: site.value === "ukraine" ? 3900 : 5500,
      radius_east_m: site.value === "ukraine" ? 2500 : 2700,
      radius_north_m: site.value === "ukraine" ? 2000 : 2200,
      start_s: 0,
      lifetime_s: 900,
      transition_s: 20,
      wind_east_mps: site.value === "ukraine" ? 13 : 12,
      wind_north_mps: site.value === "ukraine" ? 4 : 5,
      coverage_01: 1,
      extinction_per_m: site.value === "ukraine" ? 0.018 : 0.022,
    }],
  });
  tacticalClouds.group.visible = clouds.checked && !terrainLookMode;
  scene.add(tacticalClouds.group);
  tacticalClouds.update(camera.position, elapsed, new THREE.Color(0x7898a0),
    0.000055, sunDirection());
  metrics();
  const terrainState = terrain.diagnostics();
  if (terrainState.errors > 0 || terrainState.residentChunks === 0) {
    throw new Error(`${siteConfig.label} loaded with ${terrainState.errors} errors and `
      + `${terrainState.residentChunks} resident chunks`);
  }
  status.lastChild.textContent = ` ${siteConfig.label} · ${quality.value}`;
  site.disabled = false;
  quality.disabled = false;
}

function sunDirection() {
  if (terrainLookMode) return PRODUCTION_SUN_DIRECTION.clone();
  const altitudeRadians = THREE.MathUtils.degToRad(Number(elevation.value));
  const bearingRadians = THREE.MathUtils.degToRad(Number(bearing.value));
  const horizontal = Math.cos(altitudeRadians);
  return new THREE.Vector3(
    Math.sin(bearingRadians) * horizontal,
    Math.sin(altitudeRadians),
    -Math.cos(bearingRadians) * horizontal,
  ).normalize();
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  elapsed += delta * Number(speed.value);
  controls.update();
  sunTarget.position.copy(controls.target);
  sun.position.copy(sunTarget.position).addScaledVector(sunDirection(), 1600);
  sunTarget.updateMatrixWorld();
  environment?.update({ timeSeconds: elapsed, cameraPosition: camera.position, sunDirection: sunDirection() });
  terrain?.update(terrainFrame(delta));
  if (tacticalClouds) {
    tacticalClouds.group.visible = clouds.checked && !terrainLookMode;
    tacticalClouds.update(camera.position, elapsed, new THREE.Color(0x7898a0),
      0.000055, sunDirection());
  }
  renderer.render(scene, camera);
}

quality.addEventListener("change", () => rebuild().catch(showError));
site.addEventListener("change", () => rebuild().catch(showError));
altitude.addEventListener("input", setCameraView);
elevation.addEventListener("input", updateLabels);
bearing.addEventListener("input", updateLabels);
speed.addEventListener("input", updateLabels);
clouds.addEventListener("change", () => {
  if (tacticalClouds) tacticalClouds.group.visible = clouds.checked;
});
document.querySelector("#reset").addEventListener("click", setCameraView);
new ResizeObserver(resize).observe(viewport);

function showError(error) {
  console.error(error);
  status.lastChild.textContent = ` ${error.message}`;
  site.disabled = false;
  quality.disabled = false;
  window.__terrainLookError = error.message;
}

async function setTerrainLookView(view) {
  if (!terrain) throw new Error("Terrain is not loaded");
  camera.position.fromArray(view.position);
  controls.target.fromArray(view.target);
  controls.update();
  environment.update({
    timeSeconds: 0,
    cameraPosition: camera.position,
    sunDirection: sunDirection(),
  });
  terrain.update(terrainFrame());
  await terrain.whenIdle();
  terrain.update(terrainFrame());
  renderer.render(scene, camera);
  await new Promise((resolvePromise) => requestAnimationFrame(
    () => requestAnimationFrame(resolvePromise),
  ));
  return terrain.diagnostics();
}

setCameraView();
updateLabels();
resize();
if (terrainLookMode) {
  quality.value = "desktop";
  clouds.checked = false;
  speed.value = "0";
}
await rebuild().then(async () => {
  window.__terrainLookSetView = setTerrainLookView;
  window.__terrainLookReady = terrain.diagnostics();
  if (requestedTerrainLookView) await setTerrainLookView(requestedTerrainLookView);
  document.documentElement.dataset.terrainLookReady = "true";
}).catch(showError);
requestAnimationFrame(animate);
