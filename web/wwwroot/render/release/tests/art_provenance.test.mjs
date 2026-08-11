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
  "jet-f14.webp": "jet-f14.svg",
  "jet-f22.webp": "jet-f22.svg",
  "jet-mig-28.webp": "jet-mig-28.svg",
  "jet-rapier.webp": "jet-rapier.svg",
  "menu-hangar-small.webp": "menu-hangar.svg",
  "menu-hangar.webp": "menu-hangar.svg",
};

test("every production shell painting has a hash-pinned fiction provenance card", async () => {
  const sources = await readFile(path.join(ART_ROOT, "SOURCES.md"), "utf8");
  assert.match(sources, /Epistemic label: `fiction`/);
  assert.match(sources, /image-generation[\s\S]*?unknown/i,
    "missing historical generator metadata must stay explicit rather than being guessed");

  const files = (await readdir(ART_ROOT))
    .filter((file) => file.endsWith(".webp"))
    .sort();
  assert.deepEqual(files, [
    "bike-yzf-r1.webp",
    "jet-cobra.webp",
    "jet-f14.webp",
    "jet-f22.webp",
    "jet-mig-28.webp",
    "jet-rapier.webp",
    "menu-hangar-small.webp",
    "menu-hangar.webp",
  ]);

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

// The v1/v2 records could not name their generator or quote their prompt. The current set closes
// that gap by being reproducible from committed source instead, so the source has to be there.
test("every current shell poster is reproducible from a committed SVG source", async () => {
  const sources = await readFile(path.join(ART_ROOT, "SOURCES.md"), "utf8");
  assert.match(sources, /no image-generation model was used/i,
    "the current set claims a deterministic pipeline; that claim must be stated, not implied");

  const svgs = new Set((await readdir(POSTER_SOURCE_ROOT)).filter((f) => f.endsWith(".svg")));
  const renderer = await readFile(path.join(POSTER_SOURCE_ROOT, "render.mjs"), "utf8");
  const produced = (await readdir(ART_ROOT))
    .filter((file) => file.endsWith(".webp"))
    .sort();
  assert.deepEqual(Object.keys(POSTER_SOURCES).sort(), produced,
    "every shipped shell WebP must be bound to an exact committed source");

  for (const [webp, svg] of Object.entries(POSTER_SOURCES)) {
    assert.ok(svgs.has(svg), `${webp} must have its source ${svg} committed`);
    assert.ok(renderer.includes(`"${webp.replace(/\.webp$/, "")}"`),
      `${webp} must be listed in the poster renderer`);
  }
  assert.match(renderer, /"jet-f14"[\s\S]*?rasterizer: "deterministic-svg"/);
  assert.match(renderer, /"jet-mig-28"[\s\S]*?rasterizer: "deterministic-svg"/);
  assert.match(sources, /replacement source-of-record, not a reconstruction/i);
});
