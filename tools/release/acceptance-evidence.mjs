#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DIMENSIONS = Object.freeze({
  boot: "browser-boot", meaningfulAction: "browser-action", outcome: "browser-outcome",
  recovery: "browser-recovery", retry: "browser-retry", visual: "visual-review",
  performance: "performance-sample", human: "human-sortie",
});
const HASH = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const ATLAS = "content/packs/ukraine-modern/environment/terrain-atlas/rapier-range.atlas.manifest.json";

export async function fileHash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

// Same byte format and path ordering as bin/deploy-web. Stream large atlas pages.
export async function treeHash(root) {
  const files = [];
  async function walk(relative = "") {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const child = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) files.push(child);
      else throw new Error(`Unsupported published entry: ${child}`);
    }
  }
  await walk(); files.sort();
  const digest = createHash("sha256");
  for (const file of files) {
    const name = Buffer.from(file); const length = Buffer.alloc(4);
    length.writeUInt32BE(name.length); digest.update(length); digest.update(name);
    digest.update(Buffer.from(await fileHash(path.join(root, file)), "hex"));
  }
  return digest.digest("hex");
}

export async function publishedIdentity(wwwroot, sourceRevision) {
  if (!SHA.test(sourceRevision || "")) throw new Error("A full 40-character source revision is required");
  const buildSource = await readFile(path.join(wwwroot, "api/build-info.js"), "utf8");
  const build = buildSource.match(/const RELEASE_BUILD = "(\d+)";/)?.[1];
  if (!build) throw new Error("Published build identity missing");
  return { sourceRevision, build,
    artifactSha256: await treeHash(wwwroot),
    contentSha256: await treeHash(path.join(wwwroot, "content")),
    atlasSha256: await fileHash(path.join(wwwroot, ATLAS)) };
}

export async function acceptanceMatrix({ identity, experiences, evidence, proofRoot = "." }) {
  if (evidence) {
    if (evidence.schemaVersion !== 1) throw new Error("Unsupported evidence schema");
    for (const [key, value] of Object.entries(identity)) {
      if (evidence.identity?.[key] !== value) throw new Error(`Evidence identity mismatch: ${key}`);
    }
    if (!evidence.matrix || typeof evidence.matrix !== "object" || Array.isArray(evidence.matrix))
      throw new Error("Evidence matrix required");
    for (const id of Object.keys(evidence.matrix)) {
      if (!experiences.includes(id)) throw new Error(`Unsupported experience: ${id}`);
    }
  }
  const matrix = {};
  for (const id of experiences) {
    const supplied = evidence?.matrix?.[id] ?? {};
    if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) throw new Error(`Invalid row: ${id}`);
    for (const dimension of Object.keys(supplied)) {
      if (!Object.hasOwn(DIMENSIONS, dimension)) throw new Error(`Unsupported dimension: ${dimension}`);
    }
    const row = matrix[id] = {};
    for (const [dimension, proofKind] of Object.entries(DIMENSIONS)) {
      const cell = supplied[dimension];
      if (!cell || cell.status === "not_run") { row[dimension] = { status: "not_run" }; continue; }
      if (cell.status === "not_applicable") {
        if (id !== "weekend-ride" || dimension !== "recovery" || !cell.reason?.trim())
          throw new Error(`${id}.${dimension}: this dimension requires evidence or not_run`);
        row[dimension] = { status: cell.status, reason: cell.reason }; continue;
      }
      if (!["passed", "failed"].includes(cell.status)) throw new Error("Unsupported evidence status");
      for (const field of ["route", "device", "seed", "summary"]) {
        if (typeof cell[field] !== "string" || !cell[field].trim()) throw new Error(`${id}.${dimension}: ${field} required`);
      }
      if (cell.proof?.kind !== proofKind || !cell.proof.path || !HASH.test(cell.proof.sha256 || ""))
        throw new Error(`${id}.${dimension}: ${proofKind} proof with path and sha256 required`);
      if (dimension === "human" && !cell.proof.witness?.trim()) throw new Error("Human evidence requires a witness");
      const actualHash = await fileHash(path.resolve(proofRoot, cell.proof.path));
      if (actualHash !== cell.proof.sha256) throw new Error(`${id}.${dimension}: proof file hash mismatch`);
      row[dimension] = { status: cell.status, route: cell.route, device: cell.device,
        seed: cell.seed, summary: cell.summary, proof: { ...cell.proof } };
    }
  }
  return matrix;
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--wwwroot", "--output", "--sha", "--evidence", "--generated-at"].includes(args[i]) || !args[i + 1])
      throw new Error(`Unknown or incomplete argument: ${args[i]}`);
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.wwwroot || !options.output) throw new Error("--wwwroot and --output required");
  const wwwroot = path.resolve(options.wwwroot);
  const relativeOutput = path.relative(wwwroot, path.resolve(options.output));
  if (!relativeOutput.startsWith(`..${path.sep}`)) throw new Error("Write acceptance evidence outside the published artifact");
  const identity = await publishedIdentity(wwwroot, options.sha);
  const { productionExperiences } = await import(pathToFileURL(path.join(wwwroot, "render/progression/campaign_progression.js")));
  const experiences = productionExperiences().map((entry) => entry.id);
  if (!experiences.length) throw new Error("No production experiences found");
  const evidence = options.evidence ? JSON.parse(await readFile(options.evidence, "utf8")) : null;
  const generatedAt = options["generated-at"] || new Date().toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Invalid generation time");
  const matrix = await acceptanceMatrix({ identity, experiences, evidence,
    proofRoot: options.evidence ? path.dirname(path.resolve(options.evidence)) : "." });
  await writeFile(options.output, JSON.stringify({ schemaVersion: 1, generatedAt, identity, matrix }, null, 2) + "\n");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
