// Front-door poster renderer.
//
// The aircraft picker and loading cover are the first thing a visitor sees, so they must read as
// an idealised version of the game's OWN look: flat-shaded planes, no texture, no outlines, a
// single smooth sky gradient behind hard-edged geometry. These posters are therefore authored as
// deterministic SVG in this directory and rasterised here -- there is no image-generation model in
// the loop, and no third-party asset is embedded.
//
// Usage:
//   PATH="$HOME/.nvm/versions/node/v24.18.1/bin:/opt/homebrew/bin:$PATH" \
//     node tools/assets/generators/menu-posters/render.mjs [name ...]
//
// Writes web/wwwroot/art/<name>.webp for every <name>.svg listed in POSTERS (or the subset named
// on the command line), then prints the byte size and SHA-256 of each so art/SOURCES.md can be
// kept honest.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/Users/iantodd/Projects/guns-only/web/smoke/package.json");
const { chromium } = require("playwright");

const HERE = fileURLToPath(new URL("./", import.meta.url));
const ART_DIR = fileURLToPath(new URL("../../../../web/wwwroot/art/", import.meta.url));

// name -> { w, h, q, src? }. Picker cards are 9:16 because the desktop card is a tall poster
// (height min(58vh,46vw) over a quarter-width column) while the phone card is 16:10; a 9:16
// master survives both cover-crops as long as the subject stays in the middle band.
// `src` aliases a different source SVG: the small loading cover is the same 3:2 picture at a
// smaller size, so it is rendered from the same file rather than a copy that can drift.
const POSTERS = {
  "jet-f22": { w: 900, h: 1600, q: 82 },
  "jet-rapier": { w: 900, h: 1600, q: 82 },
  "jet-cobra": { w: 900, h: 1600, q: 82 },
  "bike-yzf-r1": { w: 900, h: 1600, q: 82 },
  "menu-hangar": { w: 1600, h: 1067, q: 82 },
  "menu-hangar-small": { w: 900, h: 600, q: 80, src: "menu-hangar" },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(POSTERS);
const unknown = wanted.filter((name) => !(name in POSTERS));
if (unknown.length) throw new Error(`unknown poster(s): ${unknown.join(", ")}`);

const sourceOf = (name) => POSTERS[name].src ?? name;
const available = new Set((await readdir(HERE)).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)));
const missing = wanted.filter((name) => !available.has(sourceOf(name)));
if (missing.length)
  throw new Error(`missing source SVG(s): ${missing.map(sourceOf).join(", ")}`);

const scratch = await mkdtemp(path.join(tmpdir(), "menu-posters-"));
const browser = await chromium.launch();
try {
  for (const name of wanted) {
    const { w: width, h: height, q: quality } = POSTERS[name];
    const svg = await readFile(path.join(HERE, `${sourceOf(name)}.svg`), "utf8");
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}` +
      `svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
      { waitUntil: "load" });
    const png = path.join(scratch, `${name}.png`);
    await page.screenshot({ path: png, type: "png" });
    await page.close();

    const webp = path.join(ART_DIR, `${name}.webp`);
    // -resize back to the master size: the 2x capture is supersampling, which is how flat-shaded
    // vector edges keep their crispness without shipping a 2x file.
    execFileSync("cwebp", ["-q", String(quality), "-resize", String(width), String(height),
      "-m", "6", "-sharp_yuv", png, "-o", webp], { stdio: "ignore" });

    const bytes = await readFile(webp);
    const size = (await stat(webp)).size;
    const digest = createHash("sha256").update(bytes).digest("hex");
    console.log(`${name}.webp  ${width}x${height}  ${(size / 1024).toFixed(1)} KiB  ${digest}`);
  }
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}
