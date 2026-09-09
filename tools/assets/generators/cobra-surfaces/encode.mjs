// Re-encode retained generated material art without invoking an image generator.
// Usage: node tools/assets/generators/cobra-surfaces/encode.mjs [--check]
// cwebp 1.6.0 is the reviewed encoder. Only resampling and WebP encoding occur here.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const assets = [
  { name: "limestone-generated-v1", quality: 86 },
  { name: "canopy-generated-v1", quality: 84 },
];
const argv = process.argv.slice(2);
if (argv.some((arg) => arg !== "--check")) throw new Error("Only --check is supported");
const check = argv.includes("--check");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const scratch = await mkdtemp(path.join(tmpdir(), "cobra-surfaces-"));
try {
  for (const { name, quality } of assets) {
    const source = path.join(root, `tools/assets/generators/cobra-surfaces/sources/${name}.png`);
    const destinations = [
      `content/packs/cobra-vietnam/environment/surfaces/${name}.webp`,
      `web/wwwroot/content/packs/cobra-vietnam/environment/surfaces/${name}.webp`,
    ];
    const output = path.join(scratch, `${name}.webp`);
    execFileSync("cwebp", ["-q", String(quality), "-resize", "1024", "1024", "-m", "6",
      "-sharp_yuv", source, "-o", output], { stdio: "ignore" });
    const bytes = await readFile(output);
    for (const relative of destinations) {
      const destination = path.join(root, relative);
      if (check) {
        if (!(await readFile(destination)).equals(bytes)) {
          throw new Error(`${relative} does not match the retained source and encoder recipe`);
        }
      } else {
        await writeFile(destination, bytes);
      }
    }
    const original = await readFile(source);
    console.log(JSON.stringify({
      action: check ? "verified" : "encoded",
      name,
      source: { bytes: original.length, sha256: digest(original) },
      runtime: { width: 1024, height: 1024, bytes: bytes.length, sha256: digest(bytes) },
      destinations,
    }, null, 2));
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
