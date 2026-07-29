// ANCA panel visual-doctrine probe: boots the PUBLISHED app headless, drives a Rapier
// intercept sortie into panel-relevant states, and saves PNGs for human review. Pixels are
// the gate — structural green is not sufficient (memory: hud-visual-verification).
//
// Usage:
//   dotnet publish web/GunsOnly.Web.csproj -c Release -o /tmp/guns-only-web ...  # fresh!
//   ANCA_LOOK_DIR=/path/to/out node tools/anca-look/shot.mjs
import { createRequire } from "node:module";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";

const require = createRequire(new URL("../../web/smoke/package.json", import.meta.url));
const { chromium } = require("playwright");

const WWWROOT = process.env.ANCA_LOOK_WWWROOT ?? "/tmp/guns-only-web/wwwroot";
const OUT_DIR = process.env.ANCA_LOOK_DIR ?? "./anca-shots";
const MIN_PNG_BYTES = 40 * 1024;
const QUERY = "?audioQa=silent&server=off&program=rapier-intercept";

const pageErrors = [];

async function bootSortie(page, url) {
  page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector("#boot")?.classList.contains("ready") === true,
    undefined, { timeout: 90000 });
  // rapier-intercept auto-launches; the click is the fallback when the ready screen holds.
  await page.waitForFunction(() => {
    const active = globalThis.__gunsState?.session_phase === "ACTIVE"
      && !document.documentElement.classList.contains("run-paused");
    const start = document.querySelector("#ready-start");
    const resumable = document.querySelector("#ready-screen")?.classList.contains("visible")
      && start?.disabled === false;
    return active || resumable;
  }, undefined, { timeout: 90000 });
  const alreadyActive = await page.evaluate(() =>
    globalThis.__gunsState?.session_phase === "ACTIVE"
      && !document.documentElement.classList.contains("run-paused"));
  if (!alreadyActive) await page.locator("#ready-start").click();
  await page.waitForFunction(() =>
    globalThis.__gunsState?.session_phase === "ACTIVE"
      && !document.documentElement.classList.contains("run-paused"),
  undefined, { timeout: 90000 });
  await page.waitForFunction(
    () => globalThis.__gunsState?.checklist_active === true,
    undefined, { timeout: 90000 });
}

async function shoot(page, name) {
  const filePath = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, type: "png" });
  const size = (await stat(filePath)).size;
  if (size < MIN_PNG_BYTES)
    throw new Error(`${name}: PNG is only ${size} bytes (blank render?)`);
  console.log(`${name}.png  ${(size / 1024).toFixed(0)} KiB`);
}

await mkdir(OUT_DIR, { recursive: true });
const site = await serveStatic(WWWROOT);
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  // Desktop: full four-row panel.
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await bootSortie(desktop, `${site.url}${QUERY}`);
  await shoot(desktop, "desktop-panel");

  // Desktop with a live call: the launch sequence talks within the first minute.
  await desktop.waitForFunction(
    () => globalThis.__gunsState?.radio_active === true,
    undefined, { timeout: 120000 });
  await shoot(desktop, "desktop-radio-active");
  await desktop.close();

  // Portrait touch: the chip spine.
  const portrait = await browser.newPage({
    viewport: { width: 430, height: 860 }, hasTouch: true });
  await bootSortie(portrait, `${site.url}${QUERY}&input=touch`);
  await shoot(portrait, "portrait-spine");

  // Tap-to-expand.
  await portrait.locator('[data-anca-chip="navigate"]').click();
  await portrait.waitForFunction(() =>
    document.querySelector('[data-anca-row="navigate"]')?.classList
      .contains("expanded") === true,
  undefined, { timeout: 15000 });
  await shoot(portrait, "portrait-expanded");
  await portrait.close();
} finally {
  await browser.close();
  site.close?.();
}

if (pageErrors.length > 0) {
  console.error(`page errors:\n${pageErrors.join("\n")}`);
  process.exit(1);
}
console.log("anca-look complete");
