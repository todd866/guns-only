import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ART_ROOT = fileURLToPath(new URL("../../../art/", import.meta.url));
const POSTER_SOURCE_ROOT = fileURLToPath(
  new URL("../../../../../tools/assets/generators/menu-posters/", import.meta.url));

// name -> the committed SVG it is rasterised from. The small loading cover is the same 3:2
// picture at a smaller size, so it shares a source rather than keeping a copy that can drift.
const POSTER_SOURCES = {
  "bike-yzf-r1.webp": "bike-yzf-r1.svg",
  "jet-cobra.webp": "jet-cobra.svg",
  "jet-f22.webp": "jet-f22.svg",
  "jet-rapier.webp": "jet-rapier.svg",
  "menu-hangar-small.webp": "menu-hangar.svg",
  "menu-hangar.webp": "menu-hangar.svg",
};
const CURRENT_PAINTED_POSTERS = [
  "bike-yzf-r1-v2.webp",
  "jet-cobra-v2.webp",
  "jet-f22-v2.webp",
  "jet-rapier-v2.webp",
];

test("every production shell painting has a hash-pinned fiction provenance card", async () => {
  const sources = await readFile(path.join(ART_ROOT, "SOURCES.md"), "utf8");
  assert.match(sources, /Epistemic label: `fiction`/);
  assert.match(sources, /image-generation[\s\S]*?unknown/i,
    "missing historical generator metadata must stay explicit rather than being guessed");

  const files = (await readdir(ART_ROOT))
    .filter((file) => file.endsWith(".webp"))
    .sort();
  assert.deepEqual(files, [
    ...CURRENT_PAINTED_POSTERS,
    "bike-yzf-r1.webp",
    "jet-cobra.webp",
    "jet-f22.webp",
    "jet-rapier.webp",
    "menu-hangar-small.webp",
    "menu-hangar.webp",
  ].sort());

  for (const file of files) {
    const bytes = await readFile(path.join(ART_ROOT, file));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const row = sources.split("\n").find((line) => line.includes(`| \`${file}\``));
    assert.ok(row, `${file} must have a row in art/SOURCES.md`);
    assert.equal(row.includes(`\`${digest}\``), true,
      `${file} must have its exact SHA-256 in art/SOURCES.md`);
    assert.equal(row.includes(`| ${bytes.length} |`), true,
      `${file} must have its exact byte count in art/SOURCES.md`);
  }
});

test("the wordless production picker consumes the current painted set", async () => {
  const [index, sources] = await Promise.all([
    readFile(new URL("../../../index.html", import.meta.url), "utf8"),
    readFile(path.join(ART_ROOT, "SOURCES.md"), "utf8"),
  ]);

  for (const file of CURRENT_PAINTED_POSTERS) {
    assert.match(index, new RegExp(`art/${file.replace(".", "\\.")}`),
      `${file} must be wired into the production picker`);
    assert.ok(sources.includes(`| \`${file}\``),
      `${file} must have a provenance closure row`);
  }
  assert.doesNotMatch(index, /sortie-choice[^}]*jet-(?:f22|rapier|cobra)\.webp/,
    "production picker must not silently fall back to the superseded vector aircraft posters");
});

// The retained v3 vector set claims deterministic reproduction from committed source. Its two
// hangar fills remain current and its four superseded picker cards remain an auditable input to v4.
test("every retained deterministic v3 poster is reproducible from committed SVG", async () => {
  const sources = await readFile(path.join(ART_ROOT, "SOURCES.md"), "utf8");
  assert.match(sources, /no image-generation model was used/i,
    "the current set claims a deterministic pipeline; that claim must be stated, not implied");

  const svgs = new Set((await readdir(POSTER_SOURCE_ROOT)).filter((f) => f.endsWith(".svg")));
  const renderer = await readFile(path.join(POSTER_SOURCE_ROOT, "render.mjs"), "utf8");

  for (const [webp, svg] of Object.entries(POSTER_SOURCES)) {
    assert.ok(svgs.has(svg), `${webp} must have its source ${svg} committed`);
    assert.ok(renderer.includes(`"${webp.replace(/\.webp$/, "")}"`),
      `${webp} must be listed in the poster renderer`);
  }
});
