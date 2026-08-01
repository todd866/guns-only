import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const deployPath = fileURLToPath(
  new URL("../../../../../bin/deploy-web", import.meta.url),
);
const source = readFileSync(deployPath, "utf8");
const flag = "GUNS_DEPLOY_BREAK_GLASS_BUILD_INFO_OUTAGE";

test("break-glass flag accepts only an explicit production opt-in", () => {
  const invalid = spawnSync("sh", [deployPath, "--preview"], {
    encoding: "utf8",
    env: { ...process.env, [flag]: "yes" },
  });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /must be 0 or 1/);

  const preview = spawnSync("sh", [deployPath, "--preview"], {
    encoding: "utf8",
    env: { ...process.env, [flag]: "1" },
  });
  assert.equal(preview.status, 2);
  assert.match(preview.stderr, /is production-only/);
});

test("normal production baseline remains fail-closed when build-info is unhealthy", () => {
  const baselineStart = source.indexOf("if ! previous_inspect=");
  const promotionStart = source.indexOf('    "$vercel_cli" promote', baselineStart);
  assert.ok(baselineStart > 0 && promotionStart > baselineStart);

  const baseline = source.slice(baselineStart, promotionStart);
  assert.ok(
    baseline.indexOf("inspect https://guns-only.com --format=json") <
      baseline.indexOf('"https://guns-only.com/api/build-info"'),
    "the rollback deployment ID must come from the control plane",
  );
  assert.match(baseline, /if \[ -z "\$previous_deployment" \]; then/);
  assert.match(
    baseline,
    /if \[ "\$break_glass_build_info" != "1" \]; then[\s\S]*normal production deployment remains fail-closed[\s\S]*exit 1/,
  );
  assert.match(baseline, /AUDIT BREAK-GLASS build-info outage/);
  assert.match(baseline, /rollback deployment pinned by Vercel control plane/);
  assert.match(
    baseline,
    /public_previous_deployment=.*json_field deployment[\s\S]*\[ -n "\$public_previous_deployment" \][\s\S]*"\$public_previous_deployment" != "\$previous_deployment"/,
  );
  assert.match(
    baseline,
    /confirmed_previous_deployment=\$\(inspect_public_deployment_id[\s\S]*if \[ "\$confirmed_previous_deployment" != "\$previous_deployment" \]; then/,
  );
});

test("break-glass never weakens candidate or promoted-release identity checks", () => {
  assert.match(
    source,
    /verify_candidate "\$deployment_url" "\$expected_revision" "\$atlas_sha256" "\$content_sha256"/,
  );
  assert.match(
    source,
    /candidate_deployment=.*json_field deployment[\s\S]*\[ -z "\$candidate_deployment" \]/,
  );
  assert.match(
    source,
    /candidate_control_deployment=\$\(inspect_public_deployment_id "\$deployment_url"[\s\S]*"\$candidate_control_deployment" != "\$candidate_deployment"/,
  );
  assert.match(
    source,
    /verify_public "https:\/\/guns-only\.com" "\$release_revision" \\\n+\s*"\$atlas_sha256" "\$content_sha256" 1/,
  );

  assert.match(
    source,
    /"\$atlas_sha256" "\$content_sha256" 1 "\$candidate_deployment"/,
  );

  const verifierStart = source.indexOf("verify_public_once() {");
  const verifierEnd = source.indexOf("\nverify_public() {", verifierStart);
  const verifier = source.slice(verifierStart, verifierEnd);
  const shellCheck = verifier.indexOf('"$base_url/?audioQa=silent"');
  const frameworkCheck = verifier.indexOf(
    '"$base_url/_framework/blazor.webassembly.js"',
  );
  const buildInfoCheck = verifier.indexOf('"$base_url/api/build-info"');
  const optionalOutage = verifier.indexOf(
    'if [ "$require_build_info" = "0" ]',
  );
  assert.ok(shellCheck >= 0 && shellCheck < buildInfoCheck);
  assert.ok(frameworkCheck >= 0 && frameworkCheck < buildInfoCheck);
  assert.ok(buildInfoCheck < optionalOutage);
});

test("rollback verifies ownership, pinned ID, and restored public runtime", () => {
  const rollbackStart = source.indexOf(
    "live verification failed; checking alias ownership before rollback",
  );
  const rollbackEnd = source.indexOf("automatic rollback failed", rollbackStart);
  const rollback = source.slice(rollbackStart, rollbackEnd);

  const ownershipRead = rollback.indexOf(
    'rollback_owner=$(inspect_public_deployment_id "https://guns-only.com"',
  );
  const ownershipCheck = rollback.indexOf(
    'if [ "$rollback_owner" != "$candidate_deployment" ]; then',
  );
  const rollbackMutation = rollback.indexOf(
    'if "$vercel_cli" rollback "$previous_deployment" --yes; then',
  );
  assert.ok(ownershipRead >= 0 && ownershipRead < ownershipCheck);
  assert.ok(ownershipCheck < rollbackMutation);
  assert.match(
    rollback.slice(ownershipCheck, rollbackMutation),
    /automatic rollback suppressed because this run no longer owns production[\s\S]*exit 1/,
  );

  assert.match(
    rollback,
    /verify_control_plane_deployment[\s\S]*"\$previous_deployment"/,
  );
  assert.match(
    rollback,
    /verify_public[\s\S]*"\$previous_revision"[\s\S]*"\$rollback_require_build_info"[\s\S]*"\$previous_deployment"/,
  );
});
