import assert from "node:assert/strict";
import test from "node:test";

import {
  CORE_HELMET_HUD_LAYERS,
  DIAGNOSTIC_HELMET_HUD_LAYERS,
  HelmetHud,
  formatLapTime,
  minimapDotPlacement,
  trackDayStatusLine,
} from "../helmet_hud.js";

test("track-day status makes course validity and rider mode explicit", () => {
  assert.equal(
    trackDayStatusLine({ phase: "active", on_track: false }).text,
    "OFF COURSE · RETURN BETWEEN CURBS",
  );
  assert.match(
    trackDayStatusLine({
      phase: "active",
      on_track: true,
      control_mode: "assisted",
      lap: 2,
      lap_time_s: 65.4,
      off_track_s: 0,
    }).text,
    /^RIDER ASSIST · LAP 2 · 1:05\.40/,
  );
  assert.match(
    trackDayStatusLine({
      phase: "active",
      on_track: true,
      control_mode: "raw",
      lap: 0,
    }).text,
    /^RAW · LAP 0/,
  );
});

test("lap time carries seconds into minutes instead of rendering 24:63", () => {
  assert.equal(formatLapTime(24.63), "0:24.63");
  assert.equal(formatLapTime(84.05), "1:24.05");
  assert.equal(formatLapTime(605.999), "10:05.99");
  assert.equal(formatLapTime(0), "—:——");
  assert.equal(formatLapTime(Number.NaN), "—:——");
});

test("minimap dot clamps to the widget frame and flags off-map riders", () => {
  const bounds = { minX: -1500, maxX: 1500, minZ: -60, maxZ: 60 };
  const frame = { x: 800, y: 18, size: 132, inset: 8 };

  const inside = minimapDotPlacement(bounds, frame, 0, 0);
  assert.equal(inside.clamped, false);
  assert.ok(inside.x > frame.x + frame.inset && inside.x < frame.x + frame.size - frame.inset);
  assert.ok(inside.y > frame.y + frame.inset && inside.y < frame.y + frame.size - frame.inset);

  const farOff = minimapDotPlacement(bounds, frame, 0, 1_200);
  assert.equal(farOff.clamped, true);
  assert.equal(farOff.y, frame.y + frame.size - frame.inset);
  assert.ok(farOff.x >= frame.x + frame.inset);
  assert.ok(farOff.x <= frame.x + frame.size - frame.inset);

  const farWest = minimapDotPlacement(bounds, frame, -9_000, 0);
  assert.equal(farWest.clamped, true);
  assert.equal(farWest.x, frame.x + frame.inset);
});

test("engineering instruments stay opt-in while the riding HUD remains complete", () => {
  const calls = [];
  const hud = new HelmetHud({ getContext: () => ({ clearRect() {} }) });
  hud.width = 1_280;
  hud.height = 800;

  const methods = new Map([
    ["drawHorizonReticle", "horizon"],
    ["drawSpeedBlock", "speed"],
    ["drawRpmGear", "rpm-gear"],
    ["drawMinimap", "minimap"],
    ["drawKneeCue", "knee-cue"],
    ["drawStatusStrip", "status"],
    ["drawLeanBlock", "lean-pitch"],
    ["drawInputBars", "inputs"],
    ["drawClutchMode", "clutch"],
    ["drawPitchBalanceTape", "balance"],
    ["drawContactPatchInstrument", "contact-patch"],
  ]);
  for (const [method, layer] of methods) hud[method] = () => calls.push(layer);

  hud.draw({});
  assert.deepEqual(calls, CORE_HELMET_HUD_LAYERS);
  for (const layer of DIAGNOSTIC_HELMET_HUD_LAYERS) {
    assert.ok(!calls.includes(layer), `${layer} leaked into the default riding HUD`);
  }

  calls.length = 0;
  hud.setDiagnosticsEnabled(true);
  hud.draw({});
  for (const layer of CORE_HELMET_HUD_LAYERS) assert.ok(calls.includes(layer));
  for (const layer of DIAGNOSTIC_HELMET_HUD_LAYERS) assert.ok(calls.includes(layer));
});
