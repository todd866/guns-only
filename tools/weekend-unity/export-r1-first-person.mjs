#!/usr/bin/env node

// Serialises the renderer-neutral Web R1 near-field contract into a canonical payload.
// The checked content, staged Web copy and Unity Resource must always be byte-identical.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  R1_FIRST_PERSON_CONTRACT,
  R1_FIRST_PERSON_SCHEMA,
} from "../../web/wwwroot/render/motorcycle/r1_first_person.js";

export const R1_FIRST_PERSON_SERIALIZATION = "canonical-json-v1";
export const R1_FIRST_PERSON_SOURCE_MODULE =
  "web/wwwroot/render/motorcycle/r1_first_person.js";

const compareAscii = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function assertFiniteArray(values, label) {
  if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`${label} must contain only finite numbers.`);
  }
  return [...values];
}

function flattenVectors(values, width, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  const flattened = [];
  values.forEach((value, index) => {
    if (!Array.isArray(value) || value.length !== width) {
      throw new TypeError(`${label}[${index}] must contain ${width} numbers.`);
    }
    flattened.push(...assertFiniteArray(value, `${label}[${index}]`));
  });
  return flattened;
}

function flattenSegments(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  const flattened = [];
  values.forEach((segment, index) => {
    if (!Array.isArray(segment) || segment.length !== 2) {
      throw new TypeError(`${label}[${index}] must contain two endpoints.`);
    }
    flattened.push(...flattenVectors(segment, 3, `${label}[${index}]`));
  });
  return flattened;
}

function colorRecords(colors) {
  return Object.entries(colors)
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([name, color]) => ({
      name,
      srgbHex: color.srgb.hex,
      srgbRgb8: assertFiniteArray(color.srgb.rgb8, `${name}.srgbRgb8`),
      linearRgb: assertFiniteArray(color.linearRgb, `${name}.linearRgb`),
    }));
}

function materialRecords(materials) {
  return Object.entries(materials)
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([name, material]) => ({
      name,
      model: material.model,
      color: material.color,
      roughness: material.roughness ?? 0.5,
      metalness: material.metalness ?? 0,
      side: material.side ?? "front",
      opacity: material.opacity ?? 1,
      transparent: material.transparent === true,
      depthWrite: material.depthWrite !== false,
      emissive: material.emissive ?? "",
      emissiveIntensity: material.emissiveIntensity ?? 0,
    }));
}

function partRecord(part) {
  return {
    name: part.name,
    primitive: part.primitive,
    material: part.material,
    positionM: assertFiniteArray(part.positionM, `${part.name}.positionM`),
    rotationRad: assertFiniteArray(part.rotationRad, `${part.name}.rotationRad`),
    dimensionsM: assertFiniteArray(part.dimensionsM ?? [], `${part.name}.dimensionsM`),
    radiusM: part.radiusM ?? 0,
    lengthM: part.lengthM ?? 0,
    radialSegments: part.radialSegments ?? 0,
    segments: assertFiniteArray(part.segments ?? [], `${part.name}.segments`),
    verticesM: flattenVectors(part.verticesM ?? [], 3, `${part.name}.verticesM`),
    triangles: flattenVectors(part.triangles ?? [], 3, `${part.name}.triangles`),
    lineSegmentsM: flattenSegments(part.segmentsM ?? [], `${part.name}.segmentsM`),
    telemetry: {
      kind: part.telemetry?.kind ?? "",
      index: part.telemetry?.index ?? -1,
    },
  };
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort(compareAscii)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function exportR1FirstPersonContract(contract = R1_FIRST_PERSON_CONTRACT) {
  if (contract?.schema !== R1_FIRST_PERSON_SCHEMA) {
    throw new TypeError(`Expected ${R1_FIRST_PERSON_SCHEMA}; received ${contract?.schema}.`);
  }
  const payload = {
    schema: contract.schema,
    serialization: R1_FIRST_PERSON_SERIALIZATION,
    source: {
      module: R1_FIRST_PERSON_SOURCE_MODULE,
      exportName: "R1_FIRST_PERSON_CONTRACT",
    },
    coordinateSystem: { ...contract.coordinateSystem },
    requiredAnchors: [...contract.requiredAnchors],
    colors: colorRecords(contract.colors),
    materials: materialRecords(contract.materials),
    tachometer: { ...contract.tachometer },
    render: { ...contract.render },
    parts: contract.parts.map(partRecord),
  };
  const semanticSha256 = sha256Hex(stableStringify(payload));
  return { ...payload, semanticSha256 };
}

export function serializeR1FirstPersonContract(contract = R1_FIRST_PERSON_CONTRACT) {
  return `${stableStringify(exportR1FirstPersonContract(contract))}\n`;
}

async function main(args) {
  const outputs = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--out" || !args[index + 1]) {
      throw new Error("usage: export-r1-first-person.mjs --out PATH [--out PATH ...]");
    }
    outputs.push(resolve(args[++index]));
  }
  if (outputs.length === 0) {
    throw new Error("usage: export-r1-first-person.mjs --out PATH [--out PATH ...]");
  }

  const serialized = serializeR1FirstPersonContract();
  for (const output of outputs) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serialized, "utf8");
    process.stdout.write(`wrote ${output} sha256=${sha256Hex(serialized)}\n`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) await main(process.argv.slice(2));
