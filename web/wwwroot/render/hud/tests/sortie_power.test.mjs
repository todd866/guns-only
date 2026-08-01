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
