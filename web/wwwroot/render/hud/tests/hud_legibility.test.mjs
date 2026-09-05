import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HUD_LEGIBLE_STROKE_WIDTH,
  HUD_LEGIBLE_UNDERLAY,
  canvasTextStyleMatches,
  captureCanvasTextStyle,
  fillLegibleHudText,
  isEssentialHudGreenFill,
} from "../hud_legibility.js";

function recordingTextContext(initial = {}) {
  const calls = [];
  const style = {
    fillStyle: "#4dff88",
    strokeStyle: "#ffffff",
    lineWidth: 1,
    lineJoin: "miter",
    miterLimit: 10,
    font: "700 11px monospace",
    textAlign: "center",
    textBaseline: "middle",
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: "rgba(0, 0, 0, 0)",
    ...initial,
  };
  let saved = null;

  return {
    calls,
    style,
    save() {
      saved = { ...style };
    },
    restore() {
      if (!saved) return;
      Object.assign(style, saved);
      saved = null;
    },
    strokeText(text, x, y, maxWidth) {
      calls.push({
        name: "strokeText",
        text,
        x,
        y,
        maxWidth,
        strokeStyle: style.strokeStyle,
        lineWidth: style.lineWidth,
        lineJoin: style.lineJoin,
        miterLimit: style.miterLimit,
      });
    },
    fillText(text, x, y, maxWidth) {
      calls.push({
        name: "fillText",
        text,
        x,
        y,
        maxWidth,
        fillStyle: style.fillStyle,
      });
    },
    get fillStyle() { return style.fillStyle; },
    set fillStyle(value) { style.fillStyle = value; },
    get strokeStyle() { return style.strokeStyle; },
    set strokeStyle(value) { style.strokeStyle = value; },
    get lineWidth() { return style.lineWidth; },
    set lineWidth(value) { style.lineWidth = value; },
    get lineJoin() { return style.lineJoin; },
    set lineJoin(value) { style.lineJoin = value; },
    get miterLimit() { return style.miterLimit; },
    set miterLimit(value) { style.miterLimit = value; },
    get font() { return style.font; },
    set font(value) { style.font = value; },
    get textAlign() { return style.textAlign; },
    set textAlign(value) { style.textAlign = value; },
    get textBaseline() { return style.textBaseline; },
    set textBaseline(value) { style.textBaseline = value; },
    get globalAlpha() { return style.globalAlpha; },
    set globalAlpha(value) { style.globalAlpha = value; },
    get shadowBlur() { return style.shadowBlur; },
    set shadowBlur(value) { style.shadowBlur = value; },
    get shadowColor() { return style.shadowColor; },
    set shadowColor(value) { style.shadowColor = value; },
  };
}

test("essential green fill detection covers primary HUD greens only", () => {
  assert.equal(isEssentialHudGreenFill("#4dff88"), true);
  assert.equal(isEssentialHudGreenFill("#7dffb0"), true);
  assert.equal(isEssentialHudGreenFill("rgba(77, 255, 136, 0.68)"), true);
  assert.equal(isEssentialHudGreenFill("rgba(77, 255, 136, 0.42)"), true);
  assert.equal(isEssentialHudGreenFill("#ffb020"), false);
  assert.equal(isEssentialHudGreenFill("rgba(77, 255, 136, 0.18)"), false);
});

test("fillLegibleHudText strokes a dark underlay before filling green copy", () => {
  const ctx = recordingTextContext();
  fillLegibleHudText(ctx, "PULL", 120, 48, { fillStyle: "#7dffb0" });

  assert.deepEqual(ctx.calls.map((call) => call.name), ["strokeText", "fillText"]);
  assert.equal(ctx.calls[0].text, "PULL");
  assert.equal(ctx.calls[0].strokeStyle, HUD_LEGIBLE_UNDERLAY);
  assert.equal(ctx.calls[0].lineWidth, HUD_LEGIBLE_STROKE_WIDTH);
  assert.equal(ctx.calls[0].lineJoin, "round");
  assert.equal(ctx.calls[1].fillStyle, "#7dffb0");
  assert.equal(ctx.calls[1].x, 120);
  assert.equal(ctx.calls[1].y, 48);
});

test("fillLegibleHudText restores canvas text style after drawing", () => {
  const ctx = recordingTextContext({
    fillStyle: "rgba(77, 255, 136, 0.68)",
    strokeStyle: "rgba(255, 176, 32, 0.55)",
    lineWidth: 2.2,
    lineJoin: "bevel",
    miterLimit: 4,
    shadowBlur: 6,
  });
  const before = captureCanvasTextStyle(ctx);

  fillLegibleHudText(ctx, "ALT FT", 64, 12, {
    fillStyle: "rgba(77, 255, 136, 0.68)",
    maxWidth: 40,
  });

  assert.ok(canvasTextStyleMatches(ctx, before));
  assert.equal(ctx.calls[0].maxWidth, 40);
  assert.equal(ctx.calls[1].maxWidth, 40);
});

test("production HUD routes essential green labels through the legibility helper", async () => {
  const hud = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  assert.match(hud, /from "\.\/render\/hud\/hud_legibility\.js"/);
  assert.match(hud, /fillEssentialHudText\(/);
  assert.match(hud, /fillEssentialHudText\("ALT FT", altitudeX/);
  assert.match(hud, /fillEssentialHudText\(cue\.call, this\.width \/ 2, y\)/);
  assert.match(hud, /fillEssentialHudText\(text, clampedX, placedY\)/);
  assert.match(hud, /fillEssentialHudText\("PULL", cx, cy \+ ballRadius \* 0\.52\)/);
});
