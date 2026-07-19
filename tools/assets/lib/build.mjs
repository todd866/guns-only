import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  displayCommand,
  fileInfo,
  isInside,
  isRegularFile,
  pathExists,
  relativeToRoot,
  stableStringify,
  walkFiles,
} from "./common.mjs";
import { inspectModelFile } from "./glb.mjs";
import { validateRepository } from "./validator.mjs";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BLENDER_SCRIPT = path.resolve(MODULE_DIRECTORY, "../blender/export_glb.py");

function assertExtension(file, extensions, label) {
  if (!extensions.includes(path.extname(file).toLowerCase())) throw new Error(`${label} must use ${extensions.join(" or ")}: ${file}`);
}

async function assertInputFile(file, label) {
  if (!(await isRegularFile(file))) throw new Error(`${label} does not exist or is not a regular file: ${file}`);
}

async function executableCandidate(value) {
  if (value.includes(path.sep)) {
    const absolute = path.resolve(value);
    try { await access(absolute, fsConstants.X_OK); return absolute; } catch { return null; }
  }
  const directories = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    const candidate = path.join(directory, value);
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

export async function resolveExecutable(value, options = {}) {
  const found = await executableCandidate(value);
  if (found) return found;
  for (const fallback of options.fallbacks ?? []) {
    const candidate = await executableCandidate(fallback);
    if (candidate) return candidate;
  }
  if (options.required !== false) throw new Error(`${options.label ?? value} executable was not found; pass an explicit path`);
  return value;
}

export function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: options.stdio ?? "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ code: 0, signal: null });
      else reject(new Error(`${path.basename(command[0])} exited ${signal ? `for signal ${signal}` : `with status ${code}`}`));
    });
  });
}

async function probeExecutable(executable, label) {
  try { await runCommand([executable, "--version"], { stdio: "ignore" }); }
  catch (error) { throw new Error(`${label} executable is not runnable: ${error.message}`); }
}

export async function planExport(options) {
  const base = path.resolve(options.root ?? process.cwd());
  const source = path.resolve(base, options.source);
  const output = path.resolve(base, options.output);
  const script = options.script ? path.resolve(base, options.script) : DEFAULT_BLENDER_SCRIPT;
  if (source === output) throw new Error("export source and output must be different files");
  assertExtension(source, [".blend"], "export source");
  assertExtension(output, [".glb"], "export output");
  if (options.collection && options.selection) throw new Error("--collection and --selection are mutually exclusive");
  await assertInputFile(source, "Blender source");
  await assertInputFile(script, "Blender export script");
  const shouldResolve = options.check === true || options.dryRun !== true;
  const blender = await resolveExecutable(options.blender ?? process.env.BLENDER ?? "blender", {
    label: "Blender",
    fallbacks: ["/opt/homebrew/bin/blender", "/Applications/Blender.app/Contents/MacOS/Blender"],
    required: shouldResolve,
  });
  const command = [blender, "--background", source, "--python", script, "--", "--output", output];
  if (options.collection) command.push("--collection", options.collection);
  if (options.selection) command.push("--selection");
  if (options.applyModifiers !== false) command.push("--apply-modifiers");
  if (options.animations === true) command.push("--animations");
  if (options.allowUnappliedTransforms === true) command.push("--allow-unapplied-transforms");
  return { kind: "export", source, output, command };
}

export async function executeExport(options) {
  const plan = await planExport(options);
  if (options.check) {
    await probeExecutable(plan.command[0], "Blender");
    return { ...plan, executed: false };
  }
  if (options.dryRun) return { ...plan, executed: false };
  if (await pathExists(plan.output) && options.force !== true) throw new Error(`export output already exists (pass --force to replace): ${plan.output}`);
  await mkdir(path.dirname(plan.output), { recursive: true });
  await runCommand(plan.command, { cwd: options.root });
  await assertInputFile(plan.output, "Blender export output");
  return { ...plan, executed: true, inspection: await inspectModelFile(plan.output) };
}

export async function planOptimize(options) {
  const base = path.resolve(options.root ?? process.cwd());
  const source = path.resolve(base, options.source);
  const output = path.resolve(base, options.output);
  if (source === output) throw new Error("optimization source and output must be different files");
  assertExtension(source, [".glb", ".gltf"], "optimization source");
  assertExtension(output, [".glb", ".gltf"], "optimization output");
  if (options.skipInputCheck !== true) await assertInputFile(source, "optimization source");
  const shouldResolve = options.check === true || options.dryRun !== true;
  const executable = await resolveExecutable(options.gltfTransform ?? "gltf-transform", {
    label: "glTF Transform",
    required: shouldResolve,
  });
  const command = [executable, "optimize", source, output];
  const compression = options.compress ?? "meshopt";
  const textureCompression = options.textureCompress ?? "ktx2";
  if (!new Set(["meshopt", "none"]).has(compression)) throw new Error("--compress must be meshopt or none");
  if (!new Set(["ktx2", "webp", "none"]).has(textureCompression)) throw new Error("--texture-compress must be ktx2, webp, or none");
  if (compression !== "none") command.push("--compress", compression);
  if (textureCompression !== "none") command.push("--texture-compress", textureCompression);
  if (options.textureSize !== undefined) {
    if (!Number.isInteger(options.textureSize) || options.textureSize < 1) throw new Error("--texture-size must be a positive integer");
    command.push("--texture-size", String(options.textureSize));
  }
  if (options.simplify === true) command.push("--simplify");
  return { kind: "optimize", source, output, command };
}

export async function executeOptimize(options) {
  const plan = await planOptimize(options);
  if (options.check) {
    await probeExecutable(plan.command[0], "glTF Transform");
    return { ...plan, executed: false };
  }
  if (options.dryRun) return { ...plan, executed: false };
  if (await pathExists(plan.output) && options.force !== true) throw new Error(`optimized output already exists (pass --force to replace): ${plan.output}`);
  await mkdir(path.dirname(plan.output), { recursive: true });
  await runCommand(plan.command, { cwd: options.root });
  await assertInputFile(plan.output, "optimized output");
  return { ...plan, executed: true, inspection: await inspectModelFile(plan.output) };
}

export async function executeInspect(options) {
  const source = path.resolve(options.root ?? process.cwd(), options.source);
  await assertInputFile(source, "inspection source");
  assertExtension(source, [".glb", ".gltf"], "inspection source");
  if (options.builtin === true) return { kind: "inspect", source, builtin: true, inspection: await inspectModelFile(source), executed: true };
  const shouldResolve = options.check === true || options.dryRun !== true;
  const executable = await resolveExecutable(options.gltfTransform ?? "gltf-transform", { label: "glTF Transform", required: shouldResolve });
  const command = [executable, "inspect", source];
  if (options.check) {
    await probeExecutable(command[0], "glTF Transform");
    return { kind: "inspect", source, builtin: false, command, executed: false };
  }
  if (options.dryRun) return { kind: "inspect", source, builtin: false, command, executed: false };
  await runCommand(command, { cwd: options.root });
  return { kind: "inspect", source, builtin: false, command, executed: true };
}

export async function executePipeline(options) {
  const base = path.resolve(options.root ?? process.cwd());
  const output = path.resolve(base, options.output);
  const intermediate = options.intermediate
    ? path.resolve(base, options.intermediate)
    : path.join(path.dirname(output), `${path.basename(output, path.extname(output))}.raw.glb`);
  if (intermediate === output) throw new Error("pipeline intermediate and output must be different files");
  const exportPlan = await planExport({ ...options, output: intermediate });
  if (options.dryRun || options.check) {
    const optimizePlan = await planOptimize({ ...options, source: intermediate, output, skipInputCheck: true });
    if (options.check) {
      await probeExecutable(exportPlan.command[0], "Blender");
      await probeExecutable(optimizePlan.command[0], "glTF Transform");
    }
    return { kind: "pipeline", export: exportPlan, optimize: optimizePlan, executed: false };
  }
  const exported = await executeExport({ ...options, output: intermediate });
  const optimized = await executeOptimize({ ...options, source: intermediate, output });
  return { kind: "pipeline", export: exported, optimize: optimized, executed: true };
}

async function fileTree(directory) {
  if (!(await pathExists(directory))) return [];
  const files = await walkFiles(directory);
  const entries = [];
  for (const file of files) {
    const info = await fileInfo(file);
    entries.push({ path: path.relative(directory, file).split(path.sep).join("/"), bytes: info.bytes, sha256: info.sha256 });
  }
  return entries;
}

function treeDigest(entries) {
  return createHash("sha256").update(stableStringify(entries, 0)).digest("hex");
}

async function copyEntries(entries, target) {
  for (const entry of entries) {
    const destination = path.join(target, ...entry.relative.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(entry.source, destination);
  }
}

async function stagedTree(entries) {
  const results = [];
  for (const entry of entries) {
    const info = await fileInfo(entry.source);
    results.push({ path: entry.relative, bytes: info.bytes, sha256: info.sha256 });
  }
  return results.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

async function installDirectory(entries, target, replace) {
  const desired = await stagedTree(entries);
  const existing = await fileTree(target);
  const targetExists = await pathExists(target);
  if (existing.length && treeDigest(existing) === treeDigest(desired)) return { target, action: "unchanged", files: desired };
  if (targetExists && !replace) throw new Error(`staged target differs and already exists (pass --replace): ${target}`);
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(path.join(parent, `.${path.basename(target)}.staging-`));
  const backup = `${temporary}.previous`;
  try {
    await copyEntries(entries, temporary);
    if (targetExists) await rename(target, backup);
    await rename(temporary, target);
    if (await pathExists(backup)) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (!(await pathExists(target)) && await pathExists(backup)) await rename(backup, target);
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { target, action: targetExists ? "replaced" : "created", files: desired };
}

export async function planStage(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const packInput = options.pack;
  if (!packInput) throw new Error("stage requires --pack <pack.json>");
  const packFile = path.resolve(root, packInput);
  const outputRoot = path.resolve(root, options.output ?? "web/wwwroot/content");
  if (!isInside(root, packFile)) throw new Error("pack must be inside the repository root");
  const report = await validateRepository({ root, packs: [relativeToRoot(root, packFile)], strict: true });
  if (!report.ok) {
    const first = report.errors[0] ?? report.warnings[0];
    throw new Error(`pack validation failed${first ? `: [${first.code}] ${first.file} ${first.message}` : ""}`);
  }
  const closure = report.packClosures.find((item) => path.resolve(item.packFile) === packFile);
  if (!closure) throw new Error(`validated pack closure was not returned for ${packFile}`);
  const packDirectory = closure.sourceDirectory;
  const packEntries = closure.runtimeFiles.map((source) => {
    if (!isInside(packDirectory, source)) throw new Error(`runtime file is outside pack directory: ${source}`);
    return { source, relative: path.relative(packDirectory, source).split(path.sep).join("/") };
  }).sort((a, b) => a.relative.localeCompare(b.relative, "en"));
  const schemaDirectory = path.join(root, options.schemaDir ?? "content/schemas");
  const schemaEntries = (await walkFiles(schemaDirectory)).filter((file) => file.endsWith(".schema.json")).map((source) => ({
    source,
    relative: path.basename(source),
  })).sort((a, b) => a.relative.localeCompare(b.relative, "en"));
  if (!schemaEntries.length) throw new Error(`no schemas found in ${schemaDirectory}`);
  const packTarget = path.join(outputRoot, "packs", closure.id);
  const schemaTarget = path.join(outputRoot, "schemas");
  if (isInside(packDirectory, outputRoot)) throw new Error("stage output must not be inside the source pack directory");
  if (isInside(packDirectory, packTarget) || isInside(packTarget, packDirectory)) throw new Error("staged pack target must not overlap the authoring pack directory");
  if (isInside(schemaDirectory, schemaTarget) || isInside(schemaTarget, schemaDirectory)) throw new Error("staged schema target must not overlap the authoring schema directory");
  return {
    kind: "stage",
    root,
    outputRoot,
    packId: closure.id,
    packFile,
    packTarget,
    schemaTarget,
    packEntries,
    schemaEntries,
    report,
  };
}

export async function executeStage(options) {
  const plan = await planStage(options);
  const desiredSchemas = await stagedTree(plan.schemaEntries);
  const desiredPack = await stagedTree(plan.packEntries);
  const currentSchemas = await fileTree(plan.schemaTarget);
  const currentPack = await fileTree(plan.packTarget);
  const schemasExist = await pathExists(plan.schemaTarget);
  const packExists = await pathExists(plan.packTarget);
  const schemasMatch = schemasExist && treeDigest(currentSchemas) === treeDigest(desiredSchemas);
  const packMatches = packExists && treeDigest(currentPack) === treeDigest(desiredPack);
  const preview = {
    kind: "stage",
    packId: plan.packId,
    outputRoot: plan.outputRoot,
    schemaTarget: plan.schemaTarget,
    packTarget: plan.packTarget,
    schemas: { action: schemasMatch ? "unchanged" : schemasExist ? "replace" : "create", files: desiredSchemas },
    pack: { action: packMatches ? "unchanged" : packExists ? "replace" : "create", files: desiredPack },
    executed: false,
  };
  if (!options.replace && (preview.schemas.action === "replace" || preview.pack.action === "replace")) throw new Error("staged output differs; pass --replace to permit replacement");
  if (options.dryRun || options.check) {
    return preview;
  }
  const schemas = await installDirectory(plan.schemaEntries, plan.schemaTarget, options.replace === true);
  const pack = await installDirectory(plan.packEntries, plan.packTarget, options.replace === true);
  return { ...preview, schemas, pack, executed: true };
}

export function formatBuildResult(result) {
  if (result.kind === "stage") {
    return `${stableStringify({
      command: "stage",
      executed: result.executed,
      outputRoot: result.outputRoot,
      pack: { id: result.packId, target: result.packTarget, action: result.pack.action, files: result.pack.files.length },
      schemas: { target: result.schemaTarget, action: result.schemas.action, files: result.schemas.files.length },
    })}`;
  }
  if (result.kind === "pipeline") {
    return `${result.export.command ? `${displayCommand(result.export.command)}\n` : ""}${result.optimize.command ? `${displayCommand(result.optimize.command)}\n` : ""}`;
  }
  if (result.inspection) return stableStringify(result.inspection);
  if (result.command) return `${displayCommand(result.command)}\n`;
  return stableStringify(result);
}
