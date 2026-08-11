import assert from "node:assert/strict";
import test from "node:test";

import { cobraTerminalCauseCopy } from "../cobra_terminal_causes.js";

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
});

test("none, unknown, and absent causes yield null so the generic card stands", () => {
  assert.equal(cobraTerminalCauseCopy("none"), null);
  assert.equal(cobraTerminalCauseCopy("collision"), null);
  assert.equal(cobraTerminalCauseCopy(undefined), null);
  assert.equal(cobraTerminalCauseCopy(null), null);
  assert.equal(cobraTerminalCauseCopy(42), null);
});
