import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyPublishedReleaseQueries } from "./stamp-release.mjs";

async function main() {
  const args = process.argv.slice(2);
  const wwwrootIndex = args.indexOf("--wwwroot");
  const wwwroot = args[wwwrootIndex + 1];
  if (wwwrootIndex < 0 || !wwwroot) {
    throw new Error(
      "usage: node tools/release/apply-release-queries.mjs --wwwroot <published-wwwroot>",
    );
  }
  const result = await applyPublishedReleaseQueries(path.resolve(wwwroot));
  process.stdout.write(
    `applied Build ${result.releaseBuild} to ${result.rewritten} published files\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
