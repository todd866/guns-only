import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ART_ROOT = fileURLToPath(new URL("../../../art/", import.meta.url));

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
    "jet-f22.webp",
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
  }
});
