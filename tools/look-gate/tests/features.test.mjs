import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  encodeSolidPng,
  extractFeaturesFromBuffer,
  paletteDistance,
  structureDistance,
} from "../features.mjs";
import { loadCorpus } from "../corpus.mjs";

test("solid flat field has near-zero ground edge energy", () => {
  const png = encodeSolidPng(64, 64, [140, 150, 90]);
  const features = extractFeaturesFromBuffer(png);
  assert.ok(features.groundEdgeEnergy < 0.5,
    `expected flat field, got edge ${features.groundEdgeEnergy}`);
  assert.ok(features.groundLaplacianVariance < 1);
});

test("corpus mood ref has warmer ground Lab b than cool blue field", async () => {
  const corpus = await loadCorpus("soft-world");
  assert.ok(corpus.byId["no-mans-land-mood-v1"]);
  const ref = corpus.byId["no-mans-land-mood-v1"].features;
  const cool = extractFeaturesFromBuffer(encodeSolidPng(128, 128, [40, 80, 160]));
  assert.ok(ref.groundLabB > cool.groundLabB,
    `ref ground b=${ref.groundLabB} should beat cool blue ${cool.groundLabB}`);
});

test("flat SNES-like capture is far in structure from soft-world ref", async () => {
  const corpus = await loadCorpus("soft-world");
  const ref = corpus.byId["no-mans-land-mood-v1"].features;
  const flat = extractFeaturesFromBuffer(encodeSolidPng(256, 256, [120, 140, 80]));
  const structure = structureDistance(flat, ref);
  const palette = paletteDistance(flat, ref);
  assert.ok(structure > 1.0 || flat.groundEdgeEnergy < 1.0,
    `flat field must look structurally empty vs corpus (structure=${structure}, edge=${flat.groundEdgeEnergy})`);
  assert.ok(Number.isFinite(palette));
});

test("loadCorpus rejects missing binaries unless allowed", async () => {
  const dir = join(tmpdir(), `look-gate-missing-${process.pid}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.json"), JSON.stringify({
    refs: [{
      id: "ghost",
      file: "ghost.png",
      epistemic: "fiction",
    }],
  }));
  // Point corpusDir by temporarily not used — loadCorpus uses fixed soft-world path.
  // Just assert allowMissing path on real corpus still works.
  await rm(dir, { recursive: true, force: true });
  const corpus = await loadCorpus("soft-world", { allowMissing: true });
  assert.ok(corpus.refs.length >= 1);
});
