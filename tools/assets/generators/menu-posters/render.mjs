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
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePngRgba } from "../png.mjs";
import { renderSvgRgba } from "./svg_raster.mjs";

const HERE = fileURLToPath(new URL("./", import.meta.url));
const ART_DIR = fileURLToPath(new URL("../../../../web/wwwroot/art/", import.meta.url));
const WEB_SMOKE_PACKAGE = fileURLToPath(
  new URL("../../../../web/smoke/package.json", import.meta.url));
const requireFromSmoke = createRequire(WEB_SMOKE_PACKAGE);

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
  // Top Gun's replacement sources use the repo's bounded deterministic SVG-subset rasterizer.
  // Keeping that path browser-free makes these two cards reproducible during headless release QA.
  "jet-f14": { w: 900, h: 900, q: 82, rasterizer: "deterministic-svg" },
  "jet-mig-28": { w: 900, h: 900, q: 82, rasterizer: "deterministic-svg" },
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
let browser = null;
const playwrightBrowser = async () => {
  if (browser) return browser;
  const { chromium } = requireFromSmoke("playwright");
  browser = await chromium.launch();
  return browser;
};
try {
  for (const name of wanted) {
    const { w: width, h: height, q: quality, rasterizer } = POSTERS[name];
    const svgPath = path.join(HERE, `${sourceOf(name)}.svg`);
    const png = path.join(scratch, `${name}.png`);
    if (rasterizer === "deterministic-svg") {
      const svg = await readFile(svgPath, "utf8");
      const rgba = renderSvgRgba(svg, width * 2, height * 2);
      await writeFile(png, encodePngRgba(width * 2, height * 2, rgba));
    } else {
      const svg = await readFile(svgPath, "utf8");
      const activeBrowser = await playwrightBrowser();
      const page = await activeBrowser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 2,
      });
      await page.setContent(
        `<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}` +
        `svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
        { waitUntil: "load" });
      await page.screenshot({ path: png, type: "png" });
      await page.close();
    }

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
  await browser?.close();
  await rm(scratch, { recursive: true, force: true });
}
