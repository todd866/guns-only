import assert from "node:assert/strict";
import test from "node:test";
import { fireBossCueLayout } from "../fireboss_cue_layout.js";

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

test("phone procedure cues clear telemetry, trim and full hopper readouts", () => {
  // Browser-measured widths for the departure, loaded shallow-turn and 100 KT step cues.
  for (const textWidth of [86.17, 191.64, 247.27]) {
    for (const [width, height] of [[390, 844], [667, 375], [844, 390]]) {
      const phoneInsets = height >= width
        ? { top: 47, bottom: 34 }
        : { left: 44, right: 44, bottom: 21 };
      for (const safeInsets of [{}, phoneInsets]) {
        const top = safeInsets.top || 0, left = safeInsets.left || 0, right = safeInsets.right || 0;
        const cue = fireBossCueLayout({ width, height, textWidth, mobile: true, safeInsets });
        const portrait = height >= width;
        const occupied = [
          { x: 0, y: top + 7, width, height: 44 },
          { x: left + (portrait ? 10 : 92), y: top + 72, width: 162, height: 44 },
          { x: width - right - 144, y: top + 48, width: 132, height: 52 },
        ];
        assert.ok(occupied.every(rect => !overlaps(cue, rect)), `${width}×${height}: ${textWidth}`);
        assert.ok(cue.width - 16 >= textWidth, "the complete instruction must fit");
        assert.ok(cue.x >= left && cue.x + cue.width <= width - right);
        assert.ok(cue.y + cue.height < height / 2, "cue remains above the primary flight reference");
      }
    }
  }
});

test("wide landscape keeps a compact upper cue while the long small-phone cue moves clear", () => {
  assert.equal(fireBossCueLayout({ width: 844, height: 390, textWidth: 247.27, mobile: true }).y, 57);
  assert.equal(fireBossCueLayout({ width: 667, height: 375, textWidth: 247.27, mobile: true }).y, 122);
  assert.equal(fireBossCueLayout({ width: 667, height: 375, textWidth: 86.17, mobile: true }).y, 57);
});

test("desktop retains its existing annunciation placement and width", () => {
  assert.deepEqual(fireBossCueLayout({ width: 1440, height: 900, textWidth: 247.27,
    desktopTop: 80, safeInsets: { top: 47, left: 44, right: 44 } }),
  { x: (1440 - 269.27) / 2, y: 80, width: 269.27, height: 22 });
});
