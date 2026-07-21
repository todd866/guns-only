#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  readJson,
  relativeToRoot,
  stableStringify,
  walkFiles,
} from "../assets/lib/common.mjs";
import { loadSchemas, validateSchema } from "../assets/lib/schema.mjs";

const CAMPAIGN_SCHEMA = "https://guns-only.invalid/schemas/v1/campaign-governance.schema.json";
const DOSSIER_SCHEMA = "https://guns-only.invalid/schemas/v1/mission-dossier.schema.json";

function issue(root, severity, code, file, pointer, message) {
  return {
    severity,
    code,
    file: relativeToRoot(root, file),
    path: pointer,
    message,
  };
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

function exactSet(actual, expected) {
  return actual.size === expected.size && [...actual].every((value) => expected.has(value));
}

function requireUniqueIds(root, record, values, pointer, label, errors) {
  for (const value of duplicateValues(values)) {
    errors.push(issue(root, "error", "governance.id.duplicate", record.file, pointer,
      `duplicate ${label} '${value}'`));
  }
}

function requireReferences(root, record, values, available, pointer, label, errors) {
  values.forEach((value, index) => {
    if (!available.has(value)) {
      errors.push(issue(root, "error", "governance.reference.missing", record.file,
        `${pointer}[${index}]`, `${label} '${value}' is not declared`));
    }
  });
}

function schemaRecord(schemas, schemaId) {
  return schemas.byId.get(schemaId) ?? null;
}

function validateCampaignSemantics(root, record, errors) {
  const document = record.document;
  const timelines = Array.isArray(document.primaryTimelines) ? document.primaryTimelines : [];
  const timelineIds = timelines.map((entry) => entry?.timelineId).filter(Boolean);
  requireUniqueIds(root, record, timelineIds, "$.primaryTimelines", "timeline ID", errors);

  if (timelines.length !== 2) {
    errors.push(issue(root, "error", "governance.timeline.count", record.file,
      "$.primaryTimelines", "the braided Korea campaign must declare exactly two primary timelines"));
  }
  const kinds = new Set(timelines.map((entry) => entry?.kind));
  if (!exactSet(kinds, new Set(["historical", "speculative"]))) {
    errors.push(issue(root, "error", "governance.timeline.kinds", record.file,
      "$.primaryTimelines", "primary timelines must contain one historical and one speculative storyline"));
  }

  const progression = document.progression ?? {};
  const lifetimes = new Set((progression.stateLifetimes ?? []).map((entry) => entry?.lifetime));
  if (!exactSet(lifetimes, new Set(["sortie", "run", "profile"]))) {
    errors.push(issue(root, "error", "governance.progression.lifetimes", record.file,
      "$.progression.stateLifetimes", "state ownership must cover exactly sortie, run, and profile lifetimes"));
  }
  const allowed = new Set(progression.allowedPermanentUnlockKinds ?? []);
  const forbidden = new Set(progression.forbiddenPermanentAdvantages ?? []);
  for (const value of allowed) {
    if (forbidden.has(value)) {
      errors.push(issue(root, "error", "governance.progression.contradiction", record.file,
        "$.progression", `progression kind '${value}' is both allowed and forbidden`));
    }
  }

  const surfaces = new Set(document.education?.surfaces ?? []);
  if (!exactSet(surfaces, new Set(["in_flight", "debrief", "archive"]))) {
    errors.push(issue(root, "error", "governance.education.surfaces", record.file,
      "$.education.surfaces", "education must provide in-flight, debrief, and archive surfaces"));
  }
  const labels = new Set(document.evidence?.epistemicLabels ?? []);
  if (!exactSet(labels, new Set(["engineering", "history", "reconstruction", "fiction"]))) {
    errors.push(issue(root, "error", "governance.evidence.labels", record.file,
      "$.evidence.epistemicLabels", "evidence labels must be engineering, history, reconstruction, and fiction"));
  }

  const gateIds = (document.reviewGates ?? []).map((entry) => entry?.gateId).filter(Boolean);
  requireUniqueIds(root, record, gateIds, "$.reviewGates", "review gate", errors);
}

function validateDossierSemantics(root, record, campaignRecord, errors) {
  const document = record.document;
  const campaign = campaignRecord.document;
  const campaignTimelines = new Map((campaign.primaryTimelines ?? [])
    .map((entry) => [entry.timelineId, entry]));
  const campaignTimelineIds = new Set(campaignTimelines.keys());
  const sorties = Array.isArray(document.sorties) ? document.sorties : [];
  const sortieIds = sorties.map((entry) => entry?.sortieId).filter(Boolean);
  const sortieIdSet = new Set(sortieIds);
  requireUniqueIds(root, record, sortieIds, "$.sorties", "sortie ID", errors);
  requireUniqueIds(root, record,
    sorties.map((entry) => entry?.missionContractId).filter(Boolean),
    "$.sorties", "mission contract ID", errors);

  sorties.forEach((sortie, index) => {
    if (!campaignTimelineIds.has(sortie?.timelineId)) {
      errors.push(issue(root, "error", "governance.timeline.unknown", record.file,
        `$.sorties[${index}].timelineId`, `timeline '${sortie?.timelineId}' is not a primary campaign timeline`));
    }
    if (sortie?.nestedMemory && campaign.nestedMemoryPolicy?.allowed !== true) {
      errors.push(issue(root, "error", "governance.memory.disallowed", record.file,
        `$.sorties[${index}].nestedMemory`, "campaign governance does not permit nested memories"));
    }
  });
  const usedTimelines = new Set(sorties.map((entry) => entry?.timelineId).filter(Boolean));
  for (const timelineId of campaignTimelineIds) {
    if (!usedTimelines.has(timelineId)) {
      errors.push(issue(root, "error", "governance.braid.timelineMissing", record.file,
        "$.sorties", `dossier does not include primary timeline '${timelineId}'`));
    }
  }

  const revealOrder = document.braid?.revealOrder ?? [];
  requireUniqueIds(root, record, revealOrder, "$.braid.revealOrder", "reveal-order sortie", errors);
  requireReferences(root, record, revealOrder, sortieIdSet,
    "$.braid.revealOrder", "sortie", errors);
  if (!exactSet(new Set(revealOrder), sortieIdSet)) {
    errors.push(issue(root, "error", "governance.braid.revealClosure", record.file,
      "$.braid.revealOrder", "reveal order must include every dossier sortie exactly once"));
  }
  (document.braid?.echoes ?? []).forEach((echo, index) => {
    requireReferences(root, record, echo?.sortieIds ?? [], sortieIdSet,
      `$.braid.echoes[${index}].sortieIds`, "sortie", errors);
  });

  const debriefIdValues = (document.educationDelivery?.debriefs ?? [])
    .map((entry) => entry?.debriefId).filter(Boolean);
  const archiveIdValues = (document.educationDelivery?.archiveEntries ?? [])
    .map((entry) => entry?.archiveEntryId).filter(Boolean);
  const debriefIds = new Set(debriefIdValues);
  const archiveIds = new Set(archiveIdValues);
  requireUniqueIds(root, record, debriefIdValues,
    "$.educationDelivery.debriefs", "debrief ID", errors);
  requireUniqueIds(root, record, archiveIdValues,
    "$.educationDelivery.archiveEntries", "archive ID", errors);
  const objectiveIds = (document.learningObjectives ?? []).map((entry) => entry?.objectiveId).filter(Boolean);
  requireUniqueIds(root, record, objectiveIds, "$.learningObjectives", "learning objective ID", errors);
  (document.learningObjectives ?? []).forEach((objective, index) => {
    const base = `$.learningObjectives[${index}]`;
    requireReferences(root, record,
      [objective?.introducedInSortieId, objective?.reappliedInSortieId].filter(Boolean),
      sortieIdSet, base, "sortie", errors);
    if (objective?.introducedInSortieId === objective?.reappliedInSortieId) {
      errors.push(issue(root, "error", "governance.education.noTransfer", record.file, base,
        "a learning objective must be reapplied in a later, different sortie"));
    }
    if (!debriefIds.has(objective?.explainedByDebriefId)) {
      errors.push(issue(root, "error", "governance.education.debriefMissing", record.file,
        `${base}.explainedByDebriefId`, `debrief '${objective?.explainedByDebriefId}' is not declared`));
    }
    if (!archiveIds.has(objective?.archiveEntryId)) {
      errors.push(issue(root, "error", "governance.education.archiveMissing", record.file,
        `${base}.archiveEntryId`, `archive entry '${objective?.archiveEntryId}' is not declared`));
    }
  });

  const claims = Array.isArray(document.claims) ? document.claims : [];
  const claimIds = claims.map((entry) => entry?.claimId).filter(Boolean);
  const claimIdSet = new Set(claimIds);
  requireUniqueIds(root, record, claimIds, "$.claims", "claim ID", errors);
  const sources = Array.isArray(document.sources) ? document.sources : [];
  const sourceIds = sources.map((entry) => entry?.sourceId).filter(Boolean);
  const sourceIdSet = new Set(sourceIds);
  const sourcesById = new Map(sources.map((entry) => [entry?.sourceId, entry]));
  requireUniqueIds(root, record, sourceIds, "$.sources", "source ID", errors);
  const allowedGrades = new Set(campaign.evidence?.sourceGrades ?? []);

  claims.forEach((claim, index) => {
    const base = `$.claims[${index}]`;
    requireReferences(root, record, claim?.appearsInSortieIds ?? [], sortieIdSet,
      `${base}.appearsInSortieIds`, "sortie", errors);
    requireReferences(root, record, claim?.sourceRefs ?? [], sourceIdSet,
      `${base}.sourceRefs`, "source", errors);
    if (claim?.label === "fiction" && (claim.sourceRefs?.length ?? 0) > 0) {
      errors.push(issue(root, "error", "governance.evidence.fictionLaundering", record.file,
        `${base}.sourceRefs`, "a fiction claim must be declared, not presented as proven by a source"));
    }
    if (claim?.label !== "fiction" && (claim?.sourceRefs?.length ?? 0) === 0) {
      errors.push(issue(root, "error", "governance.evidence.unsourced", record.file,
        `${base}.sourceRefs`, `${claim?.label ?? "non-fiction"} claim '${claim?.claimId}' requires a source`));
    }
    for (const sourceRef of claim?.sourceRefs ?? []) {
      if (!(sourcesById.get(sourceRef)?.supportsClaimIds ?? []).includes(claim.claimId)) {
        errors.push(issue(root, "error", "governance.evidence.notReciprocal", record.file,
          `${base}.sourceRefs`, `source '${sourceRef}' does not declare support for claim '${claim.claimId}'`));
      }
    }
  });
  sources.forEach((source, index) => {
    const base = `$.sources[${index}]`;
    if (!allowedGrades.has(source?.grade)) {
      errors.push(issue(root, "error", "governance.evidence.grade", record.file,
        `${base}.grade`, `source grade '${source?.grade}' is not allowed by campaign governance`));
    }
    requireReferences(root, record, source?.supportsClaimIds ?? [], claimIdSet,
      `${base}.supportsClaimIds`, "claim", errors);
    for (const claimRef of source?.supportsClaimIds ?? []) {
      const claim = claims.find((entry) => entry?.claimId === claimRef);
      if (!(claim?.sourceRefs ?? []).includes(source.sourceId)) {
        errors.push(issue(root, "error", "governance.evidence.notReciprocal", record.file,
          `${base}.supportsClaimIds`, `claim '${claimRef}' does not cite source '${source.sourceId}'`));
      }
    }
  });

  for (const timeline of campaignTimelines.values()) {
    for (const sortie of sorties.filter((entry) => entry?.timelineId === timeline.timelineId)) {
      const sortieClaims = claims.filter((claim) => claim?.appearsInSortieIds?.includes(sortie.sortieId));
      const requiredLabel = timeline.kind === "historical" ? "history" : "fiction";
      if (!sortieClaims.some((claim) => claim.label === requiredLabel)) {
        errors.push(issue(root, "error", "governance.evidence.timelineBoundary", record.file,
          "$.claims", `${timeline.kind} sortie '${sortie.sortieId}' needs an explicit ${requiredLabel} boundary claim`));
      }
    }
  }

  const abstractionIds = (document.abstractions ?? []).map((entry) => entry?.abstractionId).filter(Boolean);
  const abstractionIdSet = new Set(abstractionIds);
  requireUniqueIds(root, record, abstractionIds, "$.abstractions", "abstraction ID", errors);
  (document.educationDelivery?.archiveEntries ?? []).forEach((entry, index) => {
    requireReferences(root, record, entry?.claimRefs ?? [], claimIdSet,
      `$.educationDelivery.archiveEntries[${index}].claimRefs`, "claim", errors);
    requireReferences(root, record, entry?.abstractionRefs ?? [], abstractionIdSet,
      `$.educationDelivery.archiveEntries[${index}].abstractionRefs`, "abstraction", errors);
  });
  (document.production?.terrainCorridors ?? []).forEach((entry, index) => {
    requireReferences(root, record, entry?.sortieIds ?? [], sortieIdSet,
      `$.production.terrainCorridors[${index}].sortieIds`, "sortie", errors);
  });

  const allowedUnlocks = new Set(campaign.progression?.allowedPermanentUnlockKinds ?? []);
  for (const field of ["completionUnlocks", "failureUnlocks"]) {
    (document.progression?.[field] ?? []).forEach((unlock, index) => {
      if (!allowedUnlocks.has(unlock?.kind)) {
        errors.push(issue(root, "error", "governance.progression.unlockKind", record.file,
          `$.progression.${field}[${index}].kind`, `unlock kind '${unlock?.kind}' is not allowed by campaign governance`));
      }
    });
  }
  const readinessResources = new Set(campaign.progression?.readinessResources ?? []);
  (document.progression?.runStateEffects ?? []).forEach((effect, index) => {
    if (!readinessResources.has(effect?.resource)) {
      errors.push(issue(root, "error", "governance.progression.resource", record.file,
        `$.progression.runStateEffects[${index}].resource`,
        `run resource '${effect?.resource}' is not allowed by campaign governance`));
    }
  });

  const gates = new Map((campaign.reviewGates ?? []).map((entry) => [entry.gateId, entry]));
  const reviews = Array.isArray(document.reviews) ? document.reviews : [];
  const reviewIds = reviews.map((entry) => entry?.gateId).filter(Boolean);
  requireUniqueIds(root, record, reviewIds, "$.reviews", "review gate", errors);
  requireReferences(root, record, reviewIds, new Set(gates.keys()), "$.reviews", "review gate", errors);
  if (!exactSet(new Set(reviewIds), new Set(gates.keys()))) {
    errors.push(issue(root, "error", "governance.review.closure", record.file,
      "$.reviews", "dossier must record every campaign review gate exactly once"));
  }
  reviews.forEach((review, index) => {
    if (review?.status === "waived" && !review.waiver) {
      errors.push(issue(root, "error", "governance.review.waiverMissing", record.file,
        `$.reviews[${index}]`, "a waived review requires scope, reason, owner, expiry, and player consequence"));
    }
    if (review?.status !== "waived" && review?.waiver) {
      errors.push(issue(root, "error", "governance.review.waiverUnexpected", record.file,
        `$.reviews[${index}].waiver`, "waiver details are only valid when review status is 'waived'"));
    }
  });
  if (document.status === "approved") {
    for (const review of reviews) {
      if (gates.get(review.gateId)?.blocking && review.status !== "passed") {
        errors.push(issue(root, "error", "governance.review.approvalBlocked", record.file,
          "$.reviews", `approved dossier has blocking gate '${review.gateId}' in status '${review.status}'`));
      }
    }
  }
}

export async function validateGovernance(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const governanceDirectory = path.resolve(root,
    options.governanceDir ?? "content/governance");
  const schemaDirectory = path.resolve(root,
    options.schemaDir ?? "content/governance/schemas");
  const errors = [];
  const warnings = [];
  const schemas = await loadSchemas(schemaDirectory);
  const files = (await walkFiles(governanceDirectory))
    .filter((file) => file.endsWith(".json") && !file.startsWith(`${schemaDirectory}${path.sep}`))
    .sort((a, b) => a.localeCompare(b, "en"));
  const records = [];

  for (const file of files) {
    let document;
    try {
      document = await readJson(file);
    } catch (error) {
      errors.push(issue(root, "error", "governance.json", file, "$", error.message));
      continue;
    }
    const schema = schemaRecord(schemas, document?.$schema);
    if (!schema) {
      errors.push(issue(root, "error", "governance.schema.unknown", file, "$.$schema",
        `schema '${String(document?.$schema)}' is not registered`));
      continue;
    }
    for (const schemaIssue of validateSchema(document, schema, schemas)) {
      errors.push(issue(root, "error", schemaIssue.code, file, schemaIssue.path, schemaIssue.message));
    }
    records.push({ file, document });
  }

  const campaigns = records.filter((record) => record.document?.$schema === CAMPAIGN_SCHEMA);
  const dossiers = records.filter((record) => record.document?.$schema === DOSSIER_SCHEMA);
  requireUniqueIds(root, { file: governanceDirectory },
    campaigns.map((record) => record.document?.governanceId).filter(Boolean),
    "$", "governance ID", errors);
  requireUniqueIds(root, { file: governanceDirectory },
    dossiers.map((record) => record.document?.dossierId).filter(Boolean),
    "$", "dossier ID", errors);
  campaigns.forEach((record) => validateCampaignSemantics(root, record, errors));

  const campaignsById = new Map(campaigns.map((record) => [record.document.governanceId, record]));
  for (const record of dossiers) {
    const campaignRecord = campaignsById.get(record.document?.governanceId);
    if (!campaignRecord) {
      errors.push(issue(root, "error", "governance.campaign.missing", record.file,
        "$.governanceId", `campaign governance '${record.document?.governanceId}' is not declared`));
      continue;
    }
    if (!(campaignRecord.document.changeControl?.dossierStatuses ?? []).includes(record.document?.status)) {
      errors.push(issue(root, "error", "governance.status.disallowed", record.file,
        "$.status", `dossier status '${record.document?.status}' is not allowed by campaign governance`));
    }
    validateDossierSemantics(root, record, campaignRecord, errors);
  }

  errors.sort((a, b) => `${a.file}:${a.path}:${a.code}`.localeCompare(`${b.file}:${b.path}:${b.code}`, "en"));
  warnings.sort((a, b) => `${a.file}:${a.path}:${a.code}`.localeCompare(`${b.file}:${b.path}:${b.code}`, "en"));
  const strict = options.strict === true;
  return {
    ok: errors.length === 0 && (!strict || warnings.length === 0),
    strict,
    root,
    errors,
    warnings,
    summary: {
      schemas: schemas.files.length,
      campaigns: campaigns.length,
      dossiers: dossiers.length,
      sorties: dossiers.reduce((sum, record) => sum + (record.document.sorties?.length ?? 0), 0),
      claims: dossiers.reduce((sum, record) => sum + (record.document.claims?.length ?? 0), 0),
      sources: dossiers.reduce((sum, record) => sum + (record.document.sources?.length ?? 0), 0),
    },
  };
}

export function publicReport(report) {
  return {
    ok: report.ok,
    strict: report.strict,
    summary: report.summary,
    errors: report.errors,
    warnings: report.warnings,
  };
}

export function formatGovernanceReport(report) {
  const lines = [];
  for (const entry of [...report.errors, ...report.warnings]) {
    lines.push(`${entry.severity.toUpperCase()} ${entry.code} ${entry.file}:${entry.path} ${entry.message}`);
  }
  const summary = report.summary;
  lines.push(`content-governance: ${report.ok ? "ok" : "failed"} — ${summary.campaigns} campaign, ${summary.dossiers} dossier, ${summary.sorties} sorties, ${summary.claims} claims, ${summary.sources} sources`);
  return `${lines.join("\n")}\n`;
}

const HELP = `Usage: node tools/content/validate-governance.mjs [options]

Validates campaign governance and braided mission dossiers with JSON schemas plus
cross-document authoring, evidence, learning, progression, and review invariants.

Options:
  --root <directory>          Repository root (default: current directory)
  --governance-dir <path>     Governance directory (default: content/governance)
  --schema-dir <path>         Schema directory (default: content/governance/schemas)
  --strict                    Treat warnings as failures
  --json                      Emit deterministic JSON
  -h, --help                  Show this help
`;

export function parseArgs(argv) {
  const options = { root: process.cwd(), strict: false, json: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) throw new Error(`${value} requires a value`);
      return argv[++index];
    };
    switch (value) {
      case "--root": options.root = path.resolve(next()); break;
      case "--governance-dir": options.governanceDir = next(); break;
      case "--schema-dir": options.schemaDir = next(); break;
      case "--strict": options.strict = true; break;
      case "--json": options.json = true; break;
      case "-h":
      case "--help": options.help = true; break;
      default: throw new Error(`unknown option '${value}'`);
    }
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`content-governance: ${error.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const report = await validateGovernance(options);
  process.stdout.write(options.json
    ? stableStringify(publicReport(report))
    : formatGovernanceReport(report));
  return report.ok ? 0 : 1;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = await main();
