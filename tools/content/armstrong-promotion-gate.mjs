#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DOSSIER_ID = "dossier.armstrong-cable-strike.v1";
const GOVERNANCE_ID = "governance.korea-braided.v1";
const SEQUENCE_ID = "sequence.korea-1951.armstrong-cable-strike.v1";
const SORTIE_ID = "sortie.1951.armstrong-cable-strike.v1";
const MISSION_CONTRACT_ID = "mission.korea-1951.armstrong-cable-strike.prototype.v1";
const FINAL_CHECKPOINT_ID = "checkpoint.armstrong.complete.v1";
const RUNTIME_RESULT_ID = "result.armstrong.production-runtime.v1";
const BUILD_IDENTITY_PATH = "web/wwwroot/api/build-info.js";
const PROOF_RESULT_KIND = "armstrong-proof-result";
const TRUSTED_REPOSITORY = "todd866/guns-only";
const TRUSTED_REF = "refs/heads/main";
const TRUSTED_WORKFLOW_REF =
  "todd866/guns-only/.github/workflows/verify.yml@refs/heads/main";
const TRUSTED_JOB = "deterministic";

const EXPECTED_REVIEW_IDS = Object.freeze([
  "narrative_braid",
  "simulation_integrity",
  "evidence",
  "learning_design",
  "representation",
  "production",
]);

const EXPECTED_GATE_IDS = Object.freeze([
  "source-lock",
  "scenario-lock",
  "greybox",
  "content-lock",
  "historical-rights-review",
  "accessibility",
  "release",
]);

const EXPECTED_WORKSTREAM_IDS = Object.freeze([
  "research",
  "narrative",
  "mission-design",
  "aircraft",
  "carrier",
  "environment",
  "damage",
  "ejection",
  "visual-art",
  "audio",
  "interface",
  "accessibility-localization",
  "qa-telemetry",
  "release",
]);

const EXPECTED_BEAT_IDS = Object.freeze([
  "beat.armstrong.01-deck-launch.v1",
  "beat.armstrong.02-join-and-coast.v1",
  "beat.armstrong.03-valley-ingress.v1",
  "beat.armstrong.04-attack-run.v1",
  "beat.armstrong.05-cable-strike.v1",
  "beat.armstrong.06-arrest-the-roll.v1",
  "beat.armstrong.07-carpenter-inspection.v1",
  "beat.armstrong.08-southbound.v1",
  "beat.armstrong.09-ejection-setup.v1",
  "beat.armstrong.10-ejection.v1",
  "beat.armstrong.11-parachute-descent.v1",
  "beat.armstrong.12-ground-recovery.v1",
]);

const EXPECTED_PROOF_IDS = Object.freeze([
  "test.narrative.schema.v1",
  "test.narrative.source-closure.v1",
  "test.narrative.required-order.v1",
  "test.narrative.checkpoint-determinism.v1",
  "test.cable.physical-authority.v1",
  "test.damage.panther-controllability.v1",
  "test.inspection.observer-safety.v1",
  "test.ejection.lifecycle.v1",
  "test.narrative.replay-causality.v1",
  "test.narrative.caption-equivalence.v1",
  "test.narrative.voice-policy.v1",
  "test.narrative.silent-audio.v1",
  "test.narrative.visual-cues.v1",
  "test.narrative.frame-budget.v1",
  "test.narrative.end-to-end.v1",
]);

const EXPECTED_CLAIM_IDS = Object.freeze([
  "claim.armstrong-vf51-essex.v1",
  "claim.armstrong-armed-recon-wonsan.v1",
  "claim.armstrong-cable-strike.v1",
  "claim.armstrong-wing-loss.v1",
  "claim.carpenter-flight-lead.v1",
  "claim.armstrong-no-landing-decision.v1",
  "claim.armstrong-ejection-friendly-territory.v1",
  "claim.panther-ejection-seat.v1",
  "claim.cable-field-gameplay-reconstruction.v1",
  "claim.panther-damage-flight-reconstruction.v1",
]);

const EXPECTED_AUTHORITY_PATHS = Object.freeze([
  ".github/workflows/verify.yml",
  "bin/check",
  "content/governance/korea-braided/governance.json",
  "content/governance/korea-braided/missions/armstrong-cable-strike.dossier.json",
  "content/governance/schemas/campaign-governance.schema.json",
  "content/governance/schemas/mission-dossier.schema.json",
  "docs/airframes/f9f-2-panther/00-sources.md",
  "docs/art-direction/korea-1950s/narrative/README.md",
  "docs/art-direction/korea-1950s/narrative/armstrong-ejection.sequence.json",
  "docs/art-direction/korea-1950s/narrative/greybox-implementation.md",
  "docs/art-direction/korea-1950s/narrative/playable-sequence.schema.json",
  "docs/art-direction/korea-1950s/narrative/production-plan.md",
  "docs/art-direction/korea-1950s/narrative/radio-performance-reference.md",
  "docs/art-direction/korea-1950s/narrative/source-register.json",
  "docs/art-direction/korea-1950s/narrative/radio-lines.json",
  "docs/art-direction/korea-1950s/narrative/research-ledger.md",
  "docs/art-direction/korea-1950s/narrative/screenplay.md",
  "docs/art-direction/korea-1950s/narrative/storyboard-plan.json",
  "docs/art-direction/korea-1950s/narrative/treatment.md",
  "docs/art-direction/korea-1950s/narrative/validate.mjs",
  "docs/art-direction/korea-1950s/narrative/validate.test.mjs",
  "docs/art-direction/korea-1950s/narrative/voice-production.md",
  "content/packs/korea-1950s/pack.json",
  "web/wwwroot/content/packs/korea-1950s/pack.json",
  "sim/GunsOnly.Sim.csproj",
  "sim/Doctrine/Beats.cs",
  "sim/FlightModel.cs",
  "sim/SimulationSession.cs",
  "sim/Korea/ArmstrongCableStrikeContracts.cs",
  "sim/Korea/ArmstrongCableStrikeController.cs",
  "sim/Korea/ArmstrongCableStrikeScenario.cs",
  "sim/Korea/CableHazardField.cs",
  "sim/Korea/DamageInspectionFlight.cs",
  "sim/Korea/NarrativeEvidenceRecorder.cs",
  "sim/Korea/PartialAirframeDamage.cs",
  "sim.Tests/Korea/ArmstrongCableStrikeControllerTests.cs",
  "sim.Tests/Korea/CableHazardFieldTests.cs",
  "sim.Tests/Korea/DamageInspectionFlightTests.cs",
  "sim.Tests/Korea/NarrativeEvidenceRecorderTests.cs",
  "sim.Tests/Korea/PartialAirframeDamageTests.cs",
  "sim.Tests/GunsOnly.Sim.Tests.csproj",
  "web/SnapshotHotFrame.cs",
  "web/SnapshotProjection.cs",
  "web/wwwroot/api/build-info.js",
  "web/wwwroot/app.js",
  "web/wwwroot/hud.js",
  "web/wwwroot/render/progression/campaign_progression.js",
  "tools/content/armstrong-promotion-gate.mjs",
  "tools/content/test/armstrong-promotion-gate.test.mjs",
  "tools/content/test/governance.test.mjs",
  "tools/content/validate-governance.mjs",
]);

export const ARMSTRONG_PROMOTION_CONTRACT = Object.freeze({
  dossierId: DOSSIER_ID,
  governanceId: GOVERNANCE_ID,
  sequenceId: SEQUENCE_ID,
  sortieId: SORTIE_ID,
  missionContractId: MISSION_CONTRACT_ID,
  finalCheckpointId: FINAL_CHECKPOINT_ID,
  runtimeResultId: RUNTIME_RESULT_ID,
  proofResultKind: PROOF_RESULT_KIND,
  trustedRepository: TRUSTED_REPOSITORY,
  trustedRef: TRUSTED_REF,
  trustedWorkflowRef: TRUSTED_WORKFLOW_REF,
  trustedJob: TRUSTED_JOB,
  reviewIds: EXPECTED_REVIEW_IDS,
  gateIds: EXPECTED_GATE_IDS,
  workstreamIds: EXPECTED_WORKSTREAM_IDS,
  beatIds: EXPECTED_BEAT_IDS,
  proofIds: EXPECTED_PROOF_IDS,
  claimIds: EXPECTED_CLAIM_IDS,
  authorityPaths: EXPECTED_AUTHORITY_PATHS,
});

export const ARMSTRONG_PROMOTION_PATHS = Object.freeze({
  governance: "content/governance/korea-braided/governance.json",
  dossier: "content/governance/korea-braided/missions/armstrong-cable-strike.dossier.json",
  sequence: "docs/art-direction/korea-1950s/narrative/armstrong-ejection.sequence.json",
  sourceRegister: "docs/art-direction/korea-1950s/narrative/source-register.json",
  radioLines: "docs/art-direction/korea-1950s/narrative/radio-lines.json",
  storyboardPlan: "docs/art-direction/korea-1950s/narrative/storyboard-plan.json",
  releaseEvidence: "docs/art-direction/korea-1950s/narrative/armstrong-release-evidence.json",
  sourcePack: "content/packs/korea-1950s/pack.json",
  webPack: "web/wwwroot/content/packs/korea-1950s/pack.json",
  campaignCatalog: "web/wwwroot/render/progression/campaign_progression.js",
});

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const PROVENANCE_KEYS = Object.freeze([
  "provider",
  "repository",
  "workflowRef",
  "job",
  "sourceRevision",
  "ref",
  "eventName",
  "runId",
  "runAttempt",
]);
const PROOF_RESULT_KEYS = Object.freeze([
  "schemaVersion",
  "kind",
  "testId",
  "dossierId",
  "sequenceId",
  "status",
  "simInputSha256",
  "buildIdentitySha256",
  "authorityManifestSha256",
  "provenance",
]);
const RUNTIME_RESULT_KEYS = Object.freeze([
  "schemaVersion",
  "resultId",
  "dossierId",
  "sequenceId",
  "missionContractId",
  "status",
  "outcome",
  "completedBeatIds",
  "finalCheckpointId",
  "simInputSha256",
  "buildIdentitySha256",
  "authorityManifestSha256",
  "provenance",
]);

function issue(code, location, message) {
  return Object.freeze({ code, location, message });
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort((a, b) => a.localeCompare(b, "en"));
}

function sameMembers(values, expected) {
  if (values.length !== expected.length) return false;
  const actual = new Set(values);
  return actual.size === expected.length && expected.every((value) => actual.has(value));
}

function sameOrderedValues(values, expected) {
  return values.length === expected.length
    && values.every((value, index) => value === expected[index]);
}

function requireExactIds(errors, entries, field, expected, code, location) {
  const ids = list(entries).map((entry) => entry?.[field]).filter((value) => typeof value === "string");
  const duplicates = duplicateValues(ids);
  if (!sameMembers(ids, expected) || duplicates.length > 0) {
    errors.push(issue(code, location,
      `expected exactly [${expected.join(", ")}]; found [${ids.join(", ")}]`));
  }
  return ids;
}

function requireExactValues(errors, values, expected, code, location) {
  const actual = list(values).filter((value) => typeof value === "string");
  const duplicates = duplicateValues(actual);
  if (!sameMembers(actual, expected) || duplicates.length > 0) {
    errors.push(issue(code, location,
      `expected exactly [${expected.join(", ")}]; found [${actual.join(", ")}]`));
  }
  return actual;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort((a, b) => a.localeCompare(b, "en"))
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return sameMembers(Object.keys(value), expectedKeys);
}

function authorityManifestSha256(authorityHashes) {
  const digest = createHash("sha256");
  for (const authorityPath of EXPECTED_AUTHORITY_PATHS) {
    digest.update(authorityPath);
    digest.update("\0");
    digest.update(String(authorityHashes?.[authorityPath] ?? ""));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function provenanceMatches(provenance, trustedExecution) {
  if (trustedExecution?.trusted !== true
      || !hasExactKeys(provenance, PROVENANCE_KEYS)) return false;
  return PROVENANCE_KEYS.every((key) => provenance[key] === trustedExecution.provenance?.[key]);
}

function trustedExecutionFromEnvironment(environment) {
  const provenance = Object.freeze({
    provider: "github-actions",
    repository: String(environment.GITHUB_REPOSITORY ?? ""),
    workflowRef: String(environment.GITHUB_WORKFLOW_REF ?? ""),
    job: String(environment.GITHUB_JOB ?? ""),
    sourceRevision: String(environment.GITHUB_SHA ?? "").toLowerCase(),
    ref: String(environment.GITHUB_REF ?? ""),
    eventName: String(environment.GITHUB_EVENT_NAME ?? ""),
    runId: String(environment.GITHUB_RUN_ID ?? ""),
    runAttempt: String(environment.GITHUB_RUN_ATTEMPT ?? ""),
  });
  const trusted = environment.GITHUB_ACTIONS === "true"
    && environment.CI === "true"
    && environment.RUNNER_ENVIRONMENT === "github-hosted"
    && environment.GITHUB_REF_PROTECTED === "true"
    && provenance.repository === TRUSTED_REPOSITORY
    && provenance.workflowRef === TRUSTED_WORKFLOW_REF
    && provenance.job === TRUSTED_JOB
    && provenance.ref === TRUSTED_REF
    && ["push", "workflow_dispatch"].includes(provenance.eventName)
    && GIT_SHA.test(provenance.sourceRevision)
    && POSITIVE_INTEGER.test(provenance.runId)
    && POSITIVE_INTEGER.test(provenance.runAttempt);
  return Object.freeze({ trusted, provenance });
}

function packMissionDefinitions(pack) {
  return list(pack?.content?.missionDefinitions);
}

function containsArmstrongToken(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized.includes("armstrong")
    || normalized === DOSSIER_ID
    || normalized === SEQUENCE_ID
    || normalized === SORTIE_ID
    || normalized === MISSION_CONTRACT_ID
    || normalized === FINAL_CHECKPOINT_ID;
}

function findArmstrongValues(value, location, matches) {
  if (containsArmstrongToken(value)) {
    matches.push(Object.freeze({ location, value }));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findArmstrongValues(entry, `${location}[${index}]`, matches));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) =>
      findArmstrongValues(entry, `${location}.${key}`, matches));
  }
}

function findExposure(input) {
  const matches = [];
  findArmstrongValues(list(input.experienceCatalog), "campaignCatalog", matches);
  findArmstrongValues(input.sourcePack, "sourcePack", matches);
  findArmstrongValues(input.webPack, "webPack", matches);
  return matches;
}

function companionIsReady(document, expectedStatus) {
  return document?.status === expectedStatus;
}

function releaseEvidenceReport(input, errors) {
  const evidence = input.releaseEvidence;
  if (evidence == null) {
    return {
      present: false,
      proofsPassed: 0,
      runtimeBeatsPassed: 0,
      ready: false,
    };
  }

  let valid = true;
  const invalidate = (code, location, message) => {
    valid = false;
    errors.push(issue(code, location, message));
  };

  if (evidence.status !== "locked") {
    invalidate("armstrong.evidence.status", "releaseEvidence.status",
      `release evidence must be locked; found '${String(evidence.status ?? "missing")}'`);
  }
  if (evidence.schemaVersion !== "1.0.0") {
    invalidate("armstrong.evidence.schemaVersion", "releaseEvidence.schemaVersion",
      "release evidence must use schemaVersion '1.0.0'");
  }
  if (evidence.dossierId !== DOSSIER_ID || evidence.sequenceId !== SEQUENCE_ID) {
    invalidate("armstrong.evidence.identity", "releaseEvidence",
      "release evidence must bind the canonical dossier and sequence IDs");
  }
  if (!SHA256.test(evidence.simInputSha256 ?? "")
      || evidence.simInputSha256 !== input.simInputSha256) {
    invalidate("armstrong.evidence.simInputHashStale", "releaseEvidence.simInputSha256",
      "release evidence must bind the deterministic digest of every compiled Sim input");
  }
  const expectedAuthorityManifestSha256 = authorityManifestSha256(input.authorityHashes);
  if (evidence.authorityManifestSha256 !== expectedAuthorityManifestSha256) {
    invalidate("armstrong.evidence.authorityManifestStale",
      "releaseEvidence.authorityManifestSha256",
      "release evidence must bind the canonical authority manifest digest");
  }
  if (!provenanceMatches(evidence.provenance, input.trustedExecution)) {
    invalidate("armstrong.evidence.untrustedExecution", "releaseEvidence.provenance",
      "promotion evidence must come from the protected main-branch deterministic GitHub Actions job and bind its exact run provenance");
  }

  const authority = list(evidence.authority);
  const authorityPaths = requireExactIds(errors, authority, "path", EXPECTED_AUTHORITY_PATHS,
    "armstrong.evidence.authorityClosure", "releaseEvidence.authority");
  if (!sameMembers(authorityPaths, EXPECTED_AUTHORITY_PATHS)
      || duplicateValues(authorityPaths).length > 0) valid = false;
  authority.forEach((entry, index) => {
    const expectedHash = typeof entry?.sha256 === "string" ? entry.sha256 : "";
    const actualHash = input.authorityHashes?.[entry?.path];
    if (!SHA256.test(expectedHash)) {
      invalidate("armstrong.evidence.authorityHashMissing", `releaseEvidence.authority[${index}]`,
        "each authority input needs a lowercase SHA-256");
    } else if (!SHA256.test(actualHash ?? "") || actualHash !== expectedHash) {
      invalidate("armstrong.evidence.authorityHashStale", `releaseEvidence.authority[${index}]`,
        `authority input '${String(entry?.path ?? "missing")}' changed after evidence capture`);
    }
  });

  const proofs = list(evidence.proofs);
  const proofIds = requireExactIds(errors, proofs, "testId", EXPECTED_PROOF_IDS,
    "armstrong.evidence.proofClosure", "releaseEvidence.proofs");
  if (!sameMembers(proofIds, EXPECTED_PROOF_IDS) || duplicateValues(proofIds).length > 0) valid = false;

  const proofIdCounts = new Map();
  proofs.forEach((proof) => {
    const testId = proof?.testId;
    proofIdCounts.set(testId, (proofIdCounts.get(testId) ?? 0) + 1);
  });
  const passedProofIds = new Set();
  proofs.forEach((proof, proofIndex) => {
    let proofValid = proof?.status === "passed";
    if (!proofValid) {
      invalidate("armstrong.evidence.proofStatus", `releaseEvidence.proofs[${proofIndex}].status`,
        `proof '${String(proof?.testId ?? "missing")}' must have status 'passed'`);
    }
    const artifacts = list(proof?.evidence);
    if (artifacts.length !== 1) {
      proofValid = false;
      invalidate("armstrong.evidence.artifactMissing", `releaseEvidence.proofs[${proofIndex}].evidence`,
        `proof '${String(proof?.testId ?? "missing")}' needs exactly one structured immutable result`);
    }
    artifacts.forEach((artifact, artifactIndex) => {
      const artifactLocation = `releaseEvidence.proofs[${proofIndex}].evidence[${artifactIndex}]`;
      const artifactPath = typeof artifact?.path === "string" ? artifact.path : "";
      const expectedHash = typeof artifact?.sha256 === "string" ? artifact.sha256 : "";
      const actualHash = input.artifactHashes?.[artifactPath];
      if (!artifactPath || !SHA256.test(expectedHash)) {
        proofValid = false;
        invalidate("armstrong.evidence.hashMissing", artifactLocation,
          "each proof artifact needs a repository-relative path and lowercase SHA-256");
      } else if (!SHA256.test(actualHash ?? "") || actualHash !== expectedHash) {
        proofValid = false;
        invalidate("armstrong.evidence.hashStale", artifactLocation,
          `artifact '${artifactPath}' is missing or does not match its pinned SHA-256`);
      }
      const proofResult = input.artifactDocuments?.[artifactPath];
      const proofResultReady = hasExactKeys(proofResult, PROOF_RESULT_KEYS)
        && proofResult?.schemaVersion === "1.0.0"
        && proofResult?.kind === PROOF_RESULT_KIND
        && proofResult?.testId === proof?.testId
        && proofResult?.dossierId === DOSSIER_ID
        && proofResult?.sequenceId === SEQUENCE_ID
        && proofResult?.status === "passed"
        && proofResult?.simInputSha256 === input.simInputSha256
        && proofResult?.buildIdentitySha256 === input.authorityHashes?.[BUILD_IDENTITY_PATH]
        && proofResult?.authorityManifestSha256 === expectedAuthorityManifestSha256
        && provenanceMatches(proofResult?.provenance, input.trustedExecution);
      if (!proofResultReady) {
        proofValid = false;
        invalidate("armstrong.evidence.proofResultInvalid", artifactLocation,
          `artifact '${artifactPath}' must be an exact structured result for '${String(proof?.testId ?? "missing")}' bound to the protected CI run and current authority, Sim, and Build digests`);
      }
    });
    if (!EXPECTED_PROOF_IDS.includes(proof?.testId) || proofIdCounts.get(proof?.testId) !== 1) {
      proofValid = false;
    }
    if (proofValid) passedProofIds.add(proof.testId);
  });
  const proofsPassed = passedProofIds.size;

  const runtime = evidence.runtime;
  const completedBeatIds = list(runtime?.completedBeatIds);
  const runtimeIdentityReady = runtime?.status === "passed"
    && runtime?.missionContractId === MISSION_CONTRACT_ID
    && runtime?.finalCheckpointId === FINAL_CHECKPOINT_ID
    && runtime?.outcome === "none"
    && runtime?.simInputSha256 === input.simInputSha256
    && runtime?.buildIdentitySha256 === input.authorityHashes?.[BUILD_IDENTITY_PATH]
    && runtime?.authorityManifestSha256 === expectedAuthorityManifestSha256
    && provenanceMatches(runtime?.provenance, input.trustedExecution);
  const runtimeIdsReady = sameOrderedValues(completedBeatIds, EXPECTED_BEAT_IDS);
  const runtimeArtifactPath = typeof runtime?.evidence?.path === "string"
    ? runtime.evidence.path : "";
  const runtimeArtifactHash = typeof runtime?.evidence?.sha256 === "string"
    ? runtime.evidence.sha256 : "";
  const runtimeArtifactReady = runtimeArtifactPath.length > 0
    && SHA256.test(runtimeArtifactHash)
    && input.artifactHashes?.[runtimeArtifactPath] === runtimeArtifactHash;
  const runtimeResult = input.artifactDocuments?.[runtimeArtifactPath];
  const runtimeResultReady = hasExactKeys(runtimeResult, RUNTIME_RESULT_KEYS)
    && runtimeResult?.schemaVersion === "1.0.0"
    && runtimeResult?.resultId === RUNTIME_RESULT_ID
    && runtimeResult?.dossierId === DOSSIER_ID
    && runtimeResult?.sequenceId === SEQUENCE_ID
    && runtimeResult?.missionContractId === runtime?.missionContractId
    && runtimeResult?.status === runtime?.status
    && runtimeResult?.outcome === runtime?.outcome
    && runtimeResult?.finalCheckpointId === runtime?.finalCheckpointId
    && sameOrderedValues(list(runtimeResult?.completedBeatIds), completedBeatIds)
    && runtimeResult?.simInputSha256 === runtime?.simInputSha256
    && runtimeResult?.buildIdentitySha256 === runtime?.buildIdentitySha256
    && runtimeResult?.authorityManifestSha256 === runtime?.authorityManifestSha256
    && provenanceMatches(runtimeResult?.provenance, input.trustedExecution);
  if (!runtimeIdentityReady || !runtimeIdsReady || !runtimeArtifactReady || !runtimeResultReady) {
    invalidate("armstrong.evidence.runtimeClosure", "releaseEvidence.runtime",
      `runtime evidence must pin a matching structured result, Outcome.None, and all ${EXPECTED_BEAT_IDS.length} canonical beats through '${FINAL_CHECKPOINT_ID}'`);
  }

  return {
    present: true,
    proofsPassed,
    runtimeBeatsPassed: runtimeIdsReady && runtimeIdentityReady
      && runtimeArtifactReady && runtimeResultReady
      ? EXPECTED_BEAT_IDS.length : 0,
    ready: valid && proofsPassed === EXPECTED_PROOF_IDS.length
      && runtimeIdsReady && runtimeIdentityReady && runtimeArtifactReady && runtimeResultReady,
  };
}

export function assessArmstrongPromotion(input) {
  const errors = [];
  const blockers = [];
  const dossier = input?.dossier ?? {};
  const governance = input?.governance ?? {};
  const sequence = input?.sequence ?? {};

  if (dossier.dossierId !== DOSSIER_ID
      || dossier.governanceId !== GOVERNANCE_ID
      || sequence.sequenceId !== SEQUENCE_ID
      || sequence.governance?.dossierId !== DOSSIER_ID
      || sequence.governance?.governanceId !== GOVERNANCE_ID
      || sequence.governance?.dossierPath !== ARMSTRONG_PROMOTION_PATHS.dossier) {
    errors.push(issue("armstrong.identity.drift", "dossier/sequence",
      "dossier, governance, sequence, and dossierPath must retain their canonical identities"));
  }
  const historicalSorties = list(dossier.sorties).filter((sortie) => sortie?.sortieId === SORTIE_ID);
  if (historicalSorties.length !== 1
      || historicalSorties[0]?.missionContractId !== MISSION_CONTRACT_ID
      || sequence.mode !== "fixed_history") {
    errors.push(issue("armstrong.mission.identity", "dossier.sorties/sequence.mode",
      "promotion must retain the canonical historical sortie, mission contract, and fixed-history mode"));
  }
  if (governance.governanceId !== GOVERNANCE_ID) {
    errors.push(issue("armstrong.governance.identity", "governance.governanceId",
      `expected '${GOVERNANCE_ID}'`));
  }

  const blockingReviewIds = list(governance.reviewGates)
    .filter((gate) => gate?.blocking === true)
    .map((gate) => gate?.gateId)
    .filter((value) => typeof value === "string");
  if (!sameMembers(blockingReviewIds, EXPECTED_REVIEW_IDS)
      || duplicateValues(blockingReviewIds).length > 0) {
    errors.push(issue("armstrong.governance.reviewClosure", "governance.reviewGates",
      "the campaign must retain exactly the six canonical blocking Armstrong reviews"));
  }

  const reviews = list(dossier.reviews);
  requireExactIds(errors, reviews, "gateId", EXPECTED_REVIEW_IDS,
    "armstrong.dossier.reviewClosure", "dossier.reviews");
  const reviewsPassed = reviews.filter((review) =>
    review?.status === "passed" && review?.waiver == null).length;
  if (reviews.some((review) => review?.status === "passed" && review?.waiver != null)) {
    errors.push(issue("armstrong.dossier.passedWaiver", "dossier.reviews",
      "a passed review cannot retain waiver metadata"));
  }

  const dossierClaimIds = list(dossier.claims).map((claim) => claim?.claimId)
    .filter((value) => typeof value === "string");
  const missingDossierClaims = EXPECTED_CLAIM_IDS.filter((claimId) => !dossierClaimIds.includes(claimId));
  if (duplicateValues(dossierClaimIds).length > 0 || missingDossierClaims.length > 0) {
    errors.push(issue("armstrong.claims.dossierClosure", "dossier.claims",
      `canonical claims must occur exactly once; missing [${missingDossierClaims.join(", ")}]`));
  }
  const sequenceClaimIds = requireExactValues(errors, sequence.governance?.claimRefs,
    EXPECTED_CLAIM_IDS, "armstrong.claims.declarationClosure", "sequence.governance.claimRefs");
  const unknownClaims = sequenceClaimIds.filter((claimId) => !dossierClaimIds.includes(claimId));
  if (duplicateValues(sequenceClaimIds).length > 0 || unknownClaims.length > 0) {
    errors.push(issue("armstrong.claims.notClosed", "sequence.governance.claimRefs",
      `sequence claims must be unique dossier claims; unknown [${unknownClaims.join(", ")}]`));
  }

  const sequenceBeatIds = requireExactIds(errors, sequence.beats, "beatId", EXPECTED_BEAT_IDS,
    "armstrong.sequence.beatClosure", "sequence.beats");
  const finalBeat = list(sequence.beats).at(-1);
  if (!sameOrderedValues(sequenceBeatIds, EXPECTED_BEAT_IDS)) {
    errors.push(issue("armstrong.sequence.beatOrder", "sequence.beats",
      "fixed-history beats must retain their canonical authored order"));
  }
  if (sequenceBeatIds.length !== EXPECTED_BEAT_IDS.length
      || finalBeat?.beatId !== EXPECTED_BEAT_IDS.at(-1)
      || finalBeat?.checkpoint?.checkpointId !== FINAL_CHECKPOINT_ID) {
    errors.push(issue("armstrong.sequence.finalCheckpoint", "sequence.beats",
      `the 12-beat sequence must end at '${FINAL_CHECKPOINT_ID}'`));
  }

  const workstreams = list(sequence.production?.workstreams);
  requireExactIds(errors, workstreams, "workstreamId", EXPECTED_WORKSTREAM_IDS,
    "armstrong.sequence.workstreamClosure", "sequence.production.workstreams");
  const workstreamsDone = workstreams.filter((workstream) => workstream?.status === "done").length;

  const gates = list(sequence.production?.gates);
  requireExactIds(errors, gates, "gateId", EXPECTED_GATE_IDS,
    "armstrong.sequence.gateClosure", "sequence.production.gates");
  const gatesPassed = gates.filter((gate) => gate?.status === "passed").length;

  requireExactIds(errors, sequence.tests, "testId", EXPECTED_PROOF_IDS,
    "armstrong.sequence.proofDeclarationClosure", "sequence.tests");

  for (const [name, document] of [
    ["sourceRegister", input.sourceRegister],
    ["radioLines", input.radioLines],
    ["storyboardPlan", input.storyboardPlan],
  ]) {
    if (document?.sequenceId !== SEQUENCE_ID) {
      errors.push(issue("armstrong.companion.identity", `${name}.sequenceId`,
        `expected '${SEQUENCE_ID}'`));
    }
  }

  const sourceDefinitions = packMissionDefinitions(input.sourcePack);
  const webDefinitions = packMissionDefinitions(input.webPack);
  if (canonicalJson(sourceDefinitions) !== canonicalJson(webDefinitions)) {
    errors.push(issue("armstrong.pack.drift", "sourcePack/webPack.content.missionDefinitions",
      "source and shipped Korea mission definitions must be identical before promotion"));
  }

  const evidence = releaseEvidenceReport(input, errors);
  const openResearchRefs = sequence.governance?.openResearchRefs;
  const openResearchValid = Array.isArray(openResearchRefs)
    && openResearchRefs.every((entry) => typeof entry === "string" && entry.trim().length > 0)
    && duplicateValues(openResearchRefs).length === 0;
  if (!openResearchValid) {
    errors.push(issue("armstrong.research.invalid", "sequence.governance.openResearchRefs",
      "openResearchRefs must be a unique array of non-empty IDs; absence is not source closure"));
  }
  const openResearchCount = Array.isArray(openResearchRefs) ? openResearchRefs.length : 0;
  const companionsReady = [
    companionIsReady(input.sourceRegister, "locked"),
    companionIsReady(input.radioLines, "approved"),
    companionIsReady(input.storyboardPlan, "approved"),
  ].filter(Boolean).length;

  if (dossier.status !== "approved") {
    blockers.push(issue("armstrong.dossier.notApproved", "dossier.status",
      `dossier status is '${String(dossier.status ?? "missing")}'`));
  }
  if (reviewsPassed !== EXPECTED_REVIEW_IDS.length) {
    blockers.push(issue("armstrong.dossier.reviewsPending", "dossier.reviews",
      `${reviewsPassed}/${EXPECTED_REVIEW_IDS.length} blocking reviews passed without waiver`));
  }
  if (sequence.status !== "approved") {
    blockers.push(issue("armstrong.sequence.notApproved", "sequence.status",
      `sequence status is '${String(sequence.status ?? "missing")}'`));
  }
  if (openResearchCount !== 0) {
    blockers.push(issue("armstrong.research.open", "sequence.governance.openResearchRefs",
      `${openResearchCount} research questions remain open`));
  }
  if (gatesPassed !== EXPECTED_GATE_IDS.length) {
    blockers.push(issue("armstrong.sequence.gatesPending", "sequence.production.gates",
      `${gatesPassed}/${EXPECTED_GATE_IDS.length} production gates passed`));
  }
  if (workstreamsDone !== EXPECTED_WORKSTREAM_IDS.length) {
    blockers.push(issue("armstrong.sequence.workstreamsPending", "sequence.production.workstreams",
      `${workstreamsDone}/${EXPECTED_WORKSTREAM_IDS.length} workstreams done`));
  }
  if (companionsReady !== 3) {
    blockers.push(issue("armstrong.companions.notLocked", "narrative companions",
      `${companionsReady}/3 companion documents locked or approved`));
  }
  if (!evidence.ready) {
    blockers.push(issue("armstrong.evidence.incomplete", ARMSTRONG_PROMOTION_PATHS.releaseEvidence,
      `${evidence.proofsPassed}/${EXPECTED_PROOF_IDS.length} proofs and ${evidence.runtimeBeatsPassed}/${EXPECTED_BEAT_IDS.length} runtime beats passed`));
  }

  const closureReady = errors.length === 0 && blockers.length === 0;
  const exposure = findExposure(input);
  if (!closureReady && exposure.length > 0) {
    errors.push(issue("armstrong.exposure.blocked", "campaign catalog / Korea packs",
      `Armstrong is publicly exposed before promotion closure at ${exposure.map((entry) => entry.location).join(", ")}`));
  }

  return Object.freeze({
    safe: errors.length === 0,
    promotionEligible: closureReady && errors.length === 0,
    status: closureReady && errors.length === 0 ? "eligible" : errors.length === 0 ? "ineligible" : "unsafe",
    metrics: Object.freeze({
      reviews: Object.freeze({ passed: reviewsPassed, required: EXPECTED_REVIEW_IDS.length }),
      productionGates: Object.freeze({ passed: gatesPassed, required: EXPECTED_GATE_IDS.length }),
      workstreams: Object.freeze({ done: workstreamsDone, required: EXPECTED_WORKSTREAM_IDS.length }),
      proofs: Object.freeze({ passed: evidence.proofsPassed, required: EXPECTED_PROOF_IDS.length }),
      runtimeBeats: Object.freeze({ passed: evidence.runtimeBeatsPassed, required: EXPECTED_BEAT_IDS.length }),
      companionDocuments: Object.freeze({ ready: companionsReady, required: 3 }),
      openResearch: Object.freeze({ remaining: openResearchCount }),
      publicExposure: Object.freeze({ matches: exposure.length }),
    }),
    blockers: Object.freeze(blockers),
    errors: Object.freeze(errors),
    exposure: Object.freeze(exposure),
  });
}

async function readJson(root, relativePath) {
  return JSON.parse(await readFile(path.resolve(root, relativePath), "utf8"));
}

async function readOptionalJson(root, relativePath) {
  try {
    return await readJson(root, relativePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function importExperienceCatalog(root) {
  const filename = path.resolve(root, ARMSTRONG_PROMOTION_PATHS.campaignCatalog);
  const metadata = await stat(filename);
  const url = pathToFileURL(filename);
  url.searchParams.set("armstrongPromotionGate", String(metadata.mtimeMs));
  const module = await import(url.href);
  if (!Array.isArray(module.EXPERIENCE_CATALOG)) {
    throw new Error(`${ARMSTRONG_PROMOTION_PATHS.campaignCatalog} does not export EXPERIENCE_CATALOG`);
  }
  return module.EXPERIENCE_CATALOG;
}

async function loadReleaseArtifacts(root, releaseEvidence) {
  const hashes = Object.create(null);
  const documents = Object.create(null);
  const rootReal = await realpath(root);
  const rootPrefix = `${rootReal}${path.sep}`;
  const artifactPaths = new Set([
    ...list(releaseEvidence?.proofs).flatMap((proof) => list(proof?.evidence)),
    releaseEvidence?.runtime?.evidence,
  ]
    .map((artifact) => artifact?.path)
    .filter((artifactPath) => typeof artifactPath === "string" && artifactPath.length > 0));

  for (const artifactPath of artifactPaths) {
    const resolved = path.resolve(root, artifactPath);
    if (path.isAbsolute(artifactPath) || (!resolved.startsWith(rootPrefix) && resolved !== rootReal)) {
      hashes[artifactPath] = null;
      continue;
    }
    try {
      const resolvedReal = await realpath(resolved);
      if (!resolvedReal.startsWith(rootPrefix)) {
        hashes[artifactPath] = null;
        continue;
      }
      const bytes = await readFile(resolvedReal);
      hashes[artifactPath] = createHash("sha256").update(bytes).digest("hex");
      try {
        documents[artifactPath] = JSON.parse(bytes.toString("utf8"));
      } catch {
        documents[artifactPath] = null;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      hashes[artifactPath] = null;
    }
  }
  return { hashes, documents };
}

async function hashAuthorityInputs(root) {
  const hashes = Object.create(null);
  await Promise.all(EXPECTED_AUTHORITY_PATHS.map(async (relativePath) => {
    try {
      hashes[relativePath] = createHash("sha256")
        .update(await readFile(path.resolve(root, relativePath))).digest("hex");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      hashes[relativePath] = null;
    }
  }));
  return hashes;
}

async function walkSimInputs(directory, root, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    if (entry.isDirectory() && (entry.name === "bin" || entry.name === "obj")) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkSimInputs(absolutePath, root, output);
    } else if (entry.isFile() && (entry.name.endsWith(".cs") || entry.name.endsWith(".csproj"))) {
      output.push(path.relative(root, absolutePath).split(path.sep).join("/"));
    }
  }
}

async function hashSimInputs(root) {
  const inputPaths = [
    "global.json",
    "airframes/rapier.v2.json",
    "airframes/generated/rapier.v2.engineering.json",
  ];
  await walkSimInputs(path.resolve(root, "sim"), root, inputPaths);
  inputPaths.sort((left, right) => left.localeCompare(right, "en"));
  const digest = createHash("sha256");
  for (const relativePath of inputPaths) {
    digest.update(relativePath);
    digest.update("\0");
    digest.update(await readFile(path.resolve(root, relativePath)));
    digest.update("\0");
  }
  return digest.digest("hex");
}

export async function loadArmstrongPromotionInputs(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const releaseEvidence = await readOptionalJson(root, ARMSTRONG_PROMOTION_PATHS.releaseEvidence);
  const [governance, dossier, sequence, sourceRegister, radioLines, storyboardPlan,
    sourcePack, webPack, experienceCatalog, artifactBundle, authorityHashes,
    simInputSha256] = await Promise.all([
    readJson(root, ARMSTRONG_PROMOTION_PATHS.governance),
    readJson(root, ARMSTRONG_PROMOTION_PATHS.dossier),
    readJson(root, ARMSTRONG_PROMOTION_PATHS.sequence),
    readJson(root, ARMSTRONG_PROMOTION_PATHS.sourceRegister),
    readJson(root, ARMSTRONG_PROMOTION_PATHS.radioLines),
    readJson(root, ARMSTRONG_PROMOTION_PATHS.storyboardPlan),
    readJson(root, ARMSTRONG_PROMOTION_PATHS.sourcePack),
    readJson(root, ARMSTRONG_PROMOTION_PATHS.webPack),
    importExperienceCatalog(root),
    loadReleaseArtifacts(root, releaseEvidence),
    hashAuthorityInputs(root),
    hashSimInputs(root),
  ]);
  return {
    root,
    governance,
    dossier,
    sequence,
    sourceRegister,
    radioLines,
    storyboardPlan,
    releaseEvidence,
    sourcePack,
    webPack,
    experienceCatalog,
    artifactHashes: artifactBundle.hashes,
    artifactDocuments: artifactBundle.documents,
    authorityHashes,
    simInputSha256,
    trustedExecution: trustedExecutionFromEnvironment(process.env),
  };
}

export async function assessArmstrongPromotionFromRoot(options = {}) {
  return assessArmstrongPromotion(await loadArmstrongPromotionInputs(options));
}

function humanReport(report) {
  const metrics = report.metrics;
  const lines = [
    `Armstrong promotion: ${report.status.toUpperCase()}`,
    `reviews ${metrics.reviews.passed}/${metrics.reviews.required}; production gates ${metrics.productionGates.passed}/${metrics.productionGates.required}; workstreams ${metrics.workstreams.done}/${metrics.workstreams.required}`,
    `immutable proofs ${metrics.proofs.passed}/${metrics.proofs.required}; runtime beats ${metrics.runtimeBeats.passed}/${metrics.runtimeBeats.required}; companions ${metrics.companionDocuments.ready}/${metrics.companionDocuments.required}`,
    `open research ${metrics.openResearch.remaining}; public exposure ${metrics.publicExposure.matches}`,
  ];
  if (report.blockers.length > 0) {
    lines.push("Blockers:", ...report.blockers.map((entry) => `- ${entry.code}: ${entry.message}`));
  }
  if (report.errors.length > 0) {
    lines.push("Errors:", ...report.errors.map((entry) => `- ${entry.code}: ${entry.message}`));
  }
  return lines.join("\n");
}

function parseCli(argv) {
  const options = { json: false, requireEligible: false, root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--require-eligible") options.requireEligible = true;
    else if (argument === "--root" && argv[index + 1]) options.root = argv[index += 1];
    else throw new Error(`unknown argument '${argument}'`);
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const report = await assessArmstrongPromotionFromRoot({ root: options.root });
  console.log(options.json ? JSON.stringify(report, null, 2) : humanReport(report));
  if (!report.safe || (options.requireEligible && !report.promotionEligible)) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Armstrong promotion gate failed: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  });
}
