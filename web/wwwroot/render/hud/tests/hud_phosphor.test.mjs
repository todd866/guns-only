import assert from "node:assert/strict";
import test from "node:test";

import {
  PHOSPHOR_PRESETS,
  annunciatorChrome,
  bankIndexTicks,
  easedPresence,
  hitMarkerOffsets,
  hudFont,
  hudMetricScale,
  killFlashPresentation,
  leadPipperSpec,
  readHudPhosphorOptions,
  resolveHudPhosphor,
} from "../hud_phosphor.js";

test("metric scale stays readable from a phone to 4K without running away", () => {
  const phone = hudMetricScale(390, 844);
  const laptop = hudMetricScale(1280, 720);
  const fourK = hudMetricScale(3840, 2160);
  assert.ok(phone >= 0.82 && phone < laptop);
  assert.equal(laptop, 1);
  assert.ok(fourK > laptop && fourK <= 1.55);
});

test("phosphor presets stay explicit and green remains the default", () => {
  assert.equal(resolveHudPhosphor().palette, PHOSPHOR_PRESETS.green);
  assert.equal(resolveHudPhosphor({ preset: "amber" }).palette.core, "#ffc14a");
  assert.equal(resolveHudPhosphor({ preset: "nope" }).palette.id, "green");
  const contrast = resolveHudPhosphor({ highContrast: true });
  assert.equal(contrast.glowAlpha, 0);
  assert.equal(contrast.highContrast, true);
});

test("DOM options read the phosphor preset and motion classes", () => {
  const options = readHudPhosphorOptions({
    dataset: { hudPhosphor: "white" },
    className: "touch-mode forced-reduced-motion",
  }, { width: 844, height: 390 });
  assert.equal(options.palette.id, "white");
  assert.equal(options.reducedMotion, true);
  assert.ok(options.scale < 1);
});

test("fonts scale with the viewport and never drop below a phone floor", () => {
  assert.match(hudFont(10, { scale: 1 }), /700 10px/);
  assert.match(hudFont(8, { scale: 1.55, weight: 800 }), /800 12\.4px/);
  assert.match(hudFont(2, { scale: 0.2 }), /7px/);
});

test("presence eases in and out, and reduced motion holds steady", () => {
  assert.equal(easedPresence(-1), 0);
  assert.ok(easedPresence(0.04) > 0 && easedPresence(0.04) < 1);
  assert.equal(easedPresence(0.2), 1);
  assert.ok(easedPresence(0.9) < 1);
  assert.equal(easedPresence(0.05, { reducedMotion: true }), 1);
});

test("annunciator hierarchy keeps critical above caution above advisory", () => {
  const critical = annunciatorChrome("critical");
  const caution = annunciatorChrome("caution");
  const advisory = annunciatorChrome("advisory");
  assert.equal(critical.stroke, "#ff465d");
  assert.equal(caution.stroke, "#ffb020");
  assert.notEqual(advisory.stroke, critical.stroke);
  assert.equal(annunciatorChrome("confirm").label, "#d8ffe6");
});

test("lead pipper stays centred and closes when the shot is in range", () => {
  const caged = leadPipperSpec({ scale: 1 });
  const solution = leadPipperSpec({ inRange: true, scale: 1.2 });
  const wasted = leadPipperSpec({ wasted: true });
  assert.equal(caged.arc < Math.PI * 2, true);
  assert.equal(solution.arc, Math.PI * 2);
  assert.ok(solution.radius > caged.radius);
  assert.equal(solution.stroke, "#4dff88");
  assert.equal(wasted.stroke, "#ff465d");
  assert.equal(leadPipperSpec({ hit: true }).hit, true);
});

test("hit markers bloom away from the impact and then die", () => {
  const born = hitMarkerOffsets(0, 4);
  const late = hitMarkerOffsets(0.2, 4);
  const gone = hitMarkerOffsets(0.34, 3);
  assert.equal(born.length, 4);
  assert.ok(Math.hypot(late[0].x, late[0].y) > Math.hypot(born[0].x, born[0].y));
  assert.ok(late[0].alpha < born[0].alpha);
  assert.equal(gone[0].alpha, 0);
  const steady = hitMarkerOffsets(0.1, 2, { reducedMotion: true });
  assert.equal(Math.hypot(steady[0].x, steady[0].y), 10);
});

test("kill flash eases out instead of popping off", () => {
  const fresh = killFlashPresentation(0);
  const later = killFlashPresentation(0.4);
  assert.ok(fresh.alpha > later.alpha);
  assert.ok(later.ring > fresh.ring);
  assert.equal(killFlashPresentation(0.1, { reducedMotion: true }).alpha, 0.22);
  assert.equal(killFlashPresentation(0.5, { reducedMotion: true }).alpha, 0);
});

test("bank index ticks follow aircraft bank and keep the zero mark", () => {
  const level = bankIndexTicks(0);
  const banked = bankIndexTicks(Math.PI / 6);
  assert.equal(level.length, 11);
  assert.ok(level.some((tick) => tick.deg === 0 && tick.major));
  assert.ok(banked.find((tick) => tick.deg === 0).rad > level.find((tick) => tick.deg === 0).rad);
});
