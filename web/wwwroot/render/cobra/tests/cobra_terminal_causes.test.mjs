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
    detail: "Sink rate exceeded the gear's limits.",
  });
  assert.deepEqual(cobraTerminalCauseCopy("rollover"), {
    title: "ROLLOVER",
    detail: "Banked, drifting contact dug in a skid.",
  });
  assert.deepEqual(cobraTerminalCauseCopy("spin-contact"), {
    title: "SPIN CONTACT",
    detail: "Touched down still yawing.",
  });
  assert.deepEqual(cobraTerminalCauseCopy("rotor-strike"), {
    title: "ROTOR STRIKE",
    detail: "The main rotor met the ground.",
  });
  assert.deepEqual(cobraTerminalCauseCopy("water-contact"), {
    title: "INTO THE RIVER",
    detail: "Skid helicopters do not land on water.",
  });
});

test("pool exhaustion gets its own mission card; other statuses fall through", () => {
  assert.deepEqual(cobraMissionStatusCopy("fob-combat-ineffective"), {
    title: "FOB COMBAT INEFFECTIVE",
    detail: "Every Cobra on the ramp is bent or gone. Camp Ember has nothing left to fly.",
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
  assert.match(formatter, /recent_bursts/);
  assert.match(formatter, /has_impacted/);
  assert.match(formatter, /will_hit/);
  assert.match(formatter, /observer_id/);
  assert.match(formatter, /SCAS OUT/);
  assert.match(formatter, /ENGINE OUT/);
  assert.match(formatter, /NO SUBSYSTEM LOSS/);
  assert.match(debrief,
    /groundFireDebriefDetail\(authorityState\?\.battle_damage\)/);
  assert.match(debrief, /\$\{reason\} \$\{groundFireDetail\} Hostiles down/,
    "ground-fire truth must appear in the terminal details without changing the outcome branch");
});
