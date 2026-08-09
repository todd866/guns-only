import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "../../../web/wwwroot/vendor/three.module.js";
import {
  planCobraCanyonWorld,
  validateCobraCanyonWorld,
} from "../../../web/wwwroot/render/cobra/cobra_canyon_plan.js";
import {
  createCobraCanyonPresentation,
} from "../../../web/wwwroot/render/cobra/cobra_canyon_presentation.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDir, "../../..");
const exporter = resolve(repositoryRoot, "tools/cobra-unity/export-river-mesh.mjs");
const canonical = resolve(
  repositoryRoot,
  "content/packs/cobra-vietnam/environment/cobra-canyon-river-mesh-desktop-v1.json",
);
const staged = resolve(
  repositoryRoot,
  "web/wwwroot/content/packs/cobra-vietnam/environment/cobra-canyon-river-mesh-desktop-v1.json",
);
const worldPath = resolve(
  repositoryRoot,
  "content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
);

function runExporter(output) {
  return spawnSync(process.execPath, [exporter, "--out", output], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodedAttribute(attribute) {
  assert.equal(attribute.encoding, "base64-f32le");
  const bytes = Buffer.from(attribute.data, "base64");
  assert.equal(bytes.byteLength, attribute.byteLength);
  assert.equal(digest(bytes), attribute.sha256);
  const values = new Float32Array(attribute.count * attribute.itemSize);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < values.length; index++) {
    values[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  }
  return { bytes, values };
}

function sourceAttributeBytes(attribute) {
  const bytes = Buffer.alloc(attribute.array.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < attribute.array.length; index++) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, attribute.array[index], true);
  }
  return bytes;
}

test("Web Build 299 deterministically exports the exact staged river mesh", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "guns-only-cobra-river-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const firstOutput = join(scratch, "river-first.json");
  const secondOutput = join(scratch, "river-second.json");
  const firstRun = runExporter(firstOutput);
  const secondRun = runExporter(secondOutput);
  assert.equal(firstRun.status, 0, `${firstRun.stdout}\n${firstRun.stderr}`);
  assert.equal(secondRun.status, 0, `${secondRun.stdout}\n${secondRun.stderr}`);

  const [expectedBytes, stagedBytes, firstBytes, secondBytes] = await Promise.all([
    readFile(canonical),
    readFile(staged),
    readFile(firstOutput),
    readFile(secondOutput),
  ]);
  assert.deepEqual(stagedBytes, expectedBytes, "published source copy drifted");
  assert.deepEqual(firstBytes, expectedBytes, "exported Web river mesh drifted");
  assert.deepEqual(secondBytes, firstBytes, "two exports were not byte deterministic");
  assert.equal(firstBytes.at(-1), 0x0a, "manifest must end with exactly one newline");
});

test("river manifest preserves the source child, non-indexed topology, and every attribute byte", async () => {
  const manifest = JSON.parse(await readFile(canonical, "utf8"));
  assert.equal(manifest.schema, "guns-only.cobra-canyon.unity-river-mesh.v1");
  assert.equal(manifest.sourceWebBuild, 299);
  assert.equal(manifest.qualityTier, "desktop");
  assert.deepEqual(manifest.sourcePresentation, {
    group: "COBRA_CANYON_PRESENTATION_ONLY",
    mesh: "COBRA_CANYON_RIVER",
    geometry: "COBRA_CANYON_RIVER_GEOMETRY",
    role: "river",
  });
  assert.deepEqual(manifest.coordinateSystem, {
    units: "metres",
    x: "east",
    y: "up",
    z: "negative-north",
  });
  assert.deepEqual(
    {
      primitive: manifest.topology.primitive,
      indexed: manifest.topology.indexed,
      index: manifest.topology.index,
      vertexCount: manifest.topology.vertexCount,
      elementCount: manifest.topology.elementCount,
      triangleCount: manifest.topology.triangleCount,
    },
    {
      primitive: "triangles",
      indexed: false,
      index: null,
      vertexCount: 7_752,
      elementCount: 7_752,
      triangleCount: 2_584,
    },
  );
  assert.deepEqual(Object.keys(manifest.attributes), ["normal", "position", "riverFrame"]);

  const world = validateCobraCanyonWorld(JSON.parse(await readFile(worldPath, "utf8")));
  const plan = planCobraCanyonWorld(world, { qualityTier: "desktop" });
  const presentation = createCobraCanyonPresentation(THREE, plan, { qualityTier: "desktop" });
  try {
    const matches = presentation.group.children.filter((child) =>
      child.name === "COBRA_CANYON_RIVER" && child.userData.cobraCanyon.role === "river");
    assert.equal(matches.length, 1);
    const sourceGeometry = matches[0].geometry;
    assert.equal(sourceGeometry.index, null);
    for (const name of Object.keys(manifest.attributes)) {
      const encoded = decodedAttribute(manifest.attributes[name]);
      assert.deepEqual(encoded.bytes, sourceAttributeBytes(sourceGeometry.getAttribute(name)), name);
    }
  } finally {
    presentation.dispose();
  }
});

test("riverFrame still spans channel water and dry gravel at shader precision", async () => {
  const manifest = JSON.parse(await readFile(canonical, "utf8"));
  const positions = decodedAttribute(manifest.attributes.position).values;
  const frames = decodedAttribute(manifest.attributes.riverFrame).values;
  let minimumLateral = Infinity;
  let maximumLateral = -Infinity;
  for (let vertex = 0; vertex < manifest.topology.vertexCount; vertex++) {
    const positionOffset = vertex * 3;
    const frameOffset = vertex * 4;
    const lateral = Math.abs(
      (positions[positionOffset] - frames[frameOffset]) * frames[frameOffset + 2]
        + (-positions[positionOffset + 2] - frames[frameOffset + 1])
          * frames[frameOffset + 3],
    );
    minimumLateral = Math.min(minimumLateral, lateral);
    maximumLateral = Math.max(maximumLateral, lateral);
  }
  assert.ok(minimumLateral < 0.3, `closest channel sample was ${minimumLateral}`);
  assert.ok(maximumLateral > 1.05, `widest gravel sample was ${maximumLateral}`);
});
