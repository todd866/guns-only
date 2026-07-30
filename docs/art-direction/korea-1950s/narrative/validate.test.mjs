import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateProductionBundle,
  validateProductionBundleSemantics,
  validateSequenceFile,
  validateSequenceSemantics,
} from "./validate.mjs";

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SEQUENCE = path.join(DIRECTORY, "armstrong-ejection.sequence.json");
const RADIO = path.join(DIRECTORY, "radio-lines.json");
const STORYBOARD = path.join(DIRECTORY, "storyboard-plan.json");
const SOURCES = path.join(DIRECTORY, "source-register.json");

async function sequenceDocument() {
  return JSON.parse(await readFile(SEQUENCE, "utf8"));
}

async function productionBundle() {
  const [sequence, radioCatalog, storyboardPlan, sourceRegister] =
    await Promise.all([
      readFile(SEQUENCE, "utf8"),
      readFile(RADIO, "utf8"),
      readFile(STORYBOARD, "utf8"),
      readFile(SOURCES, "utf8"),
    ]);
  return {
    sequence: JSON.parse(sequence),
    radioCatalog: JSON.parse(radioCatalog),
    storyboardPlan: JSON.parse(storyboardPlan),
    sourceRegister: JSON.parse(sourceRegister),
  };
}

test("Armstrong playable sequence passes schema and semantic validation", async () => {
  const result = await validateSequenceFile(SEQUENCE);
  assert.deepEqual(result.errors, []);
  assert.equal(result.document.mode, "fixed_history");
  assert.equal(result.document.beats.length, 12);
});

test("fixed-history sequences cannot make a plot beat optional", async () => {
  const document = await sequenceDocument();
  document.beats[4].requiredForProgression = false;
  const errors = validateSequenceSemantics(document);
  assert.equal(errors.some((entry) =>
    entry.code === "sequence.fixedHistory.optionalBeat"), true);
});

test("beat and cast claims must be declared by sequence governance", async () => {
  const document = await sequenceDocument();
  document.beats[0].claimRefs.push("claim.unregistered.v1");
  const errors = validateSequenceSemantics(document);
  assert.equal(errors.some((entry) =>
    entry.code === "sequence.claim.undeclared"), true);
});

test("production dependencies must remain acyclic", async () => {
  const document = await sequenceDocument();
  const research = document.production.workstreams.find((entry) =>
    entry.workstreamId === "research");
  research.dependsOn.push("release");
  const errors = validateSequenceSemantics(document);
  assert.equal(errors.some((entry) =>
    entry.code === "sequence.production.dependencyCycle"), true);
});

test("beat references must close against the sequence reference index", async () => {
  const document = await sequenceDocument();
  document.referenceIndex.cues =
    document.referenceIndex.cues.filter((entry) =>
      entry !== "cue.cable-physical-visibility.v1");
  const errors = validateSequenceSemantics(document);
  assert.equal(errors.some((entry) =>
    entry.code === "sequence.reference.undeclared"), true);
});

test("Armstrong production bundle closes lines, boards and sources", async () => {
  const result = await validateProductionBundle(DIRECTORY);
  assert.deepEqual(result.errors, []);
  assert.equal(result.radioCatalog.lines.length, 15);
  assert.equal(result.storyboardPlan.frames.length, 12);
  assert.equal(result.sourceRegister.sources.length, 12);
});

test("radio lines cannot cite an unknown source", async () => {
  const bundle = await productionBundle();
  bundle.radioCatalog.lines[0].sourceRefs.push("source.unknown.v1");
  const errors = validateProductionBundleSemantics(bundle);
  assert.equal(errors.some((entry) =>
    entry.code === "bundle.source.unknown"), true);
});

test("radio lines must be assigned to their referencing beat", async () => {
  const bundle = await productionBundle();
  bundle.radioCatalog.lines[0].beatId =
    "beat.armstrong.03-valley-ingress.v1";
  const errors = validateProductionBundleSemantics(bundle);
  assert.equal(errors.some((entry) =>
    entry.code === "bundle.catalog.beatMismatch"), true);
});

test("storyboard catalog must contain every declared frame", async () => {
  const bundle = await productionBundle();
  bundle.storyboardPlan.frames.pop();
  const errors = validateProductionBundleSemantics(bundle);
  assert.equal(errors.some((entry) =>
    entry.code === "bundle.catalog.missingItem"), true);
});

test("a catalog claim must be supported by its cited source set", async () => {
  const bundle = await productionBundle();
  const line = bundle.radioCatalog.lines.find((entry) =>
    entry.sourceRefs.length > 0 && entry.claimRefs.length > 0);
  const claimRef = line.claimRefs[0];
  for (const sourceRef of line.sourceRefs) {
    const source = bundle.sourceRegister.sources.find((entry) =>
      entry.sourceId === sourceRef);
    source.claimRefs = (source.claimRefs ?? []).filter((entry) =>
      entry !== claimRef);
  }
  const errors = validateProductionBundleSemantics(bundle);
  assert.equal(errors.some((entry) =>
    entry.code === "bundle.claim.unsupportedByCitedSources"), true);
});
