#!/usr/bin/env node
/**
 * Score cobra corridor stills for emptiness.
 *
 *   node tools/cobra-scenery-gate/score.mjs --shots /tmp/guns-only-scenery-overnight/stills
 *   node tools/cobra-scenery-gate/score.mjs --shots DIR --mode fail
 *
 * Exit 0 = pass (or warn-only); 1 = fail; 2 = usage.
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  COBRA_BATTLE_PROOF_VIEWS,
  validateCobraBattleEvidence,
} from "./battle_evidence.mjs";
import { scorePngFile, verdict } from "./emptiness.mjs";

const EXPECTED_STILLS = Object.freeze([
  "camp-ember.png",
  "cockpit-battle.png",
  "iron-bell.png",
  "mid-gorge.png",
  "plantation-fight.png",
]);

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
  const availableNames = await readdir(dir);
  const names = availableNames
    .filter((name) => EXPECTED_STILLS.includes(name))
    .sort();
  const missingStills = EXPECTED_STILLS.filter((name) => !availableNames.includes(name));
  if (missingStills.length > 0) {
    console.error(
      `missing expected stills in ${dir}: ${missingStills.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  const scores = {};
  for (const name of names) {
    scores[name] = await scorePngFile(join(dir, name));
    const s = scores[name];
    console.log(
      `${name}: edge=${s.groundEdgeEnergy.toFixed(2)} spat=${s.groundSpatialVariance.toFixed(1)} `
      + `hetero=${s.groundHeterogeneity.toFixed(3)} ${s.pass ? "PASS" : "FAIL"}`,
    );
  }
  const result = verdict(scores);
  console.log(result.message);
  let battle;
  try {
    battle = validateCobraBattleEvidence(
      JSON.parse(await readFile(join(dir, "views.json"), "utf8")),
    );
  } catch (error) {
    battle = { pass: false, failures: [`views.json unreadable: ${error.message}`] };
  }
  if (battle.pass) {
    console.log(
      `cobra battle evidence PASS (${Object.keys(COBRA_BATTLE_PROOF_VIEWS).join(", ")})`,
    );
  } else {
    console.error(`cobra battle evidence FAIL:\n- ${battle.failures.join("\n- ")}`);
  }
  if ((!result.pass || !battle.pass) && args.mode === "fail") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
