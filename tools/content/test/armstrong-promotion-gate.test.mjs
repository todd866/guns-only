import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ARMSTRONG_PROMOTION_CONTRACT,
  assessArmstrongPromotion,
  loadArmstrongPromotionInputs,
} from "../armstrong-promotion-gate.mjs";

function clone(value) {
  return structuredClone(value);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function authorityManifestHash(authorityHashes) {
  const digest = createHash("sha256");
  for (const authorityPath of ARMSTRONG_PROMOTION_CONTRACT.authorityPaths) {
    digest.update(authorityPath);
    digest.update("\0");
    digest.update(String(authorityHashes[authorityPath] ?? ""));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function protectedCiExecution() {
  return {
    trusted: true,
    provenance: {
      provider: "github-actions",
      repository: ARMSTRONG_PROMOTION_CONTRACT.trustedRepository,
      workflowRef: ARMSTRONG_PROMOTION_CONTRACT.trustedWorkflowRef,
      job: ARMSTRONG_PROMOTION_CONTRACT.trustedJob,
      sourceRevision: "1".repeat(40),
      ref: ARMSTRONG_PROMOTION_CONTRACT.trustedRef,
      eventName: "push",
      runId: "123456789",
      runAttempt: "1",
    },
  };
}

function promotionReadyFixture(canonical) {
  const fixture = clone(canonical);
  fixture.dossier.status = "approved";
  fixture.dossier.reviews.forEach((review) => {
    review.status = "passed";
    delete review.waiver;
  });
  fixture.sequence.status = "approved";
  fixture.sequence.governance.openResearchRefs = [];
  fixture.sequence.production.gates.forEach((gate) => { gate.status = "passed"; });
  fixture.sequence.production.workstreams.forEach((workstream) => { workstream.status = "done"; });
  fixture.sourceRegister.status = "locked";
  fixture.radioLines.status = "approved";
  fixture.storyboardPlan.status = "approved";

  fixture.artifactHashes = {};
  fixture.artifactDocuments = {};
  fixture.trustedExecution = protectedCiExecution();
  const provenance = clone(fixture.trustedExecution.provenance);
  const authorityManifestSha256 = authorityManifestHash(fixture.authorityHashes);
  const proofs = ARMSTRONG_PROMOTION_CONTRACT.proofIds.map((testId, index) => {
    const artifactPath = `artifacts/armstrong/${String(index + 1).padStart(2, "0")}.json`;
    const proofResult = {
      schemaVersion: "1.0.0",
      kind: ARMSTRONG_PROMOTION_CONTRACT.proofResultKind,
      testId,
      dossierId: ARMSTRONG_PROMOTION_CONTRACT.dossierId,
      sequenceId: ARMSTRONG_PROMOTION_CONTRACT.sequenceId,
      status: "passed",
      simInputSha256: fixture.simInputSha256,
      buildIdentitySha256: fixture.authorityHashes["web/wwwroot/api/build-info.js"],
      authorityManifestSha256,
      provenance: clone(provenance),
    };
    const sha256 = hash(`${JSON.stringify(proofResult)}\n`);
    fixture.artifactHashes[artifactPath] = sha256;
    fixture.artifactDocuments[artifactPath] = proofResult;
    return { testId, status: "passed", evidence: [{ path: artifactPath, sha256 }] };
  });
  const runtimeArtifactPath = "artifacts/armstrong/runtime-result.json";
  const runtimeResult = {
    schemaVersion: "1.0.0",
    resultId: ARMSTRONG_PROMOTION_CONTRACT.runtimeResultId,
    dossierId: ARMSTRONG_PROMOTION_CONTRACT.dossierId,
    sequenceId: ARMSTRONG_PROMOTION_CONTRACT.sequenceId,
    missionContractId: ARMSTRONG_PROMOTION_CONTRACT.missionContractId,
    status: "passed",
    outcome: "none",
    completedBeatIds: [...ARMSTRONG_PROMOTION_CONTRACT.beatIds],
    finalCheckpointId: ARMSTRONG_PROMOTION_CONTRACT.finalCheckpointId,
    simInputSha256: fixture.simInputSha256,
    buildIdentitySha256: fixture.authorityHashes["web/wwwroot/api/build-info.js"],
    authorityManifestSha256,
    provenance: clone(provenance),
  };
  const runtimeArtifactHash = hash(`${JSON.stringify(runtimeResult)}\n`);
  fixture.artifactHashes[runtimeArtifactPath] = runtimeArtifactHash;
  fixture.artifactDocuments[runtimeArtifactPath] = runtimeResult;
  fixture.releaseEvidence = {
    schemaVersion: "1.0.0",
    dossierId: ARMSTRONG_PROMOTION_CONTRACT.dossierId,
    sequenceId: ARMSTRONG_PROMOTION_CONTRACT.sequenceId,
    status: "locked",
    simInputSha256: fixture.simInputSha256,
    authorityManifestSha256,
    provenance: clone(provenance),
    authority: ARMSTRONG_PROMOTION_CONTRACT.authorityPaths.map((authorityPath) => ({
      path: authorityPath,
      sha256: fixture.authorityHashes[authorityPath],
    })),
    runtime: {
      status: "passed",
      missionContractId: ARMSTRONG_PROMOTION_CONTRACT.missionContractId,
      completedBeatIds: [...ARMSTRONG_PROMOTION_CONTRACT.beatIds],
      finalCheckpointId: ARMSTRONG_PROMOTION_CONTRACT.finalCheckpointId,
      outcome: "none",
      simInputSha256: fixture.simInputSha256,
      buildIdentitySha256: fixture.authorityHashes["web/wwwroot/api/build-info.js"],
      authorityManifestSha256,
      provenance: clone(provenance),
      evidence: { path: runtimeArtifactPath, sha256: runtimeArtifactHash },
    },
    proofs,
  };
  return fixture;
}

function hasError(report, code) {
  return report.errors.some((entry) => entry.code === code);
}

test("canonical Armstrong research tree is coherent, measurable, and ineligible", async () => {
  const report = assessArmstrongPromotion(await loadArmstrongPromotionInputs());

  assert.equal(report.safe, true, JSON.stringify(report.errors, null, 2));
  assert.equal(report.status, "ineligible");
  assert.equal(report.promotionEligible, false);
  assert.deepEqual(report.metrics.reviews, { passed: 0, required: 6 });
  assert.deepEqual(report.metrics.productionGates, { passed: 0, required: 7 });
  assert.deepEqual(report.metrics.workstreams, { done: 0, required: 14 });
  assert.deepEqual(report.metrics.proofs, { passed: 0, required: 15 });
  assert.deepEqual(report.metrics.runtimeBeats, { passed: 0, required: 12 });
  assert.deepEqual(report.metrics.companionDocuments, { ready: 0, required: 3 });
  assert.equal(report.metrics.publicExposure.matches, 0);
  assert.ok(report.metrics.openResearch.remaining > 0);
});

test("partial approvals remain safely blocked", async () => {
  const fixture = clone(await loadArmstrongPromotionInputs());
  fixture.dossier.status = "approved";
  fixture.dossier.reviews[0].status = "passed";
  fixture.sequence.production.gates[0].status = "passed";
  fixture.sequence.production.workstreams[0].status = "done";

  const report = assessArmstrongPromotion(fixture);
  assert.equal(report.safe, true, JSON.stringify(report.errors, null, 2));
  assert.equal(report.promotionEligible, false);
  assert.deepEqual(report.metrics.reviews, { passed: 1, required: 6 });
  assert.deepEqual(report.metrics.productionGates, { passed: 1, required: 7 });
  assert.deepEqual(report.metrics.workstreams, { done: 1, required: 14 });
});

for (const releaseState of ["preview", "quarantined", "production"]) {
  test(`researching Armstrong ${releaseState} catalog exposure fails closed`, async () => {
    const fixture = clone(await loadArmstrongPromotionInputs());
    fixture.experienceCatalog.push({
      id: "armstrong-cable-strike",
      mission: 15,
      releaseState,
      title: "Armstrong Cable Strike",
    });

    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(report.promotionEligible, false);
    assert.equal(hasError(report, "armstrong.exposure.blocked"), true);
  });
}

test("researching Armstrong mission definitions fail in both source and shipped packs", async () => {
  const fixture = clone(await loadArmstrongPromotionInputs());
  const definition = {
    id: ARMSTRONG_PROMOTION_CONTRACT.missionContractId,
    uri: "builtin://mission/armstrong-cable-strike",
  };
  fixture.sourcePack.content.missionDefinitions.push(definition);
  fixture.webPack.content.missionDefinitions.push(clone(definition));

  const report = assessArmstrongPromotion(fixture);
  assert.equal(report.safe, false);
  assert.equal(hasError(report, "armstrong.exposure.blocked"), true);
  assert.ok(report.exposure.some((entry) => entry.location.startsWith("sourcePack.")));
  assert.ok(report.exposure.some((entry) => entry.location.startsWith("webPack.")));
});

test("researching Armstrong exposure outside missionDefinitions also fails closed", async () => {
  const fixture = clone(await loadArmstrongPromotionInputs());
  fixture.sourcePack.content.researchPreviews = [{ id: "armstrong-cable-strike" }];
  fixture.webPack.content.researchPreviews = [{ id: "armstrong-cable-strike" }];

  const report = assessArmstrongPromotion(fixture);
  assert.equal(report.safe, false);
  assert.equal(hasError(report, "armstrong.exposure.blocked"), true);
  assert.ok(report.exposure.some((entry) =>
    entry.location.startsWith("sourcePack.content.researchPreviews")));
  assert.ok(report.exposure.some((entry) =>
    entry.location.startsWith("webPack.content.researchPreviews")));
});

test("a synthetic fully closed dossier is promotion eligible", async () => {
  const report = assessArmstrongPromotion(
    promotionReadyFixture(await loadArmstrongPromotionInputs()));

  assert.equal(report.safe, true, JSON.stringify(report.errors, null, 2));
  assert.equal(report.status, "eligible");
  assert.equal(report.promotionEligible, true);
  assert.deepEqual(report.metrics.reviews, { passed: 6, required: 6 });
  assert.deepEqual(report.metrics.productionGates, { passed: 7, required: 7 });
  assert.deepEqual(report.metrics.workstreams, { done: 14, required: 14 });
  assert.deepEqual(report.metrics.proofs, { passed: 15, required: 15 });
  assert.deepEqual(report.metrics.runtimeBeats, { passed: 12, required: 12 });
  assert.deepEqual(report.metrics.companionDocuments, { ready: 3, required: 3 });
  assert.deepEqual(report.metrics.openResearch, { remaining: 0 });
});

test("self-attested or non-protected execution provenance cannot promote", async (t) => {
  const canonical = await loadArmstrongPromotionInputs();

  await t.test("no trusted execution", () => {
    const fixture = promotionReadyFixture(canonical);
    fixture.trustedExecution = null;
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.untrustedExecution"), true);
  });

  await t.test("different CI run", () => {
    const fixture = promotionReadyFixture(canonical);
    fixture.trustedExecution.provenance.runId = "987654321";
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.untrustedExecution"), true);
  });
});

test("correctly hashed fabricated proof documents cannot promote", async (t) => {
  const canonical = await loadArmstrongPromotionInputs();

  await t.test("arbitrary JSON", () => {
    const fixture = promotionReadyFixture(canonical);
    const artifact = fixture.releaseEvidence.proofs[0].evidence[0];
    fixture.artifactDocuments[artifact.path] = { status: "passed" };
    artifact.sha256 = hash(`${JSON.stringify(fixture.artifactDocuments[artifact.path])}\n`);
    fixture.artifactHashes[artifact.path] = artifact.sha256;
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.proofResultInvalid"), true);
  });

  await t.test("result from another test", () => {
    const fixture = promotionReadyFixture(canonical);
    const artifact = fixture.releaseEvidence.proofs[0].evidence[0];
    fixture.artifactDocuments[artifact.path].testId =
      fixture.releaseEvidence.proofs[1].testId;
    artifact.sha256 = hash(`${JSON.stringify(fixture.artifactDocuments[artifact.path])}\n`);
    fixture.artifactHashes[artifact.path] = artifact.sha256;
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.proofResultInvalid"), true);
  });
});

test("missing, duplicate, and stale immutable proof evidence cannot promote", async (t) => {
  const canonical = await loadArmstrongPromotionInputs();

  await t.test("missing hash", () => {
    const fixture = promotionReadyFixture(canonical);
    delete fixture.releaseEvidence.proofs[0].evidence[0].sha256;
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.hashMissing"), true);
  });

  await t.test("duplicate proof ID", () => {
    const fixture = promotionReadyFixture(canonical);
    fixture.releaseEvidence.proofs[1].testId = fixture.releaseEvidence.proofs[0].testId;
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.proofClosure"), true);
  });

  await t.test("stale artifact hash", () => {
    const fixture = promotionReadyFixture(canonical);
    const artifact = fixture.releaseEvidence.proofs[0].evidence[0];
    fixture.artifactHashes[artifact.path] = hash("different bytes\n");
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.hashStale"), true);
  });
});

test("runtime evidence must cover every beat through the complete checkpoint", async () => {
  const fixture = promotionReadyFixture(await loadArmstrongPromotionInputs());
  fixture.releaseEvidence.runtime.completedBeatIds.pop();

  const report = assessArmstrongPromotion(fixture);
  assert.equal(report.safe, false);
  assert.equal(report.promotionEligible, false);
  assert.equal(hasError(report, "armstrong.evidence.runtimeClosure"), true);
  assert.deepEqual(report.metrics.runtimeBeats, { passed: 0, required: 12 });
});

test("runtime evidence cannot reorder the authored beat history", async () => {
  const fixture = promotionReadyFixture(await loadArmstrongPromotionInputs());
  fixture.releaseEvidence.runtime.completedBeatIds.reverse();

  const report = assessArmstrongPromotion(fixture);
  assert.equal(report.safe, false);
  assert.equal(report.promotionEligible, false);
  assert.equal(hasError(report, "armstrong.evidence.runtimeClosure"), true);
});

test("old evidence cannot survive dossier, runtime, or build identity changes", async (t) => {
  const canonical = await loadArmstrongPromotionInputs();
  for (const authorityPath of [
    ".github/workflows/verify.yml",
    "bin/check",
    "content/governance/korea-braided/missions/armstrong-cable-strike.dossier.json",
    "docs/airframes/f9f-2-panther/00-sources.md",
    "docs/art-direction/korea-1950s/narrative/screenplay.md",
    "docs/art-direction/korea-1950s/narrative/validate.test.mjs",
    "sim/Korea/ArmstrongCableStrikeController.cs",
    "sim.Tests/GunsOnly.Sim.Tests.csproj",
    "tools/content/test/governance.test.mjs",
    "web/wwwroot/api/build-info.js",
  ]) {
    await t.test(authorityPath, () => {
      const fixture = promotionReadyFixture(canonical);
      fixture.authorityHashes[authorityPath] = hash(`changed ${authorityPath}\n`);
      const report = assessArmstrongPromotion(fixture);
      assert.equal(report.safe, false);
      assert.equal(hasError(report, "armstrong.evidence.authorityHashStale"), true);
    });
  }
});

test("runtime completion requires a hashed result artifact", async () => {
  const fixture = promotionReadyFixture(await loadArmstrongPromotionInputs());
  delete fixture.releaseEvidence.runtime.evidence;

  const report = assessArmstrongPromotion(fixture);
  assert.equal(report.safe, false);
  assert.equal(hasError(report, "armstrong.evidence.runtimeClosure"), true);
});

test("runtime result bytes must parse and agree with the claimed mission outcome", async (t) => {
  const canonical = await loadArmstrongPromotionInputs();

  await t.test("arbitrary bytes", () => {
    const fixture = promotionReadyFixture(canonical);
    const artifact = fixture.releaseEvidence.runtime.evidence;
    fixture.artifactHashes[artifact.path] = hash("arbitrary bytes\n");
    fixture.artifactDocuments[artifact.path] = null;
    artifact.sha256 = fixture.artifactHashes[artifact.path];
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.runtimeClosure"), true);
  });

  await t.test("victory outcome", () => {
    const fixture = promotionReadyFixture(canonical);
    const artifact = fixture.releaseEvidence.runtime.evidence;
    fixture.artifactDocuments[artifact.path].outcome = "victory";
    const bytes = `${JSON.stringify(fixture.artifactDocuments[artifact.path])}\n`;
    artifact.sha256 = hash(bytes);
    fixture.artifactHashes[artifact.path] = artifact.sha256;
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.runtimeClosure"), true);
  });

  await t.test("correctly hashed self-attested run", () => {
    const fixture = promotionReadyFixture(canonical);
    const artifact = fixture.releaseEvidence.runtime.evidence;
    fixture.artifactDocuments[artifact.path].provenance.runId = "444444444";
    const bytes = `${JSON.stringify(fixture.artifactDocuments[artifact.path])}\n`;
    artifact.sha256 = hash(bytes);
    fixture.artifactHashes[artifact.path] = artifact.sha256;
    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(hasError(report, "armstrong.evidence.runtimeClosure"), true);
  });
});

test("old evidence cannot survive a change anywhere in the compiled Sim input closure", async () => {
  const fixture = promotionReadyFixture(await loadArmstrongPromotionInputs());
  fixture.simInputSha256 = hash("changed sim/AircraftState.cs input tree\n");

  const report = assessArmstrongPromotion(fixture);
  assert.equal(report.safe, false);
  assert.equal(hasError(report, "armstrong.evidence.simInputHashStale"), true);
  assert.equal(hasError(report, "armstrong.evidence.runtimeClosure"), true);
});

test("source and shipped Korea mission-definition drift fails", async () => {
  const fixture = clone(await loadArmstrongPromotionInputs());
  fixture.webPack.content.missionDefinitions.push({
    id: "mission.unrelated-drift.v1",
    uri: "builtin://mission/unrelated-drift",
  });

  const report = assessArmstrongPromotion(fixture);
  assert.equal(report.safe, false);
  assert.equal(hasError(report, "armstrong.pack.drift"), true);
});

test("canonical IDs, claims, beat set, and final checkpoint fail closed on drift", async (t) => {
  const canonical = await loadArmstrongPromotionInputs();

  await t.test("dossier path drift", () => {
    const fixture = clone(canonical);
    fixture.sequence.governance.dossierPath = "content/governance/alternate.json";
    assert.equal(hasError(assessArmstrongPromotion(fixture), "armstrong.identity.drift"), true);
  });

  await t.test("unknown claim", () => {
    const fixture = clone(canonical);
    fixture.sequence.governance.claimRefs.push("claim.armstrong.unsourced.v1");
    assert.equal(hasError(assessArmstrongPromotion(fixture), "armstrong.claims.notClosed"), true);
  });

  await t.test("deleted claim declarations", () => {
    const fixture = clone(canonical);
    fixture.sequence.governance.claimRefs = [];
    assert.equal(hasError(assessArmstrongPromotion(fixture), "armstrong.claims.declarationClosure"), true);
  });

  await t.test("deleted dossier claim", () => {
    const fixture = clone(canonical);
    fixture.dossier.claims = fixture.dossier.claims.filter((claim) =>
      claim.claimId !== ARMSTRONG_PROMOTION_CONTRACT.claimIds[0]);
    assert.equal(hasError(assessArmstrongPromotion(fixture), "armstrong.claims.dossierClosure"), true);
  });

  await t.test("missing final beat", () => {
    const fixture = clone(canonical);
    fixture.sequence.beats.pop();
    const report = assessArmstrongPromotion(fixture);
    assert.equal(hasError(report, "armstrong.sequence.beatClosure"), true);
    assert.equal(hasError(report, "armstrong.sequence.finalCheckpoint"), true);
  });

  await t.test("fixed-history mode drift", () => {
    const fixture = clone(canonical);
    fixture.sequence.mode = "branching";
    assert.equal(hasError(assessArmstrongPromotion(fixture), "armstrong.mission.identity"), true);
  });

  await t.test("authored beat order drift", () => {
    const fixture = clone(canonical);
    fixture.sequence.beats.reverse();
    const report = assessArmstrongPromotion(fixture);
    assert.equal(hasError(report, "armstrong.sequence.beatOrder"), true);
    assert.equal(hasError(report, "armstrong.sequence.finalCheckpoint"), true);
  });
});

for (const missingResearchRefs of [undefined, null, "closed"]) {
  test(`missing or malformed openResearchRefs (${String(missingResearchRefs)}) fails closed`, async () => {
    const fixture = clone(await loadArmstrongPromotionInputs());
    fixture.sequence.governance.openResearchRefs = missingResearchRefs;

    const report = assessArmstrongPromotion(fixture);
    assert.equal(report.safe, false);
    assert.equal(report.promotionEligible, false);
    assert.equal(hasError(report, "armstrong.research.invalid"), true);
  });
}
