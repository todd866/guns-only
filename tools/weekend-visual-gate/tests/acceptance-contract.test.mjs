import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CAPTURE_HEIGHT,
  CAPTURE_WIDTH,
  WeekendAcceptanceError,
  loadAcceptanceContract,
  sha256,
  validateAcceptanceContract,
  validateCaptureManifest,
} from "../acceptance-contract.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);

function fixtureContract() {
  return {
    schema: "guns-only.weekend-visual-acceptance.v1",
    serialization: "canonical-json-v1",
    capture: {
      width_px: CAPTURE_WIDTH,
      height_px: CAPTURE_HEIGHT,
      opaque: true,
      vertical_fov_deg: 68,
      aspect: 1.6,
      near_m: 0.25,
      far_m: 24_000,
      anti_aliasing_samples: 4,
      output_color_space: "srgb",
      tone_mapping: "three-r160-aces-filmic",
      tone_mapping_exposure: 1.04,
    },
    coordinate_system: {
      handedness: "right",
      right: "+x/east",
      up: "+y/up",
      forward: "-z/north",
      units: "metres",
      unity_conversion: "same-numeric-rendered-scene-xyz",
      unity_projection_x_sign: -1,
      unity_invert_culling: true,
    },
    scenes: {
      circuit: {
        schema: "guns-only.weekend-track-day-scene.v1",
        root_name: "weekend-track-day",
        leaf_count: 110,
        semantic_sha256: A,
        file_sha256: B,
      },
      open_road: {
        schema: "guns-only.weekend-road-network.v1",
        id: "weekend-hinterland.open-road.v1",
        root_name: "weekend-open-road-network",
        road_count: 8,
        roadside_instance_count: 144,
        file_sha256: A,
      },
    },
    assets: [
      { id: "environment.texture.weekend-track-asphalt.v1", sha256: "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713" },
      { id: "environment.texture.weekend-hinterland-ground.v1", sha256: "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1" },
      { id: "environment.texture.weekend-field-landcover.v1", sha256: "9b6b3cb7ee30f81ea485dd2fa1f3b18d04a17e03285c284f27b3ec0538be542d" },
      { id: "environment.foliage.weekend-roadside-atlas.v1", sha256: "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf" },
    ],
    views: [
      ["grid-straight", [1, 2, 3], [4, 5, 6]],
      ["corner-context", [7, 8, 9], [10, 11, 12]],
      ["paddock-road-junction", [13, 14, 15], [16, 17, 18]],
    ].map(([id, position_m, target_m], index) => ({
      id,
      web_file: `${id}.png`,
      unity_file: `weekend_world_${String(index).padStart(2, "0")}_${id}.png`,
      position_m,
      target_m,
      up: [0, 1, 0],
    })),
  };
}

function fixtureManifest(renderer, contract, contractSha) {
  return {
    schema: "guns-only.weekend-visual-capture.v1",
    renderer,
    acceptance_contract_sha256: contractSha,
    width_px: CAPTURE_WIDTH,
    height_px: CAPTURE_HEIGHT,
    opaque: true,
    vertical_fov_deg: 68,
    aspect: 1.6,
    scenes: {
      circuit_semantic_sha256: contract.scenes.circuit.semantic_sha256,
      circuit_file_sha256: contract.scenes.circuit.file_sha256,
      open_road_file_sha256: contract.scenes.open_road.file_sha256,
    },
    views: contract.views.map((view) => ({
      id: view.id,
      file: renderer === "web" ? view.web_file : view.unity_file,
      position_m: [...view.position_m],
      target_m: [...view.target_m],
    })),
  };
}

test("acceptance contract fixes three renderer-neutral 1600x1000 views", () => {
  const contract = fixtureContract();
  assert.equal(validateAcceptanceContract(contract), contract);
  assert.deepEqual(contract.views.map((view) => view.id), [
    "grid-straight",
    "corner-context",
    "paddock-road-junction",
  ]);
});

test("acceptance contract rejects camera, scene and view drift", () => {
  const fov = fixtureContract();
  fov.capture.vertical_fov_deg = 67;
  assert.throws(() => validateAcceptanceContract(fov), /vertical_fov_deg/);

  const scene = fixtureContract();
  scene.scenes.circuit.semantic_sha256 = "not-a-hash";
  assert.throws(() => validateAcceptanceContract(scene), /lowercase SHA-256/);

  const pose = fixtureContract();
  pose.views[1].position_m[0] = Number.NaN;
  assert.throws(() => validateAcceptanceContract(pose), /three finite numbers/);
});

test("capture manifests fail closed on renderer, contract hash and pose drift", () => {
  const contract = fixtureContract();
  const loaded = { contract, sha256: B };
  assert.equal(validateCaptureManifest(fixtureManifest("web", contract, B), "web", loaded).renderer, "web");

  const wrongHash = fixtureManifest("web", contract, A);
  assert.throws(
    () => validateCaptureManifest(wrongHash, "web", loaded),
    (error) => error instanceof WeekendAcceptanceError && /acceptance_contract_sha256/.test(error.message),
  );

  const wrongScene = fixtureManifest("unity", contract, B);
  wrongScene.scenes.circuit_semantic_sha256 = B;
  assert.throws(() => validateCaptureManifest(wrongScene, "unity", loaded), /circuit_semantic_sha256/);

  const wrongPose = fixtureManifest("unity", contract, B);
  wrongPose.views[2].target_m[2] += 0.001;
  assert.throws(() => validateCaptureManifest(wrongPose, "unity", loaded), /fixed acceptance pose/);
});

test("contract loader hashes the exact JSON bytes used by both renderers", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "weekend-acceptance-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "contract.json");
  const bytes = Buffer.from(`${JSON.stringify(fixtureContract())}\n`);
  await writeFile(path, bytes);
  const loaded = await loadAcceptanceContract(path);
  assert.equal(loaded.sha256, sha256(bytes));
  assert.equal(loaded.contract.views.length, 3);
});
