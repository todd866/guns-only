import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { R1_FIRST_PERSON_CONTRACT } from "../r1_first_person.js";
import {
  R1_FIRST_PERSON_SERIALIZATION,
  exportR1FirstPersonContract,
  serializeR1FirstPersonContract,
  sha256Hex,
  stableStringify,
} from "../../../../../tools/weekend-unity/export-r1-first-person.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../../../..");
const exporterPath = resolve(repoRoot, "tools/weekend-unity/export-r1-first-person.mjs");
const checkedCopies = [
  resolve(repoRoot, "content/packs/weekend-ride/presentation/r1-first-person-contract.v1.json"),
  resolve(repoRoot, "web/wwwroot/content/packs/weekend-ride/presentation/r1-first-person-contract.v1.json"),
  resolve(repoRoot, "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/r1-first-person-contract-v1.json"),
];

const EXPECTED_FILE_SHA256 = "9df341cfe83abbc782fab3049ff0a9fbe67b52ac600d16ad384729ba1c52de5f";
const EXPECTED_SEMANTIC_SHA256 = "4e43c1f132e9ab8437361adfb626138380e53230794224dae6d64d4a7419cb5d";

const flatten = (values) => values.flat(Infinity);

test("R1 exporter is deterministic and every consumer receives byte-identical canonical JSON", async () => {
  const scratch = await mkdtemp(resolve(tmpdir(), "guns-only-r1-export-"));
  try {
    const first = resolve(scratch, "first.json");
    const second = resolve(scratch, "nested/second.json");
    const result = spawnSync(process.execPath, [exporterPath, "--out", first, "--out", second], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const [firstBytes, secondBytes, ...checkedBytes] = await Promise.all(
      [first, second, ...checkedCopies].map((path) => readFile(path)),
    );
    assert.deepEqual(firstBytes, secondBytes, "two exports diverged");
    for (const [index, bytes] of checkedBytes.entries()) {
      assert.deepEqual(bytes, firstBytes, `${checkedCopies[index]} is not an exact generated copy`);
    }
    assert.equal(sha256Hex(firstBytes), EXPECTED_FILE_SHA256);
    assert.equal(firstBytes.at(-1), 0x0a, "canonical JSON must end with one LF");
    assert.notEqual(firstBytes.at(-2), 0x0a, "canonical JSON must not end with a blank line");
    assert.equal(firstBytes.includes(0x0d), false, "canonical JSON must not contain CR bytes");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("serialized R1 contract preserves renderer-neutral semantics and a pinned semantic digest", async () => {
  const exported = exportR1FirstPersonContract();
  assert.equal(exported.schema, R1_FIRST_PERSON_CONTRACT.schema);
  assert.equal(exported.serialization, R1_FIRST_PERSON_SERIALIZATION);
  assert.deepEqual(exported.coordinateSystem, R1_FIRST_PERSON_CONTRACT.coordinateSystem);
  assert.deepEqual(exported.requiredAnchors, R1_FIRST_PERSON_CONTRACT.requiredAnchors);
  assert.equal(exported.semanticSha256, EXPECTED_SEMANTIC_SHA256);

  const { semanticSha256, ...semanticPayload } = exported;
  assert.equal(sha256Hex(stableStringify(semanticPayload)), semanticSha256);
  assert.equal(sha256Hex(serializeR1FirstPersonContract()), EXPECTED_FILE_SHA256);

  assert.equal(exported.colors.length, 11);
  assert.equal(exported.materials.length, 10);
  assert.equal(exported.parts.length, 24);
  assert.equal(new Set(exported.parts.map(({ name }) => name)).size, exported.parts.length);

  for (const color of exported.colors) {
    const source = R1_FIRST_PERSON_CONTRACT.colors[color.name];
    assert.ok(source, `unknown exported colour ${color.name}`);
    assert.equal(color.srgbHex, source.srgb.hex);
    assert.deepEqual(color.srgbRgb8, source.srgb.rgb8);
    assert.deepEqual(color.linearRgb, source.linearRgb);
  }

  for (const material of exported.materials) {
    const source = R1_FIRST_PERSON_CONTRACT.materials[material.name];
    assert.ok(source, `unknown exported material ${material.name}`);
    assert.equal(material.model, source.model);
    assert.equal(material.color, source.color);
    assert.equal(material.roughness, source.roughness ?? 0.5);
    assert.equal(material.metalness, source.metalness ?? 0);
    assert.equal(material.side, source.side ?? "front");
    assert.equal(material.opacity, source.opacity ?? 1);
    assert.equal(material.transparent, source.transparent === true);
    assert.equal(material.depthWrite, source.depthWrite !== false);
    assert.equal(material.emissive, source.emissive ?? "");
    assert.equal(material.emissiveIntensity, source.emissiveIntensity ?? 0);
  }

  exported.parts.forEach((part, index) => {
    const source = R1_FIRST_PERSON_CONTRACT.parts[index];
    assert.equal(part.name, source.name);
    assert.equal(part.primitive, source.primitive);
    assert.equal(part.material, source.material);
    assert.deepEqual(part.positionM, source.positionM);
    assert.deepEqual(part.rotationRad, source.rotationRad);
    assert.deepEqual(part.dimensionsM, source.dimensionsM ?? []);
    assert.deepEqual(part.verticesM, flatten(source.verticesM ?? []));
    assert.deepEqual(part.triangles, flatten(source.triangles ?? []));
    assert.deepEqual(part.lineSegmentsM, flatten(source.segmentsM ?? []));
    assert.equal(part.radiusM, source.radiusM ?? 0);
    assert.equal(part.lengthM, source.lengthM ?? 0);
    assert.equal(part.radialSegments, source.radialSegments ?? 0);
    assert.deepEqual(part.segments, source.segments ?? []);
    assert.equal(part.telemetry.kind, source.telemetry?.kind ?? "");
    assert.equal(part.telemetry.index, source.telemetry?.index ?? -1);
  });

  const primitives = new Set(exported.parts.map(({ primitive }) => primitive));
  assert.deepEqual(
    [...primitives].sort(),
    ["box", "cylinder", "ellipsoid", "line-segments", "panel", "plane"],
  );
  assert.deepEqual(
    exported.parts.filter(({ telemetry }) => telemetry.kind === "rpm-segment")
      .map(({ telemetry }) => telemetry.index),
    [0, 1, 2, 3, 4, 5, 6],
  );

  const checked = JSON.parse(await readFile(checkedCopies[0], "utf8"));
  assert.deepEqual(checked, exported);
});

test("Unity loader and narrow rig API are pinned to the same hashes without mission coupling", async () => {
  const [loader, rig, shader] = await Promise.all([
    readFile(resolve(repoRoot,
      "unity/GunsOnly.Unity/Assets/Scripts/WeekendR1FirstPersonContract.cs"), "utf8"),
    readFile(resolve(repoRoot,
      "unity/GunsOnly.Unity/Assets/Scripts/WeekendR1FirstPersonRig.cs"), "utf8"),
    readFile(resolve(repoRoot,
      "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/WeekendR1NearField.shader"),
    "utf8"),
  ]);

  assert.match(loader, new RegExp(`ExpectedFileSha256[^;]+${EXPECTED_FILE_SHA256}`, "s"));
  assert.match(loader, new RegExp(`ExpectedSemanticSha256[^;]+${EXPECTED_SEMANTIC_SHA256}`, "s"));
  assert.match(loader, /Resources\.Load<TextAsset>\(ResourcePath\)/);
  assert.match(loader, /FromExactBytes\(source\.bytes/);
  assert.match(loader, /coordinates\.forward != "-z"/);
  assert.match(loader, /Mathf\.Pow\(\(srgb \+ 0\.055f\) \/ 1\.055f, 2\.4f\)/);
  assert.match(loader, /tachIndices\.Count != 7/);

  assert.match(rig, /public static WeekendR1FirstPersonRig AttachTo\(Transform helmetCamera\)/);
  assert.match(rig, /public void SetEngineRpm\(float rpm\)/);
  assert.match(rig, /partObject\.transform\.localPosition = FromThreePosition/);
  assert.match(rig, /R_unity = F \* R_three \* F/);
  assert.match(rig, /MeshTopology\.Lines/);
  assert.doesNotMatch(rig, /UnityMissionSelection|HostClient|Program\.cs|WeekendRideSession/);
  assert.match(shader, /Shader "GunsOnly\/WeekendR1NearField"/);
  assert.match(shader, /_Metallic/);
  assert.match(shader, /_Smoothness/);
  assert.match(shader, /_Unlit/);
});
