import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stableStringify } from "../../assets/lib/common.mjs";
import { validateGovernance } from "../validate-governance.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const DOSSIER = "content/governance/korea-braided/missions/first-echo.dossier.json";
const ARMSTRONG_DOSSIER =
  "content/governance/korea-braided/missions/armstrong-cable-strike.dossier.json";

async function temporaryGovernance(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "guns-only-governance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(
    path.join(REPOSITORY_ROOT, "content/governance"),
    path.join(root, "content/governance"),
    { recursive: true },
  );
  return root;
}

async function mutateDossier(root, mutate) {
  const file = path.join(root, DOSSIER);
  const document = JSON.parse(await readFile(file, "utf8"));
  mutate(document);
  await writeFile(file, stableStringify(document));
}

test("canonical campaign governance and worked dossiers pass the strict gate", async () => {
  const report = await validateGovernance({ root: REPOSITORY_ROOT, strict: true });
  assert.equal(report.ok, true, stableStringify(report));
  assert.deepEqual(report.summary, {
    schemas: 2,
    campaigns: 1,
    dossiers: 2,
    sorties: 5,
    claims: 17,
    sources: 9,
  });
});

test("Armstrong dossier remains source intake rather than false source lock", async () => {
  const dossier = JSON.parse(await readFile(
    path.join(REPOSITORY_ROOT, ARMSTRONG_DOSSIER), "utf8"));
  const claims = new Map(dossier.claims.map((claim) => [claim.claimId, claim]));

  assert.equal(dossier.status, "researching");
  assert.deepEqual(new Set(dossier.reviews.map((review) => review.status)), new Set(["pending"]));
  assert.match(claims.get("claim.armstrong-vf51-essex.v1").qualification,
    /3 and 5 September/);
  assert.match(claims.get("claim.armstrong-vf51-essex.v1").qualification,
    /F9F-2 and F9F-3/);
  assert.match(claims.get("claim.armstrong-armed-recon-wonsan.v1").qualification,
    /exact target.*corridor.*loadout/);
  assert.match(claims.get("claim.cable-field-gameplay-reconstruction.v1").qualification,
    /not the exact local obstacle layout/);
  assert.match(claims.get("claim.carpenter-flight-lead.v1").qualification,
    /radio wording/);
  assert.match(claims.get("claim.panther-ejection-seat.v1").qualification,
    /not source-locked/);
  assert.match(claims.get("claim.armstrong-ejection-friendly-territory.v1").qualification,
    /ground-recovery staging cannot be presented as exact history/i);

  const serialized = JSON.stringify(dossier);
  assert.doesNotMatch(serialized,
    /PaperLibrary|paperLibraryId|researchAsset|armstrong-korea-research|primary\/(?:images|video)|sha256/);
});

test("historical and technical claims cannot silently lose source closure", async (t) => {
  const root = await temporaryGovernance(t);
  await mutateDossier(root, (document) => {
    document.claims.find((claim) => claim.label === "history").sourceRefs = [];
  });
  const report = await validateGovernance({ root, strict: true });
  assert.equal(report.ok, false);
  assert.equal(report.errors.some((entry) => entry.code === "governance.evidence.unsourced"), true,
    stableStringify(report.errors));
});

test("a learning objective must transfer into another sortie", async (t) => {
  const root = await temporaryGovernance(t);
  await mutateDossier(root, (document) => {
    document.learningObjectives[0].reappliedInSortieId =
      document.learningObjectives[0].introducedInSortieId;
  });
  const report = await validateGovernance({ root, strict: true });
  assert.equal(report.ok, false);
  assert.equal(report.errors.some((entry) => entry.code === "governance.education.noTransfer"), true,
    stableStringify(report.errors));
});

test("dossiers cannot invent permanent reward categories", async (t) => {
  const root = await temporaryGovernance(t);
  await mutateDossier(root, (document) => {
    document.progression.completionUnlocks[0].kind = "weapon_damage_buff";
  });
  const report = await validateGovernance({ root, strict: true });
  assert.equal(report.ok, false);
  assert.equal(report.errors.some((entry) => entry.code === "governance.progression.unlockKind"), true,
    stableStringify(report.errors));
});

test("approved status is blocked until every blocking review passes", async (t) => {
  const root = await temporaryGovernance(t);
  await mutateDossier(root, (document) => {
    document.status = "approved";
  });
  const report = await validateGovernance({ root, strict: true });
  assert.equal(report.ok, false);
  assert.equal(report.errors.filter(
    (entry) => entry.code === "governance.review.approvalBlocked").length, 6,
  stableStringify(report.errors));
});

test("fiction labels cannot launder an invented event through a citation", async (t) => {
  const root = await temporaryGovernance(t);
  await mutateDossier(root, (document) => {
    const claim = document.claims.find((entry) => entry.label === "fiction");
    claim.sourceRefs = [document.sources[0].sourceId];
    document.sources[0].supportsClaimIds.push(claim.claimId);
  });
  const report = await validateGovernance({ root, strict: true });
  assert.equal(report.ok, false);
  assert.equal(report.errors.some(
    (entry) => entry.code === "governance.evidence.fictionLaundering"), true,
  stableStringify(report.errors));
});
