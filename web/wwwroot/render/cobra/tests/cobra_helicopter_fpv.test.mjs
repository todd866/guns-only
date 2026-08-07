import assert from "node:assert/strict";
import test from "node:test";

import {
  COBRA_FPV_CRUISE_KT,
  cobraAccelCaretPx,
  cobraFpvLevel,
  cobraFpvMode,
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

test("hover stub is a plan-view stick that grows with horizontal GS", () => {
  const still = cobraHoverStubPixels(0, 0);
  assert.equal(still.lengthPx, 0);
  const north = cobraHoverStubPixels(0, 6);
  assert.ok(north.lengthPx > 20);
  assert.ok(Math.abs(north.dx) < 1e-9);
  assert.ok(north.dy < 0, "north must draw toward screen up (negative y)");
  const east = cobraHoverStubPixels(6, 0);
  assert.ok(east.dx > 0);
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
  assert.ok(hover.heli_hover_east_kt > 0);
  assert.ok(hover.heli_hover_north_kt > 0);

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
