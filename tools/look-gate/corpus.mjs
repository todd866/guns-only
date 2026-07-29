/// Load fiction-tagged soft-world corpus features from analysis/art-refs.

import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractFeaturesFromFile } from "./features.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");

export const DEFAULT_CAPTURE_REFS = Object.freeze({
  "steppe-low": Object.freeze(["no-mans-land-mood-v1"]),
  "corridor-mid": Object.freeze(["no-mans-land-mood-v1"]),
  "high-oblique": Object.freeze(["no-mans-land-mood-v1"]),
});

export function corpusDir(name = "soft-world") {
  return join(REPO_ROOT, "analysis/art-refs", name);
}

export async function loadCorpus(name = "soft-world", opts = {}) {
  const dir = corpusDir(name);
  const indexPath = join(dir, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const refs = [];
  const missing = [];
  for (const card of index.refs ?? []) {
    if (card.epistemic && card.epistemic !== "fiction") {
      throw new Error(`Corpus ref ${card.id} must be epistemic fiction (got ${card.epistemic})`);
    }
    const filePath = join(dir, card.file);
    try {
      await access(filePath);
    } catch {
      missing.push(card.id);
      if (!opts.allowMissing) {
        throw new Error(
          `Missing corpus binary for ${card.id}: ${filePath} `
          + "(set GUNS_LOOK_GATE_ALLOW_MISSING=1 to skip)",
        );
      }
      continue;
    }
    const features = await extractFeaturesFromFile(filePath);
    refs.push(Object.freeze({
      id: card.id,
      file: card.file,
      path: filePath,
      features,
      card,
    }));
  }
  return Object.freeze({
    name,
    dir,
    index,
    refs,
    missing,
    byId: Object.freeze(Object.fromEntries(refs.map((r) => [r.id, r]))),
  });
}
