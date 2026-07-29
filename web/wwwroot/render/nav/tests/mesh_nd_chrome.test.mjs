import test from "node:test";
import assert from "node:assert/strict";
import {
  formatWholeLb,
  procedureLabelFromState,
} from "../mesh_nd_chrome.js";

test("formatWholeLb rounds and localizes", () => {
  assert.equal(formatWholeLb(null), "—");
  assert.equal(formatWholeLb(4210.4), "4,210 LB");
});

test("procedureLabelFromState maps kind codes", () => {
  assert.equal(procedureLabelFromState({ recovery_procedure_kind: 3 }), "STRAIGHT-IN");
  assert.equal(procedureLabelFromState({ rapier_pattern_only: true }), "CIRCUITS · DEFAULT");
  assert.equal(procedureLabelFromState({}), "NONE");
});
