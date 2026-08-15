import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const appSource = await readFile(path.join(ROOT, "web/wwwroot/app.js"), "utf8");

test("the Rapier briefing teaches the visible three-target gallery and recovery", () => {
  const rapierBrief = appSource.match(
    /"rapier-intercept": Object\.freeze\(\{([\s\S]*?)\n  }\),/,
  )?.[1] ?? "";

  assert.match(rapierBrief, /visible high-speed intercept path/);
  assert.match(rapierBrief, /payload balloons at 45,000 ft/);
  assert.match(rapierBrief, /all three payload balloons/);
  assert.match(rapierBrief, /lethal drones deploy/);
  assert.match(rapierBrief, /recovery corridor/);
  assert.match(appSource, /rapierBriefingText\(brief\.brief, state\)/);
  assert.doesNotMatch(appSource, /Rapier balance \$\{balance\} CR/);
  assert.match(rapierBrief, /finite internal gun/);
  assert.match(rapierBrief, /midpoint arrestor/);
  assert.doesNotMatch(rapierBrief,
    /M0\.90|FL560|FL700|M4\.2|dealt|allocation-credit|TARGET_REWARD|gun-drones|3,600 LB/i);
});
