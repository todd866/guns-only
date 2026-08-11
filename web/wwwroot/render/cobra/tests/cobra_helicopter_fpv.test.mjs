import assert from "node:assert/strict";
import test from "node:test";

import {
  COBRA_FPV_CRUISE_KT,
  cobraAccelCaretPx,
  cobraFpvLevel,
  cobraFpvMode,
  cobraHeadingRelativeGroundTrack,
  cobraHoverStubPixels,
  updateGroundspeedAccelEma,
} from "../cobra_helicopter_fpv.js";
import { cobraHudState } from "../cobra_hud_adapter.js";

test("cruise FPV mode engages at or above the helo blanking threshold", () => {
  assert.equal(cobraFpvMode(COBRA_FPV_CRUISE_KT - 0.1), "hover");
  assert.equal(cobraFpvMode(COBRA_FPV_CRUISE_KT), "cruise");
  assert.equal(cobraFpvMode(undefined), "hover");
});

test("FPV regime level mirrors rotorcraft strip severity gates", () => {
  assert.equal(cobraFpvLevel({ vortex_ring_severity: 0, retreating_blade_stall_severity: 0 }), "normal");
  assert.equal(cobraFpvLevel({ vortex_ring_severity: 0.25 }), "caution");
  assert.equal(cobraFpvLevel({ vortex_ring_severity: 0.4 }), "warning");
  assert.equal(cobraFpvLevel({ retreating_blade_stall_severity: 0.4 }), "caution");
  assert.equal(cobraFpvLevel({ retreating_blade_stall_severity: 0.7 }), "warning");
});

test("hover stub is a heading-relative plan-view stick that grows with horizontal GS", () => {
  const still = cobraHoverStubPixels(0, 0);
  assert.equal(still.lengthPx, 0);
  const forward = cobraHoverStubPixels(0, 6);
  assert.ok(forward.lengthPx > 20);
  assert.ok(Math.abs(forward.dx) < 1e-9);
  assert.ok(forward.dy < 0, "body-forward motion must draw toward screen up");
  const right = cobraHoverStubPixels(6, 0);
  assert.ok(right.dx > 0, "rightward motion must draw right");
});

test("heading 90 rotates east-forward and north-left at the production spawn", () => {
  const east = cobraHeadingRelativeGroundTrack(6, 0, Math.PI / 2);
  assert.ok(Math.abs(east.rightMps) < 1e-9);
  assert.ok(Math.abs(east.forwardMps - 6) < 1e-9);
  const eastCue = cobraHoverStubPixels(east.rightMps, east.forwardMps);
  assert.ok(Math.abs(eastCue.dx) < 1e-9);
  assert.ok(eastCue.dy < 0, "east motion at east heading must cue forward, never right");

  const north = cobraHeadingRelativeGroundTrack(0, 6, Math.PI / 2);
  assert.ok(Math.abs(north.rightMps + 6) < 1e-9);
  assert.ok(Math.abs(north.forwardMps) < 1e-9);
  const northCue = cobraHoverStubPixels(north.rightMps, north.forwardMps);
  assert.ok(northCue.dx < 0, "north motion at east heading must cue left");
  assert.ok(Math.abs(northCue.dy) < 1e-9);
});

test("heading-relative hover cue is continuous across the ±pi wrap", () => {
  const epsilon = 1e-7;
  const before = cobraHeadingRelativeGroundTrack(3.5, -2.25, Math.PI - epsilon);
  const after = cobraHeadingRelativeGroundTrack(3.5, -2.25, -Math.PI + epsilon);
  assert.ok(Math.abs(before.rightMps - after.rightMps) < 1e-6);
  assert.ok(Math.abs(before.forwardMps - after.forwardMps) < 1e-6);
});

test("accel EMA and caret respond to speed changes", () => {
  let ema = 0;
  let speed = 10;
  ({ emaKtPerSec: ema, speedMps: speed } = updateGroundspeedAccelEma(ema, speed, 14, 0.2));
  assert.ok(ema > 0.5, `accelerating should yield positive EMA, got ${ema}`);
  assert.ok(cobraAccelCaretPx(ema) > 0, "positive accel yields a forward caret length");
  assert.equal(cobraAccelCaretPx(0.05), 0, "noise below threshold is blank");
});

test("cobraHudState publishes heli flight-path cue fields", () => {
  const hover = cobraHudState({
    vehicle: {
      ground_speed_mps: 5,
      velocity_x_mps: 2,
      velocity_y_mps: 0,
      velocity_z_mps: 1,
      rotorcraft: { vortex_ring_severity: 0.25, retreating_blade_stall_severity: 0 },
    },
    gunner: { fire_authorized: true },
  }, { y_m: 40, pitch_rad: 0, roll_rad: 0, yaw_rad: 0 });
  assert.equal(hover.heli_flight_path, true);
  assert.equal(hover.heli_fpv_mode, "hover");
  assert.equal(hover.heli_fpv_level, "caution");
  assert.equal(hover.heli_fpv_gun_ready, true);
  assert.ok(hover.heli_hover_right_kt > 0);
  assert.ok(hover.heli_hover_forward_kt > 0);

  const cruise = cobraHudState({
    vehicle: {
      ground_speed_mps: 30,
      velocity_x_mps: 30,
      velocity_y_mps: 0,
      velocity_z_mps: 0,
      rotorcraft: { vortex_ring_severity: 0, retreating_blade_stall_severity: 0 },
    },
    gunner: { fire_authorized: false },
  }, null);
  assert.equal(cruise.heli_fpv_mode, "cruise");
  assert.equal(cruise.heli_fpv_gun_ready, false);
  assert.equal(cruise.heli_fpv_level, "normal");
});
