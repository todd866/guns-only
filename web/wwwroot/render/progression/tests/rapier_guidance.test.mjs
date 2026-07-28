import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const appSource = await readFile(path.join(ROOT, "web/wwwroot/app.js"), "utf8");

test("the Rapier briefing teaches the kernel-verified altitude-gated ram profile", () => {
  const rapierBrief = appSource.match(
    /"rapier-intercept": Object\.freeze\(\{([\s\S]*?)\n  }\),/,
  )?.[1] ?? "";

  assert.match(rapierBrief, /M0\.90/);
  assert.match(rapierBrief, /FL560 \(56,000 ft\)/);
  assert.match(rapierBrief, /full augmentation/);
  assert.match(rapierBrief, /\{RAM_LIGHT_MACH\}/);
  assert.match(rapierBrief, /\{FULL_RAM_MACH\}/);
  assert.match(appSource, /rapierBriefingText\(brief\.brief, latestState \?\? \{\}\)/);
  assert.match(rapierBrief, /FL700/);
  assert.match(rapierBrief, /at FL315 the aircraft can gather speed but cannot cross into full ram/);
  assert.match(rapierBrief, /Mach and KTAS/);
});
