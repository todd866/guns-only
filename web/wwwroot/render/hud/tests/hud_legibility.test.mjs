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
  strokeLegiblePath,
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

function recordingStrokeContext() {
  const calls = [];
  const style = {
    strokeStyle: "#4dff88",
    lineWidth: 1.2,
    lineDash: [12, 7],
    shadowBlur: 4,
  };
  let saved = null;
  return {
    calls,
    style,
    save() {
      saved = { ...style, lineDash: [...style.lineDash] };
    },
    restore() {
      if (!saved) return;
      Object.assign(style, saved);
      style.lineDash = [...saved.lineDash];
      saved = null;
    },
    setLineDash(dash) {
      style.lineDash = [...dash];
    },
    stroke() {
      calls.push({
        strokeStyle: style.strokeStyle,
        lineWidth: style.lineWidth,
        lineDash: [...style.lineDash],
        shadowBlur: style.shadowBlur,
      });
    },
    get strokeStyle() { return style.strokeStyle; },
    set strokeStyle(value) { style.strokeStyle = value; },
    get lineWidth() { return style.lineWidth; },
    set lineWidth(value) { style.lineWidth = value; },
    get shadowBlur() { return style.shadowBlur; },
    set shadowBlur(value) { style.shadowBlur = value; },
  };
}

test("strokeLegiblePath draws a solid dark underlay then the caller's stroke", () => {
  const ctx = recordingStrokeContext();
  const before = {
    strokeStyle: ctx.strokeStyle,
    lineWidth: ctx.lineWidth,
    lineDash: [...ctx.style.lineDash],
    shadowBlur: ctx.shadowBlur,
  };

  strokeLegiblePath(ctx);

  assert.equal(ctx.calls.length, 2);
  assert.equal(ctx.calls[0].strokeStyle, HUD_LEGIBLE_UNDERLAY);
  assert.equal(ctx.calls[0].lineWidth, before.lineWidth + HUD_LEGIBLE_STROKE_WIDTH);
  assert.deepEqual(ctx.calls[0].lineDash, []);
  assert.equal(ctx.calls[0].shadowBlur, 0);
  assert.equal(ctx.calls[1].strokeStyle, before.strokeStyle);
  assert.equal(ctx.calls[1].lineWidth, before.lineWidth);
  assert.deepEqual(ctx.calls[1].lineDash, before.lineDash);
  assert.equal(ctx.calls[1].shadowBlur, before.shadowBlur);
  assert.equal(ctx.strokeStyle, before.strokeStyle);
  assert.equal(ctx.lineWidth, before.lineWidth);
  assert.deepEqual(ctx.style.lineDash, before.lineDash);
  assert.equal(ctx.shadowBlur, before.shadowBlur);
});

test("production HUD routes essential green labels through the legibility helper", async () => {
  const hud = await readFile(new URL("../../../hud.js", import.meta.url), "utf8");
  assert.match(hud, /from "\.\/render\/hud\/hud_legibility\.js"/);
  assert.match(hud, /fillEssentialHudText\(/);
  assert.match(hud, /fillEssentialHudText\("ALT FT", altitudeX/);
  assert.match(hud, /fillEssentialHudText\(cue\.call, this\.width \/ 2, y\)/);
  assert.match(hud, /fillLegibleHudText\(ctx, text, clampedX, placedY,/);
  assert.match(hud, /fillEssentialHudText\("PULL", cx, cy \+ ballRadius \* 0\.52\)/);
  assert.match(hud, /strokeLegiblePath/);
  const method = (name, next) => {
    const start = hud.indexOf(`  ${name}(`);
    const end = hud.indexOf(`  ${next}(`, start + 1);
    return hud.slice(start, end);
  };
  assert.match(method("drawPitchLadder", "drawAirframeSymbols"), /this\.strokeLegible\(\)/);
  assert.match(method("drawGunFunnel", "drawAimPoint"), /this\.strokeLegible\(\)/);
  assert.match(method("drawGunSight", "drawGunFunnel"), /fillLegibleHudText\(ctx, cue,/);
  assert.match(method("drawBandit", "drawCivilianTarget"), /this\.strokeLegible\(\)/);
  assert.match(method("drawVisibleTargetBox", "drawBandit"), /this\.strokeLegible\(\)/);
});
