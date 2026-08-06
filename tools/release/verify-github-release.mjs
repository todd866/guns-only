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

// How old the canonical green Verify run may be and still stand in for a local gate. The run is
// already pinned to the exact SHA, so this is not about the code changing -- it bounds how far the
// *environment* around that evidence (branch protection, workflow definition, runner images,
// upstream toolchains) can have drifted since the proof was produced.
export const DEFAULT_MAX_VERIFY_AGE_HOURS = 72;

const REVISION = /^[a-f0-9]{40}$/;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function completionTime(run) {
  for (const value of [run?.updated_at, run?.run_completed_at]) {
    if (typeof value !== "string") continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isSha(value) {
  return REVISION.test(value ?? "");
}

/**
 * Decide whether the deployed revision's tree was already verified under a DIFFERENT SHA, and
 * return that SHA. This exists because `gh pr merge --merge` lands a brand-new merge commit that
 * CI has never seen, which cost Builds 264 and 265 a second full ~17-minute Verify cycle each.
 *
 * The only accepted shape is a fast-forward-EQUIVALENT merge, proved four ways:
 *
 *   1. `revision` is an ordinary two-parent merge commit (octopus merges are rejected).
 *   2. One parent V has a tree byte-identical to the merge commit's tree, so the merge added
 *      nothing: whatever bin/check would compute on `revision` it computes on V.
 *   3. The other parent (the old main tip) is an ancestor of V, i.e. the branch was genuinely
 *      up to date and the merge was a fast-forward in all but name.
 *   4. GitHub itself attests the link: a pull request from the canonical repository, based on
 *      main, with head V, whose recorded merge_commit_sha IS `revision`.
 *
 * (3) is what makes the *pull_request* Verify run usable. `actions/checkout` on a pull_request
 * event builds `refs/pull/N/merge`, i.e. merge(B, V) where B was main's tip at run time. main
 * forbids force pushes and deletions, so B is an ancestor of the current main tip `revision`, and
 * therefore an ancestor of either V or the old main tip -- which (3) makes an ancestor of V too.
 * Either way B is an ancestor of V, so merge(B, V) has V's tree. The run tested this tree.
 */
export function assessMergeProvenance({ revision, git, pullRequests }) {
  const empty = Object.freeze({ verifiedRevision: null, notes: Object.freeze([]) });
  if (!git || !isSha(revision)) return empty;
  if (!isSha(git.tree)) return empty;
  const parents = list(git.parents);
  if (parents.length !== 2) return empty;

  for (const [index, candidate] of parents.entries()) {
    const sibling = parents[1 - index];
    if (!isSha(candidate?.sha) || !isSha(sibling?.sha)) continue;
    if (candidate.tree !== git.tree) continue;
    if (candidate.siblingIsAncestor !== true) continue;

    const attestation = list(pullRequests).find((entry) =>
      entry?.base?.ref === GITHUB_RELEASE_BRANCH
        && entry?.head?.sha === candidate.sha
        && entry?.head?.repo?.full_name === GITHUB_RELEASE_REPOSITORY
        && entry?.base?.repo?.full_name === GITHUB_RELEASE_REPOSITORY
        && entry?.merge_commit_sha === revision);
    if (!attestation) continue;

    return Object.freeze({
      verifiedRevision: candidate.sha,
      notes: Object.freeze([
        `fast-forward-equivalent merge of #${attestation.number}: tree ${git.tree} is unchanged`
          + ` from verified head ${candidate.sha}, over ancestor ${sibling.sha}`,
      ]),
    });
  }
  return empty;
}

/**
 * Read the local Git facts `assessMergeProvenance` needs. Kept separate from the assessment so the
 * decision stays a pure function over data that can be fixtured, while this half is exercised
 * against a real repository in the tests.
 */
export function readMergeFacts(revision, cwd, run) {
  const git = (...args) => run("git", args, cwd).trim();
  let parentShas;
  try {
    const tree = git("rev-parse", `${revision}^{tree}`);
    parentShas = git("rev-list", "--parents", "-n", "1", revision).split(/\s+/).slice(1);
    if (parentShas.length !== 2) return { tree, parents: [] };
    const parents = parentShas.map((sha, index) => {
      const sibling = parentShas[1 - index];
      let siblingIsAncestor = false;
      try {
        run("git", ["merge-base", "--is-ancestor", sibling, sha], cwd);
        siblingIsAncestor = true;
      } catch {
        siblingIsAncestor = false;
      }
      return { sha, tree: git("rev-parse", `${sha}^{tree}`), siblingIsAncestor };
    });
    return { tree, parents };
  } catch {
    return null;
  }
}

export function assessGitHubRelease({
  protection,
  workflowRuns,
  revision,
  git = null,
  pullRequests = [],
  now = Date.now(),
  maxAgeHours = DEFAULT_MAX_VERIFY_AGE_HOURS,
}) {
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

  // A run only counts if it is THIS repository's canonical Verify workflow, completed green.
  const canonicalRuns = list(workflowRuns?.workflow_runs).filter((run) =>
    run?.head_repository?.full_name === GITHUB_RELEASE_REPOSITORY
      && run?.path === ".github/workflows/verify.yml"
      && run?.status === "completed"
      && run?.conclusion === "success"
      && typeof run?.html_url === "string"
      && run.html_url.startsWith("https://github.com/"));

  // Path 1 (unchanged, always preferred): a push/dispatch run on protected main for the exact
  // deployed SHA. This tested main's own tree at that commit; nothing else is required.
  let successfulRuns = canonicalRuns.filter((run) =>
    run.head_sha === revision
      && run.head_branch === GITHUB_RELEASE_BRANCH
      && ["push", "workflow_dispatch"].includes(run.event));
  let provenance = "push run on protected main";
  const notes = [];

  // Path 2: the merge queue landed this exact commit after testing it. head_sha IS the commit
  // that becomes main, so this is as direct as path 1.
  if (successfulRuns.length === 0) {
    const queued = canonicalRuns.filter((run) =>
      run.head_sha === revision && run.event === "merge_group");
    if (queued.length > 0) {
      successfulRuns = queued;
      provenance = "merge-queue run for the exact landed commit";
    }
  }

  // Path 3: the deployed commit is a fast-forward-equivalent merge of a verified PR head. See
  // assessMergeProvenance for the full argument; it is only reachable when main forbids force
  // pushes and deletions, because the argument depends on main only ever moving forward.
  if (successfulRuns.length === 0) {
    const merge = assessMergeProvenance({ revision, git, pullRequests });
    if (merge.verifiedRevision) {
      const linear = protection?.allow_force_pushes?.enabled === false
        && protection?.allow_deletions?.enabled === false;
      const candidates = canonicalRuns.filter((run) =>
        run.head_sha === merge.verifiedRevision
          && ["pull_request", "push", "workflow_dispatch"].includes(run.event));
      if (candidates.length > 0 && linear) {
        successfulRuns = candidates;
        provenance = "fast-forward-equivalent merge of a verified pull-request head";
        notes.push(...merge.notes);
      } else if (candidates.length > 0) {
        errors.push("main must forbid force pushes and deletions before a merge-parent Verify run"
          + " can stand in for a run on main");
      }
    }
  }

  if (successfulRuns.length === 0) {
    errors.push("the exact remote-main revision has no successful completed Verify workflow run");
  }

  // Freshness. Fail closed: a run whose completion time cannot be read is not usable evidence.
  const dated = successfulRuns
    .map((run) => ({ run, completedAt: completionTime(run) }))
    .filter((entry) => entry.completedAt !== null)
    .sort((left, right) => right.completedAt - left.completedAt);
  let newest = null;
  if (successfulRuns.length > 0) {
    if (dated.length === 0) {
      errors.push("the exact-SHA Verify run has no readable completion timestamp");
    } else {
      newest = dated[0];
      const ageHours = (now - newest.completedAt) / 3_600_000;
      const limit = Number.isFinite(maxAgeHours) && maxAgeHours > 0
        ? maxAgeHours
        : DEFAULT_MAX_VERIFY_AGE_HOURS;
      if (ageHours > limit) {
        errors.push(`the exact-SHA Verify run completed ${ageHours.toFixed(1)}h ago, beyond the `
          + `${limit}h freshness limit; re-run Verify for this commit`);
      }
      if (ageHours < -0.25) {
        errors.push("the exact-SHA Verify run reports a completion time in the future");
      }
    }
  }

  return Object.freeze({
    eligible: errors.length === 0,
    errors: Object.freeze(errors),
    provenance: errors.length === 0 ? provenance : null,
    notes: Object.freeze(notes),
    runUrl: (newest?.run ?? successfulRuns[0])?.html_url ?? null,
  });
}

function parseCli(argv) {
  const options = {
    revision: "",
    protection: "",
    runs: [],
    pullRequests: [],
    repo: "",
    maxAgeHours: DEFAULT_MAX_VERIFY_AGE_HOURS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--revision" && argv[index + 1]) options.revision = argv[index += 1];
    else if (argument === "--protection" && argv[index + 1]) options.protection = argv[index += 1];
    else if (argument === "--runs" && argv[index + 1]) options.runs.push(argv[index += 1]);
    else if (argument === "--max-age-hours" && argv[index + 1]) {
      const parsed = Number(argv[index += 1]);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--max-age-hours must be a positive number of hours");
      }
      options.maxAgeHours = parsed;
    } else if (argument === "--pull-requests" && argv[index + 1]) {
      options.pullRequests.push(argv[index += 1]);
    } else if (argument === "--repo" && argv[index + 1]) options.repo = argv[index += 1];
    else throw new Error(`unknown or incomplete argument '${argument}'`);
  }
  if (!options.revision || !options.protection || options.runs.length === 0) {
    throw new Error("usage: verify-github-release --revision SHA --protection FILE --runs FILE"
      + " [--pull-requests FILE] [--repo DIR] [--max-age-hours N]");
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const readJson = (file) => readFile(path.resolve(file), "utf8").then(JSON.parse);
  const [protection, runFiles, pullFiles] = await Promise.all([
    readJson(options.protection),
    Promise.all(options.runs.map(readJson)),
    Promise.all(options.pullRequests.map(readJson)),
  ]);
  const workflowRuns = {
    workflow_runs: runFiles.flatMap((payload) => list(payload?.workflow_runs)),
  };
  const pullRequests = pullFiles.flatMap((payload) => list(payload));
  let git = null;
  if (options.repo) {
    const { execFileSync } = await import("node:child_process");
    git = readMergeFacts(options.revision, path.resolve(options.repo), (command, args, cwd) =>
      execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  }
  const report = assessGitHubRelease({
    protection,
    workflowRuns,
    revision: options.revision,
    git,
    pullRequests,
    maxAgeHours: options.maxAgeHours,
  });
  if (!report.eligible) {
    throw new Error(`GitHub release preflight failed:\n- ${report.errors.join("\n- ")}`);
  }
  for (const note of report.notes) process.stdout.write(`provenance: ${note}\n`);
  process.stdout.write(`verified protected remote main and green Verify run ${report.runUrl}`
    + ` (${report.provenance})\n`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
