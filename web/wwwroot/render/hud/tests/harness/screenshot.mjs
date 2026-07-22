#!/usr/bin/env node
// Renders every deterministic HUD scenario (scenarios.js) through the real hud.js in headless
// Chromium and writes one PNG per scenario plus a contact sheet. This is the missing "look at the
// pixels" gate: structural tests stay green while the funnel is visually broken; these files are
// what a reviewer actually inspects.
//
// Usage:
//   node web/wwwroot/render/hud/tests/harness/screenshot.mjs
//   HUD_SHOT_DIR=/tmp/hud-shots node web/wwwroot/render/hud/tests/harness/screenshot.mjs
//
// Playwright is reused from the existing web/smoke install (it is a devDependency there); the
// static server mirrors web/smoke/smoke.test.mjs.

import { mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "./static_server.mjs";

const require = createRequire(
  new URL("../../../../../smoke/package.json", import.meta.url),
);
const { chromium } = require("playwright");

const WWWROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const OUT_DIR = resolve(process.env.HUD_SHOT_DIR ?? join(process.cwd(), "hud-shots"));
const MIN_BYTES = 10 * 1024;

async function writeDataUrlPng(dataUrl, filePath) {
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) {
    throw new Error(`expected a PNG data URL for ${filePath}`);
  }
  await writeFile(filePath, Buffer.from(dataUrl.slice(prefix.length), "base64"));
  const info = await stat(filePath);
  return info.size;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const site = await serveStatic(WWWROOT);
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const written = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1020 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));

    await page.goto(`${site.url}render/hud/tests/harness/harness.html?all=1`, {
      waitUntil: "load",
      timeout: 30000,
    });
    await page.waitForFunction(() => window.__hudReady === "harness", { timeout: 15000 });

    const names = await page.evaluate(() => window.__scenarioNames);
    if (!Array.isArray(names) || names.length === 0) {
      throw new Error("harness exposed no scenarios");
    }

    for (const name of names) {
      const dataUrl = await page.evaluate(
        (scenario) => window.__renderScenario(scenario).then(() => window.__composedPng()),
        name,
      );
      const filePath = join(OUT_DIR, `${name}.png`);
      const size = await writeDataUrlPng(dataUrl, filePath);
      const ok = size > MIN_BYTES;
      if (!ok) failures.push(`${name}.png is only ${size} bytes (blank render?)`);
      written.push({ filePath, size, ok });
      console.log(`${ok ? "ok " : "BAD"} ${filePath} (${size} bytes)`);
    }

    const sheetUrl = await page.evaluate(() => window.__contactSheetPng());
    const sheetPath = join(OUT_DIR, "_contact-sheet.png");
    const sheetSize = await writeDataUrlPng(sheetUrl, sheetPath);
    written.push({ filePath: sheetPath, size: sheetSize, ok: sheetSize > MIN_BYTES });
    console.log(`ok  ${sheetPath} (${sheetSize} bytes)`);

    if (pageErrors.length > 0) {
      failures.push(`uncaught page errors:\n${pageErrors.join("\n")}`);
    }
  } finally {
    await browser.close();
    await site.close();
  }

  if (failures.length > 0) {
    console.error(`\nHUD screenshot run FAILED:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`\n${written.length} PNGs written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
