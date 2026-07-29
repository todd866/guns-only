import test from "node:test";
import assert from "node:assert/strict";
import { targetDataLineOwner } from "../target_data_line.js";

test("the data line rides the bracket of the selected gun target", () => {
  // The primary owns the line by default and for older kernels without the field.
  assert.equal(targetDataLineOwner({}), "primary");
  assert.equal(targetDataLineOwner(null), "primary");
  assert.equal(targetDataLineOwner({ selected_player_gun_target_slot: 0 }), "primary");
  // Padlocked TRAFFIC 2 moves the numbers to the jet they describe.
  assert.equal(targetDataLineOwner({ selected_player_gun_target_slot: 1 }), "wingman");
  // Deeper formation slots have no dedicated marker yet; the line must not vanish.
  assert.equal(targetDataLineOwner({ selected_player_gun_target_slot: 2 }), "primary");
  assert.equal(targetDataLineOwner({ selected_player_gun_target_slot: "junk" }), "primary");
});
