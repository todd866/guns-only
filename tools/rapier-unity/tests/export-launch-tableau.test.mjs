import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildManifest,
  canonicalManifestBytes,
  extractLiveWebPresentationContract,
  manifestRelativePaths,
  repositoryRoot,
  semanticDigestOf,
  sha256Hex,
  writeOrCheckManifest,
} from "../export-launch-tableau.mjs";

const EXPECTED_SEMANTIC_SHA256 =
  "cba862a286dddbc3c888def798d2cb0f782646f47520a0f05b438ac8fd0a7ab5";
const EXPECTED_MANIFEST_SHA256 =
  "c5be89e6a07c87a7f606dc0f8649763eaa263dcb8182ef236bb00762bb3310ef";

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function verifyAttribute(attribute, geometryLabel) {
  if (attribute == null) return;
  const bytes = Buffer.from(attribute.data, "base64");
  assert.equal(bytes.length, attribute.byteLength, `${geometryLabel} byte length`);
  assert.equal(sha256Hex(bytes), attribute.sha256, `${geometryLabel} buffer hash`);
  assert.equal(attribute.count * attribute.itemSize * 4, attribute.byteLength,
    `${geometryLabel} typed element count`);
}

test("exporter reads the live Rapier Web camera, light and soft-world contract", () => {
  const live = extractLiveWebPresentationContract();
  assert.deepEqual(live.cameraProjection, {
    verticalFovDeg: 66,
    nearClipM: 0.06,
    farClipM: 680000,
    rotationOrder: "YXZ",
  });
  close(live.lighting.sunDirection[0], 0.49980011992005596);
  close(live.lighting.sunDirection[1], 0.27988806715523135);
  close(live.lighting.sunDirection[2], -0.8196721966688917);
  assert.equal(live.lighting.sunColorSrgbHex, "#ffe2b4");
  assert.equal(live.lighting.sunIntensity, 2.95);
  assert.equal(live.lighting.hemisphereSkySrgbHex, "#e8d8b8");
  assert.equal(live.lighting.hemisphereGroundSrgbHex, "#3a3428");
  assert.equal(live.lighting.hemisphereIntensity, 0.9);
  assert.equal(live.atmosphere.fogLowSrgbHex, "#a8814b");
  assert.equal(live.atmosphere.fogHighSrgbHex, "#8a8470");
  assert.equal(live.atmosphere.fogDensityScale, 0.32);
  assert.equal(live.output.toneMapping, "aces-filmic");
  assert.equal(live.output.exposure, 1.1);
});

test("canonical manifest preserves opaque-capsule semantics and the optimized Web strip", () => {
  const manifest = buildManifest();
  assert.equal(manifest.schema, "guns-only.rapier.launch-tableau.v1");
  assert.equal(manifest.sourceWebBuild, 299);
  assert.equal(manifest.authority.mode, "presentation-only");
  assert.equal(manifest.authority.simulationAuthority, "none");
  assert.equal(manifest.camera.doctrine, "opaque-sensor-capsule");
  assert.equal(manifest.camera.semantic, "camera.cockpit");
  assert.equal(manifest.camera.nodeName, "SOCKET_CAMERA_COCKPIT");
  assert.equal(manifest.camera.exteriorMeshVisibleInLiveFlight, false);
  assert.equal(manifest.camera.cockpitMeshVisibleInLiveFlight, false);
  assert.equal(manifest.camera.persistentFrameChrome, false);
  close(manifest.camera.anchorLocalM[0], 0);
  close(manifest.camera.anchorLocalM[1], 0.21);
  close(manifest.camera.anchorLocalM[2], -1.8);

  assert.deepEqual(manifest.budgets, {
    meshDrawCount: 42,
    pointDrawCount: 3,
    shadowCasterCount: 18,
    renderedTriangleCount: 8128,
    renderedVertexCount: 10148,
    staticBoxBatchCount: 10,
    staticBoxSourceCount: 139,
  });
  assert.equal(manifest.draws.length, 45);
  assert.equal(manifest.materials.length, 21);
  const materialById = new Map(manifest.materials.map((material) =>
    [material.id, material]));
  for (const draw of manifest.draws) {
    const material = materialById.get(draw.materialId);
    const points = draw.kind === "points";
    assert.equal(material.shaderModel === "three-points", points,
      `${draw.id} uses its supported Unity shader family`);
    assert.equal(material.transparent, points, `${draw.id} transparency contract`);
    assert.equal(material.blending, points ? "additive" : "normal",
      `${draw.id} blending contract`);
    assert.equal(material.depthWrite, !points, `${draw.id} depth-write contract`);
    assert.equal(material.alphaTest, 0, `${draw.id} has no unsupported alpha cutout`);
  }
  assert.equal(new Set(manifest.platform.recoveryWireMaterialIds).size, 4,
    "four recovery wires retain four intentional material instances");
  assert.equal(manifest.dynamicFx.restVisibility, false);
  assert.equal(manifest.dynamicFx.pointDrawIds.length, 3);
  assert.equal(manifest.dynamicFx.webSourceSha256,
    "480bb2dc8f11268885acda201a4b54da1c0cb1a311efd522a51c4e4d3e70336e");
  assert.equal(manifest.dynamicFx.portal.progressStart, 0.58);
  assert.equal(manifest.dynamicFx.portal.opacityMaximum, 0.62);
  assert.equal(manifest.dynamicFx.rail.lateralOscillationRadPerS, 14);
  assert.equal(manifest.dynamicFx.ribLamps.pulseRateProgressGain, 10);
  assert.equal(manifest.sky.geometry.vertexCount, 777);
  assert.equal(manifest.sky.geometry.primitiveCount, 1368);
  assert.deepEqual(manifest.sky.variantUniforms, {
    softWorldMix: 1,
    modernCombatMix: 0,
  });
  assert.equal(manifest.sky.webFragmentShaderSha256,
    "7a1b826de9868f901efe65aec87ab2d11b11fa0e9e8234cba01dfa503fd497a0");
  assert.equal(manifest.sky.softWorldParameters.sunCoreExponent, 1800);
});

test("every staged geometry buffer and the semantic surface are hash-authoritative", () => {
  const manifest = buildManifest();
  for (const draw of [...manifest.draws, { id: "sky", geometry: manifest.sky.geometry }]) {
    const geometry = draw.geometry;
    verifyAttribute(geometry.attributes.position, `${draw.id}.position`);
    verifyAttribute(geometry.attributes.normal, `${draw.id}.normal`);
    verifyAttribute(geometry.attributes.uv, `${draw.id}.uv`);
    verifyAttribute(geometry.index, `${draw.id}.index`);
    assert.equal(geometry.elementCount,
      geometry.index?.count ?? geometry.attributes.position.count);
    if (geometry.topology === "triangles") {
      assert.equal(geometry.elementCount % 3, 0);
      assert.equal(geometry.primitiveCount, geometry.elementCount / 3);
    }
  }
  assert.equal(semanticDigestOf(manifest), manifest.semanticSha256);
  assert.equal(manifest.semanticSha256, EXPECTED_SEMANTIC_SHA256);
  assert.equal(sha256Hex(canonicalManifestBytes(manifest)), EXPECTED_MANIFEST_SHA256);
});

test("content, Web staging and Unity Resources are byte-identical deterministic exports", () => {
  const generated = canonicalManifestBytes();
  const secondPass = canonicalManifestBytes();
  assert.ok(generated.equals(secondPass), "two fresh exports must be byte-identical");
  for (const relativePath of manifestRelativePaths) {
    const staged = readFileSync(resolve(repositoryRoot, relativePath));
    assert.ok(staged.equals(generated), `${relativePath} must equal the canonical exporter bytes`);
  }
  assert.doesNotThrow(() => writeOrCheckManifest("check"));
});

test("Unity adapter preserves camera ownership and portable shadow variants", () => {
  const builder = readFileSync(resolve(repositoryRoot,
    "unity/GunsOnly.Unity/Assets/Scripts/RapierLaunchTableauBuilder.cs"), "utf8");
  const litShader = readFileSync(resolve(repositoryRoot,
    "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/Rapier/RapierTableauLit.shader"),
  "utf8");

  assert.match(builder, /new Vector3\(value\[0\], value\[1\], -value\[2\]\)/,
    "Unity must reflect Web Z exactly once at the adapter boundary");
  assert.match(builder, /Mathf\.Clamp\(deltaSeconds, 0f, 0\.1f\)/,
    "launch FX must use Web's clamped presentation clock");
  const detachCamera = builder.indexOf("_boundSensorCamera.SetParent(null, true)");
  const destroyAnchor = builder.indexOf("DestroyObject(_cockpitCameraAnchor.gameObject)");
  assert.ok(detachCamera >= 0 && destroyAnchor > detachCamera,
    "disposing tableau-owned presentation must not destroy the caller-owned sensor camera");
  assert.match(litShader,
    /TRANSFER_SHADOW_WPOS\(output, output\.worldPosition\)/,
    "forward shadow variants must not depend on Unity's hard-coded `v` input name");
  assert.match(litShader, /vertShadow\(appdata_base v\)/,
    "Unity's shadow-caster macro requires its input to be named `v`");
});
