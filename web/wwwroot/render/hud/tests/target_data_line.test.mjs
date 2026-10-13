import test from "node:test";
import assert from "node:assert/strict";
import { targetDataLineOwner, targetDataLinePlacement } from "../target_data_line.js";
import { rectsIntersect } from "../occupied_area.js";

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
  assert.equal(wide, null, "an oversized plate must not spill across the tapes");
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

test("lower-edge targets clear controls even when all four preferred positions are blocked", () => {
  const avoid = [
    { left: 16, right: 178, top: 668, bottom: 712 },
    { left: 190, right: 374, top: 640, bottom: 828 },
    { left: 16, right: 178, top: 614, bottom: 658 },
  ];
  for (const x of [20, 60, 110, 195, 280, 370]) {
    for (const y of [650, 680, 706, 820]) {
      const placed = targetDataLinePlacement({ ...PORTRAIT, projection: { x, y }, avoid });
      assert.ok(placed, `no line for ${x},${y}`);
      const rect = { left: placed.x - 4, right: placed.x + 124,
        top: placed.y, bottom: placed.y + 17 };
      assert.ok(rect.left >= 89 && rect.right <= 301 && rect.top >= 120 && rect.bottom <= 706);
      assert.ok(avoid.every((control) => !rectsIntersect(rect, control)),
        `line at ${JSON.stringify(rect)} covers controls for target ${x},${y}`);
    }
  }
});

test("a fully occupied gutter has no safe placement", () => {
  const placed = targetDataLinePlacement({ ...PORTRAIT, projection: { x: 195, y: 680 },
    avoid: [{ left: 89, right: 301, top: 120, bottom: 706 }],
  });
  assert.equal(placed, null, "never fall back to drawing through an occupied control");
});
