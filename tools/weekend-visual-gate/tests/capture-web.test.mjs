import assert from "node:assert/strict";
import test from "node:test";
import { buildWebCaptureManifest, validateWebDiagnostics } from "../capture-web.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);

function loadedContract() {
  return {
    sha256: A,
    contract: {
      capture: { vertical_fov_deg: 68, aspect: 1.6 },
      scenes: {
        circuit: { semantic_sha256: B, file_sha256: A },
        open_road: { file_sha256: B },
      },
      views: [
        { id: "grid-straight", web_file: "grid-straight.png", position_m: [1, 2, 3], target_m: [4, 5, 6], up: [0, 1, 0] },
        { id: "corner-context", web_file: "corner-context.png", position_m: [7, 8, 9], target_m: [10, 11, 12], up: [0, 1, 0] },
        { id: "paddock-road-junction", web_file: "paddock-road-junction.png", position_m: [13, 14, 15], target_m: [16, 17, 18], up: [0, 1, 0] },
      ],
    },
  };
}

function diagnostics() {
  const direction = [3, 3, 3];
  const range = Math.hypot(...direction);
  return {
    active: true,
    ready: true,
    failure: "",
    acceptanceContractSha256: A,
    circuitSemanticSha256: B,
    circuitFileSha256: A,
    openRoadFileSha256: B,
    circuitRoot: "weekend-track-day",
    openRoadRoot: "weekend-open-road-network",
    roadCount: 8,
    roadsideInstanceCount: 144,
    ownshipVisible: false,
    currentView: "grid-straight",
    textures: [
      { name: "TEX_WEEKEND_TRACK_ASPHALT_V1", width: 1024, height: 1024, complete: true },
      { name: "TEX_WEEKEND_HINTERLAND_GROUND_V1", width: 1024, height: 1024, complete: true },
      { name: "TEX_WEEKEND_FIELD_LANDCOVER_V1", width: 1024, height: 1024, complete: true },
      { name: "TEX_WEEKEND_ROADSIDE_ATLAS_V1", width: 1024, height: 1024, complete: true },
    ],
    canvas: { clientWidth: 1600, clientHeight: 1000, backingWidth: 1600, backingHeight: 1000 },
    output: { antiAliasingSamples: 4, alpha: true, clearAlpha: 1, srgb: true, acesFilmic: true, exposure: 1.04 },
    camera: {
      fov: 68,
      aspect: 1.6,
      near: 0.25,
      far: 24000,
      position_m: [1, 2, 3],
      forward_unit: direction.map((channel) => channel / range),
      screen_up_unit: [-1 / Math.sqrt(6), 2 / Math.sqrt(6), -1 / Math.sqrt(6)],
    },
  };
}

test("Web capture diagnostics require exact clean-world scene and buffers", () => {
  const loaded = loadedContract();
  const exact = diagnostics();
  assert.equal(validateWebDiagnostics(exact, loaded, "grid-straight"), exact);

  const ownship = diagnostics();
  ownship.ownshipVisible = true;
  assert.throws(() => validateWebDiagnostics(ownship, loaded, "grid-straight"), /R1 ownship visibility/);

  const size = diagnostics();
  size.canvas.backingWidth = 1599;
  assert.throws(() => validateWebDiagnostics(size, loaded, "grid-straight"), /canvas backing width/);

  const samples = diagnostics();
  samples.output.antiAliasingSamples = 2;
  assert.throws(() => validateWebDiagnostics(samples, loaded, "grid-straight"), /anti-aliasing samples/);

  const pose = diagnostics();
  pose.camera.forward_unit[0] *= -1;
  assert.throws(() => validateWebDiagnostics(pose, loaded, "grid-straight"), /live camera forward/);

  const roll = diagnostics();
  roll.camera.screen_up_unit[1] *= -1;
  assert.throws(() => validateWebDiagnostics(roll, loaded, "grid-straight"), /live camera screen up/);

  const texture = diagnostics();
  texture.textures[2].complete = false;
  assert.throws(() => validateWebDiagnostics(texture, loaded, "grid-straight"), /not exact\/ready/);
});

test("Web capture manifest carries exact contract, scene hashes and fixed filenames", () => {
  const manifest = buildWebCaptureManifest(loadedContract());
  assert.equal(manifest.schema, "guns-only.weekend-visual-capture.v1");
  assert.equal(manifest.renderer, "web");
  assert.equal(manifest.acceptance_contract_sha256, A);
  assert.deepEqual(manifest.views.map((view) => view.file), [
    "grid-straight.png",
    "corner-context.png",
    "paddock-road-junction.png",
  ]);
});
