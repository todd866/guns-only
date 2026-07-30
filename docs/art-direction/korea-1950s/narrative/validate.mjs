#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadSchemas,
  validateSchema,
} from "../../../../tools/assets/lib/schema.mjs";

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_ID =
  "https://guns-only.invalid/schemas/v1/playable-narrative-sequence.schema.json";
const CANONICAL_SEQUENCE = "armstrong-ejection.sequence.json";
const COMPANION_FILES = Object.freeze({
  radioCatalog: "radio-lines.json",
  storyboardPlan: "storyboard-plan.json",
  sourceRegister: "source-register.json",
});

function issue(code, at, message) {
  return Object.freeze({ code, path: at, message });
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function checkUnique(items, key, at, errors) {
  for (const duplicate of duplicateValues(items.map((item) => item?.[key]))) {
    errors.push(issue("sequence.duplicate", at,
      `duplicate ${key} '${duplicate}'`));
  }
}

function checkWorkstreamGraph(workstreams, errors) {
  const ids = new Set(workstreams.map((entry) => entry.workstreamId));
  for (const [index, workstream] of workstreams.entries()) {
    for (const dependency of workstream.dependsOn) {
      if (!ids.has(dependency)) {
        errors.push(issue("sequence.production.unknownDependency",
          `$.production.workstreams[${index}].dependsOn`,
          `unknown workstream dependency '${dependency}'`));
      }
      if (dependency === workstream.workstreamId) {
        errors.push(issue("sequence.production.selfDependency",
          `$.production.workstreams[${index}].dependsOn`,
          `workstream '${dependency}' depends on itself`));
      }
    }
  }

  const byId = new Map(workstreams.map((entry) =>
    [entry.workstreamId, entry.dependsOn]));
  const active = new Set();
  const complete = new Set();

  function visit(id, trail) {
    if (complete.has(id) || !byId.has(id)) return;
    if (active.has(id)) {
      errors.push(issue("sequence.production.dependencyCycle",
        "$.production.workstreams",
        `dependency cycle: ${[...trail, id].join(" -> ")}`));
      return;
    }
    active.add(id);
    for (const dependency of byId.get(id)) visit(dependency, [...trail, id]);
    active.delete(id);
    complete.add(id);
  }

  for (const id of byId.keys()) visit(id, []);
}

function checkReferenceClosure(document, errors) {
  const beats = document.beats ?? [];
  const used = {
    worldFacts: beats.flatMap((beat) => beat.authority?.worldFactRefs ?? []),
    events: beats.flatMap((beat) => beat.authority?.emittedEventRefs ?? []),
    mechanics: beats.flatMap((beat) => beat.mechanicRefs ?? []),
    cues: beats.flatMap((beat) => beat.cueRefs ?? []),
    lines: beats.flatMap((beat) => beat.lineRefs ?? []),
    storyboardFrames: beats.flatMap((beat) => beat.storyboardFrameRefs ?? []),
  };
  for (const [category, references] of Object.entries(used)) {
    const declared = new Set(document.referenceIndex?.[category] ?? []);
    const usedSet = new Set(references);
    for (const reference of usedSet) {
      if (!declared.has(reference)) {
        errors.push(issue("sequence.reference.undeclared",
          `$.referenceIndex.${category}`,
          `beat reference '${reference}' is not declared`));
      }
    }
    for (const reference of declared) {
      if (!usedSet.has(reference)) {
        errors.push(issue("sequence.reference.unused",
          `$.referenceIndex.${category}`,
          `declared reference '${reference}' is not used by a beat`));
      }
    }
  }
}

function checkSequenceIdentity(document, label, sequenceId, errors) {
  if (document?.sequenceId !== sequenceId) {
    errors.push(issue("bundle.sequenceId.mismatch", `$.${label}.sequenceId`,
      `expected '${sequenceId}', received '${document?.sequenceId}'`));
  }
}

function checkCatalogClosure({
  catalogLabel,
  declaredRefs,
  items,
  itemIdKey,
  beatRefKey,
  beats,
  sourceIds,
  sourceClaims,
  sourceSupportedClaimIds,
  claimIds,
  errors,
}) {
  checkUnique(items, itemIdKey, `$.${catalogLabel}`, errors);

  const declared = new Set(declaredRefs);
  const catalogIds = new Set(items.map((entry) => entry?.[itemIdKey]));
  for (const reference of declared) {
    if (!catalogIds.has(reference)) {
      errors.push(issue("bundle.catalog.missingItem", `$.${catalogLabel}`,
        `sequence declares '${reference}' but the catalog does not contain it`));
    }
  }
  for (const reference of catalogIds) {
    if (!declared.has(reference)) {
      errors.push(issue("bundle.catalog.undeclaredItem", `$.${catalogLabel}`,
        `catalog item '${reference}' is not declared by the sequence`));
    }
  }

  const beatsById = new Map(beats.map((beat) => [beat.beatId, beat]));
  items.forEach((entry, index) => {
    const itemId = entry?.[itemIdKey];
    const beat = beatsById.get(entry?.beatId);
    if (!beat) {
      errors.push(issue("bundle.catalog.unknownBeat",
        `$.${catalogLabel}[${index}].beatId`,
        `unknown beat '${entry?.beatId}' for '${itemId}'`));
    } else if (!(beat[beatRefKey] ?? []).includes(itemId)) {
      errors.push(issue("bundle.catalog.beatMismatch",
        `$.${catalogLabel}[${index}].beatId`,
        `'${itemId}' is assigned to '${entry.beatId}' but that beat does not reference it`));
    }

    for (const [sourceIndex, sourceRef] of
      (entry?.sourceRefs ?? []).entries()) {
      if (!sourceIds.has(sourceRef)) {
        errors.push(issue("bundle.source.unknown",
          `$.${catalogLabel}[${index}].sourceRefs[${sourceIndex}]`,
          `unknown source '${sourceRef}'`));
      }
    }
    for (const [claimIndex, claimRef] of
      (entry?.claimRefs ?? []).entries()) {
      if (!claimIds.has(claimRef)) {
        errors.push(issue("bundle.claim.unknown",
          `$.${catalogLabel}[${index}].claimRefs[${claimIndex}]`,
          `claim '${claimRef}' is not declared by sequence governance`));
      }
    }
    if ((entry?.sourceRefs?.length ?? 0) > 0) {
      const supportedClaims = new Set((entry.sourceRefs ?? [])
        .flatMap((sourceRef) => [...(sourceClaims.get(sourceRef) ?? [])]));
      for (const [claimIndex, claimRef] of
        (entry?.claimRefs ?? []).entries()) {
        if (sourceSupportedClaimIds.has(claimRef)
          && !supportedClaims.has(claimRef)) {
          errors.push(issue("bundle.claim.unsupportedByCitedSources",
            `$.${catalogLabel}[${index}].claimRefs[${claimIndex}]`,
            `claim '${claimRef}' is not supported by this item's cited sources`));
        }
      }
    }
  });
}

export function validateProductionBundleSemantics({
  sequence,
  radioCatalog,
  storyboardPlan,
  sourceRegister,
}) {
  const errors = [];
  const sequenceId = sequence?.sequenceId;
  const beats = sequence?.beats ?? [];
  const sourceRecords = sourceRegister?.sources ?? [];
  const sourceIds = new Set(sourceRecords.map((entry) => entry?.sourceId));
  const sourceClaims = new Map(sourceRecords.map((entry) => [
    entry?.sourceId,
    new Set(entry?.claimRefs ?? []),
  ]));
  const sourceSupportedClaimIds = new Set(sourceRecords
    .flatMap((entry) => entry?.claimRefs ?? []));
  const claimIds = new Set(sequence?.governance?.claimRefs ?? []);

  checkSequenceIdentity(radioCatalog, "radioCatalog", sequenceId, errors);
  checkSequenceIdentity(storyboardPlan, "storyboardPlan", sequenceId, errors);
  checkSequenceIdentity(sourceRegister, "sourceRegister", sequenceId, errors);

  checkUnique(sourceRecords, "sourceId", "$.sourceRegister.sources", errors);
  sourceRecords.forEach((source, sourceIndex) => {
    for (const [claimIndex, claimRef] of
      (source?.claimRefs ?? []).entries()) {
      if (!claimIds.has(claimRef)) {
        errors.push(issue("bundle.claim.unknown",
          `$.sourceRegister.sources[${sourceIndex}].claimRefs[${claimIndex}]`,
          `claim '${claimRef}' is not declared by sequence governance`));
      }
    }
  });

  checkCatalogClosure({
    catalogLabel: "radioCatalog.lines",
    declaredRefs: sequence?.referenceIndex?.lines ?? [],
    items: radioCatalog?.lines ?? [],
    itemIdKey: "lineId",
    beatRefKey: "lineRefs",
    beats,
    sourceIds,
    sourceClaims,
    sourceSupportedClaimIds,
    claimIds,
    errors,
  });

  const speakers = radioCatalog?.speakers ?? [];
  checkUnique(speakers, "speakerId", "$.radioCatalog.speakers", errors);
  const speakerIds = new Set(speakers.map((entry) => entry?.speakerId));
  (radioCatalog?.lines ?? []).forEach((line, index) => {
    if (!speakerIds.has(line?.speakerId)) {
      errors.push(issue("bundle.radio.unknownSpeaker",
        `$.radioCatalog.lines[${index}].speakerId`,
        `unknown speaker '${line?.speakerId}'`));
    }
  });

  checkCatalogClosure({
    catalogLabel: "storyboardPlan.frames",
    declaredRefs: sequence?.referenceIndex?.storyboardFrames ?? [],
    items: storyboardPlan?.frames ?? [],
    itemIdKey: "frameId",
    beatRefKey: "storyboardFrameRefs",
    beats,
    sourceIds,
    sourceClaims,
    sourceSupportedClaimIds,
    claimIds,
    errors,
  });

  return Object.freeze(errors);
}

export function validateSequenceSemantics(document) {
  const errors = [];
  const beats = document.beats ?? [];
  const cast = document.cast ?? [];
  const systems = document.requiredSystems ?? [];
  const workstreams = document.production?.workstreams ?? [];
  const tests = document.tests ?? [];

  checkUnique(beats, "beatId", "$.beats", errors);
  checkUnique(beats, "order", "$.beats", errors);
  checkUnique(cast, "characterId", "$.cast", errors);
  checkUnique(systems, "systemId", "$.requiredSystems", errors);
  checkUnique(workstreams, "workstreamId", "$.production.workstreams", errors);
  checkUnique(document.production?.gates ?? [], "gateId",
    "$.production.gates", errors);
  checkUnique(tests, "testId", "$.tests", errors);

  beats.forEach((beat, index) => {
    if (beat.order !== index + 1) {
      errors.push(issue("sequence.beat.order", `$.beats[${index}].order`,
        `expected contiguous order ${index + 1}, received ${beat.order}`));
    }
    if (document.mode === "fixed_history" && beat.requiredForProgression !== true) {
      errors.push(issue("sequence.fixedHistory.optionalBeat",
        `$.beats[${index}].requiredForProgression`,
        "every fixed-history beat must be required for progression"));
    }
    if (beat.historicalLabel !== "fiction"
      && (beat.claimRefs?.length ?? 0) === 0) {
      errors.push(issue("sequence.beat.unsourced",
        `$.beats[${index}].claimRefs`,
        "a non-fiction beat requires at least one declared claim"));
    }
    if (beat.requiredForProgression
      && beat.checkpoint?.policy !== "none"
      && !beat.checkpoint?.checkpointId) {
      errors.push(issue("sequence.checkpoint.missingId",
        `$.beats[${index}].checkpoint`,
        "a checkpoint policy requires a stable checkpointId"));
    }
    if (beat.checkpoint?.policy === "none"
      && beat.checkpoint?.checkpointId) {
      errors.push(issue("sequence.checkpoint.unusedId",
        `$.beats[${index}].checkpoint`,
        "checkpointId must be empty when policy is none"));
    }
  });

  const checkpoints = beats
    .map((beat) => beat.checkpoint?.checkpointId)
    .filter(Boolean);
  for (const duplicate of duplicateValues(checkpoints)) {
    errors.push(issue("sequence.checkpoint.duplicate", "$.beats",
      `duplicate checkpointId '${duplicate}'`));
  }

  const declaredClaims = new Set(document.governance?.claimRefs ?? []);
  const claimUsers = [
    ...cast.map((entry, index) => ({
      at: `$.cast[${index}].claimRefs`,
      refs: entry.claimRefs,
    })),
    ...beats.map((entry, index) => ({
      at: `$.beats[${index}].claimRefs`,
      refs: entry.claimRefs,
    })),
  ];
  for (const user of claimUsers) {
    for (const claimRef of user.refs ?? []) {
      if (!declaredClaims.has(claimRef)) {
        errors.push(issue("sequence.claim.undeclared", user.at,
          `claim '${claimRef}' is not declared by $.governance.claimRefs`));
      }
    }
  }

  checkReferenceClosure(document, errors);

  const duration = document.targetDurationMinutes ?? {};
  if (!(duration.minimum <= duration.nominal
    && duration.nominal <= duration.maximum)) {
    errors.push(issue("sequence.duration.order", "$.targetDurationMinutes",
      "duration must satisfy minimum <= nominal <= maximum"));
  }

  checkWorkstreamGraph(workstreams, errors);
  return Object.freeze(errors);
}

export async function validateSequenceFile(file, schemas = null) {
  const resolvedSchemas = schemas ?? await loadSchemas(DIRECTORY);
  const schemaRecord = resolvedSchemas.byId.get(SCHEMA_ID);
  if (!schemaRecord) {
    throw new Error(`Playable sequence schema not found: ${SCHEMA_ID}`);
  }
  const document = JSON.parse(await readFile(file, "utf8"));
  return Object.freeze({
    file,
    document,
    errors: Object.freeze([
      ...validateSchema(document, schemaRecord, resolvedSchemas),
      ...validateSequenceSemantics(document),
    ]),
  });
}

export async function validateProductionBundle(
  directory = DIRECTORY,
  schemas = null,
) {
  const sequenceFile = path.join(directory, CANONICAL_SEQUENCE);
  const sequenceResult = await validateSequenceFile(sequenceFile, schemas);
  const entries = await Promise.all(Object.entries(COMPANION_FILES)
    .map(async ([key, filename]) => [
      key,
      JSON.parse(await readFile(path.join(directory, filename), "utf8")),
    ]));
  const companions = Object.fromEntries(entries);
  const errors = [
    ...sequenceResult.errors,
    ...validateProductionBundleSemantics({
      sequence: sequenceResult.document,
      ...companions,
    }),
  ];
  return Object.freeze({
    directory,
    sequence: sequenceResult.document,
    ...companions,
    errors: Object.freeze(errors),
  });
}

async function main() {
  const schemas = await loadSchemas(DIRECTORY);
  const requested = process.argv.slice(2);
  if (requested.length === 0) {
    const result = await validateProductionBundle(DIRECTORY, schemas);
    if (result.errors.length === 0) {
      console.log(
        "narrative-bundle: ok"
        + ` — ${result.sequence.beats.length} beats`
        + ` · ${result.radioCatalog.lines.length} radio lines`
        + ` · ${result.storyboardPlan.frames.length} storyboard frames`
        + ` · ${result.sourceRegister.sources.length} source records`
        + ` · ${result.sequence.tests.length} proofs`,
      );
      return;
    }
    console.error("narrative-bundle: failed");
    for (const error of result.errors) {
      console.error(`  ${error.code} ${error.path}: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const files = requested.map((entry) => path.resolve(entry));

  let failed = false;
  for (const file of files) {
    const result = await validateSequenceFile(file, schemas);
    if (result.errors.length === 0) {
      console.log(
        `narrative-sequence: ok — ${path.relative(process.cwd(), file)}`
        + ` · ${result.document.beats.length} beats`
        + ` · ${result.document.requiredSystems.length} systems`
        + ` · ${result.document.tests.length} proofs`,
      );
      continue;
    }
    failed = true;
    console.error(`narrative-sequence: failed — ${path.relative(process.cwd(), file)}`);
    for (const error of result.errors) {
      console.error(`  ${error.code} ${error.path}: ${error.message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

const invoked = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) await main();
