import assert from "node:assert/strict";
import test from "node:test";

import { sortiePowerCommand } from "../sortie_power.js";

test("throttle guidance accepts only the two-sided per-airframe sortie schedule", () => {
  assert.equal(sortiePowerCommand({
    sortie_valid: true,
    sortie_power_01: 0.83,
    golden_path_valid: true,
    golden_path_power_01: 0.2,
  }), 0.83);
  assert.equal(sortiePowerCommand({
    sortie_valid: false,
    sortie_power_01: 0.83,
    golden_path_valid: true,
    golden_path_power_01: 0.2,
  }), null);
  assert.equal(sortiePowerCommand({
    golden_path_valid: true,
    golden_path_power_01: 0.2,
  }), null, "the one-sided legacy solve is not a complete throttle command");
  assert.equal(sortiePowerCommand({ sortie_valid: true, sortie_power_01: "bad" }), null);
});

test("the F-22 overhead pattern's own power solve owns the lever while it is active", async () => {
  const { patternOwnsPower } = await import("../sortie_power.js");
  const inBreak = {
    sortie_valid: true, sortie_leg: "Groove", sortie_power_01: 0.18,
    conventional_rtb_pattern_active: true, approach_guidance_active: true,
    approach_valid: true, approach_power_01: 0.62,
  };
  assert.equal(patternOwnsPower(inBreak), true);
  assert.equal(sortiePowerCommand(inBreak), 0.62,
    "over the numbers in the break, the straight-in Groove plan must not set power");
  assert.equal(sortiePowerCommand({ ...inBreak, approach_power_01: 1.4 }), 1);
  assert.equal(sortiePowerCommand({ ...inBreak, approach_valid: false }), 0.18,
    "without valid pattern authority the sortie schedule still owns the lever");
  assert.equal(patternOwnsPower({ ...inBreak, conventional_rtb_pattern_active: false }), false);
});
