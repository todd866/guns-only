import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import {
  encodeSolidPng,
  extractFeaturesFromBuffer,
  paletteDistance,
  structureDistance,
} from "../features.mjs";
import { loadCorpus } from "../corpus.mjs";

async function fixtureCorpus(t) {
  const dir = join(tmpdir(), `look-gate-corpus-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "index.json"), JSON.stringify({
    refs: [{
      id: "no-mans-land-mood-v1",
      file: "no-mans-land-mood-v1.png",
      epistemic: "fiction",
    }],
  }));
  const png = new PNG({ width: 256, height: 256 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const ground = y >= 110;
      const ridge = ground && ((x + Math.floor(y / 5) * 7) % 31 < 5);
      png.data[offset] = ground ? (ridge ? 84 : 142) : 116;
      png.data[offset + 1] = ground ? (ridge ? 91 : 133) : 156;
      png.data[offset + 2] = ground ? (ridge ? 45 : 66) : 188;
      png.data[offset + 3] = 255;
    }
  }
  await writeFile(join(dir, "no-mans-land-mood-v1.png"), PNG.sync.write(png));
  return dir;
}

test("solid flat field has near-zero ground edge energy", () => {
  const png = encodeSolidPng(64, 64, [140, 150, 90]);
  const features = extractFeaturesFromBuffer(png);
  assert.ok(features.groundEdgeEnergy < 0.5,
    `expected flat field, got edge ${features.groundEdgeEnergy}`);
  assert.ok(features.groundLaplacianVariance < 1);
});

test("corpus mood ref has warmer ground Lab b than cool blue field", async (t) => {
  const corpus = await loadCorpus("fixture", { dir: await fixtureCorpus(t) });
  assert.ok(corpus.byId["no-mans-land-mood-v1"]);
  const ref = corpus.byId["no-mans-land-mood-v1"].features;
  const cool = extractFeaturesFromBuffer(encodeSolidPng(128, 128, [40, 80, 160]));
  assert.ok(ref.groundLabB > cool.groundLabB,
    `ref ground b=${ref.groundLabB} should beat cool blue ${cool.groundLabB}`);
});

test("flat SNES-like capture is far in structure from soft-world ref", async (t) => {
  const corpus = await loadCorpus("fixture", { dir: await fixtureCorpus(t) });
  const ref = corpus.byId["no-mans-land-mood-v1"].features;
  const flat = extractFeaturesFromBuffer(encodeSolidPng(256, 256, [120, 140, 80]));
  const structure = structureDistance(flat, ref);
  const palette = paletteDistance(flat, ref);
  assert.ok(structure > 1.0 || flat.groundEdgeEnergy < 1.0,
    `flat field must look structurally empty vs corpus (structure=${structure}, edge=${flat.groundEdgeEnergy})`);
  assert.ok(Number.isFinite(palette));
});

test("loadCorpus rejects missing binaries unless allowed", async (t) => {
  const dir = join(tmpdir(), `look-gate-missing-${process.pid}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "index.json"), JSON.stringify({
    refs: [{
      id: "ghost",
      file: "ghost.png",
      epistemic: "fiction",
    }],
  }));
  await assert.rejects(
    () => loadCorpus("fixture", { dir }),
    /Missing corpus binary for ghost/u,
  );
  const corpus = await loadCorpus("fixture", { dir, allowMissing: true });
  assert.equal(corpus.refs.length, 0);
  assert.deepEqual(corpus.missing, ["ghost"]);
});
