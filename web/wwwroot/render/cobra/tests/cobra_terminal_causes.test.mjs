import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  cobraMissionStatusCopy,
  cobraTerminalCauseCopy,
} from "../cobra_terminal_causes.js";

test("each contact failure cause maps to instrument-true card copy", () => {
  assert.deepEqual(cobraTerminalCauseCopy("hard-impact"), {
    title: "HARD IMPACT",
    detail: "Sink rate exceeded gear limits.",
  });
  assert.deepEqual(cobraTerminalCauseCopy("rollover"), {
    title: "ROLLOVER",
    detail: "Banked, drifting touchdown caught a skid.",
  });
  assert.deepEqual(cobraTerminalCauseCopy("spin-contact"), {
    title: "SPIN CONTACT",
    detail: "Yaw remained at touchdown.",
  });
  assert.deepEqual(cobraTerminalCauseCopy("rotor-strike"), {
    title: "ROTOR STRIKE",
    detail: "Main rotor struck terrain.",
  });
  assert.deepEqual(cobraTerminalCauseCopy("water-contact"), {
    title: "INTO THE RIVER",
    detail: "Water contact destroyed the aircraft.",
  });
});

test("pool exhaustion gets its own mission card; other statuses fall through", () => {
  assert.deepEqual(cobraMissionStatusCopy("fob-combat-ineffective"), {
    title: "NO COBRAS LEFT",
    detail: "Camp Ember has no serviceable aircraft.",
  });
  assert.equal(cobraMissionStatusCopy("victory"), null);
  assert.equal(cobraMissionStatusCopy(undefined), null);
});

test("none, unknown, and absent causes yield null so the generic card stands", () => {
  assert.equal(cobraTerminalCauseCopy("none"), null);
  assert.equal(cobraTerminalCauseCopy("collision"), null);
  assert.equal(cobraTerminalCauseCopy(undefined), null);
  assert.equal(cobraTerminalCauseCopy(null), null);
  assert.equal(cobraTerminalCauseCopy(42), null);
});

test("terminal debrief appends authoritative ground-fire subsystem context", async () => {
  const main = await readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8");
  const formatter = main.match(
    /function groundFireDebriefDetail\(battleDamage\) \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
  const debrief = main.match(/function showMissionDebrief\(war, status\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(formatter, /scas_damaged/);
  assert.match(formatter, /engine_damaged/);
  assert.match(formatter, /damaging_hits/);
  assert.match(formatter, /bursts_fired/);
  assert.doesNotMatch(formatter, /recent_bursts|has_impacted|will_hit|observer_id/);
  assert.match(formatter, /SCAS OUT/);
  assert.match(formatter, /ENGINE OUT/);
  assert.match(formatter, /hits === 0 && bursts === 0/,
    "zero ground-fire evidence must disappear instead of becoming a sentence");
  assert.match(debrief,
    /groundFireDebriefDetail\(authorityState\?\.battle_damage\)/);
  assert.match(debrief, /\[reason, groundFireDetail\]\.filter\(Boolean\)\.join\(" "\)/,
    "ground-fire truth must remain in the result summary without swallowing structured evidence");
  assert.match(debrief,
    /setOptionalDebriefFact\([\s\S]*?debriefBattleTime[\s\S]*?evidence\.battleSeconds/,
    "the card must use the pure evidence model's ground-war clock, not airborne time");
});

test("RTB stays in the live mission; debrief waits for a terminal authority status", async () => {
  const main = await readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8");

  assert.match(main,
    /if \(authorityState && authorityState\.status !== "active"\) \{\s*showMissionDebrief\(war, authorityState\.status\);\s*\}/u,
    "the browser must not treat the authored RTB act as a terminal outcome");
  assert.doesNotMatch(main,
    /mission_act\s*===\s*["']rtb["'][\s\S]{0,160}showMissionDebrief/u,
    "RTB remains flyable until the runtime publishes victory or defeat after recovery");
});
