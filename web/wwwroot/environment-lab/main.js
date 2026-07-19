import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/three/addons/controls/OrbitControls.js";
import { loadKoreaEnvironment } from "../render/environment/korea_environment.js";

const canvas = document.querySelector("#scene");
const viewport = document.querySelector(".viewport");
const status = document.querySelector("#status");
const quality = document.querySelector("#quality");
const altitude = document.querySelector("#altitude");
const elevation = document.querySelector("#elevation");
const bearing = document.querySelector("#bearing");
const speed = document.querySelector("#speed");
const clouds = document.querySelector("#clouds");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, 1, 1, 110000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 20;
controls.maxDistance = 24000;

let environment = null;
let elapsed = 0;
let previous = performance.now();

function setCameraView() {
  const height = Number(altitude.value);
  camera.position.set(480, height, 850);
  controls.target.set(0, Math.max(20, height * 0.42), -4800);
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
  environment?.group.traverse((object) => {
    if (!object.isMesh) return;
    draws++;
    const geometry = object.geometry;
    triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
  });
  document.querySelector("#triangles").textContent = Math.round(triangles).toLocaleString();
  document.querySelector("#layers").textContent = String(environment?.clouds.length ?? 0);
  document.querySelector("#draws").textContent = String(draws);
}

async function rebuild() {
  quality.disabled = true;
  status.lastChild.textContent = " Loading environment…";
  environment?.dispose();
  environment = await loadKoreaEnvironment(THREE, { qualityTier: quality.value });
  scene.add(environment.group);
  for (const cloud of environment.clouds) cloud.visible = clouds.checked;
  metrics();
  status.lastChild.textContent = ` Korea atmosphere · ${quality.value}`;
  quality.disabled = false;
}

function sunDirection() {
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
  environment?.update({ timeSeconds: elapsed, cameraPosition: camera.position, sunDirection: sunDirection() });
  renderer.render(scene, camera);
}

quality.addEventListener("change", () => rebuild().catch(showError));
altitude.addEventListener("input", setCameraView);
elevation.addEventListener("input", updateLabels);
bearing.addEventListener("input", updateLabels);
speed.addEventListener("input", updateLabels);
clouds.addEventListener("change", () => {
  for (const cloud of environment?.clouds ?? []) cloud.visible = clouds.checked;
});
document.querySelector("#reset").addEventListener("click", setCameraView);
new ResizeObserver(resize).observe(viewport);

function showError(error) {
  console.error(error);
  status.lastChild.textContent = ` ${error.message}`;
}

setCameraView();
updateLabels();
resize();
await rebuild().catch(showError);
requestAnimationFrame(animate);
