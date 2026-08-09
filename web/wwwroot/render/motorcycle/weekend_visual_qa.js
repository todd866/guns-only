/**
 * Query-param-only clean-world camera seam for deterministic Weekend Web↔Unity QA.
 * It cannot mutate route/simulation authority and is inert unless `visualQa=world` is present.
 */

export const WEEKEND_VISUAL_QA_QUERY = "world";
export const WEEKEND_VISUAL_ACCEPTANCE_URL =
  "/content/packs/weekend-ride/qa/weekend-visual-acceptance.v1.json?v=299";
export const WEEKEND_CIRCUIT_SCENE_URL =
  "/content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json?v=299";
export const WEEKEND_OPEN_ROAD_CONTRACT_URL =
  "/content/packs/weekend-ride/environment/roads/weekend-hinterland-road-network.v1.json?v=299";

const ACCEPTANCE_SCHEMA = "guns-only.weekend-visual-acceptance.v1";
const CIRCUIT_SCHEMA = "guns-only.weekend-track-day-scene.v1";
const ROAD_SCHEMA = "guns-only.weekend-road-network.v1";
const WIDTH = 1_600;
const HEIGHT = 1_000;

export function weekendVisualQaRequested(search = globalThis.location?.search ?? "") {
  return new URLSearchParams(search).get("visualQa") === WEEKEND_VISUAL_QA_QUERY;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function fetchPinnedJson(url, label) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${label} fetch failed (${response.status}).`);
  const bytes = await response.arrayBuffer();
  let value;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
  return Object.freeze({ value, sha256: await sha256(bytes) });
}

function same(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} changed (expected ${expected}, got ${actual}).`);
}

function textureStatus(texture) {
  const image = texture?.source?.data ?? texture?.image ?? null;
  const width = Number(image?.naturalWidth ?? image?.videoWidth ?? image?.width ?? 0);
  const height = Number(image?.naturalHeight ?? image?.videoHeight ?? image?.height ?? 0);
  const complete = image?.complete === undefined ? width > 0 && height > 0 : image.complete === true;
  return Object.freeze({ name: texture?.name ?? "", width, height, complete });
}

function validateView(view, index) {
  const ids = ["grid-straight", "corner-context", "paddock-road-junction"];
  same(view?.id, ids[index], `acceptance.views[${index}].id`);
  same(view?.web_file, `${ids[index]}.png`, `acceptance.views[${index}].web_file`);
  same(
    view?.unity_file,
    `weekend_world_${String(index).padStart(2, "0")}_${ids[index]}.png`,
    `acceptance.views[${index}].unity_file`,
  );
  for (const field of ["position_m", "target_m"]) {
    if (!Array.isArray(view?.[field])
        || view[field].length !== 3
        || !view[field].every(Number.isFinite)) {
      throw new Error(`acceptance.views[${index}].${field} is not a finite vector.`);
    }
  }
}

function validateContracts(acceptance, circuit, road, circuitFileSha, roadFileSha) {
  same(acceptance?.schema, ACCEPTANCE_SCHEMA, "acceptance.schema");
  same(acceptance?.capture?.width_px, WIDTH, "acceptance.capture.width_px");
  same(acceptance?.capture?.height_px, HEIGHT, "acceptance.capture.height_px");
  same(acceptance?.capture?.opaque, true, "acceptance.capture.opaque");
  same(acceptance?.capture?.vertical_fov_deg, 68, "acceptance.capture.vertical_fov_deg");
  same(acceptance?.capture?.aspect, 1.6, "acceptance.capture.aspect");
  same(acceptance?.capture?.near_m, 0.25, "acceptance.capture.near_m");
  same(acceptance?.capture?.far_m, 24_000, "acceptance.capture.far_m");
  same(acceptance?.capture?.output_color_space, "srgb", "acceptance.capture.output_color_space");
  same(
    acceptance?.coordinate_system?.unity_projection_x_sign,
    -1,
    "acceptance.coordinate_system.unity_projection_x_sign",
  );
  same(
    acceptance?.coordinate_system?.unity_invert_culling,
    true,
    "acceptance.coordinate_system.unity_invert_culling",
  );
  if (!Array.isArray(acceptance.views) || acceptance.views.length !== 3) {
    throw new Error("Weekend visual acceptance requires exactly three views.");
  }
  acceptance.views.forEach(validateView);

  same(circuit?.schema, CIRCUIT_SCHEMA, "circuit.schema");
  same(circuit?.semantic_sha256, acceptance.scenes?.circuit?.semantic_sha256, "circuit.semantic_sha256");
  same(circuitFileSha, acceptance.scenes?.circuit?.file_sha256, "circuit file SHA-256");
  same(circuit?.scene?.root_name, acceptance.scenes?.circuit?.root_name, "circuit.scene.root_name");
  same(circuit?.scene?.leaf_count, acceptance.scenes?.circuit?.leaf_count, "circuit.scene.leaf_count");

  same(road?.schema, ROAD_SCHEMA, "road.schema");
  same(road?.id, acceptance.scenes?.open_road?.id, "road.id");
  same(roadFileSha, acceptance.scenes?.open_road?.file_sha256, "road file SHA-256");
  same(road?.roads?.length, acceptance.scenes?.open_road?.road_count, "road count");
  same(
    road?.roadside_instances?.length,
    acceptance.scenes?.open_road?.roadside_instance_count,
    "roadside instance count",
  );
}

export function createWeekendVisualQa({
  THREE,
  renderer,
  scene,
  camera,
  canvas,
  r1Object,
  getTrackPresentation,
  getOpenRoadPresentation,
  textures,
  search,
}) {
  if (!weekendVisualQaRequested(search)) return null;

  let active = false;
  let ready = false;
  let failure = "";
  let loaded = null;
  let currentView = null;
  const original = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    up: camera.up.clone(),
    fov: camera.fov,
    aspect: camera.aspect,
    near: camera.near,
    far: camera.far,
    r1Visible: r1Object.visible,
  };

  const api = {
    get active() { return active; },
    get ready() { return refreshReady(); },
    get failure() { return failure; },
    get contract() { return loaded?.acceptance ?? null; },
    diagnostics,
    park,
    render,
    restore,
  };
  globalThis.__gunsOnlyWeekendVisualQa = api;

  Promise.all([
    fetchPinnedJson(WEEKEND_VISUAL_ACCEPTANCE_URL, "Weekend visual acceptance"),
    fetchPinnedJson(WEEKEND_CIRCUIT_SCENE_URL, "Weekend circuit scene"),
    fetchPinnedJson(WEEKEND_OPEN_ROAD_CONTRACT_URL, "Weekend open-road contract"),
  ]).then(([acceptanceFile, circuitFile, roadFile]) => {
    validateContracts(
      acceptanceFile.value,
      circuitFile.value,
      roadFile.value,
      circuitFile.sha256,
      roadFile.sha256,
    );
    loaded = Object.freeze({
      acceptance: acceptanceFile.value,
      acceptanceSha256: acceptanceFile.sha256,
      circuit: circuitFile.value,
      circuitFileSha256: circuitFile.sha256,
      road: roadFile.value,
      roadFileSha256: roadFile.sha256,
    });
    const track = getTrackPresentation();
    const openRoad = getOpenRoadPresentation();
    same(track?.object3d?.name, "weekend-track-day", "live circuit root");
    same(track?.plan?.schema, "guns-only.weekend-track-day-presentation.v1", "live circuit plan");
    same(openRoad?.object3d?.name, "weekend-open-road-network", "live open-road root");
    same(openRoad?.plan?.schema, "guns-only.weekend-open-road-presentation.v1", "live open-road plan");
    refreshReady();
  }).catch((error) => {
    failure = error instanceof Error ? error.message : String(error);
    console.error("[Weekend visual QA]", error);
  });

  function diagnostics() {
    refreshReady();
    const drawingBuffer = new THREE.Vector2();
    renderer.getDrawingBufferSize(drawingBuffer);
    const context = renderer.getContext();
    const contextAttributes = context.getContextAttributes();
    const track = getTrackPresentation();
    const openRoad = getOpenRoadPresentation();
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    const cameraScreenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    return Object.freeze({
      active,
      ready,
      failure,
      acceptanceContractSha256: loaded?.acceptanceSha256 ?? null,
      circuitSemanticSha256: loaded?.circuit?.semantic_sha256 ?? null,
      circuitFileSha256: loaded?.circuitFileSha256 ?? null,
      openRoadFileSha256: loaded?.roadFileSha256 ?? null,
      circuitRoot: track?.object3d?.name ?? null,
      circuitPlanSchema: track?.plan?.schema ?? null,
      openRoadRoot: openRoad?.object3d?.name ?? null,
      openRoadPlanSchema: openRoad?.plan?.schema ?? null,
      roadCount: openRoad?.plan?.roads?.length ?? null,
      roadsideInstanceCount: openRoad?.plan?.roadside?.instances?.length ?? null,
      ownshipVisible: r1Object.visible,
      currentView: currentView?.id ?? null,
      textures: textures.map(textureStatus),
      canvas: {
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        backingWidth: drawingBuffer.x,
        backingHeight: drawingBuffer.y,
      },
      output: {
        antiAliasingSamples: context.getParameter(context.SAMPLES),
        alpha: contextAttributes?.alpha ?? null,
        clearAlpha: renderer.getClearAlpha(),
        srgb: renderer.outputColorSpace === THREE.SRGBColorSpace,
        acesFilmic: renderer.toneMapping === THREE.ACESFilmicToneMapping,
        exposure: renderer.toneMappingExposure,
      },
      camera: {
        fov: camera.fov,
        aspect: camera.aspect,
        near: camera.near,
        far: camera.far,
        position_m: camera.position.toArray(),
        forward_unit: cameraForward.toArray(),
        screen_up_unit: cameraScreenUp.toArray(),
      },
    });
  }

  function refreshReady() {
    if (!loaded || failure) {
      ready = false;
      return false;
    }
    ready = textures.every((texture) => textureStatus(texture).complete);
    return ready;
  }

  function park(viewId) {
    if (!refreshReady() || !loaded) {
      throw new Error(failure || "Weekend visual QA is not ready; world textures are still decoding.");
    }
    const view = loaded.acceptance.views.find((candidate) => candidate.id === viewId);
    if (!view) throw new Error(`Unknown Weekend acceptance view '${viewId}'.`);
    const drawingBuffer = new THREE.Vector2();
    renderer.getDrawingBufferSize(drawingBuffer);
    if (canvas.clientWidth !== WIDTH || canvas.clientHeight !== HEIGHT
        || drawingBuffer.x !== WIDTH || drawingBuffer.y !== HEIGHT) {
      throw new Error(`Weekend clean plate must be exact ${WIDTH}x${HEIGHT}.`);
    }
    active = true;
    currentView = view;
    r1Object.visible = false;
    camera.fov = loaded.acceptance.capture.vertical_fov_deg;
    camera.aspect = loaded.acceptance.capture.aspect;
    camera.near = loaded.acceptance.capture.near_m;
    camera.far = loaded.acceptance.capture.far_m;
    camera.up.fromArray(view.up);
    camera.position.fromArray(view.position_m);
    camera.lookAt(new THREE.Vector3().fromArray(view.target_m));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    render();
    return diagnostics();
  }

  function render() {
    if (!active) return false;
    renderer.render(scene, camera);
    return true;
  }

  function restore() {
    active = false;
    currentView = null;
    r1Object.visible = original.r1Visible;
    camera.position.copy(original.position);
    camera.quaternion.copy(original.quaternion);
    camera.up.copy(original.up);
    camera.fov = original.fov;
    camera.aspect = original.aspect;
    camera.near = original.near;
    camera.far = original.far;
    camera.updateProjectionMatrix();
  }

  return api;
}
