#!/usr/bin/env node
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "../../../hud/tests/harness/static_server.mjs";

const require = createRequire(
  new URL("../../../../../smoke/package.json", import.meta.url),
);
const { chromium } = require("playwright");

const WWWROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const OUT_DIR = resolve(
  process.env.COBRA_HUD_SHOT_DIR
    ?? join(process.cwd(), "evidence/cobra-hud-2026-11-05"),
);

async function writeDataUrlPng(dataUrl, filePath) {
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) {
    throw new Error(`expected a PNG data URL for ${filePath}`);
  }
  await writeFile(filePath, Buffer.from(dataUrl.slice(prefix.length), "base64"));
  return (await stat(filePath)).size;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const site = await serveStatic(WWWROOT);
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (const scheme of ["dark", "light"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(
        `${site.url}render/cobra/tests/harness/harness.html?scheme=${scheme}`,
        { waitUntil: "load", timeout: 30_000 },
      );
      await page.waitForFunction(() => window.__cobraHudReady === true, { timeout: 15_000 });
      const dataUrl = await page.evaluate(() => window.__cobraHudPng());
      const filePath = join(OUT_DIR, `battle-${scheme}.png`);
      const size = await writeDataUrlPng(dataUrl, filePath);
      console.log(`ok ${filePath} (${size} bytes)`);
      await page.close();
    }
  } finally {
    await browser.close();
    await site.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
