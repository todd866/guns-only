#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stableStringify } from "./lib/common.mjs";
import { formatValidationReport, publicReport, validateRepository } from "./lib/validator.mjs";

const HELP = `Usage: node tools/assets/validate-manifests.mjs [options]

Validates pack.json, visual-profile.json, asset-manifest.json and licenses.json with
content/schemas/*.schema.json plus repository conventions and referenced files.

Options:
  --root <directory>       Repository root (default: current directory)
  --schema-dir <path>      Schema directory relative to root (default: content/schemas)
  --pack <pack.json>       Validate only this pack closure; repeatable
  --strict                 Treat warnings as failures
  --json                   Emit deterministic JSON instead of text
  -h, --help               Show this help
`;

export function parseValidateArgs(argv) {
  const options = { root: process.cwd(), packs: [], strict: false, json: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) throw new Error(`${value} requires a value`);
      return argv[++index];
    };
    switch (value) {
      case "--root": options.root = path.resolve(next()); break;
      case "--schema-dir": options.schemaDir = next(); break;
      case "--pack": options.packs.push(next()); break;
      case "--strict": options.strict = true; break;
      case "--json": options.json = true; break;
      case "-h":
      case "--help": options.help = true; break;
      default: throw new Error(`Unknown option '${value}'`);
    }
  }
  if (options.packs.length === 0) delete options.packs;
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseValidateArgs(argv); }
  catch (error) {
    process.stderr.write(`asset-validator: ${error.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const report = await validateRepository(options);
  process.stdout.write(options.json ? stableStringify(publicReport(report)) : formatValidationReport(report));
  return report.ok ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = await main();
