import assert from "node:assert/strict";
import test from "node:test";
import { civilianTargetLayout } from "../../../hud.js";

function labelBounds(layout) {
  const left = layout.labelAlign === "left" ? layout.labelX
    : layout.labelAlign === "right" ? layout.labelX - layout.labelWidth : layout.labelX - layout.labelWidth / 2;
  return [left, left + layout.labelWidth];
}

test("opt-in mobile civilian markers and labels stay inside the tapes on either horizontal edge", () => {
  for (const [projection, expectedX, align] of [
    [{ x: -100, y: 422 }, 95, "left"],
    [{ x: 900, y: 422 }, 295, "right"],
    [{ behind: true, cameraX: -1 }, 95, "left"],
    [{ behind: true, cameraX: 1 }, 295, "right"],
  ]) {
    const layout = civilianTargetLayout(projection, 390, 844, {}, 95);
    assert.equal(layout.x, expectedX);
    assert.equal(layout.y, 422);
    assert.equal(layout.onScreen, false);
    assert.equal(layout.labelAlign, align);
    const [left, right] = labelBounds(layout);
    assert.ok(left >= 95 && right <= 295, `label overlaps a side tape: ${left}..${right}`);
    assert.equal(Math.sign(layout.x - 195), expectedX < 195 ? -1 : 1, "preserve the real direction toward the target");
  }
});

test("safe-area corner clamps preserve vertical clearance and central on-screen targets", () => {
  const top = civilianTargetLayout({ x: -300, y: -200 }, 390, 844, { top: 30, bottom: 20 }, 95);
  assert.deepEqual([top.x, top.y, top.onScreen], [95, 74, false]);
  const bottom = civilianTargetLayout({ x: 1000, y: 2000 }, 390, 844, { top: 30, bottom: 20 }, 95);
  assert.deepEqual([bottom.x, bottom.y, bottom.onScreen], [295, 780, false]);
  const centre = civilianTargetLayout({ x: 195, y: 300 }, 390, 844, {}, 95);
  assert.deepEqual([centre.x, centre.y, centre.onScreen, centre.labelAlign], [195, 300, true, "center"]);
  const hiddenByTape = civilianTargetLayout({ x: 70, y: 300 }, 390, 844, {}, 95);
  assert.equal(hiddenByTape.onScreen, false);
});

test("normal missions and invalid options retain their exact44px centered-label defaults", () => {
  for (const inset of [undefined, NaN, Infinity, -20, 0, 44]) {
    const layout = civilianTargetLayout({ x: -10, y: 100 }, 390, 844, { top: 10 }, inset);
    assert.deepEqual(layout, { x: 44, y: 100, onScreen: false, labelX: 44, labelAlign: "center", labelWidth: 130 });
  }
});

test("large requested insets are bounded and text fits the surviving central corridor", () => {
  for (const width of [192, 320, 390, 844, 1100]) {
    for (const x of [-500, width / 2, width + 500]) {
      const layout = civilianTargetLayout({ x, y: 200 }, width, 720, {}, 10000);
      assert.ok(layout.x >= 0 && layout.x <= width);
      assert.ok(layout.labelWidth > 0);
      const [left, right] = labelBounds(layout);
      assert.ok(left >= 0 && right <= width);
    }
  }
});
