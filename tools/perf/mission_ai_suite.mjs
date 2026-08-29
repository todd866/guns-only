#!/usr/bin/env node

import process from "node:process";
import { fileURLToPath } from "node:url";

import { runCasevacAiFlight } from "./casevac_ai_player.mjs";
import { runCobraAiFlight } from "./cobra_ai_pilot.mjs";
import { runFixedWingAiFlight, FIXED_WING_AI_MISSIONS } from "./fixed_wing_ai_pilot.mjs";
import { runIndoorAiPlayer } from "./indoor_ai_player.mjs";
import { runOkanaganAiFlight } from "./okanagan_ai_player.mjs";
import { runWeekendAiRide } from "./weekend_ai_rider.mjs";

const fixedWingRunner = (mission) => (options) => runFixedWingAiFlight({
  ...options,
  mission,
});

// One registry is the honest coverage ledger. A mission only belongs here when its driver crosses
// production input, advances real authority and grades terminal evidence. Screenshot-only smokes
// and QA teleports are intentionally absent.
export const MISSION_AI_RUNNERS = Object.freeze({
  cobra: (options) => runCobraAiFlight({ ...options, goal: "engage" }),
  f22: fixedWingRunner("f22"),
  "first-run": fixedWingRunner("first-run"),
  "top-gun": fixedWingRunner("top-gun"),
  rapier: fixedWingRunner("rapier"),
  indoor: (options) => runIndoorAiPlayer(options),
  weekend: (options) => runWeekendAiRide({ ...options, goal: "lap" }),
  okanagan: (options) => runOkanaganAiFlight(options),
  casevac: (options) => runCasevacAiFlight(options),
});

export const DEFAULT_MISSION_AI_SELECTION = Object.freeze(Object.keys(MISSION_AI_RUNNERS));

export function parseMissionAiSelection(value, available = DEFAULT_MISSION_AI_SELECTION) {
  const requested = String(value ?? available.join(","))
    .split(",")
    .map((mission) => mission.trim())
    .filter(Boolean);
  const unknown = requested.filter((mission) => !available.includes(mission));
  if (unknown.length > 0) {
    throw new Error(
      `unknown AI mission${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}; `
      + `available: ${available.join(", ")}`,
    );
  }
  return [...new Set(requested)];
}

export async function runMissionAiSuite({
  wwwroot,
  missions = DEFAULT_MISSION_AI_SELECTION,
  hardware = false,
  outputDirectory = "/tmp/guns-mission-ai",
  runners = MISSION_AI_RUNNERS,
  now = () => Date.now(),
} = {}) {
  if (!wwwroot) throw new Error("wwwroot is required");
  const selected = parseMissionAiSelection(
    Array.isArray(missions) ? missions.join(",") : missions,
    Object.keys(runners),
  );
  const results = [];
  for (const mission of selected) {
    const startedAt = now();
    try {
      const result = await runners[mission]({
        wwwroot,
        hardware,
        outputDirectory: `${outputDirectory}/${mission}`,
      });
      const assessment = result?.assessment ?? {};
      results.push({
        mission,
        pass: assessment.pass === true,
        elapsedSeconds: (now() - startedAt) / 1_000,
        metrics: assessment.metrics ?? {},
        ...(assessment.pass === true ? {} : {
          error: (assessment.failures ?? ["driver returned no passing assessment"]).join("; "),
        }),
      });
    } catch (error) {
      results.push({
        mission,
        pass: false,
        elapsedSeconds: (now() - startedAt) / 1_000,
        error: error?.message ?? String(error),
      });
    }
  }
  return Object.freeze({
    pass: results.length > 0 && results.every((result) => result.pass),
    results: Object.freeze(results),
  });
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(`file://${process.argv[1]}`)) {
  if (process.argv.includes("--list")) {
    console.log(DEFAULT_MISSION_AI_SELECTION.join("\n"));
  } else {
    const wwwroot = process.env.GUNS_WWWROOT;
    if (!wwwroot) throw new Error("GUNS_WWWROOT must point at a published wwwroot");
    const result = await runMissionAiSuite({
      wwwroot,
      missions: parseMissionAiSelection(argumentValue("missions")),
      hardware: process.argv.includes("--hardware"),
      outputDirectory: process.env.OUT ?? "/tmp/guns-mission-ai",
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exitCode = 1;
  }
}

// Keep this import meaningful and make drift in the fixed-wing registry visible during review.
if (Object.keys(FIXED_WING_AI_MISSIONS).some((mission) => !(mission in MISSION_AI_RUNNERS))) {
  throw new Error("mission AI suite is missing a fixed-wing driver");
}
