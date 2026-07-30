#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  reconstructRapierFlightFromInputs,
  trackToCsv,
} from "./rapier_reconstruct.mjs";

const HELP = `Usage:
  node tools/telemetry/rapier_reconstruct_cli.mjs --input FILE [--input FILE ...] --output FILE [options]

Options:
  --sortie-id ID              Filter by telemetry_sortie_id
  --csv FILE                  Optional compact CSV track export
  --video-start-epoch-ms N    Recording start as Unix epoch milliseconds
  --video-sync-marker ID      Visible/telemetry marker ID, for example MARK-003
  --video-sync-seconds N      Marker time within the recording, in seconds
  --video-duration-s N        Optional recording window length in seconds
  --help                      Show this help

Inputs must be local .jsonl or .jsonl.gz files already on disk. This command never
contacts the network, reads credentials, or downloads telemetry. Missing rows and
coverage intervals are recorded explicitly; state is never invented across a gap.
The JSON output includes an audit verdict/findings plus raw exposure evidence. Legacy
clock origins are repaired only when stable wall_epoch_ms anchors prove the offset;
otherwise the clock is explicitly reported as unverified.

WARNING: Never download telemetry through the Vercel dashboard, a browser, the Codex
Chrome bridge, or browser automation. Use tools/telemetry/download.mjs or
tools/telemetry/admin.mjs, then reconstruct the local immutable chunks here.
`;

function numberOption(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
}

function parseArguments(args) {
  const options = { inputPaths: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const nextValue = () => {
      index += 1;
      if (index >= args.length || args[index].startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      return args[index];
    };
    switch (argument) {
      case "--help":
        options.help = true;
        break;
      case "--input":
        options.inputPaths.push(nextValue());
        break;
      case "--output":
        options.outputPath = nextValue();
        break;
      case "--csv":
        options.csvPath = nextValue();
        break;
      case "--sortie-id":
        options.sortieId = nextValue();
        break;
      case "--video-start-epoch-ms":
        options.videoStartEpochMs = numberOption(nextValue(), argument);
        break;
      case "--video-sync-marker":
        options.videoSyncMarker = nextValue();
        break;
      case "--video-sync-seconds":
        options.videoSyncSeconds = numberOption(nextValue(), argument);
        break;
      case "--video-duration-s":
        options.videoDurationS = numberOption(nextValue(), argument);
        break;
      default:
        throw new Error(`unknown option: ${argument}`);
    }
  }
  return options;
}

export async function main(args = process.argv.slice(2), io = console) {
  const options = parseArguments(args);
  if (options.help) {
    io.log(HELP);
    return;
  }
  if (!options.inputPaths.length || !options.outputPath) {
    throw new Error("--input and --output are required; use --help for usage");
  }
  io.error("Offline reconstruction: local immutable files only; no network or credentials.");
  const reconstruction = await reconstructRapierFlightFromInputs(options);
  const outputPath = resolve(options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(reconstruction, null, 2)}\n`, "utf8");

  let csvPath = null;
  if (options.csvPath) {
    csvPath = resolve(options.csvPath);
    await mkdir(dirname(csvPath), { recursive: true });
    await writeFile(csvPath, trackToCsv(reconstruction.track), "utf8");
  }
  io.log(JSON.stringify({
    status: "reconstructed",
    output: outputPath,
    csv: csvPath,
    sortie_id: reconstruction.sortie_id,
    decoded_samples: reconstruction.coverage.decoded_samples,
    covered_video_fraction: reconstruction.coverage.covered_video_fraction,
    gaps: reconstruction.gaps.length,
    audit_verdict: reconstruction.audit.verdict,
    audit_findings: reconstruction.audit.finding_counts,
    clock_status: reconstruction.coverage.clock.status,
    events: reconstruction.events.length,
    sources: reconstruction.sources.map(({ basename: name, sha256 }) => ({ basename: name, sha256 })),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
