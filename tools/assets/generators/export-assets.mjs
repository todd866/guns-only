#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "../../../web/wwwroot/vendor/three.module.js";
import { GLTFExporter } from "../../../web/wwwroot/vendor/three/addons/exporters/GLTFExporter.js";
import { inspectGlbBuffer } from "../lib/glb.mjs";
import { installDeterministicImageCanvas } from "./node-image-canvas.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, "content/packs/korea-1950s");
const DEFAULT_MODULES = [
  "aircraft-assets.mjs",
  "naval-assets.mjs",
  "environment-assets.mjs",
];

class NodeFileReader {
  constructor() {
    this.error = null;
    this.result = null;
    this.onload = null;
    this.onerror = null;
    this.onloadend = null;
  }

  readAsArrayBuffer(blob) {
    this.#settle(blob.arrayBuffer());
  }

  readAsDataURL(blob) {
    this.#settle(blob.arrayBuffer().then((value) => {
      const type = blob.type || "application/octet-stream";
      return `data:${type};base64,${Buffer.from(value).toString("base64")}`;
    }));
  }

  #settle(promise) {
    promise.then((value) => {
      this.result = value;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }, (error) => {
      this.error = error;
      this.onerror?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
}

if (typeof globalThis.FileReader === "undefined") globalThis.FileReader = NodeFileReader;
installDeterministicImageCanvas();

function parseArgs(argv) {
  const options = { modules: [], outputRoot: DEFAULT_OUTPUT_ROOT, force: false, dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) throw new Error(`${token} requires a value`);
      return argv[++index];
    };
    if (token === "--module") options.modules.push(path.resolve(next()));
    else if (token === "--output-root") options.outputRoot = path.resolve(next());
    else if (token === "--only") options.only = next();
    else if (token === "--force") options.force = true;
    else if (token === "--dry-run") options.dryRun = true;
    else if (token === "--help" || token === "-h") options.help = true;
    else throw new Error(`Unknown option '${token}'`);
  }
  return options;
}

const HELP = `Usage: node tools/assets/generators/export-assets.mjs [options]

Build deterministic static GLBs from Three r160 asset-spec modules.

Options:
  --module <file.mjs>       Asset module; repeatable (defaults to *-assets.mjs)
  --output-root <directory> Runtime pack root (default: content/packs/korea-1950s)
  --only <asset-or-output>  Build specs whose assetId/output contains this value
  --force                   Replace differing generated GLBs
  --dry-run                 Construct and inspect scenes without writing files
  -h, --help                Show this help
`;

async function exists(file) {
  try { await access(file); return true; }
  catch { return false; }
}

function canonicalOutput(value) {
  if (typeof value !== "string" || !value.endsWith(".glb")) {
    throw new Error(`Asset spec output must be a .glb path, received '${String(value)}'`);
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..") || normalized !== path.posix.normalize(normalized)) {
    throw new Error(`Asset spec output must be a canonical pack-relative path: '${value}'`);
  }
  return normalized;
}

function selectBuilder(module, file) {
  const named = [
    module.buildAssetSpecs,
    module.buildAircraftAssetSpecs,
    module.buildNavalAssetSpecs,
    module.buildEnvironmentAssetSpecs,
    module.default,
  ].find((candidate) => typeof candidate === "function");
  if (!named) throw new Error(`${file} does not export an asset-spec builder`);
  return named;
}

function sceneStats(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  let meshes = 0;
  let materials = 0;
  const uniqueMaterials = new Set();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) uniqueMaterials.add(material);
    }
  });
  materials = uniqueMaterials.size;
  return { meshes, materials, boundsMetres: [size.x, size.y, size.z].map((value) => Number(value.toFixed(3))) };
}

async function exportBinary(scene) {
  scene.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: false,
    truncateDrawRange: true,
    includeCustomExtensions: false,
  });
  return Buffer.from(result);
}

async function install(file, bytes, force) {
  const prior = await readFile(file).catch(() => null);
  if (prior?.equals(bytes)) return "unchanged";
  if (prior && !force) throw new Error(`${path.relative(ROOT, file)} differs; pass --force to replace generated output`);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  try { await rename(temporary, file); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return prior ? "replaced" : "created";
}

async function loadSpecs(files) {
  const specs = [];
  for (const file of files) {
    const module = await import(`${pathToFileURL(file).href}?build=${Date.now()}`);
    const built = await selectBuilder(module, file)(THREE);
    if (!Array.isArray(built)) throw new Error(`${file} builder must return an array`);
    for (const spec of built) specs.push({ ...spec, module: path.relative(ROOT, file) });
  }
  return specs;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { process.stdout.write(HELP); return 0; }
  const modules = options.modules.length > 0
    ? options.modules
    : (await Promise.all(DEFAULT_MODULES.map(async (name) => {
      const file = path.join(import.meta.dirname, name);
      return await exists(file) ? file : null;
    }))).filter(Boolean);
  if (modules.length === 0) throw new Error("No asset-spec modules were found");
  let specs = await loadSpecs(modules);
  if (options.only) specs = specs.filter((spec) => `${spec.assetId} ${spec.output}`.includes(options.only));
  if (specs.length === 0) throw new Error("No asset specs matched the requested build");

  const seen = new Set();
  const report = [];
  for (const spec of specs) {
    if (!(spec.scene?.isObject3D)) throw new Error(`${spec.assetId ?? "unnamed"} did not provide a Three scene`);
    const output = canonicalOutput(spec.output);
    if (seen.has(output)) throw new Error(`Multiple specs target '${output}'`);
    seen.add(output);
    const stats = sceneStats(spec.scene);
    const bytes = await exportBinary(spec.scene);
    const gltf = inspectGlbBuffer(bytes);
    const action = options.dryRun ? "dry-run" : await install(path.join(options.outputRoot, output), bytes, options.force);
    report.push({
      assetId: spec.assetId,
      output,
      level: spec.level ?? null,
      action,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      meshes: gltf.meshes,
      primitives: gltf.primitives,
      triangles: gltf.triangles,
      materials: gltf.materials,
      sockets: gltf.socketNames,
      boundsMetres: stats.boundsMetres,
      module: spec.module,
      metadata: spec.metadata ?? {},
    });
  }
  process.stdout.write(`${JSON.stringify({ outputRoot: path.relative(ROOT, options.outputRoot), assets: report }, null, 2)}\n`);
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try { process.exitCode = await main(); }
  catch (error) { process.stderr.write(`asset-generator: ${error.message}\n`); process.exitCode = 1; }
}
