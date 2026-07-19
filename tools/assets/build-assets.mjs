#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stableStringify } from "./lib/common.mjs";
import {
  executeExport,
  executeInspect,
  executeOptimize,
  executePipeline,
  executeStage,
  formatBuildResult,
} from "./lib/build.mjs";

const HELP = `Usage: node tools/assets/build-assets.mjs <command> [options]

Offline graphics asset build, inspection, and staging commands:
  export      Export a .blend scene or collection to raw GLB with Blender
  optimize    Optimize GLB/glTF with the glTF Transform CLI
  inspect     Inspect GLB/glTF (use --builtin for the dependency-free inspector)
  pipeline    Run export then optimize, keeping a deterministic raw GLB
  stage       Validate and stage a content pack beneath a web output root

Shared options:
  --root <directory>                Repository root (default: current directory)
  --dry-run                         Print the exact plan without requiring tools
  --check                           Validate inputs and required executables only
  --json                            Emit deterministic JSON
  -h, --help                        Show this help

export / pipeline:
  --source <file.blend>             Blender source (required)
  --output <file.glb>               Output GLB (required)
  --blender <executable>            Blender executable (auto-detected by default)
  --script <export_glb.py>          Override the bundled Blender automation
  --collection <name>               Export one collection and its descendants
  --selection                       Export the selection saved in the .blend
  --no-apply-modifiers              Do not apply modifiers during export
  --animations                      Export animation clips
  --allow-unapplied-transforms      Permit non-unit scale after validation warning
  --force                           Permit replacing an existing output file

optimize / pipeline:
  --gltf-transform <executable>     glTF Transform executable (default: gltf-transform)
  --compress <meshopt|none>         Geometry compression (default: meshopt)
  --texture-compress <ktx2|webp|none> Texture compression (default: ktx2)
  --texture-size <pixels>           Maximum texture dimension
  --simplify                        Enable glTF Transform simplification
  --intermediate <file.glb>         Raw pipeline GLB (default: <output>.raw.glb)

inspect:
  --source <file.glb|file.gltf>     Model to inspect (required)
  --builtin                         Use the dependency-free JSON/GLB inspector
  --gltf-transform <executable>     glTF Transform executable

stage:
  --pack <content/.../pack.json>    Validated source pack (required)
  --output <directory>              Output root (default: web/wwwroot/content)
  --schema-dir <directory>          Schema source (default: content/schemas)
  --replace                         Atomically replace differing staged directories

Examples:
  node tools/assets/build-assets.mjs inspect --builtin --source build/fighter.glb
  node tools/assets/build-assets.mjs pipeline --dry-run --source art/fighter.blend --output build/fighter.glb
  node tools/assets/build-assets.mjs stage --dry-run --pack content/packs/korea-1950s/pack.json
`;

const VALUE_OPTIONS = new Map([
  ["--root", "root"], ["--source", "source"], ["--output", "output"],
  ["--blender", "blender"], ["--script", "script"], ["--collection", "collection"],
  ["--gltf-transform", "gltfTransform"], ["--compress", "compress"],
  ["--texture-compress", "textureCompress"], ["--texture-size", "textureSize"],
  ["--intermediate", "intermediate"], ["--pack", "pack"], ["--schema-dir", "schemaDir"],
]);

const FLAG_OPTIONS = new Map([
  ["--dry-run", ["dryRun", true]], ["--check", ["check", true]], ["--json", ["json", true]],
  ["--selection", ["selection", true]], ["--no-apply-modifiers", ["applyModifiers", false]],
  ["--animations", ["animations", true]], ["--allow-unapplied-transforms", ["allowUnappliedTransforms", true]],
  ["--force", ["force", true]], ["--simplify", ["simplify", true]], ["--builtin", ["builtin", true]],
  ["--replace", ["replace", true]], ["-h", ["help", true]], ["--help", ["help", true]],
]);

function requireFields(options, fields) {
  for (const field of fields) if (typeof options[field] !== "string" || options[field].length === 0) throw new Error(`${options.command} requires --${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
}

export function parseBuildArgs(argv) {
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") return { help: true, root: process.cwd() };
  const options = { command: argv[0], root: process.cwd(), applyModifiers: true };
  if (!new Set(["export", "optimize", "inspect", "pipeline", "stage"]).has(options.command)) throw new Error(`unknown command '${options.command}'`);
  for (let index = 1; index < argv.length; index++) {
    const value = argv[index];
    if (VALUE_OPTIONS.has(value)) {
      if (index + 1 >= argv.length) throw new Error(`${value} requires a value`);
      options[VALUE_OPTIONS.get(value)] = argv[++index];
    } else if (FLAG_OPTIONS.has(value)) {
      const [name, flagValue] = FLAG_OPTIONS.get(value);
      options[name] = flagValue;
    } else throw new Error(`unknown option '${value}'`);
  }
  options.root = path.resolve(options.root);
  if (options.textureSize !== undefined) {
    options.textureSize = Number(options.textureSize);
    if (!Number.isInteger(options.textureSize) || options.textureSize < 1) throw new Error("--texture-size must be a positive integer");
  }
  if (options.dryRun && options.check) throw new Error("--dry-run and --check are mutually exclusive");
  if (!options.help) {
    if (options.command === "export" || options.command === "optimize" || options.command === "pipeline") requireFields(options, ["source", "output"]);
    if (options.command === "inspect") requireFields(options, ["source"]);
    if (options.command === "stage") requireFields(options, ["pack"]);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseBuildArgs(argv); }
  catch (error) {
    process.stderr.write(`asset-build: ${error.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  try {
    let result;
    switch (options.command) {
      case "export": result = await executeExport(options); break;
      case "optimize": result = await executeOptimize(options); break;
      case "inspect": result = await executeInspect(options); break;
      case "pipeline": result = await executePipeline(options); break;
      case "stage": result = await executeStage(options); break;
      default: throw new Error(`unsupported command '${options.command}'`);
    }
    process.stdout.write(options.json ? stableStringify(result) : formatBuildResult(result));
    return 0;
  } catch (error) {
    process.stderr.write(`asset-build: ${error.message}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = await main();
