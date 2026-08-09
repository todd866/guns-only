import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ACCEPTANCE_SCHEMA = "guns-only.weekend-visual-acceptance.v1";
export const CAPTURE_MANIFEST_SCHEMA = "guns-only.weekend-visual-capture.v1";
export const CAPTURE_WIDTH = 1_600;
export const CAPTURE_HEIGHT = 1_000;
export const VIEW_IDS = Object.freeze([
  "grid-straight",
  "corner-context",
  "paddock-road-junction",
]);

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ACCEPTANCE_CONTRACT_PATH = resolve(
  MODULE_DIR,
  "../../content/packs/weekend-ride/qa/weekend-visual-acceptance.v1.json",
);

export class WeekendAcceptanceError extends Error {
  constructor(message) {
    super(message);
    this.name = "WeekendAcceptanceError";
  }
}

function requireExact(value, expected, label) {
  if (value !== expected) {
    throw new WeekendAcceptanceError(`${label} must be ${JSON.stringify(expected)}; got ${JSON.stringify(value)}.`);
  }
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new WeekendAcceptanceError(`${label} must be a lowercase SHA-256 hex digest.`);
  }
}

function requireVector3(value, label) {
  if (!Array.isArray(value)
      || value.length !== 3
      || !value.every((channel) => Number.isFinite(channel))) {
    throw new WeekendAcceptanceError(`${label} must contain three finite numbers.`);
  }
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateAcceptanceContract(contract) {
  if (!contract || typeof contract !== "object") {
    throw new WeekendAcceptanceError("Weekend acceptance contract must be a JSON object.");
  }
  requireExact(contract.schema, ACCEPTANCE_SCHEMA, "contract.schema");
  requireExact(contract.serialization, "canonical-json-v1", "contract.serialization");

  const capture = contract.capture;
  requireExact(capture?.width_px, CAPTURE_WIDTH, "capture.width_px");
  requireExact(capture?.height_px, CAPTURE_HEIGHT, "capture.height_px");
  requireExact(capture?.opaque, true, "capture.opaque");
  requireExact(capture?.vertical_fov_deg, 68, "capture.vertical_fov_deg");
  requireExact(capture?.aspect, 1.6, "capture.aspect");
  requireExact(capture?.near_m, 0.25, "capture.near_m");
  requireExact(capture?.far_m, 24_000, "capture.far_m");
  requireExact(capture?.anti_aliasing_samples, 4, "capture.anti_aliasing_samples");
  requireExact(capture?.output_color_space, "srgb", "capture.output_color_space");
  requireExact(capture?.tone_mapping, "three-r160-aces-filmic", "capture.tone_mapping");
  requireExact(capture?.tone_mapping_exposure, 1.04, "capture.tone_mapping_exposure");

  const axes = contract.coordinate_system;
  requireExact(axes?.handedness, "right", "coordinate_system.handedness");
  requireExact(axes?.right, "+x/east", "coordinate_system.right");
  requireExact(axes?.up, "+y/up", "coordinate_system.up");
  requireExact(axes?.forward, "-z/north", "coordinate_system.forward");
  requireExact(axes?.units, "metres", "coordinate_system.units");
  requireExact(
    axes?.unity_conversion,
    "same-numeric-rendered-scene-xyz",
    "coordinate_system.unity_conversion",
  );
  requireExact(axes?.unity_projection_x_sign, -1, "coordinate_system.unity_projection_x_sign");
  requireExact(axes?.unity_invert_culling, true, "coordinate_system.unity_invert_culling");

  const scenes = contract.scenes;
  requireExact(scenes?.circuit?.schema, "guns-only.weekend-track-day-scene.v1", "scenes.circuit.schema");
  requireExact(scenes?.circuit?.root_name, "weekend-track-day", "scenes.circuit.root_name");
  requireExact(scenes?.circuit?.leaf_count, 110, "scenes.circuit.leaf_count");
  requireSha256(scenes?.circuit?.semantic_sha256, "scenes.circuit.semantic_sha256");
  requireSha256(scenes?.circuit?.file_sha256, "scenes.circuit.file_sha256");
  requireExact(scenes?.open_road?.schema, "guns-only.weekend-road-network.v1", "scenes.open_road.schema");
  requireExact(scenes?.open_road?.id, "weekend-hinterland.open-road.v1", "scenes.open_road.id");
  requireExact(scenes?.open_road?.root_name, "weekend-open-road-network", "scenes.open_road.root_name");
  requireExact(scenes?.open_road?.road_count, 8, "scenes.open_road.road_count");
  requireExact(scenes?.open_road?.roadside_instance_count, 144, "scenes.open_road.roadside_instance_count");
  requireSha256(scenes?.open_road?.file_sha256, "scenes.open_road.file_sha256");

  const assets = Array.from(contract.assets ?? []);
  const expectedAssets = new Map([
    ["environment.texture.weekend-track-asphalt.v1", "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713"],
    ["environment.texture.weekend-hinterland-ground.v1", "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1"],
    ["environment.texture.weekend-field-landcover.v1", "9b6b3cb7ee30f81ea485dd2fa1f3b18d04a17e03285c284f27b3ec0538be542d"],
    ["environment.foliage.weekend-roadside-atlas.v1", "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf"],
  ]);
  if (assets.length !== expectedAssets.size) {
    throw new WeekendAcceptanceError("Weekend acceptance contract must pin exactly four world assets.");
  }
  for (const asset of assets) {
    const expectedSha = expectedAssets.get(asset?.id);
    if (!expectedSha || asset.sha256 !== expectedSha) {
      throw new WeekendAcceptanceError(`Unexpected Weekend asset identity '${asset?.id ?? ""}'.`);
    }
    expectedAssets.delete(asset.id);
  }
  if (expectedAssets.size !== 0) {
    throw new WeekendAcceptanceError("Weekend acceptance contract omitted a required world asset.");
  }

  const views = Array.from(contract.views ?? []);
  if (views.length !== VIEW_IDS.length) {
    throw new WeekendAcceptanceError(`Weekend acceptance contract must define exactly ${VIEW_IDS.length} views.`);
  }
  const files = new Set();
  for (let index = 0; index < views.length; index++) {
    const view = views[index];
    requireExact(view?.id, VIEW_IDS[index], `views[${index}].id`);
    requireExact(view?.web_file, `${view.id}.png`, `views[${index}].web_file`);
    requireExact(
      view?.unity_file,
      `weekend_world_${String(index).padStart(2, "0")}_${view.id}.png`,
      `views[${index}].unity_file`,
    );
    requireVector3(view?.position_m, `views[${index}].position_m`);
    requireVector3(view?.target_m, `views[${index}].target_m`);
    requireExact(JSON.stringify(view?.up), JSON.stringify([0, 1, 0]), `views[${index}].up`);
    const range = Math.hypot(
      view.target_m[0] - view.position_m[0],
      view.target_m[1] - view.position_m[1],
      view.target_m[2] - view.position_m[2],
    );
    if (!(range > 1)) throw new WeekendAcceptanceError(`views[${index}] camera range is degenerate.`);
    if (files.has(view.web_file) || files.has(view.unity_file)) {
      throw new WeekendAcceptanceError("Weekend acceptance view filenames must be unique.");
    }
    files.add(view.web_file);
    files.add(view.unity_file);
  }
  return contract;
}

export async function loadAcceptanceContract(path = DEFAULT_ACCEPTANCE_CONTRACT_PATH) {
  const resolvedPath = resolve(path);
  let bytes;
  try {
    bytes = await readFile(resolvedPath);
  } catch (error) {
    throw new WeekendAcceptanceError(`Cannot read Weekend acceptance contract '${resolvedPath}': ${error.message}`);
  }
  let contract;
  try {
    contract = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new WeekendAcceptanceError(`Weekend acceptance contract is not valid JSON: ${error.message}`);
  }
  validateAcceptanceContract(contract);
  return Object.freeze({ path: resolvedPath, bytes, sha256: sha256(bytes), contract });
}

function sameVector(actual, expected, label) {
  requireVector3(actual, label);
  for (let index = 0; index < 3; index++) {
    if (Math.abs(actual[index] - expected[index]) > 1e-9) {
      throw new WeekendAcceptanceError(`${label} differs from the fixed acceptance pose.`);
    }
  }
}

export function validateCaptureManifest(manifest, renderer, loadedContract) {
  if (!manifest || typeof manifest !== "object") {
    throw new WeekendAcceptanceError(`${renderer} capture manifest must be a JSON object.`);
  }
  requireExact(manifest.schema, CAPTURE_MANIFEST_SCHEMA, `${renderer}.schema`);
  requireExact(manifest.renderer, renderer, `${renderer}.renderer`);
  requireExact(
    manifest.acceptance_contract_sha256,
    loadedContract.sha256,
    `${renderer}.acceptance_contract_sha256`,
  );
  requireExact(manifest.width_px, CAPTURE_WIDTH, `${renderer}.width_px`);
  requireExact(manifest.height_px, CAPTURE_HEIGHT, `${renderer}.height_px`);
  requireExact(manifest.opaque, true, `${renderer}.opaque`);
  requireExact(manifest.vertical_fov_deg, 68, `${renderer}.vertical_fov_deg`);
  requireExact(manifest.aspect, 1.6, `${renderer}.aspect`);
  requireExact(
    manifest.scenes?.circuit_semantic_sha256,
    loadedContract.contract.scenes.circuit.semantic_sha256,
    `${renderer}.scenes.circuit_semantic_sha256`,
  );
  requireExact(
    manifest.scenes?.circuit_file_sha256,
    loadedContract.contract.scenes.circuit.file_sha256,
    `${renderer}.scenes.circuit_file_sha256`,
  );
  requireExact(
    manifest.scenes?.open_road_file_sha256,
    loadedContract.contract.scenes.open_road.file_sha256,
    `${renderer}.scenes.open_road_file_sha256`,
  );

  const views = Array.from(manifest.views ?? []);
  if (views.length !== VIEW_IDS.length) {
    throw new WeekendAcceptanceError(`${renderer} capture manifest must contain exactly three views.`);
  }
  for (let index = 0; index < views.length; index++) {
    const expected = loadedContract.contract.views[index];
    const view = views[index];
    requireExact(view?.id, expected.id, `${renderer}.views[${index}].id`);
    requireExact(
      view?.file,
      renderer === "web" ? expected.web_file : expected.unity_file,
      `${renderer}.views[${index}].file`,
    );
    sameVector(view?.position_m, expected.position_m, `${renderer}.views[${index}].position_m`);
    sameVector(view?.target_m, expected.target_m, `${renderer}.views[${index}].target_m`);
  }
  return manifest;
}
