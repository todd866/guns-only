#!/usr/bin/env node
// Compiles both tactical-cloud shader paths in a real WebGL2 context. A GLSL error here does not
// throw — three logs it — so an edit can look fine in unit tests and ship a black sky.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "../../web/wwwroot/render/hud/tests/harness/static_server.mjs";
const require = createRequire(new URL("../../web/smoke/package.json", import.meta.url));
const { chromium } = require("playwright");

const site = await serveStatic(resolve(dirname(fileURLToPath(import.meta.url)), "../../web/wwwroot"));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const msgs = [];
  page.on("console", (m) => msgs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => msgs.push(`pageerror: ${e.message}`));
  await page.goto(`${site.url}shader-gate/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => globalThis.__shaderCheckDone === true, null, { timeout: 60000 });
  const result = await page.evaluate(() => globalThis.__shaderCheckResult);
  console.log(JSON.stringify(result, null, 2));
  const bad = msgs.filter((m) => /error|GLSL|WebGLProgram|shader/i.test(m));
  if (bad.length) { console.log("--- console ---"); bad.forEach((m) => console.log(m.slice(0, 400))); }
  process.exitCode = result.ok && bad.length === 0 ? 0 : 1;
} finally {
  await browser.close();
  await site.close();
}
