import assert from "node:assert/strict";
import test from "node:test";

import { fighterHudLayout } from "../fighter_layout.js";

test("desktop fighter layout gives heading, warnings, weapons and flight reference distinct lanes", () => {
  const layout = fighterHudLayout({ width: 1280, height: 720 });

  assert.ok(layout.heading.bottom < layout.warningY + 40);
  assert.ok(layout.warningY + 60 < layout.weaponCueY);
  assert.ok(layout.weaponCueY < layout.instrumentCenterY);
  assert.ok(layout.heading.width <= 360);
  assert.ok(layout.tapeHeight <= 288);
  assert.ok(layout.ladderSafe.top > layout.heading.y);
  assert.ok(layout.targetSafe.left < layout.targetSafe.right);
  assert.ok(layout.targetSafe.top < layout.targetSafe.bottom);
});

test("touch layout respects safe areas and preserves a usable central aperture", () => {
  const safeInsets = { top: 47, right: 8, bottom: 34, left: 8 };
  const layout = fighterHudLayout({
    width: 430,
    height: 840,
    touchMode: true,
    safeInsets,
  });

  assert.ok(layout.heading.top >= safeInsets.top);
  assert.ok(layout.heading.width <= 300);
  assert.ok(layout.secondaryBottom <= 840 - safeInsets.bottom - 108);
  assert.ok(layout.targetSafe.left < layout.targetSafe.right);
  assert.ok(layout.targetSafe.bottom <= 840 - safeInsets.bottom - 138);
});

test("short landscape layout keeps high-centre cues separated", () => {
  const layout = fighterHudLayout({ width: 844, height: 390 });

  assert.ok(layout.heading.top >= 0);
  assert.ok(layout.warningY < layout.weaponCueY);
  assert.ok(layout.weaponCueY <= layout.instrumentCenterY - 36);
  assert.ok(layout.tapeHeight < 390);
});
