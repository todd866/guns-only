#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GITHUB_RELEASE_REPOSITORY = "todd866/guns-only";
export const GITHUB_RELEASE_BRANCH = "main";
export const REQUIRED_VERIFY_CHECKS = Object.freeze([
  "Deterministic, content, and unit contracts",
  "Published browser and HUD smoke",
]);

const REVISION = /^[a-f0-9]{40}$/;

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function assessGitHubRelease({ protection, workflowRuns, revision }) {
  const errors = [];
  if (!REVISION.test(revision ?? "")) {
    errors.push("release revision must be a lowercase 40-character Git SHA");
  }

  const requiredStatusChecks = protection?.required_status_checks;
  if (!requiredStatusChecks || requiredStatusChecks.strict !== true) {
    errors.push("main must require strict up-to-date status checks");
  }
  const contexts = new Set([
    ...list(requiredStatusChecks?.contexts),
    ...list(requiredStatusChecks?.checks).map((check) => check?.context),
  ].filter((context) => typeof context === "string" && context.length > 0));
  for (const context of REQUIRED_VERIFY_CHECKS) {
    if (!contexts.has(context)) errors.push(`main does not require '${context}'`);
  }

  const successfulRuns = list(workflowRuns?.workflow_runs).filter((run) =>
    run?.head_sha === revision
      && run?.head_branch === GITHUB_RELEASE_BRANCH
      && run?.head_repository?.full_name === GITHUB_RELEASE_REPOSITORY
      && run?.path === ".github/workflows/verify.yml"
      && ["push", "workflow_dispatch"].includes(run?.event)
      && run?.status === "completed"
      && run?.conclusion === "success"
      && typeof run?.html_url === "string"
      && run.html_url.startsWith("https://github.com/"));
  if (successfulRuns.length === 0) {
    errors.push("the exact remote-main revision has no successful completed Verify workflow run");
  }

  return Object.freeze({
    eligible: errors.length === 0,
    errors: Object.freeze(errors),
    runUrl: successfulRuns[0]?.html_url ?? null,
  });
}

function parseCli(argv) {
  const options = { revision: "", protection: "", runs: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--revision" && argv[index + 1]) options.revision = argv[index += 1];
    else if (argument === "--protection" && argv[index + 1]) options.protection = argv[index += 1];
    else if (argument === "--runs" && argv[index + 1]) options.runs = argv[index += 1];
    else throw new Error(`unknown or incomplete argument '${argument}'`);
  }
  if (!options.revision || !options.protection || !options.runs) {
    throw new Error("usage: verify-github-release --revision SHA --protection FILE --runs FILE");
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const [protection, workflowRuns] = await Promise.all([
    readFile(path.resolve(options.protection), "utf8").then(JSON.parse),
    readFile(path.resolve(options.runs), "utf8").then(JSON.parse),
  ]);
  const report = assessGitHubRelease({
    protection,
    workflowRuns,
    revision: options.revision,
  });
  if (!report.eligible) {
    throw new Error(`GitHub release preflight failed:\n- ${report.errors.join("\n- ")}`);
  }
  process.stdout.write(`verified protected remote main and green Verify run ${report.runUrl}\n`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
