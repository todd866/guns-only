import {
  chmod,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = path.resolve(TOOL_ROOT, "../..");
const RELEASE_IDENTITY = "web/wwwroot/render/release/release_identity.js";
const BUILD_INFO = "web/wwwroot/api/build-info.js";
const SERVICE_WORKER = "web/wwwroot/service-worker.js";
const INDEX = "web/wwwroot/index.html";
const STATUS = "docs/STATUS.md";
// Source keeps this placeholder. Publish rewrites it to the numeric build so browsers and the
// service worker never mix releases, without storing that number in every module.
export const RELEASE_QUERY_TOKEN = "__RELEASE_BUILD__";
const STAMPED_FILES = Object.freeze([RELEASE_IDENTITY, STATUS]);
const SOURCE_EXTENSIONS = new Set([".html", ".js", ".mjs"]);
const PUBLISHED_EXTENSIONS = new Set([".css", ".html", ".js", ".mjs"]);
const SKIPPED_DIRECTORIES = new Set([
  "_framework",
  "art",
  "content",
  "node_modules",
  "tests",
  "vendor",
]);
const DEFAULT_FILE_SYSTEM = Object.freeze({
  chmod,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
});

export function materializeReleaseSource(source, build) {
  return source.replaceAll(RELEASE_QUERY_TOKEN, String(build));
}

function candidateLine(build) {
  return `Next candidate: Build ${build}`;
}

export function stampSource(relativePath, source, currentBuild, nextBuild) {
  if (relativePath === RELEASE_IDENTITY) {
    const pattern = new RegExp(`(export const RELEASE_BUILD = ")${currentBuild}(";)`);
    if (!pattern.test(source)) {
      throw new Error(`${RELEASE_IDENTITY} does not contain RELEASE_BUILD ${currentBuild}`);
    }
    return source.replace(pattern, `$1${nextBuild}$2`);
  }
  if (relativePath === STATUS) {
    const current = candidateLine(currentBuild);
    if (!source.includes(current)) {
      throw new Error(`${STATUS} has no "${current}" line`);
    }
    return source.replaceAll(current, candidateLine(nextBuild));
  }
  return source;
}

async function sourceFiles(root, relativeDirectory, fileSystem, { includeTests = false } = {}) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const entries = await fileSystem.readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...await sourceFiles(root, relative, fileSystem, { includeTests }));
      }
      continue;
    }
    if (
      entry.isFile()
      && SOURCE_EXTENSIONS.has(path.extname(entry.name))
      && (includeTests || !entry.name.includes(".test."))
    ) {
      files.push(relative.split(path.sep).join("/"));
    }
  }
  return files;
}

async function releaseSourceFiles(root, fileSystem) {
  // Smoke tests that import a published module must not pin a numeric ?v= either. wwwroot tests
  // stay excluded: they assert against the placeholder and may mention sample URLs.
  return [
    ...await sourceFiles(root, "web/wwwroot", fileSystem),
    ...await sourceFiles(root, "web/smoke", fileSystem, { includeTests: true }),
  ].sort();
}

export function releaseBuildFromIdentity(source) {
  const match = source.match(/export const RELEASE_BUILD = "(\d+)";/);
  if (!match) throw new Error(`${RELEASE_IDENTITY} has no numeric RELEASE_BUILD`);
  return Number(match[1]);
}

function verifyReleaseSources(sources, releaseFiles) {
  const identity = sources.get(RELEASE_IDENTITY);
  if (identity === undefined) throw new Error(`${RELEASE_IDENTITY} was not read`);
  const releaseBuild = releaseBuildFromIdentity(identity);
  const status = sources.get(STATUS);
  if (status === undefined) throw new Error(`${STATUS} was not read`);
  // Either the stamped build is the queued candidate, or it has shipped and STATUS records it as
  // production (product_truth.test.mjs allows "Next candidate: none queued" in that state).
  const shipped = new RegExp(`^Production: Build ${releaseBuild},`, "m").test(status);
  if (!status.includes(candidateLine(releaseBuild)) && !shipped) {
    throw new Error(`${STATUS} names neither candidate nor production Build ${releaseBuild}`);
  }

  const mismatches = [];
  for (const relative of releaseFiles) {
    const source = sources.get(relative);
    if (source === undefined) throw new Error(`${relative} was not read`);
    for (const match of source.matchAll(/\?v=(\d+)/g)) {
      mismatches.push(`${relative}: hard-coded release query ?v=${match[1]}`);
    }
    if (relative !== RELEASE_IDENTITY) {
      const duplicate = source.match(
        /(?:export\s+)?const\s+(?:RELEASE_BUILD|SAMPLE_BED_BUILD)\s*=\s*"(\d+)"/,
      );
      if (duplicate) mismatches.push(`${relative}: hard-coded ${duplicate[0]}`);
    }
  }

  const index = sources.get(INDEX);
  if (index === undefined) throw new Error(`${INDEX} was not read`);
  if (!index.includes(`Build ${RELEASE_QUERY_TOKEN} · verifying`)) {
    mismatches.push(`${INDEX}: ready-build placeholder missing`);
  }
  if (!index.includes(`./app.js?v=${RELEASE_QUERY_TOKEN}`)) {
    mismatches.push(`${INDEX}: app entry placeholder missing`);
  }
  const worker = sources.get(SERVICE_WORKER);
  if (!worker?.includes(`const RELEASE_BUILD = "${RELEASE_QUERY_TOKEN}"`)) {
    mismatches.push(`${SERVICE_WORKER}: release placeholder missing`);
  }
  const buildInfo = sources.get(BUILD_INFO);
  if (!buildInfo?.includes(`"${RELEASE_QUERY_TOKEN}"`)) {
    mismatches.push(`${BUILD_INFO}: release placeholder missing`);
  }
  if (mismatches.length > 0) {
    throw new Error(
      `release stamp is not singular for Build ${releaseBuild}:\n${mismatches.join("\n")}`,
    );
  }
  return Object.freeze({ releaseBuild, checkedFiles: releaseFiles.length });
}

export async function verifyReleaseStamps(
  root = DEFAULT_REPOSITORY_ROOT,
  { fileSystem = DEFAULT_FILE_SYSTEM } = {},
) {
  const releaseFiles = await releaseSourceFiles(root, fileSystem);
  const requiredFiles = new Set([
    ...releaseFiles,
    ...STAMPED_FILES,
    INDEX,
    SERVICE_WORKER,
    BUILD_INFO,
  ]);
  const sources = new Map();
  for (const relative of [...requiredFiles].sort()) {
    sources.set(relative, await fileSystem.readFile(path.join(root, relative), "utf8"));
  }
  return verifyReleaseSources(sources, releaseFiles);
}

function transactionPaths(absolute, transactionId, index) {
  const prefix = `${absolute}.stamp-release-${transactionId}-${index}`;
  return Object.freeze({
    replacement: `${prefix}.next`,
    rollback: `${prefix}.before`,
  });
}

async function removeTransactionFiles(fileSystem, paths) {
  const failures = [];
  for (const target of paths) {
    try {
      await fileSystem.unlink(target);
    } catch (error) {
      if (error?.code !== "ENOENT") failures.push(error);
    }
  }
  return failures;
}

function throwTransactionFailure(cause, recoveryFailures) {
  if (recoveryFailures.length === 0) throw cause;
  throw new AggregateError(
    [cause, ...recoveryFailures],
    "release stamp transaction failed and cleanup or rollback was incomplete",
  );
}

export async function stampRelease({
  root = DEFAULT_REPOSITORY_ROOT,
  nextBuild,
  dryRun = false,
  fileSystem = DEFAULT_FILE_SYSTEM,
} = {}) {
  const releaseFiles = await releaseSourceFiles(root, fileSystem);
  const required = [...new Set([...releaseFiles, ...STAMPED_FILES])].sort();
  const preflight = [];
  for (const relative of required) {
    const absolute = path.join(root, relative);
    const fileStat = await fileSystem.stat(absolute);
    const beforeBytes = await fileSystem.readFile(absolute);
    preflight.push(Object.freeze({
      relative,
      absolute,
      mode: fileStat.mode & 0o7777,
      beforeBytes,
      before: beforeBytes.toString("utf8"),
    }));
  }

  const identity = preflight.find(({ relative }) => relative === RELEASE_IDENTITY);
  const currentBuild = releaseBuildFromIdentity(identity.before);
  const next = Number(nextBuild);
  if (!Number.isInteger(next) || next !== currentBuild + 1) {
    throw new Error(`next build must be exactly ${currentBuild + 1}; received ${nextBuild}`);
  }

  const changed = [];
  const prospectiveSources = new Map();
  const changes = [];
  for (const entry of preflight) {
    const after = STAMPED_FILES.includes(entry.relative)
      ? stampSource(entry.relative, entry.before, currentBuild, next)
      : entry.before;
    prospectiveSources.set(entry.relative, after);
    if (after === entry.before) continue;
    changed.push(entry.relative);
    changes.push(Object.freeze({ ...entry, after }));
  }
  if (changed.length === 0) throw new Error("release stamp changed no files");

  // Validate the complete next-build graph before creating even a temporary
  // file. A malformed canonical source or a hard-coded query therefore cannot
  // leave a partially stamped checkout.
  verifyReleaseSources(prospectiveSources, releaseFiles);
  if (dryRun) {
    return Object.freeze({ currentBuild, nextBuild: next, changed: Object.freeze(changed) });
  }

  const transactionId = `${process.pid}-${randomUUID()}`;
  const staged = changes.map((entry, index) => Object.freeze({
    ...entry,
    ...transactionPaths(entry.absolute, transactionId, index),
  }));
  const allTransactionPaths = staged.flatMap(({ replacement, rollback }) => [replacement, rollback]);

  try {
    // Every replacement and byte-exact rollback source is staged before the
    // first canonical file is replaced. The sibling paths keep rename on the
    // same filesystem as its destination.
    for (const entry of staged) {
      await fileSystem.writeFile(entry.rollback, entry.beforeBytes, {
        flag: "wx",
        mode: entry.mode,
      });
      await fileSystem.writeFile(entry.replacement, Buffer.from(entry.after, "utf8"), {
        flag: "wx",
        mode: entry.mode,
      });
      await fileSystem.chmod(entry.rollback, entry.mode);
      await fileSystem.chmod(entry.replacement, entry.mode);
    }
  } catch (error) {
    const cleanupFailures = await removeTransactionFiles(fileSystem, allTransactionPaths);
    throwTransactionFailure(error, cleanupFailures);
  }

  const committed = [];
  try {
    for (const entry of staged) {
      await fileSystem.rename(entry.replacement, entry.absolute);
      committed.push(entry);
    }
    await verifyReleaseStamps(root, { fileSystem });
  } catch (error) {
    const recoveryFailures = [];
    const rollbackFilesToPreserve = new Set();
    for (const entry of committed.reverse()) {
      try {
        await fileSystem.rename(entry.rollback, entry.absolute);
      } catch (rollbackError) {
        recoveryFailures.push(rollbackError);
        // If restoration itself fails, retain the byte-exact rollback sibling
        // for manual recovery instead of deleting the only known-good copy.
        rollbackFilesToPreserve.add(entry.rollback);
      }
    }
    recoveryFailures.push(...await removeTransactionFiles(
      fileSystem,
      allTransactionPaths.filter((target) => !rollbackFilesToPreserve.has(target)),
    ));
    throwTransactionFailure(error, recoveryFailures);
  }

  const cleanupFailures = await removeTransactionFiles(fileSystem, allTransactionPaths);
  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      cleanupFailures,
      "release stamps committed but temporary cleanup was incomplete",
    );
  }
  return Object.freeze({ currentBuild, nextBuild: next, changed: Object.freeze(changed) });
}

async function publishedTextFiles(wwwroot, fileSystem) {
  const files = [];
  async function visit(directory) {
    const entries = await fileSystem.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await visit(absolute);
        continue;
      }
      if (entry.isFile() && PUBLISHED_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(absolute);
      }
    }
  }
  await visit(wwwroot);
  return files;
}

export async function applyPublishedReleaseQueries(
  wwwroot,
  { fileSystem = DEFAULT_FILE_SYSTEM } = {},
) {
  const identityPath = path.join(wwwroot, "render/release/release_identity.js");
  const releaseBuild = releaseBuildFromIdentity(await fileSystem.readFile(identityPath, "utf8"));
  const build = String(releaseBuild);
  let rewritten = 0;
  for (const absolute of await publishedTextFiles(wwwroot, fileSystem)) {
    const before = await fileSystem.readFile(absolute, "utf8");
    if (!before.includes(RELEASE_QUERY_TOKEN)) continue;
    await fileSystem.writeFile(absolute, materializeReleaseSource(before, build));
    rewritten += 1;
  }

  const indexPath = path.join(wwwroot, "index.html");
  const index = await fileSystem.readFile(indexPath, "utf8");
  const workerPath = path.join(wwwroot, "service-worker.js");
  const worker = await fileSystem.readFile(workerPath, "utf8");
  if (index.includes(RELEASE_QUERY_TOKEN) || worker.includes(RELEASE_QUERY_TOKEN)) {
    throw new Error("published release placeholder survived materialization");
  }
  if (!index.includes(`./app.js?v=${build}`)) {
    throw new Error(`published index is missing app.js?v=${build}`);
  }
  if (!worker.includes(`const RELEASE_BUILD = "${build}";`)) {
    throw new Error(`published service worker is missing RELEASE_BUILD ${build}`);
  }
  return Object.freeze({ releaseBuild, rewritten });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    const result = await verifyReleaseStamps();
    process.stdout.write(`release stamps coherent at Build ${result.releaseBuild}\n`);
    return;
  }
  const nextIndex = args.indexOf("--next");
  if (nextIndex < 0 || !args[nextIndex + 1]) {
    throw new Error("usage: bin/stamp-release --next <current+1> | --check");
  }
  const result = await stampRelease({
    nextBuild: args[nextIndex + 1],
    dryRun: args.includes("--dry-run"),
  });
  process.stdout.write(
    `${args.includes("--dry-run") ? "would stamp" : "stamped"} Build ${result.currentBuild} -> ${result.nextBuild}\n${result.changed.join("\n")}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
