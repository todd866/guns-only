import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_MAX_VERIFY_AGE_HOURS,
  GITHUB_RELEASE_REPOSITORY,
  REQUIRED_VERIFY_CHECKS,
  assessGitHubRelease,
  assessMergeProvenance,
  readMergeFacts,
} from "../verify-github-release.mjs";

const REVISION = "a".repeat(40);
const NOW = Date.parse("2026-08-05T12:00:00Z");
const HOUR = 3_600_000;

function fixture() {
  return {
    revision: REVISION,
    now: NOW,
    protection: {
      required_status_checks: {
        strict: true,
        contexts: [...REQUIRED_VERIFY_CHECKS],
        checks: [],
      },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
    },
    workflowRuns: {
      workflow_runs: [{
        head_sha: REVISION,
        head_branch: "main",
        head_repository: { full_name: GITHUB_RELEASE_REPOSITORY },
        path: ".github/workflows/verify.yml",
        event: "push",
        status: "completed",
        conclusion: "success",
        updated_at: new Date(NOW - HOUR).toISOString(),
        html_url: "https://github.com/todd866/guns-only/actions/runs/123",
      }],
    },
  };
}

test("protected remote main with both required checks and an exact green run is eligible", () => {
  const report = assessGitHubRelease(fixture());
  assert.equal(report.eligible, true, report.errors.join("\n"));
  assert.equal(report.runUrl, "https://github.com/todd866/guns-only/actions/runs/123");
});

test("release preflight rejects missing protection, contexts, and stale or failed runs", async (t) => {
  await t.test("unprotected", () => {
    const input = fixture();
    input.protection = { required_status_checks: null };
    assert.equal(assessGitHubRelease(input).eligible, false);
  });

  for (const context of REQUIRED_VERIFY_CHECKS) {
    await t.test(`missing ${context}`, () => {
      const input = fixture();
      input.protection.required_status_checks.contexts =
        REQUIRED_VERIFY_CHECKS.filter((candidate) => candidate !== context);
      const report = assessGitHubRelease(input);
      assert.equal(report.eligible, false);
      assert.ok(report.errors.some((error) => error.includes(context)));
    });
  }

  for (const [label, field, value] of [
    ["different SHA", "head_sha", "b".repeat(40)],
    ["feature branch", "head_branch", "feature"],
    ["fork", "head_repository", { full_name: "fork/guns-only" }],
    ["other workflow", "path", ".github/workflows/other.yml"],
    ["pull request", "event", "pull_request"],
    ["still running", "status", "in_progress"],
    ["failed", "conclusion", "failure"],
  ]) {
    await t.test(label, () => {
      const input = fixture();
      input.workflowRuns.workflow_runs[0][field] = value;
      assert.equal(assessGitHubRelease(input).eligible, false);
    });
  }

  // The local re-gate is gone, so the green run IS the release provenance. It therefore has to
  // carry a readable, bounded age: undatable or long-past evidence must fail closed.
  await t.test("run older than the freshness limit", () => {
    const input = fixture();
    input.workflowRuns.workflow_runs[0].updated_at =
      new Date(NOW - (DEFAULT_MAX_VERIFY_AGE_HOURS + 1) * HOUR).toISOString();
    const report = assessGitHubRelease(input);
    assert.equal(report.eligible, false);
    assert.ok(report.errors.some((error) => error.includes("freshness limit")));
  });

  await t.test("run older than an explicit tighter limit", () => {
    const input = { ...fixture(), maxAgeHours: 2 };
    input.workflowRuns.workflow_runs[0].updated_at = new Date(NOW - 3 * HOUR).toISOString();
    assert.equal(assessGitHubRelease(input).eligible, false);
  });

  await t.test("run inside the freshness limit stays eligible", () => {
    const input = fixture();
    input.workflowRuns.workflow_runs[0].updated_at =
      new Date(NOW - (DEFAULT_MAX_VERIFY_AGE_HOURS - 1) * HOUR).toISOString();
    assert.equal(assessGitHubRelease(input).eligible, true);
  });

  await t.test("no readable completion timestamp", () => {
    const input = fixture();
    delete input.workflowRuns.workflow_runs[0].updated_at;
    const report = assessGitHubRelease(input);
    assert.equal(report.eligible, false);
    assert.ok(report.errors.some((error) => error.includes("completion timestamp")));
  });

  await t.test("unparsable completion timestamp", () => {
    const input = fixture();
    input.workflowRuns.workflow_runs[0].updated_at = "not-a-date";
    assert.equal(assessGitHubRelease(input).eligible, false);
  });

  await t.test("completion in the future", () => {
    const input = fixture();
    input.workflowRuns.workflow_runs[0].updated_at = new Date(NOW + 6 * HOUR).toISOString();
    assert.equal(assessGitHubRelease(input).eligible, false);
  });

  await t.test("run_completed_at is accepted when updated_at is absent", () => {
    const input = fixture();
    delete input.workflowRuns.workflow_runs[0].updated_at;
    input.workflowRuns.workflow_runs[0].run_completed_at = new Date(NOW - HOUR).toISOString();
    assert.equal(assessGitHubRelease(input).eligible, true);
  });

  await t.test("the newest qualifying run decides", () => {
    const input = fixture();
    const [green] = input.workflowRuns.workflow_runs;
    input.workflowRuns.workflow_runs = [
      { ...green, updated_at: new Date(NOW - 200 * HOUR).toISOString(), html_url: `${green.html_url}/old` },
      green,
    ];
    const report = assessGitHubRelease(input);
    assert.equal(report.eligible, true, report.errors.join("\n"));
    assert.equal(report.runUrl, green.html_url);
  });
});

// ---------------------------------------------------------------------------------------------
// Fast-forward-equivalent merge provenance. `gh pr merge --merge` lands a SHA CI has never seen;
// these tests pin exactly which merges may borrow their verified head's run, and which may not.
// ---------------------------------------------------------------------------------------------

const MERGE = "c".repeat(40);
const VERIFIED_HEAD = "d".repeat(40);
const OLD_MAIN = "e".repeat(40);
const TREE = "f".repeat(40);

function mergeFixture() {
  return {
    revision: MERGE,
    git: {
      tree: TREE,
      parents: [
        { sha: OLD_MAIN, tree: "1".repeat(40), siblingIsAncestor: false },
        { sha: VERIFIED_HEAD, tree: TREE, siblingIsAncestor: true },
      ],
    },
    pullRequests: [{
      number: 26,
      base: { ref: "main", repo: { full_name: GITHUB_RELEASE_REPOSITORY } },
      head: { sha: VERIFIED_HEAD, repo: { full_name: GITHUB_RELEASE_REPOSITORY } },
      merge_commit_sha: MERGE,
    }],
  };
}

test("a fast-forward-equivalent merge borrows its verified head's identity", () => {
  const report = assessMergeProvenance(mergeFixture());
  assert.equal(report.verifiedRevision, VERIFIED_HEAD);
});

test("merge provenance refuses everything that is not provably the same tree", async (t) => {
  const cases = {
    "merge tree differs from the verified head's tree": (input) => {
      input.git.parents[1].tree = "9".repeat(40);
    },
    "the other parent is not an ancestor (a real divergent merge)": (input) => {
      input.git.parents[1].siblingIsAncestor = false;
    },
    "octopus merge": (input) => {
      input.git.parents.push({ sha: "8".repeat(40), tree: TREE, siblingIsAncestor: true });
    },
    "single-parent commit": (input) => {
      input.git.parents = [input.git.parents[1]];
    },
    "no pull-request attestation at all": (input) => {
      input.pullRequests = [];
    },
    "pull request targeted another branch": (input) => {
      input.pullRequests[0].base.ref = "pivot-hardening";
    },
    "pull request came from a fork": (input) => {
      input.pullRequests[0].head.repo.full_name = "fork/guns-only";
    },
    "pull request was based on a fork": (input) => {
      input.pullRequests[0].base.repo.full_name = "fork/guns-only";
    },
    "pull request landed as a different commit": (input) => {
      input.pullRequests[0].merge_commit_sha = "7".repeat(40);
    },
    "pull request head is not the merge parent": (input) => {
      input.pullRequests[0].head.sha = "6".repeat(40);
    },
    "no local git facts": (input) => {
      input.git = null;
    },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    await t.test(label, () => {
      const input = mergeFixture();
      mutate(input);
      assert.equal(assessMergeProvenance(input).verifiedRevision, null);
    });
  }
});

test("a merge commit is releasable on its verified head's pull-request run", async (t) => {
  function releaseFixture() {
    const base = fixture();
    const merge = mergeFixture();
    base.revision = MERGE;
    base.git = merge.git;
    base.pullRequests = merge.pullRequests;
    base.workflowRuns.workflow_runs = [{
      head_sha: VERIFIED_HEAD,
      head_branch: "fix/campaign-265",
      head_repository: { full_name: GITHUB_RELEASE_REPOSITORY },
      path: ".github/workflows/verify.yml",
      event: "pull_request",
      status: "completed",
      conclusion: "success",
      updated_at: new Date(NOW - HOUR).toISOString(),
      html_url: "https://github.com/todd866/guns-only/actions/runs/999",
    }];
    return base;
  }

  await t.test("accepted, and reported as such", () => {
    const report = assessGitHubRelease(releaseFixture());
    assert.equal(report.eligible, true, report.errors.join("\n"));
    assert.equal(report.runUrl, "https://github.com/todd866/guns-only/actions/runs/999");
    assert.match(report.provenance, /fast-forward-equivalent/);
    assert.match(report.notes.join(" "), /#26/);
  });

  // The whole argument for trusting a merge-preview build rests on main only ever moving
  // forward. If that stops being true, this path must close.
  await t.test("rejected when main permits force pushes", () => {
    const input = releaseFixture();
    input.protection.allow_force_pushes = { enabled: true };
    const report = assessGitHubRelease(input);
    assert.equal(report.eligible, false);
    assert.ok(report.errors.some((error) => error.includes("force pushes")));
  });

  await t.test("rejected when main permits deletions", () => {
    const input = releaseFixture();
    input.protection.allow_deletions = { enabled: true };
    assert.equal(assessGitHubRelease(input).eligible, false);
  });

  await t.test("rejected when the borrowed run is stale", () => {
    const input = releaseFixture();
    input.workflowRuns.workflow_runs[0].updated_at =
      new Date(NOW - (DEFAULT_MAX_VERIFY_AGE_HOURS + 1) * HOUR).toISOString();
    assert.equal(assessGitHubRelease(input).eligible, false);
  });

  await t.test("rejected when the borrowed run failed", () => {
    const input = releaseFixture();
    input.workflowRuns.workflow_runs[0].conclusion = "failure";
    assert.equal(assessGitHubRelease(input).eligible, false);
  });

  await t.test("a bare pull-request run cannot release a non-merge commit", () => {
    const input = releaseFixture();
    input.git = null;
    input.pullRequests = [];
    input.revision = VERIFIED_HEAD;
    assert.equal(assessGitHubRelease(input).eligible, false,
      "a pull_request run alone must never be release provenance");
  });
});

test("a merge-queue run for the exact landed commit is releasable", () => {
  const input = fixture();
  input.workflowRuns.workflow_runs[0].event = "merge_group";
  input.workflowRuns.workflow_runs[0].head_branch =
    "gh-readonly-queue/main/pr-26-2694ac768a9ed5568539d39be42f4eaecbfc73ef";
  const report = assessGitHubRelease(input);
  assert.equal(report.eligible, true, report.errors.join("\n"));
  assert.match(report.provenance, /merge-queue/);
});

test("readMergeFacts reads real trees, parents, and ancestry from a repository", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "guns-merge-facts-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    await writeFile(path.join(root, "a.txt"), "one\n");
    git("add", "a.txt");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");

    git("checkout", "-qb", "feature");
    await writeFile(path.join(root, "a.txt"), "two\n");
    git("commit", "-qam", "feature work");
    const head = git("rev-parse", "HEAD");

    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "-m", "Merge pull request #26", "feature");
    const merge = git("rev-parse", "HEAD");

    const facts = readMergeFacts(merge, root, (command, args, cwd) =>
      execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    assert.equal(facts.parents.length, 2);
    assert.equal(facts.tree, git("rev-parse", `${merge}^{tree}`));

    const verified = facts.parents.find((parent) => parent.sha === head);
    assert.ok(verified, "the feature head must appear as a parent");
    assert.equal(verified.tree, facts.tree, "an --no-ff merge of an up-to-date branch keeps the tree");
    assert.equal(verified.siblingIsAncestor, true, "base must be an ancestor of the feature head");

    const stale = facts.parents.find((parent) => parent.sha === base);
    assert.equal(stale.siblingIsAncestor, false, "the feature head is not an ancestor of base");
    assert.notEqual(stale.tree, facts.tree);

    // The end-to-end shape: this real merge is accepted only with GitHub's attestation.
    const attested = assessMergeProvenance({
      revision: merge,
      git: facts,
      pullRequests: [{
        number: 26,
        base: { ref: "main", repo: { full_name: GITHUB_RELEASE_REPOSITORY } },
        head: { sha: head, repo: { full_name: GITHUB_RELEASE_REPOSITORY } },
        merge_commit_sha: merge,
      }],
    });
    assert.equal(attested.verifiedRevision, head);

    // A genuinely divergent merge must not qualify: change the base after branching.
    git("checkout", "-q", "-b", "divergent", base);
    await writeFile(path.join(root, "b.txt"), "other\n");
    git("add", "b.txt");
    git("commit", "-qm", "divergent work");
    git("merge", "-q", "--no-ff", "-m", "Merge divergent", "feature");
    const divergentMerge = git("rev-parse", "HEAD");
    const divergentFacts = readMergeFacts(divergentMerge, root, (command, args, cwd) =>
      execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    for (const parent of divergentFacts.parents) {
      assert.notEqual(
        parent.tree === divergentFacts.tree && parent.siblingIsAncestor, true,
        "a divergent merge must never look fast-forward-equivalent");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production deploy invokes remote-main and GitHub verification before the local gate", async () => {
  const source = await readFile(new URL("../../../bin/deploy-web", import.meta.url), "utf8");
  const branch = source.indexOf('release_ref" != "main');
  const remote = source.indexOf("git ls-remote --exit-code origin refs/heads/main");
  const protection = source.indexOf("repos/todd866/guns-only/branches/main/protection");
  const workflow = source.indexOf("actions/workflows/verify.yml/runs");
  const verifier = source.indexOf("tools/release/verify-github-release.mjs");
  const localGate = source.indexOf("running full repository gate");
  for (const [label, location] of Object.entries({
    branch, remote, protection, workflow, verifier, localGate,
  })) assert.notEqual(location, -1, `deploy-web is missing ${label} release preflight`);
  assert.ok(branch < remote && remote < protection && protection < workflow
    && workflow < verifier && verifier < localGate,
  "remote branch, protection, exact green run, and verifier must precede the local gate");
});

test("production deploy keeps every fail-closed guarantee after dropping the local re-gate", async () => {
  const source = await readFile(new URL("../../../bin/deploy-web", import.meta.url), "utf8");

  // Preflight must decide everything cheap before anything is built. `dotnet publish` is the
  // first expensive step; every precondition has to appear before it.
  const publish = source.indexOf('publish web/GunsOnly.Web.csproj');
  assert.notEqual(publish, -1);
  for (const [label, needle] of Object.entries({
    dirtyWorktree: "worktree is dirty; production provenance",
    projectLink: ".vercel/project.json",
    hydration: "gitignored payload tree is not hydrated",
    atlas: "Ukraine jet-range terrain atlas is missing",
    mainOnly: 'release_ref" != "main',
    canonicalOrigin: "origin must be the canonical todd866/guns-only repository",
    exactRemoteRevision: "HEAD is not the exact pushed remote-main revision",
    protection: "main is unprotected or its protection state is unavailable",
    verifyRun: "actions/workflows/verify.yml/runs",
    freshness: "--max-age-hours",
    collectedReport: "preflight failed with",
  })) {
    const location = source.indexOf(needle);
    assert.notEqual(location, -1, `deploy-web lost the ${label} precondition`);
    assert.ok(location < publish, `${label} must be checked before anything is built`);
  }

  // The local gate is now opt-in, but the escape hatch and the mid-flight stability checks stay.
  assert.ok(source.includes('GUNS_DEPLOY_FULL_GATE:-0'),
    "GUNS_DEPLOY_FULL_GATE must still be able to force the full local gate");
  for (const guarantee of [
    "repository changed while the production gate was running",
    "repository changed while the deployment artifact was built",
    "repository changed while the production candidate was verified",
    "cannot inspect the current production rollback target",
    "production alias changed while the rollback baseline was captured",
    "live verification failed; checking alias ownership before rollback",
    "web/smoke/remote-smoke.mjs",
    "web/smoke/remote-route-smoke.mjs",
    "candidate immutable content identity mismatch",
  ]) {
    assert.ok(source.includes(guarantee), `deploy-web lost the guarantee: ${guarantee}`);
  }
});
