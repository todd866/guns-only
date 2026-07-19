#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_LIST_LIMIT, listTelemetryBlobs, MAX_LIST_LIMIT } from "./retrieval.mjs";

const HELP = `Usage:
  node tools/telemetry/list.mjs [--prefix telemetry/...] [--limit N] [--cursor VALUE]

Options:
  --prefix VALUE      Telemetry pathname prefix (default: telemetry/)
  --limit N           One-page item cap (default: ${DEFAULT_LIST_LIMIT}, maximum: ${MAX_LIST_LIMIT})
  --cursor VALUE      Explicit cursor for one later page
  --timeout-ms N      Abort the one list GET after N milliseconds
  --help              Show this help

This is a separate, explicit metadata operation. It makes exactly one bounded
list GET, never auto-paginates, and never downloads a blob body.
BLOB_READ_WRITE_TOKEN is read only from the environment and is never printed.

WARNING: Never browse or download telemetry through the Vercel dashboard, a
browser, the Codex Chrome bridge, or browser automation.
`;

function positiveIntegerOption(value, name) {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is too large`);
  return parsed;
}

function parseArguments(args) {
  const options = {};
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
      case "--prefix":
        options.prefix = nextValue();
        break;
      case "--limit":
        options.limit = positiveIntegerOption(nextValue(), "--limit");
        break;
      case "--cursor":
        options.cursor = nextValue();
        break;
      case "--timeout-ms":
        options.timeoutMs = positiveIntegerOption(nextValue(), "--timeout-ms");
        break;
      default:
        throw new Error(`unknown option: ${argument}`);
    }
  }
  return options;
}

export async function main(args = process.argv.slice(2), environment = process.env, io = console) {
  const options = parseArguments(args);
  if (options.help) {
    io.log(HELP);
    return;
  }

  io.error(
    "Telemetry list: one bounded metadata request only; no blob bodies and no automatic pagination.",
  );
  io.error(
    "WARNING: Production telemetry must not be browsed through a dashboard, browser, or browser automation.",
  );
  const result = await listTelemetryBlobs({
    ...options,
    token: environment.BLOB_READ_WRITE_TOKEN,
  });
  io.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`telemetry list failed: ${error.message}`);
    process.exitCode = 1;
  });
}
