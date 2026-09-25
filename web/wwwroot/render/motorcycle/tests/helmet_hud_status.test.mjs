import assert from "node:assert/strict";
import test from "node:test";

import {
  apexCuePresentation,
  apexCueText,
  formatLapTime,
  lapFlyerText,
  lookAheadTick,
  minimapDotPlacement,
  trackDayStatusLine,
  weekendHudLayerVisibility,
} from "../helmet_hud.js";

test("the helmet lap card reads the kernel apex cue", () => {
  assert.equal(apexCueText({}), "");
  assert.equal(apexCueText({ next_apex_m: 420, next_apex_mps: 21.4 }), "APEX 420 m · 77 km/h");
  assert.equal(
    apexCueText({ next_apex_m: 48, next_apex_mps: 21.4, next_apex_exit: true }),
    "EXIT 48 m · 77 km/h",
  );
  assert.equal(apexCueText({ next_apex_m: 1800, next_apex_mps: 20 }), "APEX 1.8 km · 72 km/h");
  assert.equal(
    apexCueText({ next_apex_m: 420, next_apex_mps: 21.4, show_apex_speed: false }),
    "APEX 420 m",
  );
});

test("the apex line turns caution when the bike is fast inside 150 m", () => {
  const braking = apexCuePresentation({
    next_apex_m: 80,
    next_apex_mps: 20,
    vx: 30,
    vy: 0,
    vz: 0,
  });
  assert.equal(braking.text, "APEX 80 m · 72 km/h");
  assert.equal(braking.tone, "caution");
  assert.doesNotMatch(braking.text, /BRAKE/);
  const exit = apexCuePresentation({
    next_apex_m: 40,
    next_apex_mps: 20,
    next_apex_exit: true,
    vx: 30,
  });
  assert.equal(exit.tone, "normal");
});

test("checker, pit and stop replace the flyer without a second lecture", () => {
  assert.equal(lapFlyerText({ session_leg: "cooldown" }, "0:12.00"), "CHECKER · BRING IT IN");
  assert.equal(apexCuePresentation({ pit_open: true, vx: 10 }).text, "PIT · 60 km/h");
  assert.equal(apexCuePresentation({
    in_pit: true, pit_entry_legal: false, vx: 5,
  }).text, "PIT SPEED");
  assert.equal(apexCuePresentation({
    in_pit: true, pit_entry_legal: true, vx: 0.1,
  }).text, "STOPPED");
});

test("the look-ahead tick flips with the miss and does not print metres", () => {
  const right = lookAheadTick({ look_ahead_lateral_m: 4 }, 1000);
  const left = lookAheadTick({ look_ahead_lateral_m: -4 }, 1000);
  assert.equal(right.label, "");
  assert.equal(left.label, "");
  assert.ok(right.x > 500);
  assert.ok(left.x < 500);
});

test("track-day status makes course validity and rider mode explicit", () => {
  assert.equal(
    trackDayStatusLine({ phase: "active", on_track: false }).text,
    "OFF COURSE · RETURN TO PAINT",
  );
  assert.equal(
    trackDayStatusLine({
      phase: "active",
      on_track: true,
      lap_valid: false,
      off_track_s: 1.25,
    }).text,
    "LAP SPOILT · 1.3s OFF",
  );
  assert.equal(trackDayStatusLine({ phase: "active", on_track: true }).text, "");
});

test("assisted HUD keeps the road clear while raw physics retains engineering instruments", () => {
  assert.deepEqual(weekendHudLayerVisibility({
    control_mode: "assisted",
    clutch_mode: "auto",
  }), {
    inputBars: false,
    clutchMode: false,
    pitchBalance: false,
    contactPatch: false,
  });
  assert.equal(weekendHudLayerVisibility({
    control_mode: "assisted",
    wheelie_balance: 0.2,
  }).pitchBalance, true);
  assert.equal(weekendHudLayerVisibility({
    control_mode: "assisted",
    pitch_reflex: 0.8,
  }).pitchBalance, false, "ordinary reflex activity must not pin the engineering tape on-screen");
  assert.equal(weekendHudLayerVisibility({
    control_mode: "assisted",
    wheelie_balance: -1,
    stoppie_balance: -1,
  }).pitchBalance, false, "inactive authority sentinels must not look like a balance event");
  assert.deepEqual(weekendHudLayerVisibility({
    control_mode: "raw",
    clutch_mode: "manual",
  }), {
    inputBars: true,
    clutchMode: true,
    pitchBalance: true,
    contactPatch: true,
  });
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
