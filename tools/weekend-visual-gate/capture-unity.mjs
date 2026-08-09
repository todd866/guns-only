#!/usr/bin/env node

/** Run Unity's editor-only, silent, fixed-camera Weekend world capture and verify its outputs. */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  WeekendAcceptanceError,
  loadAcceptanceContract,
  validateCaptureManifest,
} from "./acceptance-contract.mjs";
import { decodeCapturePng } from "./compare-unity.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(MODULE_DIR, "../..");
export const DEFAULT_PROJECT_DIR = resolve(REPO_DIR, "unity/GunsOnly.Unity");
export const DEFAULT_OUT_DIR = resolve(MODULE_DIR, "shots/unity");
export const EXECUTE_METHOD =
  "GunsOnly.UnityEditorTools.WeekendVisualAcceptanceCapture.CaptureBatch";

export async function resolveUnityEditor(projectDir = DEFAULT_PROJECT_DIR, explicit = undefined) {
  if (explicit) {
    const candidate = resolve(explicit);
    if (!existsSync(candidate)) throw new WeekendAcceptanceError(`Unity editor does not exist: ${candidate}`);
    return candidate;
  }
  const versionPath = join(resolve(projectDir), "ProjectSettings/ProjectVersion.txt");
  let text;
  try { text = await readFile(versionPath, "utf8"); }
  catch (error) {
    throw new WeekendAcceptanceError(`Cannot read Unity project version '${versionPath}': ${error.message}`);
  }
  const version = /^m_EditorVersion:\s*(\S+)/m.exec(text)?.[1];
  if (!version) throw new WeekendAcceptanceError("Unity project version is missing.");
  const candidate = `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`;
  if (!existsSync(candidate)) {
    throw new WeekendAcceptanceError(
      `Unity ${version} is unavailable at ${candidate}; native Weekend capture cannot be asserted.`,
    );
  }
  return candidate;
}

export function buildUnityArguments(projectDir) {
  const args = [
    "-batchmode",
    "-quit",
    "-projectPath",
    resolve(projectDir),
    "-executeMethod",
    EXECUTE_METHOD,
    "-logFile",
    "-",
  ];
  if (args.includes("-nographics")) {
    throw new WeekendAcceptanceError("Weekend visual capture must retain a graphics device.");
  }
  return Object.freeze(args);
}

export function parseArgs(argv) {
  const options = {
    unity: process.env.UNITY_EDITOR || undefined,
    projectDir: DEFAULT_PROJECT_DIR,
    outDir: resolve(process.env.WEEKEND_UNITY_VISUAL_SHOT_DIR ?? DEFAULT_OUT_DIR),
    contractPath: undefined,
  };
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === "-h" || option === "--help") return { help: true };
    if (index + 1 >= argv.length) throw new TypeError(`${option} requires a value.`);
    const value = argv[++index];
    if (option === "--unity") options.unity = resolve(value);
    else if (option === "--project") options.projectDir = resolve(value);
    else if (option === "--out") options.outDir = resolve(value);
    else if (option === "--contract") options.contractPath = resolve(value);
    else throw new TypeError(`Unknown option '${option}'.`);
  }
  return options;
}

function runEditor(editor, args, env) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(editor, args, { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Unity capture terminated by ${signal}.`));
      else resolveExit(code ?? 1);
    });
  });
}

export async function validateUnityCaptureOutputs(outDir, contractPath = undefined) {
  const loadedContract = await loadAcceptanceContract(contractPath);
  const manifestPath = join(resolve(outDir), "weekend_visual_capture.json");
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) {
    throw new WeekendAcceptanceError(`Unity capture manifest '${manifestPath}' is unreadable: ${error.message}`);
  }
  validateCaptureManifest(manifest, "unity", loadedContract);
  for (const view of loadedContract.contract.views) {
    const path = join(resolve(outDir), view.unity_file);
    let bytes;
    try { bytes = await readFile(path); }
    catch (error) {
      throw new WeekendAcceptanceError(`Unity Weekend plate '${path}' is missing: ${error.message}`);
    }
    decodeCapturePng(bytes, `Unity ${view.id}`);
  }
  return Object.freeze({ manifestPath, manifest });
}

export async function captureUnity(options = {}) {
  const projectDir = resolve(options.projectDir ?? DEFAULT_PROJECT_DIR);
  const outDir = resolve(options.outDir ?? DEFAULT_OUT_DIR);
  const loadedContract = await loadAcceptanceContract(options.contractPath);
  const editor = await resolveUnityEditor(projectDir, options.unity);
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    rm(join(outDir, "weekend_visual_capture.json"), { force: true }),
    ...loadedContract.contract.views.map((view) =>
      rm(join(outDir, view.unity_file), { force: true })),
  ]);
  const exitCode = await runEditor(editor, buildUnityArguments(projectDir), {
    ...process.env,
    WEEKEND_UNITY_VISUAL_SHOT_DIR: outDir,
  });
  if (exitCode !== 0) {
    throw new WeekendAcceptanceError(`Unity Weekend capture failed with exit code ${exitCode}.`);
  }
  await validateUnityCaptureOutputs(outDir, options.contractPath);
  return outDir;
}

const HELP = `Usage: node tools/weekend-visual-gate/capture-unity.mjs [options]\n\nOptions:\n  --unity PATH     Unity editor executable (defaults from ProjectVersion.txt)\n  --project DIR    Unity project directory\n  --out DIR        exact 1600x1000 capture output directory\n  --contract FILE  acceptance contract used to validate emitted files\n\nThe editor is intentionally launched without -nographics: capture is offscreen and silent, but it requires the native graphics device.\n`;

export async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); }
  catch (error) {
    process.stderr.write(`weekend-unity-capture: ${error.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  try {
    const outDir = await captureUnity(options);
    process.stdout.write(`weekend-unity-capture: PASS -> ${outDir}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`weekend-unity-capture: ${error instanceof Error ? error.stack : String(error)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = await main();
