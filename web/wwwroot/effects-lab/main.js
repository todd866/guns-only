import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/three/addons/controls/OrbitControls.js";
import { loadKoreaGunEffects } from "../render/effects/korea_gun_effects.js";

const canvas = document.querySelector("#scene");
const viewport = document.querySelector(".viewport");
const status = document.querySelector("#status");
const quality = document.querySelector("#quality");
const speed = document.querySelector("#speed");
const loop = document.querySelector("#loop");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c171c);
scene.fog = new THREE.FogExp2(0x0c171c, 0.009);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 650);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 8;
controls.maxDistance = 160;

scene.add(new THREE.HemisphereLight(0xa9c7d8, 0x11181a, 1.5));
const key = new THREE.DirectionalLight(0xffdfb3, 2.2);
key.position.set(-12, 24, 18);
scene.add(key);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 220),
  new THREE.MeshStandardMaterial({ color: 0x17272d, roughness: 0.84, metalness: 0.12 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.08;
scene.add(floor);
scene.add(new THREE.GridHelper(160, 40, 0x49616a, 0x26373e));

function contextGeometry() {
  const group = new THREE.Group();
  group.name = "EFFECTS_SCALE_REFERENCE";
  const dark = new THREE.MeshStandardMaterial({ color: 0x28373c, metalness: 0.58, roughness: 0.42 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0x7c8889, metalness: 0.72, roughness: 0.3 });
  const target = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.4, 0.6), dark);
  target.position.set(3, 1.2, -4);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 0.5), alloy);
  stand.position.set(3, 1, -4);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 16), alloy);
  gun.rotation.x = Math.PI / 2;
  gun.position.set(-5, 3.8, 9);
  const ship = new THREE.Mesh(new THREE.BoxGeometry(7, 1.5, 18), dark);
  ship.position.set(16, 0.8, 15);
  group.add(target, stand, gun, ship);
  return group;
}
scene.add(contextGeometry());

let effects = null;
let previous = performance.now();
let nextLoop = 0;
let seed = 40;

function resetCamera() {
  camera.position.set(31, 20, 39);
  controls.target.set(2, 3, -3);
  controls.update();
}

function emitGun() {
  effects?.emit("event.weapon.gun-fire.v1", {
    position: [-5, 3.8, 5.6],
    direction: [0.16, -0.02, -1],
    tracer: true,
  });
}

function emitImpact() {
  effects?.emit("event.weapon.gun-impact.v1", {
    position: [3, 2.2, -3.6],
    normal: [-0.25, 0.72, 1],
    seed: seed++,
  });
}

function emitDestroyed() {
  effects?.emit("event.vehicle.destroyed.v1", {
    position: [-6, 5, -15],
    velocity: [8, 0.5, -3],
    seed: seed++,
  });
}

function emitWake() {
  effects?.emit("event.platform.wake.v1", {
    position: [16, 0.02, 22],
    direction: [0, 0, 1],
  });
}

function showcase() {
  emitWake();
  emitDestroyed();
  emitGun();
  setTimeout(emitGun, 170);
  setTimeout(emitImpact, 340);
  setTimeout(emitGun, 520);
}

function updateReadout() {
  let draws = 0;
  let lights = 0;
  effects?.group.traverse((object) => {
    if (object.isMesh) draws++;
    if (object.isLight) lights++;
  });
  document.querySelector("#active").textContent = String(effects?.items.length ?? 0);
  document.querySelector("#draws").textContent = String(draws);
  document.querySelector("#lights").textContent = String(lights);
}

async function rebuild() {
  quality.disabled = true;
  status.lastChild.textContent = " Loading effects…";
  effects?.dispose();
  effects = await loadKoreaGunEffects(THREE, { qualityTier: quality.value });
  scene.add(effects.group);
  status.lastChild.textContent = ` Korea gun effects · ${quality.value}`;
  quality.disabled = false;
  showcase();
}

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  effects?.update(delta * Number(speed.value));
  if (loop.checked && now >= nextLoop) {
    showcase();
    nextLoop = now + 4600;
  }
  controls.update();
  updateReadout();
  renderer.render(scene, camera);
}

function showError(error) {
  console.error(error);
  status.lastChild.textContent = ` ${error.message}`;
}

quality.addEventListener("change", () => rebuild().catch(showError));
speed.addEventListener("input", () => { document.querySelector("#speed-value").value = `${Number(speed.value).toFixed(2)}×`; });
document.querySelector("#gun-fire").addEventListener("click", emitGun);
document.querySelector("#impact").addEventListener("click", emitImpact);
document.querySelector("#destroyed").addEventListener("click", emitDestroyed);
document.querySelector("#wake").addEventListener("click", emitWake);
document.querySelector("#showcase").addEventListener("click", showcase);
document.querySelector("#reset").addEventListener("click", resetCamera);
new ResizeObserver(resize).observe(viewport);
resetCamera();
resize();
await rebuild().catch(showError);
requestAnimationFrame(animate);
