#!/usr/bin/env node

// Exports the exact Build 299 desktop river draw mesh from the Web presentation. This script
// deliberately instantiates createCobraCanyonPresentation and serialises its BufferGeometry; it
// does not duplicate the ribbon/meander planner that owns the shape.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../../web/wwwroot/vendor/three.module.js";
import {
  planCobraCanyonWorld,
  validateCobraCanyonWorld,
} from "../../web/wwwroot/render/cobra/cobra_canyon_plan.js";
import {
  createCobraCanyonPresentation,
} from "../../web/wwwroot/render/cobra/cobra_canyon_presentation.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "../..");
const worldPath = resolve(
  repositoryRoot,
  "content/packs/cobra-vietnam/environment/cobra-canyon.world.json",
);
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
if (outIndex < 0 || !args[outIndex + 1]) {
  throw new Error("usage: export-river-mesh.mjs --out PATH");
}
const outputPath = resolve(args[outIndex + 1]);

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function float32LittleEndianBytes(attribute, label) {
  if (!(attribute?.array instanceof Float32Array)) {
    throw new TypeError(`${label} must be backed by Float32Array.`);
  }
  if (attribute.array.length !== attribute.count * attribute.itemSize) {
    throw new RangeError(`${label} has an inconsistent count/itemSize.`);
  }
  const bytes = Buffer.allocUnsafe(attribute.array.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < attribute.array.length; index++) {
    const value = attribute.array[index];
    if (!Number.isFinite(value)) throw new RangeError(`${label}[${index}] is not finite.`);
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true);
  }
  return bytes;
}

function exportAttribute(attribute, label) {
  const bytes = float32LittleEndianBytes(attribute, label);
  return {
    componentType: "float32",
    itemSize: attribute.itemSize,
    count: attribute.count,
    normalized: attribute.normalized === true,
    encoding: "base64-f32le",
    byteLength: bytes.byteLength,
    sha256: digest(bytes),
    data: bytes.toString("base64"),
  };
}

function exportIndex(index) {
  if (!index) return null;
  const component = index.array instanceof Uint32Array
    ? { name: "uint32", bytes: 4, write: "setUint32" }
    : index.array instanceof Uint16Array
      ? { name: "uint16", bytes: 2, write: "setUint16" }
      : index.array instanceof Uint8Array
        ? { name: "uint8", bytes: 1, write: "setUint8" }
        : null;
  if (!component) throw new TypeError(`Unsupported index array: ${index.array?.constructor?.name}`);
  const bytes = Buffer.allocUnsafe(index.array.length * component.bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < index.array.length; offset++) {
    view[component.write](offset * component.bytes, index.array[offset], true);
  }
  return {
    componentType: component.name,
    count: index.count,
    encoding: `base64-${component.name}le`,
    byteLength: bytes.byteLength,
    sha256: digest(bytes),
    data: bytes.toString("base64"),
  };
}

const world = validateCobraCanyonWorld(JSON.parse(await readFile(worldPath, "utf8")));
const qualityTier = "desktop";
const plan = planCobraCanyonWorld(world, { qualityTier });
const presentation = createCobraCanyonPresentation(THREE, plan, { qualityTier });

try {
  const candidates = presentation.group.children.filter((child) =>
    child?.name === "COBRA_CANYON_RIVER"
    && child?.userData?.cobraCanyon?.role === "river");
  if (candidates.length !== 1) {
    throw new Error(`Expected one Build 299 COBRA_CANYON_RIVER child; found ${candidates.length}.`);
  }
  const river = candidates[0];
  if (!river.isMesh || river.isInstancedMesh) {
    throw new TypeError("COBRA_CANYON_RIVER must be one static Web presentation mesh.");
  }
  const geometry = river.geometry;
  const attributeNames = Object.keys(geometry.attributes).sort(compareAscii);
  for (const required of ["position", "riverFrame"]) {
    if (!attributeNames.includes(required)) {
      throw new Error(`COBRA_CANYON_RIVER is missing its ${required} attribute.`);
    }
  }
  const position = geometry.getAttribute("position");
  const riverFrame = geometry.getAttribute("riverFrame");
  if (position.itemSize !== 3 || riverFrame.itemSize !== 4) {
    throw new RangeError("River position/riverFrame item sizes must remain vec3/vec4.");
  }
  if (position.count !== riverFrame.count) {
    throw new RangeError("River position and riverFrame vertex counts must match.");
  }

  const attributes = Object.fromEntries(attributeNames.map((name) => [
    name,
    exportAttribute(geometry.getAttribute(name), `COBRA_CANYON_RIVER.${name}`),
  ]));
  const index = exportIndex(geometry.index);
  const elementCount = index?.count ?? position.count;
  if (elementCount % 3 !== 0) {
    throw new RangeError(`River triangle element count must be divisible by three: ${elementCount}.`);
  }

  const manifest = {
    schema: "guns-only.cobra-canyon.unity-river-mesh.v1",
    sourceWorldId: plan.worldId,
    sourceContentVersion: world.contentVersion,
    sourceVisualContractId: "visual-contract.cobra-vietnam.cobra-canyon.v1",
    sourceWebBuild: 299,
    qualityTier,
    sourcePresentation: {
      group: presentation.group.name,
      mesh: river.name,
      geometry: geometry.name,
      role: river.userData.cobraCanyon.role,
    },
    coordinateSystem: {
      units: "metres",
      x: "east",
      y: "up",
      z: "negative-north",
    },
    topology: {
      primitive: "triangles",
      indexed: index !== null,
      index,
      vertexCount: position.count,
      elementCount,
      triangleCount: elementCount / 3,
    },
    attributes,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest)}\n`, "utf8");
  process.stdout.write(
    `wrote ${outputPath}: ${position.count} vertices, ${elementCount / 3} triangles, `
      + `${attributeNames.length} attributes\n`,
  );
} finally {
  presentation.dispose();
}
