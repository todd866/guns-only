import test from "node:test";
import assert from "node:assert/strict";
import { targetDataLineOwner, targetDataLinePlacement } from "../target_data_line.js";

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

// 390x844 portrait: tapes at x=48 and x=342 (half-width 35) leave the gutter 89..301.
const PORTRAIT = Object.freeze({
  textWidth: 120,
  textHeight: 17,
  size: 32,
  safe: { left: 24, right: 366, top: 120, bottom: 706 },
  gutterLeft: 89,
  gutterRight: 301,
});

test("the data line prefers the right of the bracket when it fits between the tapes", () => {
  const placed = targetDataLinePlacement({ ...PORTRAIT, projection: { x: 110, y: 400 } });
  assert.equal(placed.side, "right");
  assert.ok(placed.x + PORTRAIT.textWidth <= PORTRAIT.gutterRight);
});

test("a contact near the right tape puts the line left, never across the airspeed box", () => {
  const placed = targetDataLinePlacement({ ...PORTRAIT, projection: { x: 280, y: 400 } });
  assert.equal(placed.side, "left");
  assert.ok(placed.x - 4 >= PORTRAIT.gutterLeft);
});

test("a centred close-range contact puts the line below the bracket, clear of both tapes", () => {
  // The practice 560 m capture: contact at the gunsight, line used to start behind the 302 box.
  const placed = targetDataLinePlacement({ ...PORTRAIT, projection: { x: 195, y: 422 } });
  assert.equal(placed.side, "below");
  assert.ok(placed.x - 4 >= PORTRAIT.gutterLeft);
  assert.ok(placed.x + PORTRAIT.textWidth + 4 <= PORTRAIT.gutterRight);
  assert.ok(placed.y >= 422 + PORTRAIT.size, "line must not cover the contact");
});

test("with no room below the line goes above, and never leaves the gutter", () => {
  const placed = targetDataLinePlacement({ ...PORTRAIT, projection: { x: 195, y: 690 } });
  assert.equal(placed.side, "above");
  assert.ok(placed.y + PORTRAIT.textHeight <= 690 - PORTRAIT.size);
  const wide = targetDataLinePlacement({ ...PORTRAIT, textWidth: 400, projection: { x: 195, y: 400 } });
  assert.ok(wide.x - 4 >= PORTRAIT.gutterLeft);
});

test("the data line steps around the padlock attitude inset", () => {
  // 844x390 padlock: contact right of centre, inset over the left candidate.
  const placed = targetDataLinePlacement({
    textWidth: 140, textHeight: 17, size: 32,
    safe: { left: 24, right: 820, top: 120, bottom: 252 },
    gutterLeft: 89, gutterRight: 755,
    projection: { x: 600, y: 180 },
    avoid: [{ left: 330, right: 514, top: 150, bottom: 300 }],
  });
  assert.notEqual(placed.side, "left");
  assert.ok(placed.x >= 514 + 4 || placed.x + 140 + 4 <= 330 || placed.y >= 300
    || placed.y + 17 <= 150);
});
