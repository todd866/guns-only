#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { downloadBlob, DEFAULT_MAX_BLOB_BYTES } from "./retrieval.mjs";

const HELP = `Usage:
  node tools/telemetry/download.mjs --url URL --output FILE [options]

Options:
  --max-bytes N       Hard response limit (default: ${DEFAULT_MAX_BLOB_BYTES}, 128 MiB)
  --expected-size N   Require exactly N downloaded bytes
  --sha256 HEX        Require this SHA-256 checksum
  --etag VALUE        Require this response ETag
  --skip-existing     Trust an existing output without a network request
  --replace           Replace an existing output after one verified GET
  --timeout-ms N      Abort the one GET after N milliseconds
  --help              Show this help

BLOB_READ_WRITE_TOKEN is read only from the environment and is never printed.
This command issues exactly one GET for a missing/replaced blob: no HEAD, Range,
redirect following, automatic retry, or hidden chunk loop. A verified cache hit
issues no request.

WARNING: Never download telemetry through the Vercel dashboard, a browser, the
Codex Chrome bridge, or browser automation. Use this local command only.
`;

function integerOption(value, name) {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${name} must be an integer`);
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
      case "--url":
        options.url = nextValue();
        break;
      case "--output":
        options.outputPath = nextValue();
        break;
      case "--max-bytes":
        options.maxBytes = integerOption(nextValue(), "--max-bytes");
        break;
      case "--expected-size":
        options.expectedSize = integerOption(nextValue(), "--expected-size");
        break;
      case "--sha256":
        options.expectedSha256 = nextValue();
        break;
      case "--etag":
        options.expectedEtag = nextValue();
        break;
      case "--timeout-ms":
        options.timeoutMs = integerOption(nextValue(), "--timeout-ms");
        break;
      case "--skip-existing":
        options.skipExisting = true;
        break;
      case "--replace":
        options.replace = true;
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
  if (!options.url || !options.outputPath) {
    throw new Error("--url and --output are required; use --help for usage");
  }

  io.error(
    "WARNING: Production telemetry must not be downloaded through a dashboard, browser, or browser automation.",
  );
  const result = await downloadBlob({
    ...options,
    token: environment.BLOB_READ_WRITE_TOKEN,
  });
  io.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`telemetry download failed: ${error.message}`);
    process.exitCode = 1;
  });
}
