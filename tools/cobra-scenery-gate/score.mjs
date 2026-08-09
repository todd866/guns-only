#!/usr/bin/env node
/**
 * Score Cobra corridor stills for coherent multi-scale structure and rendering artifacts.
 *
 *   node tools/cobra-scenery-gate/score.mjs --shots /tmp/guns-only-scenery-overnight/stills
 *   node tools/cobra-scenery-gate/score.mjs --shots DIR --mode fail
 *
 * Exit 0 = pass (or warn-only); 1 = fail; 2 = usage.
 */

import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scorePngFile, verdict } from "./emptiness.mjs";

function usage() {
  console.error("Usage: node tools/cobra-scenery-gate/score.mjs --shots <dir> [--mode warn|fail]");
}

function parseArgs(argv) {
  const args = { shots: null, mode: "fail" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--shots") args.shots = argv[++i];
    else if (a === "--mode") args.mode = argv[++i];
    else if (a === "--help" || a === "-h") return null;
    else {
      console.error(`Unknown arg: ${a}`);
      return null;
    }
  }
  if (!args.shots || !["warn", "fail"].includes(args.mode)) return null;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    usage();
    process.exitCode = 2;
    return;
  }
  const dir = resolve(args.shots);
  const names = (await readdir(dir))
    .filter((n) => /^(camp-ember|mid-gorge|iron-bell)\.png$/.test(n))
    .sort();
  const expectedNames = ["camp-ember.png", "iron-bell.png", "mid-gorge.png"];
  if (names.length !== expectedNames.length
      || expectedNames.some((name, index) => names[index] !== name)) {
    console.error(`need all canonical stills (${expectedNames.join(", ")}) in ${dir}`);
    process.exitCode = 1;
    return;
  }
  const scores = {};
  for (const name of names) {
    scores[name] = await scorePngFile(join(dir, name));
    const s = scores[name];
    console.log(
      `${name}: skyP90=${s.skyHighFrequencyP90.toFixed(2)} `
      + `skyNoise=${s.skyHighFrequencyFraction.toFixed(3)} `
      + `microOnly=${s.groundMicroDominantFraction.toFixed(3)} `
      + `meso=${s.groundMesoTileFraction.toFixed(3)} `
      + `shadow=${s.groundShadowFraction.toFixed(3)} `
      + `pale=${s.groundPaleComponentFraction.toFixed(3)} `
      + `${s.pass ? "PASS" : "FAIL"}`,
    );
  }
  const result = verdict(scores);
  console.log(result.message);
  if (!result.pass && args.mode === "fail") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
