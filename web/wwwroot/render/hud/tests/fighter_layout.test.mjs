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
  const safeBottom = 21;
  const layout = fighterHudLayout({
    width: 844,
    height: 390,
    touchMode: true,
    safeInsets: { top: 0, right: 47, bottom: safeBottom, left: 47 },
  });
  const stickTop = 390 - safeBottom - 8 - 112;

  assert.ok(layout.heading.top >= 0);
  assert.ok(layout.warningY < layout.weaponCueY);
  assert.ok(layout.weaponCueY <= layout.instrumentCenterY - 36);
  assert.ok(layout.tapeHeight < 390);
  assert.ok(stickTop - layout.targetSafe.bottom >= 16);
  assert.ok(stickTop - layout.ladderSafe.bottom >= 8);
});

test("small-phone landscape keeps a positive touch targeting aperture", () => {
  const safeBottom = 21;
  const layout = fighterHudLayout({
    width: 667,
    height: 375,
    touchMode: true,
    safeInsets: { top: 0, right: 44, bottom: safeBottom, left: 44 },
  });
  const stickTop = 375 - safeBottom - 8 - 104;

  assert.ok(layout.targetSafe.left < layout.targetSafe.right);
  assert.ok(layout.targetSafe.top < layout.targetSafe.bottom);
  assert.ok(layout.ladderSafe.left < layout.ladderSafe.right);
  assert.ok(layout.ladderSafe.top < layout.ladderSafe.bottom);
  assert.ok(stickTop - layout.targetSafe.bottom >= 16);
  assert.ok(stickTop - layout.ladderSafe.bottom >= 8);
});
