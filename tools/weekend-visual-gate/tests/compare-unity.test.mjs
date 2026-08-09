import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CAPTURE_HEIGHT,
  CAPTURE_WIDTH,
  DEFAULT_THRESHOLDS,
  compareCaptureImages,
  runComparison,
  validateCaptureImage,
} from "../compare-unity.mjs";
import { sha256 } from "../acceptance-contract.mjs";

const require = createRequire(new URL("../../cobra-scenery-gate/package.json", import.meta.url));
const { PNG } = require("pngjs");
const A = "a".repeat(64);
const B = "b".repeat(64);
const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function imageFixture() {
  const data = Buffer.alloc(CAPTURE_WIDTH * CAPTURE_HEIGHT * 4);
  for (let y = 0; y < CAPTURE_HEIGHT; y++) {
    for (let x = 0; x < CAPTURE_WIDTH; x++) {
      const offset = (y * CAPTURE_WIDTH + x) * 4;
      const road = Math.abs(x - 250 - y * 0.65) < 62;
      const verge = y > 280 + 70 * Math.sin(x / 150);
      data[offset] = road ? 45 : verge ? 83 : 105;
      data[offset + 1] = road ? 51 : verge ? 112 : 145;
      data[offset + 2] = road ? 49 : verge ? 66 : 160;
      if ((x - 1_190) ** 2 + (y - 710) ** 2 < 90 ** 2) {
        data[offset] = 148;
        data[offset + 1] = 82;
        data[offset + 2] = 36;
      }
      data[offset + 3] = 255;
    }
  }
  return { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data };
}

function translated(image, dx, dy) {
  const data = Buffer.alloc(image.data.length);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  for (let y = 0; y < CAPTURE_HEIGHT; y++) {
    for (let x = 0; x < CAPTURE_WIDTH; x++) {
      const sourceX = x - dx;
      const sourceY = y - dy;
      if (sourceX < 0 || sourceX >= CAPTURE_WIDTH || sourceY < 0 || sourceY >= CAPTURE_HEIGHT) continue;
      const target = (y * CAPTURE_WIDTH + x) * 4;
      const source = (sourceY * CAPTURE_WIDTH + sourceX) * 4;
      data.set(image.data.subarray(source, source + 4), target);
    }
  }
  return { ...image, data };
}

function mirrored(image) {
  const data = Buffer.alloc(image.data.length);
  for (let y = 0; y < CAPTURE_HEIGHT; y++) {
    for (let x = 0; x < CAPTURE_WIDTH; x++) {
      const target = (y * CAPTURE_WIDTH + x) * 4;
      const source = (y * CAPTURE_WIDTH + CAPTURE_WIDTH - 1 - x) * 4;
      data.set(image.data.subarray(source, source + 4), target);
    }
  }
  return { ...image, data };
}

function recolored(image) {
  const data = Buffer.from(image.data);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = Math.min(255, data[offset] + 40);
    data[offset + 1] = Math.min(255, data[offset + 1] + 25);
  }
  return { ...image, data };
}

const reference = imageFixture();

test("Weekend chirality floor retains the strict low-view mirror veto", () => {
  assert.equal(DEFAULT_THRESHOLDS.minChiralityMargin, 0.5);
  assert.equal(DEFAULT_THRESHOLDS.maxTranslationPx, 1);
  assert.equal(DEFAULT_THRESHOLDS.minEdgeNcc, 0.995);
});

test("Weekend comparator retains structural, appearance and low-frequency gates", () => {
  const result = compareCaptureImages(reference, reference);
  assert.equal(result.schema, "guns-only.weekend-web-unity-parity.v1");
  assert.equal(result.gating.pass, true);
  assert.ok(result.structure.bestUnmirrored.edgeNcc > 0.999999);
  assert.ok(result.structure.chiralityMargin > DEFAULT_THRESHOLDS.minChiralityMargin);
  assert.equal(result.appearance.linearRgbMae, 0);
  assert.equal(result.appearance.luminanceSsim, 1);
  assert.equal(result.appearance.lowFrequencySrgbMaxByteError, 0);
});

test("Weekend comparator detects translation and wrong chirality deterministically", () => {
  const first = compareCaptureImages(reference, translated(reference, 7, -3));
  const second = compareCaptureImages(reference, translated(reference, 7, -3));
  assert.deepEqual(first, second);
  assert.deepEqual(first.structure.bestUnmirrored.unityContentOffsetPx, { x: 7, y: -3 });
  assert.equal(first.gating.pass, false);

  const mirror = compareCaptureImages(reference, mirrored(reference));
  assert.ok(mirror.structure.bestMirrored.edgeNcc > 0.999999);
  assert.ok(mirror.structure.chiralityMargin < 0);
  assert.ok(mirror.gating.structuralFailures.some((failure) => failure.startsWith("wrong-chirality:")));
});

test("Weekend comparator rejects appearance drift even when edges stay aligned", () => {
  const result = compareCaptureImages(reference, recolored(reference));
  assert.ok(result.structure.bestUnmirrored.edgeNcc > 0.999999);
  assert.ok(result.appearance.linearRgbMae > DEFAULT_THRESHOLDS.maxLinearRgbMae);
  assert.ok(result.appearance.lowFrequencySrgbMaxByteError > DEFAULT_THRESHOLDS.maxLowFrequencySrgbByteError);
  assert.equal(result.gating.pass, false);
});

test("native calibration accepts repeated Art6 and rejects every Art5 missing-fog view", async () => {
  const calibration = JSON.parse(await readFile(
    join(TEST_DIR, "../fixtures/native-parity-calibration.v1.json"),
    "utf8",
  ));
  assert.equal(calibration.schema, "guns-only.weekend-native-parity-calibration.v1");
  assert.deepEqual(calibration.thresholds, DEFAULT_THRESHOLDS);
  assert.deepEqual(
    calibration.accepted.web_capture_a_sha256,
    calibration.accepted.web_capture_b_sha256,
  );
  assert.deepEqual(
    calibration.accepted.unity_capture_a_sha256,
    calibration.accepted.unity_capture_b_sha256,
  );

  for (const view of calibration.accepted.views) {
    assert.ok(view.edgeNcc >= DEFAULT_THRESHOLDS.minEdgeNcc, view.id);
    assert.ok(view.translationPx <= DEFAULT_THRESHOLDS.maxTranslationPx, view.id);
    assert.ok(view.chiralityMargin >= DEFAULT_THRESHOLDS.minChiralityMargin, view.id);
    assert.ok(view.linearRgbMae <= DEFAULT_THRESHOLDS.maxLinearRgbMae, view.id);
    assert.ok(view.linearRgbRmse <= DEFAULT_THRESHOLDS.maxLinearRgbRmse, view.id);
    assert.ok(view.p95LinearLumaError <= DEFAULT_THRESHOLDS.maxP95LumaError, view.id);
    assert.ok(view.luminanceSsim >= DEFAULT_THRESHOLDS.minLuminanceSsim, view.id);
    assert.ok(
      view.lowFrequencySrgbMaxByteError
        <= DEFAULT_THRESHOLDS.maxLowFrequencySrgbByteError,
      view.id,
    );
    assert.ok(
      view.lowFrequencySrgbFractionOver4
        <= DEFAULT_THRESHOLDS.maxLowFrequencySrgbFractionOver4,
      view.id,
    );
  }

  for (const view of calibration.rejected.views) {
    // Missing distance fog must remain independently vetoed by structure, whole-frame colour,
    // RMS error and both signed low-frequency metrics under the calibrated raster bounds.
    assert.ok(view.edgeNcc < DEFAULT_THRESHOLDS.minEdgeNcc, view.id);
    assert.ok(view.linearRgbMae > DEFAULT_THRESHOLDS.maxLinearRgbMae, view.id);
    assert.ok(view.linearRgbRmse > DEFAULT_THRESHOLDS.maxLinearRgbRmse, view.id);
    assert.ok(
      view.lowFrequencySrgbMaxByteError
        > DEFAULT_THRESHOLDS.maxLowFrequencySrgbByteError,
      view.id,
    );
    assert.ok(
      view.lowFrequencySrgbFractionOver4
        > DEFAULT_THRESHOLDS.maxLowFrequencySrgbFractionOver4,
      view.id,
    );
  }
});

test("Weekend plates must be exact 1600x1000 opaque RGBA", () => {
  assert.equal(validateCaptureImage(reference), reference);
  assert.throws(
    () => validateCaptureImage({ width: 1_599, height: 1_000, data: Buffer.alloc(0) }),
    /exactly 1600x1000/,
  );
  const translucent = { ...reference, data: Buffer.from(reference.data) };
  translucent.data[3] = 254;
  assert.throws(() => validateCaptureImage(translucent), /fully opaque/);
});

function contractFixture() {
  const ids = ["grid-straight", "corner-context", "paddock-road-junction"];
  return {
    schema: "guns-only.weekend-visual-acceptance.v1",
    serialization: "canonical-json-v1",
    capture: { width_px: 1600, height_px: 1000, opaque: true, vertical_fov_deg: 68, aspect: 1.6, near_m: 0.25, far_m: 24000, anti_aliasing_samples: 4, output_color_space: "srgb", tone_mapping: "three-r160-aces-filmic", tone_mapping_exposure: 1.04 },
    coordinate_system: { handedness: "right", right: "+x/east", up: "+y/up", forward: "-z/north", units: "metres", unity_conversion: "same-numeric-rendered-scene-xyz", unity_projection_x_sign: -1, unity_invert_culling: true },
    scenes: { circuit: { schema: "guns-only.weekend-track-day-scene.v1", root_name: "weekend-track-day", leaf_count: 110, semantic_sha256: A, file_sha256: B }, open_road: { schema: "guns-only.weekend-road-network.v1", id: "weekend-hinterland.open-road.v1", root_name: "weekend-open-road-network", road_count: 8, roadside_instance_count: 144, file_sha256: A } },
    assets: [
      { id: "environment.texture.weekend-track-asphalt.v1", sha256: "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713" },
      { id: "environment.texture.weekend-hinterland-ground.v1", sha256: "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1" },
      { id: "environment.texture.weekend-field-landcover.v1", sha256: "9b6b3cb7ee30f81ea485dd2fa1f3b18d04a17e03285c284f27b3ec0538be542d" },
      { id: "environment.foliage.weekend-roadside-atlas.v1", sha256: "f779abb10692e470381f0d909b61a0876dd91920fb4b86d6f71bbbc1a948abaf" },
    ],
    views: ids.map((id, index) => ({ id, web_file: `${id}.png`, unity_file: `weekend_world_${String(index).padStart(2, "0")}_${id}.png`, position_m: [index, 75, 300 + index], target_m: [index + 10, 68, 290], up: [0, 1, 0] })),
  };
}

function manifestFixture(renderer, contract, contractSha) {
  return {
    schema: "guns-only.weekend-visual-capture.v1",
    renderer,
    acceptance_contract_sha256: contractSha,
    width_px: 1600,
    height_px: 1000,
    opaque: true,
    vertical_fov_deg: 68,
    aspect: 1.6,
    scenes: { circuit_semantic_sha256: A, circuit_file_sha256: B, open_road_file_sha256: A },
    views: contract.views.map((view) => ({ id: view.id, file: renderer === "web" ? view.web_file : view.unity_file, position_m: [...view.position_m], target_m: [...view.target_m] })),
  };
}

test("directory comparison fails all views closed on a wrong scene contract hash", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "weekend-visual-gate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const webDir = join(root, "web");
  const unityDir = join(root, "unity");
  const outDir = join(root, "out");
  await Promise.all([mkdir(webDir), mkdir(unityDir)]);
  const contract = contractFixture();
  const contractBytes = Buffer.from(`${JSON.stringify(contract)}\n`);
  const contractPath = join(root, "contract.json");
  await writeFile(contractPath, contractBytes);
  const contractSha = sha256(contractBytes);
  const webManifest = manifestFixture("web", contract, contractSha);
  const unityManifest = manifestFixture("unity", contract, contractSha);
  unityManifest.scenes.open_road_file_sha256 = B;
  await Promise.all([
    writeFile(join(webDir, "capture.json"), `${JSON.stringify(webManifest)}\n`),
    writeFile(join(unityDir, "weekend_visual_capture.json"), `${JSON.stringify(unityManifest)}\n`),
  ]);
  const summary = await runComparison({ webDir, unityDir, outDir, contractPath });
  assert.equal(summary.pass, false);
  assert.match(summary.manifestError, /open_road_file_sha256/);
  assert.ok(summary.views.every((view) => view.inputError.includes("open_road_file_sha256")));
  const written = JSON.parse(await readFile(join(outDir, "summary.json"), "utf8"));
  assert.equal(written.pass, false);
});

test("directory comparison fails closed on a missing plate after valid manifests", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "weekend-visual-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const webDir = join(root, "web");
  const unityDir = join(root, "unity");
  const outDir = join(root, "out");
  await Promise.all([mkdir(webDir), mkdir(unityDir)]);
  const contract = contractFixture();
  const contractBytes = Buffer.from(`${JSON.stringify(contract)}\n`);
  const contractPath = join(root, "contract.json");
  await writeFile(contractPath, contractBytes);
  const contractSha = sha256(contractBytes);
  await Promise.all([
    writeFile(join(webDir, "capture.json"), `${JSON.stringify(manifestFixture("web", contract, contractSha))}\n`),
    writeFile(join(unityDir, "weekend_visual_capture.json"), `${JSON.stringify(manifestFixture("unity", contract, contractSha))}\n`),
  ]);
  const summary = await runComparison({ webDir, unityDir, outDir, contractPath });
  assert.equal(summary.pass, false);
  assert.equal(summary.views.length, 3);
  assert.ok(summary.views.every((view) => /ENOENT/.test(view.inputError)));
});
