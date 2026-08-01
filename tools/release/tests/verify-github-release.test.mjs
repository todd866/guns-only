import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GITHUB_RELEASE_REPOSITORY,
  REQUIRED_VERIFY_CHECKS,
  assessGitHubRelease,
} from "../verify-github-release.mjs";

const REVISION = "a".repeat(40);

function fixture() {
  return {
    revision: REVISION,
    protection: {
      required_status_checks: {
        strict: true,
        contexts: [...REQUIRED_VERIFY_CHECKS],
        checks: [],
      },
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
