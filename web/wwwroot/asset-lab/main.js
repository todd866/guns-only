import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/three/addons/controls/OrbitControls.js";
import { createThreeR160AssetRegistry } from "../render/assets/three_r160_loader.js";

const DEFAULT_PACK_URL = "../content/packs/korea-1950s/pack.json";
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const SOCKET_NAME_PATTERN = /(?:^SOCKET_|socket|hardpoint|muzzle|weapon[_-]?mount)/i;
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const ui = Object.freeze({
  stage: document.querySelector("#stage"),
  viewport: document.querySelector("#viewport"),
  stageEmpty: document.querySelector("#stageEmpty"),
  stageLoading: document.querySelector("#stageLoading"),
  stageLoadingText: document.querySelector("#stageLoadingText"),
  dropOverlay: document.querySelector("#dropOverlay"),
  runtimeStatus: document.querySelector("#runtimeStatus"),
  runtimeStatusText: document.querySelector("#runtimeStatusText"),
  packForm: document.querySelector("#packForm"),
  packUrl: document.querySelector("#packUrl"),
  loadPackButton: document.querySelector("#loadPackButton"),
  chooseGlbButton: document.querySelector("#chooseGlbButton"),
  glbInput: document.querySelector("#glbInput"),
  bindingSelect: document.querySelector("#bindingSelect"),
  bindingCount: document.querySelector("#bindingCount"),
  pixelHeightRange: document.querySelector("#pixelHeightRange"),
  pixelHeightNumber: document.querySelector("#pixelHeightNumber"),
  selectedLod: document.querySelector("#selectedLod"),
  frameButton: document.querySelector("#frameButton"),
  autorotateToggle: document.querySelector("#autorotateToggle"),
  wireframeToggle: document.querySelector("#wireframeToggle"),
  socketToggle: document.querySelector("#socketToggle"),
  gridToggle: document.querySelector("#gridToggle"),
  messageBox: document.querySelector("#messageBox"),
  messageTitle: document.querySelector("#messageTitle"),
  messageText: document.querySelector("#messageText"),
  assetTitle: document.querySelector("#assetTitle"),
  packIdentity: document.querySelector("#packIdentity"),
  profileIdentity: document.querySelector("#profileIdentity"),
  bindingIdentity: document.querySelector("#bindingIdentity"),
  assetIdentity: document.querySelector("#assetIdentity"),
  metricNodes: document.querySelector("#metricNodes"),
  metricMeshes: document.querySelector("#metricMeshes"),
  metricDrawCalls: document.querySelector("#metricDrawCalls"),
  metricTriangles: document.querySelector("#metricTriangles"),
  metricMaterials: document.querySelector("#metricMaterials"),
  metricTextures: document.querySelector("#metricTextures"),
  boundsValue: document.querySelector("#boundsValue"),
  sourceValue: document.querySelector("#sourceValue"),
  lodList: document.querySelector("#lodList"),
  socketList: document.querySelector("#socketList"),
  namedNodeCount: document.querySelector("#namedNodeCount"),
  nodeList: document.querySelector("#nodeList"),
});

const state = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  modelRoot: null,
  socketHelperRoot: null,
  grid: null,
  axes: null,
  runtime: null,
  pack: null,
  instance: null,
  descriptor: null,
  activeBinding: null,
  activeSelectionKey: null,
  localObjectUrl: null,
  bounds: null,
  sockets: [],
  wireframeStates: new Map(),
  loadEpoch: 0,
  selectionEpoch: 0,
  busy: false,
  resizeObserver: null,
  frameRequest: 0,
  projectionTimer: 0,
  dragDepth: 0,
};

function setStatus(text, tone = "idle") {
  ui.runtimeStatus.dataset.tone = tone;
  ui.runtimeStatusText.textContent = text;
}

function setBusy(busy, text = "Loading…") {
  state.busy = busy;
  ui.stageLoading.hidden = !busy;
  ui.stageLoadingText.textContent = text;
  ui.loadPackButton.disabled = busy;
  ui.chooseGlbButton.disabled = busy;
  ui.bindingSelect.disabled = busy || !state.pack;
  ui.pixelHeightRange.disabled = busy || !state.pack;
  ui.pixelHeightNumber.disabled = busy || !state.pack;
  if (busy) setStatus(text, "busy");
}

function clearMessage() {
  ui.messageBox.hidden = true;
  ui.messageText.textContent = "";
}

function errorText(error) {
  const pieces = [];
  let current = error;
  let depth = 0;
  while (current && depth < 3) {
    const code = current.code ? `[${current.code}] ` : "";
    const message = current.message ?? String(current);
    const combined = `${code}${message}`;
    if (!pieces.includes(combined)) pieces.push(combined);
    current = current.cause;
    depth += 1;
  }
  return pieces.join(" → ");
}

function reportError(error, title = "Unable to load asset") {
  const message = errorText(error);
  console.error(title, error);
  ui.messageTitle.textContent = title;
  ui.messageText.textContent = message;
  ui.messageBox.hidden = false;
  setStatus(message, "error");
}

function diagnosticMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: options.metalness ?? 0.18,
    roughness: options.roughness ?? 0.58,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    side: options.side ?? THREE.FrontSide,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

function createFlatGeometry(vertices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addSocket(root, name, position) {
  const socket = new THREE.Object3D();
  socket.name = name;
  socket.position.set(...position);
  root.add(socket);
  return socket;
}

function createDiagnosticFighter({ descriptor }) {
  const hostile = String(descriptor?.role ?? "").includes("bandit");
  const group = new THREE.Group();
  group.name = hostile ? "DIAGNOSTIC_BANDIT" : "DIAGNOSTIC_PLAYER_FIGHTER";
  group.rotation.y = Math.PI / 2;
  group.userData.diagnosticFallback = "procedural://fighter/current";

  const skin = diagnosticMaterial(hostile ? 0xa8afb0 : 0x35566e, {
    metalness: hostile ? 0.72 : 0.42,
    roughness: hostile ? 0.32 : 0.5,
  });
  const dark = diagnosticMaterial(hostile ? 0x3a4143 : 0x172a34, { metalness: 0.45, roughness: 0.44 });
  const canopyMaterial = diagnosticMaterial(0x1b4556, {
    metalness: 0.15,
    roughness: 0.22,
    transparent: true,
    opacity: 0.86,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.55, 6.2, 20), skin);
  body.name = "Fuselage";
  body.rotation.z = -Math.PI / 2;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.43, 1.5, 20), dark);
  nose.name = "Nose";
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 3.82;
  group.add(nose);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.25, 18), skin);
  tailCone.name = "TailCone";
  tailCone.rotation.z = Math.PI / 2;
  tailCone.position.x = -3.7;
  group.add(tailCone);

  const wingGeometry = createFlatGeometry([
    -1.8, 0, 0, 1.1, 0, 0.12, -1.0, 0, 3.15,
    -1.8, 0, 0, -1.0, 0, 3.15, -2.35, 0, 2.8,
    -1.8, 0, 0, -1.0, 0, -3.15, 1.1, 0, -0.12,
    -1.8, 0, 0, -2.35, 0, -2.8, -1.0, 0, -3.15,
  ]);
  const wings = new THREE.Mesh(wingGeometry, diagnosticMaterial(hostile ? 0x969e9f : 0x29485b, {
    metalness: 0.55,
    roughness: 0.4,
    side: THREE.DoubleSide,
  }));
  wings.name = "SweptWings";
  group.add(wings);

  const stabilizer = new THREE.Mesh(createFlatGeometry([
    -3.05, 0.02, 0, -1.95, 0.02, 0, -2.65, 0.02, 1.32,
    -3.05, 0.02, 0, -2.65, 0.02, -1.32, -1.95, 0.02, 0,
  ]), dark);
  stabilizer.name = "Tailplane";
  group.add(stabilizer);

  const fin = new THREE.Mesh(createFlatGeometry([
    -3.05, 0, 0, -1.95, 0, 0, -2.75, 1.45, 0,
  ]), diagnosticMaterial(hostile ? 0x62696a : 0x203b4a, { side: THREE.DoubleSide }));
  fin.name = "VerticalFin";
  group.add(fin);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), canopyMaterial);
  canopy.name = "Canopy";
  canopy.scale.set(1.55, 0.55, 0.72);
  canopy.position.set(0.85, 0.32, 0);
  group.add(canopy);

  addSocket(group, "SOCKET_CAMERA_COCKPIT", [0.78, 0.78, 0]);
  addSocket(group, "SOCKET_MUZZLE_LEFT", [3.05, -0.12, 0.36]);
  addSocket(group, "SOCKET_MUZZLE_RIGHT", [3.05, -0.12, -0.36]);
  return group;
}

function createDiagnosticCarrier() {
  const group = new THREE.Group();
  group.name = "DIAGNOSTIC_STRAIGHT_DECK_CARRIER";
  group.rotation.y = Math.PI / 2;
  group.userData.diagnosticFallback = "procedural://carrier/current";
  const hullMaterial = diagnosticMaterial(0x34444a, { metalness: 0.42, roughness: 0.6 });
  const deckMaterial = diagnosticMaterial(0x555b5d, { metalness: 0.18, roughness: 0.82 });
  const islandMaterial = diagnosticMaterial(0x778184, { metalness: 0.38, roughness: 0.54 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(72, 4.5, 12), hullMaterial);
  hull.name = "Hull";
  hull.position.y = -2.2;
  group.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(78, 0.65, 15), deckMaterial);
  deck.name = "FlightDeck";
  group.add(deck);

  const island = new THREE.Mesh(new THREE.BoxGeometry(10, 5.5, 3.6), islandMaterial);
  island.name = "Island";
  island.position.set(-7, 3.05, -4.8);
  group.add(island);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 5.5, 10), islandMaterial);
  mast.name = "Mast";
  mast.position.set(-7, 8.45, -4.8);
  group.add(mast);

  for (let index = -2; index <= 2; index += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 13.6), diagnosticMaterial(0xe9e1c7, {
      metalness: 0.05,
      roughness: 0.9,
    }));
    line.name = `DeckMarking_${index + 3}`;
    line.position.set(index * 11.5, 0.36, 0);
    group.add(line);
  }

  addSocket(group, "SOCKET_DECK_ORIGIN", [0, 0.42, 0]);
  addSocket(group, "SOCKET_RECOVERY_THRESHOLD", [-29, 0.42, 0]);
  return group;
}

function createDiagnosticSky() {
  const group = new THREE.Group();
  group.name = "DIAGNOSTIC_SKY_PROFILE";
  group.userData.diagnosticFallback = "procedural://environment/sky/current";
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    diagnosticMaterial(0x78a9ba, { side: THREE.DoubleSide, roughness: 1, metalness: 0 }));
  dome.name = "SkyDomePreview";
  group.add(dome);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12),
    diagnosticMaterial(0xffcf7d, { emissive: 0xffb84f, emissiveIntensity: 1.8 }));
  sun.name = "SunPreview";
  sun.position.set(2.6, 2.6, -1.8);
  group.add(sun);
  return group;
}

function createDiagnosticOcean() {
  const group = new THREE.Group();
  group.name = "DIAGNOSTIC_OCEAN_PROFILE";
  group.userData.diagnosticFallback = "procedural://environment/ocean/current";
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10, 12, 12),
    diagnosticMaterial(0x15556b, { metalness: 0.18, roughness: 0.38, side: THREE.DoubleSide }));
  plane.name = "OceanSurfacePreview";
  plane.rotation.x = -Math.PI / 2;
  group.add(plane);
  return group;
}

function createDiagnosticGunEffects() {
  const group = new THREE.Group();
  group.name = "DIAGNOSTIC_GUN_EFFECT";
  group.userData.diagnosticFallback = "procedural://effects/gun/current";
  const tracerMaterial = diagnosticMaterial(0xffb644, {
    emissive: 0xff7b1a,
    emissiveIntensity: 2.4,
    metalness: 0,
    roughness: 0.28,
  });
  for (let index = 0; index < 5; index += 1) {
    const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8), tracerMaterial);
    tracer.name = `Tracer_${index + 1}`;
    tracer.rotation.z = -Math.PI / 2;
    tracer.position.set(index * 1.2 - 2.4, index * 0.16, (index % 2 ? -1 : 1) * 0.22);
    group.add(tracer);
  }
  addSocket(group, "SOCKET_EFFECT_ORIGIN", [-3.7, 0, 0]);
  return group;
}

function createDiagnosticDestruction() {
  const group = new THREE.Group();
  group.name = "DIAGNOSTIC_DESTRUCTION_EFFECT";
  group.userData.diagnosticFallback = "procedural://effects/destruction/current";
  const emberMaterial = diagnosticMaterial(0xf06f32, {
    emissive: 0xd8421b,
    emissiveIntensity: 1.9,
    metalness: 0.05,
    roughness: 0.68,
  });
  for (let index = 0; index < 11; index += 1) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.28 + (index % 3) * 0.12), emberMaterial);
    shard.name = `Debris_${index + 1}`;
    const angle = index / 11 * Math.PI * 2;
    const radius = 0.6 + (index % 4) * 0.42;
    shard.position.set(Math.cos(angle) * radius, (index % 5) * 0.28 - 0.25, Math.sin(angle) * radius);
    shard.rotation.set(angle * 0.4, angle, angle * 0.73);
    group.add(shard);
  }
  return group;
}

const diagnosticFallbackFactories = new Map([
  ["procedural://fighter/current", createDiagnosticFighter],
  ["procedural://carrier/current", createDiagnosticCarrier],
  ["procedural://environment/sky/current", createDiagnosticSky],
  ["procedural://environment/ocean/current", createDiagnosticOcean],
  ["procedural://effects/gun/current", createDiagnosticGunEffects],
  ["procedural://effects/destruction/current", createDiagnosticDestruction],
]);

function createRuntime() {
  return createThreeR160AssetRegistry({
    renderer: state.renderer,
    baseUrl: document.baseURI,
    fallbackFactories: diagnosticFallbackFactories,
    registryOptions: {
      logger: console,
    },
  });
}

function initializeScene() {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x0b1013, 1);
    ui.viewport.append(renderer.domElement);
    state.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1013);
    state.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100000);
    camera.position.set(7, 4.5, 9);
    scene.add(camera);
    state.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.autoRotate = ui.autorotateToggle.checked;
    controls.autoRotateSpeed = 0.72;
    controls.screenSpacePanning = true;
    controls.target.set(0, 1, 0);
    controls.update();
    state.controls = controls;

    const modelRoot = new THREE.Group();
    modelRoot.name = "AssetLabModelRoot";
    scene.add(modelRoot);
    state.modelRoot = modelRoot;

    const socketHelperRoot = new THREE.Group();
    socketHelperRoot.name = "AssetLabSocketHelpers";
    socketHelperRoot.visible = ui.socketToggle.checked;
    scene.add(socketHelperRoot);
    state.socketHelperRoot = socketHelperRoot;

    const grid = new THREE.GridHelper(10, 20, 0x596e76, 0x27363c);
    grid.name = "AssetLabGrid";
    grid.material.transparent = true;
    grid.material.opacity = 0.64;
    scene.add(grid);
    state.grid = grid;

    const axes = new THREE.AxesHelper(1);
    axes.name = "AssetLabAxes";
    scene.add(axes);
    state.axes = axes;

    const hemisphere = new THREE.HemisphereLight(0xb9d4dc, 0x22282b, 1.75);
    scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffe2bd, 3.2);
    key.position.set(6, 9, 7);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x99cfe0, 1.65);
    fill.position.set(-7, 4, 4);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xd5e5ea, 1.25);
    rim.position.set(1, 5, -8);
    scene.add(rim);

    const resize = () => {
      const { width, height } = ui.viewport.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    state.resizeObserver = new ResizeObserver(resize);
    state.resizeObserver.observe(ui.viewport);
    resize();

    let previousTime = performance.now();
    const renderFrame = (time) => {
      const deltaSeconds = Math.min(0.1, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      controls.update(deltaSeconds);
      renderer.render(scene, camera);
      state.frameRequest = requestAnimationFrame(renderFrame);
    };
    state.frameRequest = requestAnimationFrame(renderFrame);
  } catch (error) {
    reportError(error, "WebGL preview unavailable");
    throw error;
  }
}

function disposeHelperTree(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry?.dispose) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) if (material?.dispose) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.clear();
}

async function releaseActiveInstance() {
  state.selectionEpoch += 1;
  const instance = state.instance;
  state.instance = null;
  state.descriptor = null;
  state.activeBinding = null;
  state.activeSelectionKey = null;
  state.bounds = null;
  state.sockets = [];
  state.wireframeStates.clear();
  disposeHelperTree(state.socketHelperRoot);
  state.modelRoot?.clear();
  if (instance) await Promise.resolve(instance.release());
}

async function disposeRuntime({ revokeLocal = true } = {}) {
  await releaseActiveInstance();
  const runtime = state.runtime;
  state.runtime = null;
  state.pack = null;
  if (runtime) await runtime.dispose();
  if (revokeLocal && state.localObjectUrl) {
    URL.revokeObjectURL(state.localObjectUrl);
    state.localObjectUrl = null;
  }
  clearBindings();
  resetInspector();
}

function clearBindings() {
  ui.bindingSelect.replaceChildren(new Option("Load a pack first", ""));
  ui.bindingSelect.disabled = true;
  ui.pixelHeightRange.disabled = true;
  ui.pixelHeightNumber.disabled = true;
  ui.bindingCount.textContent = "0";
  ui.frameButton.disabled = true;
  ui.selectedLod.textContent = "—";
}

function resetInspector() {
  ui.assetTitle.textContent = "No asset selected";
  ui.packIdentity.textContent = "—";
  ui.profileIdentity.textContent = "—";
  ui.bindingIdentity.textContent = "—";
  ui.assetIdentity.textContent = "—";
  for (const element of [
    ui.metricNodes,
    ui.metricMeshes,
    ui.metricDrawCalls,
    ui.metricTriangles,
    ui.metricMaterials,
    ui.metricTextures,
  ]) element.textContent = "—";
  ui.boundsValue.textContent = "—";
  ui.sourceValue.textContent = "—";
  ui.namedNodeCount.textContent = "0";
  replaceList(ui.lodList, [{ text: "—", className: "muted-item" }]);
  replaceList(ui.socketList, [{ text: "—", className: "muted-item" }]);
  replaceList(ui.nodeList, [{ text: "—", className: "muted-item" }]);
  ui.stageEmpty.hidden = false;
}

function populateBindings(pack) {
  const entries = Object.entries(pack.profile?.assets ?? {});
  if (entries.length === 0) {
    throw new Error(`Pack "${pack.id}" has no assetProfile bindings to inspect.`);
  }
  ui.bindingSelect.replaceChildren();
  for (const [bindingId, mapping] of entries) {
    const option = new Option(`${bindingId}  →  ${mapping.assetId}`, bindingId);
    option.title = `${bindingId} → ${mapping.assetId}`;
    ui.bindingSelect.add(option);
  }
  ui.bindingCount.textContent = String(entries.length);
  ui.bindingSelect.disabled = false;
  ui.pixelHeightRange.disabled = false;
  ui.pixelHeightNumber.disabled = false;
  ui.frameButton.disabled = false;
  ui.packIdentity.textContent = pack.id;
  ui.profileIdentity.textContent = pack.profile.id;
  return entries[0][0];
}

async function loadPackUrl(rawReference) {
  if (state.busy) return;
  const reference = rawReference.trim();
  if (!reference) {
    reportError(new Error("Enter a staged pack JSON URL."), "Pack URL required");
    return;
  }
  const epoch = ++state.loadEpoch;
  clearMessage();
  setBusy(true, "Loading pack…");
  try {
    await disposeRuntime();
    if (epoch !== state.loadEpoch) return;
    const runtime = createRuntime();
    state.runtime = runtime;
    const packUrl = new URL(reference, document.baseURI).href;
    const pack = await runtime.registry.loadPack(packUrl);
    if (epoch !== state.loadEpoch) {
      await runtime.dispose();
      return;
    }
    state.pack = pack;
    const firstBinding = populateBindings(pack);
    ui.bindingSelect.value = firstBinding;
    setStatus(`Pack ready · ${pack.id}`, "ready");
    await displayBinding(firstBinding, { force: true });
  } catch (error) {
    if (epoch === state.loadEpoch) {
      await disposeRuntime();
      reportError(error, "Pack load failed");
    }
  } finally {
    if (epoch === state.loadEpoch) setBusy(false);
  }
}

async function readGlbDocument(file) {
  if (!(file instanceof Blob) || !file.name?.toLowerCase().endsWith(".glb")) {
    throw new Error("Choose a .glb file. JSON .gltf plus sidecar files are not supported.");
  }
  if (file.size < 20) throw new Error("The file is too small to be a valid GLB 2.0 container.");
  const header = await file.slice(0, 20).arrayBuffer();
  const view = new DataView(header);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error("The file does not contain the GLB magic header.");
  if (view.getUint32(4, true) !== 2) throw new Error("Only GLB 2.0 is supported.");
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== file.size) {
    throw new Error(`GLB header declares ${declaredLength} bytes, but the file contains ${file.size}.`);
  }
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== GLB_JSON_CHUNK || jsonLength < 2 || 20 + jsonLength > file.size) {
    throw new Error("The first GLB chunk is not a valid JSON document.");
  }
  const jsonText = (await file.slice(20, 20 + jsonLength).text()).replace(/[\u0000\u0020]+$/g, "");
  let documentJson;
  try {
    documentJson = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`The embedded glTF JSON is invalid: ${error.message}`);
  }
  const externalUris = [
    ...(documentJson.buffers ?? []).map((buffer) => buffer?.uri),
    ...(documentJson.images ?? []).map((image) => image?.uri),
  ].filter((uri) => typeof uri === "string" && !uri.startsWith("data:"));
  if (externalUris.length > 0) {
    throw new Error(`The GLB is not self-contained. External URI found: ${externalUris[0]}`);
  }
  return documentJson;
}

function localGlbPack(file, objectUrl) {
  const safeStem = file.name.replace(/\.glb$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "asset";
  return {
    packId: `local-${safeStem}`,
    assetProfile: {
      profileId: "visual.local-glb.v1",
      manifest: {
        manifestId: "manifest.local-glb.v1",
        assets: [
          {
            id: "asset.local-glb.v1",
            kind: "model",
            status: "production",
            lods: [
              {
                level: 0,
                minProjectedPixels: 0,
                source: { uri: objectUrl, format: "glb" },
              },
            ],
          },
        ],
      },
      bindings: [
        {
          presentationId: "presentation.local-glb.v1",
          assetId: "asset.local-glb.v1",
        },
      ],
    },
  };
}

async function loadLocalGlb(file) {
  if (state.busy) return;
  const epoch = ++state.loadEpoch;
  clearMessage();
  setBusy(true, `Checking ${file?.name ?? "GLB"}…`);
  try {
    await readGlbDocument(file);
    await disposeRuntime();
    if (epoch !== state.loadEpoch) return;
    const objectUrl = URL.createObjectURL(file);
    state.localObjectUrl = objectUrl;
    const runtime = createRuntime();
    state.runtime = runtime;
    const pack = await runtime.registry.loadPack(localGlbPack(file, objectUrl));
    if (epoch !== state.loadEpoch) {
      await runtime.dispose();
      URL.revokeObjectURL(objectUrl);
      return;
    }
    state.pack = pack;
    const firstBinding = populateBindings(pack);
    ui.bindingSelect.value = firstBinding;
    setStatus(`Local GLB · ${file.name}`, "ready");
    await displayBinding(firstBinding, { force: true });
  } catch (error) {
    if (epoch === state.loadEpoch) {
      await disposeRuntime();
      reportError(error, "Local GLB load failed");
    }
  } finally {
    if (epoch === state.loadEpoch) setBusy(false);
    ui.glbInput.value = "";
  }
}

function projectedPixelHeight() {
  const value = Number(ui.pixelHeightNumber.value);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function selectionMetadata(bindingId) {
  const registry = state.runtime?.registry;
  if (!registry || !state.pack) throw new Error("Load an asset pack before selecting a binding.");
  const descriptor = registry.getAssetDescriptor(bindingId);
  const mapping = state.pack.profile.assets[bindingId];
  const assetId = mapping?.assetId ?? bindingId;
  let lod = null;
  if (descriptor.kind === "gltf") {
    lod = registry.selectLod(bindingId, projectedPixelHeight());
  }
  const key = `${bindingId}|${assetId}|${lod?.uri ?? descriptor.fallback ?? "procedural"}`;
  return { registry, descriptor, mapping, assetId, lod, key };
}

async function displayBinding(bindingId, { force = false } = {}) {
  if (!bindingId || !state.pack || !state.runtime) return;
  const metadata = selectionMetadata(bindingId);
  const existingInstance = metadata.key === state.activeSelectionKey ? state.instance : null;
  updateLodReadout(metadata.descriptor, metadata.lod, existingInstance);
  if (!force && metadata.key === state.activeSelectionKey && state.instance) return;

  const epoch = ++state.selectionEpoch;
  ui.stageLoading.hidden = false;
  ui.stageLoadingText.textContent = "Instantiating selection…";
  clearMessage();
  try {
    const previous = state.instance;
    state.instance = null;
    state.activeSelectionKey = null;
    state.modelRoot.clear();
    disposeHelperTree(state.socketHelperRoot);
    state.wireframeStates.clear();
    if (previous) await Promise.resolve(previous.release());

    const instance = await metadata.registry.instantiate(bindingId, {
      projectedPixelHeight: projectedPixelHeight(),
    });
    if (epoch !== state.selectionEpoch) {
      await Promise.resolve(instance.release());
      return;
    }

    state.instance = instance;
    state.descriptor = metadata.descriptor;
    state.activeBinding = bindingId;
    state.activeSelectionKey = metadata.key;
    state.modelRoot.add(instance.scene);
    prepareScene(instance.scene, metadata.descriptor);
    applyWireframe(ui.wireframeToggle.checked);
    updateInspector(metadata, instance);
    ui.stageEmpty.hidden = true;
    ui.frameButton.disabled = false;
    setStatus(`${instance.fallback ? "Diagnostic fallback" : "Asset ready"} · ${metadata.assetId}`, "ready");
  } catch (error) {
    if (epoch === state.selectionEpoch) {
      state.activeSelectionKey = null;
      ui.stageEmpty.hidden = state.modelRoot.children.length > 0;
      reportError(error, "Asset instantiation failed");
    }
  } finally {
    if (epoch === state.selectionEpoch) ui.stageLoading.hidden = true;
  }
}

function prepareScene(assetScene, descriptor) {
  assetScene.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(assetScene);
  if (initialBounds.isEmpty()) {
    initialBounds.min.set(-0.5, 0, -0.5);
    initialBounds.max.set(0.5, 1, 0.5);
  }
  const initialCenter = initialBounds.getCenter(new THREE.Vector3());
  assetScene.position.add(new THREE.Vector3(-initialCenter.x, -initialBounds.min.y, -initialCenter.z));
  assetScene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(assetScene);
  if (bounds.isEmpty()) {
    bounds.min.set(-0.5, 0, -0.5);
    bounds.max.set(0.5, 1, 0.5);
  }
  state.bounds = bounds;
  updateWorldHelpers(bounds);
  state.sockets = collectSockets(assetScene, descriptor);
  rebuildSocketHelpers(state.sockets, bounds);
  frameObject();
}

function niceGridSize(value) {
  const safeValue = Math.max(1, value);
  const exponent = Math.floor(Math.log10(safeValue));
  const magnitude = 10 ** exponent;
  const normalized = safeValue / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function updateWorldHelpers(bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  const gridSize = niceGridSize(Math.max(size.x, size.z, size.y * 0.55) * 1.8);
  state.grid.scale.setScalar(gridSize / 10);
  state.grid.position.y = bounds.min.y;
  state.axes.scale.setScalar(Math.max(gridSize * 0.09, 0.1));
  state.axes.position.set(0, bounds.min.y + 0.002, 0);
  const visible = ui.gridToggle.checked;
  state.grid.visible = visible;
  state.axes.visible = visible;
}

function frameObject() {
  if (!state.bounds || !state.camera || !state.controls) return;
  const center = state.bounds.getCenter(new THREE.Vector3());
  const sphere = state.bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.05);
  const verticalFov = THREE.MathUtils.degToRad(state.camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * state.camera.aspect);
  const limitingFov = Math.max(0.1, Math.min(verticalFov, horizontalFov));
  const distance = radius / Math.sin(limitingFov / 2) * 1.18;
  const direction = new THREE.Vector3(1.45, 0.78, 1.8).normalize();
  state.camera.position.copy(center).addScaledVector(direction, distance);
  state.camera.near = Math.max(0.001, distance / 10000);
  state.camera.far = Math.max(100, distance + radius * 60);
  state.camera.updateProjectionMatrix();
  state.controls.target.copy(center);
  state.controls.minDistance = Math.max(radius * 0.035, 0.001);
  state.controls.maxDistance = Math.max(radius * 80, distance * 4);
  state.controls.update();
}

function anchorDefinitions(descriptor) {
  if (!Array.isArray(descriptor?.anchors)) return [];
  return descriptor.anchors.map((anchor) => typeof anchor === "string"
    ? { id: anchor, node: anchor }
    : { id: anchor.id ?? anchor.name ?? anchor.node, node: anchor.node ?? anchor.name ?? anchor.id })
    .filter((anchor) => typeof anchor.id === "string" && typeof anchor.node === "string");
}

function collectSockets(root, descriptor) {
  const anchors = anchorDefinitions(descriptor);
  const anchorsByNode = new Map();
  for (const anchor of anchors) {
    const entries = anchorsByNode.get(anchor.node) ?? [];
    entries.push(anchor.id);
    anchorsByNode.set(anchor.node, entries);
  }
  const sockets = [];
  const matchedNodes = new Set();
  root.traverse((object) => {
    if (!object.name) return;
    const semanticIds = anchorsByNode.get(object.name) ?? [];
    if (semanticIds.length > 0 || SOCKET_NAME_PATTERN.test(object.name)) {
      sockets.push({ node: object.name, semanticIds, object, missing: false });
      matchedNodes.add(object.name);
    }
  });
  for (const anchor of anchors) {
    if (!matchedNodes.has(anchor.node)) {
      sockets.push({ node: anchor.node, semanticIds: [anchor.id], object: null, missing: true });
    }
  }
  sockets.sort((a, b) => Number(a.missing) - Number(b.missing) || a.node.localeCompare(b.node));
  return sockets;
}

function rebuildSocketHelpers(sockets, bounds) {
  disposeHelperTree(state.socketHelperRoot);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const helperSize = Math.max(sphere.radius * 0.075, 0.025);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (const socket of sockets) {
    if (!socket.object) continue;
    socket.object.updateWorldMatrix(true, false);
    socket.object.matrixWorld.decompose(position, quaternion, scale);
    const axes = new THREE.AxesHelper(helperSize);
    axes.name = `Helper_${socket.node}`;
    axes.position.copy(position);
    axes.quaternion.copy(quaternion);
    state.socketHelperRoot.add(axes);
  }
  state.socketHelperRoot.visible = ui.socketToggle.checked;
}

function materialList(material) {
  return Array.isArray(material) ? material : material ? [material] : [];
}

function collectUniformTextures(value, textures, visited, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return;
  if (value.isTexture) {
    textures.add(value);
    return;
  }
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectUniformTextures(item, textures, visited, depth + 1);
    return;
  }
  for (const nested of Object.values(value)) collectUniformTextures(nested, textures, visited, depth + 1);
}

function sceneMetrics(root) {
  let nodes = 0;
  let meshes = 0;
  let drawCalls = 0;
  let triangles = 0;
  const materials = new Set();
  const textures = new Set();
  const namedNodes = [];

  root.traverse((object) => {
    nodes += 1;
    if (object.name) namedNodes.push(`${object.name} · ${object.type}`);
    if (!object.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    if (geometry) {
      const groups = geometry.groups?.length ?? 0;
      drawCalls += Array.isArray(object.material) ? Math.max(1, groups) : 1;
      const elementCount = geometry.index?.count ?? geometry.getAttribute?.("position")?.count ?? 0;
      const instances = object.isInstancedMesh ? object.count : 1;
      triangles += Math.floor(elementCount / 3) * instances;
    }
    for (const material of materialList(object.material)) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
      if (material.uniforms) collectUniformTextures(material.uniforms, textures, new Set());
    }
  });

  namedNodes.sort((a, b) => a.localeCompare(b));
  return { nodes, meshes, drawCalls, triangles, materials: materials.size, textures: textures.size, namedNodes };
}

function applyWireframe(enabled) {
  if (!state.instance?.scene) return;
  state.instance.scene.traverse((object) => {
    for (const material of materialList(object.material)) {
      if (!("wireframe" in material)) continue;
      if (!state.wireframeStates.has(material)) state.wireframeStates.set(material, material.wireframe);
      material.wireframe = enabled ? true : state.wireframeStates.get(material);
      material.needsUpdate = true;
    }
  });
}

function replaceList(list, items) {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = document.createElement("li");
    row.textContent = item.text;
    if (item.className) row.className = item.className;
    if (item.title) row.title = item.title;
    fragment.append(row);
  }
  list.replaceChildren(fragment);
}

function formatScalar(value) {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 1000) return value.toFixed(1);
  if (absolute >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function updateLodReadout(descriptor, selectedLod, instance) {
  if (instance?.fallback) {
    ui.selectedLod.textContent = selectedLod ? `${selectedLod.id} → fallback` : "procedural fallback";
    return;
  }
  if (descriptor.kind !== "gltf") {
    ui.selectedLod.textContent = "procedural";
    return;
  }
  ui.selectedLod.textContent = selectedLod
    ? `${selectedLod.id} · ≥${formatScalar(selectedLod.minProjectedPixelHeight)} px`
    : "—";
}

function updateInspector(metadata, instance) {
  const metrics = sceneMetrics(instance.scene);
  const size = state.bounds.getSize(new THREE.Vector3());
  const center = state.bounds.getCenter(new THREE.Vector3());
  const units = state.pack.manifest?.coordinateSystem?.units ?? "scene units";

  ui.assetTitle.textContent = metadata.assetId;
  ui.packIdentity.textContent = state.pack.id;
  ui.profileIdentity.textContent = state.pack.profile.id;
  ui.bindingIdentity.textContent = state.activeBinding;
  ui.assetIdentity.textContent = metadata.assetId;
  ui.metricNodes.textContent = numberFormatter.format(metrics.nodes);
  ui.metricMeshes.textContent = numberFormatter.format(metrics.meshes);
  ui.metricDrawCalls.textContent = numberFormatter.format(metrics.drawCalls);
  ui.metricTriangles.textContent = numberFormatter.format(metrics.triangles);
  ui.metricMaterials.textContent = numberFormatter.format(metrics.materials);
  ui.metricTextures.textContent = numberFormatter.format(metrics.textures);
  ui.boundsValue.textContent = [
    `size   ${formatScalar(size.x)} × ${formatScalar(size.y)} × ${formatScalar(size.z)} ${units}`,
    `center ${formatScalar(center.x)}, ${formatScalar(center.y)}, ${formatScalar(center.z)}`,
  ].join("\n");

  const selectedLod = instance.lod ?? metadata.lod;
  const selectedSource = selectedLod?.source?.uri ?? selectedLod?.uri ?? instance.sourceUrl;
  const source = instance.fallback
    ? [`fallback · ${instance.fallbackKey}`, selectedSource ? `selected source · ${selectedSource}` : null]
      .filter(Boolean).join("\n")
    : `source · ${selectedSource ?? "unknown"}`;
  ui.sourceValue.textContent = source;
  updateLodReadout(metadata.descriptor, selectedLod, instance);

  if (metadata.descriptor.lods?.length) {
    replaceList(ui.lodList, metadata.descriptor.lods.map((lod) => {
      const isSelected = selectedLod && String(lod.id) === String(selectedLod.id);
      return {
        text: `${lod.id} · ≥${formatScalar(lod.minProjectedPixelHeight)} px · ${lod.source?.uri ?? lod.uri}`,
        className: isSelected ? "selected" : "",
      };
    }));
  } else {
    replaceList(ui.lodList, [{ text: "Procedural asset · no authored LOD table", className: "muted-item" }]);
  }

  if (state.sockets.length) {
    replaceList(ui.socketList, state.sockets.map((socket) => ({
      text: `${socket.node}${socket.semanticIds.length ? ` · ${socket.semanticIds.join(", ")}` : ""}${socket.missing ? " · MISSING" : ""}`,
      className: socket.missing ? "missing" : "",
    })));
  } else {
    replaceList(ui.socketList, [{ text: "No socket-like nodes found", className: "muted-item" }]);
  }

  ui.namedNodeCount.textContent = String(metrics.namedNodes.length);
  replaceList(ui.nodeList, metrics.namedNodes.length
    ? metrics.namedNodes.map((name) => ({ text: name }))
    : [{ text: "No named nodes", className: "muted-item" }]);
}

function scheduleProjectionUpdate() {
  window.clearTimeout(state.projectionTimer);
  state.projectionTimer = window.setTimeout(async () => {
    if (!state.activeBinding || !state.pack) return;
    try {
      const metadata = selectionMetadata(state.activeBinding);
      updateLodReadout(metadata.descriptor, metadata.lod, state.instance);
      await displayBinding(state.activeBinding);
    } catch (error) {
      reportError(error, "LOD selection failed");
    }
  }, 90);
}

function synchronizePixelInputs(source) {
  const raw = Number(source.value);
  const value = Number.isFinite(raw) ? Math.max(0, Math.min(8192, raw)) : 0;
  ui.pixelHeightNumber.value = String(Math.round(value));
  ui.pixelHeightRange.value = String(Math.min(Number(ui.pixelHeightRange.max), Math.round(value)));
  scheduleProjectionUpdate();
}

function hasFileDrag(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function installInteractions() {
  const packQuery = new URLSearchParams(window.location.search).get("pack");
  ui.packUrl.value = packQuery || DEFAULT_PACK_URL;

  ui.packForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadPackUrl(ui.packUrl.value);
  });
  ui.chooseGlbButton.addEventListener("click", () => ui.glbInput.click());
  ui.glbInput.addEventListener("change", () => {
    const [file] = ui.glbInput.files ?? [];
    if (file) void loadLocalGlb(file);
  });
  ui.bindingSelect.addEventListener("change", () => {
    void displayBinding(ui.bindingSelect.value, { force: true });
  });
  ui.pixelHeightRange.addEventListener("input", () => synchronizePixelInputs(ui.pixelHeightRange));
  ui.pixelHeightNumber.addEventListener("input", () => synchronizePixelInputs(ui.pixelHeightNumber));
  ui.frameButton.addEventListener("click", frameObject);
  ui.autorotateToggle.addEventListener("change", () => {
    state.controls.autoRotate = ui.autorotateToggle.checked;
  });
  ui.wireframeToggle.addEventListener("change", () => applyWireframe(ui.wireframeToggle.checked));
  ui.socketToggle.addEventListener("change", () => {
    state.socketHelperRoot.visible = ui.socketToggle.checked;
  });
  ui.gridToggle.addEventListener("change", () => {
    state.grid.visible = ui.gridToggle.checked;
    state.axes.visible = ui.gridToggle.checked;
  });

  window.addEventListener("dragenter", (event) => {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    state.dragDepth += 1;
    ui.dropOverlay.hidden = false;
  });
  window.addEventListener("dragover", (event) => {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (event) => {
    if (!hasFileDrag(event)) return;
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (state.dragDepth === 0) ui.dropOverlay.hidden = true;
  });
  window.addEventListener("drop", (event) => {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    state.dragDepth = 0;
    ui.dropOverlay.hidden = true;
    const files = Array.from(event.dataTransfer.files ?? []);
    const glb = files.find((file) => file.name.toLowerCase().endsWith(".glb"));
    if (glb) void loadLocalGlb(glb);
    else reportError(new Error("Drop a self-contained .glb file."), "Unsupported drop");
  });

  window.addEventListener("pagehide", () => {
    void shutdown();
  }, { once: true });
}

async function shutdown() {
  state.loadEpoch += 1;
  state.selectionEpoch += 1;
  window.clearTimeout(state.projectionTimer);
  cancelAnimationFrame(state.frameRequest);
  state.resizeObserver?.disconnect();
  await disposeRuntime();
  state.controls?.dispose();
  disposeHelperTree(state.socketHelperRoot);
  state.grid?.geometry?.dispose();
  for (const material of materialList(state.grid?.material)) material.dispose?.();
  state.axes?.geometry?.dispose();
  for (const material of materialList(state.axes?.material)) material.dispose?.();
  state.renderer?.dispose();
}

function start() {
  resetInspector();
  initializeScene();
  installInteractions();
  setStatus("Ready to inspect", "idle");
  void loadPackUrl(ui.packUrl.value);
}

start();
