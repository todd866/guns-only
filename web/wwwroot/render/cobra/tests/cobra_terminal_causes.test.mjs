import assert from "node:assert/strict";
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
