import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const appSource = await readFile(path.join(ROOT, "web/wwwroot/app.js"), "utf8");

test("the Rapier briefing teaches the kernel-verified continuous high-Mach profile", () => {
  const rapierBrief = appSource.match(
    /"rapier-intercept": Object\.freeze\(\{([\s\S]*?)\n  }\),/,
  )?.[1] ?? "";

  assert.match(rapierBrief, /continuous 35 kPa climb/);
  assert.match(rapierBrief, /turbine-to-ram handover/);
  assert.match(rapierBrief, /24 km M4\.2 shelf/);
  assert.match(rapierBrief, /one balloon gun pass/);
  assert.match(rapierBrief, /thrust minus drag/);
  assert.match(rapierBrief, /binding-panel heat/);
  assert.match(rapierBrief, /home reserve/);
  assert.match(appSource, /rapierBriefingText\(brief\.brief, state\)/);
  assert.doesNotMatch(appSource, /Rapier balance \$\{balance\} CR/);
  assert.match(rapierBrief, /finite internal gun/);
  assert.match(rapierBrief, /midpoint arrestor/);
  assert.doesNotMatch(rapierBrief,
    /M0\.90|FL560|FL700|dealt|allocation-credit|TARGET_REWARD|gun-drones|3,600 LB/i);
});
